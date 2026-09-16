import crypto from "node:crypto";
import type { EvidenceRecord, ResearchEvent, V2EventStage, V2VerificationStatus } from "../../shared/v2Domain";

const PLAN_RE = /拟|计划|意向|有望|预计|将于|拟签|筹划|力争|目标是/;
const PERFORMED_RE = /已签|已经完成|已完成|已履行|已确认|已实现|已经实现/;
const RECOGNIZED_RE = /确认收入|已确认收入|计入营业收入|实现营业收入/;
const ANNOUNCED_RE = /公告|披露|发布|刊登/;
const OLD_NEWS_DAYS = 180;

export interface PropositionInput {
  projectId: string;
  description: string;
  stage: V2EventStage;
  proposition: string;
  companyName: string | null;
  securityCode: string | null;
  occurredAt: string | null;
  disclosedAt: string | null;
  discoveredAt: string;
  evidence: EvidenceRecord[];
  claimedNew?: boolean;
  attributedSpeaker?: string | null;
}

export interface VerificationResult {
  event: ResearchEvent;
  accepted: boolean;
  reasons: string[];
}

function originKeyFor(evidence: EvidenceRecord[]): string {
  const keys = evidence.map((item) => item.originKey || item.rawHash).filter(Boolean);
  keys.sort();
  return keys[0] || crypto.createHash("sha256").update("empty").digest("hex").slice(0, 16);
}

function quoteSupports(stage: V2EventStage, quote: string): { ok: boolean; reason: string } {
  if (!quote.trim()) return { ok: false, reason: "缺少可检查原文" };
  if (stage === "PERFORMED" || stage === "RECOGNIZED") {
    if (PLAN_RE.test(quote) && !PERFORMED_RE.test(quote) && !RECOGNIZED_RE.test(quote)) {
      return { ok: false, reason: "原文是计划或预测，不能当作已发生或已确认" };
    }
  }
  if (stage === "RECOGNIZED" && !RECOGNIZED_RE.test(quote) && !/营业收入|确认/.test(quote)) {
    return { ok: false, reason: "原文未支持收入已经确认" };
  }
  if (stage === "PERFORMED" && !PERFORMED_RE.test(quote) && PLAN_RE.test(quote)) {
    return { ok: false, reason: "原文未支持合同或事项已经履行" };
  }
  if (stage === "ANNOUNCED" && !ANNOUNCED_RE.test(quote) && !/签署|签订/.test(quote)) {
    return { ok: false, reason: "原文未表明公司已公告该事项" };
  }
  if (stage === "PLANNED" && !(PLAN_RE.test(quote) || /意向/.test(quote))) {
    return { ok: false, reason: "原文未支持这是计划或意向" };
  }
  return { ok: true, reason: "原文语言与命题阶段一致" };
}

function companyMatches(evidence: EvidenceRecord, companyName: string | null, securityCode: string | null): boolean {
  if (!companyName && !securityCode) return false;
  const hay = `${evidence.quote} ${evidence.title} ${evidence.companyName || ""} ${evidence.securityCode || ""}`;
  if (securityCode && hay.includes(securityCode)) return true;
  if (companyName && hay.includes(companyName)) return true;
  if (evidence.securityCode && securityCode && evidence.securityCode === securityCode) return true;
  return false;
}

function isOldNews(occurredAt: string | null, disclosedAt: string | null, discoveredAt: string): boolean {
  const stamp = disclosedAt || occurredAt;
  if (!stamp) return false;
  const then = Date.parse(stamp);
  const now = Date.parse(discoveredAt);
  if (!Number.isFinite(then) || !Number.isFinite(now)) return false;
  return now - then > OLD_NEWS_DAYS * 24 * 3600 * 1000;
}

export function uniqueOriginEvidence(records: EvidenceRecord[]): EvidenceRecord[] {
  const byOrigin = new Map<string, EvidenceRecord>();
  for (const record of records) {
    const key = record.reprintOf || record.originKey || record.rawHash;
    const existing = byOrigin.get(key);
    if (!existing) {
      byOrigin.set(key, record);
      continue;
    }
    const preferred = record.sourceKind === "OFFICIAL_DISCLOSURE" && existing.sourceKind !== "OFFICIAL_DISCLOSURE";
    if (preferred) byOrigin.set(key, record);
  }
  return [...byOrigin.values()];
}

export function verifyProposition(input: PropositionInput): VerificationResult {
  const reasons: string[] = [];
  const unique = uniqueOriginEvidence(input.evidence);
  if (unique.length === 0) {
    reasons.push("没有可检查的原文");
  }
  let matching = 0;
  let languageOk = 0;
  for (const item of unique) {
    if (companyMatches(item, input.companyName, input.securityCode)) matching += 1;
    else reasons.push(`来源「${item.title}」未匹配公司身份`);
    const language = quoteSupports(input.stage, item.quote);
    if (language.ok) languageOk += 1;
    else reasons.push(language.reason);
  }
  if (input.claimedNew && isOldNews(input.occurredAt, input.disclosedAt, input.discoveredAt)) {
    reasons.push("披露或发生时间过久，不能当作新事件");
  }

  const identityOk = matching > 0;
  const quoteOk = languageOk > 0;
  const checkScope = [
    "company_identity",
    "quote_stage_alignment",
    "origin_dedupe",
    unique.some((item) => item.sourceKind === "OFFICIAL_DISCLOSURE") ? "official_source" : "non_official_source",
  ];
  const accepted = identityOk && quoteOk && !reasons.some((item) => item.includes("不能当作"));
  let verification: V2VerificationStatus = accepted ? "VERIFIED" : "UNVERIFIED";
  if (!identityOk || !quoteOk) verification = "REJECTED";
  if (reasons.some((item) => item.includes("计划或预测"))) verification = "REJECTED";

  const attributed = input.attributedSpeaker || (unique[0]?.sourceKind === "OFFICIAL_DISCLOSURE" ? input.companyName : null);
  const event: ResearchEvent = {
    id: crypto.randomUUID(),
    projectId: input.projectId,
    description: input.description,
    stage: input.stage,
    proposition: input.proposition,
    occurredAt: input.occurredAt,
    disclosedAt: input.disclosedAt,
    discoveredAt: input.discoveredAt,
    verification,
    evidenceIds: unique.map((item) => item.id),
    originKey: originKeyFor(unique),
    correctionOf: null,
    checkScope,
    limitations: accepted ? [] : reasons,
    attributedSpeaker: attributed,
  };
  return { event, accepted: verification === "VERIFIED", reasons };
}

export function mergeSameOriginEvents(events: ResearchEvent[]): ResearchEvent[] {
  const map = new Map<string, ResearchEvent>();
  for (const event of events) {
    const key = `${event.originKey}:${event.stage}:${event.proposition}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, event);
      continue;
    }
    existing.evidenceIds = [...new Set([...existing.evidenceIds, ...event.evidenceIds])];
  }
  return [...map.values()];
}

export function hashText(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function canonicalOrigin(url: string | null, title: string, quote: string): string {
  if (url) {
    try {
      const parsed = new URL(url);
      parsed.hash = "";
      parsed.search = "";
      return parsed.toString();
    } catch {
      return url;
    }
  }
  return hashText(`${title}\n${quote}`).slice(0, 24);
}
