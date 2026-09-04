import crypto from "node:crypto";
import { getPool } from "../db/connection";
import type { WorkspaceContext } from "./workspaceContext";
import type { UUID } from "../../shared/domain";

export interface ThesisRow {
  id: UUID;
  workspace_id: UUID;
  project_id: UUID;
  lifecycle: "ACTIVE" | "ARCHIVED";
  created_at: Date;
}

export interface ThesisRevisionRow {
  id: UUID;
  workspace_id: UUID;
  thesis_id: UUID;
  revision: number;
  payload: any;
  created_at: Date;
}

export class ThesesRepo {
  async createThesis(
    ctx: WorkspaceContext,
    input: {
      id?: UUID;
      projectId: UUID;
      lifecycle?: "ACTIVE" | "ARCHIVED";
    }
  ): Promise<ThesisRow> {
    const pool = getPool();
    const id = input.id || crypto.randomUUID();
    const lifecycle = input.lifecycle || "ACTIVE";

    const query = `
      INSERT INTO theses (id, workspace_id, project_id, lifecycle, created_at)
      VALUES ($1, $2, $3, $4, now())
      RETURNING *;
    `;

    const res = await pool.query(query, [id, ctx.workspaceId, input.projectId, lifecycle]);
    return res.rows[0] as ThesisRow;
  }

  async createRevision(
    ctx: WorkspaceContext,
    input: {
      id?: UUID;
      thesisId: UUID;
      revision: number;
      payload: Record<string, unknown>;
    }
  ): Promise<ThesisRevisionRow> {
    const pool = getPool();
    const id = input.id || crypto.randomUUID();

    const query = `
      INSERT INTO thesis_revisions (id, workspace_id, thesis_id, revision, payload, created_at)
      VALUES ($1, $2, $3, $4, $5, now())
      ON CONFLICT (thesis_id, revision) DO UPDATE
      SET payload = EXCLUDED.payload
      RETURNING *;
    `;

    const res = await pool.query(query, [
      id,
      ctx.workspaceId,
      input.thesisId,
      input.revision,
      JSON.stringify(input.payload),
    ]);

    return res.rows[0] as ThesisRevisionRow;
  }

  async getLatestRevisionsByProject(
    ctx: WorkspaceContext,
    projectId: UUID
  ): Promise<Array<{ thesis: ThesisRow; latestRevision: ThesisRevisionRow }>> {
    const pool = getPool();
    const query = `
      SELECT t.*, r.id as rev_id, r.revision, r.payload as rev_payload, r.created_at as rev_created_at
      FROM theses t
      JOIN LATERAL (
        SELECT * FROM thesis_revisions
        WHERE thesis_id = t.id
        ORDER BY revision DESC
        LIMIT 1
      ) r ON true
      WHERE t.workspace_id = $1 AND t.project_id = $2 AND t.lifecycle = 'ACTIVE';
    `;

    const res = await pool.query(query, [ctx.workspaceId, projectId]);
    return res.rows.map((row) => ({
      thesis: {
        id: row.id,
        workspace_id: row.workspace_id,
        project_id: row.project_id,
        lifecycle: row.lifecycle,
        created_at: row.created_at,
      },
      latestRevision: {
        id: row.rev_id,
        workspace_id: row.workspace_id,
        thesis_id: row.id,
        revision: row.revision,
        payload: row.rev_payload,
        created_at: row.rev_created_at,
      },
    }));
  }
}
