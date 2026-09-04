import React, { useState } from "react";
import {
  ArrowRight,
  Building2,
  Calendar,
  CheckCircle2,
  FileCheck2,
  Plus,
  Sparkles,
  Target,
  Trash2,
} from "lucide-react";

export interface ExtractedThesisItem {
  thesisId: string;
  title: string;
  statement: string;
  type: string;
  criterion: {
    kind: string;
    metric?: string;
    op?: string;
    target?: string;
    unit?: string;
    period?: { start: string; end: string; basis: string };
    scope?: string;
  };
  sourceEvidenceIds?: string[];
}

export interface CompanyCandidate {
  name: string;
  securityCode: string;
  exchange?: string;
  confidence?: number;
}

interface ThesisReviewViewProps {
  initialTheses: ExtractedThesisItem[];
  companyCandidates: CompanyCandidate[];
  reportDate?: string | null;
  onConfirmT0: (company: { name: string; securityCode: string; exchange?: string }, theses: ExtractedThesisItem[]) => void;
  isSubmitting?: boolean;
}

export const ThesisReviewView: React.FC<ThesisReviewViewProps> = ({
  initialTheses,
  companyCandidates,
  reportDate,
  onConfirmT0,
  isSubmitting = false,
}) => {
  const [selectedCompany, setSelectedCompany] = useState({
    name: companyCandidates[0]?.name || "",
    securityCode: companyCandidates[0]?.securityCode || "",
    exchange: companyCandidates[0]?.exchange || "SZSE",
  });
  const [theses, setTheses] = useState<ExtractedThesisItem[]>(initialTheses);

  const handleUpdateThesis = (idx: number, field: "statement" | "target" | "periodEnd" | "scope", value: string) => {
    const next = [...theses];
    if (field === "statement") {
      next[idx].statement = value;
      next[idx].title = value.slice(0, 30);
    } else if (field === "target") {
      next[idx].criterion = { ...next[idx].criterion, target: value };
    } else if (field === "periodEnd" && next[idx].criterion.period) {
      next[idx].criterion = { ...next[idx].criterion, period: { ...next[idx].criterion.period, end: value } };
    } else if (field === "scope") {
      next[idx].criterion = { ...next[idx].criterion, scope: value };
    }
    setTheses(next);
  };

  const handleDeleteThesis = (idx: number) => {
    if (theses.length > 1) setTheses(theses.filter((_, i) => i !== idx));
  };

  const handleAddThesis = () => {
    setTheses([
      ...theses,
      {
        thesisId: `thesis-user-${Date.now()}`,
        title: "新增跟踪指标",
        statement: "预计净利润实现稳步增长",
        type: "NUMERIC_FORECAST",
        criterion: {
          kind: "COMPARE",
          metric: "net_profit",
          op: "GTE",
          target: "20",
          unit: "RATIO",
          period: { start: "2025-01-01", end: "2025-12-31", basis: "YEAR" },
          scope: "CONSOLIDATED",
        },
      },
    ]);
  };

  const getTypeBadge = (type: string) => {
    const labels: Record<string, string> = {
      NUMERIC_FORECAST: "数值预测",
      DIRECTIONAL: "方向判断",
      CAUSAL: "原因归因",
    };
    return <span className={`review-type-badge review-type-${type.toLowerCase()}`}>{labels[type] || "定性研判"}</span>;
  };

  return (
    <div className="review-page">
      <div className="review-header">
        <div className="ft-eyebrow"><Sparkles className="h-3.5 w-3.5" /> Ling-3.0-Flash-Fin · 观点提炼</div>
        <h1>确认标的公司与可核验观点</h1>
        <p>系统已从你的研报中提取未来可被财报验证的观点。请确认公司代码与观点，形成持续跟踪基线（T0）。</p>
      </div>

      <section className="review-card review-company-card">
        <div className="review-card-title"><Building2 className="h-4 w-4" />确认标的公司 <span>分析师拥有最终确认权</span></div>
        <div className="review-company-fields">
          <label>公司名称<input type="text" value={selectedCompany.name} onChange={(e) => setSelectedCompany({ ...selectedCompany, name: e.target.value })} className="ft-input" /></label>
          <label>证券代码<input type="text" value={selectedCompany.securityCode} onChange={(e) => setSelectedCompany({ ...selectedCompany, securityCode: e.target.value })} className="ft-input font-mono" /></label>
        </div>
        {reportDate && <div className="review-report-date"><Calendar className="h-3.5 w-3.5" />研报发布日期候选：{reportDate}</div>}
      </section>

      <div className="review-section-heading">
        <div><h2><FileCheck2 className="h-4 w-4" />可核验投资观点列表</h2><span>{theses.length} 条 · 可编辑</span></div>
        <button type="button" onClick={handleAddThesis} className="ft-btn ft-btn-ghost"><Plus className="h-3.5 w-3.5" />补充观点</button>
      </div>

      <div className="review-thesis-list">
        {theses.map((item, idx) => (
          <article key={item.thesisId || idx} className="review-thesis-card">
            <div className="review-thesis-head">
              <div className="review-thesis-meta"><span className="review-number">{idx + 1}</span>{getTypeBadge(item.type)}<span>口径：{item.criterion.scope || "CONSOLIDATED"}</span>{item.criterion.period && <span>期限：{item.criterion.period.basis === "YEAR" ? "全年" : "阶段"}（{item.criterion.period.end}）</span>}</div>
              {theses.length > 1 && <button type="button" onClick={() => handleDeleteThesis(idx)} className="review-delete" title="删除此观点"><Trash2 className="h-4 w-4" /></button>}
            </div>

            <label className="review-field">观点表述<textarea rows={2} value={item.statement} onChange={(e) => handleUpdateThesis(idx, "statement", e.target.value)} className="ft-input" /></label>

            {item.criterion.target !== undefined && (
              <div className="review-criterion-row"><Target className="h-4 w-4" /><span>核验门槛条件：</span><span className="font-mono">{item.criterion.metric} {item.criterion.op || "GTE"}</span><input type="text" value={item.criterion.target || ""} onChange={(e) => handleUpdateThesis(idx, "target", e.target.value)} className="review-small-input" /><span>{item.criterion.unit === "RATIO" ? "%" : ""}</span></div>
            )}

            <div className="review-options-row">
              {item.criterion.period && <label>验证期间结束<input type="text" value={item.criterion.period.end} onChange={(e) => handleUpdateThesis(idx, "periodEnd", e.target.value)} className="review-small-input review-date-input" /></label>}
              <label>会计口径<select value={item.criterion.scope || "CONSOLIDATED"} onChange={(e) => handleUpdateThesis(idx, "scope", e.target.value)} className="review-small-select"><option value="CONSOLIDATED">合并</option><option value="PARENT">母公司</option><option value="SEGMENT">分部</option></select></label>
            </div>
          </article>
        ))}
      </div>

      <div className="review-confirm-area">
        <button type="button" onClick={() => onConfirmT0(selectedCompany, theses)} disabled={isSubmitting} className="ft-btn ft-btn-success review-confirm-button">
          <CheckCircle2 className="h-5 w-5" />
          {isSubmitting ? "正在保存 T0..." : "确认观点并建立初始研究状态（T0）"}
          {!isSubmitting && <ArrowRight className="h-5 w-5" />}
        </button>
        <p>保存后将形成项目的 Markdown Research Memory T0 基线，随后即可上传对应财报启动核验。</p>
      </div>
    </div>
  );
};
