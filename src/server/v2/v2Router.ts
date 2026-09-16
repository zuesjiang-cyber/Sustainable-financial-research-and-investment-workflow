import { Router } from "express";
import crypto from "node:crypto";
import { BACKGROUND_LIMITS, DEEP_LIMITS, FAST_LIMITS, type V2Project, type V2Run } from "../../shared/v2Domain";
import { LocalUploadService } from "../documents/uploadService";
import { V2Store } from "./v2Store";
import { SqliteJobQueue } from "./jobQueue";
import { ResearchEngine } from "./researchEngine";
import { CninfoDisclosureClient } from "./disclosures";
import { TavilyClient } from "./tavily";
import { BudgetGuard } from "./budget";
import { createRoleTransports, probeOpenRouterModels, type RoleTransports } from "./modelRoles";
import { ReplayService } from "./replay";
import { exportProjectMarkdown } from "./markdownExport";
import { importLegacyProjects } from "./legacyImport";
import { calculateFinancialMetrics } from "../researchTools";
import type { ResearchModelTransport } from "../researchModel";

function statusError(message: string, statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

function payloadHash(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export interface V2RouterOptions {
  store?: V2Store;
  queue?: SqliteJobQueue;
  uploadService?: LocalUploadService;
  modelTransport?: ResearchModelTransport | null;
  roles?: RoleTransports;
  fetchImpl?: typeof fetch;
  disclosures?: CninfoDisclosureClient;
  tavily?: TavilyClient;
  disableWorker?: boolean;
}

export function createV2Runtime(options: V2RouterOptions = {}) {
  const store = options.store || new V2Store();
  const queue = options.queue || new SqliteJobQueue();
  const roles = options.roles || createRoleTransports({ override: options.modelTransport, fetch: options.fetchImpl });
  const disclosures = options.disclosures || new CninfoDisclosureClient(options.fetchImpl);
  const tavily = options.tavily || new TavilyClient(process.env.TAVILY_API_KEY, options.fetchImpl);
  const budget = new BudgetGuard(store);
  const engine = new ResearchEngine({
    store,
    disclosures,
    tavily,
    upload: options.uploadService,
    roles,
    fetchImpl: options.fetchImpl,
    budget,
  });
  const replay = new ReplayService(store);
  return { store, queue, engine, replay, budget, roles, disclosures, tavily };
}

export function createV2Router(options: V2RouterOptions = {}): Router {
  const router = Router();
  const { store, queue, engine, replay, budget, roles } = createV2Runtime(options);
  const uploadService = options.uploadService || new LocalUploadService();

  const wrap = (fn: (req: any, res: any) => Promise<unknown> | unknown): import("express").RequestHandler =>
    (req, res, next) => { Promise.resolve(fn(req, res)).catch(next); };

  router.get("/health", wrap(async (_req, res) => {
    const settings = await store.getSettings();
    res.json({
      status: "ok",
      product: "fintrust-v2",
      llm_configured: settings.llmConfigured,
      tavily_configured: settings.tavilyConfigured,
      models: settings.models,
      budget: { spentCny: settings.spentCny, monthlyBudgetCny: settings.monthlyBudgetCny, reservedCny: settings.reservedCny },
    });
  }));

  router.get("/settings", wrap(async (_req, res) => res.json(await store.getSettings())));
  router.patch("/settings", wrap(async (req, res) => {
    const patch: Record<string, unknown> = {};
    if (typeof req.body?.monthlyBudgetCny === "number" && req.body.monthlyBudgetCny > 0) patch.monthlyBudgetCny = req.body.monthlyBudgetCny;
    res.json(await store.saveSettings(patch));
  }));

  router.get("/models/probe", wrap(async (_req, res) => {
    const probe = await probeOpenRouterModels(options.fetchImpl);
    const wanted = [...new Set([...Object.values(roles).map((item) => item?.model || ""), "openai/gpt-5.6-luna", "openai/gpt-5.6-sol", "deepseek/deepseek-v4-pro-0813", "openai/gpt-6-astra"])];
    res.json({
      availableWanted: wanted.filter((id) => id && probe.available.includes(id)),
      catalogSize: probe.available.length,
      notes: probe.notes.length ? probe.notes : probe.available.length === 0 ? ["未完成真实模型目录连通"] : ["目录已获取，具体角色模型以环境变量锁定"],
    });
  }));

  router.post("/research", wrap(async (req, res) => {
    const idempotencyKey = String(req.get("Idempotency-Key") || req.body?.idempotencyKey || "");
    const payload = {
      text: typeof req.body?.text === "string" ? req.body.text : "",
      url: typeof req.body?.url === "string" ? req.body.url : "",
      documentId: typeof req.body?.documentId === "string" ? req.body.documentId : "",
      projectId: typeof req.body?.projectId === "string" ? req.body.projectId : "",
      question: typeof req.body?.question === "string" ? req.body.question : "",
    };
    if (!payload.text && !payload.url && !payload.documentId) throw statusError("请提供文字、链接或已上传文档", 400);
    if (payload.text.length > 50_000) throw statusError("输入过长", 400);
    const hash = payloadHash(payload);
    if (idempotencyKey.length >= 8) {
      const existing = await store.getIdempotent(idempotencyKey, hash);
      if (existing === "conflict") throw statusError("Idempotency-Key 已用于不同请求", 409);
      if (existing) return res.status(201).json(existing);
    }
    const tracked = await store.trackedLiveCount();
    const settings = await store.getSettings();
    if (!payload.projectId && tracked >= settings.maxTrackedCompanies) {
      throw statusError(`默认最多同时跟踪 ${settings.maxTrackedCompanies} 家已识别公司`, 409);
    }
    const { project, run } = await engine.startResearch({
      text: payload.text || undefined,
      url: payload.url || undefined,
      documentId: payload.documentId || undefined,
      projectId: payload.projectId || undefined,
      question: payload.question || undefined,
    });
    await queue.enqueue({
      kind: "BACKGROUND",
      dedupeKey: `bg:${run.id}`,
      payload: { runId: run.id, projectId: project.id },
    });
    const body = { projectId: project.id, runId: run.id, status: run.status, project, run };
    if (idempotencyKey.length >= 8) await store.saveIdempotent(idempotencyKey, hash, body);
    res.status(201).json(body);
  }));

  router.get("/runs/:id", wrap(async (req, res) => {
    const run = await store.getRun(req.params.id);
    if (!run) throw statusError("任务不存在", 404);
    res.json(run);
  }));

  router.get("/runs/:id/events", wrap(async (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    let cursor = 0;
    let closed = false;
    req.on("close", () => { closed = true; });
    const send = async () => {
      const run = await store.getRun(req.params.id);
      if (!run) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: "任务不存在" })}\n\n`);
        res.end();
        return true;
      }
      for (const event of run.events.filter((item) => item.seq > cursor)) {
        cursor = event.seq;
        res.write(`event: progress\ndata: ${JSON.stringify(event)}\n\n`);
      }
      res.write(`event: state\ndata: ${JSON.stringify({ status: run.status, preliminary: run.preliminary, coverage: run.coverage, resultSummary: run.resultSummary })}\n\n`);
      if (run.status === "COMPLETED" || run.status === "FAILED" || run.status === "BUDGET_PAUSED") {
        res.write(`event: done\ndata: ${JSON.stringify({ status: run.status })}\n\n`);
        res.end();
        return true;
      }
      return false;
    };
    if (await send()) return;
    const timer = setInterval(async () => {
      if (closed) {
        clearInterval(timer);
        return;
      }
      try {
        if (await send()) clearInterval(timer);
      } catch {
        clearInterval(timer);
        res.end();
      }
    }, 600);
  }));

  router.get("/projects", wrap(async (_req, res) => {
    const projects = await store.listProjects(false);
    res.json(projects.map(summarizeProject));
  }));

  router.get("/projects/:id", wrap(async (req, res) => {
    const project = await store.getProject(req.params.id);
    if (!project) throw statusError("项目不存在", 404);
    const runs = await store.listRuns(project.id);
    const notifications = await store.listNotifications(project.id);
    res.json({ ...project, runs, notifications });
  }));

  router.post("/projects/:id/messages", wrap(async (req, res) => {
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!text) throw statusError("请提供用户原话", 400);
    const project = await engine.applyUserMessage(req.params.id, text, req.body?.undoMessageId);
    res.json({
      project,
      stanceChange: project.messages.at(-1)?.parsedStanceChange || null,
      undone: Boolean(req.body?.undoMessageId),
    });
  }));

  router.post("/projects/:id/research-runs", wrap(async (req, res) => {
    const kind = req.body?.kind === "DEEP" ? "DEEP" : "BACKGROUND";
    const project = await store.getProject(req.params.id);
    if (!project) throw statusError("项目不存在", 404);
    const paid = await budget.canStartPaidTask(0.5);
    if (!paid.ok) throw statusError(paid.reason || "预算不足", 402);
    const createdAt = new Date().toISOString();
    const limits = kind === "DEEP" ? DEEP_LIMITS : BACKGROUND_LIMITS;
    const run: V2Run = {
      id: crypto.randomUUID(),
      projectId: project.id,
      kind,
      status: "QUEUED",
      parentRunId: null,
      idempotencyKey: null,
      input: { text: "", url: null, documentId: null, question: typeof req.body?.question === "string" ? req.body.question : null },
      preliminary: null,
      modelCalls: 0,
      documentsRead: 0,
      limits: { ...limits },
      coverage: { official: "NOT_STARTED", external: "NOT_STARTED", notes: [] },
      error: null,
      createdAt,
      updatedAt: createdAt,
      completedAt: null,
      events: [{ seq: 1, at: createdAt, phase: "queued", message: kind === "DEEP" ? "深入研究已排队" : "手动检查已排队" }],
      resultSummary: null,
    };
    await store.saveRun(run);
    await queue.enqueue({ kind, dedupeKey: `${kind}:${run.id}`, payload: { runId: run.id, projectId: project.id } });
    res.status(201).json({ runId: run.id, kind, status: run.status });
  }));

  router.patch("/projects/:id/monitoring", wrap(async (req, res) => {
    const project = await store.getProject(req.params.id);
    if (!project) throw statusError("项目不存在", 404);
    if (typeof req.body?.enabled === "boolean") project.monitoring.enabled = req.body.enabled;
    if (typeof req.body?.earlyLeadAlerts === "boolean") project.monitoring.earlyLeadAlerts = req.body.earlyLeadAlerts;
    if (typeof req.body?.browserNotify === "boolean") project.monitoring.browserNotify = req.body.browserNotify;
    if (typeof req.body?.officialEveryMinutes === "number" && req.body.officialEveryMinutes >= 5) project.monitoring.officialEveryMinutes = req.body.officialEveryMinutes;
    await store.saveProject(project);
    res.json(project.monitoring);
  }));

  router.post("/projects/:id/company", wrap(async (req, res) => {
    const project = await store.getProject(req.params.id);
    if (!project) throw statusError("项目不存在", 404);
    const name = String(req.body?.name || "").trim();
    const securityCode = String(req.body?.securityCode || "").trim();
    if (!name || !/^[0-9]{6}$/.test(securityCode)) throw statusError("请选择有效公司与六位证券代码", 400);
    project.company = { name, securityCode, exchange: securityCode.startsWith("6") ? "SSE" : "SZSE" };
    project.identityStatus = "IDENTIFIED";
    project.title = `${name} 持续研究`;
    project.monitoring.enabled = !project.isReplay;
    await store.saveProject(project);
    res.json(project);
  }));

  router.get("/evidence/:id", wrap(async (req, res) => {
    const projects = await store.listProjects(true);
    for (const project of projects) {
      const evidence = project.evidence.find((item) => item.id === req.params.id);
      if (!evidence) continue;
      const events = project.events.filter((item) => item.evidenceIds.includes(evidence.id));
      const analyses = project.analyses.filter((item) => item.evidenceIds.includes(evidence.id));
      return res.json({ evidence, events, analyses, projectId: project.id });
    }
    throw statusError("证据不存在", 404);
  }));

  router.get("/notifications", wrap(async (req, res) => {
    const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
    res.json(await store.listNotifications(projectId));
  }));

  router.post("/notifications/:id/read", wrap(async (req, res) => {
    const item = await store.markRead(req.params.id);
    if (!item) throw statusError("提醒不存在", 404);
    res.json(item);
  }));

  router.get("/replays", wrap((_req, res) => res.json(replay.list().map((item) => ({ id: item.id, asOf: item.asOf, summary: item.summary, company: item.company })))));
  router.post("/replays/:id/start", wrap(async (req, res) => res.status(201).json(await replay.start(req.params.id))));

  router.post("/import/legacy", wrap(async (_req, res) => res.json(await importLegacyProjects(store))));

  router.post("/projects/:id/export", wrap(async (req, res) => {
    const project = await store.getProject(req.params.id);
    if (!project) throw statusError("项目不存在", 404);
    const file = await exportProjectMarkdown(project);
    res.json({ file, markdown: true });
  }));

  router.post("/tools/calculate", wrap(async (req, res) => {
    // Deterministic calculator reused from existing research tools. Callers must
    // supply project-local evidence; this endpoint never invents operands.
    throw statusError("请在研究任务内通过证据绑定的计算工具执行，避免脱离原文的估值", 400);
  }));

  void uploadService;
  void FAST_LIMITS;
  void calculateFinancialMetrics;

  return router;
}

function summarizeProject(project: V2Project) {
  return {
    id: project.id,
    title: project.title,
    company: project.company,
    identityStatus: project.identityStatus,
    summary: project.summary,
    updatedAt: project.updatedAt,
    stance: project.currentStance?.summary || null,
    unverifiedLeads: project.leads.filter((item) => item.status === "OPEN").length,
    monitoring: project.monitoring.enabled,
    isReplay: project.isReplay,
  };
}
