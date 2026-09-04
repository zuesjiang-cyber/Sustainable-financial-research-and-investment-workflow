import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
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

export class V1Store {
  private readonly dataDir: string;
  private readonly projectsFile: string;
  private readonly runsFile: string;
  private projectWriteTail: Promise<void> = Promise.resolve();
  private runWriteTail: Promise<void> = Promise.resolve();

  constructor(dataDir?: string) {
    this.dataDir = path.resolve(dataDir || process.env.FINTRUST_DATA_DIR || "./data-local");
    if (!fsSync.existsSync(this.dataDir)) {
      fsSync.mkdirSync(this.dataDir, { recursive: true });
    }
    this.projectsFile = path.join(this.dataDir, "v1_projects.json");
    this.runsFile = path.join(this.dataDir, "v1_runs.json");
  }

  private async readJson<T>(filePath: string, fallback: T): Promise<T> {
    try {
      const data = await fs.readFile(filePath, "utf-8");
      return JSON.parse(data) as T;
    } catch {
      return fallback;
    }
  }

  private async writeJson<T>(filePath: string, data: T): Promise<void> {
    const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    await fs.writeFile(tempPath, JSON.stringify(data, null, 2), "utf-8");
    await fs.rename(tempPath, filePath);
  }

  // Projects
  async getProjects(): Promise<V1ProjectRecord[]> {
    return this.readJson<V1ProjectRecord[]>(this.projectsFile, []);
  }

  async getProject(id: string): Promise<V1ProjectRecord | null> {
    const list = await this.getProjects();
    return list.find((p) => p.id === id) || null;
  }

  async saveProject(project: V1ProjectRecord): Promise<void> {
    const operation = this.projectWriteTail.catch(() => undefined).then(async () => {
      const list = await this.getProjects();
      const idx = list.findIndex((p) => p.id === project.id);
      if (idx >= 0) list[idx] = { ...project, updated_at: new Date().toISOString() };
      else list.push(project);
      await this.writeJson(this.projectsFile, list);
    });
    this.projectWriteTail = operation;
    await operation;
  }

  // Runs
  async getRuns(): Promise<V1RunRecord[]> {
    return this.readJson<V1RunRecord[]>(this.runsFile, []);
  }

  async getRun(id: string): Promise<V1RunRecord | null> {
    const list = await this.getRuns();
    return list.find((r) => r.id === id) || null;
  }

  async saveRun(run: V1RunRecord): Promise<void> {
    const operation = this.runWriteTail.catch(() => undefined).then(async () => {
      const list = await this.getRuns();
      const idx = list.findIndex((r) => r.id === run.id);
      if (idx >= 0) list[idx] = { ...run, updated_at: new Date().toISOString() };
      else list.push(run);
      await this.writeJson(this.runsFile, list);
    });
    this.runWriteTail = operation;
    await operation;
  }
}
