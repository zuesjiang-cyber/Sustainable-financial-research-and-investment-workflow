import path from "node:path";
import { getDataDir, getDb, withTransaction } from "../db";
import type { Database } from "sql.js";
import type { ResearchState, UUID } from "../../shared/domain";

export interface V1ProjectRecord {
  id: UUID;
  company: {
    name: string;
    securityCode: string;
    exchange?: string;
  };
  current_version: "T0" | "T1" | "T2" | string;
  created_at: string;
  updated_at: string;
  theses: Array<{
    thesisId: string;
    title: string;
    statement: string;
    type: string;
    criterion: any;
    sourceEvidenceIds: string[];
    userJudgment?: string | null;
  }>;
  documents: Array<{
    id: string;
    role: string;
    fileName: string;
    sha256: string;
    period?: any;
    publishedAt?: string;
  }>;
  currentState: ResearchState;
  history: Array<{
    version: string;
    confirmedAt: string;
    state: ResearchState;
    diffSummary?: string;
    corrections?: any[];
  }>;
  corrections?: any[];
}

export interface V1RunRecord {
  id: UUID;
  kind: "INITIAL_REPORT" | "FILING_VERIFICATION";
  status: "UPLOADING_REPORT" | "PARSING_REPORT" | "EXTRACTING_THESES" | "AWAITING_THESIS_REVIEW" | "UPLOADING_FILING" | "EXTRACTING_FACTS" | "VERIFYING_THESES" | "AWAITING_ASSESSMENT_REVIEW" | "SAVING_STATE" | "COMPLETED" | "FAILED";
  projectId?: UUID | null;
  reportDocumentId?: string;
  filingDocumentId?: string;
  reportDate?: string | null;
  companyCandidates?: any[];
  draft?: any;
  error?: string | null;
  created_at: string;
  updated_at: string;
}

type V1Record = V1ProjectRecord | V1RunRecord;

/**
 * SQLite-backed V1 state store.
 *
 * The records remain validated aggregate JSON because the V1 domain state is
 * versioned as a single snapshot. The rows live in the existing sql.js
 * database and all writes use db.ts's process-wide transaction queue; this
 * keeps V1 from opening a competing connection or creating JSON side files.
 */
export class V1Store {
  private readonly dataDir: string | null;

  constructor(dataDir?: string) {
    // Keep the optional constructor argument for callers that need an
    // isolated test database. Normal application instances follow the current
    // FINTRUST_DATA_DIR value, which db.ts resolves at call time.
    this.dataDir = dataDir ? path.resolve(dataDir) : null;
  }

  private currentDataDir(): string {
    return this.dataDir || getDataDir();
  }

  private async readRecords<T extends V1Record>(table: "v1_projects" | "v1_runs"): Promise<T[]> {
    const db = await getDb(this.currentDataDir());
    const result = db.exec(`SELECT record_json FROM ${table} ORDER BY created_at ASC, id ASC`);
    if (!result.length) return [];
    const recordIndex = result[0].columns.indexOf("record_json");
    if (recordIndex < 0) return [];
    return result[0].values.flatMap((row) => {
      try {
        const record = JSON.parse(String(row[recordIndex])) as T;
        return record && typeof record === "object" ? [record] : [];
      } catch {
        // A corrupt aggregate should not make unrelated projects disappear;
        // normal writes always emit JSON and the API validates on use.
        return [];
      }
    });
  }

  private async readRecord<T extends V1Record>(table: "v1_projects" | "v1_runs", id: string): Promise<T | null> {
    const db = await getDb(this.currentDataDir());
    const result = db.exec(`SELECT record_json FROM ${table} WHERE id = ? LIMIT 1`, [id]);
    if (!result.length || result[0].values.length === 0) return null;
    try {
      const record = JSON.parse(String(result[0].values[0][0])) as T;
      return record && typeof record === "object" ? record : null;
    } catch {
      return null;
    }
  }

  private async saveRecord(table: "v1_projects" | "v1_runs", record: V1Record): Promise<void> {
    const now = new Date().toISOString();
    const persisted = { ...record, updated_at: now };
    await withTransaction((db: Database) => {
      db.run(
        `INSERT INTO ${table} (id, record_json, created_at, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET record_json = excluded.record_json, updated_at = excluded.updated_at`,
        [record.id, JSON.stringify(persisted), record.created_at || now, now],
      );
    }, this.currentDataDir());
  }

  async getProjects(): Promise<V1ProjectRecord[]> {
    return this.readRecords<V1ProjectRecord>("v1_projects");
  }

  async getProject(id: string): Promise<V1ProjectRecord | null> {
    return this.readRecord<V1ProjectRecord>("v1_projects", id);
  }

  async saveProject(project: V1ProjectRecord): Promise<void> {
    await this.saveRecord("v1_projects", project);
  }

  async getRuns(): Promise<V1RunRecord[]> {
    return this.readRecords<V1RunRecord>("v1_runs");
  }

  async getRun(id: string): Promise<V1RunRecord | null> {
    return this.readRecord<V1RunRecord>("v1_runs", id);
  }

  async saveRun(run: V1RunRecord): Promise<void> {
    await this.saveRecord("v1_runs", run);
  }
}
