import React from "react";
import {
  CheckCircle2,
  HelpCircle,
  Minus,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type { ArgumentStatus, Maturity, InterimSignal, SupportLevel } from "./types";

/**
 * Demo-only presentation primitives.
 *
 * Colour semantics follow DESIGN.md and 10_前端实现设计.md §6:
 *   SUPPORTED           green
 *   PARTIALLY_SUPPORTED blue / neutral
 *   WEAKENED            orange  (NOT red — this is a research finding, not an error)
 *   UNRESOLVED          grey
 * Status is always conveyed with text + icon as well, never colour alone.
 * No confidence percentages are invented anywhere in this demo.
 */

export interface StatusMeta {
  label: string;
  code: ArgumentStatus;
  /** Short label for dense rows. */
  short: string;
  chip: string;
  dot: string;
  border: string;
  surface: string;
  text: string;
  Icon: React.ComponentType<{ className?: string }>;
}

export const STATUS_META: Record<ArgumentStatus, StatusMeta> = {
  SUPPORTED: {
    label: "已获支持",
    code: "SUPPORTED",
    short: "支持",
    chip: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
    border: "border-l-emerald-500",
    surface: "bg-emerald-50/60",
    text: "text-emerald-700",
    Icon: CheckCircle2,
  },
  PARTIALLY_SUPPORTED: {
    label: "部分支持",
    code: "PARTIALLY_SUPPORTED",
    short: "部分",
    chip: "bg-blue-50 text-blue-700 border-blue-200",
    dot: "bg-blue-500",
    border: "border-l-blue-500",
    surface: "bg-blue-50/60",
    text: "text-blue-700",
    Icon: Minus,
  },
  WEAKENED: {
    label: "已削弱",
    code: "WEAKENED",
    short: "削弱",
    chip: "bg-amber-50 text-amber-800 border-amber-200",
    dot: "bg-amber-500",
    border: "border-l-amber-500",
    surface: "bg-amber-50/60",
    text: "text-amber-800",
    Icon: TrendingDown,
  },
  UNRESOLVED: {
    label: "待验证",
    code: "UNRESOLVED",
    short: "待验证",
    chip: "bg-slate-100 text-slate-600 border-slate-200",
    dot: "bg-slate-400",
    border: "border-l-slate-300",
    surface: "bg-slate-50",
    text: "text-slate-600",
    Icon: HelpCircle,
  },
};

export const MATURITY_META: Record<Maturity, { label: string; hint: string; className: string }> = {
  NOT_DUE: {
    label: "未到期",
    hint: "核验窗口尚未开始或无适用期间",
    className: "bg-slate-100 text-slate-600 border-slate-200",
  },
  IN_PROGRESS: {
    label: "进行中",
    hint: "核验窗口未关闭：阶段信号可以给出，终局结论不能给出",
    className: "bg-sky-50 text-sky-700 border-sky-200",
  },
  DUE: {
    label: "已到期",
    hint: "核验窗口已关闭，允许给出终局结论",
    className: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },
};

export const SIGNAL_META: Record<InterimSignal, { label: string; className: string; Icon: React.ComponentType<{ className?: string }> }> = {
  ABOVE: { label: "高于节奏", className: "text-emerald-700", Icon: TrendingUp },
  ON_TRACK: { label: "符合节奏", className: "text-blue-700", Icon: TrendingUp },
  BELOW: { label: "低于节奏", className: "text-amber-800", Icon: TrendingDown },
  UNKNOWN: { label: "节奏未知", className: "text-slate-500", Icon: HelpCircle },
};

/**
 * Pillar 3's admission gate. This is the vocabulary that makes "只有强事实支撑
 * 的才会被作为论据" visible rather than implicit.
 */
export const SUPPORT_META: Record<
  SupportLevel,
  { label: string; admitted: string; chip: string; bar: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  STRONG: {
    label: "强支撑",
    admitted: "采纳为论据",
    chip: "bg-emerald-50 text-emerald-700 border-emerald-300",
    bar: "bg-emerald-500",
    Icon: ShieldCheck,
  },
  WEAK: {
    label: "弱支撑",
    admitted: "不予采纳",
    chip: "bg-amber-50 text-amber-800 border-amber-300",
    bar: "bg-amber-400",
    Icon: HelpCircle,
  },
  PENDING: {
    label: "待证据",
    admitted: "尚无证据",
    chip: "bg-slate-100 text-slate-600 border-slate-200",
    bar: "bg-slate-300",
    Icon: HelpCircle,
  },
};

export const StatusChip: React.FC<{ status: ArgumentStatus; size?: "sm" | "md" }> = ({ status, size = "md" }) => {
  const meta = STATUS_META[status];
  const Icon = meta.Icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border font-semibold whitespace-nowrap ${meta.chip} ${
        size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-[11px]"
      }`}
      title={`${meta.label} · ${meta.code}`}
    >
      <Icon className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
      {meta.label}
      <span className="font-mono opacity-60">{meta.code}</span>
    </span>
  );
};

export const Tag: React.FC<{ className?: string; title?: string; children: React.ReactNode }> = ({
  className = "",
  title,
  children,
}) => (
  <span
    title={title}
    className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap ${className}`}
  >
    {children}
  </span>
);

/** Small labelled block used across the channel panels. */
export const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode; className?: string }> = ({
  label,
  hint,
  children,
  className = "",
}) => (
  <div className={className}>
    <div className="mb-1 flex items-baseline gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
      {hint && <span className="text-[10px] text-slate-400">{hint}</span>}
    </div>
    {children}
  </div>
);

export const Card: React.FC<{
  className?: string;
  children: React.ReactNode;
  as?: "div" | "section" | "article";
}> = ({ className = "", children, as: As = "div" }) => (
  <As
    className={`rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,33,63,0.04)] ${className}`}
  >
    {children}
  </As>
);

export const CardHead: React.FC<{
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}> = ({ eyebrow, title, right, className = "" }) => (
  <div className={`flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 ${className}`}>
    <div className="min-w-0">
      {eyebrow && <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{eyebrow}</div>}
      <h3 className="text-[13px] font-bold text-slate-900">{title}</h3>
    </div>
    {right && <div className="shrink-0">{right}</div>}
  </div>
);

/** The monospace numeric style — numbers are a distinct visual register. */
export const Num: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = "" }) => (
  <span className={`font-mono tabular-nums tracking-tight ${className}`}>{children}</span>
);
