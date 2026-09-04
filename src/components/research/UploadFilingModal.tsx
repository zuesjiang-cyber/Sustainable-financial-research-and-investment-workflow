import React, { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, Building2, FileText, Sparkles, Upload, X } from "lucide-react";

interface UploadFilingModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyName: string;
  securityCode: string;
  currentRound: string;
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
  const [file, setFile] = useState<File | null>(null);
  const [reportType, setReportType] = useState<"Q1" | "HALF_YEAR" | "Q3" | "ANNUAL">("Q3");
  const [periodEnd, setPeriodEnd] = useState("");
  const [publishedAt, setPublishedAt] = useState("");
  const [scope, setScope] = useState<"CONSOLIDATED" | "PARENT">("CONSOLIDATED");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setReportType("Q3");
    setPeriodEnd("");
    setPublishedAt("");
    setScope("CONSOLIDATED");
    setFile(null);
    setError(null);
  }, [isOpen, currentRound]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) {
      setError("请选择真实的财报 PDF；固定样例仅通过首页 Demo 入口运行。");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(periodEnd) || !/^\d{4}-\d{2}-\d{2}$/.test(publishedAt)) {
      setError("报告期末日和披露日期应为 YYYY-MM-DD");
      return;
    }
    setError(null);
    const basis = reportType === "ANNUAL" ? "YEAR" : reportType === "Q1" ? "QUARTER" : "YTD";
    await onSubmitFiling({
      file,
      reportType,
      period: { start: `${periodEnd.slice(0, 4)}-01-01`, end: periodEnd, basis },
      publishedAt,
      scope,
    });
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="filing-modal-title">
      <div className="filing-modal">
        <button type="button" onClick={onClose} className="modal-close" aria-label="关闭"><X className="h-5 w-5" /></button>
        <div className="filing-modal-kicker"><Building2 className="h-3.5 w-3.5" />{companyName}（{securityCode}）· {currentRound} 核验</div>
        <h2 id="filing-modal-title">上传用于核验的官方财报 PDF</h2>
        <p className="filing-modal-intro">基于已确认的 T0 观点，上传真实财报后，系统会由 Ling 定向提取事实并执行确定性核验。</p>

        {error && <div className="inline-alert is-error"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div>}

        <form onSubmit={handleSubmit} className="filing-form">
          <label className="filing-file-label">财报 PDF 文件
            <div className={`filing-file-picker ${file ? "has-file" : ""}`}>
              {file ? (
                <div className="filing-selected-file"><FileText className="h-5 w-5" /><span>{file.name}</span><button type="button" onClick={() => setFile(null)}>重新选择</button></div>
              ) : (
                <span className="filing-file-empty"><Upload className="h-6 w-6" /><strong>点击选择或拖入财报 PDF</strong><em>支持 50MB 以内标准 PDF</em><input type="file" accept="application/pdf,.pdf" onChange={(event) => setFile(event.target.files?.[0] || null)} /></span>
              )}
            </div>
          </label>

          <div className="filing-form-grid">
            <label>报告类型<select value={reportType} onChange={(e) => setReportType(e.target.value as typeof reportType)} className="ft-input"><option value="Q3">第三季度报告（三季报）</option><option value="HALF_YEAR">半年度报告（半年报）</option><option value="ANNUAL">年度报告（年报）</option><option value="Q1">第一季度报告（一季报）</option></select></label>
            <label>报告期末日<input type="text" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} placeholder="YYYY-MM-DD" className="ft-input font-mono" /></label>
            <label>披露日期<input type="text" value={publishedAt} onChange={(e) => setPublishedAt(e.target.value)} placeholder="YYYY-MM-DD" className="ft-input font-mono" /></label>
            <label>会计口径<select value={scope} onChange={(e) => setScope(e.target.value as typeof scope)} className="ft-input"><option value="CONSOLIDATED">合并口径（CONSOLIDATED）</option><option value="PARENT">母公司口径（PARENT）</option></select></label>
          </div>

          <button type="submit" disabled={isUploading} className="ft-btn ft-btn-primary filing-submit"><Sparkles className="h-4 w-4" />{isUploading ? "正在解析财报并执行核验..." : `启动 ${currentRound} 财报核验`}<ArrowRight className="h-4 w-4" /></button>
        </form>
      </div>
    </div>
  );
};
