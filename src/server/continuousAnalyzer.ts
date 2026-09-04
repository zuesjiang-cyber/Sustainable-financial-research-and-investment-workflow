import { createHash, randomUUID } from "node:crypto";
import * as contextModule from "./buildResearchContext";
import {
  completeWithTransport,
  createConfiguredResearchModelTransport,
  getTransportModel,
  getTransportProvider,
  type ResearchModelMessage,
  type ResearchModelResponse,
  type ResearchModelToolCall,
  type ResearchModelTransportLike,
  type ResearchModelRequest,
} from "./researchModel";
import {
  executeResearchTool,
  isFinancialCalculationResult,
  listProjectEvidence,
  RESEARCH_TOOL_DEFINITIONS,
  type FinancialCalculationResult,
  type ResearchToolContext,
  type ResearchToolName,
} from "./researchTools";
import { ingestMaterial, type MaterialInput } from "./materialIngestion";
import { validateResearchClaims, type ClaimVerificationResult } from "./claimVerification";
import type {
  AnalysisMeta,
  ContinuousAnalysisResult as SharedContinuousAnalysisResult,
  FollowUpQuestion,
  ProjectState,
  ResearchClaim,
  ResearchDocument,
  ResearchToolTrace,
  ThesisDelta,
  ThesisStatus,
} from "../types/fintrust";

/** Backwards-compatible import path for callers that imported this result here. */
export type ContinuousAnalysisResult = SharedContinuousAnalysisResult;

export interface ContinuousMaterialInput extends MaterialInput {
  /** Accepted for old callers, but intentionally ignored by server ingestion. */
  snippets?: unknown;
}

export interface ContinuousAnalysisOptions {
  /** Injectable only by tests or a caller explicitly supplying a transport. */
  transport?: ResearchModelTransportLike;
  /** Alias retained for consumers that call this a model transport. */
  modelTransport?: ResearchModelTransportLike;
  /** Alias retained for simple fixture functions. */
  model?: ResearchModelTransportLike;
  maxRequests?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  now?: () => Date;
}

interface RawDraft {
  deltas: unknown[];
  questions_update: unknown[];
  new_questions: unknown[];
  claims: unknown[];
  overall_summary: string;
}

interface ModelRunState {
  messages: ResearchModelMessage[];
  traces: ResearchToolTrace[];
  calculations: Map<string, FinancialCalculationResult>;
  requestCount: number;
  retryCount: number;
  inputTokens?: number;
  outputTokens?: number;
}

const DEFAULT_MAX_REQUESTS = 6;
const DEFAULT_TIMEOUT_MS = 45_000;
const MAX_TIMEOUT_MS = 120_000;
const MAX_PROMPT_CHARS = 40_000;
const MAX_TOOL_RESULT_CHARS = 16_000;

function configuredNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function nextVersion(currentVersion: string): string {
  const match = String(currentVersion || "").match(/^T(\d+)$/i);
  const number = match ? Number(match[1]) : 0;
  return "T" + String(number + 1);
}

function boundedText(value: unknown, limit: number): string {
  return String(value == null ? "" : value).trim().slice(0, limit);
}

function safeNow(options: ContinuousAnalysisOptions): Date {
  const supplied = options.now && options.now();
  return supplied instanceof Date && !Number.isNaN(supplied.getTime()) ? supplied : new Date();
}

function modelExecutionMode(provider: string): AnalysisMeta["execution_mode"] {
  if (provider === "gemini") return "real_gemini";
  if (provider === "openai_compatible") return "real_openai_compatible";
  return "test_fixture";
}

function hashState(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function fallbackStateToken(project: ProjectState): string {
  return hashState({
    project_id: project.id,
    current_version: project.current_version,
    theses: (project.theses || []).map((thesis) => ({
      id: thesis.id,
      current_status: thesis.current_status,
      current_reason: thesis.current_reason || "",
      current_view: thesis.current_view || "",
      user_revision: thesis.user_revision || "",
      verification_criteria: thesis.verification_criteria,
      citations: thesis.citations || [],
    })),
    questions: (project.open_questions || []).map((question) => ({
      id: question.id,
      status: question.status,
      answer_notes: question.answer_notes,
      evidence_ids: question.evidence_ids || [],
    })),
    documents: (project.documents || []).map((document) => ({
      id: document.id,
      disclosure_date: document.disclosure_date,
    })),
    updates: (project.updates || []).map((update) => ({
      id: update.id,
      version: update.version,
      user_revisions: update.user_revisions || {},
      follow_up_questions: update.follow_up_questions || [],
    })),
  });
}

function stateToken(project: ProjectState): string {
  const tokenFn = (contextModule as unknown as {
    researchStateToken?: (state: ProjectState) => string;
  }).researchStateToken;
  if (typeof tokenFn === "function") {
    try {
      const token = tokenFn(project);
      if (typeof token === "string" && token) return token;
    } catch {
      // Use the local deterministic fallback with older context modules.
    }
  }
  return fallbackStateToken(project);
}

function jsonForModel(value: unknown, limit = MAX_TOOL_RESULT_CHARS): string {
  let encoded: string;
  try {
    encoded = JSON.stringify(value);
  } catch {
    encoded = JSON.stringify({ error: "unserializable tool result" });
  }
  return encoded.length > limit ? encoded.slice(0, limit) + "…" : encoded;
}

function materialIndex(material: ResearchDocument): string {
  return material.evidence_snippets.map((snippet) => {
    const location = snippet.page === null
      ? "lines " + String(snippet.line_start == null ? "?" : snippet.line_start) + "-" + String(snippet.line_end == null ? "?" : snippet.line_end)
      : "page " + String(snippet.page);
    return "- evidence_id=" + snippet.id + "; " + location + "; chars=" + String(snippet.text.length);
  }).join("\n");
}

function buildResearchPrompt(
  context: ReturnType<typeof contextModule.buildResearchContext>,
  material: ResearchDocument,
  nextVer: string
): string {
  const prompt = [
    "你是一个受约束的持续投研 Agent。你的任务是维护已有研究状态，而不是生成脱离证据的长报告。",
    "",
    context.prompt_context_text,
    "",
    "=== 本轮新增材料索引（服务端生成，尚未确认入库） ===",
    "材料：" + material.title,
    "材料类型：" + material.source_type + "；披露日期：" + (material.disclosure_date || "未知"),
    "文档 id：" + material.id,
    "可用原文 evidence_id：",
    materialIndex(material) || "（材料没有可检索的非空片段）",
    "",
    "=== 强制执行规则 ===",
    "1. 先围绕已有观点和未解决问题调用 search_project_documents；需要逐字原文时调用 read_document；数字同比、比例、毛利率或条件比较必须调用 calculate_financial_metrics。",
    "2. 工具返回的 evidence_id、原文和计算结果是唯一可引用依据。不要创造 id、页码、数字或 quote；模型解释不能作为证据。",
    "3. 新材料没有直接证据时，保持上一轮 current status，round_assessment 必须为 unresolved；绝不把“未披露/尚未说明”当成已解决或反向证据。",
    "4. “未来可能改善”不等于“已经改善”；否定句、预测、管理层预期、用户假设和已实现事实必须分开。",
    "5. 逐项填写 gap_explanation：observed 必须对应本轮原文，disclosed_reason 只写材料明确披露的原因，unverified_hypotheses 只写待验证解释。",
    "6. 至少返回一个 claims 项，使用 verified evidence_id 与逐字 quote。source 是材料事实，calculated 是工具计算，inference 是基于事实的推断，不能冒充 source。",
    "7. 输出下一步问题不能替代工具执行；若依据不足，提出具体指标/材料缺口并保留问题未解决。",
    "",
    "只输出 JSON（不加 Markdown 包裹），结构：",
    "{",
    "  \"claims\": [{\"id\":\"C1\",\"thesis_id\":\"...\",\"claim_text\":\"...\",\"kind\":\"source|calculated|inference\",\"evidence_ids\":[\"...\"],\"quote\":\"逐字原文\",\"calculation_id\":\"可选\"}],",
    "  \"deltas\": [{\"thesis_id\":\"...\",\"new_status\":\"支持|部分支持|加强|保持|削弱|不足以判断|待评估\",\"round_assessment\":\"supported|weakened|unresolved|unchanged\",\"reason\":\"...\",\"gap_explanation\":{\"observed\":\"...\",\"disclosed_reason\":\"...\",\"unverified_hypotheses\":\"...\"},\"evidence_ids\":[\"...\"],\"current_view\":\"可选\",\"next_steps\":\"...\"}],",
    "  \"questions_update\": [{\"id\":\"...\",\"status\":\"未解决|部分解决|已解决\",\"answer_notes\":\"...\",\"evidence_ids\":[\"...\"]}],",
    "  \"new_questions\": [{\"question_text\":\"...\",\"status\":\"未解决\"}],",
    "  \"overall_summary\":\"...\"",
    "}",
    "本轮目标版本：" + nextVer + "。",
  ].join("\n");
  return prompt.slice(0, MAX_PROMPT_CHARS);
}

function cleanJsonText(text: string): string {
  const fence = String.fromCharCode(96) + String.fromCharCode(96) + String.fromCharCode(96);
  const cleaned = text.replace(new RegExp(fence + "(?:json)?", "gi"), "").replace(new RegExp(fence, "g"), "").trim();
  try {
    JSON.parse(cleaned);
    return cleaned;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    return start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  }
}

function parseDraft(text: string): RawDraft {
  const parsed = JSON.parse(cleanJsonText(text)) as Record<string, unknown>;
  if (!parsed || typeof parsed !== "object") throw new Error("Model draft must be a JSON object");
  const list = (value: unknown): unknown[] => Array.isArray(value) ? value.slice(0, 100) : [];
  return {
    deltas: list(parsed.deltas),
    questions_update: list(parsed.questions_update),
    new_questions: list(parsed.new_questions || parsed.questions),
    claims: list(parsed.claims),
    overall_summary: boundedText(parsed.overall_summary, 2_000),
  };
}

function responseText(response: ResearchModelResponse): string {
  return boundedText(response && response.message && response.message.content, 30_000);
}

function responseToolCalls(response: ResearchModelResponse): ResearchModelToolCall[] {
  return response && response.message && Array.isArray(response.message.tool_calls)
    ? response.message.tool_calls
    : [];
}

function abortError(signal?: AbortSignal): Error {
  return signal && signal.aborted
    ? new Error("Continuous research analysis was aborted")
    : new Error("Model request timed out");
}

async function completeWithTimeout(
  transport: ResearchModelTransportLike,
  request: ResearchModelRequest,
  timeoutMs: number,
  parentSignal?: AbortSignal
): Promise<ResearchModelResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onParentAbort = () => controller.abort();
  if (parentSignal) parentSignal.addEventListener("abort", onParentAbort, { once: true });
  try {
    return await completeWithTransport(transport, request, { signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw abortError(parentSignal);
    throw error;
  } finally {
    clearTimeout(timer);
    if (parentSignal) parentSignal.removeEventListener("abort", onParentAbort);
  }
}

function makeTrace(
  tool: string,
  args: Record<string, unknown>,
  result: unknown,
  status: "ok" | "error",
  startedAt: number
): ResearchToolTrace {
  return {
    id: "TRACE_" + randomUUID(),
    tool,
    arguments: args,
    result,
    status,
    duration_ms: Math.max(0, Date.now() - startedAt),
  };
}

async function runAgentLoop(
  transport: ResearchModelTransportLike,
  toolContext: ResearchToolContext,
  initialPrompt: string,
  options: ContinuousAnalysisOptions,
  maxRequests: number
): Promise<{ draft: RawDraft; state: ModelRunState }> {
  const state: ModelRunState = {
    messages: [
      {
        role: "system",
        content: "你是 FinTrust 持续研究 Agent。只使用项目内工具返回的证据，不展示内部思维链，最后输出严格 JSON。",
      },
      { role: "user", content: initialPrompt },
    ],
    traces: [],
    calculations: new Map(),
    requestCount: 0,
    retryCount: 0,
  };
  let formatRetry = false;
  let toolUsageRetry = false;
  let verificationRetry = false;

  while (state.requestCount < maxRequests) {
    if (options.signal && options.signal.aborted) {
      throw new Error("Continuous research analysis was aborted");
    }
    const request: ResearchModelRequest = {
      messages: state.messages,
      tools: RESEARCH_TOOL_DEFINITIONS,
      max_tokens: 8_000,
    };
    const response = await completeWithTimeout(
      transport,
      request,
      Math.max(100, Math.min(options.timeoutMs || configuredNumber("FINTRUST_MODEL_TIMEOUT_MS", DEFAULT_TIMEOUT_MS), MAX_TIMEOUT_MS)),
      options.signal
    );
    state.requestCount += 1;
    if (response.usage && response.usage.input_tokens !== undefined) {
      state.inputTokens = (state.inputTokens || 0) + response.usage.input_tokens;
    }
    if (response.usage && response.usage.output_tokens !== undefined) {
      state.outputTokens = (state.outputTokens || 0) + response.usage.output_tokens;
    }

    const calls = responseToolCalls(response);
    const text = responseText(response);
    if (calls.length > 0) {
      state.messages.push({ role: "assistant", content: text || undefined, tool_calls: calls });
      for (const call of calls.slice(0, 8)) {
        const startedAt = Date.now();
        let result: unknown;
        let status: "ok" | "error" = "ok";
        try {
          result = await executeResearchTool(call.name as ResearchToolName, call.arguments, toolContext);
          if (isFinancialCalculationResult(result)) {
            state.calculations.set(result.calculation_id, result);
          }
        } catch (error) {
          status = "error";
          result = { error: String(error instanceof Error ? error.message : error) };
        }
        state.traces.push(makeTrace(call.name, call.arguments, result, status, startedAt));
        state.messages.push({
          role: "tool",
          name: call.name,
          tool_call_id: call.id,
          content: jsonForModel(result),
        });
      }
      continue;
    }

    if (!text) {
      if (!formatRetry && state.requestCount < maxRequests) {
        formatRetry = true;
        state.retryCount += 1;
        state.messages.push({ role: "assistant", content: "" });
        state.messages.push({
          role: "user",
          content: "请将上轮结果改为严格 JSON 对象，只返回约定的 claims、deltas、questions_update、new_questions、overall_summary 字段。",
        });
        continue;
      }
      throw new Error("Model returned neither a tool call nor a JSON draft");
    }

    let draft: RawDraft;
    try {
      draft = parseDraft(text);
    } catch (error) {
      if (!formatRetry && state.requestCount < maxRequests) {
        formatRetry = true;
        state.retryCount += 1;
        state.messages.push({ role: "assistant", content: text });
        state.messages.push({
          role: "user",
          content: "上轮输出不是有效 JSON（" + String(error instanceof Error ? error.message : error) + "）。请仅返回符合 schema 的 JSON，不要 Markdown。",
        });
        continue;
      }
      throw new Error("Model JSON draft validation failed: " + String(error instanceof Error ? error.message : error));
    }

    // A draft without a tool result is not considered a researched update.
    // Ask the model to retrieve at least once while budget remains instead of
    // silently accepting an unsupported keyword-based conclusion.
    if (state.traces.length === 0 && !toolUsageRetry && state.requestCount < maxRequests) {
      toolUsageRetry = true;
      state.retryCount += 1;
      state.messages.push({ role: "assistant", content: text });
      state.messages.push({
        role: "user",
        content: "这轮草稿没有实际工具证据。请先调用 search_project_documents，并在必要时 read_document/calculate_financial_metrics，再输出更新 JSON；不能凭关键词或记忆判断。",
      });
      continue;
    }

    const validation = validateResearchClaims(draft.claims, toolContext, state.calculations);
    if (validation.invalid_claim_ids.length > 0 && !verificationRetry && state.requestCount < maxRequests) {
      verificationRetry = true;
      state.retryCount += 1;
      state.messages.push({ role: "assistant", content: text });
      state.messages.push({ role: "user", content: validation.retry_feedback });
      continue;
    }
    return { draft, state };
  }

  throw new Error("Model request budget exhausted (" + String(maxRequests) + ") before a draft was returned");
}

function statusFromRaw(value: unknown): ThesisStatus | null {
  const raw = String(value || "").trim().toLowerCase();
  const aliases: Record<string, ThesisStatus> = {
    "支持": "支持",
    supported: "支持",
    "部分支持": "部分支持",
    "加强": "加强",
    strengthened: "加强",
    "保持": "保持",
    unchanged: "保持",
    maintained: "保持",
    "削弱": "削弱",
    weakened: "削弱",
    "待评估": "待评估",
    "不足以判断": "不足以判断",
    unresolved: "不足以判断",
  };
  return aliases[raw] || null;
}

function assessmentFromRaw(raw: Record<string, unknown>): ThesisDelta["round_assessment"] {
  const direct = String(raw.round_assessment || "").trim().toLowerCase();
  if (direct === "supported" || direct === "weakened" || direct === "unresolved" || direct === "unchanged") {
    return direct;
  }
  const status = statusFromRaw(raw.new_status || raw.status);
  if (status === "支持" || status === "部分支持" || status === "加强") return "supported";
  if (status === "削弱") return "weakened";
  if (status === "保持") return "unchanged";
  return "unresolved";
}

function rawEvidenceIds(raw: Record<string, unknown>): string[] {
  const values = Array.isArray(raw.evidence_ids)
    ? raw.evidence_ids
    : raw.evidence_id
    ? [raw.evidence_id]
    : [];
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean))).slice(0, 20);
}

function claimsForThesis(claims: ResearchClaim[], thesisId: string): ResearchClaim[] {
  return claims.filter((claim) => claim.thesis_id === thesisId);
}

function currentEvidenceIds(toolContext: ResearchToolContext): Set<string> {
  return new Set(
    listProjectEvidence(toolContext)
      .filter((item) => item.document_id === toolContext.material.id)
      .map((item) => item.evidence_id)
  );
}

function approvedClaimsForThesis(
  claims: ResearchClaim[],
  thesisId: string,
  currentEvidence: Set<string>
): ResearchClaim[] {
  return claimsForThesis(claims, thesisId).filter(
    (claim) =>
      claim.verification === "verified" &&
      claim.evidence_ids.some((evidenceId) => currentEvidence.has(evidenceId))
  );
}

function mergeEvidenceIds(values: string[], known: Set<string>): string[] {
  return Array.from(new Set(values.filter((value) => known.has(value)))).slice(0, 30);
}

function gapFromRaw(
  raw: Record<string, unknown>,
  approvedClaims: ResearchClaim[],
  assessment: ThesisDelta["round_assessment"]
): ThesisDelta["gap_explanation"] {
  const gap = raw.gap_explanation && typeof raw.gap_explanation === "object"
    ? raw.gap_explanation as Record<string, unknown>
    : {};
  const quoteText = approvedClaims.map((claim) => claim.quote || "").filter(Boolean).join("；");
  return {
    observed: assessment === "unresolved"
      ? "本轮没有通过核验的直接事实。"
      : boundedText(gap.observed, 1_200) || quoteText || "本轮材料提供了可核验片段。",
    disclosed_reason: assessment === "unresolved"
      ? "本轮材料未提供足以完成该项判断的明确披露原因。"
      : boundedText(gap.disclosed_reason, 1_200) || "材料未明确披露原因。",
    unverified_hypotheses: boundedText(gap.unverified_hypotheses, 1_200) || "仍需后续材料或专项指标验证。",
  };
}

function buildDeltas(
  project: ProjectState,
  draft: RawDraft,
  claims: ResearchClaim[],
  toolContext: ResearchToolContext,
  nextVer: string
): ThesisDelta[] {
  const rawByThesis = new Map<string, Record<string, unknown>>();
  draft.deltas.forEach((entry) => {
    if (!entry || typeof entry !== "object") return;
    const raw = entry as Record<string, unknown>;
    const thesisId = String(raw.thesis_id || raw.pillar_id || "").trim();
    if (thesisId && !rawByThesis.has(thesisId)) rawByThesis.set(thesisId, raw);
  });
  const knownEvidence = new Set(listProjectEvidence(toolContext).map((item) => item.evidence_id));
  const currentEvidence = currentEvidenceIds(toolContext);

  return project.theses.map((thesis) => {
    const raw = rawByThesis.get(thesis.id) || {};
    const proposedAssessment = assessmentFromRaw(raw);
    const approved = approvedClaimsForThesis(claims, thesis.id, currentEvidence);
    const hasEvidence = approved.length > 0;
    const assessment: ThesisDelta["round_assessment"] = hasEvidence ? proposedAssessment : "unresolved";
    const proposedStatus = statusFromRaw(raw.new_status || raw.status);
    const newStatus = assessment === "supported" || assessment === "weakened"
      ? proposedStatus || thesis.current_status
      : thesis.current_status;
    const evidenceIds = mergeEvidenceIds(
      approved.flatMap((claim) => claim.evidence_ids).concat(rawEvidenceIds(raw)),
      currentEvidence
    );
    const reason = assessment === "unresolved"
      ? "本轮材料未提供足以改变【" + thesis.title + "】的经核验新证据，保留上一轮状态【" + thesis.current_status + "】。"
      : boundedText(raw.reason, 2_000) ||
        "本轮经核验事实对【" + thesis.title + "】形成" + (assessment === "supported" ? "支持" : "削弱") + "。";
    const currentView = assessment === "unresolved" ? "" : boundedText(raw.current_view, 2_000);
    return {
      thesis_id: thesis.id,
      title: thesis.title,
      previous_status: thesis.current_status,
      new_status: newStatus,
      reason,
      gap_explanation: gapFromRaw(raw, approved, assessment),
      evidence_ids: evidenceIds,
      next_steps: boundedText(raw.next_steps, 1_500) ||
        "围绕“" + (thesis.verification_criteria || thesis.title) + "”继续补充本项目原始材料。",
      round_assessment: assessment,
      ...(currentView ? { current_view: currentView } : {}),
    };
  });
}

function questionStatus(value: unknown): FollowUpQuestion["status"] | null {
  const raw = String(value || "").trim();
  if (raw === "未解决" || raw.toLowerCase() === "unresolved") return "未解决";
  if (raw === "部分解决" || raw.toLowerCase() === "partially_resolved") return "部分解决";
  if (raw === "已解决" || raw.toLowerCase() === "resolved") return "已解决";
  return null;
}

function questionEvidence(
  raw: Record<string, unknown>,
  toolContext: ResearchToolContext,
  claims: ResearchClaim[]
): string[] {
  const known = new Set(listProjectEvidence(toolContext).map((item) => item.evidence_id));
  const explicit = mergeEvidenceIds(rawEvidenceIds(raw), known);
  if (explicit.length > 0) return explicit;
  const thesisId = String(raw.thesis_id || "").trim();
  return mergeEvidenceIds(
    claims
      .filter((claim) => claim.thesis_id === thesisId && claim.verification === "verified")
      .flatMap((claim) => claim.evidence_ids),
    known
  );
}

function buildQuestions(
  project: ProjectState,
  draft: RawDraft,
  claims: ResearchClaim[],
  toolContext: ResearchToolContext,
  nextVer: string,
  now: string
): FollowUpQuestion[] {
  const updates = new Map<string, Record<string, unknown>>();
  draft.questions_update.forEach((entry) => {
    if (!entry || typeof entry !== "object") return;
    const raw = entry as Record<string, unknown>;
    const id = String(raw.id || "").trim();
    if (id) updates.set(id, raw);
  });

  const questions = (project.open_questions || []).map((question) => {
    const raw = updates.get(question.id);
    if (!raw) return question;
    const proposed = questionStatus(raw.status);
    const evidenceIds = questionEvidence(raw, toolContext, claims);
    const answer = boundedText(raw.answer_notes, 2_000);
    const saysNotDisclosed = /尚未披露|未披露|暂无披露|没有披露/.test(answer);
    if (!proposed || (proposed !== "未解决" && evidenceIds.length === 0) || (proposed === "已解决" && saysNotDisclosed)) {
      return question;
    }
    return {
      ...question,
      status: proposed,
      resolved_in_version: proposed === "已解决" ? nextVer : question.resolved_in_version,
      answer_notes: answer || question.answer_notes,
      updated_at: now,
      ...(evidenceIds.length > 0 ? { evidence_ids: evidenceIds } : {}),
    };
  });

  const existingTexts = new Set(questions.map((question) => question.question_text));
  for (const entry of draft.new_questions.slice(0, 20)) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as Record<string, unknown>;
    const text = boundedText(raw.question_text || raw.text, 1_000);
    if (!text || existingTexts.has(text)) continue;
    existingTexts.add(text);
    questions.push({
      id: "Q_" + randomUUID(),
      question_text: text,
      status: "未解决",
      created_in_version: nextVer,
      resolved_in_version: null,
      answer_notes: "",
      updated_at: now,
      evidence_ids: [],
    });
  }
  return questions;
}

function noModelDeltas(project: ProjectState, reason: string): ThesisDelta[] {
  return project.theses.map((thesis) => ({
    thesis_id: thesis.id,
    title: thesis.title,
    previous_status: thesis.current_status,
    new_status: thesis.current_status,
    reason: "本轮未完成模型证据核验，保留上一轮状态【" + thesis.current_status + "】。" + reason,
    gap_explanation: {
      observed: "尚未产生经工具核验的本轮事实。",
      disclosed_reason: "本轮材料未被可用研究模型完成核验。",
      unverified_hypotheses: "需要配置或恢复研究模型后，核验：" + (thesis.verification_criteria || thesis.title) + "。",
    },
    evidence_ids: [],
    next_steps: "配置研究模型并围绕“" + (thesis.verification_criteria || thesis.title) + "”重新分析。",
    round_assessment: "unresolved",
  }));
}

function draftWithoutModel(
  project: ProjectState,
  material: ResearchDocument,
  parentVersion: string,
  token: string,
  startTime: number,
  executionMode: AnalysisMeta["execution_mode"],
  modelName: string,
  errorMessage?: string
): ContinuousAnalysisResult {
  return {
    draft_id: "DRAFT_" + randomUUID(),
    project_id: project.id,
    parent_version: parentVersion,
    state_token: token,
    version: nextVersion(parentVersion),
    material_title: material.title,
    material,
    deltas: noModelDeltas(project, errorMessage ? "原因：" + errorMessage : "待配置研究模型。"),
    questions_update: [...(project.open_questions || [])],
    overall_summary: errorMessage
      ? "本轮材料已接收，但研究模型请求失败，未生成支持/削弱结论；当前已确认状态和未决问题均保留。可修复配置后重试。"
      : "本轮材料已接收，研究模型尚未配置，未自动生成支持/削弱结论；当前已确认状态和未决问题均保留。",
    claims: [],
    tool_trace: [],
    analysis_meta: {
      model_name: modelName,
      llm_calls: 0,
      latency_ms: Date.now() - startTime,
      retry_count: 0,
      execution_mode: executionMode,
      ...(errorMessage ? { error_message: errorMessage } : {}),
    },
  };
}

function finaliseDraft(
  project: ProjectState,
  material: ResearchDocument,
  context: ReturnType<typeof contextModule.buildResearchContext>,
  draft: RawDraft,
  run: ModelRunState,
  transport: ResearchModelTransportLike,
  startTime: number,
  now: Date
): ContinuousAnalysisResult {
  const toolContext: ResearchToolContext = { project, material };
  const verification: ClaimVerificationResult = validateResearchClaims(draft.claims, toolContext, run.calculations);
  const claims = verification.claims;
  const version = context.target_version;
  const deltas = buildDeltas(project, draft, claims, toolContext, version);
  const questions = buildQuestions(project, draft, claims, toolContext, version, now.toISOString());
  const verifiedCount = claims.filter((claim) => claim.verification === "verified").length;
  const summary = verifiedCount > 0
    ? (draft.overall_summary || "本轮已完成 " + version + " 连续研究草稿。") +
      "（" + String(verifiedCount) + " 条主张通过来源/计算核验；其余主张保留为待验证或矛盾。）"
    : "本轮没有主张通过来源/计算核验，未改变已确认观点状态；请根据工具缺口补充材料后重试。";
  const provider = getTransportProvider(transport);
  const metadata: AnalysisMeta = {
    model_name: getTransportModel(transport),
    llm_calls: run.requestCount,
    latency_ms: Date.now() - startTime,
    retry_count: run.retryCount,
    execution_mode: modelExecutionMode(provider),
  };
  const withUsage = metadata as AnalysisMeta & { input_tokens?: number; output_tokens?: number };
  if (run.inputTokens !== undefined) withUsage.input_tokens = run.inputTokens;
  if (run.outputTokens !== undefined) withUsage.output_tokens = run.outputTokens;

  return {
    draft_id: "DRAFT_" + randomUUID(),
    project_id: project.id,
    parent_version: project.current_version,
    state_token: stateToken(project),
    version,
    material_title: material.title,
    material,
    deltas,
    questions_update: questions,
    overall_summary: summary,
    claims,
    tool_trace: run.traces,
    analysis_meta: metadata,
  };
}

/**
 * Run one bounded, tool-using continuous research pass.
 * It creates a draft only; confirmation/update is performed by the caller.
 */
export async function runContinuousAnalysis(
  project: ProjectState,
  newMaterial: ContinuousMaterialInput,
  options: ContinuousAnalysisOptions = {}
): Promise<ContinuousAnalysisResult> {
  if (!project || !project.id) throw new Error("Continuous analysis requires a project");
  const startTime = Date.now();
  const parentVersion = project.current_version;
  const material = ingestMaterial(project.id, {
    title: newMaterial.title,
    content: newMaterial.content,
    source_type: newMaterial.source_type,
    disclosure_date: newMaterial.disclosure_date,
  });
  const context = contextModule.buildResearchContext(project, nextVersion(parentVersion));
  const toolContext: ResearchToolContext = { project, material };
  const selectedTransport = options.transport || options.modelTransport || options.model;
  const transport = selectedTransport || createConfiguredResearchModelTransport();

  if (!transport) {
    return draftWithoutModel(
      project,
      material,
      parentVersion,
      stateToken(project),
      startTime,
      "manual_review",
      "未配置 Ling/Gemini 研究模型"
    );
  }

  const rawMax = Number(options.maxRequests || configuredNumber("FINTRUST_MAX_MODEL_CALLS", DEFAULT_MAX_REQUESTS));
  const maxRequests = Math.max(1, Math.min(12, Number.isFinite(rawMax) ? Math.floor(rawMax) : DEFAULT_MAX_REQUESTS));
  const prompt = buildResearchPrompt(context, material, context.target_version);
  try {
    const run = await runAgentLoop(transport, toolContext, prompt, options, maxRequests);
    return finaliseDraft(project, material, context, run.draft, run.state, transport, startTime, safeNow(options));
  } catch (error) {
    return draftWithoutModel(
      project,
      material,
      parentVersion,
      stateToken(project),
      startTime,
      "degraded_error",
      getTransportModel(transport),
      String(error instanceof Error ? error.message : error)
    );
  }
}
