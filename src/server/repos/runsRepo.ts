import crypto from "node:crypto";
import { getPool } from "../db/connection";
import type { WorkspaceContext } from "./workspaceContext";
import type { UUID, RunKind, RunStatus, Phase } from "../../shared/domain";

export interface RunRow {
  id: UUID;
  workspace_id: UUID;
  project_id: UUID;
  kind: RunKind;
  status: RunStatus;
  phase: Phase | null;
  base_state_version: number;
  as_of: Date;
  required_input: any;
  source_manifest: any;
  budget: any;
  error: any;
  completion_reason: string | null;
  cancel_requested: boolean;
  config_manifest: any;
  created_at: Date;
  updated_at: Date;
}

export interface CheckpointRow {
  workspace_id: UUID;
  run_id: UUID;
  phase: Phase;
  input_hash: string;
  schema_version: string;
  payload: any;
  committed_at: Date;
}

export interface RunEventRow {
  id: string;
  workspace_id: UUID;
  run_id: UUID;
  event_type: string;
  payload: any;
  created_at: Date;
}

export class RunsRepo {
  async createRun(
    ctx: WorkspaceContext,
    input: {
      id?: UUID;
      projectId: UUID;
      kind: RunKind;
      baseStateVersion: number;
      asOf?: Date;
      budget?: Record<string, unknown>;
      configManifest?: Record<string, unknown>;
    }
  ): Promise<RunRow> {
    const pool = getPool();
    const id = input.id || crypto.randomUUID();
    const asOf = input.asOf || new Date();
    const budget = JSON.stringify(
      input.budget || {
        inputTokens: 0,
        outputTokens: 0,
        modelCalls: 0,
        toolCalls: 0,
        maxInputTokens: 200000,
        maxOutputTokens: 30000,
        maxModelCalls: 12,
        maxToolCalls: 30,
      }
    );
    const configManifest = JSON.stringify(input.configManifest || {});

    const query = `
      INSERT INTO runs (
        id, workspace_id, project_id, kind, status, phase,
        base_state_version, as_of, budget, config_manifest, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, 'QUEUED', 'PARSE_REPORT', $5, $6, $7, $8, now(), now())
      RETURNING *;
    `;

    const res = await pool.query(query, [
      id,
      ctx.workspaceId,
      input.projectId,
      input.kind,
      input.baseStateVersion,
      asOf,
      budget,
      configManifest,
    ]);

    return res.rows[0] as RunRow;
  }

  async getRun(ctx: WorkspaceContext, runId: UUID): Promise<RunRow | null> {
    const pool = getPool();
    const query = `
      SELECT * FROM runs
      WHERE workspace_id = $1 AND id = $2;
    `;
    const res = await pool.query(query, [ctx.workspaceId, runId]);
    return (res.rows[0] as RunRow) || null;
  }

  async getActiveRun(ctx: WorkspaceContext, projectId: UUID): Promise<RunRow | null> {
    const pool = getPool();
    const query = `
      SELECT * FROM runs
      WHERE workspace_id = $1 AND project_id = $2
        AND status IN ('QUEUED', 'RUNNING', 'WAITING_USER', 'AWAITING_REVIEW')
      LIMIT 1;
    `;
    const res = await pool.query(query, [ctx.workspaceId, projectId]);
    return (res.rows[0] as RunRow) || null;
  }

  async updateStatus(
    ctx: WorkspaceContext,
    runId: UUID,
    status: RunStatus,
    options?: {
      phase?: Phase | null;
      error?: Record<string, unknown> | null;
      completionReason?: string | null;
      sourceManifest?: Record<string, unknown>;
      requiredInput?: Record<string, unknown> | null;
    }
  ): Promise<boolean> {
    const pool = getPool();
    const query = `
      UPDATE runs
      SET status = $3,
          phase = COALESCE($4, phase),
          error = COALESCE($5, error),
          completion_reason = COALESCE($6, completion_reason),
          source_manifest = COALESCE($7, source_manifest),
          required_input = COALESCE($8, required_input),
          updated_at = now()
      WHERE workspace_id = $1 AND id = $2;
    `;
    const res = await pool.query(query, [
      ctx.workspaceId,
      runId,
      status,
      options?.phase || null,
      options?.error ? JSON.stringify(options.error) : null,
      options?.completionReason || null,
      options?.sourceManifest ? JSON.stringify(options.sourceManifest) : null,
      options?.requiredInput ? JSON.stringify(options.requiredInput) : null,
    ]);
    return res.rowCount !== null && res.rowCount > 0;
  }

  async saveCheckpoint(
    ctx: WorkspaceContext,
    checkpoint: {
      runId: UUID;
      phase: Phase;
      inputHash: string;
      schemaVersion: string;
      payload: Record<string, unknown>;
    }
  ): Promise<CheckpointRow> {
    const pool = getPool();
    const query = `
      INSERT INTO run_checkpoints (
        workspace_id, run_id, phase, input_hash, schema_version, payload, committed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, now())
      ON CONFLICT (run_id, phase, input_hash) DO UPDATE
      SET payload = EXCLUDED.payload, committed_at = now()
      RETURNING *;
    `;
    const res = await pool.query(query, [
      ctx.workspaceId,
      checkpoint.runId,
      checkpoint.phase,
      checkpoint.inputHash,
      checkpoint.schemaVersion,
      JSON.stringify(checkpoint.payload),
    ]);
    return res.rows[0] as CheckpointRow;
  }

  async getLatestCheckpoint(
    ctx: WorkspaceContext,
    runId: UUID
  ): Promise<CheckpointRow | null> {
    const pool = getPool();
    const query = `
      SELECT * FROM run_checkpoints
      WHERE workspace_id = $1 AND run_id = $2
      ORDER BY committed_at DESC
      LIMIT 1;
    `;
    const res = await pool.query(query, [ctx.workspaceId, runId]);
    return (res.rows[0] as CheckpointRow) || null;
  }

  async appendEvent(
    ctx: WorkspaceContext,
    runId: UUID,
    eventType: string,
    payload: Record<string, unknown>
  ): Promise<RunEventRow> {
    const pool = getPool();
    const query = `
      INSERT INTO run_events (workspace_id, run_id, event_type, payload, created_at)
      VALUES ($1, $2, $3, $4, now())
      RETURNING *;
    `;
    const res = await pool.query(query, [
      ctx.workspaceId,
      runId,
      eventType,
      JSON.stringify(payload),
    ]);
    return res.rows[0] as RunEventRow;
  }

  async getEvents(
    ctx: WorkspaceContext,
    runId: UUID,
    afterId?: string,
    limit: number = 50
  ): Promise<RunEventRow[]> {
    const pool = getPool();
    let query: string;
    let params: any[];

    if (afterId) {
      query = `
        SELECT * FROM run_events
        WHERE workspace_id = $1 AND run_id = $2 AND id > $3
        ORDER BY id ASC
        LIMIT $4;
      `;
      params = [ctx.workspaceId, runId, afterId, limit];
    } else {
      query = `
        SELECT * FROM run_events
        WHERE workspace_id = $1 AND run_id = $2
        ORDER BY id ASC
        LIMIT $3;
      `;
      params = [ctx.workspaceId, runId, limit];
    }

    const res = await pool.query(query, params);
    return res.rows as RunEventRow[];
  }
}
