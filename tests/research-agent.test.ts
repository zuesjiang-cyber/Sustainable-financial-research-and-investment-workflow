import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { ResearchAgent } from "../src/server/agent/researchAgent";
import type { ThesisRevision, Fact, EvidenceSpan } from "../src/shared/domain";

test("ResearchAgent handles IN_PROGRESS annual forecasts without premature falsification", async () => {
  const agent = new ResearchAgent();
  const compId = crypto.randomUUID();
  const runId = crypto.randomUUID();
  const thesisId = crypto.randomUUID();
  const docId = crypto.randomUUID();

  // Thesis: FY2025 Gross Margin >= 30%
  const thesis: ThesisRevision = {
    id: crypto.randomUUID(),
    thesisId,
    revision: 1,
    groupId: crypto.randomUUID(),
    text: "综合毛利率达到 30%",
    originalText: "预计 2025 年综合毛利率有望达到 30%",
    sourceEvidenceIds: [],
    type: "NUMERIC_FORECAST",
    criterion: {
      kind: "COMPARE",
      metric: "gross_margin",
      op: "GTE",
      target: "30",
      unit: "RATIO",
      period: { start: "2025-01-01", end: "2025-12-31", basis: "YEAR" },
      scope: "CONSOLIDATED",
      origin: "REPORT_EXPLICIT",
    },
    priority: 10,
    derivedFromThesisIds: [],
    extractionIssues: [],
  };

  // Case 1: Q3 Interim Data: 31.2% (140M rev, 96.32M cost)
  // Period is YTD, not YEAR -> maturity should be IN_PROGRESS
  const q3RevFact: Fact = {
    id: crypto.randomUUID(),
    documentId: docId,
    companyId: compId,
    metric: "revenue",
    labelOriginal: "营业收入",
    segment: null,
    period: { start: "2025-01-01", end: "2025-09-30", basis: "YTD" },
    accountingStandard: "CAS",
    scope: "CONSOLIDATED",
    nature: "ACTUAL",
    value: "140000000",
    unit: "CURRENCY",
    currency: "CNY",
    customUnit: null,
    originalValue: "14000",
    originalUnit: "万元",
    scale: "1",
    publishedAt: "2025-10-28T08:00:00Z",
    restatementKey: "std",
    evidenceIds: [],
    extractionVersion: "1.0",
  };

  const q3CostFact: Fact = {
    id: crypto.randomUUID(),
    documentId: docId,
    companyId: compId,
    metric: "cost_of_revenue",
    labelOriginal: "营业成本",
    segment: null,
    period: { start: "2025-01-01", end: "2025-09-30", basis: "YTD" },
    accountingStandard: "CAS",
    scope: "CONSOLIDATED",
    nature: "ACTUAL",
    value: "96320000",
    unit: "CURRENCY",
    currency: "CNY",
    customUnit: null,
    originalValue: "9632",
    originalUnit: "万元",
    scale: "1",
    publishedAt: "2025-10-28T08:00:00Z",
    restatementKey: "std",
    evidenceIds: [],
    extractionVersion: "1.0",
  };

  const assessmentQ3 = await agent.assessThesis(
    thesis,
    { spans: [], facts: [q3RevFact, q3CostFact], calculations: [] },
    { runId, companyId: compId, asOf: "2025-11-01T00:00:00Z", allowedDocumentIds: [docId] }
  );

  assert.equal(assessmentQ3.maturity, "IN_PROGRESS");
  assert.equal(assessmentQ3.interimSignal, "ABOVE");
  assert.equal(assessmentQ3.status, "PARTIALLY_SUPPORTED");
  assert.equal(assessmentQ3.observedGap !== null, true);
  assert.equal(assessmentQ3.disclosedCauses.length >= 1, true);
  assert.equal(assessmentQ3.hypotheses.length >= 1, true);
  assert.equal(assessmentQ3.nextQuestions.length >= 1, true);

  // Case 2: Full Year Report Released (basis: YEAR, end: 2025-12-31)
  const fyRevFact: Fact = {
    ...q3RevFact,
    period: { start: "2025-01-01", end: "2025-12-31", basis: "YEAR" },
  };
  const fyCostFact: Fact = {
    ...q3CostFact,
    period: { start: "2025-01-01", end: "2025-12-31", basis: "YEAR" },
  };

  const assessmentFY = await agent.assessThesis(
    thesis,
    { spans: [], facts: [fyRevFact, fyCostFact], calculations: [] },
    { runId, companyId: compId, asOf: "2026-04-25T00:00:00Z", allowedDocumentIds: [docId] }
  );

  assert.equal(assessmentFY.maturity, "DUE");
  assert.equal(assessmentFY.status, "SUPPORTED");
});
