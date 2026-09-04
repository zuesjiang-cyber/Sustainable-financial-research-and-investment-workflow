import { createHash } from "crypto";
import { getDb, withTransaction } from "./db";
import { getInitialSbgProject } from "./seedData";
import { researchStateToken } from "./buildResearchContext";
import type {
  ProjectState,
  ResearchThesis,
  ResearchDocument,
  ResearchUpdate,
  FollowUpQuestion,
  ThesisDelta,
  ThesisStatus,
  ResearchClaim,
  ResearchToolTrace,
  ThesisRevision,
} from "../types/fintrust";
import type { Database } from "sql.js";

export interface ApplyResearchUpdateOptions {
  /** The server-created document and evidence snippets for this draft. */
  document?: ResearchDocument;
  /** Human-readable summary confirmed with the update. */
  summary?: string;
  /** Model output before user edits. */
  original_deltas?: ThesisDelta[];
  claims?: ResearchClaim[];
  tool_trace?: ResearchToolTrace[];
  /** Draft/request id used for exactly-once confirmation retries. */
  request_id?: string;
  /** Caller hash for detecting a reused request id with a changed payload. */
  payload_hash?: string;
  /** State token observed when the draft was generated. */
  expected_state_token?: string;
}

type ThesisUpdateFields = Partial<
  Pick<
    ResearchThesis,
    | "title"
    | "basis"
    | "current_view"
    | "current_reason"
    | "user_revision"
    | "verification_criteria"
    | "verification_timeframe"
    | "current_status"
  >
>;

const THESIS_UPDATE_FIELDS: Array<keyof ThesisUpdateFields> = [
  "title",
  "basis",
  "current_view",
  "current_reason",
  "user_revision",
  "verification_criteria",
  "verification_timeframe",
  "current_status",
];

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || value.length === 0) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch (_ignored) {
    return fallback;
  }
}

function queryRows(db: Database, sql: string, params: unknown[] = []): Array<Record<string, unknown>> {
  const statement = db.prepare(sql);
  try {
    statement.bind(params as any);
    const rows: Array<Record<string, unknown>> = [];
    while (statement.step()) rows.push(statement.getAsObject() as Record<string, unknown>);
    return rows;
  } finally {
    statement.free();
  }
}

function queryOne(db: Database, sql: string, params: unknown[] = []): Record<string, unknown> | null {
  const rows = queryRows(db, sql, params);
  return rows.length > 0 ? rows[0] : null;
}

function asString(value: unknown, fallback = ""): string {
  return value === null || value === undefined ? fallback : String(value);
}

function asOptionalString(value: unknown): string | undefined {
  return value === null || value === undefined ? undefined : String(value);
}

function makeConflict(message: string): Error & { statusCode: number } {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = 409;
  return error;
}

function nextVersionFor(currentVersion: string): string | null {
  const match = /^T(\d+)$/.exec(currentVersion);
  return match ? `T${Number(match[1]) + 1}` : null;
}

function cloneValue<T>(value: T): T {
  // The values persisted in this module are JSON-shaped. JSON cloning keeps
  // callers from observing mutations made while a transaction is assembled.
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => stableValue(item));
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return Object.keys(object)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = stableValue(object[key]);
        return result;
      }, {});
  }
  return value;
}

function hashPayload(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(stableValue(payload))).digest("hex");
}

function readProjectFromDb(db: Database, projectId: string): ProjectState | null {
  const projectRow = queryOne(db, "SELECT * FROM projects WHERE id = ?", [projectId]);
  if (!projectRow) return null;

  const thesisRows = queryRows(db, "SELECT * FROM theses WHERE project_id = ? ORDER BY id ASC", [projectId]);
  const theses: ResearchThesis[] = thesisRows.map((row) => ({
    id: asString(row.id),
    project_id: asString(row.project_id, projectId),
    title: asString(row.title),
    original_view: asString(row.original_view),
    formed_at: asString(row.formed_at),
    basis: asString(row.basis),
    verification_criteria: asString(row.conditions_json),
    verification_timeframe: asString(row.timeframe),
    current_status: asString(row.current_status, "待评估") as ThesisStatus,
    current_reason: asOptionalString(row.current_reason),
    current_view: asOptionalString(row.current_view),
    user_revision: asOptionalString(row.user_revision),
    revision_history: parseJson<ThesisRevision[]>(row.revision_history_json, []),
    citations: parseJson<string[]>(row.citations_json, []),
    updated_at: asString(row.updated_at),
  }));

  const documentRows = queryRows(db, "SELECT * FROM documents WHERE project_id = ? ORDER BY added_at ASC, id ASC", [projectId]);
  const documents: ResearchDocument[] = documentRows.map((row) => ({
    id: asString(row.id),
    project_id: asString(row.project_id, projectId),
    source_type: asString(row.source_type, "notes") as ResearchDocument["source_type"],
    title: asString(row.title),
    disclosure_date: asString(row.disclosure_date),
    content: asString(row.content),
    added_at: asString(row.added_at),
    evidence_snippets: parseJson<ResearchDocument["evidence_snippets"]>(row.evidence_snippets_json, []),
  }));

  const updateRows = queryRows(
    db,
    "SELECT * FROM research_updates WHERE project_id = ? ORDER BY confirmed_at ASC, id ASC",
    [projectId]
  );
  const updates: ResearchUpdate[] = updateRows.map((row) => ({
    id: asString(row.id),
    project_id: asString(row.project_id, projectId),
    version: asString(row.version),
    parent_version: row.parent_version ? asString(row.parent_version) : null,
    title: asString(row.title),
    material_id: asString(row.material_id),
    thesis_deltas: parseJson<ThesisDelta[]>(row.thesis_deltas_json, []),
    user_revisions: parseJson<Record<string, string>>(row.user_revisions_json, {}),
    follow_up_questions: parseJson<FollowUpQuestion[]>(row.follow_up_questions_json, []),
    confirmed_at: asString(row.confirmed_at),
    confirmed_by: asString(row.confirmed_by),
    // Old databases did not have summary; title is the closest faithful fallback.
    summary: asString(row.summary, asString(row.title)),
    original_deltas: parseJson<ThesisDelta[]>(row.original_deltas_json, parseJson<ThesisDelta[]>(row.thesis_deltas_json, [])),
    claims: parseJson<ResearchClaim[]>(row.claims_json, []),
    tool_trace: parseJson<ResearchToolTrace[]>(row.tool_trace_json, []),
    request_id: asOptionalString(row.request_id),
    payload_hash: asOptionalString(row.payload_hash),
  }));

  const questionRows = queryRows(
    db,
    "SELECT * FROM questions WHERE project_id = ? ORDER BY updated_at DESC, id ASC",
    [projectId]
  );
  const openQuestions: FollowUpQuestion[] = questionRows.map((row) => ({
    id: asString(row.id),
    question_text: asString(row.question_text),
    status: asString(row.status, "未解决") as FollowUpQuestion["status"],
    created_in_version: asString(row.created_in_version),
    resolved_in_version: row.resolved_in_version ? asString(row.resolved_in_version) : null,
    answer_notes: asString(row.answer_notes),
    updated_at: asString(row.updated_at),
    evidence_ids: parseJson<string[]>(row.evidence_ids_json, []),
  }));

  return {
    id: asString(projectRow.id),
    name: asString(projectRow.name),
    company: asString(projectRow.company),
    ticker: asString(projectRow.ticker),
    current_version: asString(projectRow.current_version, "T0"),
    status: asString(projectRow.status, "active") as ProjectState["status"],
    summary: asString(projectRow.summary),
    created_at: asString(projectRow.created_at),
    updated_at: asString(projectRow.updated_at),
    theses,
    documents,
    updates,
    open_questions: openQuestions,
  };
}

function allEvidenceIds(project: ProjectState): Set<string> {
  const ids = new Set<string>();
  for (const document of project.documents || []) {
    for (const snippet of document.evidence_snippets || []) {
      if (snippet.id) ids.add(snippet.id);
    }
  }
  return ids;
}

function filterEvidenceIds(ids: unknown, allowed: Set<string>): string[] {
  if (!Array.isArray(ids)) return [];
  return ids.map(String).filter((id, index, values) => allowed.has(id) && values.indexOf(id) === index);
}

function copyDelta(delta: ThesisDelta, allowedEvidence: Set<string>): ThesisDelta {
  const gap = delta.gap_explanation || ({} as ThesisDelta["gap_explanation"]);
  return {
    ...cloneValue(delta),
    evidence_ids: filterEvidenceIds(delta.evidence_ids, allowedEvidence),
    gap_explanation: {
      observed: asString(gap.observed),
      disclosed_reason: asString(gap.disclosed_reason),
      unverified_hypotheses: asString(gap.unverified_hypotheses),
    },
  };
}

function copyClaim(claim: ResearchClaim, allowedEvidence: Set<string>): ResearchClaim {
  return {
    ...cloneValue(claim),
    evidence_ids: filterEvidenceIds(claim.evidence_ids, allowedEvidence),
  };
}

function documentEquivalent(left: ResearchDocument, right: ResearchDocument): boolean {
  return (
    left.project_id === right.project_id &&
    left.title === right.title &&
    left.disclosure_date === right.disclosure_date &&
    left.content === right.content &&
    JSON.stringify(left.evidence_snippets || []) === JSON.stringify(right.evidence_snippets || [])
  );
}

function makeDocumentId(project: ProjectState, version: string, materialTitle: string, materialContent: string): string {
  const digest = hashPayload({ project: project.id, version, materialTitle, materialContent }).slice(0, 16);
  let id = `DOC_${project.id}_${version}_${digest}`;
  let suffix = 2;
  while (project.documents.some((document) => document.id === id)) {
    id = `DOC_${project.id}_${version}_${digest}_${suffix++}`;
  }
  return id;
}

function makeQuestionId(projectId: string, questions: FollowUpQuestion[]): string {
  const existing = new Set(questions.map((question) => question.id));
  let index = 1;
  let candidate = `${projectId}_Q${String(index).padStart(2, "0")}`;
  while (existing.has(candidate)) {
    index += 1;
    candidate = `${projectId}_Q${String(index).padStart(2, "0")}`;
  }
  return candidate;
}

function normalizeQuestionId(projectId: string, questions: FollowUpQuestion[], requestedId: unknown): string {
  const id = typeof requestedId === "string" ? requestedId.trim() : "";
  return id || makeQuestionId(projectId, questions);
}

function copyQuestion(
  question: FollowUpQuestion,
  project: ProjectState,
  version: string,
  now: string,
  allowedEvidence: Set<string>,
  existing?: FollowUpQuestion
): FollowUpQuestion {
  const status = question.status || existing?.status || "未解决";
  const answerNotes =
    typeof question.answer_notes === "string" && question.answer_notes.trim().length > 0
      ? question.answer_notes
      : existing?.answer_notes || "";
  const resolvedVersion =
    status === "已解决"
      ? question.resolved_in_version || existing?.resolved_in_version || version
      : question.resolved_in_version || null;
  const evidence = filterEvidenceIds(question.evidence_ids, allowedEvidence);
  return {
    ...(existing || {}),
    ...cloneValue(question),
    id: question.id,
    status,
    created_in_version: question.created_in_version || existing?.created_in_version || version,
    resolved_in_version: resolvedVersion,
    // A later model round may omit notes or send an empty default. Do not erase
    // a confirmed answer; direct updateProjectQuestion remains the explicit way
    // to clear it.
    answer_notes: answerNotes,
    evidence_ids:
      evidence.length > 0
        ? Array.from(new Set([...(existing?.evidence_ids || []), ...evidence])).filter((id) => allowedEvidence.has(id))
        : (existing?.evidence_ids || []).filter((id) => allowedEvidence.has(id)),
    updated_at: now,
  };
}

function normalizeQuestionsForStorage(projectId: string, questions: FollowUpQuestion[]): FollowUpQuestion[] {
  const result: FollowUpQuestion[] = [];
  const seen = new Set<string>();
  for (const input of questions || []) {
    let id = normalizeQuestionId(projectId, result, input?.id);
    while (seen.has(id)) id = makeQuestionId(projectId, result);
    seen.add(id);
    result.push({ ...cloneValue(input), id });
  }
  return result;
}

function writeProjectToDb(db: Database, project: ProjectState): void {
  db.run(
    `INSERT OR REPLACE INTO projects
      (id, name, company, ticker, current_version, status, summary, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      project.id,
      project.name,
      project.company,
      project.ticker,
      project.current_version,
      project.status,
      project.summary || "",
      project.created_at,
      project.updated_at,
    ]
  );

  db.run("DELETE FROM documents WHERE project_id = ?", [project.id]);
  for (const document of project.documents || []) {
    db.run(
      `INSERT INTO documents
        (id, project_id, source_type, title, disclosure_date, content, added_at, evidence_snippets_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        document.id,
        project.id,
        document.source_type,
        document.title,
        document.disclosure_date,
        document.content,
        document.added_at,
        JSON.stringify(document.evidence_snippets || []),
      ]
    );
  }

  db.run("DELETE FROM theses WHERE project_id = ?", [project.id]);
  for (const thesis of project.theses || []) {
    db.run(
      `INSERT INTO theses
        (id, project_id, title, original_view, formed_at, basis, conditions_json, timeframe,
         current_status, citations_json, updated_at, current_reason, user_revision, current_view, revision_history_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        thesis.id,
        project.id,
        thesis.title,
        thesis.original_view,
        thesis.formed_at,
        thesis.basis,
        thesis.verification_criteria,
        thesis.verification_timeframe,
        thesis.current_status,
        JSON.stringify(thesis.citations || []),
        thesis.updated_at,
        thesis.current_reason ?? null,
        thesis.user_revision ?? null,
        thesis.current_view ?? null,
        JSON.stringify(thesis.revision_history || []),
      ]
    );
  }

  db.run("DELETE FROM research_updates WHERE project_id = ?", [project.id]);
  for (const update of project.updates || []) {
    db.run(
      `INSERT INTO research_updates
        (id, project_id, version, parent_version, title, material_id, thesis_deltas_json,
         user_revisions_json, follow_up_questions_json, confirmed_at, confirmed_by, summary,
         original_deltas_json, claims_json, tool_trace_json, request_id, payload_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        update.id,
        project.id,
        update.version,
        update.parent_version || "",
        update.title,
        update.material_id,
        JSON.stringify(update.thesis_deltas || []),
        JSON.stringify(update.user_revisions || {}),
        JSON.stringify(update.follow_up_questions || []),
        update.confirmed_at,
        update.confirmed_by,
        update.summary ?? update.title,
        JSON.stringify(update.original_deltas ?? update.thesis_deltas ?? []),
        JSON.stringify(update.claims || []),
        JSON.stringify(update.tool_trace || []),
        update.request_id ?? null,
        update.payload_hash ?? null,
      ]
    );
  }

  db.run("DELETE FROM questions WHERE project_id = ?", [project.id]);
  const questions = normalizeQuestionsForStorage(project.id, project.open_questions || []);
  for (const question of questions) {
    db.run(
      `INSERT INTO questions
        (id, project_id, question_text, status, created_in_version, resolved_in_version,
         answer_notes, updated_at, evidence_ids_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        question.id,
        project.id,
        question.question_text,
        question.status,
        question.created_in_version,
        question.resolved_in_version || null,
        question.answer_notes || "",
        question.updated_at,
        JSON.stringify(question.evidence_ids || []),
      ]
    );
  }
}

export async function initProjects(): Promise<void> {
  const db = await getDb();
  const countRow = queryOne(db, "SELECT COUNT(*) AS cnt FROM projects");
  const count = Number(countRow?.cnt || 0);
  if (count === 0) {
    console.log("Seeding initial research project into SQLite...");
    await saveFullProject(getInitialSbgProject());
  }
}

export async function getAllProjects(): Promise<
  Array<{
    id: string;
    name: string;
    company: string;
    ticker: string;
    current_version: string;
    status: string;
    summary: string;
    updated_at: string;
  }>
> {
  const db = await getDb();
  const rows = queryRows(
    db,
    "SELECT id, name, company, ticker, current_version, status, summary, updated_at FROM projects ORDER BY updated_at DESC, id ASC"
  );
  return rows.map((row) => ({
    id: asString(row.id),
    name: asString(row.name),
    company: asString(row.company),
    ticker: asString(row.ticker),
    current_version: asString(row.current_version),
    status: asString(row.status),
    summary: asString(row.summary),
    updated_at: asString(row.updated_at),
  }));
}

export async function getProjectById(projectId: string): Promise<ProjectState | null> {
  const db = await getDb();
  return readProjectFromDb(db, projectId);
}

export async function saveFullProject(project: ProjectState): Promise<void> {
  await withTransaction((db) => {
    writeProjectToDb(db, project);
  });
}

function applyPayloadForHash(
  projectId: string,
  newVersion: string,
  parentVersion: string | undefined | null,
  materialTitle: string,
  materialContent: string,
  deltas: ThesisDelta[],
  userRevisions: Record<string, string>,
  questions: FollowUpQuestion[],
  evidenceSnippets: Array<{ id: string; page: number | null; text: string; section?: string; line_start?: number; line_end?: number }>,
  options?: ApplyResearchUpdateOptions
): unknown {
  return {
    project_id: projectId,
    new_version: newVersion,
    parent_version: parentVersion ?? null,
    material_title: materialTitle,
    material_content: materialContent,
    deltas,
    user_revisions: userRevisions,
    questions,
    evidence_snippets: evidenceSnippets,
    document: options?.document ?? null,
    summary: options?.summary,
    original_deltas: options?.original_deltas,
    claims: options?.claims,
    tool_trace: options?.tool_trace,
  };
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
  evidenceSnippets: Array<{ id: string; page: number | null; text: string; section?: string; line_start?: number; line_end?: number }> = [],
  options?: ApplyResearchUpdateOptions
): Promise<ProjectState> {
  const incomingDeltas = Array.isArray(deltas) ? deltas : [];
  const incomingRevisions = userRevisions || {};
  const incomingQuestions = Array.isArray(questions) ? questions : [];
  const incomingSnippets = evidenceSnippets || [];
  const requestId = options?.request_id || undefined;

  return withTransaction((db) => {
    // Read request idempotency before checking state token or parent version.
    // A retry should remain idempotent even after later research has advanced.
    let payloadHash = options?.payload_hash;
    if (requestId && !payloadHash) {
      payloadHash = hashPayload(
        applyPayloadForHash(
          projectId,
          newVersion,
          parentVersion,
          materialTitle,
          materialContent,
          incomingDeltas,
          incomingRevisions,
          incomingQuestions,
          incomingSnippets,
          options
        )
      );
    }

    if (requestId) {
      const existingRequest = queryOne(
        db,
        "SELECT payload_hash FROM research_updates WHERE project_id = ? AND request_id = ? ORDER BY confirmed_at DESC, id DESC LIMIT 1",
        [projectId, requestId]
      );
      if (existingRequest) {
        const existingHash = asOptionalString(existingRequest.payload_hash);
        if (existingHash && payloadHash && existingHash === payloadHash) {
          const current = readProjectFromDb(db, projectId);
          if (!current) throw new Error(`Project ${projectId} not found`);
          return current;
        }
        if (!existingHash && !payloadHash) {
          const current = readProjectFromDb(db, projectId);
          if (!current) throw new Error(`Project ${projectId} not found`);
          return current;
        }
        throw makeConflict(`Request id '${requestId}' was already confirmed with a different payload`);
      }
    }

    const project = readProjectFromDb(db, projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);

    const existingVersionUpdate = project.updates.find((update) => update.version === newVersion);
    if (project.current_version === newVersion && existingVersionUpdate) {
      // Preserve the original positional API's duplicate-version behavior.
      // New callers should supply request_id, which gives payload-level conflict
      // detection above.
      if (!requestId) return project;
      throw makeConflict(`Version '${newVersion}' is already confirmed for project ${projectId}`);
    }

    const expectedNext = nextVersionFor(project.current_version);
    if (expectedNext && newVersion !== expectedNext) {
      throw makeConflict(`Version conflict: next version after '${project.current_version}' must be '${expectedNext}'`);
    }
    if (parentVersion !== undefined && parentVersion !== null && project.current_version !== parentVersion) {
      throw makeConflict(
        `Version mismatch conflict: Expected parent version '${parentVersion}', but current version is '${project.current_version}'`
      );
    }
    if (options?.expected_state_token) {
      const actualToken = researchStateToken(project);
      if (actualToken !== options.expected_state_token) {
        throw makeConflict(
          `State token mismatch: expected '${options.expected_state_token}', current state is '${actualToken}'`
        );
      }
    }

    const now = new Date().toISOString();
    const suppliedDocument = options?.document;
    if (suppliedDocument && suppliedDocument.project_id && suppliedDocument.project_id !== projectId) {
      throw new Error(`Document ${suppliedDocument.id} belongs to a different project`);
    }
    const document: ResearchDocument = suppliedDocument
      ? {
          ...cloneValue(suppliedDocument),
          project_id: projectId,
          evidence_snippets: cloneValue(suppliedDocument.evidence_snippets || []),
        }
      : {
          id: makeDocumentId(project, newVersion, materialTitle, materialContent),
          project_id: projectId,
          source_type:
            materialContent.includes("经营") || materialContent.includes("纪要") ? "qualitative_brief" : "annual_report",
          title: materialTitle,
          disclosure_date: now.split("T")[0],
          content: materialContent,
          added_at: now,
          evidence_snippets: cloneValue(incomingSnippets),
        };

    const existingDocument = project.documents.find((item) => item.id === document.id);
    if (existingDocument) {
      if (!documentEquivalent(existingDocument, document)) {
        throw makeConflict(`Document '${document.id}' already exists with different content`);
      }
    } else {
      project.documents.push(document);
    }

    const allowedEvidence = allEvidenceIds(project);
    const confirmedDeltas = incomingDeltas.map((delta) => copyDelta(delta, allowedEvidence));
    const originalDeltas = (options?.original_deltas || incomingDeltas).map((delta) => copyDelta(delta, allowedEvidence));
    const claims = (options?.claims || []).map((claim) => copyClaim(claim, allowedEvidence));
    const toolTrace = cloneValue(options?.tool_trace || []);

    const modelDeltaByThesis = new Map((options?.original_deltas || incomingDeltas).map((delta) => [delta.thesis_id, delta]));

    // Apply model-confirmed deltas while preserving the immutable original_view.
    // Empty/missing userRevisions keys are intentionally no-ops: only an
    // explicitly supplied key (including "") can change/clear a correction.
    const revisionsAppliedByDelta = new Set<string>();
    for (const delta of confirmedDeltas) {
      const thesis = project.theses.find((item) => item.id === delta.thesis_id);
      if (!thesis) continue;
      const revisionChanges: ThesisRevision["changes"] = {};
      const modelDelta = modelDeltaByThesis.get(delta.thesis_id);
      const manuallyEdited = Boolean(
        modelDelta &&
          (modelDelta.reason !== delta.reason ||
            modelDelta.new_status !== delta.new_status ||
            modelDelta.current_view !== delta.current_view)
      );
      // An unresolved/unchanged round with no usable evidence is still useful
      // history, but its generic reason must not replace the last confirmed
      // basis. A user-edited delta is an explicit exception.
      const noEvidenceRound =
        delta.evidence_ids.length === 0 &&
        (delta.round_assessment === "unresolved" ||
          delta.round_assessment === "unchanged" ||
          delta.new_status === "不足以判断");
      const explicitUserRevision = Object.prototype.hasOwnProperty.call(incomingRevisions, thesis.id);

      if ((!noEvidenceRound || manuallyEdited || explicitUserRevision) && delta.new_status && thesis.current_status !== delta.new_status) {
        thesis.current_status = delta.new_status;
        revisionChanges.current_status = delta.new_status;
      }
      if (
        (!noEvidenceRound || manuallyEdited || explicitUserRevision) &&
        typeof delta.reason === "string" &&
        delta.reason.trim().length > 0 &&
        thesis.current_reason !== delta.reason
      ) {
        thesis.current_reason = delta.reason;
        revisionChanges.current_reason = delta.reason;
      }
      if (
        Object.prototype.hasOwnProperty.call(delta, "current_view") &&
        delta.current_view !== undefined &&
        (!noEvidenceRound || manuallyEdited || explicitUserRevision)
      ) {
        if (thesis.current_view !== delta.current_view) {
          thesis.current_view = delta.current_view;
          revisionChanges.current_view = delta.current_view;
        }
      }
      if (Object.prototype.hasOwnProperty.call(incomingRevisions, thesis.id)) {
        const value = incomingRevisions[thesis.id];
        if (typeof value === "string" && thesis.user_revision !== value) {
          thesis.user_revision = value;
          revisionChanges.user_revision = value;
          revisionsAppliedByDelta.add(thesis.id);
        }
      }
      const newCitationIds = filterEvidenceIds(delta.evidence_ids, allowedEvidence);
      thesis.citations = Array.from(new Set([...(thesis.citations || []), ...newCitationIds]));
      if (Object.keys(revisionChanges).length > 0) {
        const revision: ThesisRevision = { at: now, version: newVersion, changes: revisionChanges };
        thesis.revision_history = [...(thesis.revision_history || []), revision];
      }
      thesis.updated_at = now;
    }

    // A caller may submit a correction for a thesis without a model delta
    // (the HTTP route normally includes every thesis, but the positional API
    // predates that requirement). Apply it without losing the correction.
    for (const [thesisId, value] of Object.entries(incomingRevisions)) {
      if (revisionsAppliedByDelta.has(thesisId) || typeof value !== "string") continue;
      const thesis = project.theses.find((item) => item.id === thesisId);
      if (!thesis || thesis.user_revision === value) continue;
      thesis.user_revision = value;
      thesis.revision_history = [
        ...(thesis.revision_history || []),
        { at: now, version: newVersion, changes: { user_revision: value } },
      ];
      thesis.updated_at = now;
    }

    const normalizedQuestions: FollowUpQuestion[] = [];
    for (const rawQuestion of incomingQuestions) {
      const existing = project.open_questions.find((item) => item.id === rawQuestion.id);
      const id = existing ? existing.id : normalizeQuestionId(projectId, [...project.open_questions, ...normalizedQuestions], rawQuestion.id);
      const question = copyQuestion(
        { ...cloneValue(rawQuestion), id },
        project,
        newVersion,
        now,
        allowedEvidence,
        existing
      );
      const existingIndex = project.open_questions.findIndex((item) => item.id === id);
      if (existingIndex >= 0) project.open_questions[existingIndex] = question;
      else project.open_questions.push(question);
      normalizedQuestions.push(question);
    }

    if (options?.summary !== undefined) project.summary = options.summary;
    const updateRecord: ResearchUpdate = {
      id: `UPDATE_${project.id}_${newVersion}_${Date.now().toString(36)}_${hashPayload({ now, requestId }).slice(0, 8)}`,
      project_id: project.id,
      version: newVersion,
      parent_version: project.current_version,
      title: `${newVersion} ${document.title}`,
      material_id: document.id,
      thesis_deltas: confirmedDeltas,
      user_revisions: cloneValue(incomingRevisions),
      follow_up_questions: normalizedQuestions,
      confirmed_at: now,
      confirmed_by: "买方分析师",
      summary:
        options?.summary ??
        `完成 ${newVersion} 更新，追踪观点 ${confirmedDeltas.length} 项，留存/回答疑问 ${normalizedQuestions.length} 项。`,
      original_deltas: originalDeltas,
      claims,
      tool_trace: toolTrace,
      request_id: requestId,
      payload_hash: requestId ? payloadHash : options?.payload_hash,
    };
    project.updates.push(updateRecord);
    project.current_version = newVersion;
    project.updated_at = now;

    writeProjectToDb(db, project);
    const updated = readProjectFromDb(db, projectId);
    if (!updated) throw new Error(`Project ${projectId} disappeared during update`);
    return updated;
  });
}

export async function updateResearchThesis(
  projectId: string,
  thesisId: string,
  updates: ThesisUpdateFields
): Promise<ProjectState> {
  return withTransaction((db) => {
    const project = readProjectFromDb(db, projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);
    const thesis = project.theses.find((item) => item.id === thesisId);
    if (!thesis) throw new Error(`Thesis ${thesisId} not found`);

    const changes: ThesisRevision["changes"] = {};
    for (const field of THESIS_UPDATE_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(updates || {}, field)) continue;
      const value = updates[field];
      if (value === undefined) continue;
      if (thesis[field] !== value) {
        (thesis as any)[field] = value;
        // title and basis are editable metadata but older ThesisRevision
        // typings intentionally only model judgment changes. Keep the runtime
        // history useful when a newer shared type includes those fields.
        (changes as any)[field] = value;
      }
    }

    const now = new Date().toISOString();
    if (Object.keys(changes).length > 0) {
      thesis.revision_history = [
        ...(thesis.revision_history || []),
        { at: now, version: project.current_version, changes },
      ];
    }
    thesis.updated_at = now;
    project.updated_at = now;
    writeProjectToDb(db, project);
    const updated = readProjectFromDb(db, projectId);
    if (!updated) throw new Error(`Project ${projectId} disappeared during thesis update`);
    return updated;
  });
}

export async function addProjectQuestion(projectId: string, question: FollowUpQuestion): Promise<ProjectState> {
  return withTransaction((db) => {
    const project = readProjectFromDb(db, projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);
    const now = new Date().toISOString();
    const allowedEvidence = allEvidenceIds(project);
    const existing = project.open_questions.find((item) => item.id === question.id);
    const id = existing ? existing.id : normalizeQuestionId(projectId, project.open_questions, question.id);
    const nextQuestion = copyQuestion(
      { ...cloneValue(question), id },
      project,
      project.current_version,
      now,
      allowedEvidence,
      existing
    );
    if (existing) {
      const index = project.open_questions.findIndex((item) => item.id === existing.id);
      project.open_questions[index] = nextQuestion;
    } else {
      project.open_questions.push(nextQuestion);
    }
    project.updated_at = now;
    writeProjectToDb(db, project);
    const updated = readProjectFromDb(db, projectId);
    if (!updated) throw new Error(`Project ${projectId} disappeared while adding question`);
    return updated;
  });
}

export async function updateProjectQuestion(
  projectId: string,
  questionId: string,
  updates: Partial<FollowUpQuestion>
): Promise<ProjectState> {
  return withTransaction((db) => {
    const project = readProjectFromDb(db, projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);
    const index = project.open_questions.findIndex((question) => question.id === questionId);
    if (index === -1) throw new Error(`Question ${questionId} not found`);

    const now = new Date().toISOString();
    const allowedEvidence = allEvidenceIds(project);
    const current = project.open_questions[index];
    const { id: _ignoredId, ...safeUpdates } = updates || {};
    const merged = { ...current, ...cloneValue(safeUpdates), id: current.id } as FollowUpQuestion;
    merged.evidence_ids = filterEvidenceIds(merged.evidence_ids, allowedEvidence);
    merged.updated_at = now;
    project.open_questions[index] = merged;
    project.updated_at = now;
    writeProjectToDb(db, project);
    const updated = readProjectFromDb(db, projectId);
    if (!updated) throw new Error(`Project ${projectId} disappeared while updating question`);
    return updated;
  });
}

export async function deleteProjectQuestion(projectId: string, questionId: string): Promise<ProjectState> {
  return withTransaction((db) => {
    const project = readProjectFromDb(db, projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);
    project.open_questions = project.open_questions.filter((question) => question.id !== questionId);
    project.updated_at = new Date().toISOString();
    writeProjectToDb(db, project);
    const updated = readProjectFromDb(db, projectId);
    if (!updated) throw new Error(`Project ${projectId} disappeared while deleting question`);
    return updated;
  });
}
