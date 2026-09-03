import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { computeFinTrustAnalysis } from "./src/lib/fintrustEngine";
import {
  initProjects,
  getAllProjects,
  getProjectById,
  saveFullProject,
  applyResearchUpdate,
  addProjectQuestion,
  updateProjectQuestion,
  deleteProjectQuestion,
} from "./src/server/projectRepo";
import { runContinuousAnalysis } from "./src/server/continuousAnalyzer";
import { SAMPLE_T2_MATERIAL, loadCaseInput, getInitialSbgProject } from "./src/server/seedData";
import type { CaseInput, ProjectState, FollowUpQuestion } from "./src/types/fintrust";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "20mb" }));

  // Initialize SQLite database
  await initProjects();

  // ----------------------------------------------------
  // API Routes
  // ----------------------------------------------------

  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      server_time: new Date().toISOString(),
      gemini_configured: Boolean(process.env.GEMINI_API_KEY),
    });
  });

  // 1. Single-Round Deterministic & Audit Engine
  app.post("/api/analyze", async (req, res) => {
    try {
      const caseInput = req.body as CaseInput;
      if (!caseInput || !caseInput.case || !caseInput.facts) {
        return res.status(400).json({ error: "Invalid CaseInput payload: missing case or facts" });
      }

      const startTime = Date.now();
      const output = computeFinTrustAnalysis(caseInput);
      const latency = Date.now() - startTime;
      output.analysis_meta.latency_ms = latency;

      return res.json(output);
    } catch (err: any) {
      console.error("Error in /api/analyze:", err);
      return res.status(500).json({
        error: "CalculationFailed",
        message: String(err?.message || err),
      });
    }
  });

  // 2. Preloaded Case Inputs
  app.get("/api/case-inputs/:caseId", (req, res) => {
    const { caseId } = req.params;
    let filePath = "";
    if (caseId === "sbg_fy2025" || caseId === "default") {
      filePath = "project/data/showcases/sbg_fy2025/case_input.json";
    } else if (caseId === "alternate_test_case") {
      filePath = "project/tests/fixtures/alternate_case_input.json";
    } else {
      filePath = `project/data/showcases/${caseId}/case_input.json`;
    }

    const data = loadCaseInput(filePath);
    if (!data) {
      return res.status(404).json({ error: `Case input for ${caseId} not found at ${filePath}` });
    }
    return res.json(data);
  });

  // 3. Project Management (Round 2: SQLite Persistence)
  app.get("/api/projects", async (req, res) => {
    try {
      const list = await getAllProjects();
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ error: String(err?.message || err) });
    }
  });

  app.get("/api/projects/:id", async (req, res) => {
    try {
      const project = await getProjectById(req.params.id);
      if (!project) return res.status(404).json({ error: "Project not found" });
      res.json(project);
    } catch (err: any) {
      res.status(500).json({ error: String(err?.message || err) });
    }
  });

  // Create new project with custom T0 theses or notes
  app.post("/api/projects", async (req, res) => {
    try {
      const { name, company, ticker, summary, theses, initial_notes, questions } = req.body;
      const now = new Date().toISOString();
      const id = `proj_${Date.now().toString(36)}`;

      const newProj: ProjectState = {
        id,
        name: name || `${company} 投资观点跟踪`,
        company: company || "未命名标的",
        ticker: ticker || "000000.SZ",
        current_version: "T0",
        status: "active",
        summary: summary || "新建研究项目基线",
        created_at: now,
        updated_at: now,
        theses: (theses || []).map((t: any, idx: number) => ({
          id: t.id || `THESIS_${String(idx + 1).padStart(2, "0")}`,
          project_id: id,
          title: t.title || "核心观点",
          original_view: t.original_view || "",
          formed_at: now,
          basis: t.basis || "",
          verification_criteria: t.verification_criteria || "",
          verification_timeframe: t.verification_timeframe || "1-2个财报周期",
          current_status: (t.current_status || "保持") as any,
          citations: t.citations || [],
          updated_at: now,
        })),
        documents: initial_notes
          ? [
              {
                id: `DOC_T0_${Date.now().toString(36)}`,
                project_id: id,
                source_type: "notes",
                title: "T0 初始研究底稿与备忘",
                disclosure_date: now.split("T")[0],
                content: initial_notes,
                added_at: now,
                evidence_snippets: [],
              },
            ]
          : [],
        updates: [
          {
            id: `UPDATE_T0_${Date.now().toString(36)}`,
            project_id: id,
            version: "T0",
            parent_version: null,
            title: "T0 初始研究基准建立",
            material_id: `DOC_T0_${Date.now().toString(36)}`,
            thesis_deltas: (theses || []).map((t: any) => ({
              thesis_id: t.id || "THESIS_01",
              title: t.title || "观点",
              previous_status: "待评估",
              new_status: t.current_status || "保持",
              reason: "T0 确立基准观点",
              gap_explanation: {
                observed: "T0 初始建仓观察",
                disclosed_reason: "基于历史公开材料确立",
                unverified_hypotheses: "后续财报与定性验证",
              },
              evidence_ids: [],
              next_steps: "等待 T1 材料更新",
            })),
            user_revisions: {},
            follow_up_questions: questions || [],
            confirmed_at: now,
            confirmed_by: "买方分析师",
            summary: "确立 T0 初始假设与未决疑问清单",
          },
        ],
        open_questions: (questions || []).map((q: any, idx: number) => ({
          id: q.id || `Q${String(idx + 1).padStart(2, "0")}`,
          question_text: typeof q === "string" ? q : q.question_text,
          status: "未解决",
          created_in_version: "T0",
          resolved_in_version: null,
          answer_notes: "",
          updated_at: now,
        })),
      };

      await saveFullProject(newProj);
      res.json(newProj);
    } catch (err: any) {
      console.error("Failed to create project:", err);
      res.status(500).json({ error: String(err?.message || err) });
    }
  });

  // Analyze new material in continuous mode (preview before saving)
  app.post("/api/projects/:id/analyze-material", async (req, res) => {
    try {
      const project = await getProjectById(req.params.id);
      if (!project) return res.status(404).json({ error: "Project not found" });

      const { title, content, snippets } = req.body;
      if (!content) return res.status(400).json({ error: "Material content is required" });

      const analysis = await runContinuousAnalysis(project, { title, content, snippets });
      res.json(analysis);
    } catch (err: any) {
      console.error("Continuous analysis failed:", err);
      res.status(500).json({ error: String(err?.message || err) });
    }
  });

  // Apply and save a confirmed research update (T1, T2)
  app.post("/api/projects/:id/update", async (req, res) => {
    try {
      const { newVersion, materialTitle, materialContent, deltas, userRevisions, questions, evidenceSnippets } = req.body;
      const updated = await applyResearchUpdate(
        req.params.id,
        newVersion,
        materialTitle,
        materialContent,
        deltas,
        userRevisions || {},
        questions || [],
        evidenceSnippets || []
      );
      res.json(updated);
    } catch (err: any) {
      console.error("Failed to apply update:", err);
      res.status(500).json({ error: String(err?.message || err) });
    }
  });

  // Update a specific thesis (user edit / revision)
  app.put("/api/projects/:id/theses/:thesisId", async (req, res) => {
    try {
      const project = await getProjectById(req.params.id);
      if (!project) return res.status(404).json({ error: "Project not found" });

      const { thesisId } = req.params;
      const index = project.theses.findIndex((t) => t.id === thesisId);
      if (index === -1) return res.status(404).json({ error: "Thesis not found" });

      const current = project.theses[index];
      project.theses[index] = {
        ...current,
        ...req.body,
        updated_at: new Date().toISOString(),
      };
      project.updated_at = new Date().toISOString();

      await saveFullProject(project);
      res.json(project.theses[index]);
    } catch (err: any) {
      res.status(500).json({ error: String(err?.message || err) });
    }
  });

  // Add Question to Project
  app.post("/api/projects/:id/questions", async (req, res) => {
    try {
      const { question_text, status, answer_notes } = req.body;
      if (!question_text) return res.status(400).json({ error: "question_text is required" });
      const project = await getProjectById(req.params.id);
      if (!project) return res.status(404).json({ error: "Project not found" });

      const newQ: FollowUpQuestion = {
        id: `Q${String(project.open_questions.length + 1).padStart(2, "0")}`,
        question_text,
        status: status || "未解决",
        created_in_version: project.current_version,
        resolved_in_version: null,
        answer_notes: answer_notes || "",
        updated_at: new Date().toISOString(),
      };

      const updated = await addProjectQuestion(req.params.id, newQ);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: String(err?.message || err) });
    }
  });

  // Update Question in Project
  app.put("/api/projects/:id/questions/:questionId", async (req, res) => {
    try {
      const updated = await updateProjectQuestion(req.params.id, req.params.questionId, req.body);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: String(err?.message || err) });
    }
  });

  // Delete Question in Project
  app.delete("/api/projects/:id/questions/:questionId", async (req, res) => {
    try {
      const updated = await deleteProjectQuestion(req.params.id, req.params.questionId);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: String(err?.message || err) });
    }
  });

  // Sample T2 material helper for immediate continuous demonstration
  app.get("/api/sample-materials/t2", (req, res) => {
    res.json(SAMPLE_T2_MATERIAL);
  });

  // Export full project snapshot
  app.get("/api/projects/:id/export", async (req, res) => {
    try {
      const project = await getProjectById(req.params.id);
      if (!project) return res.status(404).json({ error: "Project not found" });

      const snapshot = {
        export_version: "2.0",
        exported_at: new Date().toISOString(),
        project,
      };
      res.json(snapshot);
    } catch (err: any) {
      res.status(500).json({ error: String(err?.message || err) });
    }
  });

  // Import snapshot
  app.post("/api/projects/import", async (req, res) => {
    try {
      const { project } = req.body;
      if (!project || !project.id) return res.status(400).json({ error: "Invalid snapshot structure" });
      await saveFullProject(project);
      res.json({ success: true, project_id: project.id });
    } catch (err: any) {
      res.status(500).json({ error: String(err?.message || err) });
    }
  });

  // Reset default showcase project
  app.post("/api/projects/reset-default", async (req, res) => {
    try {
      const sbg = getInitialSbgProject();
      await saveFullProject(sbg);
      res.json({ success: true, project: sbg });
    } catch (err: any) {
      res.status(500).json({ error: String(err?.message || err) });
    }
  });

  // ----------------------------------------------------
  // Vite Integration
  // ----------------------------------------------------
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[FinTrust Server] running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
