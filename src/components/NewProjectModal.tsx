import React, { useEffect, useState } from "react";
import { X, Plus, Trash2, Sparkles, BookOpen } from "lucide-react";
import type { ResearchThesis, FollowUpQuestion } from "../types/fintrust";

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    company: string;
    ticker: string;
    summary: string;
    initial_notes: string;
    theses: Array<Partial<ResearchThesis>>;
    questions: Array<Partial<FollowUpQuestion>>;
  }) => Promise<void>;
}

export const NewProjectModal: React.FC<NewProjectModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [company, setCompany] = useState("");
  const [ticker, setTicker] = useState("");
  const [name, setName] = useState("");
  const [initialNotes, setInitialNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default 3-5 custom theses template
  const [theses, setTheses] = useState<Array<{ title: string; original_view: string; verification_criteria: string }>>([
    {
      title: "主营业务收入恢复增长",
      original_view: "行业去库存周期结束，下游终端需求温和复苏，驱动营收重回两位数增长轨道。",
      verification_criteria: "营收同比增速 >= 15%，超越 20% 为加速扩张",
    },
    {
      title: "综合毛利率保持稳态韧性",
      original_view: "高壁垒产品结构提升对冲晶圆制造成本，综合毛利率波动保持平稳。",
      verification_criteria: "综合毛利率同比变动在 ±0.50 个百分点以内",
    },
    {
      title: "经营现金流与盈利匹配",
      original_view: "销售回款顺畅，经营性净现金流与归母净利润保持高度匹配。",
      verification_criteria: "现金利润比 >= 0.90 倍且经营净现金流无同比下滑",
    },
  ]);

  const [questions, setQuestions] = useState<string[]>([
    "关注新产品在主流客户处的批量认证节奏与商业化放量拐点。",
  ]);

  useEffect(() => {
    if (isOpen) setError(null);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAddThesis = () => {
    if (theses.length >= 6) return;
    setTheses([
      ...theses,
      {
        title: `自定义核心观点 ${theses.length + 1}`,
        original_view: "输入买方初始判断假设...",
        verification_criteria: "输入量化门槛或定性验证标准...",
      },
    ]);
  };

  const handleRemoveThesis = (index: number) => {
    if (theses.length <= 1) return;
    setTheses(theses.filter((_, i) => i !== index));
  };

  const handleAddQuestion = () => {
    setQuestions([...questions, ""]);
  };

  const handleRemoveQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const handleFillSample = () => {
    setCompany("汇顶科技");
    setTicker("603160.SH");
    setName("汇顶科技 (603160.SH) - 传感器与无线音频芯片跟踪");
    setInitialNotes(
      "【合成演示模板：不代表真实公司披露】\n这里只是帮助预览 T0 结构的示例文本。正式使用请替换为实际研究底稿，并逐项补充可核验来源。"
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company.trim()) {
      setError("请填写公司名称。");
      return;
    }
    if (theses.length === 0 || theses.some((thesis) => !thesis.title.trim() || !thesis.original_view.trim())) {
      setError("至少保留一条观点，并填写观点标题与原始判断。");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        company: company.trim(),
        ticker: ticker.trim(),
        name: name.trim() || `${company.trim()} 投资观点跟踪`,
        summary: `聚焦 ${company.trim()} 核心投资逻辑验证`,
        initial_notes: initialNotes,
        theses: theses.map((t, idx) => ({
          id: `THESIS_${String(idx + 1).padStart(2, "0")}`,
          title: t.title,
          original_view: t.original_view,
          verification_criteria: t.verification_criteria,
          current_status: "保持",
          formed_at: new Date().toISOString(),
          basis: "T0 初始买方备忘确立",
        })),
        questions: questions
          .filter((q) => q.trim().length > 0)
          .map((q, idx) => ({
            id: `Q${String(idx + 1).padStart(2, "0")}`,
            question_text: q,
            status: "未解决",
            answer_notes: "",
          })),
      });
      onClose();
    } catch (err: any) {
      setError(String(err?.message || err || "新建项目失败"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden text-slate-100 my-8">
        {/* Header */}
        <div className="p-5 border-b border-slate-800/80 flex items-center justify-between bg-slate-950/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-500/15 text-blue-400 border border-blue-500/30 rounded-xl">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">创建新买方研究项目（T0 基准建仓）</h3>
              <p className="text-[11px] text-slate-400">建立独立的 SQLite 观点沙盒与连续评估条件</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleFillSample}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-blue-300 hover:text-blue-200 border border-slate-700 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
            >
              填入演示模板
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl cursor-pointer transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-rose-950/60 border border-rose-800 rounded-lg text-xs text-rose-300 flex items-start gap-2" role="alert">
              <span className="font-semibold shrink-0">提交失败：</span>
              <span>{error}</span>
            </div>
          )}
          {/* Company & Ticker */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">公司名称 *</label>
              <input
                type="text"
                required
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="例如：圣邦股份 或 汇顶科技"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">证券代码</label>
              <input
                type="text"
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
                placeholder="例如：300661.SZ"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>
          </div>

          {/* Initial Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              T0 初始研究底稿 / 买方备忘笔记 (Initial Notes)
            </label>
            <textarea
              rows={3}
              value={initialNotes}
              onChange={(e) => setInitialNotes(e.target.value)}
              placeholder="粘贴买方分析师旧研究笔记、建仓备忘或历史判断文本..."
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-sans leading-relaxed"
            />
          </div>

          {/* Core Theses (3-5 user-defined theses) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  核心投资观点体系 (3–5 项核心支柱)
                </h4>
                <p className="text-[11px] text-slate-400">
                  支持自定义增删与设置量化验证条件，后续所有轮次材料将围绕这些观点进行连续评估。
                </p>
              </div>
              {theses.length < 6 && (
                <button
                  type="button"
                  onClick={handleAddThesis}
                  className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> 添加观点
                </button>
              )}
            </div>

            <div className="space-y-3">
              {theses.map((t, idx) => (
                <div key={idx} className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-blue-400">支柱 {idx + 1}</span>
                    {theses.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveThesis(idx)}
                        className="text-slate-500 hover:text-rose-400 cursor-pointer"
                        title="删除该观点"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={t.title}
                    onChange={(e) => {
                      const next = [...theses];
                      next[idx].title = e.target.value;
                      setTheses(next);
                    }}
                    placeholder="观点标题（例如：收入恢复增长与下游景气修复）"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 font-medium"
                  />
                  <input
                    type="text"
                    value={t.original_view}
                    onChange={(e) => {
                      const next = [...theses];
                      next[idx].original_view = e.target.value;
                      setTheses(next);
                    }}
                    placeholder="原始判断逻辑阐述..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-blue-500"
                  />
                  <input
                    type="text"
                    value={t.verification_criteria}
                    onChange={(e) => {
                      const next = [...theses];
                      next[idx].verification_criteria = e.target.value;
                      setTheses(next);
                    }}
                    placeholder="验证门槛标准（例如：营收同比增速 >= 15%）"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-amber-300 focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Follow-up Questions */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  初始未决疑问跟踪清单 (Follow-up Questions)
                </h4>
                <p className="text-[11px] text-slate-400">T0阶段留存的待后续财报或定性调研回答的关键问题。</p>
              </div>
              <button
                type="button"
                onClick={handleAddQuestion}
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> 添加疑问
              </button>
            </div>

            <div className="space-y-2">
              {questions.map((q, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-xs font-mono text-slate-500">Q{idx + 1}</span>
                  <input
                    type="text"
                    value={q}
                    onChange={(e) => {
                      const next = [...questions];
                      next[idx] = e.target.value;
                      setQuestions(next);
                    }}
                    placeholder="待核验核心问题..."
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                  {questions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveQuestion(idx)}
                      className="text-slate-500 hover:text-rose-400 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium cursor-pointer"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !company}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-md"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {isSubmitting ? "正在保存至 SQLite..." : "确立 T0 基线并开启持续跟踪"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
