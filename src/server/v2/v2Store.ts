import crypto from "node:crypto";
import path from "node:path";
import { getDataDir, getDb, withTransaction } from "../db";
import type { Database } from "sql.js";
import {
  DEFAULT_MONITORING,
  DEFAULT_MONTHLY_BUDGET_CNY,
  COMPARISON_BUDGET_CNY,
  MAX_TRACKED_COMPANIES,
  type AnalysisRecord,
  type ResearchEvent,
  type UsageRecord,
  type V2Notification,
  type V2Project,
  type V2Run,
  type V2Settings,
} from "../../shared/v2Domain";
import { asString, parseJson, queryOne, queryRows } from "./sql";

function nowIso(clock?: () => Date): string {
  return (clock?.() || new Date()).toISOString();
}

export class V2Store {
  constructor(
    private readonly dataDir?: string,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private dir(): string {
    return this.dataDir ? path.resolve(this.dataDir) : getDataDir();
  }

  async getProject(id: string): Promise<V2Project | null> {
    const db = await getDb(this.dir());
    const row = queryOne(db, "SELECT record_json FROM v2_projects WHERE id = ? LIMIT 1", [id]);
    return row ? parseJson<V2Project | null>(row.record_json, null) : null;
  }

  async listProjects(includeReplay = false): Promise<V2Project[]> {
    const db = await getDb(this.dir());
    const rows = queryRows(
      db,
      includeReplay
        ? "SELECT record_json FROM v2_projects ORDER BY updated_at DESC"
        : "SELECT record_json FROM v2_projects WHERE is_replay = 0 ORDER BY updated_at DESC",
    );
    return rows.flatMap((row) => {
      const project = parseJson<V2Project | null>(row.record_json, null);
      return project ? [project] : [];
    });
  }

  async trackedLiveCount(): Promise<number> {
    const projects = await this.listProjects(false);
    return projects.filter((project) => project.monitoring.enabled && project.identityStatus === "IDENTIFIED").length;
  }

  async saveProject(project: V2Project): Promise<void> {
    const updated = { ...project, updatedAt: nowIso(this.clock) };
    await withTransaction((db: Database) => {
      db.run(
        `INSERT INTO v2_projects (id, record_json, is_replay, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET record_json = excluded.record_json, is_replay = excluded.is_replay, updated_at = excluded.updated_at`,
        [updated.id, JSON.stringify(updated), updated.isReplay ? 1 : 0, updated.createdAt, updated.updatedAt],
      );
    }, this.dir());
  }

  async getRun(id: string): Promise<V2Run | null> {
    const db = await getDb(this.dir());
    const row = queryOne(db, "SELECT record_json FROM v2_runs WHERE id = ? LIMIT 1", [id]);
    return row ? parseJson<V2Run | null>(row.record_json, null) : null;
  }

  async listRuns(projectId: string): Promise<V2Run[]> {
    const db = await getDb(this.dir());
    const rows = queryRows(db, "SELECT record_json FROM v2_runs WHERE project_id = ? ORDER BY created_at DESC", [projectId]);
    return rows.flatMap((row) => {
      const run = parseJson<V2Run | null>(row.record_json, null);
      return run ? [run] : [];
    });
  }

  async saveRun(run: V2Run): Promise<void> {
    const updated = { ...run, updatedAt: nowIso(this.clock) };
    await withTransaction((db: Database) => {
      db.run(
        `INSERT INTO v2_runs (id, project_id, record_json, status, kind, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET record_json = excluded.record_json, status = excluded.status, updated_at = excluded.updated_at`,
        [updated.id, updated.projectId, JSON.stringify(updated), updated.status, updated.kind, updated.createdAt, updated.updatedAt],
      );
    }, this.dir());
  }

  async appendRunEvent(runId: string, phase: string, message: string, payload?: Record<string, unknown>): Promise<V2Run | null> {
    return withTransaction((db: Database) => {
      const row = queryOne(db, "SELECT record_json FROM v2_runs WHERE id = ? LIMIT 1", [runId]);
      if (!row) return null;
      const run = parseJson<V2Run | null>(row.record_json, null);
      if (!run) return null;
      const event = { seq: run.events.length + 1, at: nowIso(this.clock), phase, message, payload };
      run.events = [...run.events, event];
      run.updatedAt = event.at;
      db.run("UPDATE v2_runs SET record_json = ?, updated_at = ? WHERE id = ?", [JSON.stringify(run), run.updatedAt, runId]);
      return run;
    }, this.dir());
  }

  async saveNotification(notification: V2Notification): Promise<void> {
    await withTransaction((db: Database) => {
      db.run(
        `INSERT INTO v2_notifications (id, project_id, record_json, read_at, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET record_json = excluded.record_json, read_at = excluded.read_at`,
        [notification.id, notification.projectId, JSON.stringify(notification), notification.readAt, notification.createdAt],
      );
    }, this.dir());
  }

  async listNotifications(projectId?: string): Promise<V2Notification[]> {
    const db = await getDb(this.dir());
    const rows = projectId
      ? queryRows(db, "SELECT record_json FROM v2_notifications WHERE project_id = ? ORDER BY created_at DESC", [projectId])
      : queryRows(db, "SELECT record_json FROM v2_notifications ORDER BY created_at DESC");
    return rows.flatMap((row) => {
      const item = parseJson<V2Notification | null>(row.record_json, null);
      return item ? [item] : [];
    });
  }

  async markRead(id: string): Promise<V2Notification | null> {
    return withTransaction((db: Database) => {
      const row = queryOne(db, "SELECT record_json FROM v2_notifications WHERE id = ? LIMIT 1", [id]);
      if (!row) return null;
      const item = parseJson<V2Notification | null>(row.record_json, null);
      if (!item) return null;
      if (!item.readAt) item.readAt = nowIso(this.clock);
      db.run("UPDATE v2_notifications SET record_json = ?, read_at = ? WHERE id = ?", [JSON.stringify(item), item.readAt, id]);
      return item;
    }, this.dir());
  }

  async addUsage(record: UsageRecord): Promise<void> {
    await withTransaction((db: Database) => {
      db.run("INSERT INTO v2_usage (id, record_json, created_at) VALUES (?, ?, ?)", [record.id, JSON.stringify(record), record.at]);
    }, this.dir());
  }

  async listUsage(): Promise<UsageRecord[]> {
    const db = await getDb(this.dir());
    return queryRows(db, "SELECT record_json FROM v2_usage ORDER BY created_at ASC").flatMap((row) => {
      const item = parseJson<UsageRecord | null>(row.record_json, null);
      return item ? [item] : [];
    });
  }

  async getSettings(): Promise<V2Settings> {
    const db = await getDb(this.dir());
    const row = queryOne(db, "SELECT record_json FROM v2_settings WHERE id = 'default' LIMIT 1");
    const stored = row ? parseJson<Partial<V2Settings>>(row.record_json, {}) : {};
    const usage = await this.listUsage();
    const spent = usage.filter((item) => item.settled).reduce((sum, item) => sum + item.estimatedCny, 0);
    const reserved = usage.filter((item) => item.reserved && !item.settled).reduce((sum, item) => sum + item.estimatedCny, 0);
    return {
      monthlyBudgetCny: stored.monthlyBudgetCny ?? DEFAULT_MONTHLY_BUDGET_CNY,
      spentCny: Number(spent.toFixed(4)),
      reservedCny: Number(reserved.toFixed(4)),
      comparisonBudgetCny: stored.comparisonBudgetCny ?? COMPARISON_BUDGET_CNY,
      comparisonSpentCny: stored.comparisonSpentCny ?? 0,
      models: stored.models || { fast: process.env.FINTRUST_MODEL_FAST || process.env.FINTRUST_LLM_MODEL || null, research: process.env.FINTRUST_MODEL_RESEARCH || process.env.FINTRUST_LLM_MODEL || null, review: process.env.FINTRUST_MODEL_REVIEW || process.env.FINTRUST_LLM_MODEL || null },
      tavilyConfigured: Boolean(process.env.TAVILY_API_KEY),
      llmConfigured: Boolean(process.env.FINTRUST_LLM_API_KEY),
      maxTrackedCompanies: stored.maxTrackedCompanies ?? MAX_TRACKED_COMPANIES,
    };
  }

  async saveSettings(patch: Partial<V2Settings>): Promise<V2Settings> {
    const current = await this.getSettings();
    const next = { ...current, ...patch, models: { ...current.models, ...(patch.models || {}) } };
    await withTransaction((db: Database) => {
      db.run(
        `INSERT INTO v2_settings (id, record_json, updated_at) VALUES ('default', ?, ?)
         ON CONFLICT(id) DO UPDATE SET record_json = excluded.record_json, updated_at = excluded.updated_at`,
        [JSON.stringify(next), nowIso(this.clock)],
      );
    }, this.dir());
    return next;
  }

  async getIdempotent(key: string, payloadHash: string): Promise<unknown | null | "conflict"> {
    const hash = crypto.createHash("sha256").update(key).digest("hex");
    const db = await getDb(this.dir());
    const row = queryOne(db, "SELECT payload_hash, response_json FROM v2_idempotency WHERE key_hash = ? LIMIT 1", [hash]);
    if (!row) return null;
    if (asString(row.payload_hash) !== payloadHash) return "conflict";
    return parseJson(row.response_json, null);
  }

  async saveIdempotent(key: string, payloadHash: string, response: unknown): Promise<void> {
    const hash = crypto.createHash("sha256").update(key).digest("hex");
    await withTransaction((db: Database) => {
      db.run(
        "INSERT INTO v2_idempotency (key_hash, payload_hash, response_json, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(key_hash) DO NOTHING",
        [hash, payloadHash, JSON.stringify(response), nowIso(this.clock)],
      );
    }, this.dir());
  }

  async recordCheck(input: { projectId: string; kind: string; status: string; coverage: string; notes: string; startedAt: string; finishedAt?: string }): Promise<void> {
    await withTransaction((db: Database) => {
      db.run(
        "INSERT INTO v2_checks (id, project_id, kind, status, coverage, notes, started_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [crypto.randomUUID(), input.projectId, input.kind, input.status, input.coverage, input.notes, input.startedAt, input.finishedAt || null],
      );
    }, this.dir());
  }

  newId(): string {
    return crypto.randomUUID();
  }

  emptyProject(partial: Partial<V2Project> = {}): V2Project {
    const createdAt = nowIso(this.clock);
    return {
      id: partial.id || crypto.randomUUID(),
      company: partial.company || null,
      companyCandidates: partial.companyCandidates || [],
      identityStatus: partial.identityStatus || "UNKNOWN",
      title: partial.title || "未命名研究",
      summary: partial.summary || "",
      isReplay: partial.isReplay || false,
      replayAsOf: partial.replayAsOf || null,
      monitoring: { ...DEFAULT_MONITORING, ...(partial.monitoring || {}) },
      currentStance: partial.currentStance || null,
      stanceHistory: partial.stanceHistory || [],
      materialViews: partial.materialViews || [],
      evidence: partial.evidence || [],
      events: partial.events || [],
      leads: partial.leads || [],
      analyses: partial.analyses || [],
      messages: partial.messages || [],
      createdAt: partial.createdAt || createdAt,
      updatedAt: createdAt,
    };
  }

  commitResearchUpdate(input: {
    project: V2Project;
    run: V2Run;
    events?: ResearchEvent[];
    analyses?: AnalysisRecord[];
    notifications?: V2Notification[];
  }): Promise<void> {
    return withTransaction((db: Database) => {
      const now = nowIso(this.clock);
      const project = { ...input.project, updatedAt: now };
      const run = { ...input.run, updatedAt: now };
      db.run(
        `INSERT INTO v2_projects (id, record_json, is_replay, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET record_json = excluded.record_json, is_replay = excluded.is_replay, updated_at = excluded.updated_at`,
        [project.id, JSON.stringify(project), project.isReplay ? 1 : 0, project.createdAt, project.updatedAt],
      );
      db.run(
        `INSERT INTO v2_runs (id, project_id, record_json, status, kind, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET record_json = excluded.record_json, status = excluded.status, updated_at = excluded.updated_at`,
        [run.id, run.projectId, JSON.stringify(run), run.status, run.kind, run.createdAt, run.updatedAt],
      );
      for (const notification of input.notifications || []) {
        db.run(
          `INSERT INTO v2_notifications (id, project_id, record_json, read_at, created_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET record_json = excluded.record_json, read_at = excluded.read_at`,
          [notification.id, notification.projectId, JSON.stringify(notification), notification.readAt, notification.createdAt],
        );
      }
    }, this.dir());
  }
}
