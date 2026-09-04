import React, { useState } from "react";
import { ReportUploadView, type ReportUploadParams } from "./ReportUploadView";
import { ThesisReviewView, type ExtractedThesisItem, type CompanyCandidate } from "./ThesisReviewView";
import { ReportResearchView } from "./ReportResearchView";
import { UploadFilingModal } from "./UploadFilingModal";
import { uploadResearchReport } from "./uploadClient";
import type {
  Draft,
  UploadReceipt,
} from "../../shared/domain";

type WorkflowStage =
  | "REPORT_UPLOAD"
  | "THESIS_REVIEW"
  | "RESEARCH_WORKSPACE";

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

  // Modals
  const [isFilingModalOpen, setIsFilingModalOpen] = useState(false);
  const [filingTargetRound, setFilingTargetRound] = useState<"T1" | "T2">("T1");
  const [isFilingRunning, setIsFilingRunning] = useState(false);

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
        throw new Error(`提炼观点失败: ${res.statusText}`);
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
        throw new Error(`确认初始观点失败: ${res.statusText}`);
      }

      const data = await res.json();
      setProjectId(data.projectId);
      setCompanyInfo(company);
      setConfirmedVersion(0);
      setIsConfirmed(true);

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

  // Step 4: Upload Filing & Trigger Verification Run (T1 or T2)
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
        let errMessage = res.statusText;
        try {
          const errData = await res.json();
          if (errData?.error) errMessage = errData.error;
        } catch {}
        throw new Error(`财报核验失败: ${errMessage}`);
      }

      const filingRunData = await res.json();
      setCurrentRunId(filingRunData.runId);
      setActiveDraft(filingRunData.draft);
      setIsConfirmed(false);
      setIsFilingModalOpen(false);
    } catch (err: any) {
      alert(err.message || "财报核验运行失败");
    } finally {
      setIsFilingRunning(false);
    }
  };

  // Step 5: Confirm Verification Draft (T1 or T2)
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
        throw new Error(`保存核验状态失败: ${res.statusText}`);
      }

      const data = await res.json();
      const newVerNum = data.version === "T1" ? 1 : data.version === "T2" ? 2 : 1;
      setConfirmedVersion(newVerNum);
      setIsConfirmed(true);

      // Update draft items with confirmed judgments
      if (activeDraft) {
        const updatedItems = activeDraft.items.map((item) => ({
          ...item,
          userJudgment: userJudgments[item.thesis.thesisId] || item.userJudgment,
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

  // Demo Fallback for 1-Click Presentation
  const handleDemoPipeline = async () => {
    setIsAnalyzing(true);
    setAnalysisStep("正在加载真实演示样例（圣邦股份 300661 研报与财报）...");
    await new Promise((r) => setTimeout(r, 600));

    const demoDocId = "00000000-0000-4000-8000-000000000101";
    const demoTheses: ExtractedThesisItem[] = [
      {
        thesisId: "thesis-gm-300661",
        title: "综合毛利率达到 30% 以上",
        statement: "预计2025年综合毛利率有望达到30%以上，盈利能力显著修复。",
        type: "NUMERIC_FORECAST",
        criterion: {
          kind: "COMPARE",
          metric: "gross_margin",
          op: "GTE",
          target: "30",
          unit: "RATIO",
          period: { start: "2025-01-01", end: "2025-12-31", basis: "YEAR" },
          scope: "CONSOLIDATED",
        },
        sourceEvidenceIds: ["span-thesis-1"],
      },
      {
        thesisId: "thesis-cf-300661",
        title: "经营性现金流持续改善",
        statement: "经营活动产生的现金流量净额持续向好，营运资金效率提升。",
        type: "DIRECTIONAL",
        criterion: {
          kind: "TREND",
          metric: "operating_cash_flow",
          period: { start: "2025-01-01", end: "2025-12-31", basis: "YEAR" },
          scope: "CONSOLIDATED",
        },
        sourceEvidenceIds: ["span-thesis-1"],
      },
    ];

    setExtractedTheses(demoTheses);
    setCompanyCandidates([{ name: "圣邦股份", securityCode: "300661", exchange: "SZSE" }]);
    setReportDate("2025-06-15");
    setCurrentRunId("run-demo-t0");
    setUploadReceipt({
      uploadId: demoDocId,
      document: {
        id: demoDocId,
        role: "THESIS_SOURCE",
        title: "圣邦股份深度研究报告.pdf",
        fileName: "圣邦股份深度研究报告.pdf",
        mimeType: "application/pdf",
        sha256: "2688dd70df3f2140a3e65da66dd420dfa9ae3aa20edcb0074efcd52a83a07fa6",
        companyId: null,
        publishedAt: "2025-06-15",
        period: null,
        origin: "USER_UPLOAD",
        officialUrl: null,
        providerId: null,
        supersedesDocumentId: null,
        isSynthetic: true,
        createdAt: new Date().toISOString(),
      },
      parseSummary: {
        status: "COMPLETED",
        parserVersion: "demo",
        pageCount: 32,
        blockCount: 186,
        tableCount: 9,
        spanCount: 231,
        quality: {
          nativeTextRatio: 1,
          hasOcrPages: false,
          lowConfidencePages: [],
          issues: ["显式 Demo：未读取真实上传文件"],
        },
      },
    });
    setStage("THESIS_REVIEW");
    setIsAnalyzing(false);
  };

  return (
    <div className="w-full">
      {stage === "REPORT_UPLOAD" && (
        <ReportUploadView
          onStartAnalysis={handleUploadReport}
          onStartExtraction={handleStartExtraction}
          isAnalyzing={isAnalyzing}
          currentStep={analysisStep}
          receipt={uploadReceipt}
          error={uploadError}
        />
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
                    setFilingTargetRound("T1");
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
              setFilingTargetRound("T2");
              setIsFilingModalOpen(true);
            }}
            onConfirmDraft={handleConfirmDraft}
            isUpdatingRound2={isFilingRunning}
            isConfirmed={isConfirmed}
            confirmedVersion={confirmedVersion}
          />
        </div>
      )}

      {/* Upload Filing Modal */}
      <UploadFilingModal
        isOpen={isFilingModalOpen}
        onClose={() => setIsFilingModalOpen(false)}
        companyName={companyInfo.name}
        securityCode={companyInfo.securityCode}
        currentRound={filingTargetRound}
        onSubmitFiling={handleSubmitFiling}
        isUploading={isFilingRunning}
      />

    </div>
  );
};
