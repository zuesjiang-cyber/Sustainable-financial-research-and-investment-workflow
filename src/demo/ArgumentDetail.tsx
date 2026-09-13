import React from "react";
import { Microscope, Route } from "lucide-react";
import type { AtomicClaim } from "./types";
import { DualChannel } from "./DualChannel";
import { Tag } from "./primitives";

/**
 * Deep dive on one atomic argument: both channels side by side, then their
 * composition, then the single question this argument still owes the system.
 */

interface Props {
  claim: AtomicClaim;
  activeVersion: string;
}

export const ArgumentDetail: React.FC<Props> = ({ claim, activeVersion }) => {
  const av = claim.versions[activeVersion];

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,33,63,0.04)]">
      <header className="border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-1.5">
          <Microscope className="h-3.5 w-3.5 text-blue-600" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            论据核验明细 · {activeVersion}
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Tag className="border-slate-200 bg-slate-50 font-mono text-slate-500">{claim.argumentId}</Tag>
          <Tag className="border-slate-200 bg-slate-50 text-slate-500">{claim.kindLabel}</Tag>
          <span className="font-mono text-[9.5px] text-slate-400">身份自 T0 起不变</span>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed font-semibold text-slate-900">{claim.statement}</p>
        <p className="mt-1 rounded-md bg-slate-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-slate-600">
          {claim.verificationTarget}
        </p>
      </header>

      <div className="px-4 py-3">
        {!av ? (
          <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-[11.5px] text-slate-500">
            本轮（{activeVersion}）未对该论据启动核验。
          </p>
        ) : (
          <>
            <DualChannel argument={av} />

            {av.nextQuestion && (
              <div className="mt-2.5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2.5">
                <Route className="mt-[2px] h-3.5 w-3.5 shrink-0 text-amber-600" />
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
                    该论据仍欠一个问题
                  </div>
                  <p className="mt-0.5 text-[11.5px] leading-relaxed text-slate-800">{av.nextQuestion.text}</p>
                  <p className="mt-1 text-[10px] leading-snug text-slate-500">
                    所需证据：{av.nextQuestion.requiredEvidence}
                  </p>
                </div>
              </div>
            )}

            {av.changeNote && (
              <p className="mt-2 font-mono text-[10px] leading-relaxed text-slate-400">
                版本迁移：{av.changeNote}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
};
