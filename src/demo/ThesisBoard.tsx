import React from "react";
import { ChevronRight, Layers, Scale } from "lucide-react";
import type { Thesis } from "./types";
import { MATURITY_META, SIGNAL_META, SUPPORT_META, StatusChip, Tag } from "./primitives";

/**
 * The state of every thesis at one point in time. Selecting a version (pillar 1)
 * re-renders this whole board — that is the "state, not transcript" idea made
 * visible: three cards, one instant, fully replayable.
 */

interface Props {
  theses: Thesis[];
  activeVersion: string;
  selectedThesisId: string;
  onSelectThesis: (thesisId: string) => void;
}

export const ThesisBoard: React.FC<Props> = ({ theses, activeVersion, selectedThesisId, onSelectThesis }) => (
  <div className="grid gap-2.5 lg:grid-cols-3">
    {theses.map((thesis) => {
      const view = thesis.versions[activeVersion];
      if (!view) return null;
      const isSelected = thesis.thesisId === selectedThesisId;
      const maturity = MATURITY_META[view.maturity];
      const admitted = new Set(view.rollUp.admitted);

      return (
        <button
          key={thesis.thesisId}
          type="button"
          onClick={() => onSelectThesis(thesis.thesisId)}
          className={`cursor-pointer rounded-xl border bg-white p-3.5 text-left transition-all ${
            isSelected
              ? "border-blue-500 shadow-[0_0_0_3px_rgba(24,90,219,0.10),0_2px_8px_rgba(16,33,63,0.06)]"
              : "border-slate-200 shadow-[0_1px_2px_rgba(16,33,63,0.04)] hover:border-slate-300 hover:shadow-[0_2px_8px_rgba(16,33,63,0.06)]"
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-blue-600 font-mono text-[10px] font-bold text-white">
                {thesis.priority}
              </span>
              <span className="font-mono text-[10px] text-slate-400">{thesis.thesisId}</span>
            </div>
            <ChevronRight
              className={`h-3.5 w-3.5 shrink-0 ${isSelected ? "text-blue-500" : "text-slate-300"}`}
            />
          </div>

          <p className="mt-2 line-clamp-3 text-[12px] leading-relaxed font-medium text-slate-900">
            {thesis.currentStatement}
          </p>

          <div className="mt-2.5 flex flex-wrap items-center gap-1">
            <StatusChip status={view.status} size="sm" />
            <Tag className={maturity.className} title={maturity.hint}>
              {maturity.label}
            </Tag>
          </div>

          <p className="mt-2 line-clamp-2 text-[10.5px] leading-relaxed text-slate-500">{view.summary}</p>

          {/* Argument gate strip — pillar 3 in miniature */}
          <div className="mt-2.5 border-t border-slate-100 pt-2">
            <div className="mb-1 flex items-center gap-1">
              <Scale className="h-2.5 w-2.5 text-slate-400" />
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                论据 {thesis.claims.length} · 采纳 {view.rollUp.admitted.length}
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {thesis.claims.map((claim) => {
                const av = claim.versions[activeVersion];
                if (!av) {
                  return (
                    <span
                      key={claim.argumentId}
                      className="rounded border border-dashed border-slate-200 bg-white px-1 py-[1px] font-mono text-[9px] text-slate-300"
                      title="本轮未涉及"
                    >
                      {claim.argumentId}
                    </span>
                  );
                }
                const meta = SUPPORT_META[av.supportLevel];
                const signal = SIGNAL_META[av.interimSignal];
                const SignalIcon = signal.Icon;
                return (
                  <span
                    key={claim.argumentId}
                    className={`inline-flex items-center gap-1 rounded border px-1 py-[1px] font-mono text-[9px] font-semibold ${meta.chip}`}
                    title={`${claim.statement}\n${av.gateReason}\n阶段信号：${signal.label}`}
                  >
                    <span className={`h-1 w-1 rounded-full ${meta.bar}`} />
                    {claim.argumentId.replace("arg-", "")}
                    {admitted.has(claim.argumentId) ? (
                      <span className="opacity-70">✓</span>
                    ) : (
                      <span className="opacity-70">✕</span>
                    )}
                    {av.interimSignal !== "UNKNOWN" && (
                      <SignalIcon className={`h-2 w-2 ${signal.className}`} />
                    )}
                  </span>
                );
              })}
            </div>
          </div>

          {/* naive vs honest, condensed — the single most persuasive line */}
          <div className="mt-2.5 rounded-md bg-slate-50 px-2 py-1.5">
            <div className="flex items-start gap-1">
              <Layers className="mt-[2px] h-2.5 w-2.5 shrink-0 text-rose-400" />
              <p className="text-[9.5px] leading-snug text-slate-400 line-through decoration-rose-300">
                {view.rollUp.naiveSummary}
              </p>
            </div>
            <p className="mt-1 line-clamp-3 text-[10px] leading-snug font-medium text-slate-700">
              {view.rollUp.honestConclusion}
            </p>
          </div>
        </button>
      );
    })}
  </div>
);
