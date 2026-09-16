import crypto from "node:crypto";
import path from "node:path";
import { getDataDir, getDb, withTransaction } from "../db";
import type { Database } from "sql.js";
import { asString, queryOne, queryRows } from "./sql";

export type V2JobKind = "BACKGROUND" | "DEEP" | "MONITOR_OFFICIAL" | "MONITOR_EXTERNAL" | "LEAD_RECHECK" | "IMPORT";
export type V2JobStatus = "QUEUED" | "RUNNING" | "DONE" | "FAILED" | "CANCELLED";

export interface V2Job {
  id: string;
  kind: V2JobKind;
  dedupeKey: string;
  payload: Record<string, unknown>;
  status: V2JobStatus;
  attempts: number;
  maxAttempts: number;
  availableAt: string;
  leaseOwner: string | null;
  leaseUntil: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToJob(row: Record<string, unknown>): V2Job {
  return {
    id: asString(row.id),
    kind: asString(row.kind) as V2JobKind,
    dedupeKey: asString(row.dedupe_key),
    payload: JSON.parse(asString(row.payload_json, "{}")),
    status: asString(row.status) as V2JobStatus,
    attempts: Number(row.attempts || 0),
    maxAttempts: Number(row.max_attempts || 3),
    availableAt: asString(row.available_at),
    leaseOwner: row.lease_owner ? asString(row.lease_owner) : null,
    leaseUntil: row.lease_until ? asString(row.lease_until) : null,
    lastError: row.last_error ? asString(row.last_error) : null,
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  };
}

export class SqliteJobQueue {
  constructor(private readonly dataDir?: string, private readonly clock: () => Date = () => new Date()) {}

  private dir(): string {
    return this.dataDir ? path.resolve(this.dataDir) : getDataDir();
  }

  private now(): string {
    return this.clock().toISOString();
  }

  async enqueue(input: {
    kind: V2JobKind;
    dedupeKey: string;
    payload: Record<string, unknown>;
    delayMs?: number;
    maxAttempts?: number;
  }): Promise<V2Job> {
    const now = this.clock();
    const availableAt = new Date(now.getTime() + (input.delayMs || 0)).toISOString();
    const createdAt = now.toISOString();
    return withTransaction((db: Database) => {
      const existing = queryOne(db, "SELECT * FROM v2_jobs WHERE dedupe_key = ? LIMIT 1", [input.dedupeKey]);
      if (existing) {
        const job = rowToJob(existing);
        if (job.status === "QUEUED" || job.status === "RUNNING") return job;
        if (job.status === "DONE") return job;
        db.run(
          `UPDATE v2_jobs SET status = 'QUEUED', payload_json = ?, available_at = ?, last_error = NULL, updated_at = ?, attempts = 0
           WHERE id = ?`,
          [JSON.stringify(input.payload), availableAt, createdAt, job.id],
        );
        return { ...job, status: "QUEUED", payload: input.payload, availableAt, updatedAt: createdAt, attempts: 0, lastError: null };
      }
      const id = crypto.randomUUID();
      db.run(
        `INSERT INTO v2_jobs (id, kind, dedupe_key, payload_json, status, attempts, max_attempts, available_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'QUEUED', 0, ?, ?, ?, ?)`,
        [id, input.kind, input.dedupeKey, JSON.stringify(input.payload), input.maxAttempts ?? 3, availableAt, createdAt, createdAt],
      );
      return rowToJob(queryOne(db, "SELECT * FROM v2_jobs WHERE id = ?", [id])!);
    }, this.dir());
  }

  async claimNext(owner: string, leaseMs = 90_000): Promise<V2Job | null> {
    const now = this.clock();
    const nowIso = now.toISOString();
    const leaseUntil = new Date(now.getTime() + leaseMs).toISOString();
    return withTransaction((db: Database) => {
      const row = queryOne(
        db,
        `SELECT * FROM v2_jobs
         WHERE status = 'QUEUED' AND available_at <= ?
         ORDER BY created_at ASC, id ASC
         LIMIT 1`,
        [nowIso],
      );
      if (!row) return null;
      const job = rowToJob(row);
      db.run(
        `UPDATE v2_jobs SET status = 'RUNNING', lease_owner = ?, lease_until = ?, attempts = attempts + 1, updated_at = ?
         WHERE id = ? AND status = 'QUEUED'`,
        [owner, leaseUntil, nowIso, job.id],
      );
      return { ...job, status: "RUNNING", leaseOwner: owner, leaseUntil, attempts: job.attempts + 1, updatedAt: nowIso };
    }, this.dir());
  }

  async complete(id: string): Promise<void> {
    const now = this.now();
    await withTransaction((db: Database) => {
      db.run("UPDATE v2_jobs SET status = 'DONE', lease_owner = NULL, lease_until = NULL, updated_at = ? WHERE id = ?", [now, id]);
    }, this.dir());
  }

  async fail(id: string, error: unknown): Promise<void> {
    const nowDate = this.clock();
    const now = nowDate.toISOString();
    const message = error instanceof Error ? error.message : String(error);
    await withTransaction((db: Database) => {
      const row = queryOne(db, "SELECT * FROM v2_jobs WHERE id = ?", [id]);
      if (!row) return;
      const job = rowToJob(row);
      const exhausted = job.attempts >= job.maxAttempts;
      const availableAt = new Date(nowDate.getTime() + 10_000).toISOString();
      db.run(
        `UPDATE v2_jobs SET status = ?, available_at = ?, lease_owner = NULL, lease_until = NULL, last_error = ?, updated_at = ?
         WHERE id = ?`,
        [exhausted ? "FAILED" : "QUEUED", availableAt, message, now, id],
      );
    }, this.dir());
  }

  async reapExpired(): Promise<number> {
    const now = this.now();
    return withTransaction((db: Database) => {
      const rows = queryRows(db, "SELECT * FROM v2_jobs WHERE status = 'RUNNING' AND lease_until IS NOT NULL AND lease_until < ?", [now]);
      for (const row of rows) {
        const job = rowToJob(row);
        const exhausted = job.attempts >= job.maxAttempts;
        db.run(
          `UPDATE v2_jobs SET status = ?, lease_owner = NULL, lease_until = NULL, last_error = ?, updated_at = ?
           WHERE id = ?`,
          [exhausted ? "FAILED" : "QUEUED", "Lease expired without completion", now, job.id],
        );
      }
      return rows.length;
    }, this.dir());
  }

  async getByDedupe(key: string): Promise<V2Job | null> {
    const db = await getDb(this.dir());
    const row = queryOne(db, "SELECT * FROM v2_jobs WHERE dedupe_key = ? LIMIT 1", [key]);
    return row ? rowToJob(row) : null;
  }
}
