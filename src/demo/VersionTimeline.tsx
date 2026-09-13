import React from "react";
import { CalendarClock, FileText, GitCommitHorizontal, Sparkles } from "lucide-react";
import type { ResearchVersion } from "./types";

/**
 * Pillar 1 — 面向状态的投研管理.
 *
 * This is not a history list. It is a scrubber over the research state: picking
 * a version replays the entire workspace (arguments, channels, roll-up, open
 * questions) as it stood at that point. That single interaction is what
 * distinguishes a state machine from a chat transcript.
 */

interface Props {
  versions: ResearchVersion[];
  active: string;
  onSelect: (version: string) => void;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  // Asia/Shanghai is the product's display timezone per 08_数据模型与数据库.md §3.
  const local = new Date(d.getTime() + 8 * 3600 * 1000);
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())} ${pad(
    local.getUTCHours(),
  )}:${pad(local.getUTCMinutes())}`;
}

export const VersionTimeline: React.FC<Props> = ({ versions, active, onSelect }) => {
  const activeIndex = Math.max(0, versions.findIndex((v) => v.version === active));

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,33,63,0.04)]">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <GitCommitHorizontal className="h-3.5 w-3.5 text-blue-600" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            研究状态时间轴
          </span>
          <span className="text-[11px] text-slate-400">切换版本以重放该时点的完整状态</span>
        </div>
        <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
          thesisId / argumentId 跨轮不变
        </span>
      </div>

      {/* Scrubber track */}
      <div className="relative px-4 pt-5 pb-3">
        <div className="absolute top-[34px] right-8 left-8 h-px bg-slate-200" />
        <div
          className="absolute top-[34px] left-8 h-px bg-blue-500 transition-all duration-300"
          style={{
            width:
              versions.length > 1
                ? `calc((100% - 4rem) * ${activeIndex / (versions.length - 1)})`
                : "0%",
          }}
        />
        <div className="relative grid" style={{ gridTemplateColumns: `repeat(${versions.length}, minmax(0,1fr))` }}>
          {versions.map((v, i) => {
            const isActive = v.version === active;
            const isPast = i < activeIndex;
            return (
              <button
                key={v.version}
                type="button"
                onClick={() => onSelect(v.version)}
                aria-current={isActive ? "step" : undefined}
                className="group flex flex-col items-center gap-2 px-1 text-center cursor-pointer"
              >
                <span
                  className={`flex h-[26px] w-[26px] items-center justify-center rounded-full border-2 font-mono text-[11px] font-bold transition-all ${
                    isActive
                      ? "border-blue-600 bg-blue-600 text-white shadow-[0_0_0_4px_rgba(24,90,219,0.12)]"
                      : isPast
                        ? "border-blue-300 bg-blue-50 text-blue-600 group-hover:border-blue-500"
                        : "border-slate-300 bg-white text-slate-400 group-hover:border-slate-400"
                  }`}
                >
                  {v.version}
                </span>
                <span className="space-y-0.5">
                  <span
                    className={`block text-[12px] font-semibold ${
                      isActive ? "text-slate-900" : "text-slate-500 group-hover:text-slate-700"
                    }`}
                  >
                    {v.label.replace(`${v.version} · `, "")}
                  </span>
                  <span className="block font-mono text-[10px] text-slate-400">{formatTime(v.confirmedAt)}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active version detail */}
      {(() => {
        const v = versions[activeIndex];
        if (!v) return null;
        return (
          <div className="grid gap-px border-t border-slate-100 bg-slate-100 md:grid-cols-[1.4fr_1fr_1fr]">
            <div className="bg-white px-4 py-3">
              <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                <Sparkles className="h-3 w-3" /> 本轮触发
              </div>
              <p className="text-[12px] leading-relaxed text-slate-700">{v.trigger}</p>
              <p className="mt-2 flex items-center gap-1.5 font-mono text-[10px] text-slate-400">
                <CalendarClock className="h-3 w-3" />
                asOf {v.asOf} · 确认于 {formatTime(v.confirmedAt)}
              </p>
            </div>

            <div className="bg-white px-4 py-3">
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                冻结资料包（{v.documents.length}）
              </div>
              <ul className="space-y-1">
                {v.documents.map((d) => (
                  <li key={`${d.fileName}-${d.period}`} className="flex items-start gap-1.5">
                    <FileText
                      className={`mt-[2px] h-3 w-3 shrink-0 ${
                        d.role === "THESIS_SOURCE" ? "text-blue-500" : "text-slate-400"
                      }`}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-[11px] text-slate-700">{d.fileName}</span>
                      <span className="block font-mono text-[9.5px] text-slate-400">
                        {d.period} · sha {d.sha256Short} · {d.pages}p
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-white px-4 py-3">
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                模型与代码的分工
              </div>
              <p className="font-mono text-[11px] text-slate-700">
                {v.modelCalls.count} 次模型调用 · in {(v.modelCalls.inputTokens / 1000).toFixed(1)}k / out{" "}
                {(v.modelCalls.outputTokens / 1000).toFixed(1)}k
              </p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">{v.modelCalls.note}</p>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
