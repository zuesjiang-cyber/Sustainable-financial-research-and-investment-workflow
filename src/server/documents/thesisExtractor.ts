import crypto from "node:crypto";
import { z } from "zod";
import type {
  EvidenceSpan,
  ThesisRevision,
  Condition,
  UUID,
  Company,
} from "../../shared/domain";
import { configuredMaxOutputTokens, ResearchModelTransport } from "../researchModel";
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

export const SUBMIT_EXTRACTED_THESES_TOOL = {
  name: "submit_extracted_theses",
  description: "提交从研报中提取的投资观点、所属公司信息以及报告发布日期",
  parameters: {
    type: "object",
    properties: {
      company: {
        type: "object",
        description: "研报所研究的目标公司信息",
        properties: {
          name: { type: "string", description: "公司简称，如 圣邦股份、贵州茅台、中芯国际 等" },
          securityCode: { type: "string", description: "股票代码，如 300661、600519、688981 等" },
          exchange: { type: "string", enum: ["SZSE", "SSE", "BSE", "HKEX", "NASDAQ", "NYSE", "OTHER"], description: "上市交易所" },
        },
        required: ["name"],
      },
      reportDate: { type: "string", description: "研报发布日期，格式必须为 YYYY-MM-DD" },
      theses: {
        type: "array",
        description: "提取的 1~6 条未来可由财报或补充披露核验的投资观点",
        items: {
          type: "object",
          properties: {
            text: { type: "string", description: "提炼的原子观点表述（清晰、明确、中文）" },
            originalText: { type: "string", description: "研报原文中的完整出处句子" },
            type: {
              type: "string",
              enum: ["NUMERIC_FORECAST", "DIRECTIONAL", "CAUSAL", "QUALITATIVE", "HISTORICAL"],
              description: "观点类型：NUMERIC_FORECAST(明确数字目标), DIRECTIONAL(趋势方向), CAUSAL(因果驱动), QUALITATIVE(定性描述), HISTORICAL(历史事实)",
            },
            criterion: {
              type: "object",
              description: "用于后续自动化核验的标准条件",
              properties: {
                kind: { type: "string", enum: ["COMPARE", "TREND", "SEMANTIC"] },
                metric: { type: "string", description: "指标名称，如 revenue, gross_margin, net_profit, operating_cash_flow, revenue_growth 等" },
                op: { type: "string", enum: ["GTE", "LTE", "GT", "LT", "EQ"] },
                target: { type: "string", description: "目标数值（如 35 或 25）" },
                unit: { type: "string", enum: ["RATIO", "CURRENCY", "COUNT", "CUSTOM"] },
                direction: { type: "string", enum: ["UP", "DOWN", "FLAT"] },
                period: {
                  type: "object",
                  properties: {
                    start: { type: "string" },
                    end: { type: "string" },
                    basis: { type: "string", enum: ["YEAR", "HALF_YEAR", "QUARTER"] },
                  },
                },
                scope: { type: "string", enum: ["CONSOLIDATED", "PARENT"] },
              },
              required: ["kind"],
            },
            spanIndices: {
              type: "array",
              items: { type: "integer" },
              description: "引用的研报证据片段编号 [SPAN_n]（从 0 开始）",
            },
            priority: { type: "integer", description: "观点重要度优先级 1-10（1 为最核心论点）" },
          },
          required: ["text", "originalText", "type", "criterion", "spanIndices"],
        },
      },
    },
    required: ["theses"],
  },
};

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
        const prompt = `你是专业的投研分析师与事实抽取器。仅依据下面给出的研报片段，提炼 1-6 条未来可由财报或公告核验的投资观点，并识别研报所关注的目标公司与发布日期。
请务必调用 submit_extracted_theses 工具提交抽取结果。
规则要求：
1. 观点类型只能是 NUMERIC_FORECAST / DIRECTIONAL / CAUSAL / QUALITATIVE / HISTORICAL
2. text 必须是清晰、明确的中文投资观点表述；originalText 必须来自片段中的原文完整句子
3. criterion 必须提供可核验的条件结构（COMPARE 需提供 metric, op, target, unit；TREND 需提供 metric, direction；SEMANTIC 用于定性业务逻辑）
4. spanIndices 必须指向下面 [SPAN_n] 对应的切片编号（从 0 开始）
5. 严禁编造未经原文支持的数字、公司或证据
6. 请同时在 company 中识别研报分析的目标公司（公司简称与股票代码），在 reportDate 中识别研报日期（YYYY-MM-DD）

研报文本片段：
${selectedSpans.map((s, i) => `[SPAN_${i} P${s.regions[0]?.pageNumber || 1}] ${s.quote.slice(0, 900)}`).join("\n")}
`;
        const res = await modelTransport.complete({
          messages: [{ role: "user", content: prompt }],
          tools: [SUBMIT_EXTRACTED_THESES_TOOL],
          tool_choice: { type: "function", function: { name: "submit_extracted_theses" } },
          max_tokens: configuredMaxOutputTokens(),
        });

        let rawPayload: unknown;
        const toolCall = res.message.tool_calls?.find((c) => c.name === "submit_extracted_theses");
        if (toolCall && toolCall.arguments && Object.keys(toolCall.arguments).length > 0) {
          rawPayload = toolCall.arguments;
        } else if (res.message.content) {
          rawPayload = this.parseJsonPayload(res.message.content);
        }

        if (!rawPayload || typeof rawPayload !== "object") {
          throw new Error("Ling 未返回观点提炼 tool_call 或 JSON");
        }

        const payloadObj = rawPayload as Record<string, unknown>;
        const rawTheses = payloadObj.theses || payloadObj;
        const parsedTheses = this.parseModelTheses(rawTheses, selectedSpans);
        if (parsedTheses.length === 0) {
          throw new Error("Ling 返回的观点列表为空");
        }

        // Merge model-extracted company and report date into identification
        const modelCompany = payloadObj.company as Record<string, string> | undefined;
        let identifiedCompany = identification.identifiedCompany;
        let candidates = [...identification.candidates];
        if (modelCompany && typeof modelCompany.name === "string" && modelCompany.name.trim()) {
          const name = modelCompany.name.trim();
          const code = (modelCompany.securityCode || "").trim();
          const exchange = (modelCompany.exchange || "SSE").trim();
          const targetExchange: "SSE" | "SZSE" = exchange === "SZSE" ? "SZSE" : "SSE";
          const existing = candidates.find((c) => c.name === name || (code && c.securityCode === code));
          if (existing) {
            identifiedCompany = existing;
          } else {
            const dynamicCompany: Company = {
              id: crypto.randomUUID(),
              name,
              exchange: targetExchange,
              securityCode: code || "000000",
              issuerIds: { [targetExchange === "SZSE" ? "szse" : "sse"]: code || "000000" },
              aliases: [name, code].filter(Boolean),
            };
            identifiedCompany = dynamicCompany;
            candidates.push(dynamicCompany);
          }
        }

        const modelDate = typeof payloadObj.reportDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(payloadObj.reportDate.trim())
          ? payloadObj.reportDate.trim()
          : null;
        const reportDate = modelDate || identification.reportDate;

        return {
          theses: parsedTheses,
          identification: {
            identifiedCompany,
            reportDate,
            candidates: candidates.length ? candidates : identifiedCompany ? [identifiedCompany] : [],
            isAmbiguous: !identifiedCompany && candidates.length > 1,
          },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "未知错误";
        throw new Error(`Ling 观点提炼失败：${message}`);
      }
    }

    throw new Error("指定 Ling 模型未配置，不能使用规则或固定示例提炼观点");
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

  private parseJsonPayload(content: string): unknown {
    const match = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const jsonStr = (match ? match[1] : content).trim();
    try {
      return JSON.parse(jsonStr);
    } catch {
      let depth = 0;
      let start = -1;
      for (let i = 0; i < content.length; i++) {
        if (content[i] === "{") {
          if (depth === 0) start = i;
          depth++;
        } else if (content[i] === "}") {
          depth--;
          if (depth === 0 && start >= 0) {
            try {
              return JSON.parse(content.slice(start, i + 1));
            } catch {}
            start = -1;
          }
        }
      }
      return null;
    }
  }

  private parseModelTheses(input: unknown, spans: EvidenceSpan[]) {
    let decoded: unknown;
    if (typeof input === "string") {
      decoded = this.parseJsonPayload(input);
    } else {
      decoded = input;
    }
    const rawItems = Array.isArray(decoded)
      ? decoded
      : decoded && typeof decoded === "object" && Array.isArray((decoded as any).theses)
        ? (decoded as any).theses
        : null;
    if (!rawItems) throw new Error("Ling JSON 缺少 theses 数组");

    const ItemSchema = z.object({
      text: z.string().trim().min(1),
      // Ling usually returns originalText, but allowing the selected source
      // span as a lossless fallback makes the one-call extractor tolerant of
      // a concise model response without weakening evidence binding.
      originalText: z.string().trim().min(1).optional(),
      // Provider output occasionally uses a semantically reasonable alias
      // such as RISK or FORECAST.  Parse it first, then map it onto our five
      // product categories so one label cannot invalidate the full report.
      type: z.unknown().optional(),
      criterion: z.unknown(),
      spanIndices: z.array(z.number().int().nonnegative()).default([]),
      evidenceIndices: z.array(z.number().int().nonnegative()).default([]),
      priority: z.number().int().optional(),
      sourceEvidenceIds: z.array(z.string().uuid()).optional(),
    }).refine((item) => item.spanIndices.length > 0 || item.evidenceIndices.length > 0 || (item.sourceEvidenceIds?.length || 0) > 0, {
      message: "观点必须引用至少一条研报证据",
    });
    const items = z.array(ItemSchema).min(1).max(6).parse(rawItems);
    return items.map((item) => {
      const criterionInput = this.normaliseCriterion(item.criterion, item.text);
      const criterion = ConditionSchema.parse(criterionInput);
      const indexedEvidence = [...item.spanIndices, ...item.evidenceIndices].map((index) => spans[index]?.id).filter((id): id is UUID => Boolean(id));
      const directEvidence = (item.sourceEvidenceIds || []).filter((id) => spans.some((span) => span.id === id));
      const sourceEvidenceIds = [...new Set([...indexedEvidence, ...directEvidence])];
      if (sourceEvidenceIds.length === 0) throw new Error("Ling 观点缺少有效的原文证据引用");
      const originalText = item.originalText || indexedEvidence.map((id) => spans.find((span) => span.id === id)?.quote).find(Boolean) || item.text;
      return {
        id: crypto.randomUUID(),
        groupId: crypto.randomUUID(),
        text: item.text,
        originalText,
        type: this.normaliseThesisType(item.type),
        criterion,
        sourceEvidenceIds,
        priority: item.priority ?? 5,
      };
    });
  }

  private normaliseThesisType(value: unknown): "NUMERIC_FORECAST" | "DIRECTIONAL" | "CAUSAL" | "QUALITATIVE" | "HISTORICAL" {
    const key = typeof value === "string" ? value.trim().toUpperCase().replace(/[\s-]+/g, "_") : "";
    if (["NUMERIC_FORECAST", "NUMERIC", "FORECAST", "FINANCIAL_FORECAST", "QUANTITATIVE"].includes(key)) return "NUMERIC_FORECAST";
    if (["DIRECTIONAL", "DIRECTION", "TREND", "GROWTH", "OUTLOOK"].includes(key)) return "DIRECTIONAL";
    if (["CAUSAL", "CAUSE", "DRIVER", "CATALYST"].includes(key)) return "CAUSAL";
    if (["HISTORICAL", "HISTORY", "HISTORIC", "FACT"].includes(key)) return "HISTORICAL";
    return "QUALITATIVE";
  }

  private normaliseCriterion(value: unknown, thesisText: string): unknown {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {
        kind: "SEMANTIC",
        proposition: thesisText,
        requiredEvidence: ["后续财报中的相关经营或财务披露"],
        horizonEnd: null,
        origin: "REPORT_EXPLICIT",
      };
    }
    const criterion = { ...(value as Record<string, unknown>) };
    if (typeof criterion.kind === "string") criterion.kind = criterion.kind.trim().toUpperCase();
    if (criterion.op === undefined && criterion.operator !== undefined) criterion.op = criterion.operator;
    if (criterion.origin === undefined) criterion.origin = "REPORT_EXPLICIT";
    if (criterion.kind === "TREND" && criterion.tolerance === undefined) criterion.tolerance = null;
    if (criterion.kind === "SEMANTIC") {
      if (criterion.requiredEvidence === undefined) criterion.requiredEvidence = [];
      if (criterion.horizonEnd === undefined) criterion.horizonEnd = null;
    }
    const parsed = ConditionSchema.safeParse(criterion);
    if (parsed.success) return parsed.data;
    // Criterion structure is an internal UI aid, not a reason to discard an
    // otherwise sourced investment view.  A semantic criterion preserves the
    // exact thesis and lets Ling verify it against later filings.
    return {
      kind: "SEMANTIC",
      proposition: thesisText,
      requiredEvidence: ["后续财报中的相关经营或财务披露"],
      horizonEnd: null,
      origin: "REPORT_EXPLICIT",
    };
  }
}
