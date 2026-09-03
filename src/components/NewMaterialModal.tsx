import React, { useState } from "react";
import { X, Sparkles, FileText, CheckCircle2, AlertCircle, RefreshCw, Layers } from "lucide-react";
import type { ProjectState, ThesisStatus } from "../types/fintrust";

interface NewMaterialModalProps {
  isOpen: boolean;
  project: ProjectState;
  onClose: () => void;
  onRunAnalysis: (title: string, content: string) => Promise<any>;
  onApplyUpdate: (data: {
    newVersion: string;
    materialTitle: string;
    materialContent: string;
    deltas: any[];
    userRevisions: Record<string, string>;
    questions: any[];
    evidenceSnippets: any[];
  }) => Promise<void>;
}

export const NewMaterialModal: React.FC<NewMaterialModalProps> = ({
  isOpen,
  project,
  onClose,
  onRunAnalysis,
  onApplyUpdate,
}) => {
  const currentVersion = project.current_version;
  const nextVersion =
    currentVersion === "T0"
      ? "T1"
      : currentVersion === "T1"
      ? "T2"
      : `T${parseInt(currentVersion.replace("T", "") || "1") + 1}`;

  const [title, setTitle] = useState(`${project.company} ${nextVersion} 轮增量调研与披露材料`);
  const [content, setContent] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any | null>(null);
  const [userRevisions, setUserRevisions] = useState<Record<string, string>>({});
  const [modifiedDeltas, setModifiedDeltas] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleLoadSampleT2 = async () => {
    try {
      const res = await fetch("/api/sample-materials/t2");
      const sample = await res.json();
      setTitle(sample.title);
      setContent(sample.content);
      setError(null);
    } catch (err: any) {
      setError("无法加载 T2 样例材料");
    }
  };

  const handleLoadGenericTemplate = () => {
    const defaultTemplate = `【${project.company}（${project.ticker}）${nextVersion} 轮业务跟踪交流纪要】
时间：${new Date().toLocaleDateString("zh-CN")}
出席人员：公司管理层、买方研究团队
交流核心要点整理：

1. 核心业务与新产品交付进展：
本季度核心产品线规模化出货持续推进，高附加值新品在核心大客户供应链中实现小批量批量交货。相关产能利用率保持在 85% 以上，整体良品率改善至 99.1%，单只测试与制造成本实现环比下降约 8%-12%。

2. 供应链与存货周转动态：
前期渠道备货与库存得到有效消化，库龄结构显著优化。公司经营性现金流回款平稳，销售商品收到的现金充沛，应收账款周转天数保持在行业合理区间。

3. 关键研发与资质认证推进：
多项具备自主知识产权的高可靠性核心料号已顺利通过关键客户综合认证并纳入正式供应目录。自主工艺流程试产成功，护城河与进入壁垒进一步得到巩固。

4. 风险与后续观察重点：
宏观下游短期需求仍有结构性不确定性，部分通用料号市场竞争激烈，后续需密切观察整体综合毛利率的实质反弹弹性。`;

    setTitle(`${project.company} ${nextVersion} 业务跟踪与运营交流纪要`);
    setContent(defaultTemplate);
    setError(null);
  };

  const handleAnalyze = async () => {
    if (!content.trim()) return;
    setIsAnalyzing(true);
    setError(null);
    try {
      const res = await onRunAnalysis(title, content);
      setAnalysisResult(res);
      setModifiedDeltas(res.deltas || []);
      // Pre-fill user revisions
      const initialRev: Record<string, string> = {};
      if (res.deltas) {
        res.deltas.forEach((d: any) => {
          initialRev[d.thesis_id] = `分析师复核：同意本轮【${d.new_status}】研判，已对账《${title}》。`;
        });
      }
      setUserRevisions(initialRev);
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleStatusChange = (thesisId: string, newStatus: ThesisStatus) => {
    setModifiedDeltas((prev) =>
      prev.map((d) => (d.thesis_id === thesisId ? { ...d, new_status: newStatus } : d))
    );
  };

  const handleConfirmSave = async () => {
    if (!analysisResult) return;
    setIsSaving(true);
    try {
      await onApplyUpdate({
        newVersion: nextVersion,
        materialTitle: title,
        materialContent: content,
        deltas: modifiedDeltas,
        userRevisions,
        questions: analysisResult.questions_update || [],
        evidenceSnippets: modifiedDeltas.flatMap((d: any) =>
          (d.evidence_ids || []).map((id: string) => ({
            id,
            page: 1,
            text: d.reason || "",
          }))
        ),
      });
      onClose();
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden text-slate-100 my-8">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 bg-blue-500/20 text-blue-300 border border-blue-500/40 rounded text-xs font-mono font-bold">
              {nextVersion} 轮观点演进
            </span>
            <h3 className="text-base font-bold text-white tracking-tight">录入新披露材料并进行连续观点对账</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          {/* Top Info Banner */}
          <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <span className="font-semibold text-white">【持续研究状态保持】</span>：系统将自动继承 {currentVersion}{" "}
              版本的 {project.theses.length} 条观点假设、分析师已保存复核修正与 {project.open_questions.length}{" "}
              项未决疑问。新材料即使只有定性运营进展，也会平滑推进！
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {project.company.includes("圣邦") ? (
                <button
                  type="button"
                  onClick={handleLoadSampleT2}
                  className="px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/40 rounded text-xs font-semibold cursor-pointer transition-colors"
                >
                  载入圣邦 T2 定性纪要样例
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleLoadGenericTemplate}
                  className="px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/40 rounded text-xs font-semibold cursor-pointer transition-colors"
                >
                  载入买方调研模板
                </button>
              )}
            </div>
          </div>

          {error && (
            <div className="p-3 bg-rose-950/60 border border-rose-800 rounded-lg text-xs text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Material Inputs */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">材料标题 / 公告名称</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如：圣邦股份2026年一季度经营交流纪要"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-medium"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                增量披露内容 / 会议纪要 / 调研文字 (Raw Content)
              </label>
              <textarea
                rows={7}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="粘贴新公告正文、投资者关系记录、车规认证资质、产能交付进展等定性或定量材料..."
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-sans leading-relaxed"
              />
            </div>
          </div>

          {/* Trigger Analysis Button */}
          {!analysisResult && (
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={isAnalyzing || !content.trim()}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shadow-md transition-all active:scale-98"
            >
              {isAnalyzing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  正在运行观点增量核验与 3 段式 Gap 归因...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  运行连续观点评估 (Run Continuous Analysis)
                </>
              )}
            </button>
          )}

          {/* Analysis Preview & Revisions */}
          {analysisResult && (
            <div className="space-y-4 pt-4 border-t border-slate-800 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  增量评估结果预览 ({analysisResult.version})
                </h4>
                <span className="text-[11px] text-slate-400 font-mono">
                  {analysisResult.analysis_meta?.model_name}
                </span>
              </div>

              {/* Overall Summary */}
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-xs text-slate-300 leading-relaxed">
                <span className="font-semibold text-blue-400">本轮核心研判：</span>
                {analysisResult.overall_summary}
              </div>

              {/* Deltas & User Revisions */}
              <div className="space-y-3">
                <div className="text-xs font-semibold text-slate-400">
                  观点演进比对（支持分析师现场人工修正评级与复核）：
                </div>
                {modifiedDeltas.map((d: any) => (
                  <div key={d.thesis_id} className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white">{d.title}</span>
                      <div className="flex items-center gap-2 font-mono text-[11px]">
                        <span className="text-slate-400">{d.previous_status}</span>
                        <span className="text-slate-600">→</span>
                        {/* Analyst can override the status directly */}
                        <select
                          value={d.new_status}
                          onChange={(e) => handleStatusChange(d.thesis_id, e.target.value as ThesisStatus)}
                          className="bg-slate-900 border border-slate-700 text-xs text-white rounded px-2 py-0.5 font-sans font-semibold focus:outline-none focus:border-blue-500"
                        >
                          <option value="保持">保持</option>
                          <option value="加强">加强</option>
                          <option value="支持">支持</option>
                          <option value="部分支持">部分支持</option>
                          <option value="削弱">削弱</option>
                          <option value="不足以判断">不足以判断</option>
                        </select>
                      </div>
                    </div>

                    <p className="text-slate-300 leading-normal">{d.reason}</p>

                    {/* Gap Explanation 3-Part */}
                    <div className="bg-slate-900/90 rounded-lg p-2.5 text-[11px] space-y-1 border border-slate-800 text-slate-400 font-sans">
                      <div><strong className="text-emerald-400">① 观察业务事实：</strong>{d.gap_explanation?.observed}</div>
                      <div><strong className="text-blue-400">② 官方披露口径：</strong>{d.gap_explanation?.disclosed_reason}</div>
                      <div><strong className="text-amber-400">③ 尚未验证假说：</strong>{d.gap_explanation?.unverified_hypotheses}</div>
                    </div>

                    {/* User Revision Input */}
                    <div>
                      <label className="block text-[10px] uppercase font-mono text-slate-400 mb-1">
                        分析师个性化复核备忘 (持久化保存并在历史快照中呈现)
                      </label>
                      <input
                        type="text"
                        value={userRevisions[d.thesis_id] || ""}
                        onChange={(e) => {
                          setUserRevisions({
                            ...userRevisions,
                            [d.thesis_id]: e.target.value,
                          });
                        }}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-amber-200 focus:outline-none focus:border-amber-500 font-sans"
                        placeholder="输入你对该观点的个性化补充研判..."
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Questions Status Updates */}
              {analysisResult.questions_update && analysisResult.questions_update.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-400">未决疑问核验进展与解答：</div>
                  {analysisResult.questions_update.map((q: any) => (
                    <div key={q.id} className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-300">[{q.id}] {q.question_text}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            q.status === "已解决"
                              ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                              : q.status === "部分解决"
                              ? "bg-blue-950 text-blue-400 border border-blue-800"
                              : "bg-amber-950 text-amber-400 border border-amber-800"
                          }`}
                        >
                          {q.status}
                        </span>
                      </div>
                      {q.answer_notes && (
                        <p className="text-slate-400 text-[11px] leading-relaxed">
                          回答笔记：{q.answer_notes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setAnalysisResult(null)}
                  className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  ← 修改材料重新分析
                </button>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium cursor-pointer"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmSave}
                    disabled={isSaving}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-lg"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {isSaving ? "正在写入 SQLite 数据库..." : `确认并保存 ${nextVersion} 版本到数据库`}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
