import crypto from "node:crypto";
import { getPool } from "../db/connection";
import type { WorkspaceContext } from "./workspaceContext";
import type { UUID, DocumentRole } from "../../shared/domain";

export interface DocumentRow {
  id: UUID;
  workspace_id: UUID;
  company_id: UUID | null;
  role: DocumentRole;
  origin: string;
  title: string;
  file_name: string;
  mime_type: string;
  bytes: number;
  sha256: string;
  storage_key: string;
  published_at: Date | null;
  period: any;
  official_url: string | null;
  provider_id: string | null;
  supersedes_document_id: UUID | null;
  is_synthetic: boolean;
  metadata: any;
  created_at: Date;
}

export interface DocumentParseRow {
  id: UUID;
  workspace_id: UUID;
  document_id: UUID;
  parser_version: string;
  options_hash: string;
  artifact_key: string;
  page_count: number;
  quality: any;
  created_at: Date;
}

export interface EvidenceSpanRow {
  id: UUID;
  workspace_id: UUID;
  parse_id: UUID;
  page_number: number | null;
  regions: any;
  quote: string;
  text_hash: string;
  quality: string;
  metadata: any;
}

export class DocumentsRepo {
  async createDocument(
    ctx: WorkspaceContext,
    doc: {
      id?: UUID;
      companyId?: UUID | null;
      role: DocumentRole;
      origin: "USER_UPLOAD" | "OFFICIAL_DISCLOSURE" | "LEGACY_TEXT";
      title: string;
      fileName: string;
      mimeType: string;
      bytes: number;
      sha256: string;
      storageKey: string;
      publishedAt?: Date | null;
      period?: Record<string, unknown> | null;
      officialUrl?: string | null;
      providerId?: string | null;
      supersedesDocumentId?: UUID | null;
      isSynthetic?: boolean;
      metadata?: Record<string, unknown>;
    }
  ): Promise<DocumentRow> {
    const pool = getPool();
    const id = doc.id || crypto.randomUUID();

    const query = `
      INSERT INTO documents (
        id, workspace_id, company_id, role, origin, title, file_name,
        mime_type, bytes, sha256, storage_key, published_at, period,
        official_url, provider_id, supersedes_document_id, is_synthetic,
        metadata, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, now()
      )
      RETURNING *;
    `;

    const res = await pool.query(query, [
      id,
      ctx.workspaceId,
      doc.companyId || null,
      doc.role,
      doc.origin,
      doc.title,
      doc.fileName,
      doc.mimeType,
      doc.bytes,
      doc.sha256,
      doc.storageKey,
      doc.publishedAt || null,
      doc.period ? JSON.stringify(doc.period) : null,
      doc.officialUrl || null,
      doc.providerId || null,
      doc.supersedesDocumentId || null,
      doc.isSynthetic ?? false,
      JSON.stringify(doc.metadata || {}),
    ]);

    return res.rows[0] as DocumentRow;
  }

  async getDocument(ctx: WorkspaceContext, documentId: UUID): Promise<DocumentRow | null> {
    const pool = getPool();
    const query = `SELECT * FROM documents WHERE workspace_id = $1 AND id = $2`;
    const res = await pool.query(query, [ctx.workspaceId, documentId]);
    return (res.rows[0] as DocumentRow) || null;
  }

  async createParse(
    ctx: WorkspaceContext,
    parse: {
      id?: UUID;
      documentId: UUID;
      parserVersion: string;
      optionsHash: string;
      artifactKey: string;
      pageCount: number;
      quality: Record<string, unknown>;
    }
  ): Promise<DocumentParseRow> {
    const pool = getPool();
    const id = parse.id || crypto.randomUUID();

    const query = `
      INSERT INTO document_parses (
        id, workspace_id, document_id, parser_version, options_hash,
        artifact_key, page_count, quality, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
      ON CONFLICT (document_id, parser_version, options_hash) DO UPDATE
      SET artifact_key = EXCLUDED.artifact_key,
          page_count = EXCLUDED.page_count,
          quality = EXCLUDED.quality
      RETURNING *;
    `;

    const res = await pool.query(query, [
      id,
      ctx.workspaceId,
      parse.documentId,
      parse.parserVersion,
      parse.optionsHash,
      parse.artifactKey,
      parse.pageCount,
      JSON.stringify(parse.quality),
    ]);

    return res.rows[0] as DocumentParseRow;
  }

  async insertEvidenceSpans(
    ctx: WorkspaceContext,
    spans: Array<{
      id?: UUID;
      parseId: UUID;
      pageNumber: number | null;
      regions: any[];
      quote: string;
      textHash: string;
      quality: string;
      metadata?: Record<string, unknown>;
    }>
  ): Promise<number> {
    const pool = getPool();
    if (spans.length === 0) return 0;

    let inserted = 0;
    for (const span of spans) {
      const id = span.id || crypto.randomUUID();
      const query = `
        INSERT INTO evidence_spans (
          id, workspace_id, parse_id, page_number, regions, quote,
          text_hash, quality, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (workspace_id, id) DO NOTHING;
      `;
      await pool.query(query, [
        id,
        ctx.workspaceId,
        span.parseId,
        span.pageNumber,
        JSON.stringify(span.regions),
        span.quote,
        span.textHash,
        span.quality,
        JSON.stringify(span.metadata || {}),
      ]);
      inserted++;
    }
    return inserted;
  }

  async getEvidenceSpansByParse(
    ctx: WorkspaceContext,
    parseId: UUID
  ): Promise<EvidenceSpanRow[]> {
    const pool = getPool();
    const query = `
      SELECT * FROM evidence_spans
      WHERE workspace_id = $1 AND parse_id = $2
      ORDER BY page_number ASC NULLS LAST;
    `;
    const res = await pool.query(query, [ctx.workspaceId, parseId]);
    return res.rows as EvidenceSpanRow[];
  }
}
