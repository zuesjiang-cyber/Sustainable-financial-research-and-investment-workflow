import { Router } from "express";
import crypto from "node:crypto";
import Decimal from "decimal.js";
import { z } from "zod";
import { V1Store, type V1ProjectRecord, type V1RunRecord } from "./v1Store";
import { LocalUploadService } from "../documents/uploadService";
import { ThesisExtractor } from "../documents/thesisExtractor";
import { MetricRegistry } from "../facts/metricRegistry";
import { ResearchAgent } from "../agent/researchAgent";
import { DiffGenerator } from "../memory/diffGenerator";
import { MarkdownMemoryStore } from "../memory/markdownMemoryStore";
import { configuredMaxOutputTokens, createConfiguredResearchModelTransport, DEFAULT_OPENAI_MODEL, type ResearchModelTransport } from "../researchModel";
import {
  ConditionSchema,
  DraftSchema,
  FactSchema,
  PeriodSchema,
  ResearchStateSchema,
  SourceManifestSchema,
  ThesisAssessmentSchema,
  ThesisRevisionSchema,
  UserCorrectionSchema,
  V1FilingRunRequestSchema,
  V1InitialReportRunRequestSchema,
  type Condition,
  type Draft,
  type EvidenceSpan,
  type Fact,
  type ResearchQuestion,
  type ResearchState,
  type ThesisAssessment,
  type ThesisRevision,
  type UUID,
} from "../../shared/domain";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const THESIS_TYPES = new Set(["NUMERIC_FORECAST", "DIRECTIONAL", "CAUSAL", "QUALITATIVE", "HISTORICAL"]);

const DEMO_RUN_ID = "run-demo-t0";
const DEMO_DOC_ID = "00000000-0000-4000-8000-000000000101" as UUID;
const DEMO_SPAN_ID = "00000000-0000-4000-8000-000000000102" as UUID;
const DEMO_PARSE_ID = "00000000-0000-4000-8000-000000000103" as UUID;
const DEMO_THESIS_1_ID = "00000000-0000-4000-8000-000000000201" as UUID;
const DEMO_THESIS_2_ID = "00000000-0000-4000-8000-000000000202" as UUID;

const DEMO_RECEIPT = {
  uploadId: DEMO_DOC_ID,
  document: {
    id: DEMO_DOC_ID,
    role: "THESIS_SOURCE" as const,
    title: "圣邦股份深度研究报告.pdf",
    fileName: "圣邦股份深度研究报告.pdf",
    mimeType: "application/pdf" as const,
    sha256: "2688dd70df3f2140a3e65da66dd420dfa9ae3aa20edcb0074efcd52a83a07fa6",
    companyId: null,
    publishedAt: "2025-06-15",
    period: null,
    origin: "USER_UPLOAD" as const,
    officialUrl: null,
    providerId: null,
    supersedesDocumentId: null,
    isSynthetic: true,
    createdAt: "2025-06-15T00:00:00.000Z",
  },
  parseSummary: {
    status: "COMPLETED" as const,
    parserVersion: "demo",
    pageCount: 32,
    blockCount: 186,
    tableCount: 9,
    spanCount: 1,
    quality: {
      nativeTextRatio: 1,
      hasOcrPages: false,
      lowConfidencePages: [],
      issues: ["显式 Demo：研报演示切片"],
    },
  },
};

const DEMO_SPANS: EvidenceSpan[] = [
  {
    id: DEMO_SPAN_ID,
    documentId: DEMO_DOC_ID,
    parseId: DEMO_PARSE_ID,
    regions: [],
    quote: "预计2025年综合毛利率有望达到30%以上，盈利能力显著修复；经营活动产生的现金流量净额持续向好，营运资金效率提升。",
    textHash: "2688dd70df3f2140a3e65da66dd420dfa9ae3aa20edcb0074efcd52a83a07fa6",
    headingPath: ["核心观点", "盈利预测"],
    quality: "NATIVE",
  },
];

const DEMO_RUN: V1RunRecord = {
  id: DEMO_RUN_ID,
  kind: "INITIAL_REPORT",
  status: "AWAITING_THESIS_REVIEW",
  reportDocumentId: DEMO_DOC_ID,
  reportDate: "2025-06-15",
  companyCandidates: [{ name: "圣邦股份", securityCode: "300661", exchange: "SZSE" }],
  draft: {
    items: [
      {
        thesisId: DEMO_THESIS_1_ID,
        title: "综合毛利率达到 30% 以上",
        statement: "预计2025年综合毛利率有望达到30%以上，盈利能力显著修复。",
        originalText: "预计2025年综合毛利率有望达到30%以上，盈利能力显著修复。",
        type: "NUMERIC_FORECAST",
        criterion: {
          kind: "COMPARE",
          metric: "gross_margin",
          op: "GTE",
          target: "30",
          unit: "RATIO",
          period: { start: "2025-01-01", end: "2025-12-31", basis: "YEAR" },
          scope: "CONSOLIDATED",
          origin: "REPORT_EXPLICIT",
        },
        sourceEvidenceIds: [DEMO_SPAN_ID],
        extractionIssues: [],
        priority: 1,
      },
      {
        thesisId: DEMO_THESIS_2_ID,
        title: "经营性现金流持续改善",
        statement: "经营活动产生的现金流量净额持续向好，营运资金效率提升。",
        originalText: "经营活动产生的现金流量净额持续向好，营运资金效率提升。",
        type: "DIRECTIONAL",
        criterion: {
          kind: "TREND",
          metric: "operating_cash_flow",
          direction: "UP",
          period: { start: "2025-01-01", end: "2025-12-31", basis: "YEAR" },
          comparePeriod: { start: "2024-01-01", end: "2024-12-31", basis: "YEAR" },
          scope: "CONSOLIDATED",
          origin: "REPORT_EXPLICIT",
          tolerance: null,
        },
        sourceEvidenceIds: [DEMO_SPAN_ID],
        extractionIssues: [],
        priority: 2,
      },
    ],
    sourceDocument: DEMO_RECEIPT.document,
    parseSummary: DEMO_RECEIPT.parseSummary,
  },
  created_at: "2025-06-15T00:00:00.000Z",
  updated_at: "2025-06-15T00:00:00.000Z",
};

function statusError(message: string, statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

function isUuid(value: unknown): value is UUID {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function requireText(value: unknown, label: string, max = 20_000): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw statusError(`${label}为空或超出长度限制`, 400);
  return value.trim();
}

function parsePeriod(value: unknown): z.infer<typeof PeriodSchema> {
  const parsed = PeriodSchema.safeParse(value);
  if (!parsed.success || !ISO_DATE.test(parsed.data.end) || (parsed.data.start !== null && !ISO_DATE.test(parsed.data.start))) throw statusError("报告期间格式无效，应使用 ISO 日期", 400);
  return parsed.data;
}

function normaliseCriterion(value: unknown, fallbackOrigin: "REPORT_EXPLICIT" | "USER_CONFIRMED" = "USER_CONFIRMED"): Condition {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw statusError("观点缺少可核验条件", 400);
  const raw = { ...(value as Record<string, unknown>) };
  if (raw.op === undefined && raw.operator !== undefined) raw.op = raw.operator;
  if (raw.origin === undefined) raw.origin = fallbackOrigin;
  if (raw.kind === "COMPARE") {
    if (!raw.scope) raw.scope = "CONSOLIDATED";
    if (!raw.unit) raw.unit = "RATIO";
  }
  if (raw.kind === "TREND") {
    if (!raw.direction) raw.direction = "UP";
    if (!raw.scope) raw.scope = "CONSOLIDATED";
    if (!raw.comparePeriod && raw.period && typeof raw.period === "object") {
      const p = raw.period as any;
      const startYear = p.start ? parseInt(p.start.slice(0, 4), 10) - 1 : 2024;
      const endYear = p.end ? parseInt(p.end.slice(0, 4), 10) - 1 : 2024;
      raw.comparePeriod = {
        start: p.start ? `${startYear}${p.start.slice(4)}` : `${startYear}-01-01`,
        end: p.end ? `${endYear}${p.end.slice(4)}` : `${endYear}-12-31`,
        basis: p.basis || "YEAR",
      };
    }
    if (raw.tolerance === undefined) raw.tolerance = null;
  }
  if (raw.kind === "SEMANTIC") {
    if (raw.requiredEvidence === undefined) raw.requiredEvidence = [];
    if (raw.horizonEnd === undefined) raw.horizonEnd = null;
  }
  const parsed = ConditionSchema.safeParse(raw);
  if (!parsed.success) throw statusError("观点核验条件格式无效", 400);
  return parsed.data;
}

function normaliseThesisInput(input: any, allowedEvidenceIds: Set<string>, origin: "REPORT_EXPLICIT" | "USER_CONFIRMED"): ThesisRevision {
  const text = requireText(input?.statement ?? input?.text, "观点表述");
  const rawEvidenceIds: string[] = Array.from(new Set(Array.isArray(input?.sourceEvidenceIds) ? input.sourceEvidenceIds.filter((id: unknown): id is string => typeof id === "string") : []));
  const sourceEvidenceIds = rawEvidenceIds.map((id) => (id === "span-thesis-1" ? DEMO_SPAN_ID : id));
  if (sourceEvidenceIds.some((id): boolean => !allowedEvidenceIds.has(id))) throw statusError("观点引用了不属于当前研报的证据", 400);
  const thesis = {
    id: isUuid(input?.id) ? input.id : crypto.randomUUID(),
    thesisId: isUuid(input?.thesisId) ? input.thesisId : crypto.randomUUID(),
    revision: Number.isInteger(input?.revision) && input.revision >= 1 ? input.revision : 1,
    groupId: isUuid(input?.groupId) ? input.groupId : crypto.randomUUID(),
    text,
    originalText: typeof input?.originalText === "string" && input.originalText.trim() ? input.originalText : text,
    sourceEvidenceIds,
    type: THESIS_TYPES.has(input?.type) ? input.type : "QUALITATIVE",
    criterion: normaliseCriterion(input?.criterion, origin),
    priority: Number.isInteger(input?.priority) ? input.priority : 0,
    derivedFromThesisIds: Array.isArray(input?.derivedFromThesisIds) ? input.derivedFromThesisIds.filter(isUuid) : [],
    extractionIssues: Array.isArray(input?.extractionIssues) ? input.extractionIssues.filter((v: unknown) => typeof v === "string") : [],
  };
  return ThesisRevisionSchema.parse(thesis);
}

function requiredMetrics(theses: ThesisRevision[]): string[] {
  const metrics = new Set<string>();
  const visit = (condition: Condition) => {
    if (condition.kind === "COMPARE" || condition.kind === "TREND") {
      if (condition.metric === "gross_margin") {
        metrics.add("revenue");
        metrics.add("cost_of_revenue");
      } else if (condition.metric === "revenue_growth") metrics.add("revenue");
      else metrics.add(condition.metric);
    } else if (condition.kind === "ALL" || condition.kind === "ANY") condition.children.forEach(visit);
  };
  theses.forEach((thesis) => visit(thesis.criterion));
  return [...metrics].filter((metric) => ["revenue", "cost_of_revenue", "operating_cash_flow"].includes(metric));
}

function sourceManifestFor(asOf: string, documents: Array<{ documentId: UUID; sha256: string; purpose: string }>, latestCoveredPeriod: z.infer<typeof PeriodSchema> | null) {
  return SourceManifestSchema.parse({
    asOf,
    hash: crypto.createHash("sha256").update(JSON.stringify(documents)).digest("hex"),
    documents,
    latestCoveredPeriod,
    checkedAt: new Date().toISOString(),
    discoveryStatus: "COMPLETE",
    missing: [],
  });
}

function initialAssessment(thesis: ThesisRevision): ThesisAssessment {
  return ThesisAssessmentSchema.parse({
    id: crypto.randomUUID(), thesisId: thesis.thesisId, thesisRevisionId: thesis.id, inputHash: "t0-init",
    status: "UNRESOLVED", maturity: "NOT_DUE", interimSignal: "UNKNOWN",
    summary: "用户确认的初始跟踪观点，尚未经财报核验。", factIds: [], calculationIds: [], evidenceIds: [], observedGap: null,
    disclosedCauses: [], hypotheses: [], conditions: [{ path: "criterion", result: "UNKNOWN", reason: "等待用户上传对应财报", evidenceIds: [], calculationIds: [] }],
    nextQuestions: [{ id: crypto.randomUUID(), thesisId: thesis.thesisId, text: `等待上传财报核验 ${thesis.criterion.kind === "COMPARE" || thesis.criterion.kind === "TREND" ? thesis.criterion.metric : "相关披露"}`, requiredEvidence: "定期财务报表及附注", triggerPeriod: null, status: "OPEN", answer: null }],
    limitations: ["初始观点基线，等待上传财报核验"],
  });
}

function parseModelJson(content: string): unknown {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  try { return JSON.parse((fenced ? fenced[1] : content).trim()); } catch { throw new Error("Ling 返回内容不是合法 JSON"); }
}

function parseLingNumber(value: string | null, explicitUnit = ""): { value: string; unit: string } | null {
  if (!value || !value.trim()) return null;
  const match = value.replace(/,/g, "").match(/[+-]?(?:\d+(?:\.\d+)?|\.\d+)/);
  if (!match) return null;
  let number = new Decimal(match[0]);
  const unit = `${value} ${explicitUnit}`.match(/亿元|万元|元/)?.[0] || "元";
  if (unit === "亿元") number = number.times(100_000_000);
  if (unit === "万元") number = number.times(10_000);
  return { value: number.toString(), unit };
}

function previousPeriod(period: z.infer<typeof PeriodSchema>): z.infer<typeof PeriodSchema> {
  const shift = (value: string | null) => {
    if (!value) return null;
    const date = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return null;
    date.setUTCFullYear(date.getUTCFullYear() - 1);
    return date.toISOString().slice(0, 10);
  };
  return { start: shift(period.start), end: shift(period.end) || period.end, basis: period.basis };
}

function evidenceIdsFromModel(item: any, spans: EvidenceSpan[]): UUID[] {
  const ids: string[] = [];
  const indices = Array.isArray(item?.evidenceIndices) ? item.evidenceIndices : Array.isArray(item?.spanIndices) ? item.spanIndices : [];
  for (const index of indices) {
    if (!Number.isInteger(index) || index < 0 || !spans[index]) throw new Error(`Ling 返回了无效证据索引 ${String(index)}`);
    ids.push(spans[index].id);
  }
  if (Array.isArray(item?.evidenceIds)) for (const id of item.evidenceIds) {
    if (!spans.some((span) => span.id === id)) throw new Error(`Ling 返回了不属于当前财报的证据 ${String(id)}`);
    ids.push(id);
  }
  return [...new Set(ids)];
}

const SemanticReviewSchema = z.object({
  items: z.array(z.object({
    thesisId: z.string(),
    status: z.enum(["SUPPORTED", "PARTIALLY_SUPPORTED", "WEAKENED", "UNRESOLVED"]).optional(),
    maturity: z.enum(["NOT_DUE", "IN_PROGRESS", "DUE"]).optional(),
    interimSignal: z.enum(["ABOVE", "ON_TRACK", "BELOW", "UNKNOWN"]).optional(),
    summary: z.string().trim().min(1).optional(),
    evidenceIndices: z.array(z.number().int().nonnegative()).default([]),
    facts: z.array(z.object({
      metric: z.string().trim().min(1),
      labelOriginal: z.string().trim().min(1).optional(),
      value: z.string().nullable().default(null),
      previousValue: z.string().nullable().default(null),
      originalUnit: z.string().trim().default("元"),
      evidenceIndices: z.array(z.number().int().nonnegative()).default([]),
    }).strict()).default([]),
    observedGap: z.object({
      text: z.string().trim().min(1),
      evidenceIndices: z.array(z.number().int().nonnegative()).default([]),
    }).strict().nullable().optional(),
    disclosedCauses: z.array(z.object({ text: z.string().trim().min(1), attribution: z.enum(["MANAGEMENT_EXPLANATION", "DISCLOSED_FACT"]).default("DISCLOSED_FACT"), evidenceIndices: z.array(z.number().int().nonnegative()).default([]), evidenceIds: z.array(z.string()).default([]) }).strict()).default([]),
    hypotheses: z.array(z.object({ text: z.string().trim().min(1), supportingEvidenceIds: z.array(z.string()).default([]), supportingEvidenceIndices: z.array(z.number().int().nonnegative()).default([]), missingEvidence: z.array(z.string()).default([]) }).strict()).default([]),
    nextQuestions: z.array(z.object({ text: z.string().trim().min(1), requiredEvidence: z.string().default("相关定期财务报表及附注") }).strict()).default([]),
  }).strict()).max(30),
}).strict();

const SUBMIT_FILING_REVIEW_TOOL = {
  name: "submit_filing_review",
  description: "提交财报核验结果，包含各观点的状态、财务事实、证据位置索引、实际与目标差距、披露原因及后续问题",
  parameters: {
    type: "object",
    properties: {
      items: {
        type: "array",
        description: "每条观点的核验详情列表",
        items: {
          type: "object",
          properties: {
            thesisId: { type: "string", description: "原样沿用的观点 thesisId" },
            status: { type: "string", enum: ["SUPPORTED", "PARTIALLY_SUPPORTED", "WEAKENED", "UNRESOLVED"], description: "观点核验状态" },
            maturity: { type: "string", enum: ["DUE", "IN_PROGRESS", "NOT_DUE"], description: "验证周期到期状态" },
            interimSignal: { type: "string", enum: ["ABOVE", "ON_TRACK", "BELOW", "UNKNOWN"], description: "中报/季报期间信号" },
            summary: { type: "string", description: "核验判定总结" },
            evidenceIndices: { type: "array", items: { type: "integer" }, description: "指向 [SPAN_n] 的编号" },
            facts: {
              type: "array",
              description: "从财报抽取的关键财务事实",
              items: {
                type: "object",
                properties: {
                  metric: { type: "string", description: "指标名如 revenue, cost_of_revenue 等" },
                  labelOriginal: { type: "string", description: "财报原始科目名称" },
                  value: { type: ["string", "null"], description: "本期数字，保留单位如 123.4亿元 或 null" },
                  previousValue: { type: ["string", "null"], description: "上年同期数字，保留单位或 null" },
                  originalUnit: { type: "string", description: "原始单位如 亿元、万元、元" },
                  evidenceIndices: { type: "array", items: { type: "integer" }, description: "指向 [SPAN_n] 的编号" },
                },
                required: ["metric", "evidenceIndices"],
              },
            },
            observedGap: {
              type: "object",
              description: "实际值 vs 目标值及差额，无法计算时填 null",
              properties: {
                text: { type: "string", description: "实际值 vs 目标值及差额描述" },
                evidenceIndices: { type: "array", items: { type: "integer" } },
              },
            },
            disclosedCauses: {
              type: "array",
              description: "管理层披露的原因",
              items: {
                type: "object",
                properties: {
                  text: { type: "string", description: "原因陈述" },
                  attribution: { type: "string", enum: ["MANAGEMENT_EXPLANATION", "DISCLOSED_FACT"] },
                  evidenceIndices: { type: "array", items: { type: "integer" } },
                },
                required: ["text", "evidenceIndices"],
              },
            },
            hypotheses: {
              type: "array",
              description: "待验证假设",
              items: {
                type: "object",
                properties: {
                  text: { type: "string" },
                  supportingEvidenceIndices: { type: "array", items: { type: "integer" } },
                  missingEvidence: { type: "array", items: { type: "string" } },
                },
                required: ["text", "supportingEvidenceIndices", "missingEvidence"],
              },
            },
            nextQuestions: {
              type: "array",
              description: "下一步跟踪问题",
              items: {
                type: "object",
                properties: {
                  text: { type: "string" },
                  requiredEvidence: { type: "string" },
                },
                required: ["text"],
              },
            },
          },
          required: ["thesisId"],
        },
      },
    },
    required: ["items"],
  },
};

async function addSemanticReviews(
  assessments: Map<string, ThesisAssessment>,
  theses: ThesisRevision[],
  filingSpans: EvidenceSpan[],
  facts: Fact[],
  modelTransport: ReturnType<typeof createConfiguredResearchModelTransport>,
  memoryContext: string,
  filing: { projectId: UUID; documentId: UUID; period: z.infer<typeof PeriodSchema>; publishedAt: string; scope: "CONSOLIDATED" | "PARENT" },
): Promise<void> {
  if (theses.length === 0) return;
  if (!modelTransport) throw statusError("指定 Ling 模型未配置，无法进行财报核验", 503);
  // Keep the exact span list used in the prompt so model indices resolve to
  // the same evidence IDs. Rank likely financial statements and MD&A reason
  // disclosures first; simply taking the first PDF spans often misses the
  // explanation section near the end of a filing.
  const metricKeywords = new Set<string>(["财务", "管理层讨论", "原因", "影响", "由于", "得益", "拖累"]);
  for (const thesis of theses) {
    const metric = thesis.criterion.kind === "COMPARE" || thesis.criterion.kind === "TREND" ? thesis.criterion.metric : "";
    if (metric === "revenue" || metric === "revenue_growth") ["营业收入", "主营业务收入", "收入"].forEach((term) => metricKeywords.add(term));
    if (metric === "cost_of_revenue") ["营业成本", "主营业务成本", "成本"].forEach((term) => metricKeywords.add(term));
    if (metric === "operating_cash_flow") ["经营活动产生的现金流量净额", "经营活动现金流量净额", "经营现金流"].forEach((term) => metricKeywords.add(term));
    if (metric === "gross_margin") ["毛利率", "毛利", "营业收入", "营业成本"].forEach((term) => metricKeywords.add(term));
  }
  const rankedSemanticSpans = filingSpans
    .map((span, index) => {
      const text = `${span.headingPath.join(" ")} ${span.quote}`;
      const metricScore = [...metricKeywords].filter((term) => text.includes(term)).length;
      const reasonScore = /(管理层讨论|经营情况讨论|原因|主要由于|主要受|影响|得益|拖累|驱动|解释|展望|风险)/.test(text) ? 4 : 0;
      const statementScore = /(利润表|现金流量表|资产负债表|财务报表|主要会计数据|财务指标)/.test(text) ? 3 : 0;
      return { span, index, score: metricScore * 3 + reasonScore + statementScore };
    })
    .filter(({ span }) => span.quote.trim())
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 40);
  let semanticChars = 0;
  const semanticSpans = rankedSemanticSpans.filter(({ span }) => {
    const length = Math.min(span.quote.length, 700) + 40;
    if (semanticChars >= 18_000) return false;
    semanticChars += length;
    return true;
  }).map(({ span }) => span);
  const evidenceText = semanticSpans.map((span, index) => `[SPAN_${index}] ${span.quote.slice(0, 700)}`).join("\n");
  const thesisText = theses.map((thesis) => JSON.stringify({ thesisId: thesis.thesisId, statement: thesis.text, criterion: thesis.criterion })).join("\n");
  const seenThesisIds = new Set<string>();
  const factByKey = new Map<string, Fact>();
  const persistFact = (raw: z.infer<typeof SemanticReviewSchema>["items"][number]["facts"][number], value: string, factPeriod: z.infer<typeof PeriodSchema>, evidenceIds: UUID[]): Fact | null => {
    const parsed = parseLingNumber(value, raw.originalUnit);
    if (!parsed || evidenceIds.length === 0) return null;
    const key = `${raw.metric}:${factPeriod.end}:${parsed.value}:${filing.scope}`;
    const existing = factByKey.get(key);
    if (existing) return existing;
    const fact: Fact = {
      id: crypto.randomUUID(),
      documentId: filing.documentId,
      companyId: filing.projectId,
      metric: raw.metric,
      labelOriginal: raw.labelOriginal || raw.metric,
      segment: null,
      period: factPeriod,
      accountingStandard: "CAS",
      scope: filing.scope,
      nature: "ACTUAL",
      value: parsed.value,
      unit: "CURRENCY",
      currency: "CNY",
      customUnit: null,
      originalValue: value,
      originalUnit: raw.originalUnit || parsed.unit,
      scale: parsed.unit === "亿元" ? "100000000" : parsed.unit === "万元" ? "10000" : "1",
      publishedAt: filing.publishedAt,
      restatementKey: `ling:${raw.metric}:${factPeriod.end}`,
      evidenceIds,
      extractionVersion: "ling-3.0-flash-fin-v1",
    };
    factByKey.set(key, fact);
    facts.push(fact);
    return fact;
  };
  try {
    const response = await modelTransport.complete({
      messages: [{ role: "user", content: [
        "你是财报核验器。请调用 submit_filing_review 工具提交核验结果。仅依据下面的真实财报片段，为每条观点抽取事实并返回核验结果，原样沿用 thesisId。你负责识别正确表格行、当前期与可比期、单位和口径，再判断状态、maturity、实际与目标差距、已披露原因、待验证假设和下一步问题。没有直接证据必须 UNRESOLVED；没有披露原因则 disclosedCauses 为空；不能补造数字或公司事实。所有 evidenceIndices 必须指向下面 [SPAN_n] 的编号。",
        "上一轮已确认 Research Memory（只用于沿用 thesisId、用户判断和未决问题，不得当作本期事实）：",
        memoryContext,
        `用户确认的本期元数据：${JSON.stringify({ period: filing.period, publishedAt: filing.publishedAt, scope: filing.scope })}`,
        "facts 中 value/previousValue 必须保留财报披露的数字和单位，例如 123.4亿元；找不到就填 null。observedGap.text 要明确写实际值、目标值和差额；不能计算时填 null。",
        `观点：\n${thesisText}`,
        `财报片段：\n${evidenceText}`,
      ].join("\n") }],
      tools: [SUBMIT_FILING_REVIEW_TOOL],
      tool_choice: { type: "function", function: { name: "submit_filing_review" } },
      max_tokens: configuredMaxOutputTokens(),
    });
    let rawPayload: unknown;
    const reviewCall = response.message.tool_calls?.find((call) => call.name === "submit_filing_review");
    if (reviewCall && reviewCall.arguments && Object.keys(reviewCall.arguments).length > 0) {
      rawPayload = reviewCall.arguments;
    } else if (response.message.content) {
      rawPayload = parseModelJson(response.message.content);
    }
    if (!rawPayload) throw new Error("Ling 未返回财报核验 tool_call 或 JSON");
    const parsed = SemanticReviewSchema.parse(rawPayload);
    const thesisById = new Map(theses.map((thesis) => [thesis.thesisId, thesis]));
    for (const item of parsed.items) {
      const current = assessments.get(item.thesisId);
      if (!current || !thesisById.has(item.thesisId)) throw new Error(`Ling 返回了未知 thesisId ${item.thesisId}`);
      if (seenThesisIds.has(item.thesisId)) throw new Error(`Ling 重复返回 thesisId ${item.thesisId}`);
      seenThesisIds.add(item.thesisId);
      const semanticEvidenceIds = [...new Set([
        ...evidenceIdsFromModel(item, semanticSpans),
        ...item.facts.flatMap((fact) => evidenceIdsFromModel(fact, semanticSpans)),
      ])];
      const itemFacts = item.facts.flatMap((raw) => {
        const evidenceIds = evidenceIdsFromModel(raw, semanticSpans);
        const extracted: Fact[] = [];
        if (raw.value) {
          const fact = persistFact(raw, raw.value, filing.period, evidenceIds);
          if (fact) extracted.push(fact);
        }
        if (raw.previousValue) {
          const fact = persistFact(raw, raw.previousValue, previousPeriod(filing.period), evidenceIds);
          if (fact) extracted.push(fact);
        }
        return extracted;
      });
      const disclosedCauses = item.disclosedCauses.flatMap((cause) => {
        const evidenceIds = evidenceIdsFromModel(cause, semanticSpans);
        return evidenceIds.length ? [{ text: cause.text, evidenceIds, factIds: current.factIds, calculationIds: current.calculationIds, attribution: cause.attribution }] : [];
      });
      const hypotheses = item.hypotheses.map((hypothesis) => ({ text: hypothesis.text, supportingEvidenceIds: [...new Set([
        ...hypothesis.supportingEvidenceIds.map((id) => {
          if (!semanticSpans.some((span) => span.id === id)) throw new Error(`Ling 返回了不属于当前财报的假设证据 ${id}`);
          return id;
        }),
        ...hypothesis.supportingEvidenceIndices.map((index) => {
          if (!semanticSpans[index]) throw new Error(`Ling 返回了无效假设证据索引 ${index}`);
          return semanticSpans[index].id;
        }),
      ])], missingEvidence: hypothesis.missingEvidence }));
      const nextQuestions = item.nextQuestions.map((question) => ({ id: crypto.randomUUID(), thesisId: item.thesisId, text: question.text, requiredEvidence: question.requiredEvidence, triggerPeriod: null, status: "OPEN" as const, answer: null }));
      // A status/summary without a cited span is not an evidence-backed
      // semantic judgment. Preserve the deterministic baseline in that case.
      const hasSemanticEvidence = semanticEvidenceIds.length > 0;
      const semanticStatus = item.status && hasSemanticEvidence ? item.status : "UNRESOLVED";
      const semanticMaturity = item.maturity && hasSemanticEvidence ? item.maturity : current.maturity;
      const semanticSignal = item.interimSignal && hasSemanticEvidence ? item.interimSignal : current.interimSignal;
      const semanticSummary = item.summary && hasSemanticEvidence ? item.summary : current.summary;
      const mergedEvidenceIds = [...new Set([...current.evidenceIds, ...semanticEvidenceIds])];
      const observedGapEvidenceIds = item.observedGap ? evidenceIdsFromModel(item.observedGap, semanticSpans) : [];
      const observedGap = item.observedGap && observedGapEvidenceIds.length
        ? { text: item.observedGap.text, evidenceIds: observedGapEvidenceIds, factIds: itemFacts.map((fact) => fact.id), calculationIds: [] }
        : current.observedGap;
      assessments.set(item.thesisId, ThesisAssessmentSchema.parse({
        ...current,
        // A model response without a cited cause must not erase the explicit
        // evidence-backed "not disclosed" note produced by the deterministic
        // verifier.
        disclosedCauses: disclosedCauses.length ? disclosedCauses : current.disclosedCauses,
        hypotheses: hypotheses.length ? hypotheses : current.hypotheses,
        nextQuestions: nextQuestions.length ? nextQuestions : current.nextQuestions,
        status: semanticStatus,
        maturity: semanticMaturity,
        interimSignal: semanticSignal,
        summary: semanticSummary,
        factIds: [...new Set([...current.factIds, ...itemFacts.map((fact) => fact.id)])],
        evidenceIds: mergedEvidenceIds,
        observedGap,
        conditions: current.conditions.map((condition) => ({ ...condition, result: semanticStatus === "SUPPORTED" ? "MET" : semanticStatus === "WEAKENED" ? "NOT_MET" : condition.result, reason: semanticSummary, evidenceIds: mergedEvidenceIds })),
      }));
    }
  } catch (error) {
    console.warn("[v1Router] Ling 财报语义核验未成功，保留确定性基准核验:", error instanceof Error ? error.message : error);
  }
}

function mergeQuestions(previous: ResearchQuestion[], assessments: Map<string, ThesisAssessment>): ResearchQuestion[] {
  const result = [...previous];
  const seen = new Set(result.map((question) => `${question.thesisId}:${question.text}`));
  for (const assessment of assessments.values()) for (const question of assessment.nextQuestions) {
    const key = `${question.thesisId}:${question.text}`;
    if (!seen.has(key)) { result.push(question); seen.add(key); }
  }
  return result;
}

function buildCalculations(theses: ThesisRevision[], assessments: Map<string, ThesisAssessment>, facts: Fact[]) {
  const results: any[] = [];
  const registry = new MetricRegistry();
  for (const thesis of theses) {
    const assessment = assessments.get(thesis.thesisId);
    if (!assessment) continue;
    for (const calculationId of assessment.calculationIds) {
      if (results.some((calculation) => calculation.id === calculationId)) continue;
      const operands = assessment.factIds.map((id) => facts.find((fact) => fact.id === id)).filter(Boolean) as Fact[];
      let execution;
      if (thesis.criterion.kind === "COMPARE" && thesis.criterion.metric === "gross_margin") {
        const revenue = operands.find((fact) => fact.metric === "revenue");
        const cost = operands.find((fact) => fact.metric === "cost_of_revenue");
        if (!revenue || !cost) continue;
        execution = registry.computeGrossMargin(revenue, cost);
      } else if (thesis.criterion.kind === "COMPARE" && thesis.criterion.metric === "revenue_growth") {
        const revenues = operands.filter((fact) => fact.metric === "revenue").sort((a, b) => b.period.end.localeCompare(a.period.end));
        if (revenues.length < 2) continue;
        execution = registry.computeYoYGrowth(revenues[0], revenues[1]);
      } else if (thesis.criterion.kind === "COMPARE" && operands.length > 0) {
        const target = new Decimal(thesis.criterion.target);
        const normalizedTarget = thesis.criterion.unit === "RATIO" && target.greaterThan(1) ? target.dividedBy(100) : target;
        execution = registry.computeTargetGap(new Decimal(operands[0].value), normalizedTarget);
      } else continue;
      results.push({ id: calculationId, formulaId: execution.formulaId, formulaVersion: execution.formulaVersion, operandFactIds: operands.map((fact) => fact.id), operandCalculationIds: [], result: execution.result, unit: execution.unit, displayUnit: execution.displayUnit, checks: execution.checks, criterionRef: { thesisRevisionId: thesis.id, conditionPath: "criterion" } });
    }
  }
  return results;
}

export function createV1Router(options: { store?: V1Store; uploadService?: LocalUploadService; modelTransport?: ResearchModelTransport | null; memoryStore?: MarkdownMemoryStore } = {}): Router {
  const router = Router();
  const store = options.store || new V1Store();
  const uploadService = options.uploadService || new LocalUploadService();
  const thesisExtractor = new ThesisExtractor();
  const researchAgent = new ResearchAgent(new MetricRegistry());
  const diffGenerator = new DiffGenerator();
  const memoryStore = options.memoryStore || new MarkdownMemoryStore();
  let configuredTransport: ResearchModelTransport | null | undefined = options.modelTransport;
  const modelTransport = (): ResearchModelTransport | null => {
    if (configuredTransport !== undefined) return configuredTransport;
    try { configuredTransport = createConfiguredResearchModelTransport(); } catch { configuredTransport = null; }
    return configuredTransport;
  };
  const requireLing = (): ResearchModelTransport => {
    const transport = modelTransport();
    if (!transport || transport.provider !== "openai_compatible" || transport.model !== DEFAULT_OPENAI_MODEL) {
      throw statusError(`指定 Ling 模型未配置。请配置 FINTRUST_LLM_API_KEY，并使用 ${DEFAULT_OPENAI_MODEL}；不使用规则或 Gemini 降级`, 503);
    }
    return transport;
  };

  async function receiptOr404(documentId: string) {
    if (documentId === DEMO_DOC_ID) return DEMO_RECEIPT;
    const receipt = await uploadService.getReceipt(documentId);
    if (!receipt) throw statusError("文档不存在或解析回执不可用", 404);
    return receipt;
  }
  async function spansOr404(documentId: string): Promise<EvidenceSpan[]> {
    if (documentId === DEMO_DOC_ID) return DEMO_SPANS;
    const spans = await uploadService.getSpans(documentId);
    if (!spans) throw statusError("文档解析片段不存在", 404);
    return spans;
  }
  async function getRunOrDemo(runId: string): Promise<V1RunRecord | null> {
    if (runId === DEMO_RUN_ID) return { ...DEMO_RUN };
    const run = await store.getRun(runId);
    if (run) return run;
    return null;
  }

  router.get("/documents/:id", async (req, res, next) => { try { res.json(await receiptOr404(req.params.id)); } catch (error) { next(error); } });
  router.get("/documents/:id/manifest", async (req, res, next) => {
    try {
      await receiptOr404(req.params.id);
      if (req.params.id === DEMO_DOC_ID) {
        return res.json({
          schemaVersion: "1.0",
          documentId: DEMO_DOC_ID,
          parserVersion: "demo",
          pages: [],
          blocks: [],
          tables: [],
          spans: DEMO_SPANS,
          quality: DEMO_RECEIPT.parseSummary.quality,
        });
      }
      const manifest = await uploadService.getManifest(req.params.id);
      if (!manifest) throw statusError("文档解析 manifest 不存在", 404);
      res.json(manifest);
    } catch (error) { next(error); }
  });
  router.get("/documents/:id/spans", async (req, res, next) => { try { await receiptOr404(req.params.id); res.json(await spansOr404(req.params.id)); } catch (error) { next(error); } });
  router.get("/uploads/:id", async (req, res, next) => { try { res.json(await receiptOr404(req.params.id)); } catch (error) { next(error); } });

  router.post("/runs", async (req, res, next) => {
    const runId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    try {
      const request = V1InitialReportRunRequestSchema.safeParse(req.body);
      if (!request.success) throw statusError("必须提供 kind: INITIAL_REPORT 与有效 reportDocumentId", 400);
      const reportDocumentId = request.data.reportDocumentId as UUID;
      const receipt = await receiptOr404(reportDocumentId);
      if (receipt.document.role !== "THESIS_SOURCE") throw statusError("该文档不是研报来源文档", 400);
      const spans = await spansOr404(reportDocumentId);
      if (!spans.length) throw statusError("研报解析切片为空，请确认文件是否正确解析", 400);
      const extracted = await thesisExtractor.extractTheses(spans, requireLing());
      if (!extracted.theses.length) throw statusError("研报未提取出可核验观点，请修改研报或配置 Ling 后重试", 422);
      const items = extracted.theses.map((thesis) => ({ thesisId: thesis.id, title: thesis.text.slice(0, 80), statement: thesis.text, originalText: thesis.originalText, type: thesis.type, criterion: thesis.criterion, sourceEvidenceIds: thesis.sourceEvidenceIds, extractionIssues: [], priority: thesis.priority }));
      const run: V1RunRecord = { id: runId, kind: "INITIAL_REPORT", status: "AWAITING_THESIS_REVIEW", reportDocumentId, reportDate: extracted.identification.reportDate, companyCandidates: extracted.identification.candidates.length ? extracted.identification.candidates : extracted.identification.identifiedCompany ? [extracted.identification.identifiedCompany] : [], draft: { items, sourceDocument: receipt.document, parseSummary: receipt.parseSummary }, created_at: createdAt, updated_at: createdAt };
      await store.saveRun(run);
      res.status(201).json({ runId, status: run.status, reportDocumentId, reportDate: run.reportDate, companyCandidates: run.companyCandidates, draft: run.draft });
    } catch (error) {
      try { await store.saveRun({ id: runId, kind: "INITIAL_REPORT", status: "FAILED", reportDocumentId: isUuid(req.body?.reportDocumentId) ? req.body.reportDocumentId : undefined, error: error instanceof Error ? error.message : "运行失败", created_at: createdAt, updated_at: new Date().toISOString() }); } catch { /* preserve original error */ }
      next(error);
    }
  });

  router.get("/runs/:id", async (req, res, next) => { try { const run = await getRunOrDemo(req.params.id); if (!run) throw statusError("Run 不存在", 404); res.json(run); } catch (error) { next(error); } });
  router.get("/runs/:id/draft", async (req, res, next) => { try { const run = await getRunOrDemo(req.params.id); if (!run) throw statusError("Run 不存在", 404); if (!run.draft) throw statusError("该 Run 尚无草稿", 404); res.json(run.draft); } catch (error) { next(error); } });

  router.post("/runs/:id/draft/confirm", async (req, res, next) => {
    try {
      const run = await getRunOrDemo(req.params.id);
      if (!run) throw statusError("Run 不存在", 404);
      if (run.status !== "AWAITING_THESIS_REVIEW" && run.status !== "AWAITING_ASSESSMENT_REVIEW") throw statusError("该 Run 当前不能确认", 409);
      if (run.kind === "INITIAL_REPORT") {
        const companyInput = req.body?.company;
        const companyName = requireText(companyInput?.name, "公司名称", 200);
        const securityCode = requireText(companyInput?.securityCode, "证券代码", 30);
        const exchange = companyInput?.exchange === "SSE" || companyInput?.exchange === "SZSE" ? companyInput.exchange : securityCode.startsWith("6") || securityCode.startsWith("68") ? "SSE" : "SZSE";
        const receipt = await receiptOr404(run.reportDocumentId || "");
        const spans = await spansOr404(receipt.document.id);
        const allowedEvidenceIds = new Set(spans.map((span) => span.id));
        const sourceItems = Array.isArray(req.body?.theses) ? req.body.theses : run.draft?.items;
        if (!Array.isArray(sourceItems) || sourceItems.length === 0 || sourceItems.length > 30) throw statusError("至少需要确认 1 条投资观点", 400);
        const revisions = sourceItems.map((item: any) => normaliseThesisInput(item, allowedEvidenceIds, "USER_CONFIRMED"));
        if (new Set(revisions.map((thesis) => thesis.thesisId)).size !== revisions.length) throw statusError("观点 thesisId 重复", 400);
        const projectId = crypto.randomUUID();
        const now = new Date().toISOString();
        const items = revisions.map((thesis) => ({ thesis, lifecycle: "ACTIVE" as const, assessment: initialAssessment(thesis), userJudgment: null }));
        const sourceManifest = sourceManifestFor(run.reportDate || now, [{ documentId: receipt.document.id, sha256: receipt.document.sha256, purpose: "研报原件" }], null);
        const state = ResearchStateSchema.parse({ schemaVersion: "1.0", projectId, version: 0, updateId: crypto.randomUUID(), confirmedAt: now, items, questions: items.flatMap((item) => item.assessment.nextQuestions), method: { version: 1, focusMetrics: [], aliases: {}, focusQuestions: [], preferences: [] }, sourceManifest });
        const project: V1ProjectRecord = { id: projectId, company: { name: companyName, securityCode, exchange }, current_version: "T0", created_at: now, updated_at: now, theses: revisions.map((thesis) => ({ thesisId: thesis.thesisId, title: thesis.text.slice(0, 80), statement: thesis.text, type: thesis.type, criterion: thesis.criterion, sourceEvidenceIds: thesis.sourceEvidenceIds, userJudgment: null })), documents: [{ id: receipt.document.id, role: receipt.document.role, fileName: receipt.document.fileName, sha256: receipt.document.sha256, period: receipt.document.period, publishedAt: receipt.document.publishedAt }], currentState: state, history: [{ version: "T0", confirmedAt: now, state, diffSummary: "初建项目，确认初始观点", corrections: [] }], corrections: [] };
        await memoryStore.saveProject(project as any);
        await store.saveProject(project);
        await store.saveRun({ ...run, status: "COMPLETED", projectId, draft: { ...(run.draft || {}), confirmedTheses: revisions }, updated_at: now });
        return res.json({ projectId, version: "T0", status: "COMPLETED", project, state });
      }

      const targetProjectId = isUuid(req.body?.projectId) ? req.body.projectId : run.projectId;
      if (!targetProjectId) throw statusError("缺少 projectId", 400);
      const project = await memoryStore.getProject(targetProjectId) as V1ProjectRecord | null;
      if (!project) throw statusError("项目不存在", 404);
      const draft = run.draft as Draft | undefined;
      if (!draft?.items) throw statusError("Run 草稿不存在", 409);
      if (req.body?.baseStateVersion !== undefined && req.body.baseStateVersion !== project.currentState.version) throw statusError("研究状态已改变，请基于最新状态重新确认", 409);
      if (req.body?.draftRevision !== undefined && req.body.draftRevision !== draft.revision) throw statusError("草稿版本已更新，请重新加载", 409);
      const edits = new Map<string, any>();
      for (const item of Array.isArray(req.body?.edits) ? req.body.edits : []) if (isUuid(item?.thesisId)) edits.set(item.thesisId, item);
      for (const item of Array.isArray(req.body?.theses) ? req.body.theses : []) if (isUuid(item?.thesisId)) edits.set(item.thesisId, item);
      const userJudgments = req.body?.userJudgments && typeof req.body.userJudgments === "object" ? req.body.userJudgments : {};
      const corrections: any[] = (Array.isArray(req.body?.corrections) ? req.body.corrections : []).map((correction: any) => UserCorrectionSchema.parse({
        id: isUuid(correction?.id) ? correction.id : crypto.randomUUID(), thesisId: isUuid(correction?.thesisId) ? correction.thesisId : null,
        type: ["THESIS_TEXT", "CRITERION", "USER_JUDGMENT", "RESEARCH_PREFERENCE"].includes(correction?.type) ? correction.type : "USER_JUDGMENT",
        action: correction?.action === "CLEAR" ? "CLEAR" : "SET", before: correction?.before ?? null, after: correction?.after ?? null,
        reason: typeof correction?.reason === "string" ? correction.reason : "", baseStateVersion: project.currentState.version, createdAt: new Date().toISOString(),
      }));
      const stateItems = draft.items.map((item: any) => {
        const oldThesis = ThesisRevisionSchema.parse(item.thesis);
        const edit = edits.get(oldThesis.thesisId);
        let thesis = oldThesis;
        if (edit && (edit.text !== undefined || edit.statement !== undefined || edit.criterion !== undefined)) {
          const nextText = edit.text ?? edit.statement ?? oldThesis.text;
          const nextCriterion = edit.criterion ? normaliseCriterion(edit.criterion, "USER_CONFIRMED") : oldThesis.criterion;
          thesis = ThesisRevisionSchema.parse({ ...oldThesis, id: crypto.randomUUID(), revision: oldThesis.revision + 1, text: nextText, criterion: nextCriterion });
          if (nextText !== oldThesis.text) corrections.push(UserCorrectionSchema.parse({ id: crypto.randomUUID(), thesisId: oldThesis.thesisId, type: "THESIS_TEXT", action: "SET", before: oldThesis.text, after: nextText, reason: "用户在核验草稿中修正观点表述", baseStateVersion: project.currentState.version, createdAt: new Date().toISOString() }));
          if (edit.criterion !== undefined) corrections.push(UserCorrectionSchema.parse({ id: crypto.randomUUID(), thesisId: oldThesis.thesisId, type: "CRITERION", action: "SET", before: oldThesis.criterion, after: nextCriterion, reason: "用户在核验草稿中修正核验条件", baseStateVersion: project.currentState.version, createdAt: new Date().toISOString() }));
        }
        const previousJudgment = typeof item.userJudgment === "string" && item.userJudgment.trim() ? item.userJudgment : null;
        const rawJudgment = userJudgments[oldThesis.thesisId] ?? edit?.userJudgment ?? previousJudgment;
        const judgment = typeof rawJudgment === "string" && rawJudgment.trim() ? rawJudgment.trim() : null;
        if (judgment !== previousJudgment) corrections.push(UserCorrectionSchema.parse({
          id: crypto.randomUUID(), thesisId: oldThesis.thesisId, type: "USER_JUDGMENT",
          action: judgment === null ? "CLEAR" : "SET", before: previousJudgment, after: judgment,
          reason: judgment === null ? "用户清除本轮独立判断" : "用户保存本轮独立判断",
          baseStateVersion: project.currentState.version, createdAt: new Date().toISOString(),
        }));
        const assessment = ThesisAssessmentSchema.parse({ ...item.proposed, thesisRevisionId: thesis.id });
        return { thesis, lifecycle: item.include === false ? "ARCHIVED" as const : "ACTIVE" as const, assessment, userJudgment: judgment == null ? null : String(judgment) };
      });
      const questionInput = Array.isArray(req.body?.questions) ? req.body.questions : draft.questions;
      const questions = (questionInput || []).map((question: any) => {
        const existing = project.currentState.questions.find((old) => old.id === question.id);
        return { id: isUuid(question.id) ? question.id : crypto.randomUUID(), thesisId: question.thesisId, text: requireText(question.text, "后续问题", 2_000), requiredEvidence: requireText(question.requiredEvidence || "相关定期财务报表及附注", "所需证据", 2_000), triggerPeriod: question.triggerPeriod || null, status: question.status === "ANSWERED" || question.status === "DEFERRED" ? question.status : existing?.status || "OPEN", answer: question.answer || existing?.answer || null } satisfies ResearchQuestion;
      });
      const previousVersion = project.currentState.version;
      const nextVersion = previousVersion + 1;
      const now = new Date().toISOString();
      const nextState: ResearchState = ResearchStateSchema.parse({ ...project.currentState, version: nextVersion, updateId: crypto.randomUUID(), confirmedAt: now, items: stateItems, questions, sourceManifest: draft.sourceManifest });
      const oldVersion = project.current_version;
      const nextVersionLabel = `T${nextVersion}`;
      project.current_version = nextVersionLabel;
      project.currentState = nextState;
      project.theses = stateItems.map((item) => ({ thesisId: item.thesis.thesisId, title: item.thesis.text.slice(0, 80), statement: item.thesis.text, type: item.thesis.type, criterion: item.thesis.criterion, sourceEvidenceIds: item.thesis.sourceEvidenceIds, userJudgment: item.userJudgment }));
      const filingDoc = run.filingDocumentId ? await receiptOr404(run.filingDocumentId) : null;
      if (filingDoc && !project.documents.some((document) => document.id === filingDoc.document.id)) project.documents.push({ id: filingDoc.document.id, role: filingDoc.document.role, fileName: filingDoc.document.fileName, sha256: filingDoc.document.sha256, period: draft.sourceManifest.latestCoveredPeriod, publishedAt: draft.sourceManifest.asOf });
      project.corrections = [...(project.corrections || []), ...corrections];
      project.history.push({ version: nextVersionLabel, confirmedAt: now, state: nextState, diffSummary: `${oldVersion} → ${nextVersionLabel} 财报核验确认；保存 ${corrections.length} 条用户修正`, corrections });
      await memoryStore.saveProject(project as any);
      await store.saveProject(project);
      await store.saveRun({ ...run, status: "COMPLETED", projectId: project.id, draft: { ...draft, corrections }, updated_at: now });
      return res.json({ projectId: project.id, version: nextVersionLabel, status: "COMPLETED", project, state: nextState });
    } catch (error) { next(error); }
  });

  router.post("/projects/:id/filing-runs", async (req, res, next) => {
    try {
      const project = await memoryStore.getProject(req.params.id) as V1ProjectRecord | null;
      if (!project) throw statusError("项目不存在", 404);
      if (!project.currentState) throw statusError("项目尚未形成初始研究状态", 409);
      const ling = requireLing();
      const request = V1FilingRunRequestSchema.safeParse(req.body);
      if (!request.success) throw statusError("财报核验请求缺少有效的文档、期间、披露日期或口径", 400);
      if (request.data.scope === "SEGMENT") throw statusError("当前 MVP 只支持合并或母公司口径", 400);
      const filingDocumentId = request.data.filingDocumentId as UUID;
      const receipt = await receiptOr404(filingDocumentId);
      if (receipt.document.role !== "FINANCIAL_FILING") throw statusError("该文档不是财报文档，请使用 role=FINANCIAL_FILING 上传", 400);
      const period = parsePeriod(request.data.period);
      const publishedAt = requireText(request.data.publishedAt, "披露日期", 80);
      if (!ISO_DATE.test(publishedAt) && Number.isNaN(Date.parse(publishedAt))) throw statusError("披露日期格式无效", 400);
      const scope = request.data.scope === "PARENT" ? "PARENT" : "CONSOLIDATED";
      const filingSpans = await spansOr404(filingDocumentId);
      const theses = project.currentState.items.filter((item) => item.lifecycle === "ACTIVE").map((item) => item.thesis);
      const metrics = requiredMetrics(theses);
      const facts: Fact[] = [];
      const assessments = new Map<string, ThesisAssessment>();
      for (const thesis of theses) assessments.set(thesis.thesisId, await researchAgent.assessThesis(thesis, { spans: filingSpans, facts, calculations: [] }, { runId: crypto.randomUUID(), companyId: project.id, asOf: publishedAt, allowedDocumentIds: [filingDocumentId] }));
      await addSemanticReviews(assessments, theses, filingSpans, facts, ling, await memoryStore.promptContext(project.id), {
        projectId: project.id,
        documentId: filingDocumentId,
        period,
        publishedAt,
        scope,
      });
      const draftItems = diffGenerator.generateDraftItems(theses, assessments, project.currentState.version > 0 ? project.currentState : null);
      const questions = mergeQuestions(project.currentState.questions || [], assessments);
      const sourceDocuments = [...project.currentState.sourceManifest.documents, { documentId: filingDocumentId, sha256: receipt.document.sha256, purpose: `财报 (${period.end})` }].filter((document, index, all) => all.findIndex((candidate) => candidate.documentId === document.documentId) === index);
      const sourceManifest = sourceManifestFor(publishedAt, sourceDocuments, period);
      const runId = crypto.randomUUID();
      const draft = DraftSchema.parse({ schemaVersion: "1.0", id: crypto.randomUUID(), runId, projectId: project.id, revision: project.currentState.version + 1, baseStateVersion: project.currentState.version, sourceManifest, items: draftItems, staleThesisIds: [], questions, corrections: [], method: { version: 1, focusMetrics: metrics, aliases: {}, focusQuestions: [], preferences: [] } });
      const calculations = buildCalculations(theses, assessments, facts);
      const run: V1RunRecord = { id: runId, kind: "FILING_VERIFICATION", status: "AWAITING_ASSESSMENT_REVIEW", projectId: project.id, filingDocumentId, draft: { ...draft, facts, calculations }, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      await store.saveRun(run);
      res.status(201).json({ runId, status: run.status, projectId: project.id, draft: run.draft });
    } catch (error) { next(error); }
  });

  router.get("/projects", async (_req, res, next) => { try { res.json(await memoryStore.listProjects()); } catch (error) { next(error); } });
  router.get("/projects/:id", async (req, res, next) => { try { const project = await memoryStore.getProject(req.params.id); if (!project) throw statusError("项目不存在", 404); res.json(project); } catch (error) { next(error); } });
  router.get("/projects/:id/state", async (req, res, next) => { try { const project = await memoryStore.getProject(req.params.id); if (!project) throw statusError("项目不存在", 404); res.json(project.currentState); } catch (error) { next(error); } });
  router.get("/projects/:id/history", async (req, res, next) => { try { const project = await memoryStore.getProject(req.params.id); if (!project) throw statusError("项目不存在", 404); res.json(project.history); } catch (error) { next(error); } });
  router.get("/projects/:id/states", async (req, res, next) => { try { const project = await memoryStore.getProject(req.params.id); if (!project) throw statusError("项目不存在", 404); res.json(project.history.map((entry) => ({ version: entry.version, confirmedAt: entry.confirmedAt, diffSummary: entry.diffSummary }))); } catch (error) { next(error); } });
  router.get("/projects/:id/states/:version", async (req, res, next) => { try { const project = await memoryStore.getProject(req.params.id); if (!project) throw statusError("项目不存在", 404); const entry = project.history.find((item) => item.version === req.params.version || item.version === `T${req.params.version}`); if (!entry) throw statusError("研究版本不存在", 404); res.json(entry.state); } catch (error) { next(error); } });

  return router;
}
