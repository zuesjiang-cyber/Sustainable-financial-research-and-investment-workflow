import React from "react";
import {
  ArrowDownRight,
  CheckCircle2,
  CircleSlash,
  HelpCircle,
  Minus,
  ShieldCheck,
  ShieldQuestion,
  ShieldX,
} from "lucide-react";
import type { ArgumentStatus, InterimSignal, Maturity, SupportLevel } from "./types";

/**
 * Status vocabulary and its visual encoding.
 *
 * Colour is spent only on status; ink does every other kind of emphasis. The
 * four hues are deliberately desaturated — a weakened thesis is a research
 * finding, not an error, so it gets terracotta rather than alarm red. Status is
 * always paired with a word and an icon, never carried by colour alone.
 */

export interface StatusMeta {
  label: string;
  /** Short form for tight spaces. */
  short: string;
  pill: string;
  mark: string;
  Icon: React.ComponentType<{ className?: string }>;
}

export const STATUS: Record<ArgumentStatus, StatusMeta> = {
  SUPPORTED: {
    label: "已验证",
    short: "验证",
    pill: "rd-status is-ok",
    mark: "is-ok",
    Icon: CheckCircle2,
  },
  PARTIALLY_SUPPORTED: {
    label: "部分支持",
    short: "部分",
    pill: "rd-status is-part",
    mark: "is-part",
    Icon: Minus,
  },
  WEAKENED: {
    label: "被削弱",
    short: "削弱",
    pill: "rd-status is-weak",
    mark: "is-weak",
    Icon: ArrowDownRight,
  },
  UNRESOLVED: {
    label: "待跟踪",
    short: "待跟踪",
    pill: "rd-status is-open",
    mark: "is-open",
    Icon: HelpCircle,
  },
};

export const MATURITY: Record<Maturity, { label: string; hint: string }> = {
  NOT_DUE: { label: "未到期", hint: "核验窗口尚未开始" },
  IN_PROGRESS: { label: "进行中", hint: "窗口未关闭：可以给阶段信号，不能给终局结论" },
  DUE: { label: "已到期", hint: "窗口已关闭，允许给出终局结论" },
};

export const SIGNAL: Record<InterimSignal, { label: string }> = {
  ABOVE: { label: "高于节奏" },
  ON_TRACK: { label: "符合节奏" },
  BELOW: { label: "低于节奏" },
  UNKNOWN: { label: "节奏未知" },
};

/**
 * Pillar 3's admission gate. STRONG enters the roll-up; WEAK is recorded and
 * displayed but explicitly not admitted; PENDING has no evidence yet.
 */
export const SUPPORT: Record<
  SupportLevel,
  { label: string; admitted: string; mark: string; tag: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  STRONG: {
    label: "强支撑",
    admitted: "采纳",
    mark: "rd-arg-mark is-strong",
    tag: "rd-arg-tag is-strong",
    Icon: ShieldCheck,
  },
  WEAK: {
    label: "弱支撑",
    admitted: "不采纳",
    mark: "rd-arg-mark is-weak",
    tag: "rd-arg-tag is-weak",
    Icon: ShieldX,
  },
  PENDING: {
    label: "待证据",
    admitted: "尚无",
    mark: "rd-arg-mark is-pending",
    tag: "rd-arg-tag is-pending",
    Icon: ShieldQuestion,
  },
};

/** Attribution tiers — the discipline that keeps causes honest. */
export const ATTRIBUTION: Record<
  string,
  { label: string; className: string; note: string }
> = {
  MANAGEMENT_EXPLANATION: {
    label: "管理层归因",
    className: "rd-attr is-mgmt",
    note: "归因方即被评价方。这是公司的说法，不是系统独立证明的因果。",
  },
  DISCLOSED_FACT: {
    label: "披露事实",
    className: "rd-attr",
    note: "可在报表或附注中直接核对。",
  },
  SYSTEM_HYPOTHESIS: {
    label: "系统假设",
    className: "rd-attr",
    note: "未被证明。列出支持线索、反证与仍缺的验证，不与披露事实混排。",
  },
};

export const RELATION: Record<string, { label: string }> = {
  SUPPORTS: { label: "支持该判断" },
  REFUTES: { label: "反驳该判断" },
  RELATED_ONLY: { label: "仅相关，不构成证明" },
  INSUFFICIENT: { label: "证据不足" },
};

export const QUESTION_STATE: Record<string, { label: string; className: string }> = {
  OPEN: { label: "未决", className: "rd-q-state is-open" },
  ANSWERED: { label: "已回答", className: "rd-q-state is-answered" },
  DEFERRED: { label: "延后", className: "rd-q-state is-deferred" },
};

export const CORRECTION_KIND: Record<string, string> = {
  THESIS_TEXT: "论述文本",
  CRITERION: "核验门槛",
  USER_JUDGMENT: "用户研判",
  RESEARCH_PREFERENCE: "研究偏好",
};

/** Kept for the refusal state, where an icon reads faster than a word. */
export const RefusedIcon = CircleSlash;

/* ------------------------------------------------------------------ */
/* 画面二 — 事实与推论的词汇                                             */
/* ------------------------------------------------------------------ */

/**
 * Evidence nature, and what it is allowed to do.
 *
 * `canSettleNumericFact` is the whole point of the layer: an unaudited forecast
 * can move the user's attention but can never make a numeric fact hold. The
 * downgrade is applied before judgement, not after.
 */
export const NATURE: Record<
  string,
  { label: string; short: string; canSettleNumericFact: boolean; className: string }
> = {
  AUDITED: {
    label: "经审计",
    short: "审计",
    canSettleNumericFact: true,
    className: "is-audited",
  },
  UNAUDITED_ACTUAL: {
    label: "未经审计实际数",
    short: "实际数",
    canSettleNumericFact: true,
    className: "is-actual",
  },
  PRELIMINARY: {
    label: "业绩快报",
    short: "快报",
    canSettleNumericFact: false,
    className: "is-prelim",
  },
  FORECAST: {
    label: "业绩预告",
    short: "预告",
    canSettleNumericFact: false,
    className: "is-forecast",
  },
  NARRATIVE: {
    label: "叙述性披露",
    short: "叙述",
    canSettleNumericFact: false,
    className: "is-narrative",
  },
  THIRD_PARTY: {
    label: "第三方",
    short: "第三方",
    canSettleNumericFact: false,
    className: "is-third",
  },
};

export const VERDICT: Record<
  string,
  { label: string; className: string }
> = {
  HOLDS: { label: "成立", className: "is-holds" },
  FAILS: { label: "不成立", className: "is-fails" },
};

export const INFERENCE_STRENGTH: Record<string, { label: string; className: string }> = {
  MODERATE: { label: "有一定依据", className: "is-moderate" },
  TENTATIVE: { label: "尚属试探", className: "is-tentative" },
};

export const FACT_KIND: Record<string, string> = {
  NUMERIC: "数值",
  DISCLOSURE: "披露",
  EVIDENCE_EXISTS: "证据存在性",
};

/**
 * A thesis statement carries its own admission criterion in a trailing
 * parenthetical. Splitting it rather than parsing it inline keeps the criterion
 * visible as a separate thing on every surface — it is the rule the user agreed
 * to, and it must not be absorbed into the prose where it can be quietly
 * rewritten by a later round.
 */
export function splitCriterion(statement: string): { title: string; criterion: string | null } {
  const m = statement.match(/^(.*?)（核验门槛：(.+?)）[。.]?$/);
  if (!m) return { title: statement, criterion: null };
  return { title: m[1].trim(), criterion: m[2].trim() };
}
