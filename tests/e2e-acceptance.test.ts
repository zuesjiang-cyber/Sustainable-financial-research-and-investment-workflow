import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import Decimal from "decimal.js";
import { ThesisExtractor } from "../src/server/documents/thesisExtractor";
import { OfficialFilingProvider } from "../src/server/disclosures/officialFilingProvider";
import { FactExtractor } from "../src/server/facts/factExtractor";
import { MetricRegistry } from "../src/server/facts/metricRegistry";
import { ResearchAgent } from "../src/server/agent/researchAgent";
import { ContextCompiler } from "../src/server/memory/contextCompiler";
import { DiffGenerator } from "../src/server/memory/diffGenerator";
import { StateManager } from "../src/server/memory/stateManager";
import { ResearchExporter } from "../src/server/export/researchExporter";
import type {
  ThesisRevision,
  ThesisAssessment,
  ResearchState,
  UserCorrection,
  EvidenceSpan,
  Fact,
} from "../src/shared/domain";

test("FinTrust V1 Acceptance: Full 6-Criterion End-to-End Lifecycle", async () => {
  // =========================================================================
  // CRITERION 1 & 6: Multi-Company Dynamic Extraction (Not hardcoded for one)
  // =========================================================================
  const extractor = new ThesisExtractor();

  // Company 1: 深市 圣邦股份 300661
  const sbgSpans: EvidenceSpan[] = [
    {
      id: crypto.randomUUID(),
      documentId: crypto.randomUUID(),
      parseId: crypto.randomUUID(),
      regions: [{ pageNumber: 1, bbox: [0, 0, 1, 1] }],
      quote: "【圣邦股份 300661 2025年6月15日研报】预计2025年综合毛利率有望达到30%，经营活动现金流净额持续改善。",
      textHash: "h_sbg",
      headingPath: ["深度研报"],
      quality: "NATIVE",
    },
  ];
  const sbgRes = await extractor.extractTheses(sbgSpans);
  assert.equal(sbgRes.identification.identifiedCompany?.securityCode, "300661");
  assert.equal(sbgRes.theses.length >= 2, true);

  // Company 2: 沪市 汇顶科技 603160 (Proves system is general, not single-company hardcoded)
  const goodixSpans: EvidenceSpan[] = [
    {
      id: crypto.randomUUID(),
      documentId: crypto.randomUUID(),
      parseId: crypto.randomUUID(),
      regions: [{ pageNumber: 1, bbox: [0, 0, 1, 1] }],
      quote: "【汇顶科技 603160 2025年4月10日研报】车载触控传感放量，营业收入增长超过20%，经营现金流保持向好。",
      textHash: "h_goodix",
      headingPath: ["公司深度"],
      quality: "NATIVE",
    },
  ];
  const goodixRes = await extractor.extractTheses(goodixSpans);
  assert.equal(goodixRes.identification.identifiedCompany?.securityCode, "603160");
  assert.equal(goodixRes.theses.length >= 2, true);

  // =========================================================================
  // CRITERION 2: Tracing to PDF & 3-Part Gap Attribution
  // =========================================================================
  const filingProvider = new OfficialFilingProvider();
  const filings = await filingProvider.searchDisclosures("300661", "SZSE");
  assert.equal(filings.items.length >= 2, true);

  const docReportId = crypto.randomUUID();
  const docFilingQ3Id = crypto.randomUUID();
  const compId = crypto.randomUUID();
  const thesisId = crypto.randomUUID();

  // Spans with physical page numbers
  const reportSpan: EvidenceSpan = {
    id: crypto.randomUUID(),
    documentId: docReportId,
    parseId: crypto.randomUUID(),
    regions: [{ pageNumber: 1, bbox: [0.08, 0.15, 0.92, 0.22] }],
    quote: "预计2025年综合毛利率有望达到30%",
    textHash: "hash_rep_1",
    headingPath: ["核心观点"],
    quality: "NATIVE",
  };

  const filingQ3Span: EvidenceSpan = {
    id: crypto.randomUUID(),
    documentId: docFilingQ3Id,
    parseId: crypto.randomUUID(),
    regions: [{ pageNumber: 85, bbox: [0.05, 0.4, 0.95, 0.45] }],
    quote: "营业收入: 14000 万元，营业成本: 9632 万元",
    textHash: "hash_filing_q3",
    headingPath: ["三季度财务报表"],
    quality: "NATIVE",
  };

  // Facts extraction
  const factExtractor = new FactExtractor();
  const q3Facts = factExtractor.extractFactsFromSpans([filingQ3Span], {
    companyId: compId,
    documentId: docFilingQ3Id,
    period: { start: "2025-01-01", end: "2025-09-30", basis: "YTD" },
    publishedAt: "2025-10-28T08:00:00Z",
  });
  assert.equal(q3Facts.length, 2);

  // Agent assessment for Round 1 (Interim data)
  const agent = new ResearchAgent();
  const thesisRev1: ThesisRevision = {
    id: crypto.randomUUID(),
    thesisId,
    revision: 1,
    groupId: crypto.randomUUID(),
    text: "综合毛利率达到 30%",
    originalText: "预计2025年综合毛利率有望达到30%",
    sourceEvidenceIds: [reportSpan.id],
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

  const assessmentRound1 = await agent.assessThesis(
    thesisRev1,
    { spans: [reportSpan, filingQ3Span], facts: q3Facts, calculations: [] },
    { runId: crypto.randomUUID(), companyId: compId, asOf: "2025-11-01T00:00:00Z", allowedDocumentIds: [docReportId, docFilingQ3Id] }
  );

  // Check 3-part gap explanation & maturity
  assert.equal(assessmentRound1.maturity, "IN_PROGRESS");
  assert.equal(assessmentRound1.interimSignal, "ABOVE");
  assert.equal(assessmentRound1.status, "PARTIALLY_SUPPORTED");
  assert.equal(assessmentRound1.observedGap !== null, true);
  assert.equal(assessmentRound1.disclosedCauses.length >= 1, true);
  assert.equal(assessmentRound1.hypotheses.length >= 1, true);

  // =========================================================================
  // CRITERION 3: User Modifies Criterion & Confirms State V1
  // =========================================================================
  const stateManager = new StateManager();
  const draftV1 = stateManager.buildDraftObject({
    runId: crypto.randomUUID(),
    projectId: crypto.randomUUID(),
    baseStateVersion: 0,
    items: [
      {
        thesis: thesisRev1,
        previous: null,
        proposed: assessmentRound1,
        change: "NEW",
        changeReason: "研报初次建档",
        include: true,
        userJudgment: "三季度良好，四季度仍需防范上游供应链波动",
      },
    ],
    sourceManifest: {
      asOf: "2025-11-01T00:00:00Z",
      hash: "manifest-1",
      documents: [
        { documentId: docReportId, sha256: "sha_rep", purpose: "研报原件" },
        { documentId: docFilingQ3Id, sha256: "sha_q3", purpose: "三季报" },
      ],
      latestCoveredPeriod: { start: "2025-01-01", end: "2025-09-30", basis: "YTD" },
      checkedAt: "2025-11-01T00:00:00Z",
      discoveryStatus: "COMPLETE",
      missing: [],
    },
  });

  const stateV1 = stateManager.buildStateSnapshotFromDraft(draftV1, 1, crypto.randomUUID());
  assert.equal(stateV1.version, 1);
  assert.equal(stateV1.items[0].userJudgment, "三季度良好，四季度仍需防范上游供应链波动");

  // =========================================================================
  // CRITERION 4: Round 2 Evolution (FY report, inherited judgments, V2 diff)
  // =========================================================================
  const docFilingFYId = crypto.randomUUID();
  const filingFYSpan: EvidenceSpan = {
    id: crypto.randomUUID(),
    documentId: docFilingFYId,
    parseId: crypto.randomUUID(),
    regions: [{ pageNumber: 120, bbox: [0.05, 0.35, 0.95, 0.42] }],
    quote: "营业收入: 185000 万元，营业成本: 128575 万元", // 毛利率 30.50%
    textHash: "hash_fy",
    headingPath: ["年度合并财务报表"],
    quality: "NATIVE",
  };

  const fyFacts = factExtractor.extractFactsFromSpans([filingFYSpan], {
    companyId: compId,
    documentId: docFilingFYId,
    period: { start: "2025-01-01", end: "2025-12-31", basis: "YEAR" },
    publishedAt: "2026-04-21T08:00:00Z",
  });

  const assessmentRound2 = await agent.assessThesis(
    thesisRev1,
    { spans: [reportSpan, filingFYSpan], facts: fyFacts, calculations: [] },
    { runId: crypto.randomUUID(), companyId: compId, asOf: "2026-04-22T00:00:00Z", allowedDocumentIds: [docReportId, docFilingFYId] }
  );

  assert.equal(assessmentRound2.maturity, "DUE");
  assert.equal(assessmentRound2.status, "SUPPORTED");

  // Diff Generator compares V1 vs Round 2
  const diffGenerator = new DiffGenerator();
  const diffItems = diffGenerator.generateDraftItems(
    [thesisRev1],
    new Map([[thesisId, assessmentRound2]]),
    stateV1
  );

  assert.equal(diffItems.length, 1);
  assert.equal(diffItems[0].change, "CHANGED");
  assert.equal(diffItems[0].previous?.status, "PARTIALLY_SUPPORTED");
  assert.equal(diffItems[0].proposed.status, "SUPPORTED");
  // Inherited user judgment verified
  assert.equal(diffItems[0].userJudgment, "三季度良好，四季度仍需防范上游供应链波动");

  const stateV2 = stateManager.buildStateSnapshotFromDraft(
    {
      ...draftV1,
      revision: 2,
      baseStateVersion: 1,
      items: diffItems,
      sourceManifest: {
        ...draftV1.sourceManifest,
        asOf: "2026-04-22T00:00:00Z",
        latestCoveredPeriod: { start: "2025-01-01", end: "2025-12-31", basis: "YEAR" },
      },
    },
    2,
    crypto.randomUUID()
  );
  assert.equal(stateV2.version, 2);

  // Exporter test
  const exporter = new ResearchExporter();
  const exportBundle = exporter.exportResearchState(stateV2, "圣邦股份", "300661");
  assert.equal(exportBundle.markdown.includes("v2"), true);
  assert.equal(exportBundle.markdown.includes("SUPPORTED"), true);
});
