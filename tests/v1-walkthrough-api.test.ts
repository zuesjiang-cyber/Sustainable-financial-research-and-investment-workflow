import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createApp } from "../src/server/app";
import type { Server } from "node:http";

test("FinTrust V1 Walkthrough HTTP API: upload -> runs -> T0 -> filing-runs -> T1 -> history", async () => {
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

    // 8. Verify Project History has both T0 and T1 (GET /v1/projects/:id/history)
    const historyRes = await fetch(`${baseUrl}/v1/projects/${projectId}/history`);
    assert.equal(historyRes.status, 200);
    const history = (await historyRes.json()) as any[];
    assert.equal(history.length, 2);
    assert.equal(history[0].version, "T0");
    assert.equal(history[1].version, "T1");

    // =========================================================================
    // Multi-company Generality: 汇顶科技 603160 (SSE)
    // =========================================================================
    const goodixRunRes = await fetch(`${baseUrl}/v1/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "INITIAL_REPORT",
        reportDocumentId: reportDocId,
      }),
    });
    assert.equal(goodixRunRes.status, 201);
    const goodixRunData = (await goodixRunRes.json()) as any;
    const goodixRunId = goodixRunData.runId;

    const goodixConfirmRes = await fetch(`${baseUrl}/v1/runs/${goodixRunId}/draft/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        draftRevision: 1,
        company: {
          name: "汇顶科技",
          securityCode: "603160",
          exchange: "SSE",
        },
        theses: [
          {
            thesisId: "goodix-th-1",
            title: "车载触控传感器出货放量",
            statement: "预计2025年车载触控业务营收增长超过20%",
            type: "NUMERIC_FORECAST",
            criterion: {
              kind: "COMPARE",
              metric: "revenue",
              op: "GTE",
              target: "20",
              unit: "RATIO",
              period: { start: "2025-01-01", end: "2025-12-31", basis: "YEAR" },
              scope: "CONSOLIDATED",
            },
          },
        ],
      }),
    });

    assert.equal(goodixConfirmRes.status, 200);
    const goodixData = (await goodixConfirmRes.json()) as any;
    assert.equal(goodixData.project.company.name, "汇顶科技");
    assert.equal(goodixData.project.company.securityCode, "603160");

    // Verify both projects exist in GET /v1/projects
    const listRes = await fetch(`${baseUrl}/v1/projects`);
    assert.equal(listRes.status, 200);
    const projList = (await listRes.json()) as any[];
    assert.equal(projList.some((p) => p.company.securityCode === "300661"), true);
    assert.equal(projList.some((p) => p.company.securityCode === "603160"), true);
  } finally {
    server!.close();
  }
});
