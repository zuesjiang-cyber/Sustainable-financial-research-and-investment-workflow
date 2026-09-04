import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { ContextCompiler } from "../src/server/memory/contextCompiler";
import { DiffGenerator } from "../src/server/memory/diffGenerator";
import { StateManager } from "../src/server/memory/stateManager";
import type {
  ResearchState,
  ThesisRevision,
  ThesisAssessment,
  UserCorrection,
} from "../src/shared/domain";

test("Memory evolution: compiler inherits corrections, diff generator explains round transition", () => {
  const compiler = new ContextCompiler();
  const diffGenerator = new DiffGenerator();
  const stateManager = new StateManager();

  const projectId = crypto.randomUUID();
  const thesisId = crypto.randomUUID();

  const thesis: ThesisRevision = {
    id: crypto.randomUUID(),
    thesisId,
    revision: 1,
    groupId: crypto.randomUUID(),
    text: "综合毛利率有望达到 30%",
    originalText: "预计2025年毛利率超30%",
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

  const initialAssessment: ThesisAssessment = {
    id: crypto.randomUUID(),
    thesisId,
    thesisRevisionId: thesis.id,
    inputHash: "h1",
    status: "PARTIALLY_SUPPORTED",
    maturity: "IN_PROGRESS",
    interimSignal: "ABOVE",
    summary: "三季报毛利率 31.2%，全年未到期",
    factIds: [],
    calculationIds: [],
    evidenceIds: [],
    observedGap: { text: "毛利率 31.2% vs 30%", evidenceIds: [], factIds: [], calculationIds: [] },
    disclosedCauses: [],
    hypotheses: [],
    conditions: [],
    nextQuestions: [],
    limitations: [],
  };

  // State V1 (Round 1 confirmed)
  const stateV1: ResearchState = {
    schemaVersion: "1.0",
    projectId,
    version: 1,
    updateId: crypto.randomUUID(),
    confirmedAt: "2025-11-01T10:00:00Z",
    items: [
      {
        thesis,
        lifecycle: "ACTIVE",
        assessment: initialAssessment,
        userJudgment: "三季度符合预期，但需警惕晶圆代工涨价风险",
      },
    ],
    questions: [
      {
        id: crypto.randomUUID(),
        thesisId,
        text: "关注四季度晶圆制造代工价格变动",
        requiredEvidence: "财报附注",
        triggerPeriod: null,
        status: "OPEN",
        answer: null,
      },
    ],
    method: { version: 1, focusMetrics: [], aliases: {}, focusQuestions: [], preferences: [] },
    sourceManifest: {
      asOf: "2025-11-01T10:00:00Z",
      hash: "manifest-1",
      documents: [],
      latestCoveredPeriod: null,
      checkedAt: "2025-11-01T10:00:00Z",
      discoveryStatus: "COMPLETE",
      missing: [],
    },
  };

  // 1. User correction: user tightened the target from 30% to 32%
  const correction: UserCorrection = {
    id: crypto.randomUUID(),
    thesisId,
    type: "CRITERION",
    action: "SET",
    before: thesis.criterion,
    after: { ...thesis.criterion, target: "32" },
    reason: "分析师提高要求至 32%",
    baseStateVersion: 1,
    createdAt: "2025-12-01T10:00:00Z",
  };

  // Compile context for Round 2
  const compiled = compiler.compileContext(projectId, stateV1, [correction]);
  assert.equal(compiled.baseStateVersion, 1);
  assert.equal(compiled.thesesToAssess.length, 1);
  // Verified: correction applied to thesis in compiled context
  assert.equal((compiled.thesesToAssess[0].criterion as any).target, "32");
  assert.equal(compiled.openQuestions.length, 1);

  // 2. Round 2 assessment after FY2025 report released (30.5%毛利率)
  const round2Assessment: ThesisAssessment = {
    ...initialAssessment,
    id: crypto.randomUUID(),
    status: "SUPPORTED",
    maturity: "DUE",
    summary: "年报正式公布，全年综合毛利率达 30.5% >= 30%",
  };

  const newAssessments = new Map<string, ThesisAssessment>();
  newAssessments.set(thesisId, round2Assessment);

  // 3. Diff Generator compares V1 vs Round 2
  const diffItems = diffGenerator.generateDraftItems([thesis], newAssessments, stateV1);
  assert.equal(diffItems.length, 1);
  assert.equal(diffItems[0].change, "CHANGED");
  assert.equal(diffItems[0].previous?.status, "PARTIALLY_SUPPORTED");
  assert.equal(diffItems[0].proposed.status, "SUPPORTED");
  // Verified: user judgment carried over
  assert.equal(diffItems[0].userJudgment, "三季度符合预期，但需警惕晶圆代工涨价风险");

  // 4. Resolve questions
  const resolvedQuestions = diffGenerator.resolveQuestions(stateV1.questions, newAssessments);
  assert.equal(resolvedQuestions[0].status, "ANSWERED");
  assert.equal(Boolean(resolvedQuestions[0].answer), true);
});
