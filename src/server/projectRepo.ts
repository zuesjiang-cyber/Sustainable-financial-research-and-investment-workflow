import { getDb, saveDbToDisk, withTransaction } from "./db";
import { getInitialSbgProject } from "./seedData";
import type {
  ProjectState,
  ResearchThesis,
  ResearchDocument,
  ResearchUpdate,
  FollowUpQuestion,
  ThesisDelta,
  ThesisStatus,
} from "../types/fintrust";

export async function initProjects(): Promise<void> {
  const db = await getDb();
  const countRes = db.exec("SELECT COUNT(*) as cnt FROM projects");
  const count = countRes.length > 0 && countRes[0].values.length > 0 ? (countRes[0].values[0][0] as number) : 0;

  if (count === 0) {
    console.log("Seeding initial research project into SQLite...");
    const sbg = getInitialSbgProject();
    await saveFullProject(sbg);
  }
}

export async function getAllProjects(): Promise<Array<{ id: string; name: string; company: string; ticker: string; current_version: string; status: string; summary: string; updated_at: string }>> {
  const db = await getDb();
  const res = db.exec("SELECT id, name, company, ticker, current_version, status, summary, updated_at FROM projects ORDER BY updated_at DESC");
  if (res.length === 0) return [];

  const cols = res[0].columns;
  return res[0].values.map((row) => {
    const obj: Record<string, unknown> = {};
    cols.forEach((col, idx) => {
      obj[col] = row[idx];
    });
    return obj as unknown as {
      id: string;
      name: string;
      company: string;
      ticker: string;
      current_version: string;
      status: string;
      summary: string;
      updated_at: string;
    };
  });
}

export async function getProjectById(projectId: string): Promise<ProjectState | null> {
  const db = await getDb();

  // Get project record
  const pStmt = db.prepare("SELECT * FROM projects WHERE id = :id");
  pStmt.bind({ ":id": projectId });
  if (!pStmt.step()) {
    pStmt.free();
    return null;
  }
  const pRow = pStmt.getAsObject() as {
    id: string;
    name: string;
    company: string;
    ticker: string;
    current_version: string;
    status: "active" | "archived";
    summary: string;
    created_at: string;
    updated_at: string;
  };
  pStmt.free();

  // Get theses
  const tRes = db.exec(`SELECT * FROM theses WHERE project_id = '${projectId}' ORDER BY id ASC`);
  const theses: ResearchThesis[] = [];
  if (tRes.length > 0) {
    const cols = tRes[0].columns;
    tRes[0].values.forEach((row) => {
      const obj: Record<string, unknown> = {};
      cols.forEach((c, idx) => {
        obj[c] = row[idx];
      });
      theses.push({
        id: String(obj.id),
        project_id: String(obj.project_id),
        title: String(obj.title),
        original_view: String(obj.original_view),
        formed_at: String(obj.formed_at),
        basis: String(obj.basis),
        verification_criteria: String(obj.conditions_json),
        verification_timeframe: String(obj.timeframe),
        current_status: obj.current_status as ThesisStatus,
        current_reason: obj.current_reason ? String(obj.current_reason) : undefined,
        user_revision: obj.user_revision ? String(obj.user_revision) : undefined,
        citations: JSON.parse(String(obj.citations_json || "[]")),
        updated_at: String(obj.updated_at),
      });
    });
  }

  // Get documents
  const dRes = db.exec(`SELECT * FROM documents WHERE project_id = '${projectId}' ORDER BY added_at ASC`);
  const documents: ResearchDocument[] = [];
  if (dRes.length > 0) {
    const cols = dRes[0].columns;
    dRes[0].values.forEach((row) => {
      const obj: Record<string, unknown> = {};
      cols.forEach((c, idx) => {
        obj[c] = row[idx];
      });
      documents.push({
        id: String(obj.id),
        project_id: String(obj.project_id),
        source_type: obj.source_type as "notes" | "annual_report" | "quarterly_update" | "qualitative_brief",
        title: String(obj.title),
        disclosure_date: String(obj.disclosure_date),
        content: String(obj.content),
        added_at: String(obj.added_at),
        evidence_snippets: JSON.parse(String(obj.evidence_snippets_json || "[]")),
      });
    });
  }

  // Get updates
  const uRes = db.exec(`SELECT * FROM research_updates WHERE project_id = '${projectId}' ORDER BY confirmed_at ASC`);
  const updates: ResearchUpdate[] = [];
  if (uRes.length > 0) {
    const cols = uRes[0].columns;
    uRes[0].values.forEach((row) => {
      const obj: Record<string, unknown> = {};
      cols.forEach((c, idx) => {
        obj[c] = row[idx];
      });
      updates.push({
        id: String(obj.id),
        project_id: String(obj.project_id),
        version: String(obj.version),
        parent_version: obj.parent_version ? String(obj.parent_version) : null,
        title: String(obj.title),
        material_id: String(obj.material_id),
        thesis_deltas: JSON.parse(String(obj.thesis_deltas_json || "[]")),
        user_revisions: JSON.parse(String(obj.user_revisions_json || "{}")),
        follow_up_questions: JSON.parse(String(obj.follow_up_questions_json || "[]")),
        confirmed_at: String(obj.confirmed_at),
        confirmed_by: String(obj.confirmed_by),
        summary: String(obj.title),
      });
    });
  }

  // Get open questions
  const qRes = db.exec(`SELECT * FROM questions WHERE project_id = '${projectId}' ORDER BY updated_at DESC`);
  const open_questions: FollowUpQuestion[] = [];
  if (qRes.length > 0) {
    const cols = qRes[0].columns;
    qRes[0].values.forEach((row) => {
      const obj: Record<string, unknown> = {};
      cols.forEach((c, idx) => {
        obj[c] = row[idx];
      });
      open_questions.push({
        id: String(obj.id),
        question_text: String(obj.question_text),
        status: obj.status as "未解决" | "部分解决" | "已解决",
        created_in_version: String(obj.created_in_version),
        resolved_in_version: obj.resolved_in_version ? String(obj.resolved_in_version) : null,
        answer_notes: String(obj.answer_notes || ""),
        updated_at: String(obj.updated_at),
      });
    });
  }

  return {
    id: pRow.id,
    name: pRow.name,
    company: pRow.company,
    ticker: pRow.ticker,
    current_version: pRow.current_version,
    status: pRow.status,
    summary: pRow.summary,
    created_at: pRow.created_at,
    updated_at: pRow.updated_at,
    theses,
    documents,
    updates,
    open_questions,
  };
}

export async function saveFullProject(project: ProjectState): Promise<void> {
  await withTransaction((db) => {
    // Upsert project
    db.run(
      `INSERT OR REPLACE INTO projects (id, name, company, ticker, current_version, status, summary, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        project.id,
        project.name,
        project.company,
        project.ticker,
        project.current_version,
        project.status,
        project.summary,
        project.created_at,
        project.updated_at,
      ]
    );

    // Clear & re-insert documents
    db.run(`DELETE FROM documents WHERE project_id = ?`, [project.id]);
    for (const doc of project.documents) {
      db.run(
        `INSERT INTO documents (id, project_id, source_type, title, disclosure_date, content, added_at, evidence_snippets_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          doc.id,
          project.id,
          doc.source_type,
          doc.title,
          doc.disclosure_date,
          doc.content,
          doc.added_at,
          JSON.stringify(doc.evidence_snippets || []),
        ]
      );
    }

    // Clear & re-insert theses
    db.run(`DELETE FROM theses WHERE project_id = ?`, [project.id]);
    for (const th of project.theses) {
      db.run(
        `INSERT INTO theses (id, project_id, title, original_view, formed_at, basis, conditions_json, timeframe, current_status, citations_json, updated_at, current_reason, user_revision)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          th.id,
          project.id,
          th.title,
          th.original_view,
          th.formed_at,
          th.basis,
          th.verification_criteria,
          th.verification_timeframe,
          th.current_status,
          JSON.stringify(th.citations || []),
          th.updated_at,
          th.current_reason || null,
          th.user_revision || null,
        ]
      );
    }

    // Clear & re-insert updates
    db.run(`DELETE FROM research_updates WHERE project_id = ?`, [project.id]);
    for (const u of project.updates) {
      db.run(
        `INSERT INTO research_updates (id, project_id, version, parent_version, title, material_id, thesis_deltas_json, user_revisions_json, follow_up_questions_json, confirmed_at, confirmed_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          u.id,
          project.id,
          u.version,
          u.parent_version || "",
          u.title,
          u.material_id,
          JSON.stringify(u.thesis_deltas || []),
          JSON.stringify(u.user_revisions || {}),
          JSON.stringify(u.follow_up_questions || []),
          u.confirmed_at,
          u.confirmed_by,
        ]
      );
    }

    // Clear & re-insert questions
    db.run(`DELETE FROM questions WHERE project_id = ?`, [project.id]);
    for (const q of project.open_questions) {
      db.run(
        `INSERT INTO questions (id, project_id, question_text, status, created_in_version, resolved_in_version, answer_notes, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          q.id,
          project.id,
          q.question_text,
          q.status,
          q.created_in_version,
          q.resolved_in_version || null,
          q.answer_notes,
          q.updated_at,
        ]
      );
    }
  });
}

export async function applyResearchUpdate(
  projectId: string,
  newVersion: string,
  parentVersion: string | undefined | null,
  materialTitle: string,
  materialContent: string,
  deltas: ThesisDelta[],
  userRevisions: Record<string, string>,
  questions: FollowUpQuestion[],
  evidenceSnippets: Array<{ id: string; page: number; text: string }> = []
): Promise<ProjectState> {
  const project = await getProjectById(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  // Idempotency check: If newVersion has already been applied, return the current project state directly
  if (project.current_version === newVersion) {
    const existingUpdate = project.updates.find((u) => u.version === newVersion);
    if (existingUpdate) {
      console.warn(`Idempotent duplicate update call: version ${newVersion} already confirmed for ${projectId}`);
      return project;
    }
  }

  // Parent version validation
  if (parentVersion && project.current_version !== parentVersion) {
    const err: any = new Error(
      `Version mismatch conflict: Expected parent version '${parentVersion}', but current version is '${project.current_version}'`
    );
    err.statusCode = 409;
    throw err;
  }

  const now = new Date().toISOString();
  // Generate stable, collision-free document and update IDs
  const docId = `DOC_${projectId}_${newVersion}_${Date.now().toString(36)}`;

  // 1. Add new document
  const newDoc: ResearchDocument = {
    id: docId,
    project_id: projectId,
    source_type: materialContent.includes("经营") || materialContent.includes("纪要") ? "qualitative_brief" : "annual_report",
    title: materialTitle,
    disclosure_date: now.split("T")[0],
    content: materialContent,
    added_at: now,
    evidence_snippets: evidenceSnippets,
  };
  project.documents.push(newDoc);

  // 2. Update theses based on deltas & userRevisions
  for (const delta of deltas) {
    const existing = project.theses.find((t) => t.id === delta.thesis_id);
    if (existing) {
      existing.current_status = delta.new_status;
      existing.current_reason = delta.reason;
      if (userRevisions && userRevisions[delta.thesis_id]) {
        existing.user_revision = userRevisions[delta.thesis_id];
      }
      existing.updated_at = now;
      if (delta.evidence_ids && delta.evidence_ids.length > 0) {
        existing.citations = Array.from(new Set([...existing.citations, ...delta.evidence_ids]));
      }
    }
  }

  // 3. Update questions (stable IDs)
  for (const q of questions) {
    const idx = project.open_questions.findIndex((item) => item.id === q.id);
    if (idx >= 0) {
      project.open_questions[idx] = { ...project.open_questions[idx], ...q, updated_at: now };
    } else {
      // Ensure cross-project collision-free ID
      const stableQId = q.id && !project.open_questions.some((item) => item.id === q.id)
        ? q.id
        : `${projectId}_Q${String(project.open_questions.length + 1).padStart(2, "0")}`;
      project.open_questions.push({ ...q, id: stableQId, updated_at: now });
    }
  }

  // 4. Record research update
  const updateRecord: ResearchUpdate = {
    id: `UPDATE_${projectId}_${newVersion}_${Date.now().toString(36)}`,
    project_id: projectId,
    version: newVersion,
    parent_version: project.current_version,
    title: `${newVersion} ${materialTitle}`,
    material_id: docId,
    thesis_deltas: deltas,
    user_revisions: userRevisions,
    follow_up_questions: questions,
    confirmed_at: now,
    confirmed_by: "买方分析师",
    summary: `完成 ${newVersion} 更新，追踪观点 ${deltas.length} 项，留存/回答疑问 ${questions.length} 项。`,
  };
  project.updates.push(updateRecord);

  // 5. Bump version
  project.current_version = newVersion;
  project.updated_at = now;

  await saveFullProject(project);
  return project;
}

export async function addProjectQuestion(projectId: string, question: FollowUpQuestion): Promise<ProjectState> {
  const project = await getProjectById(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  const now = new Date().toISOString();
  const existingIdx = project.open_questions.findIndex((q) => q.id === question.id);
  if (existingIdx >= 0) {
    project.open_questions[existingIdx] = { ...question, updated_at: now };
  } else {
    project.open_questions.push({ ...question, updated_at: now });
  }
  project.updated_at = now;

  await saveFullProject(project);
  return project;
}

export async function updateProjectQuestion(
  projectId: string,
  questionId: string,
  updates: Partial<FollowUpQuestion>
): Promise<ProjectState> {
  const project = await getProjectById(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  const qIdx = project.open_questions.findIndex((q) => q.id === questionId);
  if (qIdx === -1) throw new Error(`Question ${questionId} not found`);

  const now = new Date().toISOString();
  project.open_questions[qIdx] = {
    ...project.open_questions[qIdx],
    ...updates,
    updated_at: now,
  };
  project.updated_at = now;

  await saveFullProject(project);
  return project;
}

export async function deleteProjectQuestion(projectId: string, questionId: string): Promise<ProjectState> {
  const project = await getProjectById(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  project.open_questions = project.open_questions.filter((q) => q.id !== questionId);
  project.updated_at = new Date().toISOString();

  await saveFullProject(project);
  return project;
}

