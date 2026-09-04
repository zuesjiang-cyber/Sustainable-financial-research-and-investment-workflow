import crypto from "node:crypto";
import { getPool } from "../db/connection";
import type { WorkspaceContext } from "./workspaceContext";
import type { UUID, Scope, PeriodBasis } from "../../shared/domain";

export interface FactRow {
  id: UUID;
  workspace_id: UUID;
  document_id: UUID;
  company_id: UUID;
  metric: string;
  segment: string | null;
  period_start: Date | null;
  period_end: Date;
  basis: PeriodBasis;
  scope: Scope;
  nature: string;
  value: string;
  unit: string;
  currency: string | null;
  restatement_key: string;
  extraction_version: string;
  identity_hash: string;
  payload: any;
}

export interface CalculationRow {
  id: UUID;
  workspace_id: UUID;
  formula_id: string;
  formula_version: string;
  input_hash: string;
  result: string | null;
  payload: any;
}

export class FactsRepo {
  async insertFact(
    ctx: WorkspaceContext,
    fact: {
      id?: UUID;
      documentId: UUID;
      companyId: UUID;
      metric: string;
      segment?: string | null;
      periodStart: Date | null;
      periodEnd: Date;
      basis: PeriodBasis;
      scope: Scope;
      nature: "ACTUAL" | "FORECAST" | "GUIDANCE";
      value: string;
      unit: string;
      currency?: string | null;
      restatementKey: string;
      extractionVersion: string;
      payload: Record<string, unknown>;
      evidenceIds?: UUID[];
    }
  ): Promise<FactRow> {
    const pool = getPool();
    const id = fact.id || crypto.randomUUID();
    const identityHash = crypto
      .createHash("sha256")
      .update(
        `${fact.companyId}:${fact.metric}:${fact.segment || ""}:${
          fact.periodEnd.toISOString().split("T")[0]
        }:${fact.basis}:${fact.scope}:${fact.nature}:${fact.restatementKey}`
      )
      .digest("hex");

    const query = `
      INSERT INTO facts (
        id, workspace_id, document_id, company_id, metric, segment,
        period_start, period_end, basis, scope, nature, value, unit,
        currency, restatement_key, extraction_version, identity_hash, payload
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
      )
      ON CONFLICT (document_id, identity_hash, extraction_version) DO UPDATE
      SET value = EXCLUDED.value,
          payload = EXCLUDED.payload
      RETURNING *;
    `;

    const res = await pool.query(query, [
      id,
      ctx.workspaceId,
      fact.documentId,
      fact.companyId,
      fact.metric,
      fact.segment || null,
      fact.periodStart,
      fact.periodEnd,
      fact.basis,
      fact.scope,
      fact.nature,
      fact.value,
      fact.unit,
      fact.currency || null,
      fact.restatementKey,
      fact.extractionVersion,
      identityHash,
      JSON.stringify(fact.payload),
    ]);

    const savedFact = res.rows[0] as FactRow;

    if (fact.evidenceIds && fact.evidenceIds.length > 0) {
      for (const evidenceId of fact.evidenceIds) {
        await pool.query(
          `INSERT INTO fact_evidence (workspace_id, fact_id, evidence_id)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING;`,
          [ctx.workspaceId, savedFact.id, evidenceId]
        );
      }
    }

    return savedFact;
  }

  async findFacts(
    ctx: WorkspaceContext,
    criteria: {
      companyId: UUID;
      metric?: string;
      periodEnd?: Date;
      basis?: PeriodBasis;
      scope?: Scope;
    }
  ): Promise<FactRow[]> {
    const pool = getPool();
    const conditions = ["workspace_id = $1", "company_id = $2"];
    const params: any[] = [ctx.workspaceId, criteria.companyId];

    if (criteria.metric) {
      params.push(criteria.metric);
      conditions.push(`metric = $${params.length}`);
    }
    if (criteria.periodEnd) {
      params.push(criteria.periodEnd);
      conditions.push(`period_end = $${params.length}`);
    }
    if (criteria.basis) {
      params.push(criteria.basis);
      conditions.push(`basis = $${params.length}`);
    }
    if (criteria.scope) {
      params.push(criteria.scope);
      conditions.push(`scope = $${params.length}`);
    }

    const query = `
      SELECT * FROM facts
      WHERE ${conditions.join(" AND ")}
      ORDER BY period_end DESC;
    `;

    const res = await pool.query(query, params);
    return res.rows as FactRow[];
  }

  async saveCalculation(
    ctx: WorkspaceContext,
    calc: {
      id?: UUID;
      formulaId: string;
      formulaVersion: string;
      inputHash: string;
      result: string | null;
      payload: Record<string, unknown>;
    }
  ): Promise<CalculationRow> {
    const pool = getPool();
    const id = calc.id || crypto.randomUUID();

    const query = `
      INSERT INTO calculations (
        id, workspace_id, formula_id, formula_version, input_hash, result, payload
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (workspace_id, formula_id, formula_version, input_hash) DO UPDATE
      SET result = EXCLUDED.result, payload = EXCLUDED.payload
      RETURNING *;
    `;

    const res = await pool.query(query, [
      id,
      ctx.workspaceId,
      calc.formulaId,
      calc.formulaVersion,
      calc.inputHash,
      calc.result,
      JSON.stringify(calc.payload),
    ]);

    return res.rows[0] as CalculationRow;
  }
}
