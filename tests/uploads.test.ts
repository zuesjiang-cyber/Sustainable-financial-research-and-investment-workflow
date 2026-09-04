import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { AddressInfo } from "node:net";
import crypto from "node:crypto";
import { MAX_UPLOAD_BYTES, validateUploadFile } from "../src/server/documents/uploadService";
import { SourceDocumentSchema } from "../src/shared/domain";

const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "fintrust-upload-db-"));
const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "fintrust-upload-storage-"));
process.env.FINTRUST_DATA_DIR = dataDir;
delete process.env.GEMINI_API_KEY;
delete process.env.FINTRUST_LLM_API_KEY;
const { createApp } = await import("../src/server/app");

async function startServer() {
  const app = await createApp({ upload: { storageRoot } });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as AddressInfo;
  return { server, root: `http://127.0.0.1:${address.port}` };
}

async function postUpload(root: string, bytes: Buffer, key: string, options: { mimeType?: string; fileName?: string; omitFile?: boolean } = {}) {
  const form = new FormData();
  if (!options.omitFile) {
    form.append(
      "file",
      new Blob([bytes], { type: options.mimeType || "application/pdf" }),
      options.fileName || "sample_report.pdf"
    );
  }
  form.append("role", "THESIS_SOURCE");
  const response = await fetch(`${root}/v1/uploads`, {
    method: "POST",
    headers: { "Idempotency-Key": key },
    body: form,
  });
  return { response, body: await response.json() as any };
}

test("POST /v1/uploads stores exact PDF bytes, parser artifacts, and an honest receipt", async () => {
  const fixture = await fs.readFile(path.resolve("tests/fixtures/sample_report.pdf"));
  const { server, root } = await startServer();
  try {
    const first = await postUpload(root, fixture, `upload-${crypto.randomUUID()}`);
    assert.equal(first.response.status, 201, JSON.stringify(first.body));
    assert.equal(first.body.uploadId, first.body.document.id);
    assert.equal(first.body.document.role, "THESIS_SOURCE");
    assert.equal(first.body.document.fileName, "sample_report.pdf");
    assert.equal(first.body.document.mimeType, "application/pdf");
    assert.equal(first.body.document.origin, "USER_UPLOAD");
    assert.equal(first.body.document.isSynthetic, false);
    assert.deepEqual(SourceDocumentSchema.parse(first.body.document), first.body.document);
    assert.equal(first.body.document.sha256, crypto.createHash("sha256").update(fixture).digest("hex"));
    assert.equal(first.body.parseSummary.status, "COMPLETED");
    assert.equal(first.body.parseSummary.pageCount, 1);
    assert.equal(first.body.parseSummary.spanCount, 1);

    const documentDir = path.join(storageRoot, "documents", first.body.uploadId);
    assert.deepEqual(await fs.readFile(path.join(documentDir, "original.pdf")), fixture);
    const manifest = JSON.parse(await fs.readFile(path.join(documentDir, "parser-manifest.json"), "utf-8"));
    const spans = JSON.parse(await fs.readFile(path.join(documentDir, "evidence-spans.json"), "utf-8"));
    assert.equal(manifest.documentId, first.body.uploadId);
    assert.equal(manifest.fileSha256, first.body.document.sha256);
    assert.equal(manifest.pages.length, 1);
    assert.match(manifest.blocks[0].text, /Shengbang Co\., Ltd\./);
    assert.equal(spans.length, first.body.parseSummary.spanCount);
    assert.match(spans[0].quote, /Target Gross Margin 30%/);

    const key = "retry-key-123456";
    const initial = await postUpload(root, fixture, key);
    const retry = await postUpload(root, fixture, key);
    assert.equal(initial.response.status, 201);
    assert.equal(retry.response.status, 201);
    assert.deepEqual(retry.body, initial.body);
    const keyHash = crypto.createHash("sha256").update(key).digest("hex");
    assert.equal(await fs.stat(path.join(storageRoot, "idempotency", `${keyHash}.json`)).then(() => true), true);

    const changed = Buffer.concat([fixture, Buffer.from("\n")]);
    const conflict = await postUpload(root, changed, key);
    assert.equal(conflict.response.status, 409);
    assert.match(conflict.body.error, /Idempotency-Key/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("POST /v1/uploads rejects invalid multipart files without parsing", async () => {
  const fixture = await fs.readFile(path.resolve("tests/fixtures/sample_report.pdf"));
  const { server, root } = await startServer();
  try {
    const wrongType = await postUpload(root, fixture, "wrong-type-123456", { mimeType: "text/plain", fileName: "report.txt" });
    assert.equal(wrongType.response.status, 400);

    const empty = await postUpload(root, Buffer.alloc(0), "empty-file-123456");
    assert.equal(empty.response.status, 400);

    const missing = await postUpload(root, fixture, "missing-file-123456", { omitFile: true });
    assert.equal(missing.response.status, 400);

    assert.throws(
      () => validateUploadFile({ originalname: "large.pdf", mimetype: "application/pdf", size: MAX_UPLOAD_BYTES + 1, buffer: Buffer.alloc(0) }),
      (error: any) => error?.statusCode === 413
    );
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("validateUploadFile catches malformed PDF signatures before parser invocation", () => {
  assert.throws(
    () => validateUploadFile({ originalname: "not-a-pdf.pdf", mimetype: "application/pdf", size: 5, buffer: Buffer.from("hello") }),
    (error: any) => error?.statusCode === 400 && /PDF/.test(error.message)
  );
});
