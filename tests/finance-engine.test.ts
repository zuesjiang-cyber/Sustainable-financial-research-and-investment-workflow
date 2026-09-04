import test from "node:test";
import assert from "node:assert/strict";
import Decimal from "decimal.js";
import { readFileSync } from "node:fs";
import { computeFinTrustAnalysis, evaluateStructuredCondition, parseThresholdString } from "../src/lib/fintrustEngine";
import type { CaseInput } from "../src/types/fintrust";

const fixture = (): CaseInput => JSON.parse(readFileSync("project/tests/fixtures/alternate_case_input.json", "utf8"));

test("inclusive/exclusive threshold operators, negatives and arbitrary intervals", () => {
  assert.deepEqual(parseThresholdString("不超过20%"), { operator: "<=", value: 20, unit: "%" });
  assert.equal(parseThresholdString(">=15%")?.operator, ">=");
  assert.equal(parseThresholdString("<= 20%")?.operator, "<=");
  assert.deepEqual(parseThresholdString("同比下降 >0.50 个百分点"), { operator: "<", value: -0.5, unit: "pct" });
  assert.equal(parseThresholdString("变化低于 -1%")?.value, -1);
  assert.deepEqual(parseThresholdString("30%–35%"), { operator: "between", value: 30, value2: 35, unit: "%" });
  assert.deepEqual(parseThresholdString("±1.25 个百分点"), { operator: "between", value: -1.25, value2: 1.25, unit: "pct" });
  assert.equal(evaluateStructuredCondition(new Decimal(20), { metric: "x", operator: "<=", value: 20, unit: "%" }).passed, true);
  assert.equal(evaluateStructuredCondition(new Decimal(20), { metric: "x", operator: "<", value: 20, unit: "%" }).passed, false);
});

test("a +0.10 pp margin change is not reported as a decline", () => {
  const input = fixture();
  for (const fact of input.facts) {
    if (fact.metric === "revenue") { fact.value = "100"; fact.unit = "元"; }
    if (fact.metric === "cost") { fact.value = fact.period === input.case.base_period ? "50" : "49.9"; fact.unit = "元"; }
  }
  const pillar = input.thesis_pillars.find((p) => p.id === "profit_quality")!;
  pillar.baseline_threshold = "±0.50 个百分点";
  pillar.strengthen_threshold = "提升超过0.50个百分点";
  pillar.weaken_threshold = "下降超过0.50个百分点";
  const result = computeFinTrustAnalysis(input).thesis_updates.find((p) => p.pillar_id === pillar.id)!;
  assert.equal(result.status, "保持");
  assert.doesNotMatch(result.reason, /降至/);
});

test("structured condition metric and operators take precedence over legacy hardcodes", () => {
  const input = fixture();
  const pillar = input.thesis_pillars[0];
  pillar.structured_conditions = { strengthen: { metric: "revenue_yoy", operator: "<=", value: 10000, unit: "%" } };
  assert.equal(computeFinTrustAnalysis(input).thesis_updates[0].status, "加强");
  pillar.structured_conditions = { strengthen: { metric: "not_registered", operator: ">", value: 1, unit: "%" } };
  assert.equal(computeFinTrustAnalysis(input).thesis_updates[0].status, "待评估");
});

test("zero base remains incalculable, normalized source units are equivalent", () => {
  const input = fixture();
  const before = computeFinTrustAnalysis(input);
  input.facts = input.facts.map((f) => ({ ...f, value: new Decimal(f.value).div(10000).toString(), unit: "万元" }));
  assert.equal(computeFinTrustAnalysis(input).metrics.revenue_yoy.current_value, before.metrics.revenue_yoy.current_value);
  input.facts.find((f) => f.metric === "revenue" && f.period === input.case.base_period)!.value = "0";
  const output = computeFinTrustAnalysis(input);
  assert.equal(output.metrics.revenue_yoy.delta_type, "incalculable");
  assert.doesNotMatch(output.metrics.revenue_yoy.description, /undefined|NaN|Infinity/);
});
