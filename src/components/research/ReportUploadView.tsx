import React, { useState } from "react";
import { Upload, FileText, Sparkles, ArrowRight, ShieldCheck, CheckCircle2, Loader2, AlertTriangle, Clock } from "lucide-react";
import type { UploadReceipt } from "../../shared/domain";

export interface ReportUploadParams {
  file?: File;
  fileName: string;
  companyCode?: string;
  isDemo?: boolean;
}

interface ReportUploadViewProps {
  onStartAnalysis: (params: ReportUploadParams) => void;
  onStartExtraction?: (reportDocumentId: string) => void;
  isAnalyzing: boolean;
  currentStep?: string;
  receipt?: UploadReceipt | null;
  error?: string | null;
}

export const ReportUploadView: React.FC<ReportUploadViewProps> = ({
  onStartAnalysis,
  onStartExtraction,
  isAnalyzing,
  currentStep = "解析研报中...",
  receipt = null,
  error = null,
}) => {
  const [selectedDemo, setSelectedDemo] = useState<string>("300661");
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      onStartAnalysis({ fileName: file.name, file });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      onStartAnalysis({ fileName: file.name, file });
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-12 px-6 space-y-10 animate-in fade-in duration-300">
      {/* Title & Introduction */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/25 text-blue-400 text-xs font-semibold tracking-wide uppercase">
          <Sparkles className="w-3.5 h-3.5" />
          FinTrust 研报观点核验与持续研究 V1
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
          上传研报，先完成真实 PDF 解析
        </h1>
        <p className="text-base text-slate-400 max-w-2xl mx-auto leading-relaxed">
          先在本地解析您上传的研报 PDF，保存原文件、解析结构和可追溯片段；观点提炼与后续财报核验将在您确认下一步后进行。
        </p>
      </div>

      {/* Upload Box / Progress State */}
      {error && !isAnalyzing && (
        <div className="bg-rose-950/40 border border-rose-800/80 rounded-2xl p-4 flex items-start gap-3 text-sm text-rose-200">
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">研报上传或解析失败</p>
            <p className="mt-1 text-rose-200/80">{error}</p>
            <p className="mt-2 text-xs text-rose-300/80">请检查文件后重试；本次失败不会生成成功回执。</p>
          </div>
        </div>
      )}

      {receipt && !isAnalyzing ? (
        <div className="bg-slate-900/90 border border-emerald-500/30 rounded-2xl p-8 shadow-2xl space-y-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">PDF 已上传并完成解析</h3>
              <p className="text-sm text-slate-400 mt-1">文件已保存到本地存储，解析回执可用于后续观点提炼。</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-3">
              <span className="text-xs text-slate-500 block">文件名</span>
              <span className="text-slate-200 break-all">{receipt.document.fileName}</span>
            </div>
            <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-3">
              <span className="text-xs text-slate-500 block">SHA-256</span>
              <span className="text-slate-200 font-mono">{receipt.document.sha256.slice(0, 12)}...</span>
            </div>
            <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-3">
              <span className="text-xs text-slate-500 block">页数</span>
              <span className="text-slate-200">{receipt.parseSummary.pageCount}</span>
            </div>
            <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-3">
              <span className="text-xs text-slate-500 block">提取片段数</span>
              <span className="text-slate-200">{receipt.parseSummary.spanCount}</span>
            </div>
          </div>
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-sm text-blue-200">
            下一步（观点提炼）尚未运行。当前阶段只完成文件上传与 PDF 结构化解析。
          </div>
          {onStartExtraction && (
            <button
              onClick={() => onStartExtraction(receipt.document.id)}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-blue-600/25 transition-all text-base"
            >
              <Sparkles className="w-5 h-5 text-blue-200" />
              开始提炼观点
            </button>
          )}
        </div>
      ) : isAnalyzing ? (
        <div className="bg-slate-900/90 border border-blue-500/30 rounded-2xl p-10 text-center space-y-6 shadow-2xl">
          <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border-4 border-blue-500/20 border-t-blue-500 animate-spin" />
            <FileText className="w-7 h-7 text-blue-400" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-white tracking-tight">正在上传并解析研报 PDF</h3>
            <p className="text-sm font-mono text-blue-300 animate-pulse">{currentStep}</p>
          </div>
          <div className="max-w-md mx-auto space-y-2 text-left text-xs font-mono text-slate-400 bg-slate-950 p-4 rounded-xl border border-slate-800">
            <div className="flex items-center gap-2 text-blue-400">
              <Loader2 className="w-4 h-4 animate-spin" /> 上传文件并校验 PDF 内容
            </div>
            <div className="flex items-center gap-2 text-slate-300 font-semibold">
              <Clock className="w-4 h-4" /> 解析页面、段落和表格
            </div>
            <p className="text-[11px] text-slate-500 pl-6">当前不会识别公司、提炼观点或查找财报。</p>
          </div>
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          className={`relative border-2 border-dashed rounded-3xl p-10 sm:p-14 text-center transition-all duration-200 cursor-pointer ${
            isDragOver
              ? "border-blue-500 bg-blue-500/5 scale-[1.01]"
              : "border-slate-800 hover:border-slate-700 bg-slate-900/60 hover:bg-slate-900/80"
          }`}
        >
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileChange}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          />
          <div className="space-y-4 max-w-sm mx-auto">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shadow-inner">
              <Upload className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <p className="text-base font-bold text-white">点击上传或将研报 PDF 拖拽至此处</p>
              <p className="text-xs text-slate-400">支持各类券商深度研报 (单文件最大 50MB)</p>
            </div>
            <div className="inline-flex items-center gap-1.5 text-xs text-slate-500 font-medium pt-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              本地/沙箱私有解析 · 原文坐标严格绑定
            </div>
          </div>
        </div>
      )}

      {/* Quick Launch Demo Reports */}
      <div className="border-t border-slate-800/80 pt-8 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            快速体验：固定样例（Demo）
          </span>
          <span className="text-xs text-slate-500">固定数据演示，不代表用户上传结果</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            onClick={() => {
              setSelectedDemo("300661");
              onStartAnalysis({
                fileName: "圣邦股份_300661_模拟芯片龙头深度跟踪.pdf",
                companyCode: "300661",
                isDemo: true,
              });
            }}
            disabled={isAnalyzing}
            className="p-5 rounded-2xl border border-slate-800 bg-slate-900/60 hover:border-blue-500/50 hover:bg-slate-900 transition-all text-left group cursor-pointer flex flex-col justify-between space-y-3"
          >
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-blue-400 px-2 py-0.5 bg-blue-500/10 rounded border border-blue-500/20">
                  深市 300661
                </span>
                <span className="text-[11px] text-slate-500">双轮持续演进样例</span>
              </div>
              <h4 className="font-bold text-white text-sm group-hover:text-blue-300 transition-colors">
                圣邦股份：综合毛利率回升与模拟芯片复苏预测
              </h4>
              <p className="text-xs text-slate-400 line-clamp-2">
                固定数据演示观点卡片与两轮研究界面，不读取当前上传文件。
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-blue-400 group-hover:translate-x-0.5 transition-transform">
              启动样例演示 <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </button>

          <button
            onClick={() => {
              setSelectedDemo("603160");
              onStartAnalysis({
                fileName: "汇顶科技_603160_指纹芯片与车载传感深度研报.pdf",
                companyCode: "603160",
                isDemo: true,
              });
            }}
            disabled={isAnalyzing}
            className="p-5 rounded-2xl border border-slate-800 bg-slate-900/60 hover:border-blue-500/50 hover:bg-slate-900 transition-all text-left group cursor-pointer flex flex-col justify-between space-y-3"
          >
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-emerald-400 px-2 py-0.5 bg-emerald-500/10 rounded border border-emerald-500/20">
                  沪市 603160
                </span>
                <span className="text-[11px] text-slate-500">单轮基准核验</span>
              </div>
              <h4 className="font-bold text-white text-sm group-hover:text-emerald-300 transition-colors">
                汇顶科技：车载传感放量与经营现金流改善核验
              </h4>
              <p className="text-xs text-slate-400 line-clamp-2">
                固定数据演示单轮核验界面，不读取当前上传文件。
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-400 group-hover:translate-x-0.5 transition-transform">
              启动样例演示 <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
