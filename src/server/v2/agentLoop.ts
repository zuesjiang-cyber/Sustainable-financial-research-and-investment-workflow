import crypto from "node:crypto";
import type { AnalysisRecord, ResearchEvent, ResearchLead, V2Notification, V2Project, V2Run } from "../../shared/v2Domain";
import { completeWithTransport, type ResearchModelMessage } from "../researchModel";
import type { RoleTransports } from "./modelRoles";
import { BudgetGuard, estimateModelCny } from "./budget";
import { judgeImportance } from "./importance";
import { mergeSameOriginEvents, uniqueOriginEvidence } from "./verification";
import {
  AgentContext,
  V2_AGENT_TOOLS,
  disclosuresToEvidence,
  executeV2Tool,
  nextLeadCheckAt,
  overlapSince,
} from "./agentTools";
import type { OfficialDisclosureItem } from "../disclosures/officialFilingProvider";
import type { V2Store } from "./v2Store";

export type BackgroundMode = "BACKGROUND" | "DEEP" | "MONITOR_OFFICIAL" | "MONITOR_EXTERNAL";

export interface AgentLoopDeps {
  store: V2Store;
  roles: RoleTransports;
  budget: BudgetGuard;
  clock: () => Date;
}

function pushEvent(run: V2Run, phase: string, message: string, payload?: Record<string, unknown>): void {
  run.events.push({ seq: run.events.length + 1, at: new Date().toISOString(), phase, message, payload });
}

function largestGap(project: V2Project, run: V2Run): string {
  if (run.input.question) return run.input.question;
  const open = run.preliminary?.openQuestions?.[0];
  if (open) return open;
  const lead = project.leads.find((item) => item.status === "OPEN");
  if (lead) return lead.text;
  if (project.identityStatus !== "IDENTIFIED") return "公司证券身份尚未唯一确认";
  return `针对 ${project.company?.name || "该公司"}，目前最重要的证据缺口是什么？`;
}

async function callTool(ctx: AgentContext, name: string, args: Record<string, unknown>, run: V2Run): Promise<unknown> {
  const result = await executeV2Tool(name, args, ctx);
  const summary = typeof result === "object" && result && "error" in (result as object)
    ? String((result as { error?: string }).error)
    : `${name} 完成`;
  pushEvent(run, "tool", summary, { tool: name });
  await ctx.persist?.();
  return result;
}

function ingestOfficialListing(ctx: AgentContext, items: Array<Partial<OfficialDisclosureItem> & { id: string; title: string }>): void {
  const now = ctx.clock().toISOString();
  const normalized: OfficialDisclosureItem[] = items.map((item) => ({
    id: item.id,
    securityCode: item.securityCode || ctx.project.company?.securityCode || "",
    companyName: item.companyName || ctx.project.company?.name || "",
    exchange: ctx.project.company?.exchange || "SZSE",
    title: item.title,
    reportType: item.reportType || "OTHER",
    period: item.period || { start: now.slice(0, 10), end: now.slice(0, 10), basis: "YEAR" },
    publishedAt: item.publishedAt || now,
    officialUrl: item.officialUrl || "",
    isCorrection: Boolean(item.isCorrection),
    source: "CNINFO_LIVE",
  }));
  const evidence = disclosuresToEvidence(ctx.project, normalized, now);
  ctx.project.evidence = uniqueOriginEvidence([...ctx.project.evidence, ...evidence]);
}

export async function runScriptedAgent(ctx: AgentContext, mode: BackgroundMode): Promise<void> {
  const { project, run } = ctx;
  const now = ctx.clock();

  if (project.identityStatus !== "IDENTIFIED" || !project.company) {
    run.coverage.official = "INCOMPLETE";
    run.coverage.notes.push("证券身份未唯一确认，不启动自动跟踪");
    await callTool(ctx, "read_project_memory", { query: project.title }, run);
    return;
  }

  if (mode !== "MONITOR_EXTERNAL") {
    const since = overlapSince(project.monitoring.lastOfficialSuccessAt, now);
    const listed = await callTool(ctx, "search_official_disclosures", {
      securityCode: project.company.securityCode,
      exchange: project.company.exchange,
      since,
    }, run) as { coverage?: string; error?: string; items?: Array<Record<string, unknown>> };
    run.coverage.official = listed.coverage === "COMPLETE" ? "COMPLETE" : listed.coverage === "FAILED" ? "FAILED" : "INCOMPLETE";
    if (listed.error) run.coverage.notes.push(listed.error);
    const items = (listed.items || []) as unknown as OfficialDisclosureItem[];
    ingestOfficialListing(ctx, items);
    const cap = mode === "DEEP" ? 16 : 8;
    for (const item of items.slice(0, cap)) {
      if (run.documentsRead >= run.limits.documents) {
        run.coverage.notes.push("已达本轮资料上限，停止读取新资料");
        break;
      }
      if (item.officialUrl) {
        await callTool(ctx, "fetch_url", { url: item.officialUrl, title: item.title }, run);
      }
      const evidence = project.evidence.filter((row) => row.originKey === item.id || row.url === item.officialUrl);
      if (!evidence.length) continue;
      const stage = item.isCorrection ? "CORRECTED" : /意向|拟|计划/.test(item.title) ? "PLANNED" : "ANNOUNCED";
      await callTool(ctx, "submit_event_verification", {
        description: item.title,
        stage,
        proposition: `${item.companyName}披露公告《${item.title}》`,
        evidenceIds: evidence.map((row) => row.id),
        occurredAt: item.publishedAt,
        disclosedAt: item.publishedAt,
        claimedNew: false,
      }, run);
    }
    project.monitoring.lastOfficialCheckAt = now.toISOString();
    if (run.coverage.official !== "FAILED") project.monitoring.lastOfficialSuccessAt = now.toISOString();
  }

  if (mode !== "MONITOR_OFFICIAL") {
    const gap = largestGap(project, run);
    const query = [project.company.name, project.currentStance?.summary, gap, "分歧 风险 反证"].filter(Boolean).join(" ");
    const external = await callTool(ctx, "search_external", { query }, run) as {
      coverage?: string;
      error?: string;
      hits?: Array<{ title: string; url: string; publishedAt: string | null; snippet: string }>;
    };
    run.coverage.external = external.coverage === "NOT_CONFIGURED" ? "INCOMPLETE" : (external.coverage as V2Run["coverage"]["external"]) || "INCOMPLETE";
    if (external.error) run.coverage.notes.push(external.error);
    if (external.coverage !== "FAILED" && external.coverage !== "NOT_CONFIGURED") project.monitoring.lastExternalSuccessAt = now.toISOString();
    project.monitoring.lastExternalCheckAt = now.toISOString();

    const leadId = run.input.question;
    const focusLead = leadId ? project.leads.find((item) => item.id === leadId) : undefined;
    const hits = (external.hits || []).slice(0, mode === "DEEP" ? 10 : 6);
    for (const hit of hits) {
      if (run.documentsRead >= run.limits.documents) break;
      const fetched = await callTool(ctx, "fetch_url", { url: hit.url, title: hit.title }, run) as { evidenceId?: string; error?: string };
      if (!fetched.evidenceId) {
        const lead: ResearchLead = {
          id: crypto.randomUUID(),
          projectId: project.id,
          text: hit.title,
          discoveredAt: now.toISOString(),
          nextCheckAt: nextLeadCheckAt(0, now),
          attempts: 0,
          status: "OPEN",
          evidenceIds: [],
        };
        project.leads.push(lead);
        continue;
      }
      const submitted = await callTool(ctx, "submit_event_verification", {
        description: hit.title,
        stage: "ANNOUNCED",
        proposition: (hit.snippet || hit.title).slice(0, 180),
        evidenceIds: [fetched.evidenceId],
        occurredAt: hit.publishedAt,
        disclosedAt: hit.publishedAt,
        claimedNew: false,
      }, run) as { accepted?: boolean; eventId?: string };
      if (!submitted.accepted) {
        const existing = focusLead && focusLead.status === "OPEN" ? focusLead : undefined;
        if (existing) {
          existing.attempts += 1;
          existing.nextCheckAt = nextLeadCheckAt(existing.attempts, now);
          existing.evidenceIds = [...new Set([...existing.evidenceIds, fetched.evidenceId])];
        } else {
          project.leads.push({
            id: crypto.randomUUID(),
            projectId: project.id,
            text: hit.title,
            discoveredAt: now.toISOString(),
            nextCheckAt: nextLeadCheckAt(0, now),
            attempts: 0,
            status: "OPEN",
            evidenceIds: [fetched.evidenceId],
          });
        }
      } else if (focusLead) {
        focusLead.status = "PROMOTED";
      }
    }
  }

  await callTool(ctx, "submit_research_notes", {
    completed: ctx.notes.completed.length ? ctx.notes.completed : [`已执行${mode}工具链`],
    unresolved: [
      run.documentsRead >= run.limits.documents ? "本轮资料上限已到，仍有原文未读" : "",
      project.leads.some((item) => item.status === "OPEN") ? "仍有未核实线索，按 1/6/24 小时再查，不会升格为事实" : "",
    ].filter(Boolean),
  }, run);
}

export async function runModelAgent(ctx: AgentContext, deps: AgentLoopDeps): Promise<void> {
  const transport = ctx.run.kind === "FAST" ? deps.roles.fast : deps.roles.research;
  if (!transport) return;
  const messages: ResearchModelMessage[] = [{
    role: "system",
    content: [
      "你是持续投研 Agent。只能通过工具读取原文与提交核验。",
      "禁止把未核实线索写成事实。禁止用 Tavily 综合答案当证据。",
      "达到上限时调用 submit_research_notes，写已完成部分和未决问题，不得声称研究完成。",
      "估值必须具备价格日期、会计口径和必要假设，否则不要计算价值。",
    ].join("\n"),
  }, {
    role: "user",
    content: [
      `任务类型：${ctx.run.kind}`,
      `公司：${ctx.project.company ? `${ctx.project.company.name} ${ctx.project.company.securityCode}` : "未确认"}`,
      `用户立场：${ctx.project.currentStance?.rawText || "无"}`,
      `本轮缺口：${largestGap(ctx.project, ctx.run)}`,
      `已读资料 ${ctx.run.documentsRead}/${ctx.run.limits.documents}，模型调用 ${ctx.run.modelCalls}/${ctx.run.limits.modelCalls}`,
    ].join("\n"),
  }];

  while (ctx.run.modelCalls < ctx.run.limits.modelCalls) {
    const paid = await deps.budget.canStartPaidTask(0.2);
    if (!paid.ok) {
      ctx.run.coverage.notes.push(paid.reason || "预算不足，停止模型调用");
      break;
    }
    const started = Date.now();
    try {
      const response = await completeWithTransport(transport, {
        messages,
        tools: V2_AGENT_TOOLS,
        max_tokens: 900,
      });
      ctx.run.modelCalls += 1;
      await deps.budget.settle(
        await deps.budget.reserve("MODEL", estimateModelCny(800, 400), ctx.run.id, transport.model),
        {
          inputTokens: response.usage?.input_tokens || 0,
          outputTokens: response.usage?.output_tokens || 0,
          latencyMs: Date.now() - started,
          estimatedCny: estimateModelCny(response.usage?.input_tokens || 0, response.usage?.output_tokens || 0),
          model: transport.model,
          runId: ctx.run.id,
        },
      );
      const calls = response.message.tool_calls || [];
      messages.push({
        role: "assistant",
        content: response.message.content,
        tool_calls: calls,
      });
      if (!calls.length) {
        if (response.message.content) ctx.notes.completed.push(response.message.content.slice(0, 400));
        break;
      }
      for (const call of calls) {
        const result = await callTool(ctx, call.name, call.arguments || {}, ctx.run);
        messages.push({
          role: "tool",
          name: call.name,
          tool_call_id: call.id,
          content: JSON.stringify(result).slice(0, 8000),
        });
      }
    } catch (error) {
      ctx.run.coverage.notes.push(`研究模型调用失败：${error instanceof Error ? error.message : String(error)}`);
      break;
    }
  }
}

export function applyVerifiedAnalyses(
  project: V2Project,
  run: V2Run,
  newEvents: ResearchEvent[],
  now: string,
): { analyses: AnalysisRecord[]; notifications: V2Notification[] } {
  const analyses: AnalysisRecord[] = [];
  const notifications: V2Notification[] = [];
  const merged = mergeSameOriginEvents([...project.events, ...newEvents]);
  const added = merged.filter((event) => !project.events.some((old) => old.id === event.id || (old.originKey === event.originKey && old.proposition === event.proposition)));
  project.events = merged;

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
      createdAt: now,
    };
    analyses.push(analysis);
    if (judged.importance === "HIGH" && novelty && !project.isReplay) {
      notifications.push({
        id: crypto.randomUUID(),
        projectId: project.id,
        kind: "IMPORTANT_CHANGE",
        title: event.description.slice(0, 80),
        body: analysis.text,
        eventIds: [event.id],
        analysisIds: [analysis.id],
        importance: "HIGH",
        createdAt: now,
        readAt: null,
        reason: event.originKey,
        correctionOf: null,
      });
    }
  }
  project.analyses = [...project.analyses, ...analyses];
  return { analyses, notifications };
}

export function maybeDailyDigest(project: V2Project, now: Date, extra: V2Notification[]): V2Notification | null {
  if (project.isReplay || !project.monitoring.enabled) return null;
  const last = project.monitoring.lastDigestAt ? Date.parse(project.monitoring.lastDigestAt) : 0;
  if (last && now.getTime() - last < 24 * 3600_000) return null;
  const since = last || now.getTime() - 24 * 3600_000;
  const recent = project.analyses.filter((item) => Date.parse(item.createdAt) >= since && item.importance !== "HIGH");
  const leads = project.leads.filter((item) => item.status === "OPEN");
  if (!recent.length && !leads.length) return null;
  project.monitoring.lastDigestAt = now.toISOString();
  const note: V2Notification = {
    id: crypto.randomUUID(),
    projectId: project.id,
    kind: "DAILY_DIGEST",
    title: `${project.company?.name || project.title} 每日摘要`,
    body: [
      recent.length ? `已核实但未达单独提醒阈值的分析 ${recent.length} 条。` : "过去一天没有中低重要性已核实变化。",
      leads.length ? `未核实线索 ${leads.length} 条仍单独保存，不会升格为事实。` : "",
    ].filter(Boolean).join(" "),
    eventIds: recent.flatMap((item) => item.eventIds).slice(0, 12),
    analysisIds: recent.map((item) => item.id),
    importance: "LOW",
    createdAt: now.toISOString(),
    readAt: null,
    reason: "daily-digest",
    correctionOf: null,
  };
  extra.push(note);
  return note;
}
