import express from "express";
import multer from "multer";
import { createHash, randomUUID } from "node:crypto";
import { computeFinTrustAnalysis } from "../lib/fintrustEngine";
import { initProjects, getAllProjects, getProjectById, saveFullProject, applyResearchUpdate,
  addProjectQuestion, updateProjectQuestion, deleteProjectQuestion, updateResearchThesis } from "./projectRepo";
import { runContinuousAnalysis } from "./continuousAnalyzer";
import { buildResearchContext, researchStateToken } from "./buildResearchContext";
import { ingestMaterial } from "./materialIngestion";
import { demoProjectInput, demoMaterial, runDemoReplay } from "./demoReplay";
import { SAMPLE_T2_MATERIAL, loadCaseInput, getInitialSbgProject } from "./seedData";
import { LocalUploadService, MAX_UPLOAD_BYTES, validateUploadFile, type UploadServiceOptions } from "./documents/uploadService";
import { createV1Router } from "./v1/v1Router";
import type { ResearchModelTransport } from "./researchModel";
import type { ContinuousAnalysisResult, FollowUpQuestion, ProjectState, ResearchThesis, ThesisDelta, ThesisStatus } from "../types/fintrust";

const THESIS_STATUSES: ThesisStatus[] = ["加强", "保持", "削弱", "待评估", "支持", "部分支持", "不足以判断"];
const QUESTION_STATUSES = ["未解决", "部分解决", "已解决"];
const SOURCE_TYPES = ["notes", "annual_report", "quarterly_update", "qualitative_brief"];
const DRAFT_TTL = 60 * 60 * 1000;
function invalid(message: string, statusCode = 400): never { throw Object.assign(new Error(message), { statusCode }); }
function text(value: unknown, label: string, max = 10000, required = false): string {
  if (typeof value !== "string") {
    if (value == null && !required) return "";
    invalid(`${label}必须是文字`);
  }
  if (value.length > max || (required && !value.trim())) invalid(`${label}为空或超出长度限制`);
  return value;
}
function list(value: unknown, label: string, max = 100): any[] {
  if (!Array.isArray(value) || value.length > max) invalid(`${label}格式不正确`);
  return value;
}
function stringIds(value: unknown, allowed: Set<string>): string[] {
  const ids = list(value ?? [], "证据编号");
  if (ids.some((id) => typeof id !== "string" || !allowed.has(id))) invalid("引用了不属于当前项目或草稿的证据");
  return [...new Set(ids)];
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  return JSON.stringify(value);
}
function payloadHash(value: unknown) { return createHash("sha256").update(canonical(value)).digest("hex"); }

function createProject(input: any): ProjectState {
  const company = text(input.company, "公司", 200, true);
  const now = new Date().toISOString();
  const id = `proj_${randomUUID()}`;
  const theses: ResearchThesis[] = list(input.theses, "初始观点", 30).map((t) => {
    const original = text(t.original_view, "初始观点", 10000, true);
    return {
      id: `THESIS_${randomUUID()}`, project_id: id,
      title: text(t.title, "观点标题", 300, true), original_view: original, current_view: original,
      formed_at: now, basis: text(t.basis, "依据"), verification_criteria: text(t.verification_criteria, "验证条件"),
      verification_timeframe: text(t.verification_timeframe, "验证期限", 1000) || "待确定",
      current_status: THESIS_STATUSES.includes(t.current_status) ? t.current_status : "待评估",
      current_reason: text(t.current_reason, "当前理由") || "用户建立的初始研究假设，等待新材料核验。",
      user_revision: text(t.user_revision, "用户修正"), citations: [], updated_at: now, revision_history: [],
    };
  });
  if (!theses.length) invalid("请至少建立一条初始观点");
  const questions: FollowUpQuestion[] = list(input.questions ?? [], "问题", 100).map((q) => ({
    id: `Q_${randomUUID()}`, question_text: text(typeof q === "string" ? q : q.question_text, "问题", 2000, true),
    status: "未解决", created_in_version: "T0", resolved_in_version: null, answer_notes: "", updated_at: now,
  }));
  const notes = text(input.initial_notes, "初始底稿", 200000);
  const document = notes.trim() ? ingestMaterial(id, { title: "T0 初始研究底稿", content: notes, source_type: "notes" }) : null;
  return {
    id, company, ticker: text(input.ticker, "代码", 80), name: text(input.name, "项目名", 300) || `${company} 研究跟踪`,
    summary: text(input.summary, "研究摘要") || "持续跟踪核心观点及未决问题。",
    current_version: "T0", status: "active", created_at: now, updated_at: now, theses,
    documents: document ? [document] : [], open_questions: questions,
    updates: [{ id: `UPDATE_${randomUUID()}`, project_id: id, version: "T0", parent_version: null,
      title: "建立初始研究状态", material_id: document?.id || "", thesis_deltas: theses.map((t) => ({
        thesis_id: t.id, title: t.title, previous_status: "待评估", new_status: t.current_status,
        reason: t.current_reason!, gap_explanation: { observed: "用户录入初始假设", disclosed_reason: "", unverified_hypotheses: t.original_view },
        evidence_ids: [], next_steps: t.verification_criteria, round_assessment: "unresolved",
      })), user_revisions: {}, follow_up_questions: questions, confirmed_at: now, confirmed_by: "用户",
      summary: "建立初始研究假设和后续验证问题。" }],
  };
}

/** Testable API factory: no listener or paid model call during import. */
export async function createApp(options: { analyze?: typeof runContinuousAnalysis; upload?: UploadServiceOptions; modelTransport?: ResearchModelTransport | null } = {}) {
  await initProjects();
  const app = express();
  app.use(express.json({ limit: "4mb" }));
  const drafts = new Map<string, { draft: ContinuousAnalysisResult; created: number }>();
  const analyze = options.analyze || runContinuousAnalysis;
  const uploadService = new LocalUploadService(options.upload);
  const multipartUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: MAX_UPLOAD_BYTES,
      files: 1,
      fields: 5,
      parts: 10,
      fieldSize: 2048,
    },
  });
  const parseMultipartUpload: express.RequestHandler = (req, res, next) => {
    multipartUpload.single("file")(req, res, (error: any) => {
      if (error) {
        if (error.code === "LIMIT_FILE_SIZE") error.statusCode = 413;
        else error.statusCode = 400;
        return next(error);
      }
      next();
    });
  };
  const route = (fn: (req: express.Request, res: express.Response) => any): express.RequestHandler =>
    (req, res, next) => { Promise.resolve().then(() => fn(req, res)).catch(next); };
  const projectFor = async (id: string) => (await getProjectById(id)) || invalid("研究项目不存在", 404);
  app.get("/api/health", (_req, res) => res.json({ status: "ok", server_time: new Date().toISOString(),
    llm_configured: Boolean(process.env.FINTRUST_LLM_API_KEY),
    gemini_configured: false }));
  app.get("/api/projects", route(async (_req, res) => res.json(await getAllProjects())));
  app.get("/api/projects/:id", route(async (req, res) => res.json(await projectFor(req.params.id))));
  app.post("/api/projects", route(async (req, res) => {
    const project = createProject(req.body); await saveFullProject(project); res.status(201).json(project);
  }));
  app.post("/api/demo-project", route(async (_req, res) => {
    const project = createProject(demoProjectInput());
    await saveFullProject(project);
    res.status(201).json(project);
  }));
  app.post("/v1/uploads", parseMultipartUpload, route(async (req, res) => {
    const idempotencyKey = req.get("Idempotency-Key") || "";
    const role = req.body?.role;
    const projectId = req.body?.projectId || null;
    // validateUploadFile also checks the PDF signature and exact byte count;
    // keeping it here gives normal HTTP uploads the same cheap validation as
    // direct service callers.
    validateUploadFile(req.file as any);
    const receipt = await uploadService.upload({
      file: req.file,
      role,
      projectId,
      idempotencyKey,
    });
    res.status(201).json(receipt);
  }));
  app.use("/v1", createV1Router({ uploadService, modelTransport: options.modelTransport }));
  app.get("/api/sample-materials/demo/:version", route((req, res) => res.json(demoMaterial(req.params.version))));
  app.get("/api/projects/:id/context", route(async (req, res) => res.json(buildResearchContext(await projectFor(req.params.id), typeof req.query.targetVersion === "string" ? req.query.targetVersion : undefined))));
  app.post("/api/projects/:id/analyze-material", route(async (req, res) => {
    const project = await projectFor(req.params.id);
    const title = text(req.body.title, "材料标题", 500, true);
    const content = text(req.body.content, "材料正文", 200000, true);
    if (req.body.source_type && !SOURCE_TYPES.includes(req.body.source_type)) invalid("材料类型无效");
    const disclosure_date = text(req.body.disclosure_date, "披露日期", 10);
    if (disclosure_date && !/^\d{4}-\d{2}-\d{2}$/.test(disclosure_date)) invalid("披露日期格式应为 YYYY-MM-DD");
    const stateToken = researchStateToken(project);
    const input = { title, content, source_type: req.body.source_type, disclosure_date };
    const result = req.body.demo_replay === true ? await runDemoReplay(project, input) : await analyze(project, input);
    result.project_id = project.id; result.parent_version = project.current_version; result.state_token = stateToken;
    const now = Date.now();
    for (const [key, entry] of drafts) if (now - entry.created > DRAFT_TTL) drafts.delete(key);
    while (drafts.size >= 100) drafts.delete(drafts.keys().next().value);
    drafts.set(result.draft_id, { draft: structuredClone(result), created: now });
    res.json(result);
  }));

  app.post("/api/projects/:id/update", route(async (req, res) => {
    const current = await projectFor(req.params.id);
    const draftId = text(req.body.draftId, "草稿编号", 200, true);
    const confirmedPayload = { draftId, parentVersion: req.body.parentVersion, deltas: req.body.deltas,
      userRevisions: req.body.userRevisions ?? {}, questions: req.body.questions ?? [] };
    const hash = payloadHash(confirmedPayload);
    const committed = current.updates.find((u) => u.request_id === draftId);
    if (committed) {
      if (committed.payload_hash !== hash) invalid("这份草稿已确认；修改后的内容请重新研究后提交", 409);
      return res.json(current);
    }
    const entry = drafts.get(draftId);
    if (!entry || Date.now() - entry.created > DRAFT_TTL) invalid("草稿已过期或服务已重启，请重新分析材料", 409);
    const draft = entry.draft;
    if (draft.project_id !== current.id) invalid("草稿不属于当前项目", 409);
    if (req.body.parentVersion !== draft.parent_version || researchStateToken(current) !== draft.state_token) invalid("研究状态已改变，请基于最新状态重新分析", 409);
    const evidence = new Set([...current.documents, draft.material].flatMap((d) => d.evidence_snippets.map((s) => s.id)));
    const thesisMap = new Map(current.theses.map((t) => [t.id, t]));
    const seen = new Set<string>();
    const deltas: ThesisDelta[] = list(req.body.deltas, "观点变化", 30).map((d) => {
      const thesis = thesisMap.get(d.thesis_id);
      if (!thesis || seen.has(d.thesis_id)) invalid("观点编号无效或重复");
      seen.add(d.thesis_id);
      if (!THESIS_STATUSES.includes(d.new_status)) invalid("观点状态无效");
      const assessment = d.round_assessment ?? draft.deltas.find((x) => x.thesis_id === d.thesis_id)?.round_assessment;
      if (assessment && !["supported", "weakened", "unresolved", "unchanged"].includes(assessment)) invalid("本轮评估无效");
      return { thesis_id: thesis.id, title: thesis.title, previous_status: thesis.current_status, new_status: d.new_status,
        reason: text(d.reason, "更新理由", 10000, true),
        gap_explanation: { observed: text(d.gap_explanation?.observed, "观察"), disclosed_reason: text(d.gap_explanation?.disclosed_reason, "披露原因"), unverified_hypotheses: text(d.gap_explanation?.unverified_hypotheses, "待验证原因") },
        evidence_ids: stringIds(d.evidence_ids, evidence), next_steps: text(d.next_steps, "下一步"), round_assessment: assessment,
        ...(d.current_view !== undefined ? { current_view: text(d.current_view, "当前观点", 10000, true) } : {}),
      };
    });
    if (seen.size !== thesisMap.size) invalid("请确认所有现有观点后再保存");
    const rawRevisions = req.body.userRevisions ?? {};
    if (!rawRevisions || typeof rawRevisions !== "object" || Array.isArray(rawRevisions)) invalid("用户修正格式不正确");
    const revisions: Record<string, string> = {};
    for (const [id, value] of Object.entries(rawRevisions)) {
      if (!thesisMap.has(id)) invalid("用户修正引用了未知观点");
      revisions[id] = text(value, "用户修正");
    }
    const questions: FollowUpQuestion[] = list(req.body.questions ?? draft.questions_update, "后续问题").map((q) => {
      if (!QUESTION_STATUSES.includes(q.status)) invalid("问题状态无效");
      const old = current.open_questions.find((oldQ) => oldQ.id === q.id);
      const id = old?.id || (draft.questions_update.some((d) => d.id === q.id) ? q.id : `Q_${randomUUID()}`);
      return { id, question_text: text(q.question_text, "问题", 2000, true), status: q.status,
        created_in_version: old?.created_in_version || draft.version, resolved_in_version: q.status === "已解决" ? draft.version : null,
        answer_notes: text(q.answer_notes, "问题回答"), updated_at: new Date().toISOString(), evidence_ids: stringIds(q.evidence_ids, evidence) };
    });
    if (new Set(questions.map((q) => q.id)).size !== questions.length) invalid("问题编号重复");
    const updated = await applyResearchUpdate(current.id, draft.version, draft.parent_version,
      draft.material.title, draft.material.content, deltas, revisions, questions, draft.material.evidence_snippets, {
        document: draft.material, summary: draft.overall_summary, original_deltas: draft.deltas, claims: draft.claims,
        tool_trace: draft.tool_trace, request_id: draftId, payload_hash: hash, expected_state_token: draft.state_token,
      });
    res.json(updated);
  }));
  app.put("/api/projects/:id/theses/:thesisId", route(async (req, res) => {
    const allowed: Partial<ResearchThesis> = {};
    for (const key of ["title", "basis", "current_view", "current_reason", "user_revision", "verification_criteria", "verification_timeframe"] as const) {
      if (req.body[key] !== undefined) allowed[key] = text(req.body[key], key, 10000);
    }
    if (req.body.current_status !== undefined) {
      if (!THESIS_STATUSES.includes(req.body.current_status)) invalid("观点状态无效");
      allowed.current_status = req.body.current_status;
    }
    res.json(await updateResearchThesis(req.params.id, req.params.thesisId, allowed));
  }));
  app.post("/api/projects/:id/questions", route(async (req, res) => {
    const project = await projectFor(req.params.id);
    const question: FollowUpQuestion = { id: `Q_${randomUUID()}`, question_text: text(req.body.question_text, "问题", 2000, true),
      status: "未解决", created_in_version: project.current_version, resolved_in_version: null,
      answer_notes: text(req.body.answer_notes, "回答"), updated_at: new Date().toISOString() };
    res.json(await addProjectQuestion(project.id, question));
  }));
  app.put("/api/projects/:id/questions/:questionId", route(async (req, res) => {
    const edits: Partial<FollowUpQuestion> = {};
    if (req.body.question_text !== undefined) edits.question_text = text(req.body.question_text, "问题", 2000, true);
    if (req.body.answer_notes !== undefined) edits.answer_notes = text(req.body.answer_notes, "回答");
    if (req.body.status !== undefined) {
      if (!QUESTION_STATUSES.includes(req.body.status)) invalid("问题状态无效");
      edits.status = req.body.status;
    }
    res.json(await updateProjectQuestion(req.params.id, req.params.questionId, edits));
  }));
  app.delete("/api/projects/:id/questions/:questionId", route(async (req, res) => res.json(await deleteProjectQuestion(req.params.id, req.params.questionId))));
  app.get("/api/projects/:id/export", route(async (req, res) => res.json({ export_version: "3.0", exported_at: new Date().toISOString(), project: await projectFor(req.params.id) })));
  app.post("/api/projects/import", route(async (req, res) => {
    const project = req.body.project as ProjectState;
    if (!project || typeof project.id !== "string" || !/^T\d+$/.test(project.current_version)) invalid("快照格式无效");
    for (const field of ["theses", "documents", "updates", "open_questions"] as const) list(project[field], field, 10000);
    if (project.theses.some((t) => t.project_id !== project.id) || project.documents.some((d) => d.project_id !== project.id)) invalid("快照包含其他项目的数据");
    await saveFullProject(project);
    res.json({ success: true, project_id: project.id });
  }));
  app.post("/api/projects/reset-default", route(async (_req, res) => {
    const project = getInitialSbgProject(); await saveFullProject(project); res.json({ success: true, project });
  }));
  app.get("/api/sample-materials/t2", (_req, res) => res.json(SAMPLE_T2_MATERIAL));
  app.get("/api/case-inputs/:caseId", (req, res) => {
    const files = { default: "project/data/showcases/sbg_fy2025/case_input.json", sbg_fy2025: "project/data/showcases/sbg_fy2025/case_input.json", alternate_test_case: "project/tests/fixtures/alternate_case_input.json" };
    const file = files[req.params.caseId]; const input = file ? loadCaseInput(file) : null;
    if (!input) return res.status(404).json({ error: "示例不存在" });
    res.json(input);
  });
  app.post("/api/analyze", route((req, res) => {
    if (!req.body?.case || !Array.isArray(req.body.facts)) invalid("缺少公司或财务数据");
    res.json(computeFinTrustAnalysis(req.body));
  }));
  app.use("/api", (_req, res) => res.status(404).json({ error: "接口不存在" }));
  app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.statusCode || error.status || 500).json({ error: error.message || "操作失败，请重试" });
  });
  return app;
}
