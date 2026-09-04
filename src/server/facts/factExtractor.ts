import crypto from "node:crypto";
import type { Fact, EvidenceSpan, Period, Scope, UUID } from "../../shared/domain";
import Decimal from "decimal.js";

export class FactExtractor {
  extractFactsFromSpans(
    spans: EvidenceSpan[],
    options: {
      companyId: UUID;
      documentId: UUID;
      period: Period;
      publishedAt: string;
      extractionVersion?: string;
      /** Only these metrics are needed for the current thesis set. */
      metrics?: string[];
      scope?: Scope;
    }
  ): Fact[] {
    const facts: Fact[] = [];
    const extractionVersion = options.extractionVersion || "fintrust-facts-v1.0";

    const requested = new Set(options.metrics?.length ? options.metrics : [
      "revenue",
      "cost_of_revenue",
      "operating_cash_flow",
    ]);
    const scope = options.scope || "CONSOLIDATED";
    const labels: Record<string, string> = {
      revenue: "营业收入",
      cost_of_revenue: "营业成本",
      operating_cash_flow: "经营活动产生的现金流量净额",
    };
    const patterns: Record<string, RegExp> = {
      revenue: /(?:营业收入|一、营业收入|主营业务收入)/,
      cost_of_revenue: /(?:营业成本|二、营业成本|主营业务成本)/,
      operating_cash_flow: /(?:经营活动产生的现金流量净额|经营活动现金流量净额)/,
    };
    // A revenue-growth thesis is evaluated from two revenue facts.  Keep the
    // public metric request small and map that derived metric to its operands.
    if (requested.has("revenue_growth")) requested.add("revenue");

    // Table cells are stored as individual spans. Reassemble cells from the
    // same table before matching so a label span and its numeric value span
    // can still form one fact with all source evidence attached.
    const tableGroups = new Map<string, EvidenceSpan[]>();
    spans.forEach((span) => {
      const tableId = span.tableCell?.tableId;
      if (tableId) tableGroups.set(tableId, [...(tableGroups.get(tableId) || []), span]);
    });
    const tableContexts: Array<{ text: string; evidenceIds: UUID[] }> = [];
    for (const group of tableGroups.values()) {
      const cells = [...group].sort((a, b) =>
        (a.tableCell!.row - b.tableCell!.row) || (a.tableCell!.col - b.tableCell!.col)
      );
      tableContexts.push({
        text: cells.map((cell) => cell.quote).join(" "),
        evidenceIds: cells.map((cell) => cell.id),
      });
    }
    // Prefer reconstructed statement tables over standalone spans. A table
    // cell often contains the authoritative current/comparative values,
    // while a nearby narrative sentence may mention a percentage first.
    const contexts: Array<{ text: string; evidenceIds: UUID[] }> = [
      ...tableContexts,
      ...spans.filter((span) => !span.tableCell?.tableId).map((span) => ({
        text: span.quote,
        evidenceIds: [span.id],
      })),
    ];

    const allPatterns = Object.values(patterns);
    const previousPeriod = (period: Period): Period => {
      const shift = (value: string | null): string | null => {
        if (!value) return null;
        const date = new Date(`${value}T00:00:00Z`);
        if (Number.isNaN(date.getTime())) return null;
        date.setUTCFullYear(date.getUTCFullYear() - 1);
        return date.toISOString().slice(0, 10);
      };
      return { start: shift(period.start), end: shift(period.end) || period.end, basis: period.basis };
    };
    const seen = new Set<string>();
    // Parse one metric's segment, stopping before the next known statement
    // line.  This prevents a row such as "营业收入 14000，营业成本 9660"
    // from attributing the cost to revenue.
    const extractNumbers = (text: string, pattern: RegExp): Array<{ raw: string; unit: string }> => {
      const start = text.search(pattern);
      if (start < 0) return [];
      const tail = text.slice(start);
      let end = tail.length;
      for (const other of allPatterns) {
        const match = tail.slice(1).search(other);
        if (match >= 0) end = Math.min(end, match + 1);
      }
      const segment = tail.slice(0, end);
      const unitHint = segment.match(/(亿元|万元|元)/)?.[1] || text.match(/(亿元|万元|元)/)?.[1] || "元";
      const candidates: Array<{ raw: string; unit: string }> = [];
      const numberPattern = /[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g;
      const numberMatches = [...segment.matchAll(numberPattern)];
      for (const match of numberMatches) {
        const raw = match[0].replace(/,/g, "");
        // Header years are not financial facts.  The parser may concatenate
        // current/prior columns, so retain the first two non-year numbers.
        const asNumber = Number(raw);
        const numberEnd = (match.index || 0) + match[0].length;
        const afterNumber = segment.slice(numberEnd);
        const beforeNumber = segment.slice(Math.max(0, (match.index || 0) - 8), match.index || 0);
        // Only discard an apparent year when the text marks it as a year;
        // legitimate statement values can also be 1,900–2,100 (万元).
        const hasNearbyUnit = /^\s*(亿元|万元|元|%|％|百分点)/.test(afterNumber);
        const isMarkedYear = Number.isInteger(asNumber) && asNumber >= 1900 && asNumber <= 2100 && (/^\s*年/.test(afterNumber) || /年\s*$/.test(beforeNumber));
        const nextNumber = afterNumber.match(/\s+([+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)/);
        const nextNumberValue = nextNumber ? Number(nextNumber[1].replace(/,/g, "")) : null;
        const previousNumber = beforeNumber.match(/([+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*$/);
        const previousNumberValue = previousNumber ? Number(previousNumber[1].replace(/,/g, "")) : null;
        const isYearHeaderPair = Number.isInteger(asNumber) && asNumber >= 1900 && asNumber <= 2100
          && ((nextNumberValue !== null && Number.isInteger(nextNumberValue) && nextNumberValue >= 1900 && nextNumberValue <= 2100)
            || (previousNumberValue !== null && Number.isInteger(previousNumberValue) && previousNumberValue >= 1900 && previousNumberValue <= 2100))
          && !hasNearbyUnit;
        if (isMarkedYear || isYearHeaderPair) continue;
        // In narrative fallback text, growth percentages and percentage-point
        // changes are not revenue amounts. Table values retain their units
        // and are unaffected by this guard.
        if (/^\s*(%|％|百分点)/.test(afterNumber)) continue;
        candidates.push({ raw, unit: segment.slice(match.index || 0, numberEnd + 8).match(/(亿元|万元|元)/)?.[1] || unitHint });
        if (candidates.length >= 2) break;
      }
      return candidates;
    };

    const addFact = (metric: string, extracted: { raw: string; unit: string }, period: Period, context: { evidenceIds: UUID[] }) => {
      const key = `${metric}:${period.end}:${period.basis}:${scope}`;
      if (seen.has(key)) return;
      seen.add(key);
      let value = new Decimal(extracted.raw);
      if (extracted.unit === "万元") value = value.times(10_000);
      if (extracted.unit === "亿元") value = value.times(100_000_000);
      facts.push({
        id: crypto.randomUUID(),
        documentId: options.documentId,
        companyId: options.companyId,
        metric,
        labelOriginal: labels[metric] || metric,
        segment: null,
        period,
        accountingStandard: "CAS",
        scope,
        nature: "ACTUAL",
        value: value.toString(),
        unit: "CURRENCY",
        currency: "CNY",
        customUnit: null,
        originalValue: extracted.raw,
        originalUnit: extracted.unit,
        scale: "1",
        publishedAt: options.publishedAt,
        restatementKey: `standard:${period.end}`,
        evidenceIds: context.evidenceIds,
        extractionVersion,
      });
    };

    for (const context of contexts) {
      for (const metric of requested) {
        if (!patterns[metric]) continue;
        const extracted = extractNumbers(context.text, patterns[metric]);
        extracted.forEach((value, index) => addFact(metric, value, index === 0 ? options.period : previousPeriod(options.period), context));
      }
    }

    return facts;
  }
}
