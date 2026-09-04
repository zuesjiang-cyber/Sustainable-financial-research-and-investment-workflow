import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import type {
  ContinuousAnalysisResult,
  FollowUpQuestion,
  ProjectState,
  ResearchClaim,
  ResearchDocument,
  ResearchToolTrace,
  ThesisDelta,
  ThesisStatus,
} from "../types/fintrust";
import { createAsyncGenerationGuard } from "../lib/asyncGuard";

type MaterialSourceType = ResearchDocument["source_type"];

export interface MaterialAnalysisInput {
  title: string;
  content: string;
  source_type?: MaterialSourceType;
  disclosure_date?: string;
  demo_replay?: boolean;
}

export interface ConfirmResearchUpdate {
  draftId: string;
  parentVersion: string;
  deltas: ThesisDelta[];
  userRevisions: Record<string, string>;
  questions: FollowUpQuestion[];
}

interface NewMaterialModalProps {
  isOpen: boolean;
  project: ProjectState;
  onClose: () => void;
  onRunAnalysis: (input: MaterialAnalysisInput, signal?: AbortSignal) => Promise<ContinuousAnalysisResult>;
  onApplyUpdate: (data: ConfirmResearchUpdate) => Promise<void>;
  onSelectEvidence?: (id: string) => void;
}

const STATUS_OPTIONS: ThesisStatus[] = ["保持", "待评估", "加强", "支持", "部分支持", "削弱", "不足以判断"];
const QUESTION_STATUS_OPTIONS: FollowUpQuestion["status"][] = ["未解决", "部分解决", "已解决"];
const SOURCE_OPTIONS: Array<{ value: MaterialSourceType; label: string }> = [
  { value: "notes", label: "研究笔记" },
  { value: "annual_report", label: "年度报告" },
  { value: "quarterly_update", label: "季度/业绩更新" },
  { value: "qualitative_brief", label: "定性材料" },
];

function nextVersionOf(currentVersion: string): string {
  const number = Number.parseInt(currentVersion.replace(/^T/i, ""), 10);
  return "T" + (Number.isFinite(number) ? number + 1 : 1);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || "未知错误");
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function normalizeQuestions(questions: FollowUpQuestion[] | undefined): FollowUpQuestion[] {
  return (questions || []).map((question) => ({
    ...question,
    answer_notes: question.answer_notes || "",
    evidence_ids: question.evidence_ids || [],
  }));
}

function modeLabel(mode?: string): string {
  const labels: Record<string, string> = {
    manual_review: "人工复核模式",
    degraded_error: "分析不可用",
    offline_math_only: "仅离线计算",
    test_fixture: "测试夹具",
    real_gemini: "Gemini 模型",
    real_openai_compatible: "兼容模型",
  };
  return (mode && labels[mode]) || mode || "未标注执行模式";
}

function statusClass(status: ThesisStatus): string {
  if (status === "加强" || status === "支持") return "bg-emerald-950/90 text-emerald-300 border-emerald-500/50 badge-glow-emerald";
  if (status === "削弱") return "bg-rose-950/90 text-rose-300 border-rose-500/50 badge-glow-rose";
  if (status === "不足以判断" || status === "待评估") return "bg-amber-950/90 text-amber-300 border-amber-500/50";
  if (status === "部分支持") return "bg-blue-950/90 text-blue-300 border-blue-500/50 badge-glow-blue";
  return "bg-slate-800 text-slate-300 border-slate-700";
}

function claimStatusLabel(status: ResearchClaim["verification"]): string {
  return status === "verified" ? "来源已核验" : status === "contradicted" ? "来源矛盾" : "尚未解决";
}

function claimStatusClass(status: ResearchClaim["verification"]): string {
  return status === "verified"
    ? "text-emerald-300 bg-emerald-950 border-emerald-800"
    : status === "contradicted"
    ? "text-rose-300 bg-rose-950 border-rose-800"
    : "text-amber-300 bg-amber-950 border-amber-800";
}

function renderTraceValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export const NewMaterialModal: React.FC<NewMaterialModalProps> = ({
  isOpen,
  project,
  onClose,
  onRunAnalysis,
  onApplyUpdate,
  onSelectEvidence,
}) => {
  const currentVersion = project.current_version;
  const nextVersion = nextVersionOf(currentVersion);
  const guardRef = useRef(createAsyncGenerationGuard());
  const analysisAbortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [sourceType, setSourceType] = useState<MaterialSourceType>("qualitative_brief");
  const [disclosureDate, setDisclosureDate] = useState("");
  const [demoReplay, setDemoReplay] = useState(false);
  const [materialHint, setMaterialHint] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<ContinuousAnalysisResult | null>(null);
  const [modifiedDeltas, setModifiedDeltas] = useState<ThesisDelta[]>([]);
  const [questionDrafts, setQuestionDrafts] = useState<FollowUpQuestion[]>([]);
  const [userRevisions, setUserRevisions] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const clearAnalysisDraft = () => {
    setAnalysisResult(null);
    setModifiedDeltas([]);
    setQuestionDrafts([]);
    setUserRevisions({});
  };

  const invalidateAsyncWork = () => {
    analysisAbortRef.current?.abort();
    analysisAbortRef.current = null;
    guardRef.current.next();
  };

  useEffect(() => {
    invalidateAsyncWork();
    if (isOpen) {
      setTitle(project.company + " " + nextVersionOf(project.current_version) + " 轮增量研究材料");
      setContent("");
      setSourceType("qualitative_brief");
      setDisclosureDate("");
      setDemoReplay(false);
      setMaterialHint(null);
      setIsAnalyzing(false);
      setIsSaving(false);
      clearAnalysisDraft();
      setError(null);
    }
    // Reset on modal visibility, project identity, or version changes only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, project.id, project.current_version, project.company]);

  const handleClose = () => {
    invalidateAsyncWork();
    setIsAnalyzing(false);
    onClose();
  };

  const handleInputChange = (setter: React.Dispatch<React.SetStateAction<string>>, value: string) => {
    setter(value);
    invalidateAsyncWork();
    setIsAnalyzing(false);
    clearAnalysisDraft();
    setError(null);
    setMaterialHint(null);
    setDemoReplay(false);
  };

  const handleSourceTypeChange = (value: MaterialSourceType) => {
    setSourceType(value);
    invalidateAsyncWork();
    setIsAnalyzing(false);
    clearAnalysisDraft();
    setError(null);
    setDemoReplay(false);
  };

  const handleLoadSampleT2 = async () => {
    invalidateAsyncWork();
    setIsAnalyzing(false);
    const token = guardRef.current.current();
    setError(null);
    try {
      const samplePath = project.ticker === "DEMO" ? "/api/sample-materials/demo/" + nextVersion : "/api/sample-materials/t2";
      const response = await fetch(samplePath);
      if (!response.ok) throw new Error("样例材料加载失败（HTTP " + response.status + "）");
      const sample = (await response.json()) as {
        title?: string;
        content?: string;
        source_type?: MaterialSourceType;
        disclosure_date?: string;
      };
      if (!guardRef.current.isCurrent(token)) return;
      if (!sample.content) throw new Error("样例材料没有可粘贴的正文");
      setTitle(sample.title || project.company + " " + nextVersion + " 合成演示材料");
      setContent(sample.content);
      setSourceType(sample.source_type || "qualitative_brief");
      setDisclosureDate(sample.disclosure_date || "");
      setDemoReplay(project.ticker === "DEMO");
      setMaterialHint(project.ticker === "DEMO" ? "演示回放（虚构数据，未调用模型）：仅用于验证草稿→确认→记忆链路。" : "合成演示材料：仅用于演示连续研究界面，不代表真实管理层披露或已核验事实。");
      clearAnalysisDraft();
    } catch (err) {
      if (guardRef.current.isCurrent(token) && !isAbortError(err)) setError(errorMessage(err));
    }
  };

  const handleLoadBlankTemplate = () => {
    invalidateAsyncWork();
    setIsAnalyzing(false);
    setTitle(project.company + " " + nextVersion + " 材料记录模板");
    setContent(
      "【" + project.company + "（" + project.ticker + "）" + nextVersion + " 材料记录模板】\n" +
        "披露日期：\n来源：\n\n请在此粘贴原始公告、财报段落或调研记录。\n\n待核实问题：\n"
    );
    setSourceType("qualitative_brief");
    setDisclosureDate("");
    setDemoReplay(false);
    setMaterialHint("空白模板：没有预填事实，不代表任何真实公司披露。");
    clearAnalysisDraft();
    setError(null);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    invalidateAsyncWork();
    setIsAnalyzing(false);
    const token = guardRef.current.current();
    try {
      const text = await file.text();
      if (!guardRef.current.isCurrent(token)) return;
      setTitle(file.name.replace(/\.(txt|md)$/i, ""));
      setContent(text);
      setSourceType("notes");
      setDemoReplay(false);
      setMaterialHint("已载入 " + file.name + "（纯文本）；未执行 PDF 解析。");
      clearAnalysisDraft();
      setError(null);
    } catch (err) {
      if (guardRef.current.isCurrent(token)) setError("文件读取失败：" + errorMessage(err));
    }
  };

  const handleAnalyze = async () => {
    const trimmedContent = content.trim();
    const trimmedTitle = title.trim();
    if (!trimmedContent) {
      setError("请先粘贴材料正文。");
      return;
    }
    if (!trimmedTitle) {
      setError("请填写材料标题。");
      return;
    }
    invalidateAsyncWork();
    const token = guardRef.current.current();
    const controller = new AbortController();
    analysisAbortRef.current = controller;
    setIsAnalyzing(true);
    setError(null);
    try {
      const result = await onRunAnalysis(
        {
          title: trimmedTitle,
          content: trimmedContent,
          source_type: sourceType,
          disclosure_date: disclosureDate || undefined,
          ...(demoReplay ? { demo_replay: true } : {}),
        },
        controller.signal
      );
      if (!guardRef.current.isCurrent(token)) return;
      if (result.project_id && result.project_id !== project.id) {
        throw new Error("分析结果所属项目已变化，已拒绝写入当前项目。");
      }
      if (result.parent_version && result.parent_version !== project.current_version) {
        throw new Error("分析结果基线版本已变化，请重新加载项目后再分析。");
      }
      if (!result.draft_id) throw new Error("服务器没有返回可确认的分析草稿 ID。");
      setAnalysisResult(result);
      setModifiedDeltas((result.deltas || []).map((delta) => ({ ...delta })));
      setQuestionDrafts(normalizeQuestions(result.questions_update));
      // “同意本轮” is not a user edit. Keep this sparse and empty by default.
      setUserRevisions({});
    } catch (err) {
      if (guardRef.current.isCurrent(token) && !isAbortError(err)) setError(errorMessage(err));
    } finally {
      if (guardRef.current.isCurrent(token)) {
        setIsAnalyzing(false);
        analysisAbortRef.current = null;
      }
    }
  };

  const updateDelta = (thesisId: string, patch: Partial<ThesisDelta>) => {
    setModifiedDeltas((previous) =>
      previous.map((delta) => (delta.thesis_id === thesisId ? { ...delta, ...patch } : delta))
    );
  };

  const updateQuestion = (questionId: string, patch: Partial<FollowUpQuestion>) => {
    setQuestionDrafts((previous) =>
      previous.map((question) => (question.id === questionId ? { ...question, ...patch } : question))
    );
  };

  const handleConfirmSave = async () => {
    if (!analysisResult) return;
    setIsSaving(true);
    setError(null);
    try {
      await onApplyUpdate({
        draftId: analysisResult.draft_id,
        parentVersion: analysisResult.parent_version || currentVersion,
        deltas: modifiedDeltas,
        userRevisions,
        questions: questionDrafts,
      });
      handleClose();
    } catch (err) {
      setError("保存失败：" + errorMessage(err) + "；草稿仍保留，可修正后重试。");
    } finally {
      setIsSaving(false);
    }
  };

  const modelDeltas = useMemo(() => analysisResult?.deltas || [], [analysisResult]);
  const mode = analysisResult?.analysis_meta?.execution_mode;
  const isManualReview = mode === "manual_review" || mode === "degraded_error" || mode === "offline_math_only";

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden text-slate-100 my-8">
        <div className="p-5 border-b border-slate-800/80 flex items-center justify-between bg-slate-950/80">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="px-3 py-1 bg-blue-500/15 text-blue-300 border border-blue-500/30 rounded-xl text-xs font-mono font-bold tracking-wide shrink-0">
              {nextVersion} 轮观点演进
            </span>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight truncate">录入新材料并进行连续观点对账</h3>
              <p className="text-[11px] text-slate-400 hidden sm:block">结合历史确权记忆进行增量审计与 3 段式归因</p>
            </div>
          </div>
          <button onClick={handleClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl cursor-pointer transition-colors" title="关闭"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-5 max-h-[84vh] overflow-y-auto">
          <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-300 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
            <div><span className="font-semibold text-white">【持续研究状态保持】</span>：本轮基于 {project.company} 的 {currentVersion} 版本、{project.theses.length} 条观点和 {project.open_questions.length} 项疑问生成可复核草稿。</div>
            <div className="flex items-center gap-2 shrink-0">
              {(project.company.includes("圣邦") || project.ticker === "DEMO") && <button type="button" onClick={handleLoadSampleT2} className="px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/40 rounded text-xs font-semibold cursor-pointer transition-colors">{project.ticker === "DEMO" ? "载入演示回放材料" : "载入合成演示材料"}</button>}
              <button type="button" onClick={handleLoadBlankTemplate} className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded text-xs font-semibold cursor-pointer transition-colors">空白模板</button>
            </div>
          </div>

          {materialHint && <div className="rounded-lg border border-amber-800/70 bg-amber-950/40 px-3 py-2 text-[11px] text-amber-200">{materialHint}</div>}
          {error && <div className="p-3 bg-rose-950/60 border border-rose-800 rounded-lg text-xs text-rose-300 flex items-start gap-2" role="alert"><AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" /><span>{error}</span></div>}

          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">材料标题 / 公告名称 *</label>
                <input type="text" value={title} onChange={(event) => handleInputChange(setTitle, event.target.value)} placeholder="例如：2026Q1 业绩更新" className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-medium" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">材料类型</label>
                  <select value={sourceType} onChange={(event) => handleSourceTypeChange(event.target.value as MaterialSourceType)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-blue-500">{SOURCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">披露日期</label>
                  <input type="date" value={disclosureDate} onChange={(event) => handleInputChange(setDisclosureDate, event.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-blue-500" />
                </div>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="block text-xs font-semibold text-slate-300">增量披露内容 / 研究记录（纯文本） *</label>
                <div>
                  <input ref={fileInputRef} type="file" accept=".txt,.md,text/plain,text/markdown" onChange={handleFileUpload} className="hidden" />
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-1 text-[11px] text-blue-300 hover:text-blue-200 cursor-pointer"><Upload className="w-3 h-3" />载入 .txt/.md</button>
                </div>
              </div>
              <textarea rows={8} value={content} onChange={(event) => handleInputChange(setContent, event.target.value)} placeholder="粘贴公告正文、财报段落或真实调研记录；系统不会把材料伪装成 PDF 原件。" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-sans leading-relaxed" />
            </div>
          </div>

          {!analysisResult && <button type="button" onClick={handleAnalyze} disabled={isAnalyzing || !content.trim()} className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shadow-md transition-all active:scale-98">{isAnalyzing ? <><RefreshCw className="w-4 h-4 animate-spin" />正在生成可复核的观点增量草稿...</> : <><Sparkles className="w-4 h-4" />运行连续观点评估</>}</button>}

          {analysisResult && (
            <div className="space-y-5 pt-4 border-t border-slate-800 animate-in fade-in duration-200">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-400" />模型草稿预览 · {analysisResult.version}</h4>
                <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400"><span className={"px-2 py-0.5 rounded border " + (isManualReview ? "text-amber-300 bg-amber-950 border-amber-800" : "text-emerald-300 bg-emerald-950 border-emerald-800")}>{modeLabel(mode)}</span><span>{analysisResult.analysis_meta?.model_name || "未标注模型"}</span></div>
              </div>

              {isManualReview && <div className="bg-amber-950/50 border border-amber-800 rounded-lg p-3 text-xs text-amber-200 flex items-start gap-2"><ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" /><div><strong>本轮未执行模型研究。</strong>当前结果需要人工复核；没有自动核验的主张会被标为“尚未解决”，不能视作模型或来源已确认。</div></div>}
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-xs text-slate-300 leading-relaxed"><span className="font-semibold text-blue-400">本轮核心研判：</span>{analysisResult.overall_summary || "暂无总结。"}</div>

              <div className="space-y-3">
                <div className="text-xs font-semibold text-slate-400">观点演进（模型草稿 → 用户待确认；理由与状态可编辑）</div>
                {modifiedDeltas.length === 0 && <div className="p-3 rounded-lg border border-slate-800 text-xs text-slate-400">暂无可确认的观点增量。</div>}
                {modifiedDeltas.map((delta) => {
                  const modelDelta = modelDeltas.find((item) => item.thesis_id === delta.thesis_id) || delta;
                  const roundLabel = delta.round_assessment === "unresolved" ? "未解决" : delta.round_assessment === "unchanged" ? "未改变" : delta.round_assessment === "supported" ? "支持" : delta.round_assessment === "weakened" ? "削弱" : "未标注";
                  return (
                    <div key={delta.thesis_id} className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-3 text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0"><span className="font-mono text-blue-400 mr-2">{delta.thesis_id}</span><span className="font-bold text-white">{delta.title}</span></div>
                        <div className="flex items-center gap-2 font-mono text-[11px] shrink-0"><span className="text-slate-500">模型草稿: {modelDelta.new_status}</span><span className="text-slate-600">→</span><select value={delta.new_status} onChange={(event) => updateDelta(delta.thesis_id, { new_status: event.target.value as ThesisStatus })} className={"border rounded px-2 py-0.5 text-xs font-sans font-semibold focus:outline-none " + statusClass(delta.new_status)} aria-label={delta.title + " 用户确认状态"}>{STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}</select></div>
                      </div>
                      <div className="text-[11px] text-slate-500">前一状态：{delta.previous_status} · 本轮评估：{roundLabel}</div>
                      <div><label className="block text-[11px] text-slate-400 mb-1">模型草稿依据</label><p className="text-slate-400 leading-relaxed">{modelDelta.reason || "未提供。"}</p></div>
                      <div><label className="block text-[11px] text-blue-300 mb-1">用户确认理由（可编辑）</label><textarea rows={2} value={delta.reason} onChange={(event) => updateDelta(delta.thesis_id, { reason: event.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500" /></div>
                      <div><label className="block text-[11px] text-blue-300 mb-1">用户确认当前观点（可编辑）</label><textarea rows={2} value={delta.current_view || ""} onChange={(event) => updateDelta(delta.thesis_id, { current_view: event.target.value })} placeholder="留空表示沿用项目当前观点；不会自动生成用户修订。" className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500" /></div>
                      <div className="bg-slate-900/90 rounded-lg p-2.5 text-[11px] space-y-1 border border-slate-800 text-slate-400"><div><strong className="text-emerald-400">① 事实观察：</strong>{delta.gap_explanation?.observed || "未提供"}</div><div><strong className="text-blue-400">② 披露口径：</strong>{delta.gap_explanation?.disclosed_reason || "未提供"}</div><div><strong className="text-amber-400">③ 尚未验证假说：</strong>{delta.gap_explanation?.unverified_hypotheses || "未提供"}</div></div>
                      <div><label className="block text-[11px] text-purple-300 mb-1">用户修订备注（仅实际编辑才会提交）</label><textarea rows={2} value={userRevisions[delta.thesis_id] ?? ""} onChange={(event) => setUserRevisions((previous) => ({ ...previous, [delta.thesis_id]: event.target.value }))} placeholder="不要填写“同意本轮”；仅在需要留下人工判断时填写。" className="w-full bg-slate-900 border border-purple-700/60 rounded px-2.5 py-1.5 text-xs text-purple-200 focus:outline-none focus:border-purple-500" /></div>
                      {delta.evidence_ids?.length > 0 && <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400"><span>关联来源：</span>{delta.evidence_ids.map((id) => <button key={id} type="button" onClick={() => onSelectEvidence?.(id)} className="px-2 py-0.5 bg-blue-950 text-blue-300 rounded border border-blue-900 font-mono hover:bg-blue-900 cursor-pointer">{id}</button>)}</div>}
                    </div>
                  );
                })}
              </div>

              <div className="space-y-3">
                <div className="text-xs font-semibold text-slate-400">未决疑问（用户可在确认前修改问题、状态与回答）</div>
                {questionDrafts.length === 0 && <div className="p-3 rounded-lg border border-slate-800 text-xs text-slate-400">本轮没有疑问更新。</div>}
                {questionDrafts.map((question) => (
                  <div key={question.id} className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs space-y-2">
                    <div className="flex items-center justify-between gap-2"><span className="font-mono text-blue-400">{question.id}</span><select value={question.status} onChange={(event) => updateQuestion(question.id, { status: event.target.value as FollowUpQuestion["status"], resolved_in_version: event.target.value === "已解决" ? nextVersion : null })} className="bg-slate-900 border border-slate-700 text-xs text-white rounded px-2 py-0.5 focus:outline-none focus:border-blue-500">{QUESTION_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}</select></div>
                    <input value={question.question_text} onChange={(event) => updateQuestion(question.id, { question_text: event.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500" aria-label={question.id + " 问题"} />
                    <textarea rows={2} value={question.answer_notes || ""} onChange={(event) => updateQuestion(question.id, { answer_notes: event.target.value })} placeholder="用户确认前补充回答或核验记录..." className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-blue-500" aria-label={question.id + " 回答"} />
                    {question.evidence_ids && question.evidence_ids.length > 0 && <div className="flex flex-wrap gap-1.5 text-[10px] text-slate-400">来源：{question.evidence_ids.map((id) => <button key={id} type="button" onClick={() => onSelectEvidence?.(id)} className="text-blue-300 hover:underline font-mono cursor-pointer">{id}</button>)}</div>}
                  </div>
                ))}
              </div>

              <ClaimsPreview claims={analysisResult.claims || []} onSelectEvidence={onSelectEvidence} />
              <TracePreview traces={analysisResult.tool_trace || []} />

              <div className="pt-4 border-t border-slate-800 flex items-center justify-between gap-3">
                <button type="button" onClick={() => { invalidateAsyncWork(); clearAnalysisDraft(); setError(null); }} className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer">← 修改材料重新分析</button>
                <div className="flex items-center gap-3"><button type="button" onClick={handleClose} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium cursor-pointer">取消</button><button type="button" onClick={handleConfirmSave} disabled={isSaving} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-lg"><CheckCircle2 className="w-4 h-4" />{isSaving ? "正在保存..." : "用户确认并保存 " + nextVersion}</button></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function ClaimsPreview({ claims, onSelectEvidence }: { claims: ResearchClaim[]; onSelectEvidence?: (id: string) => void }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-slate-400">主张与来源核验</div>
      {claims.length === 0 ? <div className="p-3 rounded-lg border border-slate-800 text-xs text-slate-500">没有自动核验主张；请按人工复核结果确认。</div> : claims.map((claim) => (
        <div key={claim.id} className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1.5 text-xs">
          <div className="flex items-start justify-between gap-2"><span className="text-slate-200">{claim.claim_text}</span><span className={"px-1.5 py-0.5 rounded border text-[10px] shrink-0 " + claimStatusClass(claim.verification)}>{claimStatusLabel(claim.verification)}</span></div>
          <div className="text-[11px] text-slate-500">类型：{claim.kind === "source" ? "来源" : claim.kind === "calculated" ? "计算" : "推断"} · {claim.explanation}</div>
          {claim.evidence_ids?.length > 0 && <div className="flex flex-wrap gap-1.5 text-[10px]">来源：{claim.evidence_ids.map((id) => <button key={id} type="button" onClick={() => onSelectEvidence?.(id)} className="text-blue-300 hover:underline font-mono cursor-pointer">{id}</button>)}</div>}
        </div>
      ))}
    </div>
  );
}

function TracePreview({ traces }: { traces: ResearchToolTrace[] }) {
  return (
    <details className="group rounded-lg border border-slate-800 bg-slate-950">
      <summary className="flex items-center justify-between gap-2 px-3 py-2 text-xs font-semibold text-slate-400 cursor-pointer list-none"><span className="flex items-center gap-1.5"><ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />工具调用轨迹（{traces.length}）</span><span className="text-[10px] text-slate-600">可展开查看参数与结果</span></summary>
      <div className="px-3 pb-3 space-y-2">{traces.length === 0 ? <p className="text-[11px] text-slate-500">没有可展示的工具调用轨迹。</p> : traces.map((trace) => <div key={trace.id} className="rounded border border-slate-800 bg-slate-900 p-2 text-[10px] space-y-1"><div className="flex items-center justify-between"><span className="font-mono text-slate-200">{trace.tool}</span><span className={trace.status === "ok" ? "text-emerald-400" : "text-rose-400"}>{trace.status} · {trace.duration_ms}ms</span></div><div className="text-slate-500 whitespace-pre-wrap break-words">{renderTraceValue(trace.result)}</div></div>)}</div>
    </details>
  );
}
