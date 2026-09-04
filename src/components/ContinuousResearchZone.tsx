import React, { useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  HelpCircle,
  CheckCircle2,
  Clock,
  FileText,
  ArrowRight,
  Sparkles,
  Plus,
  Edit3,
  Check,
  ChevronRight,
  History,
  AlertCircle,
  Database,
  Building2,
  Calendar,
  Layers,
  Search,
  Eye,
  MessageSquare,
  Trash2,
  CheckSquare,
} from "lucide-react";
import type {
  ProjectState,
  ResearchClaim,
  ResearchThesis,
  ResearchToolTrace,
  ThesisStatus,
  FollowUpQuestion,
  ResearchUpdate,
} from "../types/fintrust";

interface ContinuousResearchZoneProps {
  project: ProjectState;
  onSelectEvidence: (id: string) => void;
  onOpenNewMaterial: () => void;
  onUpdateThesis: (thesisId: string, updates: Partial<ResearchThesis>) => Promise<void>;
  onAddQuestion: (text: string) => Promise<void>;
  onUpdateQuestion: (question: FollowUpQuestion) => Promise<void>;
  onDeleteQuestion?: (questionId: string) => Promise<void>;
}

export const ContinuousResearchZone: React.FC<ContinuousResearchZoneProps> = ({
  project,
  onSelectEvidence,
  onOpenNewMaterial,
  onUpdateThesis,
  onAddQuestion,
  onUpdateQuestion,
  onDeleteQuestion,
}) => {
  const [editingThesisId, setEditingThesisId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editCriteria, setEditCriteria] = useState("");
  const [editBasis, setEditBasis] = useState("");
  const [editStatus, setEditStatus] = useState<ThesisStatus>("保持");
  const [editUserRevision, setEditUserRevision] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [questionError, setQuestionError] = useState<string | null>(null);
  const [savingThesisId, setSavingThesisId] = useState<string | null>(null);
  const [savingQuestionId, setSavingQuestionId] = useState<string | null>(null);

  // Questions state
  const [questionFilter, setQuestionFilter] = useState<"all" | "open" | "partially" | "resolved">("all");
  const [newQuestionText, setNewQuestionText] = useState("");
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editingQuestionNote, setEditingQuestionNote] = useState("");

  // History inspection: which version's update to view in Zone 2
  // Default to null (which means latest update)
  const [inspectedVersion, setInspectedVersion] = useState<string | null>(null);

  const latestUpdate: ResearchUpdate | undefined = project.updates[project.updates.length - 1];
  const activeUpdate: ResearchUpdate | undefined = inspectedVersion
    ? project.updates.find((u) => u.version === inspectedVersion) || latestUpdate
    : latestUpdate;

  const historyUpdates = [...project.updates].reverse();
  const hasModelSnapshot = Boolean(activeUpdate?.original_deltas && activeUpdate.original_deltas.length > 0);
  const modelDeltas = hasModelSnapshot ? activeUpdate?.original_deltas || [] : [];

  const claimStatusText = (status: ResearchClaim["verification"]) =>
    status === "verified" ? "来源已核验" : status === "contradicted" ? "来源矛盾" : "尚未解决";
  const claimStatusClass = (status: ResearchClaim["verification"]) =>
    status === "verified"
      ? "text-emerald-300 bg-emerald-950 border-emerald-800"
      : status === "contradicted"
      ? "text-rose-300 bg-rose-950 border-rose-800"
      : "text-amber-300 bg-amber-950 border-amber-800";

  const handleStartEdit = (t: ResearchThesis) => {
    setEditError(null);
    setEditingThesisId(t.id);
    setEditTitle(t.title);
    setEditCriteria(t.verification_criteria);
    setEditBasis(t.basis);
    setEditStatus(t.current_status);
    setEditUserRevision(t.user_revision || "");
  };

  const handleSaveEdit = async (thesisId: string) => {
    const original = project.theses.find((thesis) => thesis.id === thesisId);
    if (!original) return;
    const updates: Partial<ResearchThesis> = {};
    if (editTitle !== original.title) updates.title = editTitle;
    if (editCriteria !== original.verification_criteria) updates.verification_criteria = editCriteria;
    if (editBasis !== original.basis) updates.basis = editBasis;
    if (editStatus !== original.current_status) updates.current_status = editStatus;
    const nextRevision = editUserRevision.trim();
    if (nextRevision !== (original.user_revision || "")) updates.user_revision = nextRevision;
    if (Object.keys(updates).length === 0) {
      setEditingThesisId(null);
      return;
    }
    setSavingThesisId(thesisId);
    setEditError(null);
    try {
      await onUpdateThesis(thesisId, updates);
      setEditingThesisId(null);
    } catch (err: any) {
      setEditError(String(err?.message || err || "保存观点失败"));
    } finally {
      setSavingThesisId(null);
    }
  };

  const handleCreateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestionText.trim()) return;
    setQuestionError(null);
    try {
      await onAddQuestion(newQuestionText.trim());
      setNewQuestionText("");
    } catch (err: any) {
      setQuestionError(String(err?.message || err || "新增疑问失败"));
    }
  };

  const handleStartEditQuestionNote = (q: FollowUpQuestion) => {
    setEditingQuestionId(q.id);
    setEditingQuestionNote(q.answer_notes || "");
  };

  const handleSaveQuestionNote = async (q: FollowUpQuestion) => {
    setSavingQuestionId(q.id);
    setQuestionError(null);
    try {
      await onUpdateQuestion({ ...q, answer_notes: editingQuestionNote });
      setEditingQuestionId(null);
    } catch (err: any) {
      setQuestionError(String(err?.message || err || "保存疑问失败"));
    } finally {
      setSavingQuestionId(null);
    }
  };

  const filteredQuestions = project.open_questions.filter((q) => {
    if (questionFilter === "open") return q.status === "未解决";
    if (questionFilter === "partially") return q.status === "部分解决";
    if (questionFilter === "resolved") return q.status === "已解决";
    return true;
  });

  const getStatusBadge = (status: ThesisStatus) => {
    switch (status) {
      case "加强":
      case "支持":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-950/90 text-emerald-300 border border-emerald-500/40 badge-glow-emerald">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            {status}
          </span>
        );
      case "削弱":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-950/90 text-rose-300 border border-rose-500/40 badge-glow-rose">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse"></span>
            <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
            {status}
          </span>
        );
      case "部分支持":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-950/90 text-blue-300 border border-blue-500/40 badge-glow-blue">
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            部分支持
          </span>
        );
      case "不足以判断":
      case "待评估":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-950/90 text-amber-300 border border-amber-500/40">
            <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
            {status}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-800/90 text-slate-300 border border-slate-700">
            <Minus className="w-3.5 h-3.5 text-slate-400" />
            保持
          </span>
        );
    }
  };

  const getThesisBorderColor = (status: ThesisStatus) => {
    switch (status) {
      case "加强":
      case "支持":
        return "border-l-4 border-l-emerald-500 hover:border-l-emerald-400 shadow-emerald-950/20";
      case "削弱":
        return "border-l-4 border-l-rose-500 hover:border-l-rose-400 shadow-rose-950/20";
      case "部分支持":
        return "border-l-4 border-l-blue-500 hover:border-l-blue-400 shadow-blue-950/20";
      case "不足以判断":
      case "待评估":
        return "border-l-4 border-l-amber-500 hover:border-l-amber-400 shadow-amber-950/20";
      default:
        return "border-l-4 border-l-slate-600 hover:border-l-slate-500";
    }
  };

  // Helper to extract the trajectory of a thesis across version history
  const getThesisTrajectory = (thesisId: string) => {
    const trajectory: Array<{ version: string; status: ThesisStatus }> = [];
    for (const u of project.updates) {
      const d = u.thesis_deltas.find((item) => item.thesis_id === thesisId);
      if (d) {
        trajectory.push({ version: u.version, status: d.new_status });
      }
    }
    return trajectory;
  };

  const getRoundAssessment = (thesisId: string) => {
    const delta = latestUpdate?.thesis_deltas.find((item) => item.thesis_id === thesisId);
    switch (delta?.round_assessment) {
      case "supported":
        return "支持本轮判断";
      case "weakened":
        return "削弱本轮判断";
      case "unresolved":
        return "本轮未解决";
      case "unchanged":
        return "本轮未改变";
      default:
        return "本轮未标注";
    }
  };

  const nextVersionTag =
    project.current_version === "T0"
      ? "T1"
      : project.current_version === "T1"
      ? "T2"
      : `T${parseInt(project.current_version.replace("T", "") || "1") + 1}`;

  return (
    <div className="space-y-6 animate-in fade-in duration-200" id="continuous-research-zone">
      {/* ==================================================================== */}
      {/* Top Project Dashboard Header                                         */}
      {/* ==================================================================== */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 md:p-6 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 bg-blue-500/15 text-blue-300 border border-blue-500/40 rounded-full text-xs font-mono font-bold tracking-wide">
                当前版本 {project.current_version}
              </span>
              <span className="px-2 py-0.5 bg-slate-800 text-slate-300 border border-slate-700 rounded-md text-xs font-mono">
                {project.ticker}
              </span>
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                更新于 {new Date(project.updated_at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>

            <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">{project.name}</h1>
            <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">{project.summary}</p>

            {/* Version Progression Pills */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
              <span className="text-slate-500 text-[11px]">研判演进脉络:</span>
              {project.updates.map((u, idx) => (
                <div key={u.id} className="flex items-center gap-1.5">
                  <button
                    onClick={() => setInspectedVersion(u.version)}
                    className={`px-2 py-0.5 rounded text-[11px] font-mono cursor-pointer transition-all ${
                      (inspectedVersion ? inspectedVersion === u.version : u.version === project.current_version)
                        ? "bg-blue-600 text-white font-bold shadow-xs"
                        : "bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                    }`}
                  >
                    {u.version}
                  </button>
                  {idx < project.updates.length - 1 && <ChevronRight className="w-3 h-3 text-slate-600" />}
                </div>
              ))}
              {inspectedVersion && inspectedVersion !== project.current_version && (
                <button
                  onClick={() => setInspectedVersion(null)}
                  className="ml-2 text-[11px] text-blue-400 hover:text-blue-300 underline cursor-pointer"
                >
                  返回最新版本 ({project.current_version})
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            <button
              onClick={onOpenNewMaterial}
              className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-blue-950/40 transition-all active:scale-98"
              id="open-new-material-btn"
            >
              <Plus className="w-4 h-4" />
              录入新材料推进 ({nextVersionTag})
            </button>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* THREE RESEARCH ZONES LAYOUT                                          */}
      {/* ==================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ==================================================================== */}
        {/* ZONE 1: 当前核心判断 (Current View) - 7 cols                         */}
        {/* ==================================================================== */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                <h3 className="text-sm font-bold text-white uppercase tracking-wide">
                  Zone 1: 当前核心判断 (Current View)
                </h3>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                {project.theses.length} 项核心观点 · {project.open_questions.filter((q) => q.status === "已解决").length}/{project.open_questions.length} 疑问已核验
              </span>
            </div>
            {editError && <div className="rounded-lg border border-rose-800 bg-rose-950/45 px-3 py-2 text-xs text-rose-300">观点保存失败：{editError}</div>}

            {/* Thesis Cards */}
            <div className="space-y-4">
              {project.theses.map((thesis) => {
                const trajectory = getThesisTrajectory(thesis.id);
                const isEditing = editingThesisId === thesis.id;

                return (
                  <div
                    key={thesis.id}
                    className={`bg-slate-950 rounded-2xl p-4 md:p-5 border border-slate-800/90 hover:border-slate-700/80 transition-all space-y-3.5 shadow-md ${getThesisBorderColor(thesis.current_status)}`}
                  >
                    {isEditing ? (
                      /* Inline Thesis Editor */
                      <div className="space-y-3 bg-slate-900/90 p-3.5 rounded-lg border border-slate-700">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono text-blue-400 font-bold">{thesis.id} 分析师快速复核</span>
                          <select
                            value={editStatus}
                            onChange={(e) => setEditStatus(e.target.value as ThesisStatus)}
                            className="bg-slate-950 text-xs text-white border border-slate-700 rounded px-2.5 py-1 font-mono focus:border-blue-500 focus:outline-none"
                          >
                            <option value="保持">保持</option>
                            <option value="加强">加强</option>
                            <option value="支持">支持</option>
                            <option value="部分支持">部分支持</option>
                            <option value="削弱">削弱</option>
                            <option value="不足以判断">不足以判断</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">观点标题</label>
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            className="w-full bg-slate-950 text-xs text-white border border-slate-700 rounded px-2.5 py-1.5 focus:border-blue-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">当前研判依据</label>
                          <input
                            type="text"
                            value={editBasis}
                            onChange={(e) => setEditBasis(e.target.value)}
                            className="w-full bg-slate-950 text-xs text-slate-200 border border-slate-700 rounded px-2.5 py-1.5 focus:border-blue-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">量化/定性验证门槛</label>
                          <input
                            type="text"
                            value={editCriteria}
                            onChange={(e) => setEditCriteria(e.target.value)}
                            className="w-full bg-slate-950 text-xs text-amber-300 font-mono border border-slate-700 rounded px-2.5 py-1.5 focus:border-amber-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-purple-300 mb-1">★ 分析师复核修订 / 持续研报记忆假设 (user_revision)</label>
                          <textarea
                            rows={2}
                            value={editUserRevision}
                            onChange={(e) => setEditUserRevision(e.target.value)}
                            placeholder="输入分析师的人工研判修正，下轮 AI 对账将优先继承此视界..."
                            className="w-full bg-slate-950 text-xs text-purple-200 font-sans border border-purple-700/60 rounded px-2.5 py-1.5 focus:border-purple-500 focus:outline-none"
                          />
                        </div>
                        <div className="flex justify-end gap-2 pt-1">
                          <button
                            onClick={() => setEditingThesisId(null)}
                            className="px-3 py-1 text-xs text-slate-400 hover:text-white cursor-pointer"
                          >
                            取消
                          </button>
                          <button
                            onClick={() => handleSaveEdit(thesis.id)}
                            disabled={savingThesisId === thesis.id}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded text-xs font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" /> 保存更新
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Display Mode */
                      <>
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono font-bold text-blue-400">{thesis.id}</span>
                              <h4 className="text-sm font-bold text-white leading-snug">{thesis.title}</h4>
                            </div>
                            {/* Version Trajectory Sequence */}
                            {trajectory.length > 1 && (
                              <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] font-mono">
                                <span className="text-slate-500 font-semibold text-[10px] uppercase tracking-wider">演进路径:</span>
                                <div className="inline-flex items-center gap-1 bg-slate-900/90 px-2 py-0.5 rounded-lg border border-slate-800">
                                  {trajectory.map((step, i) => (
                                    <span key={step.version} className="flex items-center gap-1">
                                      <span className="text-slate-400 font-bold">{step.version}</span>
                                      <span
                                        className={`font-semibold ${
                                          step.status === "支持" || step.status === "加强"
                                            ? "text-emerald-400"
                                            : step.status === "削弱"
                                            ? "text-rose-400"
                                            : step.status === "部分支持"
                                            ? "text-blue-400"
                                            : "text-slate-400"
                                        }`}
                                      >
                                        {step.status}
                                      </span>
                                      {i < trajectory.length - 1 && <span className="text-slate-600 mx-0.5">→</span>}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {getStatusBadge(thesis.current_status)}
                            <span className="px-2 py-1 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700" title="本轮评估与已确认当前状态分开记录">
                              本轮：{getRoundAssessment(thesis.id)}
                            </span>
                            <button
                              onClick={() => handleStartEdit(thesis)}
                              className="p-1 text-slate-500 hover:text-slate-200 rounded cursor-pointer transition-colors"
                              title="编辑观点研判与验证条件"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Detail Box */}
                        <div className="bg-slate-900/70 rounded-lg p-3 text-xs space-y-2 border border-slate-800/80">
                          <div>
                            <span className="text-slate-500 font-medium">基线观点 (T0)：</span>
                            <span className="text-slate-400 font-sans">{thesis.original_view}</span>
                          </div>
                          <div>
                            <span className="text-blue-300 font-medium">当前观点 (已确认)：</span>
                            <span className="text-slate-200 font-sans font-medium">{thesis.current_view || thesis.original_view}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 font-medium">基线依据：</span>
                            <span className="text-slate-400 font-sans">{thesis.basis || "未提供"}</span>
                          </div>
                          <div>
                            <span className="text-blue-400/90 font-medium">当前理由 (已确认)：</span>
                            <span className="text-slate-300 font-sans">{thesis.current_reason || "尚未形成独立的当前理由"}</span>
                          </div>
                          {thesis.user_revision && (
                            <div className="mt-2 p-3 bg-gradient-to-r from-purple-950/50 via-indigo-950/30 to-purple-950/50 border border-purple-500/40 rounded-xl text-xs space-y-1.5 shadow-sm">
                              <div className="flex items-center gap-1.5 text-purple-300 font-bold text-[11px]">
                                <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                                <span>★ 买方分析师人工修订（已确权持久化，作为下轮先验假设）</span>
                              </div>
                              <p className="text-purple-100 font-sans text-xs leading-relaxed pl-5 bg-purple-950/40 p-2 rounded-lg border border-purple-800/40">{thesis.user_revision}</p>
                            </div>
                          )}
                          <div className="pt-2 border-t border-slate-800/60 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                            <span className="text-amber-400/95 font-mono">
                              验证门槛：{thesis.verification_criteria}
                            </span>
                            <span className="text-slate-500">跟踪周期: {thesis.verification_timeframe}</span>
                          </div>
                        </div>

                        {/* Citations */}
                        {thesis.citations && thesis.citations.length > 0 && (
                          <div className="flex items-center gap-2 pt-0.5 text-xs">
                            <span className="text-slate-500 text-[11px]">引用法定义务凭证:</span>
                            <div className="flex flex-wrap gap-1.5">
                              {thesis.citations.map((citeId) => (
                                <button
                                  key={citeId}
                                  onClick={() => onSelectEvidence(citeId)}
                                  className="px-2 py-0.5 bg-blue-950/70 hover:bg-blue-900 text-blue-300 border border-blue-800/60 rounded text-[11px] font-mono cursor-pointer transition-colors"
                                >
                                  {citeId}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Follow-up Questions Panel */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-purple-400" />
                <h4 className="text-sm font-bold text-white">未决疑问跟踪清单 (Open Follow-up Questions)</h4>
              </div>
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-[11px]">
                <button
                  onClick={() => setQuestionFilter("all")}
                  className={`px-2.5 py-0.5 rounded cursor-pointer transition-colors ${
                    questionFilter === "all" ? "bg-slate-800 text-white font-medium" : "text-slate-400 hover:text-white"
                  }`}
                >
                  全部 ({project.open_questions.length})
                </button>
                <button
                  onClick={() => setQuestionFilter("open")}
                  className={`px-2.5 py-0.5 rounded cursor-pointer transition-colors ${
                    questionFilter === "open" ? "bg-slate-800 text-amber-300 font-medium" : "text-slate-400 hover:text-white"
                  }`}
                >
                  未解 ({project.open_questions.filter((q) => q.status === "未解决").length})
                </button>
                <button
                  onClick={() => setQuestionFilter("partially")}
                  className={`px-2.5 py-0.5 rounded cursor-pointer transition-colors ${
                    questionFilter === "partially" ? "bg-slate-800 text-blue-300 font-medium" : "text-slate-400 hover:text-white"
                  }`}
                >
                  部分 ({project.open_questions.filter((q) => q.status === "部分解决").length})
                </button>
                <button
                  onClick={() => setQuestionFilter("resolved")}
                  className={`px-2.5 py-0.5 rounded cursor-pointer transition-colors ${
                    questionFilter === "resolved" ? "bg-slate-800 text-emerald-300 font-medium" : "text-slate-400 hover:text-white"
                  }`}
                >
                  已解 ({project.open_questions.filter((q) => q.status === "已解决").length})
                </button>
              </div>
            </div>

            {questionError && <div className="rounded-lg border border-rose-800 bg-rose-950/45 px-3 py-2 text-xs text-rose-300">疑问操作失败：{questionError}</div>}

            <div className="space-y-3">
              {filteredQuestions.map((q) => (
                <div
                  key={q.id}
                  className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-xs space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-blue-400">{q.id}</span>
                      <span className="text-slate-100 font-medium">{q.question_text}</span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${
                        q.status === "已解决"
                          ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                          : q.status === "部分解决"
                          ? "bg-blue-950 text-blue-300 border border-blue-800"
                          : "bg-amber-950 text-amber-300 border border-amber-800"
                      }`}
                    >
                      {q.status}
                    </span>
                  </div>

                  {/* Inline Note Editor or Display */}
                  {editingQuestionId === q.id ? (
                    <div className="space-y-2 bg-slate-900 p-2.5 rounded-lg border border-slate-700">
                      <label className="block text-[10px] text-slate-400">分析师核验笔记 (保存至 SQLite 数据库):</label>
                      <textarea
                        rows={2}
                        value={editingQuestionNote}
                        onChange={(e) => setEditingQuestionNote(e.target.value)}
                        className="w-full bg-slate-950 text-xs text-slate-200 border border-slate-700 rounded p-2 focus:outline-none focus:border-blue-500"
                        placeholder="输入调研交流验证结论或财务附注查证结果..."
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setEditingQuestionId(null)}
                          className="px-2.5 py-1 text-[11px] text-slate-400 hover:text-white cursor-pointer"
                        >
                          取消
                        </button>
                        <button
                          onClick={() => handleSaveQuestionNote(q)}
                          disabled={savingQuestionId === q.id}
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded text-[11px] font-semibold cursor-pointer"
                        >
                          保存笔记
                        </button>
                      </div>
                    </div>
                  ) : (
                    q.answer_notes && (
                      <div className="bg-slate-900/90 p-2.5 rounded-lg text-[11px] text-slate-300 leading-relaxed font-sans border-l-2 border-emerald-500">
                        <span className="text-emerald-400 font-semibold">核验记录：</span>
                        {q.answer_notes}
                      </div>
                    )
                  )}

                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-800/60">
                    <span>
                      提问于 {q.created_in_version} {q.resolved_in_version && `· 解决于 ${q.resolved_in_version}`}
                    </span>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleStartEditQuestionNote(q)}
                        className="text-slate-400 hover:text-blue-300 cursor-pointer flex items-center gap-1"
                      >
                        <Edit3 className="w-3 h-3" />
                        {q.answer_notes ? "修改笔记" : "写核验笔记"}
                      </button>
                      <button
                          onClick={() => {
                          const nextStatus: Record<string, "未解决" | "部分解决" | "已解决"> = {
                            未解决: "部分解决",
                            部分解决: "已解决",
                            已解决: "未解决",
                          };
                          const newStatus = nextStatus[q.status] || "未解决";
                          void onUpdateQuestion({
                            ...q,
                            status: newStatus,
                            resolved_in_version: newStatus === "已解决" ? project.current_version : null,
                          }).catch((err: any) => setQuestionError(String(err?.message || err || "保存疑问失败")));
                        }}
                        className="text-slate-400 hover:text-emerald-400 cursor-pointer flex items-center gap-1"
                      >
                        <CheckSquare className="w-3 h-3" />
                        标记为{q.status === "未解决" ? "部分解决" : q.status === "部分解决" ? "已解决" : "未解决"}
                      </button>
                      {onDeleteQuestion && (
                        <button
                          onClick={() => void onDeleteQuestion(q.id).catch((err: any) => setQuestionError(String(err?.message || err || "删除疑问失败")))}
                          className="text-slate-500 hover:text-rose-400 cursor-pointer"
                          title="删除该疑问"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Add Question Form */}
            <form onSubmit={handleCreateQuestion} className="flex gap-2 pt-2 border-t border-slate-800">
              <input
                type="text"
                value={newQuestionText}
                onChange={(e) => setNewQuestionText(e.target.value)}
                placeholder="新增买方待核验疑问（例如：高附加值芯片批量交付节奏与测试良率稳定性）..."
                className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold cursor-pointer shrink-0 border border-slate-700"
              >
                添加待跟踪疑问
              </button>
            </form>
          </div>
        </div>

        {/* ==================================================================== */}
        {/* ZONE 2 & ZONE 3 - 5 cols                                             */}
        {/* ==================================================================== */}
        <div className="lg:col-span-5 space-y-6">
          {/* ==================================================================== */}
          {/* ZONE 2: 本轮/选定版本更新 (Update Attribution)                      */}
          {/* ==================================================================== */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span>
                <h3 className="text-sm font-bold text-white uppercase tracking-wide">
                  Zone 2: 增量材料与 3 段式 Gap 归因
                </h3>
              </div>
              <span className="px-2.5 py-0.5 bg-purple-950 text-purple-300 border border-purple-800 rounded text-xs font-mono font-bold">
                {activeUpdate?.version || project.current_version}
              </span>
            </div>

            {inspectedVersion && inspectedVersion !== project.current_version && (
              <div className="bg-blue-950/50 border border-blue-800/60 rounded-lg p-2.5 text-xs text-blue-300 flex items-center justify-between">
                <span>正在查看历史快照【{inspectedVersion}】的核验记录</span>
                <button
                  onClick={() => setInspectedVersion(null)}
                  className="text-white hover:underline text-[11px] font-medium cursor-pointer"
                >
                  切回最新
                </button>
              </div>
            )}

            {activeUpdate ? (
              <div className="space-y-4">
                {/* Material Details Card */}
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="font-semibold text-slate-200">输入材料依据</span>
                    <span className="font-mono text-[11px] text-purple-400">{activeUpdate.material_id}</span>
                  </div>
                  <h4 className="text-sm font-bold text-white leading-snug">{activeUpdate.title}</h4>
                  <div className="text-[11px] text-slate-400">
                    确认时间: {new Date(activeUpdate.confirmed_at).toLocaleString("zh-CN")} · 责任人: {activeUpdate.confirmed_by}
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed pt-2 border-t border-slate-800/80">
                    {activeUpdate.summary}
                  </p>
                </div>

                {/* Deltas with Gap Explanation */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    观点增量演进 ({activeUpdate.thesis_deltas.length} 项)
                  </h4>
                  {activeUpdate.thesis_deltas.map((d) => {
                    const modelDelta = modelDeltas.find((candidate) => candidate.thesis_id === d.thesis_id);
                    const assessment = d.round_assessment === "supported"
                      ? "支持"
                      : d.round_assessment === "weakened"
                      ? "削弱"
                      : d.round_assessment === "unresolved"
                      ? "未解决"
                      : d.round_assessment === "unchanged"
                      ? "未改变"
                      : "未标注";
                    return (
                    <div key={d.thesis_id} className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-xs space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white">{d.title}</span>
                        <div className="flex items-center gap-1.5 font-mono text-[11px]">
                          <span className="text-slate-400">{d.previous_status}</span>
                          <span className="text-slate-600">→</span>
                          <span
                            className={`px-1.5 py-0.5 rounded font-semibold ${
                              d.new_status === "支持" || d.new_status === "加强"
                                ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                                : d.new_status === "削弱"
                                ? "bg-rose-950 text-rose-300 border border-rose-800"
                                : "bg-blue-950 text-blue-300 border border-blue-800"
                            }`}
                          >
                            {d.new_status}
                          </span>
                        </div>
                      </div>

                      <div className="text-[10px] text-slate-500 flex flex-wrap gap-x-3 gap-y-1">
                        <span>本轮评估：{assessment}</span>
                        <span>当前状态：{d.new_status}</span>
                      </div>
                      {modelDelta && (
                        <div className="rounded-lg border border-purple-900/60 bg-purple-950/20 p-2 text-[11px] text-purple-200">
                          <span className="font-semibold text-purple-300">模型草稿：</span>{modelDelta.reason || "未提供理由"}
                        </div>
                      )}
                      <div className="rounded-lg border border-blue-900/60 bg-blue-950/20 p-2 text-[11px] text-blue-100">
                        <span className="font-semibold text-blue-300">用户确认：</span>{d.reason || "未提供理由"}
                      </div>

                      {/* 3-part Gap Explanation Cards */}
                      <div className="space-y-2 pt-1.5">
                        <div className="bg-emerald-950/25 rounded-xl p-3 text-[11px] border border-emerald-800/40 text-slate-200 flex items-start gap-2.5 shadow-xs">
                          <div className="p-1.5 bg-emerald-900/50 text-emerald-400 rounded-lg shrink-0 mt-0.5">
                            <Eye className="w-3.5 h-3.5" />
                          </div>
                          <div className="space-y-0.5">
                            <span className="text-emerald-400 font-bold text-[11px] block">① 事实观察 (Observed Fact)</span>
                            <p className="text-slate-300 leading-relaxed text-xs">{d.gap_explanation.observed}</p>
                          </div>
                        </div>
                        <div className="bg-blue-950/25 rounded-xl p-3 text-[11px] border border-blue-800/40 text-slate-200 flex items-start gap-2.5 shadow-xs">
                          <div className="p-1.5 bg-blue-900/50 text-blue-400 rounded-lg shrink-0 mt-0.5">
                            <FileText className="w-3.5 h-3.5" />
                          </div>
                          <div className="space-y-0.5">
                            <span className="text-blue-400 font-bold text-[11px] block">② 披露口径 (Disclosed Reason)</span>
                            <p className="text-slate-300 leading-relaxed text-xs">{d.gap_explanation.disclosed_reason}</p>
                          </div>
                        </div>
                        <div className="bg-amber-950/25 rounded-xl p-3 text-[11px] border border-amber-800/40 text-slate-200 flex items-start gap-2.5 shadow-xs">
                          <div className="p-1.5 bg-amber-900/50 text-amber-400 rounded-lg shrink-0 mt-0.5">
                            <HelpCircle className="w-3.5 h-3.5" />
                          </div>
                          <div className="space-y-0.5">
                            <span className="text-amber-400 font-bold text-[11px] block">③ 尚未验证假说 (Unverified Hypothesis)</span>
                            <p className="text-slate-300 leading-relaxed text-xs">{d.gap_explanation.unverified_hypotheses}</p>
                          </div>
                        </div>
                      </div>

                      {/* User Revisions if any */}
                      {activeUpdate.user_revisions && activeUpdate.user_revisions[d.thesis_id] && (
                        <div className="bg-amber-950/25 border border-amber-800/50 p-2 rounded text-[11px] text-amber-300 flex items-start gap-1.5">
                          <span className="font-semibold shrink-0">买方复核：</span>
                          <span>{activeUpdate.user_revisions[d.thesis_id]}</span>
                        </div>
                      )}

                      {/* Evidence Link */}
                      {d.evidence_ids && d.evidence_ids.length > 0 && (
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400 pt-0.5">
                          <span>关联凭证:</span>
                          {d.evidence_ids.map((id) => (
                            <button
                              key={id}
                              onClick={() => onSelectEvidence(id)}
                              className="px-2 py-0.5 bg-blue-950 text-blue-300 rounded border border-blue-900 cursor-pointer font-mono hover:bg-blue-900"
                            >
                              {id}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>

                {/* Claims are retained separately from thesis deltas. */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">主张与来源核验</h4>
                  {!activeUpdate.claims || activeUpdate.claims.length === 0 ? (
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-[11px] text-slate-500">
                      本历史快照没有可展示的自动主张核验记录；不能据此推断来源已核验。
                    </div>
                  ) : (
                    activeUpdate.claims.map((claim) => (
                      <div key={claim.id} className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-slate-200 leading-relaxed">{claim.claim_text}</span>
                          <span className={`px-1.5 py-0.5 rounded border text-[10px] shrink-0 ${claimStatusClass(claim.verification)}`}>
                            {claimStatusText(claim.verification)}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500">类型：{claim.kind === "source" ? "来源" : claim.kind === "calculated" ? "计算" : "推断"} · {claim.explanation}</div>
                        {claim.evidence_ids && claim.evidence_ids.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400">
                            <span>来源：</span>
                            {claim.evidence_ids.map((id) => <button key={id} onClick={() => onSelectEvidence(id)} className="text-blue-300 hover:underline font-mono cursor-pointer">{id}</button>)}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {/* Keep the trace compact, but make the actual arguments/results inspectable. */}
                <details className="group rounded-lg border border-slate-800 bg-slate-950">
                  <summary className="flex items-center justify-between gap-2 px-3 py-2 text-xs font-semibold text-slate-400 cursor-pointer list-none">
                    <span className="flex items-center gap-1.5"><ChevronRight className="w-3.5 h-3.5 transition-transform group-open:rotate-90" />工具调用轨迹（{activeUpdate.tool_trace?.length || 0}）</span>
                    <span className="text-[10px] text-slate-600">展开查看真实参数与结果</span>
                  </summary>
                  <div className="px-3 pb-3 space-y-2">
                    {!activeUpdate.tool_trace || activeUpdate.tool_trace.length === 0 ? <p className="text-[11px] text-slate-500">没有可展示的工具调用轨迹。</p> : activeUpdate.tool_trace.map((trace) => <div key={trace.id} className="rounded border border-slate-800 bg-slate-900 p-2 text-[10px] space-y-1"><div className="flex items-center justify-between"><span className="font-mono text-slate-200">{trace.tool}</span><span className={trace.status === "ok" ? "text-emerald-400" : "text-rose-400"}>{trace.status} · {trace.duration_ms}ms</span></div><div className="text-slate-500 whitespace-pre-wrap break-words">{typeof trace.result === "string" ? trace.result : JSON.stringify(trace.result, null, 2)}</div></div>)}
                  </div>
                </details>
              </div>
            ) : (
              <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 text-center space-y-3">
                <div className="p-3 bg-purple-950/40 text-purple-400 rounded-full inline-flex">
                  <Database className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-white">当前处于 T0 初始基准状态</h4>
                <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
                  尚未录入新一期财报或定性材料。点击下方按钮载入材料，推进到 T1 或 T2！
                </p>
                <button
                  onClick={onOpenNewMaterial}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5 shadow-md"
                >
                  <Plus className="w-3.5 h-3.5" /> 录入新材料
                </button>
              </div>
            )}
          </div>

          {/* ==================================================================== */}
          {/* ZONE 3: 研究历史版本脉络 (Research History)                         */}
          {/* ==================================================================== */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wide">
                  Zone 3: 研究历史脉络 (History)
                </h3>
              </div>
              <span className="text-xs font-mono text-slate-400">
                {project.updates.length} 个快照节点
              </span>
            </div>

            {/* Version Timeline */}
            <div className="space-y-3 relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
              {historyUpdates.map((u, idx) => {
                const isSelected = inspectedVersion ? inspectedVersion === u.version : (idx === 0 && !inspectedVersion);

                return (
                  <div key={u.id} className="relative pl-7 space-y-1">
                    <span
                      className={`absolute left-3 top-2.5 -translate-x-1/2 w-3 h-3 rounded-full border-2 transition-all ${
                        isSelected
                          ? "bg-blue-500 border-blue-300 ring-2 ring-blue-500/30"
                          : "bg-slate-900 border-slate-600"
                      }`}
                    ></span>

                    <button
                      onClick={() => setInspectedVersion(u.version)}
                      className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? "bg-slate-950 border-blue-500/80 shadow-md shadow-blue-950/30"
                          : "bg-slate-950/70 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs text-blue-400">{u.version}</span>
                          {idx === 0 && (
                            <span className="px-1.5 py-0.2 bg-emerald-950 text-emerald-400 border border-emerald-800 rounded text-[10px]">
                              最新
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {new Date(u.confirmed_at).toLocaleDateString("zh-CN")}
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-white mt-1 leading-snug">{u.title}</div>
                      <p className="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">{u.summary}</p>
                      <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1.5 mt-1.5 border-t border-slate-800/60">
                        <span>核验观点: {u.thesis_deltas.length} 项</span>
                        <span>责任人: {u.confirmed_by}</span>
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
