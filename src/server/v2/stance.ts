import crypto from "node:crypto";
import type { UserStanceVersion } from "../../shared/v2Domain";

const FORWARD_RE = /转发|分享(了|一)?篇|研报如下|原文如下|附件是|券商认为|分析师认为|报告指出|研报指出|这篇研报|此份研报/;
const EXPLICIT_RE = /我(个人)?.{0,8}(认为|判断|觉得|看好|看空|看多|维持|不认可|不同意|同意|坚持|加仓|减仓|持有)/;
const IMPLIED_OPINION_RE = /^(长期|继续)?(看好|看空|看多|看淡).{0,40}$/;
const LOOSE_OPINION_RE = /(长期)?(看好|看空|看多|看淡|看坏)/;
const THRESHOLD_RE = /([毛利率|净利率|营收|收入|增速|ROE|ROIC|市值][^\n]{0,12})(不低于|高于|低于|超过|达到)\s*([0-9]+(?:\.[0-9]+)?)\s*(%|亿元|万元|倍)?/;

export interface StanceClassification {
  kind: "FORWARD_ONLY" | "EXPLICIT_STANCE" | "IMPLIED_STANCE" | "UNCLEAR";
  endorsed: boolean;
  summary: string;
  reasons: string[];
  thresholds: UserStanceVersion["thresholds"];
}

export function classifyUserInput(rawText: string): StanceClassification {
  const text = String(rawText || "").trim();
  if (!text) return { kind: "UNCLEAR", endorsed: false, summary: "", reasons: [], thresholds: [] };

  const forwarded = FORWARD_RE.test(text);
  const explicit = EXPLICIT_RE.test(text);
  const compact = text.replace(/\s+/g, "");
  const implied = IMPLIED_OPINION_RE.test(compact) || (LOOSE_OPINION_RE.test(text) && text.length <= 80);
  const thresholds: UserStanceVersion["thresholds"] = [];
  const match = text.match(THRESHOLD_RE);
  if (match && explicit) {
    thresholds.push({
      metric: match[1].trim(),
      op: match[2],
      value: `${match[3]}${match[4] || ""}`,
      source: "USER_EXPLICIT",
    });
  }

  if (forwarded && !explicit) {
    return {
      kind: "FORWARD_ONLY",
      endorsed: false,
      summary: "",
      reasons: [],
      thresholds: [],
    };
  }
  if (explicit) {
    return {
      kind: "EXPLICIT_STANCE",
      endorsed: true,
      summary: summarizeStance(text),
      reasons: extractReasons(text),
      thresholds,
    };
  }
  if (implied && !forwarded) {
    return {
      kind: "IMPLIED_STANCE",
      endorsed: true,
      summary: text.slice(0, 80),
      reasons: [],
      thresholds: [],
    };
  }
  if (forwarded) {
    return { kind: "FORWARD_ONLY", endorsed: false, summary: "", reasons: [], thresholds: [] };
  }
  return { kind: "UNCLEAR", endorsed: false, summary: "", reasons: [], thresholds: [] };
}

function summarizeStance(text: string): string {
  const first = text.split(/[。！？\n]/).map((part) => part.trim()).find((part) => EXPLICIT_RE.test(part) || IMPLIED_OPINION_RE.test(part.replace(/\s+/g, "")));
  return (first || text).slice(0, 160);
}

function extractReasons(text: string): string[] {
  const reasons: string[] = [];
  const because = text.match(/(?:因为|原因是|理由是|核心是)([^。\n]+)/g) || [];
  for (const item of because) reasons.push(item.replace(/^(因为|原因是|理由是|核心是)/, "").trim());
  return reasons.slice(0, 6);
}

export function createStanceVersion(input: {
  rawText: string;
  classification: StanceClassification;
  previous?: UserStanceVersion | null;
  changeReason?: string | null;
  now: string;
}): UserStanceVersion | null {
  if (!input.classification.endorsed) return null;
  const previous = input.previous || null;
  return {
    id: crypto.randomUUID(),
    version: (previous?.version || 0) + 1,
    rawText: input.rawText,
    summary: input.classification.summary,
    reasons: input.classification.reasons,
    coreReasons: input.classification.reasons,
    auxiliaryReasons: [],
    thresholds: input.classification.thresholds,
    horizon: null,
    createdAt: input.now,
    supersedesId: previous?.id || null,
    changeReason: input.changeReason || null,
  };
}

export function extractMaterialViews(rawText: string, evidenceId: string): Array<{ author: string; text: string }> {
  const text = String(rawText || "");
  if (!FORWARD_RE.test(text) && !/研报|分析师|券商/.test(text)) return [];
  const authorMatch = text.match(/([\u4e00-\u9fff]{2,8}(?:证券|研究|研究所))/);
  const author = authorMatch?.[1] || "材料作者（未具名）";
  const quotes = text
    .split(/[。\n]/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 12 && !EXPLICIT_RE.test(part))
    .slice(0, 6);
  void evidenceId;
  return quotes.map((item) => ({ author, text: item }));
}
