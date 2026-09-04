import React, { useState } from "react";
import { Sparkles, Building2, CheckCircle2, Trash2, Plus, ArrowRight, FileCheck2, Calendar, Target } from "lucide-react";

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
    period?: {
      start: string;
      end: string;
      basis: string;
    };
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
  const [selectedCompany, setSelectedCompany] = useState<{
    name: string;
    securityCode: string;
    exchange?: string;
  }>({
    name: companyCandidates[0]?.name || "",
    securityCode: companyCandidates[0]?.securityCode || "",
    exchange: companyCandidates[0]?.exchange || "SZSE",
  });

  const [theses, setTheses] = useState<ExtractedThesisItem[]>(initialTheses);

  const handleUpdateThesis = (idx: number, field: keyof ExtractedThesisItem | "target" | "statement" | "periodEnd" | "scope", value: any) => {
    const next = [...theses];
    if (field === "statement") {
      next[idx].statement = value;
      next[idx].title = value.slice(0, 30);
    } else if (field === "target") {
      next[idx].criterion = {
        ...next[idx].criterion,
        target: value,
      };
    } else if (field === "periodEnd" && next[idx].criterion.period) {
      next[idx].criterion = {
        ...next[idx].criterion,
        period: { ...next[idx].criterion.period, end: value },
      };
    } else if (field === "scope") {
      next[idx].criterion = {
        ...next[idx].criterion,
        scope: value,
      };
    }
    setTheses(next);
  };

  const handleDeleteThesis = (idx: number) => {
    if (theses.length <= 1) return;
    setTheses(theses.filter((_, i) => i !== idx));
  };

  const handleAddThesis = () => {
    const newId = `thesis-user-${Date.now()}`;
    setTheses([
      ...theses,
      {
        thesisId: newId,
        title: "新增跟踪指标",
        statement: "预计净利润实现稳步增长",
        type: "NUMERIC_FORECAST",
        criterion: {
          kind: "COMPARE",
          metric: "net_profit",
          op: "GTE",
          target: "20",
          unit: "RATIO",
          period: {
            start: "2025-01-01",
            end: "2025-12-31",
            basis: "YEAR",
          },
          scope: "CONSOLIDATED",
        },
      },
    ]);
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "NUMERIC_FORECAST":
        return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-950 text-blue-300 border border-blue-800">数值预测</span>;
      case "DIRECTIONAL":
        return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800">方向判断</span>;
      case "CAUSAL":
        return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-950 text-purple-300 border border-purple-800">原因归因</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-800 text-slate-300">定性研判</span>;
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-10 px-6 space-y-8 animate-in fade-in duration-300 text-slate-100">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/25 text-blue-400 text-xs font-semibold uppercase">
          <Sparkles className="w-3.5 h-3.5" />
          观点提炼结果 · 待分析师确认
        </div>
        <h1 className="text-3xl font-extrabold text-white">确认标的公司与可核验观点</h1>
        <p className="text-sm text-slate-400">
          系统已从研报中提取出未来可被财报验证的投资观点。请确认公司代码与观点，形成持续跟踪基线（T0）。
        </p>
      </div>

      {/* Company Confirmation Section */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
          <Building2 className="w-4 h-4 text-blue-400" />
          确认标的公司（分析师拥有最终确认权）
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-slate-400 block mb-1">公司名称</label>
            <input
              type="text"
              value={selectedCompany.name}
              onChange={(e) => setSelectedCompany({ ...selectedCompany, name: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">证券代码</label>
            <input
              type="text"
              value={selectedCompany.securityCode}
              onChange={(e) => setSelectedCompany({ ...selectedCompany, securityCode: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
        {reportDate && (
          <div className="text-xs text-slate-500 flex items-center gap-1.5 pt-1">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            研报发布日期候选：{reportDate}
          </div>
        )}
      </div>

      {/* Theses Cards */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <FileCheck2 className="w-4 h-4 text-emerald-400" />
            可核验投资观点列表 ({theses.length} 条)
          </div>
          <button
            onClick={handleAddThesis}
            className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 cursor-pointer font-medium"
          >
            <Plus className="w-3.5 h-3.5" /> 补充观点
          </button>
        </div>

        {theses.map((item, idx) => (
          <div
            key={item.thesisId || idx}
            className="bg-slate-900/90 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-5 space-y-3 transition-all"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="w-6 h-6 rounded-full bg-slate-800 text-slate-300 text-xs flex items-center justify-center font-bold">
                  {idx + 1}
                </span>
                {getTypeBadge(item.type)}
                <span className="text-xs text-slate-500 font-mono">
                  口径：{item.criterion.scope || "CONSOLIDATED"}
                </span>
                {item.criterion.period && (
                  <span className="text-xs text-slate-500 font-mono">
                    期限：{item.criterion.period.basis === "YEAR" ? "全年" : "阶段"} ({item.criterion.period.end})
                  </span>
                )}
              </div>
              {theses.length > 1 && (
                <button
                  onClick={() => handleDeleteThesis(idx)}
                  className="text-slate-500 hover:text-rose-400 p-1 rounded transition-colors cursor-pointer"
                  title="删除此观点"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Thesis Statement Edit */}
            <div>
              <label className="text-xs text-slate-400 block mb-1">观点表述</label>
              <textarea
                rows={2}
                value={item.statement}
                onChange={(e) => handleUpdateThesis(idx, "statement", e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Target Value Edit (if numeric) */}
            {item.criterion.target !== undefined && (
              <div className="flex items-center gap-3 pt-1">
                <Target className="w-4 h-4 text-blue-400 shrink-0" />
                <span className="text-xs text-slate-400">核验门槛条件：</span>
                <span className="text-xs font-mono text-slate-300">
                  {item.criterion.metric} {item.criterion.op || "GTE"}
                </span>
                <input
                  type="text"
                  value={item.criterion.target || ""}
                  onChange={(e) => handleUpdateThesis(idx, "target", e.target.value)}
                  className="w-20 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-blue-300 font-mono focus:outline-none focus:border-blue-500"
                />
                <span className="text-xs text-slate-400">{item.criterion.unit === "RATIO" ? "%" : ""}</span>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-slate-400">
              {item.criterion.period && (
                <label className="flex items-center gap-2">
                  验证期间结束
                  <input
                    type="text"
                    value={item.criterion.period.end}
                    onChange={(e) => handleUpdateThesis(idx, "periodEnd", e.target.value)}
                    className="w-28 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                  />
                </label>
              )}
              <label className="flex items-center gap-2">
                会计口径
                <select
                  value={item.criterion.scope || "CONSOLIDATED"}
                  onChange={(e) => handleUpdateThesis(idx, "scope", e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="CONSOLIDATED">合并</option>
                  <option value="PARENT">母公司</option>
                  <option value="SEGMENT">分部</option>
                </select>
              </label>
            </div>
          </div>
        ))}
      </div>

      {/* Confirmation Action */}
      <div className="pt-4">
        <button
          onClick={() => onConfirmT0(selectedCompany, theses)}
          disabled={isSubmitting}
          className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-2xl flex items-center justify-center gap-2 cursor-pointer shadow-xl shadow-emerald-600/25 text-base transition-all"
        >
          <CheckCircle2 className="w-5 h-5 text-emerald-100" />
          确认观点并建立初始研究状态 (形成 T0)
          <ArrowRight className="w-5 h-5 ml-1" />
        </button>
        <p className="text-center text-xs text-slate-500 mt-2">
          保存后将形成项目的 Research Memory T0 基线，随后即可上传对应财报启动核验。
        </p>
      </div>
    </div>
  );
};
