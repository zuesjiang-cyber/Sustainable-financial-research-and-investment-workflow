import React, { useEffect, useState } from "react";
import { ReportUploadView, type ReportUploadParams } from "./ReportUploadView";
import { ThesisReviewView, type ExtractedThesisItem, type CompanyCandidate } from "./ThesisReviewView";
import { ReportResearchView } from "./ReportResearchView";
import { UploadFilingModal } from "./UploadFilingModal";
import { DemoResearchView } from "./DemoResearchView";
import { uploadResearchReport } from "./uploadClient";
import type {
  Draft,
  ResearchState,
  UploadReceipt,
} from "../../shared/domain";

type WorkflowStage =
  | "REPORT_UPLOAD"
  | "THESIS_REVIEW"
  | "RESEARCH_WORKSPACE"
  | "DEMO_RESULTS";

interface ResumableV1Project {
  id: string;
  company: { name: string; securityCode: string; exchange?: string };
  current_version: string;
  currentState: ResearchState;
}

function draftFromSavedProject(project: ResumableV1Project): Draft {
  const state = project.currentState;
  return {
    schemaVersion: "1.0",
    id: state.updateId,
    // A resumed snapshot has no pending run. Reusing the update ID only gives
    // the read-only Draft a valid UUID; a new filing creates its own run.
    runId: state.updateId,
    projectId: state.projectId,
    revision: state.version,
    baseStateVersion: state.version,
    sourceManifest: state.sourceManifest,
    items: state.items.map((item) => ({
      thesis: item.thesis,
      previous: item.assessment,
      proposed: item.assessment,
      change: "UNCHANGED" as const,
      changeReason: `已加载 ${project.current_version} Research Memory`,
      include: item.lifecycle === "ACTIVE",
      userJudgment: item.userJudgment,
    })),
    staleThesisIds: [],
    questions: state.questions,
    corrections: [],
    method: state.method,
  };
}

function versionNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === "string") {
    const match = value.trim().match(/^T(\d+)$/i);
    if (match) return Number(match[1]);
  }
  return fallback;
}

async function apiError(response: Response, fallback: string): Promise<Error> {
  let message = "";
  try {
    const payload = await response.json() as { error?: unknown; message?: unknown };
    if (typeof payload.error === "string") message = payload.error;
    else if (typeof payload.message === "string") message = payload.message;
  } catch {
    // Keep the HTTP status fallback when the response is not JSON.
  }
  return new Error(message ? `${fallback}: ${message}` : `${fallback}: ${response.statusText}`);
}

export const ReportFirstContainer: React.FC = () => {
  const [stage, setStage] = useState<WorkflowStage>("REPORT_UPLOAD");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState("正在解析研报中...");
  const [uploadReceipt, setUploadReceipt] = useState<UploadReceipt | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Extracted Theses for T0 review
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [extractedTheses, setExtractedTheses] = useState<ExtractedThesisItem[]>([]);
  const [companyCandidates, setCompanyCandidates] = useState<CompanyCandidate[]>([]);
  const [reportDate, setReportDate] = useState<string | null>(null);

  // Project & Active Draft / State
  const [projectId, setProjectId] = useState<string | null>(null);
  const [companyInfo, setCompanyInfo] = useState<{ name: string; securityCode: string }>({
    name: "当前公司",
    securityCode: "待确认",
  });
  const [activeDraft, setActiveDraft] = useState<Draft | null>(null);
  const [confirmedVersion, setConfirmedVersion] = useState<number>(0);
  const [isConfirmed, setIsConfirmed] = useState<boolean>(false);
  const [isResumed, setIsResumed] = useState(false);

  // Saved V1 projects are loaded on the report landing page so a refresh can
  // continue an existing company rather than forcing a new upload.
  const [existingProjects, setExistingProjects] = useState<Array<Pick<ResumableV1Project, "id" | "company" | "current_version">>>([]);
  const [isLoadingExistingProjects, setIsLoadingExistingProjects] = useState(false);
  const [existingProjectsError, setExistingProjectsError] = useState<string | null>(null);

  // Modals
  const [isFilingModalOpen, setIsFilingModalOpen] = useState(false);
  const [filingTargetRound, setFilingTargetRound] = useState(1);
  const [isFilingRunning, setIsFilingRunning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingExistingProjects(true);
    fetch("/v1/projects")
      .then(async (res) => {
        if (!res.ok) throw await apiError(res, "已有研究项目加载失败");
        const data = await res.json();
        if (!Array.isArray(data)) throw new Error("已有研究项目响应格式无效");
        return data as Array<Pick<ResumableV1Project, "id" | "company" | "current_version">>;
      })
      .then((data) => {
        if (cancelled) return;
        setExistingProjects(data);
        setExistingProjectsError(null);
      })
      .catch((error) => {
        if (cancelled) return;
        setExistingProjects([]);
        setExistingProjectsError(error instanceof Error ? error.message : "已有研究项目加载失败");
      })
      .finally(() => {
        if (!cancelled) setIsLoadingExistingProjects(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleResumeProject = async (id: string) => {
    setIsLoadingExistingProjects(true);
    setExistingProjectsError(null);
    try {
      const res = await fetch(`/v1/projects/${encodeURIComponent(id)}`);
      if (!res.ok) throw await apiError(res, "研究项目加载失败");
      const project = await res.json() as ResumableV1Project;
      if (!project.currentState?.projectId || project.currentState.projectId !== project.id) throw new Error("研究项目状态缺少有效 projectId");
      const savedVersion = versionNumber(project.currentState.version, versionNumber(project.current_version, 0));
      setProjectId(project.id);
      setCompanyInfo({ name: project.company.name, securityCode: project.company.securityCode });
      setConfirmedVersion(savedVersion);
      setFilingTargetRound(savedVersion + 1);
      setActiveDraft(draftFromSavedProject(project));
      setCurrentRunId(null);
      setUploadError(null);
      setIsConfirmed(true);
      setIsResumed(true);
      setStage("RESEARCH_WORKSPACE");
    } catch (error) {
      setExistingProjectsError(error instanceof Error ? error.message : "研究项目加载失败");
    } finally {
      setIsLoadingExistingProjects(false);
    }
  };

  // Step 1: Upload Report
  const handleUploadReport = async (params: ReportUploadParams) => {
    if (params.isDemo) {
      handleDemoPipeline();
      return;
    }

    if (!params.file) {
      setUploadError("请选择要上传的 PDF 文件");
      return;
    }

    setUploadReceipt(null);
    setUploadError(null);
    setIsAnalyzing(true);
    setAnalysisStep("正在上传研报并解析 PDF 结构...");

    try {
      const receipt = await uploadResearchReport(params.file, {
        onPhase: (phase) => {
          setAnalysisStep(phase === "uploading" ? "正在上传 PDF 文件..." : "正在完成文本、段落与表格提取...");
        },
      });
      setUploadReceipt(receipt);
      setAnalysisStep("PDF 解析完成");
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "研报上传或解析失败，请重试");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Step 2: Start Thesis Extraction (Ling-3.0-flash-Fin)
  const handleStartExtraction = async (reportDocId: string) => {
    setIsAnalyzing(true);
    setAnalysisStep("Ling-3.0-flash-Fin 正在语义理解研报并提炼未来可验证投资观点...");

    try {
      const res = await fetch("/v1/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "INITIAL_REPORT",
          reportDocumentId: reportDocId,
        }),
      });

      if (!res.ok) {
        throw await apiError(res, "提炼观点失败");
      }

      const data = await res.json();
      setCurrentRunId(data.runId);
      setExtractedTheses(data.draft?.items || []);
      setCompanyCandidates(data.companyCandidates || []);
      setReportDate(data.reportDate || null);
      setStage("THESIS_REVIEW");
    } catch (err: any) {
      setUploadError(err.message || "提炼观点失败");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Step 3: User Confirms Theses & Forms T0
  const handleConfirmT0 = async (
    company: { name: string; securityCode: string; exchange?: string },
    theses: ExtractedThesisItem[]
  ) => {
    if (!currentRunId) return;
    setIsAnalyzing(true);

    try {
      const res = await fetch(`/v1/runs/${currentRunId}/draft/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftRevision: 1,
          company,
          theses,
        }),
      });

      if (!res.ok) {
        throw await apiError(res, "确认初始观点失败");
      }

      const data = await res.json();
      setProjectId(data.projectId);
      setCompanyInfo(company);
      setConfirmedVersion(0);
      setIsConfirmed(true);
      setIsResumed(false);
      setFilingTargetRound(1);

      // Create initial T0 Draft for display
      if (!data.state?.sourceManifest) throw new Error("服务器未返回已保存的 T0 研究状态");
      const t0Draft: Draft = {
        schemaVersion: "1.0",
        id: data.state.updateId,
        runId: currentRunId,
        projectId: data.projectId,
        revision: 1,
        baseStateVersion: 0,
        sourceManifest: data.state.sourceManifest,
        items: (data.state?.items || []).map((item: any) => ({
          thesis: item.thesis,
          previous: null,
          proposed: item.assessment,
          change: "NEW" as const,
          changeReason: "研报初建跟踪基线",
          include: true,
          userJudgment: null,
        })),
        staleThesisIds: [],
        questions: data.state.questions || [],
        corrections: [],
        method: data.state.method,
      };

      setActiveDraft(t0Draft);
      setStage("RESEARCH_WORKSPACE");
    } catch (err: any) {
      alert(err.message || "确认失败");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Step 4: Upload Filing & Trigger Verification Run (next Tn)
  const handleSubmitFiling = async (params: {
    file?: File;
    reportType: "Q1" | "HALF_YEAR" | "Q3" | "ANNUAL";
    period: { start: string; end: string; basis: "QUARTER" | "YTD" | "YEAR" };
    publishedAt: string;
    scope: "CONSOLIDATED" | "PARENT";
  }) => {
    setIsFilingRunning(true);
    try {
      if (!params.file || !projectId) throw new Error("请上传真实财报 PDF，并先确认初始研究项目");
      const receipt = await uploadResearchReport(params.file, {
        role: "FINANCIAL_FILING",
        projectId,
      });
      const filingDocId = receipt.document.id;

      // Call filing run
      const res = await fetch(`/v1/projects/${projectId}/filing-runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filingDocumentId: filingDocId,
          period: params.period,
          publishedAt: params.publishedAt,
          scope: params.scope,
        }),
      });

      if (!res.ok) {
        throw await apiError(res, "财报核验失败");
      }

      const filingRunData = await res.json();
      setCurrentRunId(filingRunData.runId);
      setActiveDraft(filingRunData.draft);
      // The run is a review draft, not yet a committed state.  Keeping the
      // target version in local UI state lets the review page show the next
      // confirmation action while the server still waits for user approval.
      setConfirmedVersion(filingTargetRound);
      setIsConfirmed(false);
      setIsResumed(false);
      setIsFilingModalOpen(false);
    } catch (err: any) {
      alert(err.message || "财报核验运行失败");
    } finally {
      setIsFilingRunning(false);
    }
  };

  // Step 5: Confirm Verification Draft (Tn)
  const handleConfirmDraft = async (
    userJudgments: Record<string, string>,
    edits: Array<{ thesisId: string; text?: string; criterion?: unknown }> = [],
    questions: Array<{ id?: string; thesisId: string; text: string; requiredEvidence: string; status?: string }> = [],
  ) => {
    if (!currentRunId || !projectId) return;

    try {
      const res = await fetch(`/v1/runs/${currentRunId}/draft/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          userJudgments,
          baseStateVersion: activeDraft?.baseStateVersion,
          draftRevision: activeDraft?.revision,
          edits,
          questions,
        }),
      });

      if (!res.ok) {
        throw await apiError(res, "保存核验状态失败");
      }

      const data = await res.json();
      const newVerNum = versionNumber(data.version, (activeDraft?.baseStateVersion || 0) + 1);
      setConfirmedVersion(newVerNum);
      setIsConfirmed(true);
      setFilingTargetRound(newVerNum + 1);
      setIsResumed(false);

      // Update draft items with confirmed judgments
      if (activeDraft) {
        const updatedItems = activeDraft.items.map((item) => ({
          ...item,
          userJudgment: userJudgments[item.thesis.thesisId] !== undefined
            ? userJudgments[item.thesis.thesisId].trim() || null
            : item.userJudgment,
        }));
        setActiveDraft({
          ...activeDraft,
          items: updatedItems,
        });
      }
    } catch (err: any) {
      alert(err.message || "保存失败");
    }
  };

  // Read-only Demo: no run/project is created and no API is called.
  const handleDemoPipeline = async () => {
    setIsAnalyzing(true);
    setAnalysisStep("正在加载静态已核验 Research Draft / State...");
    await new Promise((resolve) => setTimeout(resolve, 320));
    setIsAnalyzing(false);
    setStage("DEMO_RESULTS");
  };

  return (
    <div className="w-full">
      {stage === "REPORT_UPLOAD" && (
        <>
          <ReportUploadView
            onStartAnalysis={handleUploadReport}
            onStartExtraction={handleStartExtraction}
            onOpenDemo={handleDemoPipeline}
            isAnalyzing={isAnalyzing}
            currentStep={analysisStep}
            receipt={uploadReceipt}
            error={uploadError}
          />
          <section className="existing-projects-section">
            <div className="existing-projects-card">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">继续已有真实研究项目</h2>
                  <p className="text-xs text-slate-500 mt-1">刷新后可继续查看 Markdown Research Memory，并上传下一期财报。</p>
                </div>
                {isLoadingExistingProjects && <span className="text-xs text-slate-500">加载中...</span>}
              </div>
              {existingProjectsError && <p className="text-xs text-rose-600">{existingProjectsError}</p>}
              {!isLoadingExistingProjects && existingProjects.length === 0 && !existingProjectsError && (
                <p className="text-xs text-slate-500">暂无已保存的真实项目。</p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {existingProjects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => handleResumeProject(project.id)}
                    disabled={isLoadingExistingProjects}
                    className="existing-project-item"
                  >
                    <span className="block text-sm font-semibold text-slate-900">{project.company.name}</span>
                    <span className="block mt-1 text-xs text-slate-500">{project.company.securityCode} · 当前 {project.current_version}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        </>
      )}

      {stage === "THESIS_REVIEW" && (
        <ThesisReviewView
          initialTheses={extractedTheses}
          companyCandidates={companyCandidates}
          reportDate={reportDate}
          onConfirmT0={handleConfirmT0}
          isSubmitting={isAnalyzing}
        />
      )}

      {stage === "DEMO_RESULTS" && (
        <DemoResearchView onBackHome={() => setStage("REPORT_UPLOAD")} />
      )}

      {stage === "RESEARCH_WORKSPACE" && activeDraft && (
        <div className="space-y-6">
          {/* T0 Prompt Banner when awaiting filing */}
          {confirmedVersion === 0 && (
            <div className="max-w-5xl mx-auto mt-6 px-6">
              <div className="bg-blue-950/50 border border-blue-800/80 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-sm font-bold text-blue-200">
                    已建立初始研究跟踪基线 (T0)
                  </div>
                  <div className="text-xs text-blue-300/80">
                    观点尚未经财报核验。请点击右侧按钮上传该公司的第一份官方定期财报（如三季报）。
                  </div>
                </div>
                <button
                  onClick={() => {
                    setFilingTargetRound(confirmedVersion + 1);
                    setIsFilingModalOpen(true);
                  }}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl cursor-pointer shrink-0 shadow-lg shadow-blue-600/25 transition-all"
                >
                  上传财报进行 T1 核验
                </button>
              </div>
            </div>
          )}

          <ReportResearchView
            draft={activeDraft}
            companyName={companyInfo.name}
            securityCode={companyInfo.securityCode}
            onUpdateRound2={() => {
              setFilingTargetRound(confirmedVersion + 1);
              setIsFilingModalOpen(true);
            }}
            onConfirmDraft={handleConfirmDraft}
            isUpdatingRound2={isFilingRunning}
            isConfirmed={isConfirmed}
            confirmedVersion={confirmedVersion}
            isReadOnly={isResumed}
          />
        </div>
      )}

      {/* Upload Filing Modal */}
      <UploadFilingModal
        isOpen={isFilingModalOpen}
        onClose={() => setIsFilingModalOpen(false)}
        companyName={companyInfo.name}
        securityCode={companyInfo.securityCode}
        currentRound={`T${filingTargetRound}`}
        onSubmitFiling={handleSubmitFiling}
        isUploading={isFilingRunning}
      />

    </div>
  );
};
