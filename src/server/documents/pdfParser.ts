import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { EvidenceSpan, UUID } from "../../shared/domain";

export interface ParserManifestPage {
  pageNumber: number;
  printedLabel: string | null;
  widthPt: number;
  heightPt: number;
  rotation: number;
}

export interface ParserManifestBlock {
  id: string;
  type: "PARAGRAPH" | "HEADING" | "LIST" | "CAPTION" | "FOOTNOTE";
  headingPath: string[];
  text: string;
  regions: Array<{
    pageNumber: number;
    bbox: [number, number, number, number];
  }>;
}

export interface ParserManifestTable {
  id: string;
  caption: string | null;
  regions: Array<{
    pageNumber: number;
    bbox: [number, number, number, number];
  }>;
  headers: string[];
  cells: Array<{
    row: number;
    col: number;
    rowSpan: number;
    colSpan: number;
    text: string;
    bbox: [number, number, number, number];
    pageNumber: number;
  }>;
  continuationOf: string | null;
}

export interface ParserManifest {
  schemaVersion: "1.0";
  documentId: UUID;
  fileSha256: string;
  parserVersion: string;
  optionsHash: string;
  pages: ParserManifestPage[];
  blocks: ParserManifestBlock[];
  tables: ParserManifestTable[];
  quality: {
    nativeTextRatio: number;
    hasOcrPages: boolean;
    lowConfidencePages: number[];
    issues: string[];
  };
}

export interface ParsePdfResult {
  manifest: ParserManifest;
  spans: EvidenceSpan[];
}

export class PdfParserClient {
  private readonly pythonBin: string;
  private readonly parserScript: string;

  constructor(
    pythonBin?: string,
    parserScript?: string
  ) {
    // The repository may be run from a fresh local checkout, a container, or
    // the Codex runtime.  Prefer an explicitly configured interpreter, then a
    // project virtualenv when it exists; falling back to the runtime/system
    // Python keeps real uploads usable without requiring a repository-local
    // .venv (the parser only needs the documented Python dependencies).
    this.pythonBin = pythonBin
      || process.env.FINTRUST_PYTHON_BIN
      || (existsSync(path.resolve(".venv/bin/python")) ? path.resolve(".venv/bin/python") : undefined)
      || process.env.CODEX_PRIMARY_RUNTIME_PYTHON
      || "python3";
    this.parserScript = parserScript || path.resolve("python/document_parser/parser.py");
  }

  async parsePdf(
    inputPdfPath: string,
    outputManifestPath: string,
    documentId: UUID
  ): Promise<ParsePdfResult> {
    const parseId = crypto.randomUUID();

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(
        this.pythonBin,
        [
          this.parserScript,
          "--input",
          path.resolve(inputPdfPath),
          "--output",
          path.resolve(outputManifestPath),
          "--doc-id",
          documentId,
        ],
        { stdio: ["ignore", "pipe", "pipe"] }
      );

      let stderr = "";
      proc.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      proc.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`PDF Parser failed with code ${code}: ${stderr}`));
        }
      });

      proc.on("error", (err) => {
        reject(err);
      });
    });

    const manifestContent = await fs.readFile(outputManifestPath, "utf-8");
    const manifest = JSON.parse(manifestContent) as ParserManifest;

    // Convert blocks and table cells into EvidenceSpan
    const spans: EvidenceSpan[] = [];

    manifest.blocks.forEach((b) => {
      const textHash = crypto.createHash("sha256").update(b.text).digest("hex");
      const spanId = crypto.randomUUID();
      spans.push({
        id: spanId,
        documentId,
        parseId,
        regions: b.regions.map((r) => ({
          pageNumber: r.pageNumber,
          bbox: r.bbox,
        })),
        quote: b.text,
        textHash,
        headingPath: b.headingPath || [],
        quality: manifest.quality.hasOcrPages ? "OCR_RELIABLE" : "NATIVE",
      });
    });

    manifest.tables.forEach((t) => {
      t.cells.forEach((c) => {
        if (!c.text || c.text.trim().length === 0) return;
        const textHash = crypto.createHash("sha256").update(c.text).digest("hex");
        const spanId = crypto.randomUUID();
        spans.push({
          id: spanId,
          documentId,
          parseId,
          regions: [{ pageNumber: c.pageNumber, bbox: c.bbox }],
          quote: c.text,
          textHash,
          headingPath: [t.caption || `Table ${t.id}`],
          tableCell: {
            tableId: t.id,
            row: c.row,
            col: c.col,
          },
          quality: "NATIVE",
        });
      });
    });

    return { manifest, spans };
  }
}
