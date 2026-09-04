import React from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileCheck2,
  HelpCircle,
  LockKeyhole,
  Search,
  ShieldCheck,
  Target,
  TrendingUp,
  XCircle,
} from "lucide-react";
import {
  DEMO_RESEARCH,
  DEMO_STATUS_META,
  type DemoResearchItem,
  type DemoResearchStatus,
} from "../../data/demoResearch";

interface DemoResearchViewProps {
  onBackHome: () => void;
}

function StatusIcon({ status, className = "h-4 w-4" }: { status: DemoResearchStatus; className?: string }) {
  if (status === "SUPPORTED") return <CheckCircle2 className={className} />;
  if (status === "PARTIALLY_SUPPORTED") return <TrendingUp className={className} />;
  if (status === "WEAKENED") return <XCircle className={className} />;
  return <HelpCircle className={className} />;
}

function StatusBadge({ status, compact = false }: { status: DemoResearchStatus; compact?: boolean }) {
  const meta = DEMO_STATUS_META[status];
  return (
    <span className={`demo-status ${meta.className} ${compact ? "demo-status-compact" : ""}`}>
      <StatusIcon status={status} className="h-3.5 w-3.5" />
      <span>{meta.label}</span>
    </span>
  );
}

function DetailRow({
  icon,
  label,
  children,
  className = "",
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`demo-detail-row ${className}`}>
      <div className="demo-detail-label">
        {icon}
        <span>{label}</span>
      </div>
      <p>{children}</p>
    </div>
  );
}

function DemoThesisCard({ item, index }: { item: DemoResearchItem; index: number }) {
  return (
    <article className={`demo-thesis-card ${DEMO_STATUS_META[item.status].className}`}>
      <div className="demo-thesis-card-head">
        <div className="flex min-w-0 items-center gap-3">
          <span className="demo-index">{String(index + 1).padStart(2, "0")}</span>
          <div className="min-w-0">
            <h3>{item.title}</h3>
            <p className="demo-thesis-id">持续跟踪观点 · {item.maturity}</p>
          </div>
        </div>
        <StatusBadge status={item.status} />
      </div>

      <div className="demo-thesis-details">
        <div className={`demo-card-verdict ${DEMO_STATUS_META[item.status].className}`}>
          <StatusIcon status={item.status} />
          <div><span>本轮判断</span><strong>{item.verdict}</strong></div>
        </div>

        <div className="demo-comparison">
          <div className="demo-comparison-block">
            <div><FileCheck2 /><span>T0 · 旧判断</span></div>
            <p>{item.originalView}</p>
          </div>
          <div className="demo-comparison-block is-evidence">
            <div><ShieldCheck /><span>T1 · 最新财报事实</span></div>
            <p>{item.latestFact}</p>
          </div>
        </div>

        <DetailRow icon={<Target />} label="偏差判断">
          {item.gap}
        </DetailRow>
        <DetailRow icon={<AlertTriangle />} label="原因解释">
          {item.reason}
        </DetailRow>
        <DetailRow icon={<Search />} label="下一步问题" className="demo-detail-question">
          {item.nextQuestion}
        </DetailRow>
      </div>

      <div className="demo-thesis-card-foot">
        <span><FileCheck2 className="h-3.5 w-3.5" />证据位置：{item.evidence}</span>
        <span className="demo-readonly-mark"><LockKeyhole className="h-3 w-3" /> 演示</span>
      </div>
    </article>
  );
}

export const DemoResearchView: React.FC<DemoResearchViewProps> = ({ onBackHome }) => {
  const supported = DEMO_RESEARCH.items.filter((item) => item.status === "SUPPORTED").length;
  const partial = DEMO_RESEARCH.items.filter((item) => item.status === "PARTIALLY_SUPPORTED").length;
  const weakened = DEMO_RESEARCH.items.filter((item) => item.status === "WEAKENED").length;
  const unresolved = DEMO_RESEARCH.items.filter((item) => item.status === "UNRESOLVED").length;

  return (
    <div className="demo-page">
      <div className="demo-page-topbar">
        <button type="button" onClick={onBackHome} className="ft-btn ft-btn-soft">
          <ArrowLeft className="h-4 w-4" />
          返回首页
        </button>
        <span className="demo-readonly-banner">
          <LockKeyhole className="h-3.5 w-3.5" />
          演示数据 · 仅展示研究结构，不写入你的 Memory
        </span>
      </div>

      <section className="demo-hero-card">
        <div className="demo-hero-copy">
          <div className="demo-kicker"><span className="demo-kicker-dot" /> Demo · 已完成核验结果</div>
          <div className="flex flex-wrap items-end gap-3">
            <h1>本轮研究状态</h1>
            <span className="demo-version">{DEMO_RESEARCH.memoryVersion}</span>
          </div>
          <p>
            Ling 读取上轮已确认观点，再把新财报事实逐条对齐；你看到的不是一次性摘要，而是本轮观点发生了什么变化。
          </p>
          <div className="demo-company-line">
            <span className="demo-company-name">{DEMO_RESEARCH.company}</span>
            <span className="demo-ticker">{DEMO_RESEARCH.ticker}</span>
            <span>{DEMO_RESEARCH.period}</span>
          </div>
        </div>
        <div className="demo-flow">
          <div className="demo-flow-step is-done"><span>T0</span><strong>研报观点</strong></div>
          <ArrowRight className="demo-flow-arrow" />
          <div className="demo-flow-step is-done"><span>T1</span><strong>财报事实</strong></div>
          <ArrowRight className="demo-flow-arrow" />
          <div className="demo-flow-step is-current"><span>T2</span><strong>研究状态</strong></div>
        </div>
      </section>

      <section className="demo-executive-summary" aria-labelledby="demo-round-summary">
        <div>
          <span className="demo-summary-label">本轮研究结论</span>
          <h2 id="demo-round-summary">{DEMO_RESEARCH.roundSummary.headline}</h2>
          <p>{DEMO_RESEARCH.roundSummary.detail}</p>
        </div>
        <div className="demo-next-focus">
          <Search className="h-4 w-4" />
          <div><span>下一轮优先研究</span><strong>{DEMO_RESEARCH.roundSummary.nextFocus}</strong></div>
        </div>
      </section>

      <section className="demo-summary-grid" aria-label="Demo 核验摘要">
        <div className="demo-summary-primary">
          <span className="demo-summary-label">观点总数</span>
          <strong>{DEMO_RESEARCH.items.length}</strong>
          <span>条持续跟踪逻辑</span>
        </div>
        <div className="demo-summary-stat is-supported"><CheckCircle2 /><strong>{supported}</strong><span>已验证</span></div>
        <div className="demo-summary-stat is-partial"><TrendingUp /><strong>{partial}</strong><span>部分支持</span></div>
        <div className="demo-summary-stat is-weakened"><XCircle /><strong>{weakened}</strong><span>被削弱</span></div>
        <div className="demo-summary-stat is-unresolved"><HelpCircle /><strong>{unresolved}</strong><span>待跟踪</span></div>
      </section>

      <div className="demo-section-heading">
        <div>
          <p className="demo-section-eyebrow">T0 观点 → T1 事实 → T2 状态</p>
          <h2>6 条观点，本轮分别发生了什么变化</h2>
        </div>
        <div className="demo-section-note"><ShieldCheck className="h-4 w-4" /> 每条结果都保留可追溯的财报位置</div>
      </div>

      <section className="demo-thesis-grid">
        {DEMO_RESEARCH.items.map((item, index) => <DemoThesisCard key={item.id} item={item} index={index} />)}
      </section>

      <section className="demo-bottom-cta">
        <div>
          <strong>准备把自己的研报接入同一条研究链路？</strong>
          <p>上传 PDF 后，系统会先由 Ling 提炼观点，确认 T0，再等待你的财报完成 T1/T2 核验。</p>
        </div>
        <button type="button" onClick={onBackHome} className="ft-btn ft-btn-primary">
          用我的研报开始
          <ArrowRight className="h-4 w-4" />
        </button>
      </section>
    </div>
  );
};
