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

    // Table cells are stored as individual spans. Reassemble cells from the
    // same table before matching so a label span and its numeric value span
    // can still form one fact with all source evidence attached.
    const tableGroups = new Map<string, EvidenceSpan[]>();
    spans.forEach((span) => {
      const tableId = span.tableCell?.tableId;
      if (tableId) tableGroups.set(tableId, [...(tableGroups.get(tableId) || []), span]);
    });
    const contexts: Array<{ text: string; evidenceIds: UUID[] }> = spans.map((span) => ({
      text: span.quote,
      evidenceIds: [span.id],
    }));
    for (const group of tableGroups.values()) {
      const cells = [...group].sort((a, b) =>
        (a.tableCell!.row - b.tableCell!.row) || (a.tableCell!.col - b.tableCell!.col)
      );
      contexts.push({
        text: cells.map((cell) => cell.quote).join(" "),
        evidenceIds: cells.map((cell) => cell.id),
      });
    }

    const extractNumber = (text: string, pattern: RegExp): { raw: string; unit: string } | null => {
      const start = text.search(pattern);
      if (start < 0) return null;
      // Prefer a value after a colon/"本期金额" marker; otherwise only scan a
      // short window so a year in the following narrative is not captured.
      const tail = text.slice(start, start + 180);
      const match = tail.match(/(?:本期金额|本期发生额|期末|合计)?\s*[:：]?\s*([+-]?[0-9][0-9,]*(?:\.\d+)?)\s*(元|万元|亿元)?/);
      if (!match) return null;
      return { raw: match[1].replace(/,/g, ""), unit: match[2] || "元" };
    };

    for (const context of contexts) {
      for (const metric of requested) {
        if (facts.some((fact) => fact.metric === metric) || !patterns[metric]) continue;
        const extracted = extractNumber(context.text, patterns[metric]);
        if (!extracted) continue;
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
          period: options.period,
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
          restatementKey: "standard",
          evidenceIds: context.evidenceIds,
          extractionVersion,
        });
      }
    }

    return facts;
  }
}
