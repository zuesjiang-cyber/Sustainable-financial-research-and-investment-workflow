import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { ResearchExporter } from "../src/server/export/researchExporter";
import { DisclosureScheduler } from "../src/server/jobs/disclosureScheduler";
import { DEFAULT_LOCAL_WORKSPACE } from "../src/server/repos/workspaceContext";
import type { ResearchState } from "../src/shared/domain";

test("ResearchExporter exports structured markdown and JSON state bundle", () => {
  const exporter = new ResearchExporter();
  const projectId = crypto.randomUUID();
  const thesisId = crypto.randomUUID();

  const mockState: ResearchState = {
    schemaVersion: "1.0",
    projectId,
    version: 2,
    updateId: crypto.randomUUID(),
    confirmedAt: "2026-04-22T10:00:00Z",
    items: [
      {
        thesis: {
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
        },
        lifecycle: "ACTIVE",
        assessment: {
          id: crypto.randomUUID(),
          thesisId,
          thesisRevisionId: crypto.randomUUID(),
          inputHash: "h1",
          status: "SUPPORTED",
          maturity: "DUE",
          interimSignal: "ABOVE",
          summary: "年报毛利率达 30.50%，满足预期目标",
          factIds: [],
          calculationIds: [],
          evidenceIds: [],
          observedGap: { text: "毛利率 30.50% vs 30.00%", evidenceIds: [], factIds: [], calculationIds: [] },
          disclosedCauses: [{ text: "高规格产品放量", evidenceIds: [], factIds: [], calculationIds: [], attribution: "MANAGEMENT_EXPLANATION" }],
          hypotheses: [],
          conditions: [],
          nextQuestions: [],
          limitations: [],
        },
        userJudgment: "全年达标，符合买方预期",
      },
    ],
    questions: [
      {
        id: crypto.randomUUID(),
        thesisId,
        text: "关注2025年年报最终综合毛利率",
        requiredEvidence: "年报主营业务表",
        triggerPeriod: null,
        status: "ANSWERED",
        answer: { text: "2025年综合毛利率确认为 30.50%", evidenceIds: [], factIds: [], calculationIds: [] },
      },
    ],
    method: { version: 1, focusMetrics: [], aliases: {}, focusQuestions: [], preferences: [] },
    sourceManifest: {
      asOf: "2026-04-22T08:00:00Z",
      hash: "manifest-v2",
      documents: [
        {
          documentId: crypto.randomUUID(),
          sha256: "7f2a10cfa07e438eacba4328570c0678d4621c90538a741369cf8ab4d31d9961",
          purpose: "2025年年度报告",
        },
      ],
      latestCoveredPeriod: { start: "2025-01-01", end: "2025-12-31", basis: "YEAR" },
      checkedAt: "2026-04-22T08:00:00Z",
      discoveryStatus: "COMPLETE",
      missing: [],
    },
  };

  const bundle = exporter.exportResearchState(mockState, "圣邦股份", "300661");

  assert.equal(bundle.markdown.includes("# FinTrust 研报观点核验与持续研究报告"), true);
  assert.equal(bundle.markdown.includes("综合毛利率达到 30%"), true);
  assert.equal(bundle.markdown.includes("**SUPPORTED**"), true);
  assert.equal(bundle.markdown.includes("毛利率 30.50% vs 30.00%"), true);
  assert.equal(bundle.markdown.includes("全年达标，符合买方预期"), true);
  assert.equal(bundle.markdown.includes("Q1 [ANSWERED]:"), true);
  assert.equal(Boolean(bundle.stateJson), true);
  assert.equal(Boolean(bundle.manifestJson), true);
});
