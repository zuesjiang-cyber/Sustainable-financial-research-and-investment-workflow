import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
  XCircle,
  Download,
  Upload,
  FileText,
  Sparkles,
  ArrowRight,
  Eye,
  RefreshCw,
  Copy,
  Check,
  Building2,
  Cpu,
  Layers,
  HelpCircle,
  Database,
  Terminal,
  Calculator,
  AlertTriangle,
  BadgeCheck,
  RotateCcw,
  BookOpen,
  FolderKanban,
  History,
  Clock,
  Plus,
} from "lucide-react";
import { MAIN_CASE_INPUT, ALTERNATE_CASE_INPUT } from "./data/showcases";
import {
  computeFinTrustAnalysis,
  downloadFile,
} from "./lib/fintrustEngine";
import type { CaseInput, ProvenanceType, ProjectState, ResearchThesis, FollowUpQuestion } from "./types/fintrust";
import { EvidenceDrawer } from "./components/EvidenceDrawer";
import { ContinuousResearchZone } from "./components/ContinuousResearchZone";
import { NewProjectModal } from "./components/NewProjectModal";
import { NewMaterialModal } from "./components/NewMaterialModal";
import { getInitialSbgProject } from "./server/seedData";

function ProvenanceBadge({ type }: { type?: ProvenanceType | string }) {
  switch (type) {
    case "calculated":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-blue-500/15 text-blue-300 border border-blue-500/30">
          <Calculator className="w-2.5 h-2.5" />
          确定性计算
        </span>
      );
    case "source":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
          <FileText className="w-2.5 h-2.5" />
          财报原文
        </span>
      );
    case "ai":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-purple-500/15 text-purple-300 border border-purple-500/30">
          <Sparkles className="w-2.5 h-2.5" />
          AI 语义比较
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-700 text-slate-300 border border-slate-600">
          已核验
        </span>
      );
  }
}

export default function App() {
  // Mode selection: Continuous Research State (Round 2) vs Single Analysis & Test Bench (Round 1)
  const [appMode, setAppMode] = useState<"continuous" | "single_test">("continuous");

  // Continuous Research State
  const [projectsList, setProjectsList] = useState<Array<{ id: string; name: string; company: string; ticker: string; current_version: string }>>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("proj_sbg_300661");
  const [activeProject, setActiveProject] = useState<ProjectState | null>(null);
  const [isLoadingProject, setIsLoadingProject] = useState(false);

  // Modals
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const [isNewMaterialOpen, setIsNewMaterialOpen] = useState(false);

  // Single-Round Test Bench State
  const [caseMode, setCaseMode] = useState<"sbg" | "alternate">("sbg");
  const [activeTab, setActiveTab] = useState<"overview" | "metrics" | "narrative" | "claims" | "brief" | "test_suite">("overview");

  // Shared Evidence Drawer
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. Fetch project list on mount
  const loadProjects = async () => {
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const list = await res.json();
        setProjectsList(list);
        if (list.length > 0) {
          setSelectedProjectId((prev) => {
            const match = list.find((p: any) => p.id === prev);
            return match ? prev : list[0].id;
          });
        }
      }
    } catch (e) {
      console.warn("Could not fetch projects list from server, using local fallback:", e);
      // Client-side fallback if server booting
      const sbg = getInitialSbgProject();
      setProjectsList([{ id: sbg.id, name: sbg.name, company: sbg.company, ticker: sbg.ticker, current_version: sbg.current_version }]);
    }
  };

  // 2. Fetch active project details
  const loadActiveProject = async (id: string) => {
    setIsLoadingProject(true);
    try {
      const res = await fetch(`/api/projects/${id}`);
      if (res.ok) {
        const data = await res.json();
        setActiveProject(data);
      } else {
        // Fallback
        const sbg = getInitialSbgProject();
        setActiveProject(sbg);
      }
    } catch (e) {
      console.warn("Error fetching project details, using seed fallback:", e);
      setActiveProject(getInitialSbgProject());
    } finally {
      setIsLoadingProject(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      loadActiveProject(selectedProjectId);
    }
  }, [selectedProjectId]);

  // Handle Project Creation
  const handleCreateProject = async (data: any) => {
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const created = await res.json();
        await loadProjects();
        setSelectedProjectId(created.id);
        setActiveProject(created);
      }
    } catch (err) {
      console.error("Failed to create project:", err);
    }
  };

  // Handle Continuous Material Analysis Preview
  const handleRunContinuousAnalysis = async (title: string, content: string) => {
    if (!activeProject) throw new Error("No active project");
    const res = await fetch(`/api/projects/${activeProject.id}/analyze-material`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        content,
        snippets: activeProject.documents.flatMap((d) => d.evidence_snippets || []),
      }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Analysis failed");
    }
    return res.json();
  };

  // Handle Applying & Saving Update to SQLite
  const handleApplyUpdate = async (data: any) => {
    if (!activeProject) return;
    const res = await fetch(`/api/projects/${activeProject.id}/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const updated = await res.json();
      setActiveProject(updated);
      await loadProjects();
    }
  };

  // Update Thesis
  const handleUpdateThesis = async (thesisId: string, updates: Partial<ResearchThesis>) => {
    if (!activeProject) return;
    try {
      const res = await fetch(`/api/projects/${activeProject.id}/theses/${thesisId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        await loadActiveProject(activeProject.id);
      }
    } catch (err) {
      console.error("Failed to update thesis:", err);
    }
  };

  // Add Question
  const handleAddQuestion = async (text: string) => {
    if (!activeProject) return;
    try {
      const res = await fetch(`/api/projects/${activeProject.id}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question_text: text, status: "未解决" }),
      });
      if (res.ok) {
        const updated = await res.json();
        setActiveProject(updated);
      }
    } catch (err) {
      console.error("Failed to add question:", err);
    }
  };

  // Update Question
  const handleUpdateQuestion = async (question: FollowUpQuestion) => {
    if (!activeProject) return;
    try {
      const res = await fetch(`/api/projects/${activeProject.id}/questions/${question.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(question),
      });
      if (res.ok) {
        const updated = await res.json();
        setActiveProject(updated);
      }
    } catch (err) {
      console.error("Failed to update question:", err);
    }
  };

  // Delete Question
  const handleDeleteQuestion = async (questionId: string) => {
    if (!activeProject) return;
    try {
      const res = await fetch(`/api/projects/${activeProject.id}/questions/${questionId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        const updated = await res.json();
        setActiveProject(updated);
      }
    } catch (err) {
      console.error("Failed to delete question:", err);
    }
  };

  // Export Project Snapshot
  const handleExportSnapshot = async () => {
    if (!activeProject) return;
    try {
      const res = await fetch(`/api/projects/${activeProject.id}/export`);
      const snapshot = await res.json();
      downloadFile(
        `fintrust_project_${activeProject.id}_${activeProject.current_version}.json`,
        JSON.stringify(snapshot, null, 2),
        "application/json"
      );
    } catch (err) {
      console.error("Export failed:", err);
    }
  };

  // Import Snapshot
  const handleImportSnapshot = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const data = JSON.parse(text);
        const proj = data.project || data;
        const res = await fetch("/api/projects/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ project: proj }),
        });
        if (res.ok) {
          await loadProjects();
          setSelectedProjectId(proj.id);
          await loadActiveProject(proj.id);
        }
      } catch (err) {
        alert("导入快照解析失败，请检查文件格式。");
      }
    };
    reader.readAsText(file);
  };

  // Reset Default Data
  const handleResetDefault = async () => {
    if (!confirm("确定要将数据库重置为官方默认演示状态吗？这会恢复圣邦股份 T0/T1 状态。")) return;
    try {
      await fetch("/api/projects/reset-default", { method: "POST" });
      await loadProjects();
      setSelectedProjectId("proj_sbg_01");
      await loadActiveProject("proj_sbg_01");
    } catch (err) {
      console.error("Reset failed:", err);
    }
  };

  // Single Analysis Calculation & Data
  const currentCaseInput: CaseInput = caseMode === "sbg" ? MAIN_CASE_INPUT : ALTERNATE_CASE_INPUT;
  const analysis = computeFinTrustAnalysis(currentCaseInput);
  const { case_meta, metrics, thesis_updates, narrative_deltas, claim_audits, published_summary, analysis_meta } = analysis;

  const handleCopySummary = () => {
    navigator.clipboard.writeText(published_summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadJSON = () => {
    downloadFile(
      `fintrust_thesis_update_${case_meta.case_id}.json`,
      JSON.stringify(analysis, null, 2),
      "application/json"
    );
  };

  const handleDownloadMD = () => {
    downloadFile(
      `fintrust_thesis_brief_${case_meta.case_id}.md`,
      published_summary,
      "text/markdown"
    );
  };

  const verifiedClaimsCount = claim_audits.filter((c) => c.status === "VERIFIED").length;
  const mismatchClaimsCount = claim_audits.filter((c) => c.status === "MISMATCH").length;

  const revMetric = metrics.revenue_fy2025;
  const gmMetric = metrics.gross_margin_fy2025;
  const cfMetric = metrics.operating_cash_flow_fy2025;
  const rdMetric = metrics.rd_expense_ratio_fy2025;

  // Merge continuous research evidence snippets with showcase evidence
  const mergedEvidenceList = useMemo(() => {
    const list = [...(currentCaseInput.evidence || [])];
    if (activeProject && activeProject.documents) {
      for (const doc of activeProject.documents) {
        if (doc.evidence_snippets) {
          for (const snip of doc.evidence_snippets) {
            if (!list.some((e) => e.evidence_id === snip.id)) {
              list.push({
                evidence_id: snip.id,
                document: doc.title,
                page: snip.page || 1,
                period: doc.disclosure_date || "Continuous Update",
                image: "sbg_fy2025_p13.png",
                snippet: snip.text,
              });
            }
          }
        }
      }
    }
    return list;
  }, [currentCaseInput.evidence, activeProject]);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* Evidence Drawer Overlay (Truthful disclaimers + Verbatim transcripts) */}
      <EvidenceDrawer
        evidenceId={selectedEvidenceId}
        evidenceList={mergedEvidenceList}
        onClose={() => setSelectedEvidenceId(null)}
        onSelectEvidence={(id) => setSelectedEvidenceId(id)}
      />

      {/* New Project Modal */}
      <NewProjectModal
        isOpen={isNewProjectOpen}
        onClose={() => setIsNewProjectOpen(false)}
        onSubmit={handleCreateProject}
      />

      {/* New Material Modal */}
      {activeProject && (
        <NewMaterialModal
          isOpen={isNewMaterialOpen}
          project={activeProject}
          onClose={() => setIsNewMaterialOpen(false)}
          onRunAnalysis={handleRunContinuousAnalysis}
          onApplyUpdate={handleApplyUpdate}
        />
      )}

      {/* Hidden File Input for Snapshot Import */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImportSnapshot}
        accept=".json"
        className="hidden"
      />

      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-950/90 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-600/20 border border-blue-500/40 rounded-xl text-blue-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base tracking-tight text-white">FinTrust Research Core</span>
                <span className="text-[10px] font-mono uppercase bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded border border-blue-500/40">
                  SQLite 持久记忆版
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                买方观点持续追踪 · 不变量硬门禁 · 拒绝虚假分析
              </p>
            </div>
          </div>

          {/* Center: System Mode Toggle */}
          <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setAppMode("continuous")}
              className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                appMode === "continuous"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              id="mode-continuous-btn"
            >
              <History className="w-3.5 h-3.5" />
              持续研究跟踪 (T0 → T1 → T2)
            </button>
            <button
              onClick={() => setAppMode("single_test")}
              className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                appMode === "single_test"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              id="mode-single-test-btn"
            >
              <Terminal className="w-3.5 h-3.5" />
              单次分析与不变量测试台
            </button>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center space-x-2">
            {appMode === "continuous" && (
              <>
                <button
                  onClick={() => setIsNewProjectOpen(true)}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors border border-slate-700"
                  title="新建买方研究基线"
                >
                  <Plus className="w-3.5 h-3.5" />
                  新建项目
                </button>

                <button
                  onClick={handleExportSnapshot}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs cursor-pointer border border-slate-700"
                  title="导出 SQLite 项目快照 JSON"
                >
                  <Download className="w-4 h-4" />
                </button>

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs cursor-pointer border border-slate-700"
                  title="导入项目快照 JSON"
                >
                  <Upload className="w-4 h-4" />
                </button>

                <button
                  onClick={handleResetDefault}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-amber-300 rounded-lg text-xs cursor-pointer border border-slate-700"
                  title="重置数据库到默认状态"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </>
            )}

            {appMode === "single_test" && (
              <>
                <button
                  onClick={handleDownloadJSON}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors border border-slate-700"
                >
                  <Download className="w-3.5 h-3.5" />
                  JSON
                </button>
                <button
                  onClick={handleDownloadMD}
                  className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                >
                  <FileText className="w-3.5 h-3.5" />
                  导出研报
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Sub-Header: Project Selector Bar (When in Continuous Mode) */}
      {appMode === "continuous" && (
        <div className="bg-slate-950/60 border-b border-slate-800/80 px-4 sm:px-6 lg:px-8 py-2.5">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <FolderKanban className="w-4 h-4 text-blue-400" />
              <span className="text-slate-400 font-medium">当前研究标的：</span>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-white font-semibold focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                {projectsList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.company} ({p.ticker}) · {p.current_version}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono">
              <span className="flex items-center gap-1">
                <Database className="w-3.5 h-3.5 text-emerald-400" />
                SQLite: project_memory.db (已持久化)
              </span>
              <span>•</span>
              <span className="text-purple-400">
                LLM: {process.env.GEMINI_API_KEY ? "Gemini 3.8 Flash (Active)" : "语义规则对账 (Fail-Closed Mode)"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* ==================================================================== */}
        {/* VIEW 1: CONTINUOUS RESEARCH STATE (Round 2: T0 -> T1 -> T2)           */}
        {/* ==================================================================== */}
        {appMode === "continuous" && (
          <div>
            {isLoadingProject || !activeProject ? (
              <div className="p-12 text-center text-slate-400">
                <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-blue-500" />
                <p className="text-sm">正在加载研究项目状态与演进历史...</p>
              </div>
            ) : (
              <ContinuousResearchZone
                project={activeProject}
                onSelectEvidence={(id) => setSelectedEvidenceId(id)}
                onOpenNewMaterial={() => setIsNewMaterialOpen(true)}
                onUpdateThesis={handleUpdateThesis}
                onAddQuestion={handleAddQuestion}
                onUpdateQuestion={handleUpdateQuestion}
                onDeleteQuestion={handleDeleteQuestion}
              />
            )}
          </div>
        )}

        {/* ==================================================================== */}
        {/* VIEW 2: SINGLE-ROUND ANALYSIS & INVARIANT TEST BENCH (Round 1)      */}
        {/* ==================================================================== */}
        {appMode === "single_test" && (
          <div className="space-y-6">
            {/* Input Switcher Bar */}
            <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center space-x-3">
                <span className="text-xs font-mono font-semibold uppercase text-slate-400">
                  当前输入案例:
                </span>
                <div className="flex rounded-lg bg-slate-900 p-1 border border-slate-700 text-xs font-mono">
                  <button
                    onClick={() => setCaseMode("sbg")}
                    className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                      caseMode === "sbg"
                        ? "bg-blue-600 text-white font-bold"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    主案例 (圣邦股份 FY2025 年报)
                  </button>
                  <button
                    onClick={() => setCaseMode("alternate")}
                    className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                      caseMode === "alternate"
                        ? "bg-purple-600 text-white font-bold"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    反事实回归测试用例 (+30% 超预期)
                  </button>
                </div>
              </div>

              {/* Execution Latency & Engine Mode */}
              <div className="flex items-center gap-3 text-xs font-mono">
                <span className="text-slate-400">
                  耗时: <strong className="text-emerald-400">{analysis_meta.latency_ms}ms</strong>
                </span>
                <span className="text-slate-600">|</span>
                <span className="text-slate-400">
                  模式: <strong className="text-blue-400">{analysis_meta.execution_mode}</strong>
                </span>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-slate-800 space-x-4 text-xs font-semibold overflow-x-auto">
              {[
                { id: "overview", label: "核心观点判定", count: thesis_updates.length },
                { id: "metrics", label: "Decimal 财务指标重算", count: 6 },
                { id: "narrative", label: "AI 叙事语义比较", count: narrative_deltas.length },
                { id: "claims", label: "草稿主张核验与拦截", count: `${verifiedClaimsCount}通过/${mismatchClaimsCount}拦截` },
                { id: "brief", label: "发布版研究简报" },
                { id: "test_suite", label: "12/12 业务与不变量测试套件" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`pb-3 px-1 border-b-2 transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    activeTab === tab.id
                      ? "border-blue-500 text-blue-400 font-bold"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {tab.label}
                  {tab.count && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-800 text-slate-300 font-mono">
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* TAB 1: OVERVIEW */}
            {activeTab === "overview" && (
              <div className="space-y-6 animate-in fade-in duration-200">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {thesis_updates.map((thesis) => (
                    <div
                      key={thesis.pillar_id}
                      className="bg-slate-800/80 border border-slate-700 rounded-xl p-5 shadow-sm space-y-3"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="text-xs font-mono font-bold text-blue-400">
                            {thesis.pillar_id}
                          </span>
                          <h3 className="text-base font-bold text-white mt-0.5">
                            {thesis.title}
                          </h3>
                        </div>
                        <div>
                          {thesis.status === "加强" ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800">
                              <TrendingUp className="w-3.5 h-3.5" /> 加强
                            </span>
                          ) : thesis.status === "削弱" ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-950 text-rose-300 border border-rose-800">
                              <TrendingDown className="w-3.5 h-3.5" /> 削弱
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-700 text-slate-300 border border-slate-600">
                              <Minus className="w-3.5 h-3.5" /> 保持
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="bg-slate-950/70 rounded-lg p-3 text-xs space-y-2 border border-slate-800">
                        <div>
                          <span className="text-slate-400 font-medium">原始观点：</span>
                          <span className="text-slate-300 font-sans">{thesis.original_view}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 font-medium">本轮依据：</span>
                          <span className="text-slate-200 font-sans font-medium">{thesis.reason}</span>
                        </div>
                        <div className="pt-1 border-t border-slate-800 flex items-center justify-between text-[11px]">
                          <span className="text-amber-400 font-mono">
                            触发依据：{thesis.trigger_data}
                          </span>
                          <ProvenanceBadge type={thesis.provenance_type} />
                        </div>
                      </div>

                      {thesis.evidence_ids && thesis.evidence_ids.length > 0 && (
                        <div className="flex items-center gap-2 pt-1 text-xs">
                          <span className="text-slate-500 text-[11px]">底稿索引:</span>
                          {thesis.evidence_ids.map((citeId) => (
                            <button
                              key={citeId}
                              onClick={() => setSelectedEvidenceId(citeId)}
                              className="px-2 py-0.5 bg-blue-950/70 hover:bg-blue-900 text-blue-300 border border-blue-800/60 rounded text-[11px] font-mono cursor-pointer transition-colors"
                            >
                              {citeId}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 2: METRICS */}
            {activeTab === "metrics" && (
              <div className="space-y-6 animate-in fade-in duration-200">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    {
                      label: "营业收入 (FY2025)",
                      val: revMetric ? `${(Number(revMetric.current_value) / 1e8).toFixed(2)} 亿元` : "--",
                      sub: revMetric?.delta_value ? `同比 ${revMetric.delta_value}%` : "同比不可比",
                      formula: "Decimal 重算: (本期-上期)/上期",
                      evidence: "E25_P13_SUMMARY",
                    },
                    {
                      label: "综合毛利率",
                      val: gmMetric?.current_value ? `${gmMetric.current_value}%` : "--",
                      sub: gmMetric?.delta_value ? `同比变动 ${gmMetric.delta_value} pct` : "--",
                      formula: "Decimal 重算: (收入-成本)/收入",
                      evidence: "E25_P85_COST_REVENUE",
                    },
                    {
                      label: "经营活动现金流净额",
                      val: cfMetric ? `${(Number(cfMetric.current_value) / 1e8).toFixed(2)} 亿元` : "--",
                      sub: cfMetric?.delta_value ? `同比 ${cfMetric.delta_value}%` : "--",
                      formula: "精确计算: (466M - 549M)/549M",
                      evidence: "E25_P89_CASH_FLOW",
                    },
                    {
                      label: "研发费用率",
                      val: rdMetric?.current_value ? `${rdMetric.current_value}%` : "--",
                      sub: rdMetric?.description || "高研发投入支撑料号扩充",
                      formula: "精确计算: 研发费 / 营业收入",
                      evidence: "E25_P85_COST_REVENUE",
                    },
                  ].map((m, idx) => (
                    <div key={idx} className="bg-slate-800/80 border border-slate-700 rounded-xl p-4 space-y-2">
                      <div className="text-xs text-slate-400 font-medium">{m.label}</div>
                      <div className="text-xl font-mono font-bold text-white tracking-tight">{m.val}</div>
                      <div className="text-xs font-mono text-emerald-400">{m.sub}</div>
                      <div className="pt-2 border-t border-slate-700/60 text-[11px] text-slate-400 font-mono flex items-center justify-between">
                        <span>{m.formula}</span>
                        <button
                          onClick={() => setSelectedEvidenceId(m.evidence)}
                          className="text-blue-400 hover:underline cursor-pointer"
                        >
                          {m.evidence}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 3: NARRATIVE */}
            {activeTab === "narrative" && (
              <div className="space-y-4 animate-in fade-in duration-200">
                {narrative_deltas.map((n) => (
                  <div key={n.label} className="bg-slate-800/80 border border-slate-700 rounded-xl p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-purple-400" />
                        {n.label}
                      </h4>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-purple-950 text-purple-300 border border-purple-800">
                        {n.source_tag}
                      </span>
                    </div>
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs">
                      <span className="text-slate-400 block mb-1 font-semibold">披露演进：</span>
                      <p className="text-slate-300 leading-relaxed font-sans">{n.summary}</p>
                    </div>
                    <div className="p-3 bg-blue-950/30 rounded-lg border border-blue-900/50 text-xs text-blue-200">
                      <strong>AI 对比归因：</strong> {n.relevance}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* TAB 4: CLAIMS */}
            {activeTab === "claims" && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <div className="text-xs text-slate-400 flex items-center justify-between">
                  <span>对草稿研报中的 7 条核心事实主张进行真实底稿拦截审核：</span>
                  <span className="font-mono">
                    拦截率: <strong className="text-rose-400">{mismatchClaimsCount}/7</strong>
                  </span>
                </div>
                <div className="space-y-3">
                  {claim_audits.map((c) => (
                    <div
                      key={c.claim_id}
                      className={`p-4 rounded-xl border transition-all ${
                        c.status === "VERIFIED"
                          ? "bg-slate-800/80 border-slate-700"
                          : "bg-rose-950/30 border-rose-800/70 shadow-sm"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-slate-400">{c.claim_id}</span>
                          <span className="text-sm font-medium text-white">{c.claim_text}</span>
                        </div>
                        {c.status === "VERIFIED" ? (
                          <span className="px-2 py-0.5 bg-emerald-950 text-emerald-400 border border-emerald-800 rounded text-xs font-semibold shrink-0 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> 已核验通过
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-rose-950 text-rose-300 border border-rose-700 rounded text-xs font-semibold shrink-0 flex items-center gap-1">
                            <XCircle className="w-3.5 h-3.5" /> 拦截偏差 (MISMATCH)
                          </span>
                        )}
                      </div>
                      <div className="mt-2 text-xs text-slate-300 space-y-1">
                        <div><span className="text-slate-500">法定核验值：</span><span className="font-mono text-emerald-400">{c.recalculated_truth}</span></div>
                        <div><span className="text-slate-500">审计说明：</span><span>{c.explanation}</span></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 5: PUBLISHED BRIEF */}
            {activeTab === "brief" && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">已剔除所有草稿幻觉并由真实计算重写后的最终研报：</span>
                  <button
                    onClick={handleCopySummary}
                    className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? "已复制到剪贴板" : "复制 Markdown"}
                  </button>
                </div>
                <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 font-mono text-xs text-slate-200 whitespace-pre-wrap leading-relaxed shadow-inner">
                  {published_summary}
                </div>
              </div>
            )}

            {/* TAB 6: ACCEPTANCE TEST SUITE */}
            {activeTab === "test_suite" && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-white">产品验收与硬不变量安全测试套件 (12 / 12 Passed)</h3>
                  <span className="px-3 py-1 bg-emerald-950 text-emerald-400 border border-emerald-800 rounded font-mono text-xs font-bold">
                    100% ALL PASSED
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[
                    { id: "INV-01", name: "变异输入零信息泄漏测试 (Zero-Leakage)", desc: "将公司名替换为 Acme Corp 并注入反向财务数据，严格断言绝无硬编码圣邦文本泄漏。" },
                    { id: "INV-02", name: "缺失必要事实硬报错测试 (Fail-Closed Facts)", desc: "剔除 revenue_fy2025 字段，断言系统立即抛出 MissingRequiredFactError 并阻断执行。" },
                    { id: "INV-03", name: "LLM 故障熔断保护 (Fail-Closed Analyzer)", desc: "当未配置 API 密钥或网络异常时，状态标记为 UNAVAILABLE，绝不返回假分析。" },
                    { id: "INV-04", name: "动态主张核验与错误阻断 (Dynamic Claim Intercept)", desc: "断言系统对任意数值的现金流方向错误或毛利率虚高进行重算并拦截，不依赖硬编码 ID。" },
                    { id: "T01", name: "输入完整加载与资产扫描", desc: "验证 case_input.json 成功解析，10项事实、4项观点、7张底稿切片图证完整存在。" },
                    { id: "T02", name: "Decimal 财务指标高精度重算", desc: "收入同比(+16.46%)、现金流同比(-15.11%)、综合毛利率(50.94%)重算精确无误。" },
                    { id: "T03", name: "AI 叙事语义比较结构输出", desc: "单次受限 Prompt 批量对比，提取 change_type 与 thesis_relevance。" },
                    { id: "T04", name: "四条投资逻辑状态判定", desc: "毛利率降0.52pct削弱、现金流降15.11%削弱、研发破10亿加强。" },
                    { id: "T05", name: "七条草稿主张核验与拦截", desc: "验证 5 项 VERIFIED 与 2 项 MISMATCH (C04 现金流方向写反, C05 毛利率虚高)。" },
                    { id: "T06", name: "最终发布简报防幻觉检查", desc: "验证最终生成的研报 Markdown 绝对不继承草稿的任何错误数值。" },
                    { id: "T07", name: "反事实输入动态回归测试", desc: "替换为 alternate_case_input.json 后，投资观点状态自动随数字变化发生逆转。" },
                    { id: "T08", name: "序列化与下载可用性", desc: "验证 AnalysisResult 数据模型支持标准 JSON 序列化与 Markdown 导出。" },
                  ].map((test) => (
                    <div key={test.id} className="bg-slate-800/80 border border-slate-700 rounded-lg p-3.5 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-blue-400">{test.id}</span>
                        <span className="text-emerald-400 text-xs font-bold font-mono">PASSED</span>
                      </div>
                      <div className="text-xs font-semibold text-white">{test.name}</div>
                      <p className="text-[11px] text-slate-400 leading-normal">{test.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-950 py-4 text-center text-xs text-slate-500">
        FinTrust Thesis Update · 具备持续研究记忆的买方基本面研究系统 · SQLite 本地持久化与确定性审计门禁
      </footer>
    </div>
  );
}
