import React from "react";
import {
  AlertTriangle,
  Ban,
  Calculator,
  Check,
  FileText,
  Quote,
  Scale,
  Search,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";
import type {
  ArgumentVersion,
  Attribution,
  ChannelComposition,
  NumericChannel,
  SemanticChannel,
} from "./types";
import { Field, Num, StatusChip, Tag } from "./primitives";

/**
 * Pillar 2 — 数字与语义双通道.
 *
 * The two channels are rendered as separate, self-contained panels that each
 * reach their own verdict, and only then compose. The composition rule is
 * displayed rather than hidden, and any tension between the channels is
 * surfaced explicitly — that tension is usually the interesting finding.
 */

const ATTRIBUTION_META: Record<
  Attribution["kind"],
  { className: string; note: string }
> = {
  MANAGEMENT_EXPLANATION: {
    className: "border-amber-200 bg-amber-50/70",
    note: "归因方即被评价方：这是公司的说法，不是系统独立证明的因果",
  },
  DISCLOSED_FACT: {
    className: "border-blue-200 bg-blue-50/70",
    note: "披露事实：可在报表或附注中直接核对",
  },
  SYSTEM_HYPOTHESIS: {
    className: "border-slate-200 bg-slate-50",
    note: "系统假设：未被证明，须列出缺失证据",
  },
};

const RELATION_META: Record<string, { label: string; className: string }> = {
  SUPPORTS: { label: "支持该判断", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  REFUTES: { label: "反驳该判断", className: "bg-amber-50 text-amber-800 border-amber-200" },
  RELATED_ONLY: { label: "仅相关，不构成证明", className: "bg-blue-50 text-blue-700 border-blue-200" },
  INSUFFICIENT: { label: "证据不足", className: "bg-slate-100 text-slate-600 border-slate-200" },
};

/* ------------------------------------------------------------------ */
/* Numeric channel                                                      */
/* ------------------------------------------------------------------ */

const NumericPanel: React.FC<{ numeric: NumericChannel }> = ({ numeric }) => {
  const allChecksPassed = numeric.checks.every((c) => c.passed);
  const refused = numeric.result === null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3.5 py-2">
        <div className="flex items-center gap-1.5">
          <Calculator className="h-3.5 w-3.5 text-blue-600" />
          <span className="text-[11px] font-bold text-slate-800">数字通道</span>
          <span className="text-[10px] text-slate-400">确定性代码 · Decimal.js</span>
        </div>
        <Tag className="border-slate-200 bg-slate-50 font-mono text-slate-500">
          {numeric.formulaId} v{numeric.formulaVersion}
        </Tag>
      </div>

      <div className="flex-1 space-y-3 px-3.5 py-3">
        {/* Registered formula — the model never does this arithmetic */}
        <Field label="注册公式" hint="模型不参与计算">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2">
            <Num className="block text-[11.5px] text-slate-800">{numeric.formula}</Num>
          </div>
        </Field>

        {/* Operands, each bound to a physical cell */}
        <Field label={`操作数（${numeric.operands.length}）`} hint="每个数都绑定到具体单元格与列头">
          <ul className="space-y-1.5">
            {numeric.operands.map((op) => (
              <li key={`${op.label}-${op.period}`} className="rounded-md border border-slate-200 bg-white px-2.5 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] text-slate-600">{op.label}</span>
                  <Num className="text-[12px] font-semibold text-slate-900">
                    {op.value}
                    <span className="ml-1 text-[10px] font-normal text-slate-400">{op.unit}</span>
                  </Num>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[9.5px] text-slate-400">
                  <span>{op.period}</span>
                  <span className="text-slate-300">|</span>
                  <span>{op.scope}</span>
                </div>
                <div className="mt-1 flex items-start gap-1 border-t border-slate-100 pt-1">
                  <FileText className="mt-[1px] h-2.5 w-2.5 shrink-0 text-slate-400" />
                  <span className="text-[9.5px] leading-snug text-slate-500">
                    {op.source.fileName} · 第 {op.source.page} 页 · {op.source.locator}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Field>

        {/* Comparability gate — this is what makes the number trustworthy */}
        <Field label="口径可比性门禁" hint="任一不通过即拒绝计算">
          <ul className="space-y-1">
            {numeric.checks.map((c) => (
              <li
                key={c.code}
                className={`flex items-start gap-1.5 rounded border px-2 py-1 ${
                  c.passed ? "border-emerald-100 bg-emerald-50/50" : "border-rose-200 bg-rose-50/60"
                }`}
              >
                {c.passed ? (
                  <Check className="mt-[2px] h-3 w-3 shrink-0 text-emerald-600" />
                ) : (
                  <X className="mt-[2px] h-3 w-3 shrink-0 text-rose-600" />
                )}
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className={`text-[10.5px] font-semibold ${c.passed ? "text-emerald-800" : "text-rose-800"}`}>
                      {c.label}
                    </span>
                    <span className="font-mono text-[9px] text-slate-400">{c.code}</span>
                  </span>
                  <span className="block text-[10px] leading-snug text-slate-500">{c.explanation}</span>
                </span>
              </li>
            ))}
          </ul>
        </Field>

        {/* Result, or an honest refusal */}
        {refused ? (
          <div className="rounded-md border border-rose-200 bg-rose-50/70 px-2.5 py-2">
            <div className="flex items-center gap-1.5">
              <Ban className="h-3.5 w-3.5 text-rose-600" />
              <span className="text-[11px] font-bold text-rose-800">拒绝计算</span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-rose-900/80">{numeric.refusalReason}</p>
            <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">
              门禁未通过时，诚实的输出是一个拒绝理由，而不是一个看起来合理的数字。
            </p>
          </div>
        ) : (
          <div className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2">
            <div className="flex items-end justify-between gap-2">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Decimal 计算结果</div>
                <Num className="text-[20px] font-bold leading-tight text-slate-900">{numeric.resultDisplay}</Num>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">核验门槛</div>
                <Num className="text-[12px] font-semibold text-slate-700">{numeric.targetDisplay}</Num>
              </div>
            </div>
            {numeric.gapDisplay && (
              <div className="mt-1.5 flex items-center gap-1.5 border-t border-slate-200 pt-1.5">
                <Scale className="h-3 w-3 shrink-0 text-slate-400" />
                <span className="text-[11px] text-slate-700">
                  差额 <Num className="font-semibold">{numeric.gapDisplay}</Num>
                </span>
              </div>
            )}
            <div className="mt-1 font-mono text-[9.5px] text-slate-400">
              result = {numeric.result} · 门禁 {allChecksPassed ? "全部通过" : "存在未通过项"}
            </div>
          </div>
        )}

        {/* What this channel alone may conclude */}
        <div className="rounded-md border border-blue-100 bg-blue-50/50 px-2.5 py-2">
          <div className="mb-1 flex items-center gap-1.5">
            <ShieldAlert className="h-3 w-3 text-blue-600" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700">本通道只允许得出</span>
          </div>
          <p className="text-[11px] leading-relaxed text-slate-700">{numeric.verdict}</p>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Semantic channel                                                     */
/* ------------------------------------------------------------------ */

const SemanticPanel: React.FC<{ semantic: SemanticChannel }> = ({ semantic }) => {
  const relation = RELATION_META[semantic.relation] || RELATION_META.INSUFFICIENT;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3.5 py-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-blue-600" />
          <span className="text-[11px] font-bold text-slate-800">语义通道</span>
          <span className="text-[10px] text-slate-400">Ling · 引用门禁</span>
        </div>
        <Tag className={relation.className}>{relation.label}</Tag>
      </div>

      <div className="flex-1 space-y-3 px-3.5 py-3">
        <Field label={`证据原文（${semantic.evidence.length}）`} hint="无有效引用的结论不被接受">
          {semantic.evidence.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-2.5 py-3 text-center">
              <Search className="mx-auto h-3.5 w-3.5 text-slate-300" />
              <p className="mt-1 text-[11px] text-slate-500">本轮资料包中不存在可引用的相关披露</p>
              <p className="mt-0.5 text-[10px] text-slate-400">不输出推测，明确记为缺证据</p>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {semantic.evidence.map((e, i) => (
                <li key={`${e.textHash}-${i}`} className="rounded-md border border-slate-200 bg-white px-2.5 py-2">
                  <div className="flex items-start gap-1.5">
                    <Quote className="mt-[3px] h-2.5 w-2.5 shrink-0 text-slate-300" />
                    <p className="text-[11px] leading-relaxed text-slate-700">{e.quote}</p>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-slate-100 pt-1.5 font-mono text-[9.5px] text-slate-400">
                    <span>{e.fileName} · 第 {e.page} 页</span>
                    <span className="text-slate-300">|</span>
                    <span>hash {e.textHash}</span>
                    <Tag
                      className={
                        e.quality === "NATIVE"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-amber-200 bg-amber-50 text-amber-800"
                      }
                    >
                      {e.quality === "NATIVE" ? "原生文本" : e.quality}
                    </Tag>
                  </div>
                  {e.headingPath.length > 0 && (
                    <div className="mt-1 text-[9.5px] text-slate-400">{e.headingPath.join(" › ")}</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Field>

        {/* Attribution layering — the discipline that keeps causes honest */}
        {semantic.attributions.length > 0 && (
          <Field label="原因分层" hint="披露的解释 ≠ 已证明的因果">
            <ul className="space-y-1.5">
              {semantic.attributions.map((a, i) => {
                const meta = ATTRIBUTION_META[a.kind];
                return (
                  <li key={i} className={`rounded-md border px-2.5 py-2 ${meta.className}`}>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-slate-700">{a.label}</span>
                      {a.evidenceIndex !== null && (
                        <span className="font-mono text-[9px] text-slate-400">← 证据 #{a.evidenceIndex + 1}</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-slate-700">{a.text}</p>
                    <p className="mt-1 text-[9.5px] leading-snug text-slate-500">{meta.note}</p>
                  </li>
                );
              })}
            </ul>
          </Field>
        )}

        {/* Second, adversarial pass */}
        <Field label="对抗性复核" hint="第二次短校验，不一致时保留较谨慎状态">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2">
            <p className="text-[10.5px] font-medium text-slate-600">{semantic.adversarialCheck.asked}</p>
            <ul className="mt-1.5 space-y-1">
              {semantic.adversarialCheck.findings.map((f, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <AlertTriangle className="mt-[2px] h-2.5 w-2.5 shrink-0 text-amber-500" />
                  <span className="text-[10.5px] leading-snug text-slate-600">{f}</span>
                </li>
              ))}
            </ul>
            <div className="mt-1.5 border-t border-slate-200 pt-1.5">
              <Tag className={semantic.adversarialCheck.agreed ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-800"}>
                {semantic.adversarialCheck.agreed ? "两次判定一致" : "两次判定不一致 → 保留较谨慎状态"}
              </Tag>
            </div>
          </div>
        </Field>

        {semantic.missingEvidence.length > 0 && (
          <Field label="仍缺失的证据" hint="写成下一期的具体索取项">
            <ul className="space-y-1">
              {semantic.missingEvidence.map((m, i) => (
                <li key={i} className="rounded border border-slate-200 bg-white px-2.5 py-1.5">
                  <span className="block text-[11px] font-medium text-slate-700">{m.what}</span>
                  <span className="block text-[10px] text-slate-400">查找位置：{m.whereToLook}</span>
                </li>
              ))}
            </ul>
          </Field>
        )}

        <div className="rounded-md border border-blue-100 bg-blue-50/50 px-2.5 py-2">
          <div className="mb-1 flex items-center gap-1.5">
            <ShieldAlert className="h-3 w-3 text-blue-600" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700">本通道只允许得出</span>
          </div>
          <p className="text-[11px] leading-relaxed text-slate-700">{semantic.verdict}</p>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Composition                                                          */
/* ------------------------------------------------------------------ */

const Composition: React.FC<{ composition: ChannelComposition }> = ({ composition }) => (
  <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
    <div className="mb-2 flex items-center gap-1.5">
      <Scale className="h-3.5 w-3.5 text-blue-600" />
      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">双通道合成</span>
      <span className="text-[10px] text-slate-400">两条通道各自出具结论后，按规则合成，不互相替代</span>
    </div>

    <div className="grid gap-2 md:grid-cols-2">
      <div className="rounded-md border border-slate-200 bg-white px-2.5 py-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">数字通道结论</div>
        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-700">{composition.numericConclusion}</p>
      </div>
      <div className="rounded-md border border-slate-200 bg-white px-2.5 py-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">语义通道结论</div>
        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-700">{composition.semanticConclusion}</p>
      </div>
    </div>

    <div className="mt-2 flex flex-col gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-2 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">适用合成规则</div>
        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-700">{composition.rule}</p>
      </div>
      <div className="shrink-0">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">合成状态</div>
        <StatusChip status={composition.resultingStatus} />
      </div>
    </div>

    {composition.tension && (
      <div className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50/70 px-2.5 py-2">
        <AlertTriangle className="mt-[2px] h-3 w-3 shrink-0 text-amber-600" />
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-amber-800">两通道之间的张力</div>
          <p className="mt-0.5 text-[11px] leading-relaxed text-amber-900/80">{composition.tension}</p>
        </div>
      </div>
    )}
  </div>
);

/* ------------------------------------------------------------------ */
/* Public component                                                     */
/* ------------------------------------------------------------------ */

export const DualChannel: React.FC<{ argument: ArgumentVersion }> = ({ argument }) => {
  const hasNumeric = Boolean(argument.numeric);
  const hasSemantic = Boolean(argument.semantic);

  if (!hasNumeric && !hasSemantic) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center">
        <Search className="mx-auto h-4 w-4 text-slate-300" />
        <p className="mt-1.5 text-[12px] font-medium text-slate-600">本轮未启动任何通道</p>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{argument.gateReason}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <div className={`grid gap-2.5 ${hasNumeric && hasSemantic ? "lg:grid-cols-2" : "grid-cols-1"}`}>
        {hasNumeric && (
          <div className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,33,63,0.04)]">
            <NumericPanel numeric={argument.numeric!} />
          </div>
        )}
        {hasSemantic && (
          <div className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,33,63,0.04)]">
            <SemanticPanel semantic={argument.semantic!} />
          </div>
        )}
      </div>
      {argument.composition && <Composition composition={argument.composition} />}
    </div>
  );
};
