import crypto from "node:crypto";
import { getPool, withTransaction } from "../db/connection";
import type { WorkspaceContext } from "./workspaceContext";
import type { UUID } from "../../shared/domain";

export interface DraftRow {
  id: UUID;
  workspace_id: UUID;
  run_id: UUID;
  revision: number;
  input_hash: string;
  payload: any;
  updated_at: Date;
}

export interface ResearchStateRow {
  workspace_id: UUID;
  project_id: UUID;
  version: number;
  update_id: UUID;
  payload: any;
  state_hash: string;
}

export class DraftsRepo {
  async saveDraft(
    ctx: WorkspaceContext,
    draft: {
      id?: UUID;
      runId: UUID;
      revision?: number;
      inputHash: string;
      payload: Record<string, unknown>;
    }
  ): Promise<DraftRow> {
    const pool = getPool();
    const id = draft.id || crypto.randomUUID();
    const revision = draft.revision ?? 1;

    const query = `
      INSERT INTO drafts (
        id, workspace_id, run_id, revision, input_hash, payload, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, now())
      ON CONFLICT (run_id) DO UPDATE
      SET revision = drafts.revision + 1,
          input_hash = EXCLUDED.input_hash,
          payload = EXCLUDED.payload,
          updated_at = now()
      RETURNING *;
    `;

    const res = await pool.query(query, [
      id,
      ctx.workspaceId,
      draft.runId,
      revision,
      draft.inputHash,
      JSON.stringify(draft.payload),
    ]);

    return res.rows[0] as DraftRow;
  }

  async getDraftByRun(ctx: WorkspaceContext, runId: UUID): Promise<DraftRow | null> {
    const pool = getPool();
    const query = `
      SELECT * FROM drafts
      WHERE workspace_id = $1 AND run_id = $2;
    `;
    const res = await pool.query(query, [ctx.workspaceId, runId]);
    return (res.rows[0] as DraftRow) || null;
  }

  async confirmDraftToState(
    ctx: WorkspaceContext,
    input: {
      projectId: UUID;
      runId: UUID;
      baseStateVersion: number;
      draftRevision: number;
      updatePayload: Record<string, unknown>;
      stateSnapshot: Record<string, unknown>;
      userCorrections?: Array<{
        thesisId?: UUID | null;
        kind: string;
        action: "SET" | "CLEAR";
        payload: Record<string, unknown>;
      }>;
    }
  ): Promise<{ version: number; updateId: UUID }> {
    return await withTransaction(async (client) => {
      // 1. Lock project row for serialized confirmation
      const lockRes = await client.query(
        `SELECT current_version FROM projects WHERE workspace_id = $1 AND id = $2 FOR UPDATE`,
        [ctx.workspaceId, input.projectId]
      );

      if (lockRes.rows.length === 0) {
        throw new Error("Project not found");
      }

      const currentVersion = lockRes.rows[0].current_version as number;
      if (currentVersion !== input.baseStateVersion) {
        throw new Error(
          `Stale confirmation conflict: expected baseStateVersion ${input.baseStateVersion}, but project is at version ${currentVersion}`
        );
      }

      // 2. Verify draft revision
      const draftRes = await client.query(
        `SELECT revision FROM drafts WHERE workspace_id = $1 AND run_id = $2`,
        [ctx.workspaceId, input.runId]
      );
      if (draftRes.rows.length === 0) {
        throw new Error("Draft not found for confirmation");
      }
      if (draftRes.rows[0].revision !== input.draftRevision) {
        throw new Error(
          `Draft revision conflict: expected ${input.draftRevision}, found ${draftRes.rows[0].revision}`
        );
      }

      const nextVersion = currentVersion + 1;
      const updateId = crypto.randomUUID();
      const stateHash = crypto
        .createHash("sha256")
        .update(JSON.stringify(input.stateSnapshot))
        .digest("hex");

      const confirmedBy = ctx.userId || ctx.workspaceId;

      // 3. Write research_updates
      await client.query(
        `INSERT INTO research_updates (
          id, workspace_id, project_id, run_id, version, base_version, confirmed_by, payload, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())`,
        [
          updateId,
          ctx.workspaceId,
          input.projectId,
          input.runId,
          nextVersion,
          currentVersion,
          confirmedBy,
          JSON.stringify(input.updatePayload),
        ]
      );

      // 4. Write research_states
      await client.query(
        `INSERT INTO research_states (
          workspace_id, project_id, version, update_id, payload, state_hash
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          ctx.workspaceId,
          input.projectId,
          nextVersion,
          updateId,
          JSON.stringify(input.stateSnapshot),
          stateHash,
        ]
      );

      // 5. Write user_corrections if any
      if (input.userCorrections && input.userCorrections.length > 0) {
        for (const correction of input.userCorrections) {
          const correctionId = crypto.randomUUID();
          await client.query(
            `INSERT INTO user_corrections (
              id, workspace_id, project_id, thesis_id, update_id, kind, action, payload, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())`,
            [
              correctionId,
              ctx.workspaceId,
              input.projectId,
              correction.thesisId || null,
              updateId,
              correction.kind,
              correction.action,
              JSON.stringify(correction.payload),
            ]
          );
        }
      }

      // 6. Advance project current_version
      await client.query(
        `UPDATE projects SET current_version = $3, updated_at = now() WHERE workspace_id = $1 AND id = $2`,
        [ctx.workspaceId, input.projectId, nextVersion]
      );

      // 7. Mark run as COMPLETED
      await client.query(
        `UPDATE runs SET status = 'COMPLETED', completion_reason = 'CONFIRMED', updated_at = now() WHERE workspace_id = $1 AND id = $2`,
        [ctx.workspaceId, input.runId]
      );

      return { version: nextVersion, updateId };
    });
  }

  async getLatestState(
    ctx: WorkspaceContext,
    projectId: UUID
  ): Promise<ResearchStateRow | null> {
    const pool = getPool();
    const query = `
      SELECT * FROM research_states
      WHERE workspace_id = $1 AND project_id = $2
      ORDER BY version DESC
      LIMIT 1;
    `;
    const res = await pool.query(query, [ctx.workspaceId, projectId]);
    return (res.rows[0] as ResearchStateRow) || null;
  }
}
