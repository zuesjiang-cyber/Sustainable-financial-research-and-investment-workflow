import React, { useEffect, useState } from "react";
import { Upload, X, FileText, Building, Sparkles, ArrowRight, AlertTriangle } from "lucide-react";

interface UploadFilingModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyName: string;
  securityCode: string;
  currentRound: string; // "T1" or "T2"
  onSubmitFiling: (params: {
    file?: File;
    reportType: "Q1" | "HALF_YEAR" | "Q3" | "ANNUAL";
    period: { start: string; end: string; basis: "QUARTER" | "YTD" | "YEAR" };
    publishedAt: string;
    scope: "CONSOLIDATED" | "PARENT";
  }) => Promise<void>;
  isUploading?: boolean;
}

export const UploadFilingModal: React.FC<UploadFilingModalProps> = ({
  isOpen,
  onClose,
  companyName,
  securityCode,
  currentRound,
  onSubmitFiling,
  isUploading = false,
}) => {
  const isT2 = currentRound === "T2";
  const defaultReportType = isT2 ? "ANNUAL" : "Q3";
  const defaultPeriod = isT2
    ? { start: "2025-01-01", end: "2025-12-31", basis: "YEAR" as const }
    : { start: "2025-01-01", end: "2025-09-30", basis: "YTD" as const };
  const defaultPubDate = isT2 ? "2026-04-21" : "2025-10-28";

  const [file, setFile] = useState<File | null>(null);
  const [reportType, setReportType] = useState<"Q1" | "HALF_YEAR" | "Q3" | "ANNUAL">(defaultReportType);
  const [periodEnd, setPeriodEnd] = useState<string>(defaultPeriod.end);
  const [publishedAt, setPublishedAt] = useState<string>(defaultPubDate);
  const [scope, setScope] = useState<"CONSOLIDATED" | "PARENT">("CONSOLIDATED");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setReportType(defaultReportType);
    setPeriodEnd(defaultPeriod.end);
    setPublishedAt(defaultPubDate);
    setScope("CONSOLIDATED");
    setFile(null);
    setError(null);
  }, [isOpen, currentRound]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("请选择真实的财报 PDF；固定样例仅通过单独的 Demo 入口运行。");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(periodEnd) || !/^\d{4}-\d{2}-\d{2}$/.test(publishedAt)) {
      setError("报告期末日和披露日期应为 YYYY-MM-DD");
      return;
    }
    setError(null);
    const basis = reportType === "ANNUAL" ? "YEAR" : "YTD";
    const start = `${periodEnd.slice(0, 4)}-01-01`;
    await onSubmitFiling({
      file,
      reportType,
      period: { start, end: periodEnd, basis },
      publishedAt,
      scope,
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full p-6 sm:p-8 space-y-6 shadow-2xl relative text-slate-100">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Title */}
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/25 text-blue-400 text-xs font-semibold">
            <Building className="w-3.5 h-3.5" />
            {companyName} ({securityCode}) · {currentRound} 核验
          </div>
          <h2 className="text-2xl font-extrabold text-white">
            上传用于核验的官方财报 PDF
          </h2>
          <p className="text-xs text-slate-400">
            用户上传真实财报并确认期间信息，系统将基于观点定向提取报表事实并执行确定性核验。
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-800/80 bg-rose-950/40 px-3 py-2 text-xs text-rose-200 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* File Picker */}
          <div>
            <label className="text-xs font-medium text-slate-300 block mb-1.5">财报 PDF 文件</label>
            <div className="border border-dashed border-slate-700 hover:border-slate-600 rounded-2xl p-5 text-center bg-slate-950/60 transition-colors">
              {file ? (
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 text-slate-200 truncate">
                    <FileText className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="truncate">{file.name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFile(null)}
                    className="text-xs text-slate-400 hover:text-rose-400 ml-2"
                  >
                    重新选择
                  </button>
                </div>
              ) : (
                <label className="cursor-pointer block space-y-2">
                  <Upload className="w-7 h-7 text-slate-400 mx-auto" />
                  <div className="text-sm font-medium text-slate-300">点击选择或拖入财报 PDF</div>
                  <div className="text-xs text-slate-500">支持 50 MiB 以内标准 PDF</div>
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        setFile(e.target.files[0]);
                      }
                    }}
                    className="hidden"
                  />
                </label>
              )}
            </div>
          </div>

          {/* Form Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1.5">报告类型</label>
              <select
                value={reportType}
                onChange={(e) => {
                  const val = e.target.value as any;
                  setReportType(val);
                  if (val === "ANNUAL") {
                    setPeriodEnd("2025-12-31");
                    setPublishedAt("2026-04-21");
                  } else if (val === "Q3") {
                    setPeriodEnd("2025-09-30");
                    setPublishedAt("2025-10-28");
                  }
                }}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
              >
                <option value="Q3">第三季度报告 (三季报)</option>
                <option value="HALF_YEAR">半年度报告 (半年报)</option>
                <option value="ANNUAL">年度报告 (年报)</option>
                <option value="Q1">第一季度报告 (一季报)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1.5">报告期末日</label>
              <input
                type="text"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                placeholder="YYYY-MM-DD"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 font-mono focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1.5">披露日期</label>
              <input
                type="text"
                value={publishedAt}
                onChange={(e) => setPublishedAt(e.target.value)}
                placeholder="YYYY-MM-DD"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 font-mono focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1.5">会计口径</label>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as "CONSOLIDATED" | "PARENT")}
                className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-400 font-medium"
              >
                <option value="CONSOLIDATED">合并口径 (CONSOLIDATED)</option>
                <option value="PARENT">母公司口径 (PARENT)</option>
              </select>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isUploading}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-blue-600/25 transition-all text-sm"
            >
              <Sparkles className="w-4 h-4 text-blue-200" />
              {isUploading ? "正在解析财报并执行核验..." : `启动 ${currentRound} 财报核验`}
              <ArrowRight className="w-4 h-4 ml-1" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
