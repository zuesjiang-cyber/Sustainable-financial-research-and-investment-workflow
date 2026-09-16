import crypto from "node:crypto";
import type { ResearchModelToolDefinition } from "../researchModel";
import type { EvidenceRecord, ResearchEvent, V2EventStage, V2Project, V2Run } from "../../shared/v2Domain";
import { calculateFinancialMetrics, type ResearchToolContext } from "../researchTools";
import { fetchPublicPage } from "./webFetch";
import { assertPublicHttpUrl } from "./ssrf";
import { canonicalOrigin, hashText, uniqueOriginEvidence, verifyProposition } from "./verification";
import type { CninfoDisclosureClient } from "./disclosures";
import type { TavilyClient } from "./tavily";
import type { LocalUploadService } from "../documents/uploadService";
import type { OfficialDisclosureItem } from "../disclosures/officialFilingProvider";

export const V2_AGENT_TOOLS: ResearchModelToolDefinition[] = [
  {
    name: "search_official_disclosures",
    description: "按证券代码检索巨潮等官方披露，按公告时间与公告 ID 增量返回，不把报告期间当作新事件判断。",
    parameters: {
      type: "object",
      properties: {
        securityCode: { type: "string" },
        exchange: { type: "string", enum: ["SSE", "SZSE"] },
        since: { type: "string", description: "ISO 日期，含 7 天重叠窗口" },
        searchkey: { type: "string" },
      },
      required: ["securityCode", "exchange"],
    },
  },
  {
    name: "search_external",
    description: "用 Tavily Search 发现外部报道与公开观点。关闭综合答案，必须再 fetch_url 读原文。",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "fetch_url",
    description: "读取公开网页正文。禁止本地与私有网络。PDF 会尝试解析页面文本。",
    parameters: {
      type: "object",
      properties: { url: { type: "string" }, title: { type: "string" } },
      required: ["url"],
    },
  },
  {
    name: "read_project_memory",
    description: "检索本项目已有事实、用户立场、材料观点、未核实线索和历史分析。",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "calculate_financial_metrics",
    description: "确定性财务计算。操作数必须带来源证据，公司/期间/单位不一致则失败。",
    parameters: {
      type: "object",
      properties: {
        operation: { type: "string" },
        operands: { type: "array" },
        label: { type: "string" },
      },
      required: ["operation"],
    },
  },
  {
    name: "submit_event_verification",
    description: "提交一条待核验命题。系统用代码核验，模型不能自行把未核实内容标成 VERIFIED。",
    parameters: {
      type: "object",
      properties: {
        description: { type: "string" },
        stage: { type: "string", enum: ["ANNOUNCED", "PLANNED", "IN_PROGRESS", "PERFORMED", "RECOGNIZED", "CORRECTED"] },
        proposition: { type: "string" },
        evidenceIds: { type: "array", items: { type: "string" } },
        occurredAt: { type: "string" },
        disclosedAt: { type: "string" },
        claimedNew: { type: "boolean" },
        attributedSpeaker: { type: "string" },
      },
      required: ["description", "stage", "proposition", "evidenceIds"],
    },
  },
  {
    name: "submit_research_notes",
    description: "提交本轮已完成部分与未决问题。达到上限时必须调用，且不得声称研究已完成。",
    parameters: {
      type: "object",
      properties: {
        completed: { type: "array", items: { type: "string" } },
        unresolved: { type: "array", items: { type: "string" } },
        supported: { type: "array", items: { type: "string" } },
        needsRevision: { type: "array", items: { type: "string" } },
      },
    },
  },
];

export interface AgentContext {
  project: V2Project;
  run: V2Run;
  disclosures: CninfoDisclosureClient;
  tavily: TavilyClient;
  upload?: LocalUploadService;
  fetchImpl: typeof fetch;
  clock: () => Date;
  newEvents: ResearchEvent[];
  notes: { completed: string[]; unresolved: string[]; supported: string[]; needsRevision: string[] };
}

export function overlapSince(lastSuccessAt: string | null, now: Date, firstLookbackMonths = 12): string {
  if (!lastSuccessAt) {
    const start = new Date(now);
    start.setMonth(start.getMonth() - firstLookbackMonths);
    return start.toISOString().slice(0, 10);
  }
  const last = new Date(lastSuccessAt);
  last.setDate(last.getDate() - 7);
  return last.toISOString().slice(0, 10);
}

export function nextLeadCheckAt(attempts: number, now: Date): string {
  const hours = attempts <= 0 ? 1 : attempts === 1 ? 6 : 24;
  return new Date(now.getTime() + hours * 3600_000).toISOString();
}

function asBbox(value: unknown): [number, number, number, number] | null {
  if (!Array.isArray(value) || value.length < 4) return null;
  const nums = value.slice(0, 4).map(Number);
  if (nums.some((item) => !Number.isFinite(item))) return null;
  return [nums[0], nums[1], nums[2], nums[3]];
}

function makeEvidence(projectId: string, partial: Omit<EvidenceRecord, "id" | "rawHash" | "originKey" | "projectId"> & { originKey?: string }): EvidenceRecord {
  const rawHash = hashText(`${partial.title}\n${partial.quote}\n${partial.url || ""}`);
  return {
    ...partial,
    projectId,
    id: crypto.randomUUID(),
    rawHash,
    originKey: partial.originKey || canonicalOrigin(partial.url, partial.title, partial.quote),
  };
}

function asToolContext(project: V2Project): ResearchToolContext {
  const snippets = project.evidence.map((item, index) => ({
    id: item.id,
    page: item.page,
    text: item.quote,
    section: item.title,
    line_start: index + 1,
    line_end: index + 1,
  }));
  return {
    project: {
      id: project.id,
      name: project.title,
      company: project.company?.name || "",
      ticker: project.company?.securityCode || "",
      current_version: "T0",
      status: "active",
      summary: project.summary,
      created_at: project.createdAt,
      updated_at: project.updatedAt,
      theses: [],
      documents: [{
        id: "mem",
        project_id: project.id,
        source_type: "notes",
        title: "project-memory",
        disclosure_date: project.updatedAt.slice(0, 10),
        content: project.evidence.map((item) => item.quote).join("\n"),
        added_at: project.updatedAt,
        evidence_snippets: snippets,
      }],
      open_questions: [],
      updates: [],
    } as any,
    material: {
      id: "mem",
      project_id: project.id,
      source_type: "notes",
      title: "project-memory",
      disclosure_date: project.updatedAt.slice(0, 10),
      content: project.evidence.map((item) => item.quote).join("\n"),
      added_at: project.updatedAt,
      evidence_snippets: snippets,
    } as any,
  };
}

export async function executeV2Tool(name: string, args: Record<string, unknown>, ctx: AgentContext): Promise<unknown> {
  if (ctx.run.documentsRead >= ctx.run.limits.documents && (name === "fetch_url" || name === "search_external" || name === "search_official_disclosures")) {
    return { error: "已达本轮资料上限，停止读取新资料", limit: ctx.run.limits.documents };
  }

  if (name === "search_official_disclosures") {
    const code = String(args.securityCode || ctx.project.company?.securityCode || "");
    const exchange = args.exchange === "SSE" || args.exchange === "SZSE" ? args.exchange : ctx.project.company?.exchange || "SZSE";
    const since = String(args.since || overlapSince(ctx.project.monitoring.lastOfficialSuccessAt, ctx.clock()));
    const result = await ctx.disclosures.search(code, exchange, since, typeof args.searchkey === "string" ? args.searchkey : undefined);
    const known = new Set(ctx.project.evidence.map((item) => item.originKey));
    const fresh = result.items.filter((item) => !known.has(item.id));
    return {
      coverage: result.coverage,
      error: result.error,
      source: result.source,
      since,
      items: fresh.map((item: OfficialDisclosureItem) => ({
        id: item.id,
        title: item.title,
        publishedAt: item.publishedAt,
        officialUrl: item.officialUrl,
        isCorrection: item.isCorrection,
        companyName: item.companyName,
        securityCode: item.securityCode,
      })),
    };
  }

  if (name === "search_external") {
    const query = String(args.query || "").trim();
    if (!query) return { error: "query 不能为空" };
    const result = await ctx.tavily.search(query);
    return { coverage: result.coverage, error: result.error, hits: result.hits.map((hit) => ({ title: hit.title, url: hit.url, publishedAt: hit.publishedAt, snippet: hit.content.slice(0, 280) })) };
  }

  if (name === "fetch_url") {
    const url = String(args.url || "");
    await assertPublicHttpUrl(url);
    ctx.run.documentsRead += 1;
    if (/\.pdf($|\?)/i.test(url) && ctx.upload) {
      try {
        return await ingestRemotePdf(url, ctx);
      } catch (error) {
        return { error: `PDF 解析失败：${error instanceof Error ? error.message : String(error)}`, url };
      }
    }
    let page;
    try {
      page = await fetchPublicPage(url, ctx.fetchImpl);
    } catch (error) {
      return { error: `网页读取失败：${error instanceof Error ? error.message : String(error)}`, url };
    }
    const evidence = makeEvidence(ctx.project.id, {
      sourceKind: /cninfo|sse.com.cn|szse.cn/.test(url) ? "OFFICIAL_DISCLOSURE" : "EXTERNAL_REPORT",
      title: String(args.title || page.title),
      url: page.url,
      documentId: null,
      quote: page.text.slice(0, 1800),
      occurredAt: null,
      disclosedAt: null,
      discoveredAt: ctx.clock().toISOString(),
      parentOriginKey: null,
      companyName: ctx.project.company?.name || null,
      securityCode: ctx.project.company?.securityCode || null,
      page: null,
      bbox: null,
      reprintOf: null,
      quality: "EXTRACT",
    });
    ctx.project.evidence = uniqueOriginEvidence([...ctx.project.evidence, evidence]);
    return { evidenceId: evidence.id, title: evidence.title, quote: evidence.quote.slice(0, 800), url: evidence.url };
  }

  if (name === "read_project_memory") {
    const query = String(args.query || "").toLowerCase();
    const stance = ctx.project.currentStance;
    const events = ctx.project.events.filter((item) => !query || `${item.description} ${item.proposition}`.toLowerCase().includes(query)).slice(0, 8);
    const leads = ctx.project.leads.filter((item) => item.status === "OPEN").slice(0, 8);
    const evidence = ctx.project.evidence.filter((item) => !query || `${item.title} ${item.quote}`.toLowerCase().includes(query)).slice(0, 8);
    return {
      stance: stance ? { version: stance.version, summary: stance.summary, rawText: stance.rawText, reasons: stance.reasons, thresholds: stance.thresholds } : null,
      materialViews: ctx.project.materialViews.slice(-6),
      events: events.map((item) => ({ id: item.id, verification: item.verification, stage: item.stage, description: item.description })),
      leads,
      evidence: evidence.map((item) => ({ id: item.id, title: item.title, quote: item.quote.slice(0, 240), originKey: item.originKey })),
    };
  }

  if (name === "calculate_financial_metrics") {
    return calculateFinancialMetrics(asToolContext(ctx.project), args as any);
  }

  if (name === "submit_event_verification") {
    const evidenceIds = Array.isArray(args.evidenceIds) ? args.evidenceIds.map(String) : [];
    const evidence = ctx.project.evidence.filter((item) => evidenceIds.includes(item.id));
    if (!evidence.length) return { accepted: false, error: "必须引用已读取的原文证据" };
    const verified = verifyProposition({
      projectId: ctx.project.id,
      description: String(args.description || ""),
      stage: args.stage as V2EventStage,
      proposition: String(args.proposition || ""),
      companyName: ctx.project.company?.name || null,
      securityCode: ctx.project.company?.securityCode || null,
      occurredAt: args.occurredAt ? String(args.occurredAt) : evidence[0].occurredAt,
      disclosedAt: args.disclosedAt ? String(args.disclosedAt) : evidence[0].disclosedAt,
      discoveredAt: ctx.clock().toISOString(),
      claimedNew: Boolean(args.claimedNew),
      attributedSpeaker: args.attributedSpeaker ? String(args.attributedSpeaker) : null,
      evidence,
    });
    ctx.newEvents.push(verified.event);
    return { accepted: verified.accepted, verification: verified.event.verification, eventId: verified.event.id, reasons: verified.reasons };
  }

  if (name === "submit_research_notes") {
    const list = (value: unknown) => Array.isArray(value) ? value.map(String) : [];
    ctx.notes.completed.push(...list(args.completed));
    ctx.notes.unresolved.push(...list(args.unresolved));
    ctx.notes.supported.push(...list(args.supported));
    ctx.notes.needsRevision.push(...list(args.needsRevision));
    return { ok: true };
  }

  return { error: `未知工具 ${name}` };
}

async function ingestRemotePdf(url: string, ctx: AgentContext): Promise<unknown> {
  if (!ctx.upload) return { error: "未配置上传解析器" };
  const response = await ctx.fetchImpl(url, { headers: { "User-Agent": "FinTrust/2.0" } });
  if (!response.ok) return { error: `PDF 获取失败 ${response.status}` };
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.subarray(0, 1024).includes(Buffer.from("%PDF-", "ascii"))) {
    return { error: "远程文件不是 PDF，未当作数字证据" };
  }
  const key = `remote-${hashText(url).slice(0, 24)}`;
  const receipt = await ctx.upload.upload({
    file: { originalname: (url.split("/").pop() || "remote.pdf").slice(0, 80), mimetype: "application/pdf", size: buffer.length, buffer },
    role: "SUPPLEMENT",
    projectId: /^[0-9a-f-]{36}$/i.test(ctx.project.id) ? ctx.project.id : null,
    idempotencyKey: key.length >= 8 ? key : `${key}-padding`,
  });
  const spans = await ctx.upload.getSpans(receipt.document.id) || [];
  const quotes = spans.map((span) => String(span.quote || "")).filter((text) => text.trim()).slice(0, 12);
  const evidence = makeEvidence(ctx.project.id, {
    sourceKind: "OFFICIAL_DISCLOSURE",
    title: receipt.document.fileName,
    url,
    documentId: receipt.document.id,
    quote: quotes.join("\n").slice(0, 2000) || receipt.document.fileName,
    occurredAt: null,
    disclosedAt: null,
    discoveredAt: ctx.clock().toISOString(),
    parentOriginKey: null,
    companyName: ctx.project.company?.name || null,
    securityCode: ctx.project.company?.securityCode || null,
    page: spans[0]?.regions[0]?.pageNumber || null,
    bbox: asBbox(spans[0]?.regions[0]?.bbox),
    reprintOf: null,
    quality: receipt.parseSummary.quality.hasOcrPages ? "OCR" : "NATIVE",
    originKey: canonicalOrigin(url, receipt.document.fileName, ""),
  });
  ctx.project.evidence = uniqueOriginEvidence([...ctx.project.evidence, evidence]);
  return { evidenceId: evidence.id, documentId: receipt.document.id, pages: receipt.parseSummary.pageCount, quote: evidence.quote.slice(0, 800) };
}

export function disclosuresToEvidence(project: V2Project, items: OfficialDisclosureItem[], now: string): EvidenceRecord[] {
  return items.map((item) => makeEvidence(project.id, {
    sourceKind: "OFFICIAL_DISCLOSURE",
    title: item.title,
    url: item.officialUrl || null,
    documentId: null,
    quote: `${item.companyName}（${item.securityCode}）于巨潮资讯网披露公告《${item.title}》。`,
    occurredAt: item.publishedAt,
    disclosedAt: item.publishedAt,
    discoveredAt: now,
    parentOriginKey: null,
    companyName: item.companyName,
    securityCode: item.securityCode,
    page: null,
    bbox: null,
    reprintOf: null,
    quality: "NATIVE",
    originKey: item.id,
  }));
}
