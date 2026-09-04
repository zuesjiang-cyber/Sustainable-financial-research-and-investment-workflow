import test from "node:test";
import assert from "node:assert/strict";
import { ingestMaterial } from "../src/server/materialIngestion";
import { calculateFinancialMetrics } from "../src/server/researchTools";
import { validateResearchClaims } from "../src/server/claimVerification";
import type { ProjectState } from "../src/types/fintrust";

const project: ProjectState = { id: "p", name: "测试", company: "测试公司", ticker: "TEST", current_version: "T0", status: "active", summary: "", created_at: "", updated_at: "", documents: [], updates: [], open_questions: [], theses: [{ id: "t", project_id: "p", title: "收入", original_view: "收入增长", current_status: "保持", formed_at: "", basis: "", verification_criteria: "", verification_timeframe: "", citations: [], updated_at: "" }] };
const material = ingestMaterial(project.id, { title: "2025 测试年报", content: "2025年营业收入120万元；2024年营业收入100万元。\n2025年净利润20万元。" });
const context = { project, material };
const evidence = material.evidence_snippets[0].id;
const current = { metric: "营业收入", period: "2025", value: "120", unit: "万元", evidence_id: evidence };
const prior = { metric: "营业收入", period: "2024", value: "100", unit: "万元", evidence_id: evidence };

test("financial tool cannot upgrade source 万元 to 亿元", () => {
  const output = calculateFinancialMetrics(context, { operation: "yoy", current: { ...current, unit: "亿元" }, prior });
  assert.equal(output.status, "error", JSON.stringify(output));
});
test("financial tool rejects invented periods and mismatched metrics", () => {
  assert.equal(calculateFinancialMetrics(context, { operation: "yoy", current: { ...current, period: "2030" }, prior }).status, "error");
  assert.equal(calculateFinancialMetrics(context, { operation: "yoy", current, prior: { ...prior, metric: "净利润" } }).status, "error");
});
test("ratio operands must describe the same accounting period", () => {
  assert.equal(calculateFinancialMetrics(context, { operation: "ratio", numerator: current, denominator: prior }).status, "error");
});
test("quoting revenue does not verify a profit claim", () => {
  const output = validateResearchClaims([{ id: "c", thesis_id: "t", kind: "source", claim_text: "2025年净利润120万元", quote: "2025年营业收入120万元", evidence_ids: [evidence] }], context);
  assert.notEqual(output.claims[0].verification, "verified");
});
test("an inference cannot become a verified fact from direction words alone", () => {
  const input = ingestMaterial("p", { title: "测试材料", content: "2025年收入增长20%。" });
  const output = validateResearchClaims([{ id: "c", thesis_id: "t", kind: "inference", claim_text: "护城河巩固使收入增长20%", quote: input.content, evidence_ids: [input.evidence_snippets[0].id] }], { project, material: input });
  assert.notEqual(output.claims[0].verification, "verified");
});
test("calculation verification requires the asserted result and unit, not a random matching number", () => {
  const calc = calculateFinancialMetrics(context, { operation: "yoy", current, prior });
  assert.equal(calc.status, "ok", JSON.stringify(calc));
  const output = validateResearchClaims([{ id: "c", thesis_id: "t", kind: "calculated", claim_text: "营业收入增长20亿元", calculation_id: calc.calculation_id, evidence_ids: calc.evidence_ids }], context, [calc]);
  assert.notEqual(output.claims[0].verification, "verified");
});
