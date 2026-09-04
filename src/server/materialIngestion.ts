import { createHash, randomUUID } from "node:crypto";
import type { ProjectState, ResearchDocument } from "../types/fintrust";

/**
 * The server is the source of truth for material and evidence identifiers.
 * Client supplied snippets are deliberately not part of this input contract.
 */
export interface MaterialInput {
  title: string;
  content: string;
  source_type?: ResearchDocument["source_type"];
  disclosure_date?: string;
}

export const MAX_MATERIAL_CHARS = 500_000;
export const MAX_SNIPPET_CHARS = 2_400;

export function stableSourceEvidenceId(documentId: string, lineStart: number, ordinal: number): string {
  const digest = createHash("sha256")
    .update(`${documentId}:${lineStart}:${ordinal}`)
    .digest("hex")
    .slice(0, 24);
  return `SRC_${digest}`;
}

const SOURCE_TYPES = new Set<ResearchDocument["source_type"]>([
  "notes",
  "annual_report",
  "quarterly_update",
  "qualitative_brief",
]);

function opaqueId(prefix: string): string {
  // UUIDs keep identifiers unique across projects without exposing document
  // names, versions, or user-provided text in a citation id.
  return `${prefix}_${randomUUID()}`;
}

function normaliseDisclosureDate(value?: string): string {
  const candidate = String(value || "").trim();
  // Keep a date supplied by the user, but do not persist arbitrary text as a
  // disclosure date.  ISO timestamps are reduced to their calendar date. An
  // unknown date stays empty; added_at records when the user uploaded it.
  const isoDate = candidate.match(/^(\d{4}-\d{2}-\d{2})(?:$|T)/);
  if (isoDate) return isoDate[1];
  return "";
}

function lineStarts(content: string): number[] {
  const starts = [0];
  for (let i = 0; i < content.length; i += 1) {
    if (content[i] === "\n") starts.push(i + 1);
  }
  return starts;
}

function nonBlank(line: string): boolean {
  return line.trim().length > 0;
}

/**
 * Create evidence slices directly from the material text.
 *
 * Slices are exact substrings of `content`.  The line offsets are one-based
 * and refer to the original text; plain text has no page number, so `page` is
 * always null here.  Existing document snippets can still carry real pages.
 */
export function deriveEvidenceSnippets(
  documentId: string,
  content: string,
  idFactory: () => string = () => opaqueId("SRC")
): ResearchDocument["evidence_snippets"] {
  const lines = content.split("\n");
  const starts = lineStarts(content);
  const snippets: ResearchDocument["evidence_snippets"] = [];

  let chunkStart = -1;
  let chunkEnd = -1;
  let chunkLength = 0;

  const pushRange = (from: number, to: number) => {
    if (from < 0 || to < from) return;
    const startOffset = starts[from];
    const endOffset = starts[to] + lines[to].length;
    const text = content.slice(startOffset, endOffset);
    if (text.length > 0) {
      snippets.push({
        id: idFactory(),
        page: null,
        text,
        line_start: from + 1,
        line_end: to + 1,
      });
    }
  };

  const flush = () => {
    pushRange(chunkStart, chunkEnd);
    chunkStart = -1;
    chunkEnd = -1;
    chunkLength = 0;
  };

  for (let i = 0; i <= lines.length; i += 1) {
    const line = i < lines.length ? lines[i] : "";
    if (i >= lines.length || !nonBlank(line)) {
      flush();
      continue;
    }

    // A single very long line cannot be represented as a bounded multi-line
    // slice. Split it by character while retaining its real line number.
    if (line.length > MAX_SNIPPET_CHARS) {
      flush();
      for (let offset = 0; offset < line.length; offset += MAX_SNIPPET_CHARS) {
        const text = line.slice(offset, offset + MAX_SNIPPET_CHARS);
        snippets.push({
          id: idFactory(),
          page: null,
          text,
          line_start: i + 1,
          line_end: i + 1,
        });
      }
      continue;
    }

    const candidateLength = chunkLength + (chunkLength > 0 ? 1 : 0) + line.length;
    if (chunkStart >= 0 && candidateLength > MAX_SNIPPET_CHARS) {
      flush();
    }
    if (chunkStart < 0) chunkStart = i;
    chunkEnd = i;
    chunkLength = (chunkLength > 0 ? chunkLength + 1 : 0) + line.length;
  }

  return snippets;
}

/**
 * Ingest user-provided material into a document with server-derived evidence.
 * This function intentionally has no `snippets` argument: pasted/client
 * citations must never be trusted as evidence.
 */
export function ingestMaterial(projectId: string, input: MaterialInput): ResearchDocument {
  if (!projectId || typeof projectId !== "string") {
    throw new Error("Material ingestion requires a project id");
  }
  if (!input || typeof input !== "object") {
    throw new Error("Material ingestion requires a material object");
  }

  const content = typeof input.content === "string" ? input.content : "";
  if (content.trim().length === 0) throw new Error("Material content cannot be empty");
  if (content.length > MAX_MATERIAL_CHARS) {
    throw new Error(`Material content exceeds the ${MAX_MATERIAL_CHARS} character limit`);
  }

  const now = new Date().toISOString();
  const id = opaqueId("DOC");
  const sourceType = SOURCE_TYPES.has(input.source_type as ResearchDocument["source_type"])
    ? (input.source_type as ResearchDocument["source_type"])
    : "notes";

  return {
    id,
    project_id: projectId,
    source_type: sourceType,
    title: String(input.title || "未命名研究材料").trim().slice(0, 300) || "未命名研究材料",
    disclosure_date: normaliseDisclosureDate(input.disclosure_date),
    content,
    added_at: now,
    evidence_snippets: deriveEvidenceSnippets(id, content),
  };
}

/**
 * Normalize a legacy document for source-grounded retrieval. Invalid stored
 * snippets are discarded; when none are exact source substrings, canonical
 * line snippets are regenerated from the stored content. The input is not
 * mutated, and no page number is invented for plain text.
 */
export function normalizeResearchDocument(document: ResearchDocument): ResearchDocument {
  const exact = Array.isArray(document.evidence_snippets)
    ? document.evidence_snippets.filter((snippet) =>
      Boolean(
        snippet &&
          snippet.id &&
          typeof snippet.text === "string" &&
          snippet.text.length > 0 &&
          typeof document.content === "string" &&
          document.content.includes(snippet.text)
      )
    )
    : [];
  if (exact.length > 0) return { ...document, evidence_snippets: exact };
  let ordinal = 0;
  return {
    ...document,
    evidence_snippets: deriveEvidenceSnippets(document.id, document.content || "", () => {
      ordinal += 1;
      return stableSourceEvidenceId(document.id, ordinal, ordinal - 1);
    }),
  };
}

/** Returns a copy with only source-grounded document snippets. */
export function normalizeProjectEvidence(project: ProjectState): ProjectState {
  return {
    ...project,
    documents: (project.documents || []).map(normalizeResearchDocument),
  };
}
