import React from "react";
import {
  GitBranch,
  Lock,
  MessageSquareQuote,
  Scale,
  ShieldCheck,
  ShieldQuestion,
  ShieldX,
  Sparkles,
  UserCheck,
} from "lucide-react";
import type { AtomicClaim, SupportLevel, Thesis, ThesisVersionView } from "./types";
import { MATURITY_META, SIGNAL_META, SUPPORT_META, StatusChip, Tag } from "./primitives";

/**
 * Pillar 3 — 论述拆到论据，只有强事实支撑的才会被作为论据.
 *
 * The tree makes the decomposition visible; the gate makes the admission rule
 * visible. A claim enters the roll-up only when its argument carries STRONG
 * factual support this round. WEAK support is recorded and displayed but
 * explicitly not counted, with a written reason. The roll-up then contrasts the
 * naive conclusion (what a summarising assistant would say) with the honest one.
 */

const SUPPORT_ICON: Record<SupportLevel, React.ComponentType<{ className?: string }>> = {
  STRONG: ShieldCheck,
  WEAK: ShieldX,
  PENDING: ShieldQuestion,
};

const ORIGIN_META: Record<
  AtomicClaim["criterionOrigin"],
  { label: string; className: string; hint: string }
> = {
  REPORT_EXPLICIT: {
    label: "报告明示",
    className: "border-blue-200 bg-blue-50 text-blue-700",
    hint: "门槛来自研报原文，未被系统改写",
  },
  SYSTEM_PROPOSED: {
    label: "系统建议",
    className: "border-slate-200 bg-slate-50 text-slate-600",
    hint: "系统提出的可核验门槛，需用户确认后才生效",
  },
  USER_CONFIRMED: {
    label: "用户确认",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    hint: "门槛经用户明确确认，优先级高于系统建议",
  },
};

/* ------------------------------------------------------------------ */

interface Props {
  thesis: Thesis;
  view: ThesisVersionView;
  activeVersion: string;
  selectedArgumentId: string | null;
  onSelectArgument: (argumentId: string) => void;
}

export const ArgumentTree: React.FC<Props> = ({
  thesis,
  view,
  activeVersion,
  selectedArgumentId,
  onSelectArgument,
}) => {
  const maturity = MATURITY_META[view.maturity];
  const admitted = view.rollUp.admitted;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,33,63,0.04)]">
      {/* Thesis header — identity is stable, revision is visible */}
      <div className="border-b border-slate-100 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <GitBranch className="h-3.5 w-3.5 text-blue-600" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                论点 · 拆解为 {thesis.claims.length} 条原子论据
              </span>
            </div>

            <p className="mt-1.5 text-[13px] leading-relaxed font-medium text-slate-900">
              {thesis.currentStatement}
            </p>

            {thesis.currentStatement !== thesis.originalStatement && (
              <p className="mt-1 flex items-start gap-1 rounded border border-amber-200 bg-amber-50/60 px-2 py-1 text-[10px] leading-snug text-amber-900/80">
                <MessageSquareQuote className="mt-[1px] h-2.5 w-2.5 shrink-0" />
                <span>
                  研报原文：「{thesis.originalStatement}」（{thesis.originalSource.fileName} 第{" "}
                  {thesis.originalSource.page} 页）· 现文本为第 {thesis.revision} 版修订，原文保留可回溯
                </span>
              </p>
            )}

            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Tag className="border-slate-200 bg-slate-50 font-mono text-slate-500">{thesis.thesisId}</Tag>
              <Tag className="border-slate-200 bg-slate-50 text-slate-500">
                优先级 {thesis.priority} · 修订 v{thesis.revision}
              </Tag>
            </div>
          </div>

          <div className="shrink-0 text-right">
            <StatusChip status={view.status} />
            <div className="mt-1.5 flex justify-end gap-1">
              <Tag className={maturity.className} title={maturity.hint}>
                {maturity.label}
              </Tag>
            </div>
          </div>
        </div>

        <p className="mt-2.5 rounded-md bg-slate-50 px-2.5 py-2 text-[11.5px] leading-relaxed text-slate-700">
          {view.summary}
        </p>

        {view.userJudgment && (
          <div className="mt-2 flex items-start gap-1.5 rounded-md border border-emerald-200 bg-emerald-50/60 px-2.5 py-2">
            <UserCheck className="mt-[2px] h-3 w-3 shrink-0 text-emerald-600" />
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                用户判断{view.userJudgmentCarriedFrom ? `（自 ${view.userJudgmentCarriedFrom} 结转）` : ""}
              </div>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-slate-700">{view.userJudgment}</p>
            </div>
          </div>
        )}
      </div>

      {/* Claims with the admission gate */}
      <div className="px-4 py-3">
        <div className="mb-2 flex items-center gap-2">
          <Scale className="h-3.5 w-3.5 text-slate-400" />
          <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">论据准入门禁</span>
          <span className="h-px flex-1 bg-slate-100" />
          <span className="font-mono text-[10px] text-slate-400">
            采纳 {view.rollUp.admitted.length} · 不予采纳 {view.rollUp.rejected.length} · 待证据{" "}
            {view.rollUp.pending.length}
          </span>
        </div>

        <ol className="space-y-1.5">
          {thesis.claims.map((claim) => {
            const av = claim.versions[activeVersion];
            const isSelected = claim.argumentId === selectedArgumentId;
            if (!av) {
              return (
                <li
                  key={claim.argumentId}
                  className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2"
                >
                  <span className="font-mono text-[10px] text-slate-400">{claim.argumentId}</span>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    本轮（{activeVersion}）未涉及该论据：{claim.statement}
                  </p>
                </li>
              );
            }

            const meta = SUPPORT_META[av.supportLevel];
            const Icon = SUPPORT_ICON[av.supportLevel];
            const origin = ORIGIN_META[claim.criterionOrigin];
            const signal = SIGNAL_META[av.interimSignal];
            const SignalIcon = signal.Icon;
            const isAdmitted = admitted.includes(claim.argumentId);

            return (
              <li key={claim.argumentId}>
                <div
                  className={`overflow-hidden rounded-lg border transition-all ${
                    isSelected
                      ? "border-blue-400 shadow-[0_0_0_3px_rgba(24,90,219,0.08)]"
                      : "border-slate-200 hover:border-slate-300"
                  } ${meta.surface}`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectArgument(claim.argumentId)}
                    aria-expanded={isSelected}
                    className="w-full cursor-pointer px-3 py-2 text-left"
                  >
                    <div className="flex items-start gap-2">
                      <span className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${meta.bar}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-[10px] font-semibold text-slate-400">
                            {claim.argumentId}
                          </span>
                          <Tag className="border-slate-200 bg-white text-slate-500">{claim.kindLabel}</Tag>
                          <Tag className={origin.className} title={origin.hint}>
                            门槛 · {origin.label}
                          </Tag>
                          <span
                            className={`inline-flex items-center gap-1 rounded border px-1.5 py-[1px] text-[9.5px] font-bold ${meta.chip}`}
                          >
                            <Icon className="h-2.5 w-2.5" />
                            {meta.label} · {meta.admitted}
                          </span>
                          <span className="ml-auto flex items-center gap-1">
                            {av.activeChannels.includes("NUMERIC") && (
                              <Tag className="border-blue-200 bg-white font-mono text-blue-600">数字</Tag>
                            )}
                            {av.activeChannels.includes("SEMANTIC") && (
                              <Tag className="border-blue-200 bg-white font-mono text-blue-600">
                                <Sparkles className="h-2.5 w-2.5" /> 语义
                              </Tag>
                            )}
                          </span>
                        </div>

                        <p className="mt-1 text-[11.5px] leading-relaxed text-slate-800">{claim.statement}</p>
                        <p className="mt-0.5 text-[10px] leading-snug text-slate-500">
                          核验对象：{claim.verificationTarget}
                        </p>

                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                          <StatusChip status={av.status} size="sm" />
                          <Tag className="border-slate-200 bg-white text-[9.5px] text-slate-500" title="阶段信号是事实陈述，不含趋势外推">
                            <SignalIcon className={`h-2.5 w-2.5 ${signal.className}`} />
                            {signal.label}
                          </Tag>
                          {av.changeNote && (
                            <span className="text-[9.5px] leading-snug text-slate-400">
                              相对上轮：{av.changeNote}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>

                  {/* Gate reason — always visible; this IS the pillar */}
                  <div
                    className={`flex items-start gap-1.5 border-t px-3 py-1.5 ${
                      isAdmitted ? "border-emerald-200/70 bg-emerald-50/70" : "border-amber-200/70 bg-amber-50/70"
                    }`}
                  >
                    {isAdmitted ? (
                      <ShieldCheck className="mt-[1px] h-3 w-3 shrink-0 text-emerald-600" />
                    ) : (
                      <Lock className="mt-[1px] h-3 w-3 shrink-0 text-amber-600" />
                    )}
                    <span className="text-[10px] leading-snug text-slate-600">
                      <span className="font-semibold text-slate-700">
                        {isAdmitted ? "准入门禁：通过 → 计入合成" : "准入门禁：未通过 → 不计入合成"}
                      </span>{" "}
                      {av.gateReason}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <RollUpPanel rollUp={view.rollUp} />
    </div>
  );
};

/* ------------------------------------------------------------------ */

const RollUpPanel: React.FC<{ rollUp: ThesisVersionView["rollUp"] }> = ({ rollUp }) => {
  const meta = SUPPORT_META[
    rollUp.resultingStatus === "SUPPORTED" ? "STRONG" : rollUp.resultingStatus === "WEAKENED" ? "WEAK" : "PENDING"
  ];

  return (
    <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <Scale className="h-3.5 w-3.5 text-blue-600" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            合成判定 · 只统计已采纳论据
          </span>
        </div>
        <StatusChip status={rollUp.resultingStatus} />
      </div>

      {/* The aggregation rule is shown, not hidden */}
      <ol className="mb-2.5 space-y-1">
        {rollUp.rule.map((r, i) => (
          <li key={i} className="flex items-start gap-1.5">
            <span className="mt-[2px] flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-slate-200 font-mono text-[9px] font-bold text-slate-600">
              {i + 1}
            </span>
            <span className="text-[10.5px] leading-relaxed text-slate-600">{r}</span>
          </li>
        ))}
      </ol>

      {/* Three buckets */}
      <div className="grid gap-2 md:grid-cols-3">
        <Bucket
          title="已采纳为论据"
          tone="emerald"
          Icon={ShieldCheck}
          items={rollUp.admitted.map((id) => ({ id, note: "强事实支撑" }))}
          empty="本轮无任何论据达到强支撑"
        />
        <Bucket
          title="不予采纳（附理由）"
          tone="amber"
          Icon={ShieldX}
          items={rollUp.rejected.map((r) => ({ id: r.argumentId, note: r.reason }))}
          empty="本轮没有被拒绝的论据"
        />
        <Bucket
          title="尚无证据"
          tone="slate"
          Icon={ShieldQuestion}
          items={rollUp.pending.map((id) => ({ id, note: "等待后续披露" }))}
          empty="本轮无待证论据"
        />
      </div>

      {/* naive vs honest */}
      <div className="mt-2.5 grid gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 md:grid-cols-2">
        <div className="bg-white px-3 py-2.5">
          <div className="mb-1 flex items-center gap-1.5">
            <ShieldX className="h-3 w-3 text-rose-500" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600">朴素汇总会写成</span>
          </div>
          <p className="text-[11.5px] leading-relaxed text-slate-500 line-through decoration-rose-300">
            {rollUp.naiveSummary}
          </p>
          <p className="mt-1 text-[9.5px] leading-snug text-slate-400">
            只看"指标是否达标"就下结论，会把归因未被证明的部分一并算作已证明。
          </p>
        </div>
        <div className="bg-white px-3 py-2.5">
          <div className="mb-1 flex items-center gap-1.5">
            <ShieldCheck className="h-3 w-3 text-emerald-600" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
              本系统的诚实结论
            </span>
          </div>
          <p className="text-[11.5px] leading-relaxed font-medium text-slate-800">{rollUp.honestConclusion}</p>
          <p className="mt-1 font-mono text-[9.5px] text-slate-400">
            support = {meta.label} · 采纳 {rollUp.admitted.length}/{rollUp.admitted.length + rollUp.rejected.length + rollUp.pending.length}
          </p>
        </div>
      </div>
    </div>
  );
};

const Bucket: React.FC<{
  title: string;
  tone: "emerald" | "amber" | "slate";
  Icon: React.ComponentType<{ className?: string }>;
  items: Array<{ id: string; note: string }>;
  empty: string;
}> = ({ title, tone, Icon, items, empty }) => {
  const toneClass = {
    emerald: "border-emerald-200 bg-emerald-50/50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50/50 text-amber-800",
    slate: "border-slate-200 bg-slate-50 text-slate-600",
  }[tone];
  const iconClass = {
    emerald: "text-emerald-600",
    amber: "text-amber-600",
    slate: "text-slate-400",
  }[tone];

  return (
    <div className={`rounded-lg border px-2.5 py-2 ${toneClass}`}>
      <div className="mb-1 flex items-center gap-1.5">
        <Icon className={`h-3 w-3 ${iconClass}`} />
        <span className="text-[10px] font-bold uppercase tracking-wider">{title}</span>
        <span className="ml-auto font-mono text-[10px] opacity-70">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-[10px] opacity-70">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {items.map((it) => (
            <li key={it.id}>
              <span className="block font-mono text-[9.5px] font-semibold opacity-80">{it.id}</span>
              <span className="block text-[10px] leading-snug text-slate-600">{it.note}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
