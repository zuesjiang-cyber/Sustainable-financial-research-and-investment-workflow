import React, { useState } from "react";
import { X, Copy, Check, FileText, ExternalLink, Bookmark, ShieldCheck } from "lucide-react";
import type { EvidenceSpan, SourceDocument } from "../../shared/domain";

interface PdfEvidenceViewerProps {
  isOpen: boolean;
  onClose: () => void;
  span: EvidenceSpan | null;
  document?: SourceDocument | null;
}

export const PdfEvidenceViewer: React.FC<PdfEvidenceViewerProps> = ({
  isOpen,
  onClose,
  span,
  document,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !span) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(span.quote);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const pageNumber = span.regions[0]?.pageNumber || 1;
  const bbox = span.regions[0]?.bbox || [0, 0, 1, 1];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-xl h-full bg-slate-900/95 backdrop-blur-xl border-l border-slate-800 shadow-2xl flex flex-col text-slate-100 animate-in slide-in-from-right duration-250">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 bg-blue-500/15 text-blue-400 border border-blue-500/30 rounded-xl">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-white tracking-tight truncate">
                  {document?.title || "PDF 证据原件切片"}
                </h3>
                <span className="px-2 py-0.5 bg-blue-950/80 text-blue-300 border border-blue-800 rounded text-[10px] font-mono shrink-0">
                  第 {pageNumber} 页
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate">
                {document?.fileName || "研报/财报出处档案"} · SHA: {span.textHash.slice(0, 8)}...
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Metadata badges */}
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
            <span className="px-2.5 py-1 bg-slate-950 rounded-md border border-slate-800 text-slate-300 flex items-center gap-1.5">
              <Bookmark className="w-3 h-3 text-blue-400" />
              物理页码：P{pageNumber}
            </span>
            <span className="px-2.5 py-1 bg-slate-950 rounded-md border border-slate-800 text-slate-300 flex items-center gap-1.5">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              解析质量：{span.quality}
            </span>
            {span.tableCell && (
              <span className="px-2.5 py-1 bg-purple-950/60 rounded-md border border-purple-800 text-purple-300">
                表格单元格：行 {span.tableCell.row + 1} / 列 {span.tableCell.col + 1}
              </span>
            )}
          </div>

          {/* Verbatim quote snippet */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                原文原句逐字切片 (Verbatim Snippet)
              </span>
              <button
                onClick={handleCopy}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "已复制" : "复制引文"}
              </button>
            </div>
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-xs text-emerald-300/90 leading-relaxed whitespace-pre-wrap shadow-inner selection:bg-emerald-800 selection:text-white">
              {span.quote}
            </div>
          </div>

          {/* Heading Path */}
          {span.headingPath && span.headingPath.length > 0 && (
            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 text-xs space-y-1">
              <span className="text-slate-400 font-medium">段落标题层级：</span>
              <div className="text-slate-300 font-mono text-[11px]">
                {span.headingPath.join(" > ")}
              </div>
            </div>
          )}

          {/* Normalized Bounding Box */}
          <div className="p-4 bg-slate-950/40 rounded-xl border border-slate-800/60 text-xs space-y-2">
            <span className="text-slate-400 font-medium block">
              PDF.js 视图归一化定位坐标 (Normalized BBox [0–1]):
            </span>
            <div className="grid grid-cols-4 gap-2 font-mono text-[11px] text-center">
              <div className="p-1.5 bg-slate-900 rounded border border-slate-800">
                <span className="text-slate-500 block text-[9px]">X0</span>
                {bbox[0]}
              </div>
              <div className="p-1.5 bg-slate-900 rounded border border-slate-800">
                <span className="text-slate-500 block text-[9px]">Y0 (Top)</span>
                {bbox[1]}
              </div>
              <div className="p-1.5 bg-slate-900 rounded border border-slate-800">
                <span className="text-slate-500 block text-[9px]">X1</span>
                {bbox[2]}
              </div>
              <div className="p-1.5 bg-slate-900 rounded border border-slate-800">
                <span className="text-slate-500 block text-[9px]">Y1 (Bottom)</span>
                {bbox[3]}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400">
          <span>跨轮次可追溯底稿证据</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium cursor-pointer transition-colors"
          >
            关闭证据抽屉
          </button>
        </div>
      </div>
    </div>
  );
};
