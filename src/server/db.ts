import initSqlJs, { Database } from "sql.js";
import fs from "fs";
import path from "path";

export interface ProjectRecord {
  id: string;
  name: string;
  company: string;
  ticker: string;
  current_version: string;
  status: string;
  summary: string;
  created_at: string;
  updated_at: string;
}

export interface DocumentRecord {
  id: string;
  project_id: string;
  source_type: string;
  title: string;
  disclosure_date: string;
  content: string;
  added_at: string;
  evidence_snippets_json: string;
}

export interface ThesisRecord {
  id: string;
  project_id: string;
  title: string;
  original_view: string;
  formed_at: string;
  basis: string;
  conditions_json: string;
  timeframe: string;
  current_status: string;
  citations_json: string;
  updated_at: string;
  current_reason?: string;
  current_view?: string;
  user_revision?: string;
  revision_history_json?: string;
}

export interface ResearchUpdateRecord {
  id: string;
  project_id: string;
  version: string;
  parent_version: string;
  title: string;
  material_id: string;
  thesis_deltas_json: string;
  user_revisions_json: string;
  follow_up_questions_json: string;
  confirmed_at: string;
  confirmed_by: string;
  summary?: string;
  original_deltas_json?: string;
  claims_json?: string;
  tool_trace_json?: string;
  request_id?: string;
  payload_hash?: string;
}

export interface QuestionRecord {
  id: string;
  project_id: string;
  question_text: string;
  status: "未解决" | "部分解决" | "已解决";
  created_in_version: string;
  resolved_in_version: string | null;
  answer_notes: string;
  updated_at: string;
  evidence_ids_json?: string;
}

/*
 * Keep the data directory configurable at runtime. Reading the environment
 * here (instead of once at module load) makes isolated node:test processes and
 * temporary FINTRUST_DATA_DIR directories work without touching the checked-in
 * showcase database.
 */
const DEFAULT_DATA_DIR = path.resolve(process.cwd(), "data");
let dbInstance: Database | null = null;
let dbDataDir: string | null = null;
let sqlModule: { Database: new (data?: ArrayLike<number>) => Database } | null = null;
let initPromise: Promise<Database> | null = null;

// Every logical read-check-write operation is queued behind the previous one.
// sql.js is in-memory and JavaScript callbacks can yield between reads and
// writes, so a database transaction alone is not sufficient for this guard.
let writeQueue: Promise<void> = Promise.resolve();

export function getDataDir(): string {
  const configured = process.env.FINTRUST_DATA_DIR?.trim();
  return path.resolve(configured || DEFAULT_DATA_DIR);
}

export function getDbFilePath(): string {
  return path.join(getDataDir(), "fintrust.sqlite");
}

async function initializeDb(targetDir: string): Promise<Database> {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const SQL = sqlModule || ((await initSqlJs()) as unknown as { Database: new (data?: ArrayLike<number>) => Database });
  sqlModule = SQL;

  const dbFile = path.join(targetDir, "fintrust.sqlite");
  let nextDb: Database;
  if (fs.existsSync(dbFile)) {
    nextDb = new SQL.Database(fs.readFileSync(dbFile));
  } else {
    nextDb = new SQL.Database();
  }

  try {
    initSchema(nextDb);
    dbInstance = nextDb;
    dbDataDir = targetDir;
    // Persist migrations and an empty schema immediately. This is outside a
    // user mutation, so a startup failure simply prevents the database from
    // being exposed to callers.
    saveDbToDisk();
    return nextDb;
  } catch (err) {
    try {
      nextDb.close();
    } catch (_ignored) {
      // Keep the original initialization error.
    }
    dbInstance = null;
    dbDataDir = null;
    throw err;
  }
}

export async function getDb(requestedDir?: string): Promise<Database> {
  const targetDir = path.resolve(requestedDir || getDataDir());
  if (dbInstance && dbDataDir === targetDir) return dbInstance;

  // Runtime changes of FINTRUST_DATA_DIR are primarily useful in tests. Close
  // the previous in-memory database before opening the requested directory so
  // a test cannot accidentally read one fixture and write another.
  if (dbInstance && dbDataDir !== targetDir) {
    try {
      dbInstance.close();
    } catch (_ignored) {}
    dbInstance = null;
    dbDataDir = null;
  }

  if (!initPromise) {
    initPromise = initializeDb(targetDir);
  }
  try {
    return await initPromise;
  } finally {
    initPromise = null;
  }
}

function persistBytes(buffer: Buffer, targetDir: string): void {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const dbFile = path.join(targetDir, "fintrust.sqlite");
  // Write in the same directory and rename atomically. A failed write or
  // rename leaves the previous database file untouched.
  const tempFile = path.join(
    targetDir,
    `.fintrust.sqlite.tmp-${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  );
  try {
    fs.writeFileSync(tempFile, buffer);
    fs.renameSync(tempFile, dbFile);
  } catch (err) {
    try {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    } catch (_ignored) {}
    throw err;
  }
}

export function saveDbToDisk(): void {
  if (!dbInstance) return;
  try {
    const data = dbInstance.export();
    const buffer = Buffer.from(data);
    persistBytes(buffer, dbDataDir || getDataDir());
  } catch (err: any) {
    console.error("Failed to persist database to disk:", err);
    throw new Error(`Database disk persistence failure: ${String(err?.message || err)}`);
  }
}

function restoreDatabase(snapshot: Uint8Array): void {
  if (!sqlModule) throw new Error("SQL.js runtime is not initialized");
  const oldDb = dbInstance;
  // Reconstructing from the pre-transaction bytes is the only reliable way to
  // restore sql.js after COMMIT has succeeded but disk persistence failed.
  const restored = new sqlModule.Database(snapshot);
  dbInstance = restored;
  if (oldDb && oldDb !== restored) {
    try {
      oldDb.close();
    } catch (_ignored) {}
  }
}

async function executeTransaction<T>(callback: (db: Database) => Promise<T> | T, targetDir = getDataDir()): Promise<T> {
  const db = await getDb(targetDir);
  const snapshot = new Uint8Array(db.export());
  let committed = false;

  try {
    db.run("BEGIN TRANSACTION;");
    const result = await callback(db);
    db.run("COMMIT;");
    committed = true;
    try {
      saveDbToDisk();
    } catch (err) {
      // The disk still contains the previous file because saveDbToDisk uses a
      // temp-file + rename. Restore memory too, keeping state atomic to callers.
      try {
        restoreDatabase(snapshot);
      } catch (restoreErr) {
        console.error("Failed to restore in-memory database after disk failure:", restoreErr);
      }
      throw err;
    }
    return result;
  } catch (err) {
    if (!committed) {
      try {
        db.run("ROLLBACK;");
      } catch (rollbackErr) {
        console.error("Transaction rollback error:", rollbackErr);
      }
      // Rollback normally suffices, but restoring the exact bytes also handles
      // callbacks which used a savepoint or otherwise changed transaction state.
      try {
        restoreDatabase(snapshot);
      } catch (restoreErr) {
        console.error("Failed to restore in-memory database after rollback:", restoreErr);
      }
    }
    throw err;
  }
}

export function withTransaction<T>(callback: (db: Database) => Promise<T> | T, targetDir = getDataDir()): Promise<T> {
  const operation = writeQueue.then(() => executeTransaction(callback, path.resolve(targetDir)));
  // A rejected operation must not permanently poison the queue.
  writeQueue = operation.then(
    () => undefined,
    () => undefined
  );
  return operation;
}

function tableInfo(db: Database, table: string): Array<{ name: string; pk: number }> {
  const result = db.exec(`PRAGMA table_info(${table})`);
  if (result.length === 0) return [];
  const columns = result[0].columns;
  return result[0].values.map((row) => {
    const object: Record<string, unknown> = {};
    columns.forEach((column, index) => {
      object[column] = row[index];
    });
    return { name: String(object.name), pk: Number(object.pk || 0) };
  });
}

function ensureColumn(db: Database, table: string, column: string, declaration: string): void {
  const columns = new Set(tableInfo(db, table).map((item) => item.name));
  if (!columns.has(column)) {
    db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${declaration};`);
  }
}

function migrateQuestionsPrimaryKey(db: Database): void {
  const info = tableInfo(db, "questions");
  const id = info.find((item) => item.name === "id");
  const projectId = info.find((item) => item.name === "project_id");
  // Databases created before the continuous-research work used id as a global
  // primary key. Preserve every imported id while allowing the same legacy id
  // in another project by migrating to a composite project-local key.
  if (!id || !projectId || id.pk === 0 || projectId.pk !== 0) return;

  const hasEvidenceIds = info.some((item) => item.name === "evidence_ids_json");
  const evidenceSelection = hasEvidenceIds ? "evidence_ids_json" : "NULL";

  db.run(`
    DROP TABLE IF EXISTS questions_migrated;
    CREATE TABLE questions_migrated (
      id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      question_text TEXT NOT NULL,
      status TEXT NOT NULL,
      created_in_version TEXT NOT NULL,
      resolved_in_version TEXT,
      answer_notes TEXT,
      updated_at TEXT NOT NULL,
      evidence_ids_json TEXT,
      PRIMARY KEY (project_id, id)
    );
    INSERT INTO questions_migrated
      (id, project_id, question_text, status, created_in_version, resolved_in_version, answer_notes, updated_at, evidence_ids_json)
      SELECT id, project_id, question_text, status, created_in_version, resolved_in_version, answer_notes, updated_at, ${evidenceSelection}
      FROM questions;
    DROP TABLE questions;
    ALTER TABLE questions_migrated RENAME TO questions;
  `);
}

function initSchema(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      company TEXT NOT NULL,
      ticker TEXT NOT NULL,
      current_version TEXT NOT NULL,
      status TEXT NOT NULL,
      summary TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      source_type TEXT NOT NULL,
      title TEXT NOT NULL,
      disclosure_date TEXT NOT NULL,
      content TEXT NOT NULL,
      added_at TEXT NOT NULL,
      evidence_snippets_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS theses (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      original_view TEXT NOT NULL,
      formed_at TEXT NOT NULL,
      basis TEXT NOT NULL,
      conditions_json TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      current_status TEXT NOT NULL,
      citations_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      current_reason TEXT,
      user_revision TEXT,
      current_view TEXT,
      revision_history_json TEXT
    );

    CREATE TABLE IF NOT EXISTS research_updates (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      version TEXT NOT NULL,
      parent_version TEXT NOT NULL,
      title TEXT NOT NULL,
      material_id TEXT NOT NULL,
      thesis_deltas_json TEXT NOT NULL,
      user_revisions_json TEXT NOT NULL,
      follow_up_questions_json TEXT NOT NULL,
      confirmed_at TEXT NOT NULL,
      confirmed_by TEXT NOT NULL,
      summary TEXT,
      original_deltas_json TEXT,
      claims_json TEXT,
      tool_trace_json TEXT,
      request_id TEXT,
      payload_hash TEXT
    );

    CREATE TABLE IF NOT EXISTS questions (
      id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      question_text TEXT NOT NULL,
      status TEXT NOT NULL,
      created_in_version TEXT NOT NULL,
      resolved_in_version TEXT,
      answer_notes TEXT,
      updated_at TEXT NOT NULL,
      evidence_ids_json TEXT,
      PRIMARY KEY (project_id, id)
    );

    -- V1 keeps its validated aggregate state as JSON, while the SQLite row
    -- provides one durable store and the same transaction/queue semantics as
    -- the legacy tables. This avoids a second JSON-file persistence layer.
    CREATE TABLE IF NOT EXISTS v1_projects (
      id TEXT PRIMARY KEY,
      record_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS v1_runs (
      id TEXT PRIMARY KEY,
      record_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  migrateQuestionsPrimaryKey(db);

  // Dynamic migrations keep checked-in and user-imported databases readable.
  ensureColumn(db, "theses", "current_reason", "TEXT");
  ensureColumn(db, "theses", "user_revision", "TEXT");
  ensureColumn(db, "theses", "current_view", "TEXT");
  ensureColumn(db, "theses", "revision_history_json", "TEXT");

  ensureColumn(db, "research_updates", "summary", "TEXT");
  ensureColumn(db, "research_updates", "original_deltas_json", "TEXT");
  ensureColumn(db, "research_updates", "claims_json", "TEXT");
  ensureColumn(db, "research_updates", "tool_trace_json", "TEXT");
  ensureColumn(db, "research_updates", "request_id", "TEXT");
  ensureColumn(db, "research_updates", "payload_hash", "TEXT");

  ensureColumn(db, "questions", "evidence_ids_json", "TEXT");

  // The partial index is an optimization and a second line of defence for
  // request idempotency. Old databases with duplicate request ids are still
  // usable; the application-level check remains authoritative.
  try {
    db.run(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_research_updates_project_request
      ON research_updates(project_id, request_id)
      WHERE request_id IS NOT NULL AND request_id <> '';
    `);
  } catch (_ignored) {}
}
