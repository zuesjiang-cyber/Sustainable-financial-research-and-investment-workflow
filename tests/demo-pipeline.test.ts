import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createV1Router } from "../src/server/v1/v1Router";
import { V1Store } from "../src/server/v1/v1Store";

test("FinTrust Demo Pipeline: run-demo-t0 -> draft -> confirm -> project creation", async () => {
  const store = new V1Store();
  const router = createV1Router({ store });

  function mockRequestResponse(reqOptions: { method: string; url: string; body?: any }) {
    const req = Object.assign(new EventEmitter(), {
      method: reqOptions.method,
      url: reqOptions.url,
      params: {},
      query: {},
      headers: { "content-type": "application/json" },
      body: reqOptions.body || {},
    });

    return new Promise<{ status: number; body: any }>((resolve) => {
      let statusCode = 200;
      const res = Object.assign(new EventEmitter(), {
        statusCode: 200,
        setHeader() { return this; },
        getHeader() { return null; },
        status(code: number) {
          statusCode = code;
          this.statusCode = code;
          return this;
        },
        json(data: any) {
          resolve({ status: statusCode, body: data });
        },
      });

      router.handle(req as any, res as any, (err: any) => {
        if (err) {
          resolve({ status: err.statusCode || 500, body: { error: err.message } });
        } else {
          resolve({ status: 404, body: { error: "Not Found" } });
        }
      });
    });
  }

  // 1. GET /runs/run-demo-t0
  const res1 = await mockRequestResponse({ method: "GET", url: "/runs/run-demo-t0" });
  assert.equal(res1.status, 200);
  assert.equal(res1.body.id, "run-demo-t0");
  assert.equal(res1.body.companyCandidates[0].name, "圣邦股份");

  // 2. GET /runs/run-demo-t0/draft
  const res2 = await mockRequestResponse({ method: "GET", url: "/runs/run-demo-t0/draft" });
  assert.equal(res2.status, 200);
  assert.equal(res2.body.items.length, 2);

  // 3. POST /runs/run-demo-t0/draft/confirm with UUIDs
  const demoPayload = {
    draftRevision: 1,
    company: { name: "圣邦股份", securityCode: "300661", exchange: "SZSE" },
    theses: [
      {
        thesisId: "00000000-0000-4000-8000-000000000201",
        title: "综合毛利率达到 30% 以上",
        statement: "预计2025年综合毛利率有望达到30%以上，盈利能力显著修复。",
        type: "NUMERIC_FORECAST",
        criterion: {
          kind: "COMPARE",
          metric: "gross_margin",
          op: "GTE",
          target: "30",
          unit: "RATIO",
          period: { start: "2025-01-01", end: "2025-12-31", basis: "YEAR" },
          scope: "CONSOLIDATED",
        },
        sourceEvidenceIds: ["00000000-0000-4000-8000-000000000102"],
      },
      {
        thesisId: "00000000-0000-4000-8000-000000000202",
        title: "经营性现金流持续改善",
        statement: "经营活动产生的现金流量净额持续向好，营运资金效率提升。",
        type: "DIRECTIONAL",
        criterion: {
          kind: "TREND",
          metric: "operating_cash_flow",
          period: { start: "2025-01-01", end: "2025-12-31", basis: "YEAR" },
          scope: "CONSOLIDATED",
        },
        sourceEvidenceIds: ["00000000-0000-4000-8000-000000000102"],
      },
    ],
  };

  const res3 = await mockRequestResponse({
    method: "POST",
    url: "/runs/run-demo-t0/draft/confirm",
    body: demoPayload,
  });
  assert.equal(res3.status, 200, `Expected 200, got ${res3.status}: ${JSON.stringify(res3.body)}`);
  assert.equal(res3.body.version, "T0");
  assert.equal(res3.body.status, "COMPLETED");
  assert.equal(res3.body.project.company.name, "圣邦股份");
  assert.equal(Boolean(res3.body.projectId), true);

  // 4. Verify project is saved in store
  const savedProjectId = res3.body.projectId;
  const project = await store.getProject(savedProjectId);
  assert.equal(Boolean(project), true);
  assert.equal(project?.company.name, "圣邦股份");
  assert.equal(project?.theses.length, 2);

  // 5. Test backwards compatibility with legacy "span-thesis-1"
  const legacyPayload = {
    draftRevision: 1,
    company: { name: "圣邦股份", securityCode: "300661", exchange: "SZSE" },
    theses: [
      {
        thesisId: "00000000-0000-4000-8000-000000000201",
        title: "综合毛利率达到 30% 以上",
        statement: "预计2025年综合毛利率有望达到30%以上，盈利能力显著修复。",
        type: "NUMERIC_FORECAST",
        criterion: {
          kind: "COMPARE",
          metric: "gross_margin",
          op: "GTE",
          target: "30",
          unit: "RATIO",
          period: { start: "2025-01-01", end: "2025-12-31", basis: "YEAR" },
          scope: "CONSOLIDATED",
        },
        sourceEvidenceIds: ["span-thesis-1"],
      },
    ],
  };

  const res4 = await mockRequestResponse({
    method: "POST",
    url: "/runs/run-demo-t0/draft/confirm",
    body: legacyPayload,
  });
  assert.equal(res4.status, 200, `Expected 200, got ${res4.status}: ${JSON.stringify(res4.body)}`);
});
