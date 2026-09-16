import crypto from "node:crypto";
import type {
  EvidenceRecord,
  MaterialView,
  PreliminaryJudgment,
  V2Notification,
  V2Project,
  V2Run,
  V2RunKind,
} from "../../shared/v2Domain";
import { BACKGROUND_LIMITS, DEEP_LIMITS, FAST_LIMITS } from "../../shared/v2Domain";
import { identifyCompanies, resolveIdentity } from "./companyCatalog";
import { classifyUserInput, createStanceVersion, extractMaterialViews } from "./stance";
import { canonicalOrigin, hashText, uniqueOriginEvidence } from "./verification";
import type { V2Store } from "./v2Store";
import type { CninfoDisclosureClient } from "./disclosures";
import type { TavilyClient } from "./tavily";
import { fetchPublicPage } from "./webFetch";
import type { LocalUploadService } from "../documents/uploadService";
import { completeWithTransport } from "../researchModel";
import type { RoleTransports } from "./modelRoles";
import { BudgetGuard, estimateModelCny } from "./budget";
import { applyVerifiedAnalyses, maybeDailyDigest, runModelAgent, runScriptedAgent, type BackgroundMode } from "./agentLoop";
import type { AgentContext } from "./agentTools";

export interface EngineDeps {
  store: V2Store;
  disclosures: CninfoDisclosureClient;
  tavily: TavilyClient;
  upload?: LocalUploadService;
  roles: RoleTransports;
  fetchImpl?: typeof fetch;
  budget: BudgetGuard;
  clock?: () => Date;
}

function now(clock?: () => Date): string {
  return (clock?.() || new Date()).toISOString();
}

function emptyCoverage(): V2Run["coverage"] {
  return { official: "NOT_STARTED", external: "NOT_STARTED", notes: [] };
}

function makeEvidence(input: Omit<EvidenceRecord, "id" | "rawHash" | "originKey"> & { originKey?: string }): EvidenceRecord {
  const rawHash = hashText(`${input.title}\n${input.quote}\n${input.url || ""}`);
  return {
    ...input,
    id: crypto.randomUUID(),
    rawHash,
    originKey: input.originKey || canonicalOrigin(input.url, input.title, input.quote),
  };
}

export class ResearchEngine {
  constructor(private readonly deps: EngineDeps) {}

  private clock(): string {
    return now(this.deps.clock);
  }

  async startResearch(input: {
    text?: string;
    url?: string;
    documentId?: string;
    projectId?: string;
    kind?: V2RunKind;
    question?: string;
    isReplay?: boolean;
  }): Promise<{ project: V2Project; run: V2Run }> {
    const createdAt = this.clock();
    let body = String(input.text || "").trim();
    if (input.url) {
      try {
        const page = await fetchPublicPage(input.url, this.deps.fetchImpl);
        body = [body, `来源 ${page.url}`, page.title, page.text.slice(0, 6000)].filter(Boolean).join("\n");
      } catch (error) {
        body = [body, `链接获取失败：${error instanceof Error ? error.message : String(error)}`].filter(Boolean).join("\n");
      }
    }
    if (input.documentId && this.deps.upload) {
      const spans = await this.deps.upload.getSpans(input.documentId);
      if (spans?.length) body = [body, ...spans.slice(0, 40).map((span) => span.quote)].join("\n");
    }

    const candidates = identifyCompanies(body);
    const identity = resolveIdentity(candidates);
    let project = input.projectId ? await this.deps.store.getProject(input.projectId) : null;
    if (!project) {
      project = this.deps.store.emptyProject({
        company: identity.company,
        companyCandidates: candidates,
        identityStatus: identity.status,
        title: identity.company ? `${identity.company.name} 持续研究` : body.slice(0, 36) || "新研究",
        isReplay: Boolean(input.isReplay),
        monitoring: {
          enabled: identity.status === "IDENTIFIED" && !input.isReplay,
          officialEveryMinutes: 30,
          externalEveryHours: 12,
          earlyLeadAlerts: false,
          browserNotify: false,
          lastOfficialCheckAt: null,
          lastExternalCheckAt: null,
          lastOfficialSuccessAt: null,
          lastExternalSuccessAt: null,
          lastDigestAt: null,
        },
      });
    } else if (identity.status === "IDENTIFIED" && !project.company) {
      project = { ...project, company: identity.company, identityStatus: "IDENTIFIED", companyCandidates: candidates };
    }

    const classification = classifyUserInput(String(input.text || body));
    const message = {
      id: crypto.randomUUID(),
      rawText: String(input.text || body).slice(0, 20_000),
      createdAt,
      parsedStanceChange: classification.endorsed ? classification.summary : null,
      undone: false,
    };
    project.messages = [...project.messages, message];

    const userEvidence = makeEvidence({
      projectId: project.id,
      sourceKind: input.documentId ? "USER_PDF" : input.url ? "USER_URL" : "USER_TEXT",
      title: input.url || "用户输入",
      url: input.url || null,
      documentId: input.documentId || null,
      quote: body.slice(0, 1800),
      occurredAt: null,
      disclosedAt: null,
      discoveredAt: createdAt,
      parentOriginKey: null,
      companyName: project.company?.name || null,
      securityCode: project.company?.securityCode || null,
      page: null,
      bbox: null,
      reprintOf: null,
      quality: "EXTRACT",
    });
    project.evidence = uniqueOriginEvidence([...project.evidence, userEvidence]);

    if (classification.endorsed) {
      const stance = createStanceVersion({
        rawText: String(input.text || ""),
        classification,
        previous: project.currentStance,
        changeReason: project.currentStance ? "用户新表达" : "首次表达",
        now: createdAt,
      });
      if (stance) {
        project.currentStance = stance;
        project.stanceHistory = [...project.stanceHistory, stance];
      }
    } else {
      const views = extractMaterialViews(String(input.text || body), userEvidence.id);
      const material: MaterialView[] = views.map((view) => ({
        id: crypto.randomUUID(),
        author: view.author,
        sourceEvidenceId: userEvidence.id,
        text: view.text,
        publishedAt: null,
        observationScope: "用户粘贴材料，不代表用户认可",
        endorsedByUser: false,
      }));
      project.materialViews = [...project.materialViews, ...material];
    }

    const kind: V2RunKind = input.kind || "FAST";
    const limits = kind === "DEEP" ? DEEP_LIMITS : kind === "BACKGROUND" ? BACKGROUND_LIMITS : FAST_LIMITS;
    const run: V2Run = {
      id: crypto.randomUUID(),
      projectId: project.id,
      kind,
      status: "RUNNING",
      parentRunId: null,
      idempotencyKey: null,
      input: { text: String(input.text || ""), url: input.url || null, documentId: input.documentId || null, question: input.question || null },
      preliminary: null,
      modelCalls: 0,
      documentsRead: input.url || input.documentId ? 1 : 0,
      limits: { ...limits },
      coverage: emptyCoverage(),
      error: null,
      createdAt,
      updatedAt: createdAt,
      completedAt: null,
      events: [{ seq: 1, at: createdAt, phase: "accepted", message: "已创建可恢复研究任务" }],
      resultSummary: null,
    };

    const preliminary = await this.buildPreliminary(project, body, run);
    run.preliminary = preliminary;
    run.status = "PARTIAL";
    run.events.push({ seq: run.events.length + 1, at: this.clock(), phase: "preliminary", message: "已生成初步判断，后台仍在核实" });
    project.summary = preliminary.headline;
    await this.deps.store.commitResearchUpdate({ project, run });
    return { project, run };
  }

  private async buildPreliminary(project: V2Project, body: string, run: V2Run): Promise<PreliminaryJudgment> {
    const generatedAt = this.clock();
    const transport = this.deps.roles.fast;
    const openQuestions = [
      project.identityStatus !== "IDENTIFIED" ? "公司证券身份尚未唯一确认，自动跟踪暂缓" : "",
      "关键依据是否来自官方披露原文？",
      "是否存在直接反证或重大遗漏？",
    ].filter(Boolean);

    if (transport && run.modelCalls < run.limits.modelCalls) {
      try {
        const started = Date.now();
        const response = await completeWithTransport(transport, {
          messages: [{
            role: "user",
            content: [
              "你是投研助手。只根据用户输入做初步判断，不要编造未出现的数字、阈值或公司事实。",
              "若材料是转发研报且用户未表态，明确写：未形成用户立场。",
              "输出简短中文：观点概括、初步判断、正在核实的问题。不要把计划写成已完成。",
              `用户原话：${body.slice(0, 6000)}`,
              `已识别公司：${project.company ? `${project.company.name} ${project.company.securityCode}` : project.companyCandidates.map((c) => c.name).join(" / ") || "未识别"}`,
              `用户立场：${project.currentStance?.summary || "无"}`,
            ].join("\n"),
          }],
          tools: [],
          max_tokens: 700,
        });
        run.modelCalls += 1;
        await this.deps.budget.settle(
          await this.deps.budget.reserve("MODEL", estimateModelCny(800, 400), run.id, transport.model),
          {
            inputTokens: response.usage?.input_tokens || 0,
            outputTokens: response.usage?.output_tokens || 0,
            latencyMs: Date.now() - started,
            estimatedCny: estimateModelCny(response.usage?.input_tokens || 0, response.usage?.output_tokens || 0),
            model: transport.model,
            runId: run.id,
          },
        );
        const content = response.message.content || "";
        return {
          headline: content.split("\n").find((line) => line.trim())?.slice(0, 120) || "已记录输入，待核实",
          summary: content.slice(0, 1200),
          supported: [],
          needsRevision: [],
          unverified: ["初步判断中的新信息尚未核验"],
          openQuestions,
          modelUsed: transport.model,
          generatedAt,
        };
      } catch (error) {
        run.coverage.notes.push(`快速模型调用失败：${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const forwarded = !project.currentStance && project.materialViews.length > 0;
    const headline = forwarded
      ? "已记录材料观点，未形成用户立场"
      : project.currentStance
        ? `已记录用户立场：${project.currentStance.summary}`
        : project.company
          ? `已接收关于 ${project.company.name} 的材料，待核实`
          : "已接收研究材料，公司身份待确认";
    return {
      headline,
      summary: forwarded
        ? "用户转发或粘贴了外部材料，系统将其保存为材料观点，不会写成用户持有的立场。"
        : project.currentStance
          ? "已保存用户原话。系统可以提出证据挑战，但不会编造用户未写明的推翻阈值。"
          : "含义不够明确，已原样保存输入，不改写为投资立场。",
      supported: [],
      needsRevision: [],
      unverified: body.trim() ? ["用户提供的新信息尚未经官方原文核验"] : [],
      openQuestions,
      modelUsed: null,
      generatedAt,
    };
  }

  async runBackground(runId: string, mode: BackgroundMode = "BACKGROUND"): Promise<V2Run> {
    const run = await this.deps.store.getRun(runId);
    if (!run) throw new Error("Run 不存在");
    const project = await this.deps.store.getProject(run.projectId);
    if (!project) throw new Error("项目不存在");
    run.status = "RUNNING";
    run.events.push({ seq: run.events.length + 1, at: this.clock(), phase: "background", message: mode === "DEEP" ? "开始围绕最大缺口的深入研究" : "开始工具链后台研究" });

    const paid = await this.deps.budget.canStartPaidTask(0.4);
    if (!paid.ok) {
      run.status = "BUDGET_PAUSED";
      run.coverage.notes.push(paid.reason || "预算不足");
      run.resultSummary = "预算已暂停新的收费检索，已保存内容仍可查看。";
      await this.deps.store.commitResearchUpdate({ project, run });
      return run;
    }

    const ctx: AgentContext = {
      project,
      run,
      disclosures: this.deps.disclosures,
      tavily: this.deps.tavily,
      upload: this.deps.upload,
      fetchImpl: this.deps.fetchImpl || fetch,
      clock: this.deps.clock || (() => new Date()),
      newEvents: [],
      notes: { completed: [], unresolved: [], supported: [], needsRevision: [] },
      persist: async () => {
        await this.deps.store.saveRun(run);
      },
    };

    await runScriptedAgent(ctx, mode);
    if (mode === "DEEP" || mode === "BACKGROUND") {
      await runModelAgent(ctx, {
        store: this.deps.store,
        roles: this.deps.roles,
        budget: this.deps.budget,
        clock: this.deps.clock || (() => new Date()),
      });
    }

    if (run.coverage.official === "FAILED") {
      await this.deps.store.recordCheck({
        projectId: project.id,
        kind: "OFFICIAL",
        status: "FAILED",
        coverage: "FAILED",
        notes: run.coverage.notes.join("；") || "官方披露检查失败",
        startedAt: run.createdAt,
        finishedAt: this.clock(),
      });
    }

    const notifications: V2Notification[] = [];
    for (const event of ctx.newEvents) {
      if (event.stage !== "CORRECTED") continue;
      const previous = project.events.filter((prior) => prior.originKey === event.originKey && prior.id !== event.id);
      for (const prior of previous) {
        prior.verification = "CORRECTED";
        event.correctionOf = prior.id;
        const wasNotified = (await this.deps.store.listNotifications(project.id)).some((note) => note.eventIds.includes(prior.id) && !note.correctionOf);
        if (wasNotified) {
          notifications.push({
            id: crypto.randomUUID(),
            projectId: project.id,
            kind: "CORRECTION",
            title: `公告更正：${event.description}`,
            body: "此前已通知的事实被更正，相关分析需要按新原文理解。",
            eventIds: [event.id, prior.id],
            analysisIds: [],
            importance: "HIGH",
            createdAt: this.clock(),
            readAt: null,
            reason: "原始公告更正后同步提醒",
            correctionOf: prior.id,
          });
        }
      }
    }

    project.evidence = uniqueOriginEvidence(project.evidence);
    const applied = applyVerifiedAnalyses(project, run, ctx.newEvents, this.clock());
    const existingNotes = await this.deps.store.listNotifications(project.id);
    const freshImportant = applied.notifications.filter((note) => !existingNotes.some((old) => old.eventIds.some((id) => note.eventIds.includes(id)) || old.reason === note.reason));
    notifications.push(...freshImportant);
    maybeDailyDigest(project, this.deps.clock?.() || new Date(), notifications);

    const supported = applied.analyses.filter((item) => item.supportsStance === "SUPPORTS").map((item) => item.text);
    const challenged = applied.analyses.filter((item) => item.supportsStance === "CHALLENGES").map((item) => item.text);
    if (run.preliminary) {
      run.preliminary = {
        ...run.preliminary,
        supported: [...run.preliminary.supported, ...supported, ...ctx.notes.supported].slice(0, 8),
        needsRevision: [...run.preliminary.needsRevision, ...challenged, ...ctx.notes.needsRevision].slice(0, 8),
        unverified: [...run.preliminary.unverified, ...project.leads.filter((item) => item.status === "OPEN").map((item) => item.text)].slice(0, 8),
        openQuestions: [...new Set([...run.preliminary.openQuestions, ...ctx.notes.unresolved])].slice(0, 8),
      };
    }

    const hitLimit = run.modelCalls >= run.limits.modelCalls || run.documentsRead >= run.limits.documents;
    run.status = hitLimit || run.coverage.official === "FAILED" ? "PARTIAL" : "COMPLETED";
    if (hitLimit) run.coverage.notes.push("已达本轮调用或资料上限，未完成部分保留为未决问题，不标成研究完成");
    run.completedAt = this.clock();
    const verifiedCount = ctx.newEvents.filter((item) => item.verification === "VERIFIED").length;
    run.resultSummary = ctx.newEvents.length
      ? `本轮新增 ${ctx.newEvents.length} 条事件，其中已核实 ${verifiedCount} 条。`
      : "本轮未发现新的已核实事件。";
    run.events.push({ seq: run.events.length + 1, at: this.clock(), phase: "complete", message: run.resultSummary });
    await this.deps.store.commitResearchUpdate({ project, run, events: ctx.newEvents, analyses: applied.analyses, notifications });
    return run;
  }

  async applyUserMessage(projectId: string, rawText: string, undoMessageId?: string): Promise<V2Project> {
    const project = await this.deps.store.getProject(projectId);
    if (!project) throw Object.assign(new Error("项目不存在"), { statusCode: 404 });
    const createdAt = this.clock();
    if (undoMessageId) {
      project.messages = project.messages.map((item) => item.id === undoMessageId ? { ...item, undone: true } : item);
      const lastValid = [...project.messages].reverse().find((item) => !item.undone && item.parsedStanceChange);
      if (!lastValid) {
        project.currentStance = project.stanceHistory[0] || null;
      }
      await this.deps.store.saveProject(project);
      return project;
    }
    const classification = classifyUserInput(rawText);
    const message = {
      id: crypto.randomUUID(),
      rawText,
      createdAt,
      parsedStanceChange: classification.endorsed ? classification.summary : null,
      undone: false,
    };
    project.messages.push(message);
    if (classification.endorsed) {
      const stance = createStanceVersion({
        rawText,
        classification,
        previous: project.currentStance,
        changeReason: "用户自然语言反馈",
        now: createdAt,
      });
      if (stance) {
        project.currentStance = stance;
        project.stanceHistory.push(stance);
      }
    }
    await this.deps.store.saveProject(project);
    return project;
  }
}
