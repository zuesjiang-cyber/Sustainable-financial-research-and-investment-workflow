import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { tmpdir } from "node:os";
import { createApp } from "../src/server/app";
import type { Server } from "node:http";

test("FinTrust V1 Walkthrough HTTP API: upload -> T0 -> T1 -> T2 with stable thesis IDs", async () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), "fintrust-v1-walkthrough-db-"));
  const storageRoot = mkdtempSync(path.join(tmpdir(), "fintrust-v1-walkthrough-storage-"));
  process.env.FINTRUST_DATA_DIR = dataDir;
  process.env.FINTRUST_UPLOAD_STORAGE_DIR = storageRoot;
  delete process.env.FINTRUST_LLM_API_KEY;
  delete process.env.GEMINI_API_KEY;
  const app = await createApp();
  let server: Server;
  const port = await new Promise<number>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve(typeof addr === "object" && addr ? addr.port : 0);
    });
  });

  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Upload Report PDF (POST /v1/uploads)
    const samplePdfPath = path.resolve("tests/fixtures/sample_report.pdf");
    const pdfBuffer = fs.readFileSync(samplePdfPath);

    const formData = new FormData();
    formData.append("file", new Blob([pdfBuffer], { type: "application/pdf" }), "sample_report.pdf");
    formData.append("role", "THESIS_SOURCE");

    const uploadRes = await fetch(`${baseUrl}/v1/uploads`, {
      method: "POST",
      headers: {
        "Idempotency-Key": `upload-test-${crypto.randomUUID()}`,
      },
      body: formData,
    });

    assert.equal(uploadRes.status, 201);
    const uploadReceipt = (await uploadRes.json()) as any;
    assert.equal(Boolean(uploadReceipt.document.id), true);
    assert.equal(uploadReceipt.document.role, "THESIS_SOURCE");
    const reportDocId = uploadReceipt.document.id;

    // 2. Start Thesis Extraction Run (POST /v1/runs)
    const runRes = await fetch(`${baseUrl}/v1/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "INITIAL_REPORT",
        reportDocumentId: reportDocId,
      }),
    });

    assert.equal(runRes.status, 201);
    const runData = (await runRes.json()) as any;
    assert.equal(runData.status, "AWAITING_THESIS_REVIEW");
    assert.equal(Array.isArray(runData.draft.items), true);
    assert.equal(runData.draft.items.length >= 1, true);
    const runId = runData.runId;

    // 3. Confirm Theses to form T0 (POST /v1/runs/:id/draft/confirm)
    const confirmT0Res = await fetch(`${baseUrl}/v1/runs/${runId}/draft/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        draftRevision: 1,
        company: {
          name: "圣邦股份",
          securityCode: "300661",
        },
        theses: runData.draft.items,
      }),
    });

    assert.equal(confirmT0Res.status, 200);
    const t0Data = (await confirmT0Res.json()) as any;
    assert.equal(t0Data.version, "T0");
    assert.equal(Boolean(t0Data.projectId), true);
    const projectId = t0Data.projectId;
    const thesisIds = t0Data.state.items.map((item: any) => item.thesis.thesisId);

    // A completed initial run is single-use; it cannot create a second
    // company/project from the same uploaded report.
    const duplicateT0Res = await fetch(`${baseUrl}/v1/runs/${runId}/draft/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        draftRevision: 1,
        company: { name: "不应重复创建", securityCode: "000000" },
        theses: runData.draft.items,
      }),
    });
    assert.equal(duplicateT0Res.status, 409);

    // 4. Verify Project State is T0 (GET /v1/projects/:id/state)
    const stateT0Res = await fetch(`${baseUrl}/v1/projects/${projectId}/state`);
    assert.equal(stateT0Res.status, 200);
    const stateT0 = (await stateT0Res.json()) as any;
    assert.equal(stateT0.version, 0);
    assert.equal(stateT0.items[0].assessment.maturity, "NOT_DUE");

    // 5. Upload Financial Filing PDF (POST /v1/uploads)
    const filingFormData = new FormData();
    filingFormData.append("file", new Blob([pdfBuffer], { type: "application/pdf" }), "q3_filing.pdf");
    filingFormData.append("role", "FINANCIAL_FILING");
    filingFormData.append("projectId", projectId);

    const filingUploadRes = await fetch(`${baseUrl}/v1/uploads`, {
      method: "POST",
      headers: {
        "Idempotency-Key": `filing-test-${crypto.randomUUID()}`,
      },
      body: filingFormData,
    });

    assert.equal(filingUploadRes.status, 201);
    const filingReceipt = (await filingUploadRes.json()) as any;
    const filingDocId = filingReceipt.document.id;

    // 6. Start Filing Verification Run (POST /v1/projects/:id/filing-runs)
    const filingRunRes = await fetch(`${baseUrl}/v1/projects/${projectId}/filing-runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filingDocumentId: filingDocId,
        period: { start: "2025-01-01", end: "2025-09-30", basis: "YTD" },
        publishedAt: "2025-10-28",
        scope: "CONSOLIDATED",
      }),
    });

    assert.equal(filingRunRes.status, 201);
    const filingRunData = (await filingRunRes.json()) as any;
    assert.equal(filingRunData.status, "AWAITING_ASSESSMENT_REVIEW");
    assert.equal(Array.isArray(filingRunData.draft.items), true);
    const filingRunId = filingRunData.runId;

    // 7. Confirm T1 State (POST /v1/runs/:id/draft/confirm)
    const confirmT1Res = await fetch(`${baseUrl}/v1/runs/${filingRunId}/draft/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        userJudgments: {
          [filingRunData.draft.items[0].thesis.thesisId]: "三季度达标，持续观察四季度毛利率",
        },
      }),
    });

    assert.equal(confirmT1Res.status, 200);
    const t1Data = (await confirmT1Res.json()) as any;
    assert.equal(t1Data.version, "T1");
    assert.deepEqual(t1Data.state.items.map((item: any) => item.thesis.thesisId), thesisIds);
    assert.equal(t1Data.state.items[0].userJudgment, "三季度达标，持续观察四季度毛利率");

    // 8. Upload the next filing and create a T2 draft from the same project.
    const nextFilingFormData = new FormData();
    nextFilingFormData.append("file", new Blob([pdfBuffer], { type: "application/pdf" }), "annual_filing.pdf");
    nextFilingFormData.append("role", "FINANCIAL_FILING");
    nextFilingFormData.append("projectId", projectId);
    const nextFilingUploadRes = await fetch(`${baseUrl}/v1/uploads`, {
      method: "POST",
      headers: { "Idempotency-Key": `filing-next-test-${crypto.randomUUID()}` },
      body: nextFilingFormData,
    });
    assert.equal(nextFilingUploadRes.status, 201);
    const nextFilingReceipt = (await nextFilingUploadRes.json()) as any;
    const nextFilingRunRes = await fetch(`${baseUrl}/v1/projects/${projectId}/filing-runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filingDocumentId: nextFilingReceipt.document.id,
        period: { start: "2025-01-01", end: "2025-12-31", basis: "YEAR" },
        publishedAt: "2026-04-21",
        scope: "CONSOLIDATED",
      }),
    });
    assert.equal(nextFilingRunRes.status, 201);
    const nextFilingRunData = (await nextFilingRunRes.json()) as any;
    assert.equal(nextFilingRunData.status, "AWAITING_ASSESSMENT_REVIEW");
    assert.equal(nextFilingRunData.draft.baseStateVersion, 1);
    assert.deepEqual(nextFilingRunData.draft.items.map((item: any) => item.thesis.thesisId), thesisIds);
    assert.equal(nextFilingRunData.draft.items[0].userJudgment, "三季度达标，持续观察四季度毛利率");

    const confirmT2Res = await fetch(`${baseUrl}/v1/runs/${nextFilingRunData.runId}/draft/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        baseStateVersion: 1,
        draftRevision: nextFilingRunData.draft.revision,
        userJudgments: {},
      }),
    });
    assert.equal(confirmT2Res.status, 200);
    const t2Data = (await confirmT2Res.json()) as any;
    assert.equal(t2Data.version, "T2");
    assert.deepEqual(t2Data.state.items.map((item: any) => item.thesis.thesisId), thesisIds);
    assert.equal(t2Data.state.items[0].userJudgment, "三季度达标，持续观察四季度毛利率");

    // 9. Verify Project History has T0, T1 and T2, with stable thesis IDs.
    const historyRes = await fetch(`${baseUrl}/v1/projects/${projectId}/history`);
    assert.equal(historyRes.status, 200);
    const history = (await historyRes.json()) as any[];
    assert.equal(history.length, 3);
    assert.equal(history[0].version, "T0");
    assert.equal(history[1].version, "T1");
    assert.equal(history[2].version, "T2");
    for (const entry of history) assert.deepEqual(entry.state.items.map((item: any) => item.thesis.thesisId), thesisIds);
  } finally {
    await new Promise<void>((resolve, reject) => server!.close((err) => err ? reject(err) : resolve()));
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(storageRoot, { recursive: true, force: true });
  }
});
