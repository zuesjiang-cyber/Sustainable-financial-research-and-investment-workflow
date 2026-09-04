import React, { useState } from "react";
import { AlertOctagon, Check, Copy, FileText, Info, ShieldAlert, ShieldCheck, X } from "lucide-react";
import type { EvidenceItem } from "../types/fintrust";

interface EvidenceDrawerProps {
  evidenceId: string | null;
  evidenceList?: EvidenceItem[];
  onClose: () => void;
  onSelectEvidence: (id: string) => void;
}

function pageLabel(page: number | null | undefined): string {
  return page == null ? "页码未提供" : "第 " + page + " 页";
}

function lineLabel(start?: number, end?: number): string | null {
  if (start == null && end == null) return null;
  if (start != null && end != null && start !== end) return "行 " + start + "–" + end;
  return "行 " + (start ?? end);
}

function evidenceImageUrl(image: string): string {
  const normalized = image.replace(/^assets\//, "");
  return "/assets/" + normalized;
}

export const EvidenceDrawer: React.FC<EvidenceDrawerProps> = ({
  evidenceId,
  evidenceList = [],
  onClose,
  onSelectEvidence,
}) => {
  const [copied, setCopied] = useState(false);

  if (!evidenceId) return null;
  const currentEvidence = evidenceList.find((evidence) => evidence.evidence_id === evidenceId);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/70 backdrop-blur-sm transition-opacity animate-in fade-in duration-200">
      <div
        className="w-full max-w-2xl bg-slate-900/95 backdrop-blur-xl h-full shadow-2xl flex flex-col border-l border-slate-800 text-slate-100 animate-in slide-in-from-right duration-300"
        id="evidence-drawer-container"
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-800/80 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-2.5 min-w-0">
            <span className="px-2.5 py-1 bg-blue-500/15 text-blue-300 border border-blue-500/30 rounded-lg font-mono text-xs font-bold tracking-wide shrink-0">
              {evidenceId}
            </span>
            <div>
              <h3 className="text-sm font-bold text-white truncate flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                底稿来源穿透与凭证审计
              </h3>
              <p className="text-[11px] text-slate-400 hidden sm:block">精准定位原件报告期、页码与逐字段落</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
            id="close-evidence-drawer-btn"
            title="关闭来源抽屉"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {!currentEvidence ? (
            <div className="rounded-2xl border border-rose-800/60 bg-rose-950/30 p-6 space-y-4 text-center">
              <div className="inline-flex p-3 bg-rose-900/50 text-rose-300 rounded-2xl border border-rose-800/80">
                <AlertOctagon className="w-8 h-8" />
              </div>
              <div>
                <h4 className="text-base font-bold text-rose-200">未找到来源凭证</h4>
                <p className="text-xs font-mono text-rose-400 mt-1">Requested ID: {evidenceId}</p>
              </div>
              <p className="text-xs text-rose-300/90 leading-relaxed max-w-md mx-auto text-left bg-slate-950/60 p-3.5 rounded-xl border border-rose-900/50">
                当前项目没有该索引的已归档来源文本。系统不会用其他公司、页码或合成片段替代它。
              </p>
              <div className="text-xs text-slate-400 pt-2">
                已有凭证库列表：
                <div className="flex flex-wrap gap-1.5 justify-center mt-2">
                  {evidenceList.map((evidence) => (
                    <button
                      key={evidence.evidence_id}
                      onClick={() => onSelectEvidence(evidence.evidence_id)}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-200 text-xs font-mono cursor-pointer transition-colors"
                    >
                      {evidence.evidence_id}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              {(() => {
                const isSynthetic = currentEvidence.is_synthetic_illustration === true;
                const location = lineLabel(currentEvidence.line_start, currentEvidence.line_end);
                const hasUsableImage = Boolean(currentEvidence.image) && !isSynthetic;
                return (
                  <>
                    {/* Meta Card */}
                    <div className="bg-slate-950/80 rounded-2xl p-4 border border-slate-800/90 space-y-3 shadow-sm">
                      <div className="flex items-center justify-between text-xs gap-3">
                        <span className="text-slate-400 font-medium">来源披露文档</span>
                        <span className="font-semibold text-slate-100 flex items-center gap-1.5 text-right">
                          <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                          {currentEvidence.document || "未提供文档名"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs gap-3">
                        <span className="text-slate-400 font-medium">报告期间 / 定位</span>
                        <span className="font-mono font-semibold text-blue-300 bg-blue-950/70 px-2.5 py-0.5 rounded-lg border border-blue-800/60 text-right">
                          {currentEvidence.period || "期间未提供"} · {pageLabel(currentEvidence.page)}
                          {location ? " · " + location : ""}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs gap-3">
                        <span className="text-slate-400 font-medium">凭证合规状态</span>
                        <span
                          className={
                            "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg border text-xs font-medium text-right " +
                            (isSynthetic
                              ? "text-amber-300 bg-amber-950/60 border-amber-800/80"
                              : "text-emerald-300 bg-emerald-950/60 border-emerald-800/80")
                          }
                        >
                          <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                          {isSynthetic ? "合成示意 / 未核验原件" : "逐字原文已归档，防篡改索引"}
                        </span>
                      </div>
                    </div>

                    {isSynthetic && (
                      <div className="rounded-xl border border-amber-800/70 bg-amber-950/30 p-3.5 text-xs text-amber-200 space-y-1.5">
                        <div className="flex items-center gap-1.5 font-semibold text-amber-300">
                          <Info className="w-4 h-4 text-amber-400 shrink-0" />
                          合成材料边界说明
                        </div>
                        <p className="leading-relaxed text-amber-200/90 text-[11px]">
                          这条记录被标为合成或未核验材料。下方文本仅供定位和复核，不宣称是原始 PDF 的逐字转录，也不会生成缺失页码或图片。
                        </p>
                      </div>
                    )}

                    {currentEvidence.audit_disclaimer && (
                      <div className="rounded-xl border border-blue-900/60 bg-blue-950/30 p-3.5 text-xs text-blue-200 leading-relaxed">
                        <strong className="text-blue-300">来源说明：</strong>
                        {currentEvidence.audit_disclaimer}
                      </div>
                    )}

                    {/* Source Quote Box */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                          {isSynthetic ? "材料文本摘录（未宣称逐字原文）" : "逐字原文摘录 (Verbatim Snippet)"}
                        </h4>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-slate-400 font-mono">
                            {location || pageLabel(currentEvidence.page)}
                          </span>
                          <button
                            onClick={() => handleCopy(currentEvidence.snippet || "")}
                            className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded text-[11px] font-sans flex items-center gap-1 cursor-pointer transition-colors border border-slate-700"
                            title="复制原文文本"
                          >
                            {copied ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" />
                                已复制
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                复制
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="bg-slate-950 p-4 rounded-xl text-xs leading-relaxed font-mono shadow-inner select-all border border-slate-800/90 text-emerald-300/90 whitespace-pre-wrap">
                        {currentEvidence.snippet || "来源文本未提供。"}
                      </div>
                    </div>

                    {/* Image if available */}
                    {hasUsableImage && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">来源底稿图像</h4>
                          <span className="text-[11px] text-slate-400 font-mono">{pageLabel(currentEvidence.page)}</span>
                        </div>
                        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-2 overflow-hidden shadow-md">
                          <img
                            src={evidenceImageUrl(currentEvidence.image as string)}
                            alt={"来源图像 " + pageLabel(currentEvidence.page)}
                            className="w-full h-auto rounded-xl object-contain shadow-sm"
                            onError={(event) => {
                              (event.currentTarget as HTMLImageElement).style.display = "none";
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {!hasUsableImage && (
                      <div className="rounded-xl border border-slate-800/70 bg-slate-950/40 p-3.5 text-xs text-slate-400 flex items-center gap-2">
                        <Info className="w-4 h-4 text-slate-500 shrink-0" />
                        未提供原件切片截图；系统已严格绑定行号与文本哈希作为法定凭证。
                      </div>
                    )}

                    {/* Switcher Carousel / List */}
                    <div className="pt-3 border-t border-slate-800/80 space-y-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        切换查看本项目收录的其他凭证 ({evidenceList.length})
                      </h4>
                      <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto pr-1">
                        {evidenceList.map((evidence) => {
                          const isSelected = evidence.evidence_id === evidenceId;
                          return (
                            <button
                              key={evidence.evidence_id}
                              onClick={() => onSelectEvidence(evidence.evidence_id)}
                              className={
                                "px-2.5 py-1 rounded-lg text-xs font-mono transition-all cursor-pointer border " +
                                (isSelected
                                  ? "bg-blue-600 text-white border-blue-500 font-bold shadow-sm shadow-blue-500/20"
                                  : "bg-slate-950/60 hover:bg-slate-800 text-slate-300 border-slate-800 hover:border-slate-700")
                              }
                            >
                              {evidence.evidence_id} ({pageLabel(evidence.page)})
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                );
              })()}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

