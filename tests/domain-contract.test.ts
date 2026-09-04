import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  CompanySchema,
  DraftSchema,
  ResearchStateSchema,
  EvidenceBundleSchema,
  OutcomeSchema,
  ConditionSchema,
  UserCorrectionSchema,
} from "../src/shared/domain";

test("domain contract validates two-round-research fixture", () => {
  const fixturePath = path.resolve("docs/product-architecture-v1/examples/two-round-research.json");
  const rawData = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));

  // 1. Company
  const company = CompanySchema.parse(rawData.company);
  assert.equal(company.exchange, "SSE");
  assert.equal(company.securityCode, "DEMO_ONLY");

  // 2. Evidence bundle
  const evidenceBundle = EvidenceBundleSchema.parse(rawData.evidenceBundle);
  assert.equal(evidenceBundle.documents.length, 3);
  assert.equal(evidenceBundle.spans.length >= 1, true);

  // 3. User Correction
  const userCorrection = UserCorrectionSchema.parse(rawData.userCorrection);
  assert.equal(userCorrection.type, "USER_JUDGMENT");

  // 4. Round 1 Confirmed State (state1)
  const round1State = ResearchStateSchema.parse(rawData.state1);
  assert.equal(round1State.version, 1);
  assert.equal(round1State.items.length >= 1, true);
  assert.equal(round1State.items[0].assessment.status, "UNRESOLVED");

  // 5. Round 2 Draft (draft2)
  const round2Draft = DraftSchema.parse(rawData.draft2);
  assert.equal(round2Draft.items.length >= 1, true);

  // 6. Round 2 Confirmed State (state2)
  const round2State = ResearchStateSchema.parse(rawData.state2);
  assert.equal(round2State.version, 2);
  assert.equal(round2State.items[0].assessment.status, "SUPPORTED");
});

test("domain contract rejects invalid data", () => {
  // Invalid outcome
  assert.throws(() => {
    OutcomeSchema.parse("INVALID_OUTCOME");
  });

  // Invalid condition without origin
  assert.throws(() => {
    ConditionSchema.parse({
      kind: "COMPARE",
      metric: "gross_margin",
      op: "GTE",
      target: "30",
      unit: "RATIO",
      period: { start: null, end: "2025-12-31", basis: "YEAR" },
      scope: "CONSOLIDATED",
    });
  });
});
