import React, { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileText,
  HelpCircle,
  Loader2,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Upload,
  XCircle,
} from "lucide-react";
import type { UploadReceipt } from "../../shared/domain";
import { DEMO_RESEARCH, DEMO_STATUS_META, type DemoResearchStatus } from "../../data/demoResearch";

export interface ReportUploadParams {
  file?: File;
  fileName: string;
  companyCode?: string;
  isDemo?: boolean;
}

interface ReportUploadViewProps {
  onStartAnalysis: (params: ReportUploadParams) => void;
  onStartExtraction?: (reportDocumentId: string) => void;
  onOpenDemo?: () => void;
  isAnalyzing: boolean;
  currentStep?: string;
  receipt?: UploadReceipt | null;
  error?: string | null;
}

function StatusIcon({ status }: { status: DemoResearchStatus }) {
  if (status === "SUPPORTED") return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (status === "PARTIALLY_SUPPORTED") return <TrendingUp className="h-3.5 w-3.5" />;
  if (status === "WEAKENED") return <XCircle className="h-3.5 w-3.5" />;
  return <HelpCircle className="h-3.5 w-3.5" />;
}

function PreviewStatus({ status }: { status: DemoResearchStatus }) {
  const meta = DEMO_STATUS_META[status];
  return (
    <span className={`demo-status demo-status-compact ${meta.className}`}>
      <StatusIcon status={status} />
      {meta.label}
    </span>
  );
}

const previewItems = [
  DEMO_RESEARCH.items[0],
  DEMO_RESEARCH.items[1],
  DEMO_RESEARCH.items[2],
  DEMO_RESEARCH.items[4],
];

const demoCounts = {
  supported: DEMO_RESEARCH.items.filter((item) => item.status === "SUPPORTED").length,
  partial: DEMO_RESEARCH.items.filter((item) => item.status === "PARTIALLY_SUPPORTED").length,
  weakened: DEMO_RESEARCH.items.filter((item) => item.status === "WEAKENED").length,
  unresolved: DEMO_RESEARCH.items.filter((item) => item.status === "UNRESOLVED").length,
};

export const ReportUploadView: React.FC<ReportUploadViewProps> = ({
  onStartAnalysis,
  onStartExtraction,
  onOpenDemo,
  isAnalyzing,
  currentStep = "解析研报中...",
  receipt = null,
  error = null,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);

  const startUpload = (file: File) => onStartAnalysis({ fileName: file.name, file });

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) startUpload(file);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) startUpload(file);
  };

  return (
    <div className="report-upload-page">
      <section className="report-hero">
        <div>
          <div className="ft-eyebrow"><Sparkles className="h-3.5 w-3.5" /> 研报观点持续核验 V1</div>
          <h1>让每一条研报观点，<span>都能被下一期财报回答</span></h1>
          <p>
            上传研报，由 Ling-3.0-Flash-Fin 提炼可验证观点；确认 T0 后，再用你自己的官方财报逐条核验，结果沉淀到本地 Markdown Research Memory。
          </p>
        </div>
        <div className="report-flow-strip" aria-label="真实研究流程">
          <div className="report-flow-item is-active"><span>01</span><strong>上传研报</strong></div>
          <ArrowRight className="h-4 w-4" />
          <div className="report-flow-item"><span>02</span><strong>确认 T0</strong></div>
          <ArrowRight className="h-4 w-4" />
          <div className="report-flow-item"><span>03</span><strong>核验 T1 / T2</strong></div>
        </div>
      </section>

      <div className="report-first-grid">
        <section className="demo-preview-card" aria-labelledby="demo-preview-title">
          <div className="demo-preview-head">
            <div>
              <div className="demo-preview-kicker"><span className="demo-kicker-dot" /> Demo · 已完成核验</div>
              <h2 id="demo-preview-title">先看结果，再决定是否上传</h2>
              <p>{DEMO_RESEARCH.company} · {DEMO_RESEARCH.ticker} · {DEMO_RESEARCH.period}</p>
            </div>
            <span className="demo-readonly-mark"><LockKeyhole className="h-3 w-3" /> 只读样例</span>
          </div>

          <div className="demo-preview-insight">
            <span>本轮研究结论</span>
            <strong>{DEMO_RESEARCH.roundSummary.headline}</strong>
            <p>{DEMO_RESEARCH.roundSummary.detail}</p>
          </div>

          <div className="demo-preview-summary">
            <div className="demo-preview-total"><strong>{DEMO_RESEARCH.items.length}</strong><span>条观点</span></div>
            <div className="demo-preview-count is-supported"><CheckCircle2 /><strong>{demoCounts.supported}</strong><span>已验证</span></div>
            <div className="demo-preview-count is-partial"><TrendingUp /><strong>{demoCounts.partial}</strong><span>部分支持</span></div>
            <div className="demo-preview-count is-weakened"><XCircle /><strong>{demoCounts.weakened}</strong><span>被削弱</span></div>
            <div className="demo-preview-count is-unresolved"><HelpCircle /><strong>{demoCounts.unresolved}</strong><span>待跟踪</span></div>
          </div>

          <div className="demo-preview-list">
            {previewItems.map((item) => (
              <article key={item.id} className={`demo-preview-item ${DEMO_STATUS_META[item.status].className}`}>
                <div className="demo-preview-item-head">
                  <div className="flex min-w-0 items-center gap-2">
                    <StatusIcon status={item.status} />
                    <h3>{item.title}</h3>
                  </div>
                  <PreviewStatus status={item.status} />
                </div>
                <p className="demo-preview-verdict">{item.verdict}</p>
                <div className="demo-preview-fact"><span>旧观点</span><p>{item.originalView}</p></div>
                <div className="demo-preview-fact"><span>最新财报</span><p>{item.latestFact}</p></div>
                <div className="demo-preview-gap"><Target className="h-3.5 w-3.5" />{item.gap}</div>
              </article>
            ))}
          </div>

          <div className="demo-preview-foot">
            <span><ShieldCheck className="h-4 w-4" /> 演示数据 · 每条结果保留差距、原因与下一问</span>
            <button type="button" onClick={onOpenDemo || (() => onStartAnalysis({ fileName: "FinTrust_Demo_State.md", isDemo: true }))} disabled={isAnalyzing} className="ft-btn ft-btn-primary">
              查看完整核验 Demo <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </section>

        <section className="upload-card" aria-labelledby="upload-title">
          <div className="upload-card-head">
            <div className="upload-card-icon"><Upload className="h-5 w-5" /></div>
            <div>
              <p className="upload-card-kicker">真实研究入口</p>
              <h2 id="upload-title">上传我的研报</h2>
            </div>
          </div>
          <p className="upload-card-intro">先解析原文与坐标，再让 Ling 提炼可被财报核验的观点。文件不会被演示数据替代。</p>

          {error && !isAnalyzing && (
            <div className="inline-alert is-error" role="alert">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <div><strong>研报上传或解析失败</strong><p>{error}</p></div>
            </div>
          )}

          {receipt && !isAnalyzing ? (
            <div className="upload-receipt">
              <div className="upload-receipt-title"><CheckCircle2 className="h-5 w-5" /><strong>PDF 已解析</strong></div>
              <p className="upload-receipt-file"><FileText className="h-4 w-4" />{receipt.document.fileName}</p>
              <div className="upload-receipt-grid">
                <span>页数 <strong>{receipt.parseSummary.pageCount}</strong></span>
                <span>片段 <strong>{receipt.parseSummary.spanCount}</strong></span>
                <span>SHA <strong>{receipt.document.sha256.slice(0, 10)}…</strong></span>
              </div>
              <div className="inline-alert is-info"><FileCheck2 className="h-4 w-4 shrink-0" />文件已保存，下一步由 Ling 提炼观点。</div>
              {onStartExtraction && <button type="button" onClick={() => onStartExtraction(receipt.document.id)} className="ft-btn ft-btn-primary w-full"><Sparkles className="h-4 w-4" />开始提炼观点<ArrowRight className="h-4 w-4" /></button>}
            </div>
          ) : isAnalyzing ? (
            <div className="upload-progress">
              <div className="upload-progress-icon"><Loader2 className="h-6 w-6 animate-spin" /></div>
              <strong>正在处理你的研报</strong>
              <span>{currentStep}</span>
              <div className="upload-progress-steps"><span className="is-done"><CheckCircle2 /> 上传 PDF 并校验</span><span><Clock3 /> 解析页面、段落与表格</span></div>
            </div>
          ) : (
            <div
              onDragOver={(event) => { event.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              className={`upload-dropzone ${isDragOver ? "is-dragging" : ""}`}
            >
              <input type="file" accept="application/pdf,.pdf" onChange={handleFileChange} />
              <div className="upload-dropzone-icon"><Upload className="h-6 w-6" /></div>
              <strong>点击上传或拖入 PDF</strong>
              <span>券商研报 · 单文件最大 50MB</span>
              <em><ShieldCheck className="h-3.5 w-3.5" />本地解析 · 原文坐标严格绑定</em>
            </div>
          )}

          <div className="upload-card-note"><span className="status-dot is-green" />真实流程会在你确认 T0 后才进入财报核验</div>
        </section>
      </div>

      <section className="workflow-promise">
        <div className="workflow-promise-item"><span>01</span><div><strong>上传研报</strong><p>保存原文件、解析结构与证据坐标</p></div></div>
        <div className="workflow-promise-item"><span>02</span><div><strong>人工确认 T0</strong><p>你决定哪些观点进入持续跟踪</p></div></div>
        <div className="workflow-promise-item"><span>03</span><div><strong>财报逐条核验</strong><p>事实、差距与原因都可回溯</p></div></div>
        <div className="workflow-promise-item"><span>04</span><div><strong>Markdown Memory</strong><p>用户修正跨轮继承，不被模型覆盖</p></div></div>
      </section>
    </div>
  );
};
