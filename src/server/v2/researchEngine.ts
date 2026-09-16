import crypto from "node:crypto";
import type {
  AnalysisRecord,
  EvidenceRecord,
  MaterialView,
  PreliminaryJudgment,
  ResearchEvent,
  ResearchLead,
  V2Notification,
  V2Project,
  V2Run,
  V2RunKind,
} from "../../shared/v2Domain";
import { BACKGROUND_LIMITS, DEEP_LIMITS, FAST_LIMITS } from "../../shared/v2Domain";
import { identifyCompanies, resolveIdentity } from "./companyCatalog";
import { classifyUserInput, createStanceVersion, extractMaterialViews } from "./stance";
import { canonicalOrigin, hashText, mergeSameOriginEvents, uniqueOriginEvidence, verifyProposition } from "./verification";
import { judgeImportance } from "./importance";
import type { V2Store } from "./v2Store";
import type { CninfoDisclosureClient } from "./disclosures";
import type { TavilyClient } from "./tavily";
import { fetchPublicPage } from "./webFetch";
import type { LocalUploadService } from "../documents/uploadService";
import { completeWithTransport, type ResearchModelTransport } from "../researchModel";
import type { RoleTransports } from "./modelRoles";
import { BudgetGuard, estimateModelCny } from "./budget";

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

  async runBackground(runId: string, mode: "BACKGROUND" | "DEEP" | "MONITOR_OFFICIAL" | "MONITOR_EXTERNAL" = "BACKGROUND"): Promise<V2Run> {
    const run = await this.deps.store.getRun(runId);
    if (!run) throw new Error("Run 不存在");
    const project = await this.deps.store.getProject(run.projectId);
    if (!project) throw new Error("项目不存在");
    if (project.isReplay && mode !== "BACKGROUND") {
      // Replay still can compute, but monitoring is isolated by isReplay flag.
    }
    run.status = "RUNNING";
    run.events.push({ seq: run.events.length + 1, at: this.clock(), phase: "background", message: mode === "DEEP" ? "开始深入研究" : "开始必要后台研究" });

    const paid = await this.deps.budget.canStartPaidTask(0.4);
    if (!paid.ok) {
      run.status = "BUDGET_PAUSED";
      run.coverage.notes.push(paid.reason || "预算不足");
      run.resultSummary = "预算已暂停新的收费检索，已保存内容仍可查看。";
      await this.deps.store.commitResearchUpdate({ project, run });
      return run;
    }

    const newEvents: ResearchEvent[] = [];
    const newLeads: ResearchLead[] = [];
    const newAnalyses: AnalysisRecord[] = [];
    const notifications: V2Notification[] = [];

    if (project.identityStatus !== "IDENTIFIED" || !project.company) {
      run.coverage.official = "INCOMPLETE";
      run.coverage.notes.push("证券身份未唯一确认，不启动自动跟踪");
    } else if (mode !== "MONITOR_EXTERNAL") {
      const since = new Date(this.deps.clock?.() || Date.now());
      since.setMonth(since.getMonth() - 12);
      const official = await this.deps.disclosures.search(project.company.securityCode, project.company.exchange, since.toISOString().slice(0, 10));
      run.coverage.official = official.coverage === "COMPLETE" ? "COMPLETE" : official.coverage === "FAILED" ? "FAILED" : "INCOMPLETE";
      if (official.error) run.coverage.notes.push(official.error);
      if (official.coverage === "FAILED") {
        await this.deps.store.recordCheck({
          projectId: project.id,
          kind: "OFFICIAL",
          status: "FAILED",
          coverage: "FAILED",
          notes: official.error || "官方披露检查失败",
          startedAt: run.createdAt,
          finishedAt: this.clock(),
        });
      }
      for (const item of official.items.slice(0, mode === "DEEP" ? 16 : 8)) {
        if (run.documentsRead >= run.limits.documents) break;
        run.documentsRead += 1;
        const evidence = makeEvidence({
          projectId: project.id,
          sourceKind: "OFFICIAL_DISCLOSURE",
          title: item.title,
          url: item.officialUrl,
          documentId: null,
          quote: `${item.companyName} ${item.title}`,
          occurredAt: item.publishedAt,
          disclosedAt: item.publishedAt,
          discoveredAt: this.clock(),
          parentOriginKey: null,
          companyName: item.companyName,
          securityCode: item.securityCode,
          page: null,
          bbox: null,
          reprintOf: null,
          quality: "NATIVE",
          originKey: item.id,
        });
        project.evidence.push(evidence);
        const stage = item.isCorrection ? "CORRECTED" : /意向|拟|计划/.test(item.title) ? "PLANNED" : "ANNOUNCED";
        const verified = verifyProposition({
          projectId: project.id,
          description: item.title,
          stage,
          proposition: `${item.companyName} 公告：${item.title}`,
          companyName: project.company.name,
          securityCode: project.company.securityCode,
          occurredAt: item.publishedAt,
          disclosedAt: item.publishedAt,
          discoveredAt: this.clock(),
          evidence: [evidence],
        });
        newEvents.push(verified.event);
        if (item.isCorrection) {
          const previous = project.events.filter((event) => event.originKey === evidence.originKey || event.description.includes(item.title.replace(/更正|修订/g, "")));
          for (const prior of previous) {
            prior.verification = "CORRECTED";
            verified.event.correctionOf = prior.id;
            const wasNotified = (await this.deps.store.listNotifications(project.id)).some((note) => note.eventIds.includes(prior.id) && !note.correctionOf);
            if (wasNotified) {
              notifications.push({
                id: crypto.randomUUID(),
                projectId: project.id,
                kind: "CORRECTION",
                title: `公告更正：${item.title}`,
                body: "此前已通知的事实被更正，相关分析需要按新原文理解。",
                eventIds: [verified.event.id, prior.id],
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
      }
      project.monitoring.lastOfficialCheckAt = this.clock();
      if (official.coverage !== "FAILED") project.monitoring.lastOfficialSuccessAt = this.clock();
    }

    if (mode !== "MONITOR_OFFICIAL") {
      const query = [project.company?.name, project.currentStance?.summary, "分歧 风险 反证"].filter(Boolean).join(" ");
      const external = query.trim() ? await this.deps.tavily.search(query) : { hits: [], coverage: "INCOMPLETE" as const, error: "缺少检索词" };
      run.coverage.external = external.coverage === "NOT_CONFIGURED" ? "INCOMPLETE" : external.coverage;
      if (external.error) run.coverage.notes.push(external.error);
      if (external.coverage !== "FAILED" && external.coverage !== "NOT_CONFIGURED") project.monitoring.lastExternalSuccessAt = this.clock();
      project.monitoring.lastExternalCheckAt = this.clock();
      for (const hit of external.hits.slice(0, 6)) {
        if (run.documentsRead >= run.limits.documents) break;
        run.documentsRead += 1;
        const evidence = makeEvidence({
          projectId: project.id,
          sourceKind: /cninfo|sse.com.cn|szse.cn/.test(hit.url) ? "OFFICIAL_DISCLOSURE" : "EXTERNAL_REPORT",
          title: hit.title,
          url: hit.url,
          documentId: null,
          quote: hit.content.slice(0, 800),
          occurredAt: hit.publishedAt,
          disclosedAt: hit.publishedAt,
          discoveredAt: this.clock(),
          parentOriginKey: null,
          companyName: project.company?.name || null,
          securityCode: project.company?.securityCode || null,
          page: null,
          bbox: null,
          reprintOf: null,
          quality: "EXTRACT",
        });
        project.evidence.push(evidence);
        const verified = verifyProposition({
          projectId: project.id,
          description: hit.title,
          stage: "ANNOUNCED",
          proposition: hit.content.slice(0, 180),
          companyName: project.company?.name || null,
          securityCode: project.company?.securityCode || null,
          occurredAt: hit.publishedAt,
          disclosedAt: hit.publishedAt,
          discoveredAt: this.clock(),
          evidence: [evidence],
        });
        if (verified.accepted) newEvents.push(verified.event);
        else {
          newLeads.push({
            id: crypto.randomUUID(),
            projectId: project.id,
            text: hit.title,
            discoveredAt: this.clock(),
            nextCheckAt: new Date((this.deps.clock?.() || new Date()).getTime() + 3600_000).toISOString(),
            attempts: 0,
            status: "OPEN",
            evidenceIds: [evidence.id],
          });
        }
      }
    }

    project.evidence = uniqueOriginEvidence(project.evidence);
    const merged = mergeSameOriginEvents([...project.events, ...newEvents]);
    const added = merged.filter((event) => !project.events.some((old) => old.id === event.id || (old.originKey === event.originKey && old.proposition === event.proposition)));
    project.events = merged;
    project.leads = [...project.leads, ...newLeads];

    for (const event of added) {
      if (event.verification !== "VERIFIED") continue;
      const novelty = !project.analyses.some((item) => item.eventIds.includes(event.id) || item.text.includes(event.originKey));
      const judged = judgeImportance({ event, stance: project.currentStance, novelty });
      const analysis: AnalysisRecord = {
        id: crypto.randomUUID(),
        projectId: project.id,
        runId: run.id,
        stanceVersion: project.currentStance?.version || 0,
        eventIds: [event.id],
        evidenceIds: event.evidenceIds,
        text: `${event.attributedSpeaker ? `${event.attributedSpeaker}披露：` : ""}${event.description}。对用户立场的影响：${judged.reason}`,
        assumptionsUnmet: event.limitations,
        importance: judged.importance,
        supportsStance: judged.supports,
        createdAt: this.clock(),
      };
      newAnalyses.push(analysis);
      if (judged.importance === "HIGH" && novelty && !project.isReplay) {
        const duplicate = (await this.deps.store.listNotifications(project.id)).some((note) => note.eventIds.includes(event.id) || note.reason === event.originKey);
        if (!duplicate) {
          notifications.push({
            id: crypto.randomUUID(),
            projectId: project.id,
            kind: "IMPORTANT_CHANGE",
            title: event.description.slice(0, 80),
            body: analysis.text,
            eventIds: [event.id],
            analysisIds: [analysis.id],
            importance: "HIGH",
            createdAt: this.clock(),
            readAt: null,
            reason: event.originKey,
            correctionOf: null,
          });
        }
      }
    }
    project.analyses = [...project.analyses, ...newAnalyses];

    const supported = newAnalyses.filter((item) => item.supportsStance === "SUPPORTS").map((item) => item.text);
    const challenged = newAnalyses.filter((item) => item.supportsStance === "CHALLENGES").map((item) => item.text);
    if (run.preliminary) {
      run.preliminary = {
        ...run.preliminary,
        supported: [...run.preliminary.supported, ...supported].slice(0, 8),
        needsRevision: [...run.preliminary.needsRevision, ...challenged].slice(0, 8),
      };
    }
    const hitLimit = run.modelCalls >= run.limits.modelCalls || run.documentsRead >= run.limits.documents;
    run.status = hitLimit || run.coverage.official === "FAILED" ? "PARTIAL" : "COMPLETED";
    if (hitLimit) run.coverage.notes.push("已达本轮调用或资料上限，未完成部分保留为未决问题，不标成研究完成");
    run.completedAt = this.clock();
    run.resultSummary = added.length
      ? `本轮新增 ${added.length} 条事件，其中已核实 ${added.filter((item) => item.verification === "VERIFIED").length} 条。`
      : "本轮未发现新的已核实事件。";
    run.events.push({ seq: run.events.length + 1, at: this.clock(), phase: "complete", message: run.resultSummary });
    await this.deps.store.commitResearchUpdate({ project, run, events: added, analyses: newAnalyses, notifications });
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
