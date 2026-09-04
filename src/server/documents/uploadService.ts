import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { EvidenceSpanSchema, UploadReceiptSchema } from "../../shared/domain";
import type { DocumentRole, EvidenceSpan, SourceDocument, UUID, UploadParseSummary, UploadReceipt } from "../../shared/domain";
import { LocalStorageAdapter } from "../storage/localStorageAdapter";
import { computeSha256 } from "../storage/storageAdapter";
import { PdfParserClient, type ParserManifest } from "./pdfParser";

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
export const UPLOAD_MIME_TYPE = "application/pdf" as const;
export const DEFAULT_UPLOAD_STORAGE_DIR = path.resolve("uploads");

export interface UploadFileLike {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export type { UploadParseSummary, UploadReceipt } from "../../shared/domain";

export interface UploadServiceInput {
  file: UploadFileLike;
  role: DocumentRole;
  projectId?: string | null;
  idempotencyKey: string;
}

export interface UploadServiceOptions {
  storageRoot?: string;
  storage?: LocalStorageAdapter;
  parser?: PdfParserClient;
}

interface PersistedIdempotencyReceipt {
  schemaVersion: "1";
  idempotencyKeyHash: string;
  payloadHash: string;
  receipt: UploadReceipt;
}

const DOCUMENT_ROLES = new Set<DocumentRole>([
  "THESIS_SOURCE",
  "FINANCIAL_FILING",
  "SUPPLEMENT",
]);

function statusError(message: string, statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function safeFileName(originalName: string): string {
  const candidate = String(originalName || "")
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    ?.replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 255);
  return candidate || "upload.pdf";
}

function hasPdfSignature(buffer: Buffer): boolean {
  // A valid PDF normally starts with %PDF-, but the specification permits a
  // small binary prefix. Limit the scan so this remains a cheap content check.
  return buffer.subarray(0, 1024).includes(Buffer.from("%PDF-", "ascii"));
}

/**
 * Validate upload metadata before invoking the parser. Keeping this function
 * independent of Express makes size/type rejection cheap to test and prevents
 * callers from constructing a large parser input for an invalid file.
 */
export function validateUploadFile(file: Partial<UploadFileLike> | null | undefined): asserts file is UploadFileLike {
  if (!file || typeof file !== "object") {
    throw statusError("缺少上传文件", 400);
  }

  const size = Number(file.size ?? file.buffer?.byteLength ?? 0);
  if (!Number.isFinite(size) || size <= 0) {
    throw statusError("上传文件不能为空", 400);
  }
  if (size > MAX_UPLOAD_BYTES) {
    throw statusError(`PDF 文件不能超过 ${MAX_UPLOAD_BYTES / (1024 * 1024)} MiB`, 413);
  }
  if (file.mimetype !== UPLOAD_MIME_TYPE) {
    throw statusError("仅支持 application/pdf 格式的 PDF 文件", 400);
  }
  if (!Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
    throw statusError("上传文件内容为空", 400);
  }
  if (file.buffer.length !== size) {
    throw statusError("上传文件大小校验失败", 400);
  }
  if (!hasPdfSignature(file.buffer)) {
    throw statusError("上传内容不是有效的 PDF 文件", 400);
  }
}

function payloadHash(input: Pick<UploadServiceInput, "file" | "role" | "projectId">): string {
  const fileName = safeFileName(input.file.originalname);
  const fileSha256 = computeSha256(input.file.buffer);
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({
      fileName,
      fileSha256,
      bytes: input.file.buffer.byteLength,
      role: input.role,
      projectId: input.projectId || null,
    }))
    .digest("hex");
}

function idempotencyKeyHash(idempotencyKey: string): string {
  return crypto.createHash("sha256").update(idempotencyKey).digest("hex");
}

function uploadKey(documentId: UUID, name: string): string {
  return `documents/${documentId}/${name}`;
}

export function getUploadStorageRoot(configured?: string): string {
  return path.resolve(configured || process.env.FINTRUST_UPLOAD_STORAGE_DIR || DEFAULT_UPLOAD_STORAGE_DIR);
}

export class LocalUploadService {
  private readonly storage: LocalStorageAdapter;
  private readonly parser: PdfParserClient;
  private readonly inFlight = new Map<string, Promise<UploadReceipt>>();

  constructor(options: UploadServiceOptions = {}) {
    this.storage = options.storage || new LocalStorageAdapter(getUploadStorageRoot(options.storageRoot));
    this.parser = options.parser || new PdfParserClient();
  }

  async upload(input: UploadServiceInput): Promise<UploadReceipt> {
    validateUploadFile(input.file);

    if (!DOCUMENT_ROLES.has(input.role)) {
      throw statusError("文档角色无效", 400);
    }
    const idempotencyKey = String(input.idempotencyKey || "");
    if (idempotencyKey.length < 8 || idempotencyKey.length > 200) {
      throw statusError("Idempotency-Key 长度必须为 8-200 个字符", 400);
    }
    if (input.projectId != null && !isUuid(input.projectId)) {
      throw statusError("projectId 必须是 UUID", 400);
    }

    const keyHash = idempotencyKeyHash(idempotencyKey);
    const previous = this.inFlight.get(keyHash);
    const operation = (previous ? previous.catch(() => undefined) : Promise.resolve())
      .then(() => this.process(input, keyHash));
    this.inFlight.set(keyHash, operation);

    try {
      return await operation;
    } finally {
      if (this.inFlight.get(keyHash) === operation) this.inFlight.delete(keyHash);
    }
  }

  /**
   * Read the persisted upload artifacts by document id.  Keeping these reads
   * on the upload service means v1 routes do not reach into a private storage
   * adapter (and also keeps custom storage adapters possible later).
   */
  async getReceipt(documentId: string): Promise<UploadReceipt | null> {
    if (!isUuid(documentId)) return null;
    try {
      const value = JSON.parse(
        (await this.storage.getObject(uploadKey(documentId, "receipt.json"))).toString("utf-8")
      );
      return UploadReceiptSchema.parse(value);
    } catch {
      return null;
    }
  }

  async getManifest(documentId: string): Promise<ParserManifest | null> {
    if (!isUuid(documentId)) return null;
    try {
      return JSON.parse(
        (await this.storage.getObject(uploadKey(documentId, "parser-manifest.json"))).toString("utf-8")
      ) as ParserManifest;
    } catch {
      return null;
    }
  }

  async getSpans(documentId: string): Promise<EvidenceSpan[] | null> {
    if (!isUuid(documentId)) return null;
    try {
      const parsed = JSON.parse(
        (await this.storage.getObject(uploadKey(documentId, "evidence-spans.json"))).toString("utf-8")
      );
      return Array.isArray(parsed) ? EvidenceSpanSchema.array().parse(parsed) : null;
    } catch {
      return null;
    }
  }

  async getOriginal(documentId: string): Promise<Buffer | null> {
    if (!isUuid(documentId)) return null;
    try {
      return await this.storage.getObject(uploadKey(documentId, "original.pdf"));
    } catch {
      return null;
    }
  }

  private async process(input: UploadServiceInput, keyHash: string): Promise<UploadReceipt> {
    const requestPayloadHash = payloadHash(input);
    const idempotencyKey = `idempotency/${keyHash}.json`;
    const existing = await this.readIdempotencyReceipt(idempotencyKey);
    if (existing) {
      if (existing.payloadHash !== requestPayloadHash) {
        throw statusError("Idempotency-Key 已用于不同的上传内容", 409);
      }
      return existing.receipt;
    }

    const documentId = crypto.randomUUID();
    const originalKey = uploadKey(documentId, "original.pdf");
    const manifestKey = uploadKey(documentId, "parser-manifest.json");
    const spansKey = uploadKey(documentId, "evidence-spans.json");
    const receiptKey = uploadKey(documentId, "receipt.json");
    const parserManifestPath = this.storage.resolveLocalPath?.(manifestKey);
    const inputPdfPath = this.storage.resolveLocalPath?.(originalKey);
    if (!parserManifestPath || !inputPdfPath) {
      throw statusError("本地上传存储不支持 PDF 解析路径", 500);
    }

    try {
      const stored = await this.storage.putObject(originalKey, input.file.buffer, UPLOAD_MIME_TYPE);
      const fileName = safeFileName(input.file.originalname);
      const createdAt = new Date().toISOString();
      const parsed = await this.parser.parsePdf(inputPdfPath, parserManifestPath, documentId);

      if (parsed.manifest.documentId !== documentId || parsed.manifest.fileSha256 !== stored.sha256) {
        throw statusError("PDF 解析结果未能与上传文件绑定", 500);
      }

      const manifestBytes = await fs.readFile(parserManifestPath);
      await this.storage.putObject(manifestKey, manifestBytes, "application/json");
      await this.storage.putObject(spansKey, JSON.stringify(parsed.spans, null, 2), "application/json");

      const document: SourceDocument = {
        id: documentId,
        role: input.role,
        title: fileName,
        fileName,
        mimeType: UPLOAD_MIME_TYPE,
        sha256: stored.sha256,
        companyId: null,
        publishedAt: null,
        period: null,
        origin: "USER_UPLOAD",
        officialUrl: null,
        providerId: null,
        supersedesDocumentId: null,
        isSynthetic: false,
        createdAt,
      };
      const parseSummary: UploadParseSummary = {
        status: "COMPLETED",
        parserVersion: parsed.manifest.parserVersion,
        pageCount: parsed.manifest.pages.length,
        blockCount: parsed.manifest.blocks.length,
        tableCount: parsed.manifest.tables.length,
        spanCount: parsed.spans.length,
        quality: parsed.manifest.quality,
      };
      const receipt: UploadReceipt = UploadReceiptSchema.parse({ uploadId: documentId, document, parseSummary });

      await this.storage.putObject(receiptKey, JSON.stringify(receipt, null, 2), "application/json");
      await this.storage.putObject(
        idempotencyKey,
        JSON.stringify({
          schemaVersion: "1",
          idempotencyKeyHash: keyHash,
          payloadHash: requestPayloadHash,
          receipt,
        } satisfies PersistedIdempotencyReceipt, null, 2),
        "application/json"
      );
      return receipt;
    } catch (error) {
      // A failed parse must not leave a receipt that a retry could mistake for
      // a successful upload. Best-effort cleanup is limited to this UUID's
      // private object prefix.
      await Promise.all([
        originalKey,
        manifestKey,
        spansKey,
        receiptKey,
      ].map((key) => this.storage.deleteObject(key).catch(() => undefined)));
      throw error;
    }
  }

  private async readIdempotencyReceipt(key: string): Promise<PersistedIdempotencyReceipt | null> {
    if (!(await this.storage.exists(key))) return null;
    try {
      const parsed = JSON.parse((await this.storage.getObject(key)).toString("utf-8")) as PersistedIdempotencyReceipt;
      if (parsed?.schemaVersion !== "1" || typeof parsed.payloadHash !== "string" || !parsed.receipt?.uploadId) {
        throw new Error("invalid receipt");
      }
      return parsed;
    } catch {
      throw statusError("上传幂等记录损坏，请使用新的 Idempotency-Key", 500);
    }
  }
}
