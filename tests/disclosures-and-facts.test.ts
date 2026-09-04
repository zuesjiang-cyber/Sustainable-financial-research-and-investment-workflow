import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import Decimal from "decimal.js";
import { OfficialFilingProvider } from "../src/server/disclosures/officialFilingProvider";
import { FactExtractor } from "../src/server/facts/factExtractor";
import { MetricRegistry } from "../src/server/facts/metricRegistry";
import type { Fact, EvidenceSpan } from "../src/shared/domain";

test("OfficialFilingProvider retrieves official disclosures with metadata", async () => {
  const provider = new OfficialFilingProvider();
  const res = await provider.searchDisclosures("300661", "SZSE");

  assert.equal(res.items.length >= 2, true);
  assert.equal(res.items[0].securityCode, "300661");
  assert.equal(Boolean(res.items[0].period), true);
  assert.equal(Boolean(res.coverageAsOf), true);
  assert.equal(["CNINFO_LIVE", "OFFLINE_BUNDLE"].includes(res.source), true);
});

test("FactExtractor standardizes revenue and cost into CAS consolidated facts", () => {
  const extractor = new FactExtractor();
  const docId = crypto.randomUUID();
  const compId = crypto.randomUUID();

  const spans: EvidenceSpan[] = [
    {
      id: crypto.randomUUID(),
      documentId: docId,
      parseId: crypto.randomUUID(),
      regions: [{ pageNumber: 85, bbox: [0, 0, 1, 1] }],
      quote: "营业收入: 14000 万元，营业成本: 9660 万元，经营活动产生的现金流量净额: 4660 万元",
      textHash: "h1",
      headingPath: ["利润表"],
      quality: "NATIVE",
    },
  ];

  const facts = extractor.extractFactsFromSpans(spans, {
    companyId: compId,
    documentId: docId,
    period: { start: "2025-01-01", end: "2025-12-31", basis: "YEAR" },
    publishedAt: "2026-04-20T10:00:00Z",
  });

  assert.equal(facts.length, 3);

  const rev = facts.find((f) => f.metric === "revenue");
  assert.equal(Boolean(rev), true);
  assert.equal(rev?.value, "140000000"); // 14000 万元 -> 140,000,000 元
  assert.equal(rev?.scope, "CONSOLIDATED");

  const cost = facts.find((f) => f.metric === "cost_of_revenue");
  assert.equal(Boolean(cost), true);
  assert.equal(cost?.value, "96600000"); // 9660 万元 -> 96,600,000 元

  // A narrative percentage must not be mistaken for the revenue amount.
  const narrativeFacts = extractor.extractFactsFromSpans([{
    ...spans[0],
    id: crypto.randomUUID(),
    quote: "营业收入同比增长12.4%，达到13.2亿元。",
  }], {
    companyId: compId,
    documentId: docId,
    period: { start: "2025-01-01", end: "2025-12-31", basis: "YEAR" },
    publishedAt: "2026-04-20T10:00:00Z",
    metrics: ["revenue"],
  });
  assert.equal(narrativeFacts[0]?.originalValue, "13.2");
});

test("MetricRegistry calculates gross margin and yoy growth accurately", () => {
  const registry = new MetricRegistry();
  const compId = crypto.randomUUID();
  const docId = crypto.randomUUID();

  const revFact: Fact = {
    id: crypto.randomUUID(),
    documentId: docId,
    companyId: compId,
    metric: "revenue",
    labelOriginal: "营业收入",
    segment: null,
    period: { start: "2025-01-01", end: "2025-12-31", basis: "YEAR" },
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
    publishedAt: "2026-04-20T10:00:00Z",
    restatementKey: "std",
    evidenceIds: [],
    extractionVersion: "1.0",
  };

  const costFact: Fact = {
    id: crypto.randomUUID(),
    documentId: docId,
    companyId: compId,
    metric: "cost_of_revenue",
    labelOriginal: "营业成本",
    segment: null,
    period: { start: "2025-01-01", end: "2025-12-31", basis: "YEAR" },
    accountingStandard: "CAS",
    scope: "CONSOLIDATED",
    nature: "ACTUAL",
    value: "96600000",
    unit: "CURRENCY",
    currency: "CNY",
    customUnit: null,
    originalValue: "9660",
    originalUnit: "万元",
    scale: "1",
    publishedAt: "2026-04-20T10:00:00Z",
    restatementKey: "std",
    evidenceIds: [],
    extractionVersion: "1.0",
  };

  // 1. Gross margin: (140M - 96.6M) / 140M = 43.4M / 140M = 0.31 (31%)
  const marginRes = registry.computeGrossMargin(revFact, costFact);
  assert.equal(marginRes.result, "0.31");
  assert.equal(marginRes.checks.every((c) => c.passed), true);

  // 2. Margin change: 31% - 30% = +1.00 pct
  const changeRes = registry.computeMarginChange(new Decimal("0.31"), new Decimal("0.30"));
  assert.equal(changeRes.result, "1"); // 1 percentage point

  // 3. Negative base YoY: previous <= 0 cannot compute conventional positive growth
  const negativePrevFact: Fact = { ...revFact, value: "-1000" };
  const yoyRes = registry.computeYoYGrowth(revFact, negativePrevFact);
  assert.equal(yoyRes.result, null);
  assert.equal(yoyRes.checks.some((c) => c.code === "POSITIVE_BASE" && !c.passed), true);
});
