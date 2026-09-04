import { Router } from "express";
import crypto from "node:crypto";
import Decimal from "decimal.js";
import { z } from "zod";
import { V1Store, type V1ProjectRecord, type V1RunRecord } from "./v1Store";
import { LocalUploadService } from "../documents/uploadService";
import { ThesisExtractor } from "../documents/thesisExtractor";
import { FactExtractor } from "../facts/factExtractor";
import { MetricRegistry } from "../facts/metricRegistry";
import { ResearchAgent } from "../agent/researchAgent";
import { DiffGenerator } from "../memory/diffGenerator";
import { createConfiguredResearchModelTransport } from "../researchModel";
import {
  ConditionSchema,
  DraftSchema,
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
  if (sourceEvidenceIds.some((id: string) => !allowedEvidenceIds.has(id))) throw statusError("观点引用了不属于当前研报的证据", 400);
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
      } else metrics.add(condition.metric);
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

function evidenceIdsFromModel(item: any, spans: EvidenceSpan[]): UUID[] {
  const ids: string[] = [];
  const indices = Array.isArray(item?.evidenceIndices) ? item.evidenceIndices : Array.isArray(item?.spanIndices) ? item.spanIndices : [];
  for (const index of indices) if (Number.isInteger(index) && spans[index]) ids.push(spans[index].id);
  if (Array.isArray(item?.evidenceIds)) for (const id of item.evidenceIds) if (spans.some((span) => span.id === id)) ids.push(id);
  return [...new Set(ids)];
}

const SemanticReviewSchema = z.object({
  items: z.array(z.object({
    thesisId: z.string(),
    disclosedCauses: z.array(z.object({ text: z.string().trim().min(1), attribution: z.enum(["MANAGEMENT_EXPLANATION", "DISCLOSED_FACT"]).default("DISCLOSED_FACT"), evidenceIndices: z.array(z.number().int().nonnegative()).default([]), evidenceIds: z.array(z.string()).default([]) })).default([]),
    hypotheses: z.array(z.object({ text: z.string().trim().min(1), supportingEvidenceIds: z.array(z.string()).default([]), supportingEvidenceIndices: z.array(z.number().int().nonnegative()).default([]), missingEvidence: z.array(z.string()).default([]) })).default([]),
    nextQuestions: z.array(z.object({ text: z.string().trim().min(1), requiredEvidence: z.string().default("相关定期财务报表及附注") })).default([]),
  })).max(30),
});

const SUBMIT_FILING_REVIEW_TOOL = {
  name: "submit_filing_review",
  description: "提交财报核验补充信息，包含各观点的已披露原因、待验证假设和下一步问题",
  parameters: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            thesisId: { type: "string" },
            disclosedCauses: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  text: { type: "string" },
                  attribution: { type: "string", enum: ["MANAGEMENT_EXPLANATION", "DISCLOSED_FACT"] },
                  evidenceIndices: { type: "array", items: { type: "integer" } },
                },
                required: ["text"],
              },
            },
            hypotheses: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  text: { type: "string" },
                  supportingEvidenceIndices: { type: "array", items: { type: "integer" } },
                  missingEvidence: { type: "array", items: { type: "string" } },
                },
                required: ["text"],
              },
            },
            nextQuestions: {
              type: "array",
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

async function addSemanticReviews(assessments: Map<string, ThesisAssessment>, theses: ThesisRevision[], filingSpans: EvidenceSpan[], modelTransport: ReturnType<typeof createConfiguredResearchModelTransport>): Promise<void> {
  if (!modelTransport || theses.length === 0) return;
  const needsSemantic = theses.some((thesis) => {
    const assessment = assessments.get(thesis.thesisId);
    return thesis.type === "CAUSAL" || thesis.type === "QUALITATIVE" || Boolean(assessment && ["WEAKENED", "PARTIALLY_SUPPORTED", "UNRESOLVED"].includes(assessment.status));
  });
  if (!needsSemantic) return;
  const evidenceText = filingSpans.filter((span) => span.quote.trim()).slice(0, 40).map((span, index) => `[SPAN_${index}] ${span.quote.slice(0, 700)}`).join("\n");
  const thesisText = theses.map((thesis) => `${thesis.thesisId}: ${thesis.text}`).join("\n");
  try {
    const response = await modelTransport.complete({
      messages: [{ role: "user", content: `仅依据给出的财报片段，调用 submit_filing_review 工具为每条观点补充已披露原因、待验证假设和下一步问题。不能补造数字或公司事实；没有证据的原因不要输出。\n观点：\n${thesisText}\n财报片段：\n${evidenceText}` }],
      tools: [SUBMIT_FILING_REVIEW_TOOL],
      tool_choice: { type: "function", function: { name: "submit_filing_review" } },
      max_tokens: 6000,
    });
    let rawPayload: unknown;
    const reviewCall = response.message.tool_calls?.find((call) => call.name === "submit_filing_review");
    if (reviewCall && reviewCall.arguments && Object.keys(reviewCall.arguments).length > 0) {
      rawPayload = reviewCall.arguments;
    } else if (response.message.content) {
      rawPayload = parseModelJson(response.message.content);
    }
    if (!rawPayload) return;
    const parsed = SemanticReviewSchema.parse(rawPayload);
    const thesisById = new Map(theses.map((thesis) => [thesis.thesisId, thesis]));
    for (const item of parsed.items) {
      const current = assessments.get(item.thesisId);
      if (!current || !thesisById.has(item.thesisId)) continue;
      const disclosedCauses = item.disclosedCauses.flatMap((cause) => {
        const evidenceIds = evidenceIdsFromModel(cause, filingSpans);
        return evidenceIds.length ? [{ text: cause.text, evidenceIds, factIds: current.factIds, calculationIds: current.calculationIds, attribution: cause.attribution }] : [];
      });
      const hypotheses = item.hypotheses.map((hypothesis) => ({ text: hypothesis.text, supportingEvidenceIds: [...new Set([...hypothesis.supportingEvidenceIds.filter((id) => filingSpans.some((span) => span.id === id)), ...hypothesis.supportingEvidenceIndices.map((index) => filingSpans[index]?.id).filter((id): id is UUID => Boolean(id))])], missingEvidence: hypothesis.missingEvidence }));
      const nextQuestions = item.nextQuestions.map((question) => ({ id: crypto.randomUUID(), thesisId: item.thesisId, text: question.text, requiredEvidence: question.requiredEvidence, triggerPeriod: null, status: "OPEN" as const, answer: null }));
      assessments.set(item.thesisId, ThesisAssessmentSchema.parse({ ...current, disclosedCauses, hypotheses, nextQuestions: nextQuestions.length ? nextQuestions : current.nextQuestions }));
    }
  } catch {
    // Semantic reasons are optional; never substitute unreferenced or sample data.
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

export function createV1Router(options: { store?: V1Store; uploadService?: LocalUploadService } = {}): Router {
  const router = Router();
  const store = options.store || new V1Store();
  const uploadService = options.uploadService || new LocalUploadService();
  const thesisExtractor = new ThesisExtractor();
  const factExtractor = new FactExtractor();
  const researchAgent = new ResearchAgent(new MetricRegistry());
  const diffGenerator = new DiffGenerator();

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
      let transport: ReturnType<typeof createConfiguredResearchModelTransport> = null;
      try { transport = createConfiguredResearchModelTransport(); } catch { transport = null; }
      const extracted = await thesisExtractor.extractTheses(spans, transport || undefined);
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
        await store.saveProject(project);
        await store.saveRun({ ...run, status: "COMPLETED", projectId, draft: { ...(run.draft || {}), confirmedTheses: revisions }, updated_at: now });
        return res.json({ projectId, version: "T0", status: "COMPLETED", project, state });
      }

      const targetProjectId = isUuid(req.body?.projectId) ? req.body.projectId : run.projectId;
      if (!targetProjectId) throw statusError("缺少 projectId", 400);
      const project = await store.getProject(targetProjectId);
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
        const judgment = userJudgments[oldThesis.thesisId] ?? edit?.userJudgment ?? item.userJudgment ?? null;
        if (judgment !== null && judgment !== item.userJudgment) corrections.push(UserCorrectionSchema.parse({ id: crypto.randomUUID(), thesisId: oldThesis.thesisId, type: "USER_JUDGMENT", action: "SET", before: item.userJudgment, after: String(judgment), reason: "用户保存本轮独立判断", baseStateVersion: project.currentState.version, createdAt: new Date().toISOString() }));
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
      if (filingDoc && !project.documents.some((document) => document.id === filingDoc.document.id)) project.documents.push({ id: filingDoc.document.id, role: filingDoc.document.role, fileName: filingDoc.document.fileName, sha256: filingDoc.document.sha256, period: filingDoc.document.period, publishedAt: filingDoc.document.publishedAt });
      project.corrections = [...(project.corrections || []), ...corrections];
      project.history.push({ version: nextVersionLabel, confirmedAt: now, state: nextState, diffSummary: `${oldVersion} → ${nextVersionLabel} 财报核验确认；保存 ${corrections.length} 条用户修正`, corrections });
      await store.saveProject(project);
      await store.saveRun({ ...run, status: "COMPLETED", projectId: project.id, draft: { ...draft, corrections }, updated_at: now });
      return res.json({ projectId: project.id, version: nextVersionLabel, status: "COMPLETED", project, state: nextState });
    } catch (error) { next(error); }
  });

  router.post("/projects/:id/filing-runs", async (req, res, next) => {
    try {
      const project = await store.getProject(req.params.id);
      if (!project) throw statusError("项目不存在", 404);
      if (!project.currentState) throw statusError("项目尚未形成初始研究状态", 409);
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
      const facts = factExtractor.extractFactsFromSpans(filingSpans, { companyId: project.id, documentId: filingDocumentId, period, publishedAt, metrics, scope });
      const assessments = new Map<string, ThesisAssessment>();
      for (const thesis of theses) assessments.set(thesis.thesisId, await researchAgent.assessThesis(thesis, { spans: filingSpans, facts, calculations: [] }, { runId: crypto.randomUUID(), companyId: project.id, asOf: publishedAt, allowedDocumentIds: [filingDocumentId] }));
      let transport: ReturnType<typeof createConfiguredResearchModelTransport> = null;
      try {
        transport = createConfiguredResearchModelTransport();
        await addSemanticReviews(assessments, theses, filingSpans, transport);
      } catch (err) {
        console.warn("[v1Router] Semantic review skipped due to transport error:", err);
      }
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

  router.get("/projects", async (_req, res, next) => { try { res.json(await store.getProjects()); } catch (error) { next(error); } });
  router.get("/projects/:id", async (req, res, next) => { try { const project = await store.getProject(req.params.id); if (!project) throw statusError("项目不存在", 404); res.json(project); } catch (error) { next(error); } });
  router.get("/projects/:id/state", async (req, res, next) => { try { const project = await store.getProject(req.params.id); if (!project) throw statusError("项目不存在", 404); res.json(project.currentState); } catch (error) { next(error); } });
  router.get("/projects/:id/history", async (req, res, next) => { try { const project = await store.getProject(req.params.id); if (!project) throw statusError("项目不存在", 404); res.json(project.history); } catch (error) { next(error); } });
  router.get("/projects/:id/states", async (req, res, next) => { try { const project = await store.getProject(req.params.id); if (!project) throw statusError("项目不存在", 404); res.json(project.history.map((entry) => ({ version: entry.version, confirmedAt: entry.confirmedAt, diffSummary: entry.diffSummary }))); } catch (error) { next(error); } });
  router.get("/projects/:id/states/:version", async (req, res, next) => { try { const project = await store.getProject(req.params.id); if (!project) throw statusError("项目不存在", 404); const entry = project.history.find((item) => item.version === req.params.version || item.version === `T${req.params.version}`); if (!entry) throw statusError("研究版本不存在", 404); res.json(entry.state); } catch (error) { next(error); } });

  return router;
}
