import type { Database } from "sql.js";

export function initV2Schema(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS v2_projects (
      id TEXT PRIMARY KEY,
      record_json TEXT NOT NULL,
      is_replay INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS v2_runs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      record_json TEXT NOT NULL,
      status TEXT NOT NULL,
      kind TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS v2_jobs (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      dedupe_key TEXT NOT NULL UNIQUE,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      available_at TEXT NOT NULL,
      lease_owner TEXT,
      lease_until TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS v2_notifications (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      record_json TEXT NOT NULL,
      read_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS v2_usage (
      id TEXT PRIMARY KEY,
      record_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS v2_settings (
      id TEXT PRIMARY KEY,
      record_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS v2_idempotency (
      key_hash TEXT PRIMARY KEY,
      payload_hash TEXT NOT NULL,
      response_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS v2_checks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      coverage TEXT NOT NULL,
      notes TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_v2_runs_project ON v2_runs(project_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_v2_jobs_status ON v2_jobs(status, available_at);
    CREATE INDEX IF NOT EXISTS idx_v2_notifications_project ON v2_notifications(project_id, created_at);
  `);
}
