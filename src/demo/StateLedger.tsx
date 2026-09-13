import React from "react";
import {
  ArrowRight,
  CircleDashed,
  GitCompareArrows,
  HelpCircle,
  Lock,
  CheckCircle2,
  PauseCircle,
  UserCog,
} from "lucide-react";
import type { ResearchVersion } from "./types";
import { Tag } from "./primitives";

/**
 * Pillar 1, continued: what actually moved between versions, whose hand moved
 * it, and what the system still refuses to close.
 *
 * Three ledgers, all keyed to the active version:
 *   状态变化  — the diff, including things that deliberately did NOT change
 *   用户修正  — corrections are inputs to later rounds, not annotations
 *   未决问题  — open / answered / deferred, never silently dropped
 */

interface Props {
  version: ResearchVersion;
  previous: ResearchVersion | null;
}

const QUESTION_META = {
  OPEN: { label: "未决", className: "border-amber-200 bg-amber-50 text-amber-800", Icon: HelpCircle },
  ANSWERED: { label: "已回答", className: "border-emerald-200 bg-emerald-50 text-emerald-700", Icon: CheckCircle2 },
  DEFERRED: { label: "延后", className: "border-slate-200 bg-slate-100 text-slate-600", Icon: PauseCircle },
} as const;

const CORRECTION_META: Record<string, { className: string; icon: string }> = {
  THESIS_TEXT: { className: "border-blue-200 bg-blue-50/60 text-blue-700", icon: "论述文本" },
  CRITERION: { className: "border-indigo-200 bg-indigo-50/60 text-indigo-700", icon: "核验门槛" },
  USER_JUDGMENT: { className: "border-emerald-200 bg-emerald-50/60 text-emerald-700", icon: "用户研判" },
  RESEARCH_PREFERENCE: { className: "border-slate-200 bg-slate-50 text-slate-600", icon: "研究偏好" },
};

export const StateLedger: React.FC<Props> = ({ version, previous }) => {
  const d = version.stateDelta;
  const openCount = version.questions.filter((q) => q.status === "OPEN").length;

  return (
    <div className="grid gap-2.5 xl:grid-cols-3">
      {/* ---- state delta ---- */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,33,63,0.04)]">
        <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-3.5 py-2">
          <div className="flex items-center gap-1.5">
            <GitCompareArrows className="h-3.5 w-3.5 text-blue-600" />
            <h3 className="text-[11px] font-bold text-slate-800">状态变化</h3>
          </div>
          <span className="font-mono text-[9.5px] text-slate-400">
            {previous ? `${previous.version} → ${version.version}` : `${version.version} 基线`}
          </span>
        </header>
        <div className="px-3.5 py-3">
          <p className="rounded-md bg-blue-50/60 px-2.5 py-2 text-[11.5px] leading-relaxed text-slate-800">
            {d.headline}
          </p>

          <div className="mt-2.5 space-y-2">
            <LedgerList
              title="发生变化"
              tone="emerald"
              items={d.changed}
              empty="本轮无状态迁移"
              Icon={ArrowRight}
            />
            <LedgerList
              title="刻意未变"
              tone="slate"
              items={d.unchanged}
              empty="—"
              Icon={Lock}
              hint="未变也是状态的一部分：不因新资料而被覆盖"
            />
            <LedgerList
              title="新增未决"
              tone="amber"
              items={d.newlyUnresolved}
              empty="本轮未新增未决项"
              Icon={CircleDashed}
            />
          </div>
        </div>
      </section>

      {/* ---- user corrections ---- */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,33,63,0.04)]">
        <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-3.5 py-2">
          <div className="flex items-center gap-1.5">
            <UserCog className="h-3.5 w-3.5 text-emerald-600" />
            <h3 className="text-[11px] font-bold text-slate-800">用户修正与研判</h3>
          </div>
          <span className="font-mono text-[9.5px] text-slate-400">{version.corrections.length} 条</span>
        </header>
        <div className="px-3.5 py-3">
          {version.corrections.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-2.5 py-3 text-center text-[11px] text-slate-500">
              本轮用户未作修正；系统输出未被人工干预。
            </p>
          ) : (
            <ul className="space-y-2">
              {version.corrections.map((c, i) => {
                const meta = CORRECTION_META[c.type] || CORRECTION_META.RESEARCH_PREFERENCE;
                return (
                  <li key={i} className={`rounded-lg border px-2.5 py-2 ${meta.className}`}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[9.5px] font-bold uppercase tracking-wider">{meta.icon}</span>
                      <span className="text-[10.5px] font-semibold text-slate-700">{c.label}</span>
                      {c.carriedForward && (
                        <Tag className="ml-auto border-emerald-300 bg-white text-emerald-700" title="作为后续每一轮的最高优先级上下文">
                          结转生效
                        </Tag>
                      )}
                    </div>
                    <div className="mt-1.5 space-y-1 rounded bg-white/70 px-2 py-1.5">
                      <p className="text-[10px] leading-snug text-slate-400 line-through decoration-slate-300">
                        {c.before}
                      </p>
                      <p className="text-[11px] leading-relaxed font-medium text-slate-800">{c.after}</p>
                    </div>
                    <p className="mt-1 text-[9.5px] leading-snug text-slate-500">理由：{c.reason}</p>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
            用户修正是下一轮的输入，不是批注：模型输出不会覆盖它，历史版本也不会被就地改写。
          </p>
        </div>
      </section>

      {/* ---- open questions ---- */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,33,63,0.04)]">
        <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-3.5 py-2">
          <div className="flex items-center gap-1.5">
            <HelpCircle className="h-3.5 w-3.5 text-amber-500" />
            <h3 className="text-[11px] font-bold text-slate-800">未决问题账本</h3>
          </div>
          <span className="font-mono text-[9.5px] text-slate-400">
            未决 {openCount} / 共 {version.questions.length}
          </span>
        </header>
        <div className="px-3.5 py-3">
          <ul className="space-y-1.5">
            {version.questions.map((q, i) => {
              const meta = QUESTION_META[q.status];
              const Icon = meta.Icon;
              return (
                <li key={i} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                  <div className="flex items-start gap-1.5">
                    <Icon className={`mt-[2px] h-3 w-3 shrink-0 ${
                      q.status === "OPEN" ? "text-amber-500" : q.status === "ANSWERED" ? "text-emerald-500" : "text-slate-400"
                    }`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] leading-relaxed text-slate-800">{q.text}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <Tag className={meta.className}>{meta.label}</Tag>
                        <span className="font-mono text-[9px] text-slate-400">
                          提出于 {q.createdIn}
                          {q.createdIn !== version.version && ` · 跨 ${version.version} 仍在跟踪`}
                        </span>
                      </div>
                      {q.answer && (
                        <p className="mt-1 rounded bg-slate-50 px-2 py-1.5 text-[10px] leading-relaxed text-slate-600">
                          {q.answer}
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
            问题不会被"已回答"悄悄关闭：部分回答转为 DEFERRED，继续留在账本上。
          </p>
        </div>
      </section>
    </div>
  );
};

const LedgerList: React.FC<{
  title: string;
  tone: "emerald" | "amber" | "slate";
  items: string[];
  empty: string;
  hint?: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = ({ title, tone, items, empty, hint, Icon }) => {
  const toneClass = {
    emerald: "text-emerald-600",
    amber: "text-amber-600",
    slate: "text-slate-400",
  }[tone];
  const bullet = {
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    slate: "bg-slate-300",
  }[tone];

  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5">
        <Icon className={`h-3 w-3 ${toneClass}`} />
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          {title}
          <span className="ml-1 font-mono text-slate-400">{items.length}</span>
        </span>
      </div>
      {items.length === 0 ? (
        <p className="pl-4 text-[10px] text-slate-400">{empty}</p>
      ) : (
        <ul className="space-y-0.5">
          {items.map((it, i) => (
            <li key={i} className="flex items-start gap-1.5 pl-4">
              <span className={`mt-[6px] h-1 w-1 shrink-0 rounded-full ${bullet}`} />
              <span className="text-[10.5px] leading-relaxed text-slate-600">{it}</span>
            </li>
          ))}
        </ul>
      )}
      {hint && <p className="mt-1 pl-4 text-[9.5px] leading-snug text-slate-400">{hint}</p>}
    </div>
  );
};
