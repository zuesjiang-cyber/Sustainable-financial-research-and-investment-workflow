import crypto from "node:crypto";
import { getPool } from "../db/connection";
import type { WorkspaceContext } from "../repos/workspaceContext";
import type { UUID } from "../../shared/domain";

export type JobKind = "RUN" | "CHECK_DISCLOSURES" | "EXPORT";
export type JobStatus = "QUEUED" | "RUNNING" | "DONE" | "FAILED" | "CANCELLED";

export interface JobRow {
  id: UUID;
  workspace_id: UUID;
  run_id: UUID | null;
  kind: JobKind;
  dedupe_key: string;
  payload: any;
  status: JobStatus;
  priority: number;
  attempts: number;
  max_attempts: number;
  available_at: Date;
  lease_owner: string | null;
  lease_token: UUID | null;
  lease_until: Date | null;
  last_error: any;
  created_at: Date;
}

export interface EnqueueJobInput {
  runId?: UUID | null;
  kind: JobKind;
  dedupeKey: string;
  payload: Record<string, unknown>;
  priority?: number;
  maxAttempts?: number;
  delaySeconds?: number;
}

export class JobQueue {
  async enqueue(ctx: WorkspaceContext, input: EnqueueJobInput): Promise<JobRow> {
    const pool = getPool();
    const id = crypto.randomUUID();
    const priority = input.priority ?? 0;
    const maxAttempts = input.maxAttempts ?? 3;
    const availableAt = new Date(Date.now() + (input.delaySeconds ?? 0) * 1000);

    const query = `
      INSERT INTO jobs (
        id, workspace_id, run_id, kind, dedupe_key, payload,
        status, priority, attempts, max_attempts, available_at, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, 'QUEUED', $7, 0, $8, $9, now())
      ON CONFLICT (workspace_id, dedupe_key) DO UPDATE
      SET payload = EXCLUDED.payload,
          priority = EXCLUDED.priority,
          available_at = EXCLUDED.available_at
      WHERE jobs.status IN ('FAILED', 'CANCELLED')
      RETURNING *;
    `;

    const res = await pool.query(query, [
      id,
      ctx.workspaceId,
      input.runId || null,
      input.kind,
      input.dedupeKey,
      JSON.stringify(input.payload),
      priority,
      maxAttempts,
      availableAt,
    ]);

    return res.rows[0] as JobRow;
  }

  async claimNext(
    leaseOwner: string,
    leaseDurationSeconds: number = 90
  ): Promise<{ job: JobRow; leaseToken: UUID } | null> {
    const pool = getPool();
    const leaseToken = crypto.randomUUID();

    const query = `
      WITH picked AS (
        SELECT id FROM jobs
        WHERE status = 'QUEUED' AND available_at <= now()
        ORDER BY priority DESC, created_at ASC, id ASC
        FOR UPDATE SKIP LOCKED LIMIT 1
      )
      UPDATE jobs j
      SET status = 'RUNNING',
          lease_owner = $1,
          lease_token = $2,
          lease_until = now() + ($3 || ' seconds')::interval,
          attempts = attempts + 1
      FROM picked
      WHERE j.id = picked.id
      RETURNING j.*;
    `;

    const res = await pool.query(query, [
      leaseOwner,
      leaseToken,
      leaseDurationSeconds,
    ]);

    if (res.rows.length === 0) return null;
    return { job: res.rows[0] as JobRow, leaseToken };
  }

  async heartbeat(
    jobId: UUID,
    leaseToken: UUID,
    extendSeconds: number = 90
  ): Promise<boolean> {
    const pool = getPool();
    const query = `
      UPDATE jobs
      SET lease_until = now() + ($3 || ' seconds')::interval
      WHERE id = $1 AND lease_token = $2 AND status = 'RUNNING'
      RETURNING id;
    `;
    const res = await pool.query(query, [jobId, leaseToken, extendSeconds]);
    return res.rowCount !== null && res.rowCount > 0;
  }

  async complete(jobId: UUID, leaseToken: UUID): Promise<boolean> {
    const pool = getPool();
    const query = `
      UPDATE jobs
      SET status = 'DONE',
          lease_until = null,
          lease_token = null
      WHERE id = $1 AND lease_token = $2 AND status = 'RUNNING'
      RETURNING id;
    `;
    const res = await pool.query(query, [jobId, leaseToken]);
    return res.rowCount !== null && res.rowCount > 0;
  }

  async fail(
    jobId: UUID,
    leaseToken: UUID,
    error: unknown,
    retryDelaySeconds: number = 10
  ): Promise<boolean> {
    const pool = getPool();
    const errorPayload = JSON.stringify(
      error instanceof Error
        ? { message: error.message, stack: error.stack }
        : { error: String(error) }
    );

    const query = `
      UPDATE jobs
      SET status = CASE WHEN attempts >= max_attempts THEN 'FAILED' ELSE 'QUEUED' END,
          available_at = now() + ($4 || ' seconds')::interval,
          lease_until = null,
          lease_token = null,
          last_error = $3
      WHERE id = $1 AND lease_token = $2 AND status = 'RUNNING'
      RETURNING id;
    `;

    const res = await pool.query(query, [
      jobId,
      leaseToken,
      errorPayload,
      retryDelaySeconds,
    ]);
    return res.rowCount !== null && res.rowCount > 0;
  }

  async reapExpiredLeases(): Promise<number> {
    const pool = getPool();
    const query = `
      UPDATE jobs
      SET status = CASE WHEN attempts >= max_attempts THEN 'FAILED' ELSE 'QUEUED' END,
          lease_until = null,
          lease_token = null,
          last_error = jsonb_build_object('error', 'Lease expired without completion or heartbeat')
      WHERE status = 'RUNNING' AND lease_until < now()
      RETURNING id;
    `;
    const res = await pool.query(query);
    return res.rowCount || 0;
  }
}
