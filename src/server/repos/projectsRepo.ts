import crypto from "node:crypto";
import { getPool } from "../db/connection";
import type { WorkspaceContext } from "./workspaceContext";
import type { UUID } from "../../shared/domain";

export interface ProjectRow {
  id: UUID;
  workspace_id: UUID;
  company_id: UUID | null;
  title: string;
  current_version: number;
  archived: boolean;
  monitor_enabled: boolean;
  last_checked_at: Date | null;
  next_check_at: Date | null;
  pending_source_change: boolean;
  method: any;
  created_at: Date;
  updated_at: Date;
}

export class ProjectsRepo {
  async createProject(
    ctx: WorkspaceContext,
    input: {
      id?: UUID;
      title: string;
      companyId?: UUID | null;
      method?: Record<string, unknown>;
    }
  ): Promise<ProjectRow> {
    const pool = getPool();
    const id = input.id || crypto.randomUUID();
    const method = JSON.stringify(input.method || {});

    const query = `
      INSERT INTO projects (
        id, workspace_id, company_id, title, current_version,
        archived, monitor_enabled, method, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, 0, false, false, $5, now(), now())
      RETURNING *;
    `;

    const res = await pool.query(query, [
      id,
      ctx.workspaceId,
      input.companyId || null,
      input.title,
      method,
    ]);

    return res.rows[0] as ProjectRow;
  }

  async getProject(ctx: WorkspaceContext, projectId: UUID): Promise<ProjectRow | null> {
    const pool = getPool();
    const query = `
      SELECT * FROM projects
      WHERE workspace_id = $1 AND id = $2;
    `;
    const res = await pool.query(query, [ctx.workspaceId, projectId]);
    return (res.rows[0] as ProjectRow) || null;
  }

  async listProjects(ctx: WorkspaceContext): Promise<ProjectRow[]> {
    const pool = getPool();
    const query = `
      SELECT * FROM projects
      WHERE workspace_id = $1
      ORDER BY updated_at DESC;
    `;
    const res = await pool.query(query, [ctx.workspaceId]);
    return res.rows as ProjectRow[];
  }

  async updateCurrentVersion(
    ctx: WorkspaceContext,
    projectId: UUID,
    newVersion: number
  ): Promise<boolean> {
    const pool = getPool();
    const query = `
      UPDATE projects
      SET current_version = $3, updated_at = now()
      WHERE workspace_id = $1 AND id = $2;
    `;
    const res = await pool.query(query, [ctx.workspaceId, projectId, newVersion]);
    return res.rowCount !== null && res.rowCount > 0;
  }
}
