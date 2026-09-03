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
  user_revision?: string;
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
}

const DATA_DIR = path.resolve(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "fintrust.sqlite");
const BACKUP_JSON = path.join(DATA_DIR, "fintrust_snapshot.json");

let dbInstance: Database | null = null;

export async function getDb(): Promise<Database> {
  if (dbInstance) return dbInstance;

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const SQL = await initSqlJs();
  if (fs.existsSync(DB_FILE)) {
    const filebuffer = fs.readFileSync(DB_FILE);
    dbInstance = new SQL.Database(filebuffer);
  } else {
    dbInstance = new SQL.Database();
  }

  initSchema(dbInstance);
  saveDbToDisk();
  return dbInstance;
}

export function saveDbToDisk(): void {
  if (!dbInstance) return;
  try {
    const data = dbInstance.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_FILE, buffer);
  } catch (err) {
    console.error("Failed to persist database to disk:", err);
    throw new Error(`Database disk persistence failure: ${String(err?.message || err)}`);
  }
}

export async function withTransaction<T>(callback: (db: Database) => Promise<T> | T): Promise<T> {
  const db = await getDb();
  db.run("BEGIN TRANSACTION;");
  try {
    const result = await callback(db);
    db.run("COMMIT;");
    saveDbToDisk();
    return result;
  } catch (err) {
    try {
      db.run("ROLLBACK;");
    } catch (rollbackErr) {
      console.error("Transaction rollback error:", rollbackErr);
    }
    throw err;
  }
}

function initSchema(db: Database) {
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
      user_revision TEXT
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
      confirmed_by TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      question_text TEXT NOT NULL,
      status TEXT NOT NULL,
      created_in_version TEXT NOT NULL,
      resolved_in_version TEXT,
      answer_notes TEXT,
      updated_at TEXT NOT NULL
    );
  `);

  // Run dynamic migrations for any existing columns in older database instances
  try {
    db.run("ALTER TABLE theses ADD COLUMN current_reason TEXT;");
  } catch (_ignored) {}
  try {
    db.run("ALTER TABLE theses ADD COLUMN user_revision TEXT;");
  } catch (_ignored) {}
}
