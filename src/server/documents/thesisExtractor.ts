import crypto from "node:crypto";
import { z } from "zod";
import type {
  EvidenceSpan,
  ThesisRevision,
  Condition,
  UUID,
  Company,
} from "../../shared/domain";
import { ResearchModelTransport } from "../researchModel";
import { ConditionSchema } from "../../shared/domain";

export interface CompanyIdentificationResult {
  identifiedCompany: Company | null;
  reportDate: string | null;
  candidates: Company[];
  isAmbiguous: boolean;
}

export interface ExtractedThesisResult {
  theses: Array<{
    id: UUID;
    groupId: UUID;
    text: string;
    originalText: string;
    type: "NUMERIC_FORECAST" | "DIRECTIONAL" | "CAUSAL" | "QUALITATIVE" | "HISTORICAL";
    criterion: Condition;
    sourceEvidenceIds: UUID[];
    priority: number;
  }>;
  identification: CompanyIdentificationResult;
}

// Known company seed directory for standard A-share matching
export const KNOWN_COMPANIES: Company[] = [
  {
    id: "00000000-0000-4000-8000-000000000010",
    name: "圣邦股份",
    exchange: "SZSE",
    securityCode: "300661",
    issuerIds: { szse: "300661" },
    aliases: ["圣邦微电子", "SG Micro", "300661.SZ", "300661"],
  },
  {
    id: "00000000-0000-4000-8000-000000000020",
    name: "汇顶科技",
    exchange: "SSE",
    securityCode: "603160",
    issuerIds: { sse: "603160" },
    aliases: ["Goodix", "603160.SH", "603160"],
  },
  {
    id: "00000000-0000-4000-8000-000000000030",
    name: "中芯国际",
    exchange: "SSE",
    securityCode: "688981",
    issuerIds: { sse: "688981" },
    aliases: ["SMIC", "688981.SH", "688981"],
  },
  {
    id: "00000000-0000-4000-8000-000000000040",
    name: "兆易创新",
    exchange: "SSE",
    securityCode: "603986",
    issuerIds: { sse: "603986" },
    aliases: ["GigaDevice", "603986.SH", "603986"],
  },
];

export class ThesisExtractor {
  private inferYear(text: string): string {
    const year = text.match(/(20\d{2})\s*年?/i)?.[1];
    return year || String(new Date().getUTCFullYear());
  }

  private inferYearPeriod(text: string): { start: string; end: string; basis: "YEAR" } {
    const year = this.inferYear(text);
    return { start: `${year}-01-01`, end: `${year}-12-31`, basis: "YEAR" };
  }

  private inferComparePeriod(text: string): { start: string; end: string; basis: "YEAR" } {
    const year = Number(this.inferYear(text)) - 1;
    return { start: `${year}-01-01`, end: `${year}-12-31`, basis: "YEAR" };
  }
  identifyCompanyAndDate(fullText: string): CompanyIdentificationResult {
    const matched: Company[] = [];

    for (const comp of KNOWN_COMPANIES) {
      if (
        fullText.includes(comp.name) ||
        fullText.includes(comp.securityCode) ||
        comp.aliases.some((a) => fullText.includes(a))
      ) {
        matched.push(comp);
      }
    }

    // Try to extract date YYYY-MM-DD or YYYY年MM月DD日
    const dateMatch = fullText.match(
      /(202\d)[\-\.\/年](\d{1,2})[\-\.\/月](\d{1,2})日?/
    );
    let reportDate: string | null = null;
    if (dateMatch) {
      const yr = dateMatch[1];
      const mo = dateMatch[2].padStart(2, "0");
      const da = dateMatch[3].padStart(2, "0");
      reportDate = `${yr}-${mo}-${da}`;
    }

    if (matched.length === 1) {
      return {
        identifiedCompany: matched[0],
        reportDate,
        candidates: matched,
        isAmbiguous: false,
      };
    }

    if (matched.length > 1) {
      return {
        identifiedCompany: null,
        reportDate,
        candidates: matched,
        isAmbiguous: true,
      };
    }

    return {
      identifiedCompany: null,
      reportDate,
      candidates: [],
      isAmbiguous: false,
    };
  }

  async extractTheses(
    spans: EvidenceSpan[],
    modelTransport?: ResearchModelTransport
  ): Promise<ExtractedThesisResult> {
    const fullText = spans.map((s) => s.quote).join("\n");
    const identification = this.identifyCompanyAndDate(fullText);

    // If an LLM transport is available, use exactly one bounded structured
    // request.  The selected spans are deliberately small: the model is used
    // for semantic interpretation, not as a PDF text dump.
    if (modelTransport) {
      const selectedSpans = this.selectHighValueSpans(spans);
      if (selectedSpans.length === 0) {
        throw new Error("研报没有可供观点提炼的高价值文本片段");
      }
      try {
        const prompt = `你是投研事实抽取器。仅依据下面给出的研报片段，提取 1-6 条未来可由财报或补充披露核验的投资观点。
对于每条观点，要求：
1. 观点类型只能是 NUMERIC_FORECAST / DIRECTIONAL / CAUSAL / QUALITATIVE / HISTORICAL
2. text 必须是中文或原文中可核验的明确陈述，originalText 必须是片段中的原文句子
3. criterion 必须是完整的 COMPARE、TREND 或 SEMANTIC 条件，并包含 origin
4. sourceEvidenceIds 不要填写；使用 spanIndices 引用片段编号（从 0 开始）
5. 只有文本明确支持的观点才输出，不能补造数字、公司或证据
请只返回 JSON，不要 Markdown，不要解释。格式：{"theses":[{"text":"...","originalText":"...","type":"...","criterion":{...},"spanIndices":[0],"priority":1}]}
文本内容：
${selectedSpans.map((s, i) => `[SPAN_${i} P${s.regions[0]?.pageNumber || 1}] ${s.quote.slice(0, 900)}`).join("\n")}
`;
        const res = await modelTransport.complete({
          messages: [{ role: "user", content: prompt }],
          tools: [],
          max_tokens: 6000,
        });

        if (!res.message.content) {
          throw new Error("Ling 未返回观点 JSON");
        }
        const parsed = this.parseModelTheses(res.message.content, selectedSpans);
        if (parsed.length === 0) {
          throw new Error("Ling 返回的观点列表为空");
        }
        return { theses: parsed, identification };
      } catch (err) {
        // A configured model failure is a real run failure.  Do not replace it
        // with a fixed company or a misleading sample thesis.
        const message = err instanceof Error ? err.message : "未知错误";
        throw new Error(`Ling 观点提炼失败：${message}`);
      }
    }

    // With no model configured, keep an explicit offline extractor available
    // for local development and fixtures.  This is derived solely from the
    // uploaded spans and is never a fixed demo fallback.
    const deterministicTheses = this.extractDeterministic(spans);
    return {
      theses: deterministicTheses,
      identification,
    };
  }

  private selectHighValueSpans(spans: EvidenceSpan[]): EvidenceSpan[] {
    const highValue = /(投资要点|核心观点|盈利预测|业绩预测|财务|毛利|收入|现金流|增长|驱动|风险|假设|展望|估值)/i;
    const ranked = spans
      .map((span, index) => ({ span, index, score: (highValue.test(`${span.headingPath.join(" ")} ${span.quote}`) ? 2 : 0) + Math.min(span.quote.length, 500) / 5000 }))
      .filter(({ span }) => span.quote.trim())
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, 30)
      .sort((a, b) => a.index - b.index);
    let used = 0;
    return ranked.filter(({ span }) => {
      if (used >= 18_000) return false;
      used += Math.min(span.quote.length, 900) + 40;
      return true;
    }).map(({ span }) => span);
  }

  private extractDeterministic(spans: EvidenceSpan[]) {
    const results: Array<{
      id: UUID;
      groupId: UUID;
      text: string;
      originalText: string;
      type: "NUMERIC_FORECAST" | "DIRECTIONAL" | "CAUSAL" | "QUALITATIVE" | "HISTORICAL";
      criterion: Condition;
      sourceEvidenceIds: UUID[];
      priority: number;
    }> = [];

    // Search for gross margin prediction pattern
    for (const span of spans) {
      const text = span.quote;
      const period = this.inferYearPeriod(text);
      // Pattern 1: 毛利率 / Target Gross Margin ... 超过/达到/预计 X%
      const marginMatch = text.match(/(?:(?:综合)?毛利率|Target Gross Margin|gross_margin).*?(?:达到|有望达到|超过|预计达到|维持在)?\s*(\d{1,2}(?:\.\d+)?)\s*%/i);
      if (marginMatch && results.length < 5) {
        const val = marginMatch[1];
        const thesisId = crypto.randomUUID();
        const groupId = crypto.randomUUID();
        results.push({
          id: thesisId,
          groupId,
          text: `综合毛利率达到 ${val}%`,
          originalText: text,
          type: "NUMERIC_FORECAST",
          criterion: {
            kind: "COMPARE",
            metric: "gross_margin",
            op: "GTE",
            target: val,
            unit: "RATIO",
            period: {
              ...period,
            },
            scope: "CONSOLIDATED",
            origin: "REPORT_EXPLICIT",
          },
          sourceEvidenceIds: [span.id],
          priority: 10,
        });
      }

      // Pattern 2: 营业收入 ... 达到/增长/超过 X% / X 亿元
      const revMatch = text.match(/营业收入.*?(?:达到|有望达到|预计|增长|同比增长|超过).*?(\d+(\.\d+)?)\s*(亿元|%)/);
      if (revMatch && results.length < 5) {
        const val = revMatch[1];
        const isRatio = revMatch[3] === "%";
        const thesisId = crypto.randomUUID();
        const groupId = crypto.randomUUID();
        results.push({
          id: thesisId,
          groupId,
          text: isRatio ? `营业收入同比增长 ${val}%` : `营业收入达到 ${val} 亿元`,
          originalText: text,
          type: isRatio ? "DIRECTIONAL" : "NUMERIC_FORECAST",
          criterion: isRatio
            ? {
                kind: "COMPARE",
                metric: "revenue_growth",
                op: "GTE",
                target: val,
                unit: "RATIO",
                period: {
                  ...period,
                },
                scope: "CONSOLIDATED",
                origin: "REPORT_EXPLICIT",
              }
            : {
                kind: "COMPARE",
                metric: "revenue",
                op: "GTE",
                target: (Number(val) * 1e8).toString(),
                unit: "CURRENCY",
                period: {
                ...period,
                },
                scope: "CONSOLIDATED",
                origin: "REPORT_EXPLICIT",
              },
          sourceEvidenceIds: [span.id],
          priority: 8,
        });
      }

      // Pattern 3: 经营现金流
      const cfMatch = text.match(/经营(活动)?现金流(净额)?.*?(改善|转正|增长|向好|保持向好)/);
      if (cfMatch && results.length < 5) {
        const thesisId = crypto.randomUUID();
        const groupId = crypto.randomUUID();
        results.push({
          id: thesisId,
          groupId,
          text: `经营活动产生的现金流量净额保持持续改善`,
          originalText: text,
          type: "DIRECTIONAL",
          criterion: {
            kind: "TREND",
            metric: "operating_cash_flow",
            direction: "UP",
            period: this.inferYearPeriod(text),
            comparePeriod: {
              ...this.inferComparePeriod(text),
            },
            scope: "CONSOLIDATED",
            tolerance: "0",
            origin: "REPORT_EXPLICIT",
          },
          sourceEvidenceIds: [span.id],
          priority: 6,
        });
      }
    }

    return results;
  }

  private parseModelTheses(content: string, spans: EvidenceSpan[]) {
    const match = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const jsonStr = (match ? match[1] : content).trim();
    let decoded: unknown;
    try {
      decoded = JSON.parse(jsonStr);
    } catch {
      throw new Error("Ling 返回内容不是合法 JSON");
    }
    const rawItems = Array.isArray(decoded)
      ? decoded
      : decoded && typeof decoded === "object" && Array.isArray((decoded as any).theses)
        ? (decoded as any).theses
        : null;
    if (!rawItems) throw new Error("Ling JSON 缺少 theses 数组");

    const ItemSchema = z.object({
      text: z.string().trim().min(1),
      originalText: z.string().trim().min(1),
      type: z.enum(["NUMERIC_FORECAST", "DIRECTIONAL", "CAUSAL", "QUALITATIVE", "HISTORICAL"]),
      criterion: z.unknown(),
      spanIndices: z.array(z.number().int().nonnegative()).min(1),
      priority: z.number().int().optional(),
      sourceEvidenceIds: z.array(z.string().uuid()).optional(),
    });
    const items = z.array(ItemSchema).min(1).max(6).parse(rawItems);
    return items.map((item) => {
      const criterionInput = this.normaliseCriterion(item.criterion);
      const criterion = ConditionSchema.parse(criterionInput);
      const indexedEvidence = item.spanIndices.map((index) => spans[index]?.id).filter((id): id is UUID => Boolean(id));
      const directEvidence = (item.sourceEvidenceIds || []).filter((id) => spans.some((span) => span.id === id));
      const sourceEvidenceIds = [...new Set([...indexedEvidence, ...directEvidence])];
      if (sourceEvidenceIds.length === 0) throw new Error("Ling 观点缺少有效的原文证据引用");
      return {
        id: crypto.randomUUID(),
        groupId: crypto.randomUUID(),
        text: item.text,
        originalText: item.originalText,
        type: item.type,
        criterion,
        sourceEvidenceIds,
        priority: item.priority ?? 5,
      };
    });
  }

  private normaliseCriterion(value: unknown): unknown {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    const criterion = { ...(value as Record<string, unknown>) };
    if (criterion.op === undefined && criterion.operator !== undefined) criterion.op = criterion.operator;
    if (criterion.origin === undefined) criterion.origin = "REPORT_EXPLICIT";
    if (criterion.kind === "TREND" && criterion.tolerance === undefined) criterion.tolerance = null;
    if (criterion.kind === "SEMANTIC") {
      if (criterion.requiredEvidence === undefined) criterion.requiredEvidence = [];
      if (criterion.horizonEnd === undefined) criterion.horizonEnd = null;
    }
    return criterion;
  }
}
