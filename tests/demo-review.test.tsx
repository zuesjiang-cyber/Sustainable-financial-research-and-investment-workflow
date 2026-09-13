/**
 * Acceptance tests for 画面一 (analysis animation) and 画面二 (fact / inference
 * review surface) — the two surfaces introduced by
 * docs/product-architecture-v1/18_产品完整设计稿.md §11.
 *
 * These are written as product rules rather than snapshot assertions, because
 * the rules are the product. Each block names the criterion it defends, and the
 * interesting ones test the *code* rather than the fixture: a guarantee that
 * only holds for the data currently loaded is not a guarantee.
 *
 * Run: npm run test:demo
 */
import test from "node:test";
import assert from "node:assert/strict";
import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AnalysisRun, ANALYSIS_STAGES } from "../src/demo/AnalysisRun";
import { ReviewSurface } from "../src/demo/ReviewSurface";
import {
  FINDINGS,
  OVERCLAIMING_PHRASES,
  findingsKey,
  inferenceIsWellFormed,
  natureCapsFact,
  partitionFindings,
} from "../src/demo/findings";
import { NATURE } from "../src/demo/meta";
import { PHILOSOPHY_DEMO } from "../src/demo/philosophyDemo";
import type { Fact, RoundFindings } from "../src/demo/types";

const demo = PHILOSOPHY_DEMO;
const render = (node: React.ReactElement) => renderToStaticMarkup(node);
const noop = () => {};

const allRounds = Object.entries(FINDINGS);
const allFacts = allRounds.flatMap(([key, r]) => r.facts.map((f) => ({ key, f })));
const allInferences = allRounds.flatMap(([key, r]) =>
  r.inferences.map((i) => ({ key, i })),
);

/* ══════════════════════════════════════════════════════════════
   A1 — facts are binary, with no degrees
   ══════════════════════════════════════════════════════════════ */

test("A1: every fact is HOLDS or FAILS, and never a shade between", () => {
  assert.ok(allFacts.length > 0, "the fixture must actually produce facts");
  for (const { key, f } of allFacts) {
    assert.ok(
      f.verdict === "HOLDS" || f.verdict === "FAILS",
      `${key}: fact verdict ${f.verdict} is not binary`,
    );
  }

  /* The surface must not reintroduce degrees through its wording. */
  for (const version of demo.versions) {
    const html = render(
      <ReviewSurface
        version={version}
        theses={demo.theses}
        onOpenEvidence={noop}
        onConfirm={noop}
        onCancel={noop}
      />,
    );
    for (const hedged of ["部分成立", "基本成立", "大致符合", "接近成立", "可能成立"]) {
      assert.ok(!html.includes(hedged), `${version.version}: fact hedged as 「${hedged}」`);
    }
  }
});

test("A1b: a failing fact always says why", () => {
  for (const { key, f } of allFacts) {
    if (f.verdict === "FAILS") {
      assert.ok(
        f.failReason && f.failReason.trim().length > 0,
        `${key}: 「${f.statement}」 fails without a reason — that is not an audit trail`,
      );
    }
  }
});

/* ══════════════════════════════════════════════════════════════
   A2 / A3 — inferences are restrained and labelled
   ══════════════════════════════════════════════════════════════ */

test("A2: every inference carries 依据, 局限 and 缺口", () => {
  for (const { key, i } of allInferences) {
    assert.ok(inferenceIsWellFormed(i), `${key}: inference missing basis/limitation/gap: ${i.text}`);
  }
});

test("A2b: no inference asserts proof", () => {
  for (const { key, i } of allInferences) {
    for (const phrase of OVERCLAIMING_PHRASES) {
      assert.ok(
        !i.text.includes(phrase),
        `${key}: inference overclaims with 「${phrase}」: ${i.text}`,
      );
    }
  }
});

test("A3: every rendered inference is labelled as an inference", () => {
  for (const version of demo.versions) {
    const html = render(
      <ReviewSurface
        version={version}
        theses={demo.theses}
        onOpenEvidence={noop}
        onConfirm={noop}
        onCancel={noop}
      />,
    );
    const chips = html.match(/class="rv-inference-tag"/g)?.length ?? 0;
    const expected = demo.theses.reduce((n, t) => {
      const round = FINDINGS[findingsKey(t.thesisId, version.version)];
      if (!round || !t.versions[version.version]) return n;
      return n + partitionFindings(round).inferences.filter(inferenceIsWellFormed).length;
    }, 0);
    assert.equal(
      chips,
      expected,
      `${version.version}: ${chips} 推论 labels for ${expected} inferences — one is unlabelled`,
    );
    if (expected > 0) {
      assert.ok(
        html.includes("依据") && html.includes("局限") && html.includes("缺口"),
        `${version.version}: inference sub-fields not rendered`,
      );
    }
  }
});

/* ══════════════════════════════════════════════════════════════
   A4 — an unaudited forecast can never make a numeric fact hold
   Tested against the code, with a synthetic fact, so the rule is a
   guarantee rather than a property of the current fixture.
   ══════════════════════════════════════════════════════════════ */

const forecastFact: Fact = {
  statement: "2025 年度综合毛利率 ≥ 51.0%",
  verdict: "HOLDS",
  kind: "NUMERIC",
  nature: "FORECAST",
  source: { fileName: "圣邦股份_2025年度业绩预告.pdf", page: 2, locator: "B3" },
};

test("A4: the nature table caps forecasts and express reports", () => {
  for (const nature of ["FORECAST", "PRELIMINARY", "NARRATIVE", "THIRD_PARTY"] as const) {
    assert.equal(
      NATURE[nature].canSettleNumericFact,
      false,
      `${nature} must not be able to settle a numeric fact`,
    );
  }
  for (const nature of ["AUDITED", "UNAUDITED_ACTUAL"] as const) {
    assert.equal(NATURE[nature].canSettleNumericFact, true, `${nature} should settle a numeric fact`);
  }
});

test("A4b: a forecast-backed HOLDS is demoted to a tentative inference", () => {
  assert.ok(natureCapsFact(forecastFact), "a FORECAST numeric fact must be capped");

  const round: RoundFindings = { facts: [forecastFact], inferences: [] };
  const out = partitionFindings(round);

  assert.equal(out.facts.length, 0, "the capped fact must not survive as a fact");
  assert.equal(out.demoted.length, 1, "the demotion must be recorded");
  assert.equal(out.inferences.length, 1, "the demotion must become an inference");

  const inf = out.inferences[0];
  assert.equal(inf.strength, "TENTATIVE", "a demotion is never presented as a settled reading");
  assert.ok(inferenceIsWellFormed(inf), "a generated inference must still carry all three parts");
  assert.ok(inf.natureCaveat?.includes("业绩预告"), "the caveat must name the nature that capped it");

  /* And the rule is kind-scoped: a statement *about the document* stays a fact,
     because 「预告披露了区间」 is verifiable on the page in front of us. */
  const disclosure: Fact = { ...forecastFact, kind: "DISCLOSURE", statement: "业绩预告披露了毛利率区间" };
  assert.equal(natureCapsFact(disclosure), false, "a disclosure fact is not a measurement of the company");
  assert.equal(partitionFindings({ facts: [disclosure], inferences: [] }).facts.length, 1);
});

test("A4c: no fact in the fixture is a capped measurement", () => {
  for (const { key, f } of allFacts) {
    assert.ok(!natureCapsFact(f), `${key}: 「${f.statement}」 is a ${f.nature} measurement stated as fact`);
  }
});

/* ══════════════════════════════════════════════════════════════
   A5 — management attribution cannot make a causal fact hold
   ══════════════════════════════════════════════════════════════ */

test("A5: management explanation never settles the causal claim", () => {
  const round = FINDINGS["ths-8f21c4a0@T2"];
  assert.ok(round, "T2 round for thesis 1 missing");
  const causal = round.facts.find((f) => f.statement.includes("可独立验证"));
  assert.ok(causal, "T2 must state a fact about independent causal verification");
  assert.equal(causal.kind, "EVIDENCE_EXISTS");
  assert.equal(
    causal.verdict,
    "FAILS",
    "management attribution in the annual report must not make the causal fact hold",
  );
  assert.ok(causal.failReason, "the refusal must explain itself");
});

/* ══════════════════════════════════════════════════════════════
   A7 — a refusal outputs a reason, not a number
   ══════════════════════════════════════════════════════════════ */

test("A7: the refused growth rate produces no verdict about the metric", () => {
  const round = FINDINGS["ths-6d47f1b8@T1"];
  assert.ok(round, "T1 round for thesis 3 missing");

  /* The metric question must have NO fact this round — absence of a fact and a
     failing fact are different statements. */
  const metricFact = round.facts.find(
    (f) => f.kind === "NUMERIC" && f.statement.includes("增速"),
  );
  assert.equal(metricFact, undefined, "a refused computation must not yield a numeric verdict");

  /* What does exist is the binary fact about the evidence. */
  const evidenceFact = round.facts.find(
    (f) => f.kind === "EVIDENCE_EXISTS" && f.statement.includes("可比数"),
  );
  assert.ok(evidenceFact, "the refusal must be recorded as a fact about evidence existence");
  assert.equal(evidenceFact.verdict, "FAILS");
  assert.ok(evidenceFact.failReason, "the refusal must carry its reason");
});

/* ══════════════════════════════════════════════════════════════
   A6 / A8 — coverage statements and restraint
   ══════════════════════════════════════════════════════════════ */

test("A8: T0 produces no inferences — there is nothing yet to reason from", () => {
  for (const [key, round] of allRounds) {
    if (!key.endsWith("@T0")) continue;
    assert.equal(
      round.inferences.length,
      0,
      `${key}: an inference before any financial fact is restraint the system does not have`,
    );
    assert.ok(round.facts.length > 0, `${key}: the baseline round should still yield disclosure facts`);
  }
});

test("A6: a round that does not touch a thesis says so", () => {
  const untouched = allRounds.filter(([, r]) => r.notTouched);
  for (const [key, r] of untouched) {
    assert.ok(r.notTouched!.length > 0, `${key}: empty coverage statement`);
  }
  /* And it renders, rather than being dropped as noise. */
  if (untouched.length > 0) {
    const [key] = untouched[0];
    const version = demo.versions.find((v) => key.endsWith(`@${v.version}`))!;
    const html = render(
      <ReviewSurface
        version={version}
        theses={demo.theses}
        onOpenEvidence={noop}
        onConfirm={noop}
        onCancel={noop}
      />,
    );
    assert.match(html, /本次未涉及/, `${version.version}: coverage statement not rendered`);
  }
});

/* ══════════════════════════════════════════════════════════════
   A9 — 画面一 shows no machine internals
   ══════════════════════════════════════════════════════════════ */

test("A9: the analysis surface has no tokens, no tool JSON, no fake percentages", () => {
  const html = render(<AnalysisRun trigger="三季报到达" disclosureTitle="2025年第三季度报告" onDone={noop} />);

  assert.doesNotMatch(html, /tokens?|inputTokens|outputTokens/i, "model token counts must not be shown");
  assert.doesNotMatch(html, /\{\\?"tool|tool_call|arguments\\?":/i, "tool payloads must not be shown");
  /* A smoothed percentage or an invented ETA is a number the system does not know. */
  assert.doesNotMatch(html, /\d+\s*%/, "no percentage: progress is discrete over real stages");
  assert.doesNotMatch(html, /剩余|预计完成|\bETA\b/i, "no invented time remaining");
  /* Not the phrase — the surface legitimately says it is NOT a live model call.
     What must not appear is a *count* of calls, which is internal bookkeeping. */
  assert.doesNotMatch(html, /模型调用\s*\d+|\d+\s*次调用|调用次数|callCount/i, "call counts are internal");

  /* Honesty requirements: it must declare itself a replay, name a real stage,
     and offer a way out. */
  assert.match(html, /演示回放/, "the surface must say it is a pre-arranged replay");
  assert.match(html, /非实时模型调用/, "the surface must say it is not a live model call");
  assert.match(html, /role="status"/, "the one real line must be a live region");
  assert.match(html, /跳到结果/, "no way to skip a 9-second animation is a trap");
});

test("A9b: the animation is discrete over real stages, and the first line is true", () => {
  assert.equal(ANALYSIS_STAGES.length, 7, "seven real stages");
  for (const s of ANALYSIS_STAGES) {
    assert.ok(s.label.length > 0 && s.detail.length > 0, `stage ${s.label} has no honest line`);
    assert.ok(s.ms > 0, `stage ${s.label} has no duration`);
  }
  const total = ANALYSIS_STAGES.reduce((n, s) => n + s.ms, 0);
  assert.ok(total < 12_000, `the run takes ${total}ms — long enough to be skipped, not endured`);

  /* The first rendered line must be the first real stage, not a placeholder. */
  const html = render(<AnalysisRun trigger="t" disclosureTitle="d" onDone={noop} />);
  assert.ok(html.includes(ANALYSIS_STAGES[0].label), "stage 0 label not rendered");
  assert.ok(html.includes(ANALYSIS_STAGES[0].detail), "stage 0 honest line not rendered");

  /* Exactly one segment is live at the start: the bar is a stage counter. */
  const segs = html.match(/class="ar-seg[^"]*"/g) ?? [];
  assert.equal(segs.length, ANALYSIS_STAGES.length, "one segment per stage");
  assert.equal(segs.filter((c) => c.includes("now")).length, 1, "exactly one stage is running");
  assert.equal(segs.filter((c) => c.includes(" on")).length, 0, "no stage has finished yet");
});

/* ══════════════════════════════════════════════════════════════
   D1–D3 — 画面二 renders, and renders every round
   ══════════════════════════════════════════════════════════════ */

test("D1: every round renders a review surface with facts and provenance", () => {
  for (const version of demo.versions) {
    const html = render(
      <ReviewSurface
        version={version}
        theses={demo.theses}
        onOpenEvidence={noop}
        onConfirm={noop}
        onCancel={noop}
      />,
    );

    assert.match(html, /分析完成 · 待你确认/, `${version.version}: header missing`);
    assert.match(html, /class="rv-fact /, `${version.version}: no fact rows rendered`);
    assert.match(html, /rv-fact-mark/, `${version.version}: verdict marks missing`);

    /* Every fact carries its evidence nature and a source or an explicit
       statement that there is none. */
    for (const thesis of demo.theses) {
      const round = FINDINGS[findingsKey(thesis.thesisId, version.version)];
      if (!round) continue;
      for (const fact of partitionFindings(round).facts) {
        assert.ok(
          html.includes(NATURE[fact.nature].label),
          `${version.version}/${thesis.thesisId}: nature ${fact.nature} not labelled`,
        );
        assert.ok(
          fact.source ? html.includes(`第 ${fact.source.page} 页`) : html.includes("本轮资料包中无对应披露"),
          `${version.version}/${thesis.thesisId}: 「${fact.statement}」 has no provenance`,
        );
      }
    }

    /* The user is asked for a position, and cannot save without taking one. */
    assert.match(html, /接受本轮结果/, `${version.version}: accept action missing`);
    assert.match(html, /写下我的判断/, `${version.version}: judgement action missing`);
    assert.match(html, /disabled=""/, `${version.version}: save must start disabled`);
    assert.match(html, /还有 \d+ 条待处理/, `${version.version}: the pending count must be stated`);
    assert.doesNotMatch(html, /tokens?|模型调用/i, `${version.version}: internal metrics leaked`);
  }
});

test("D2: facts and inferences are visually separate zones", () => {
  const version = demo.versions[2];
  const html = render(
    <ReviewSurface
      version={version}
      theses={demo.theses}
      onOpenEvidence={noop}
      onConfirm={noop}
      onCancel={noop}
    />,
  );
  assert.match(html, /rv-facts/, "fact zone missing");
  assert.match(html, /rv-inferences/, "inference zone missing");
  assert.match(html, /二元判定，无需你表态/, "facts must say the user is not asked to adjudicate them");
  assert.match(html, /模型的判断，不是事实/, "inferences must say what they are");
});

test("D3: a fact's figure is a door into the evidence drawer", () => {
  const version = demo.versions[2];
  const html = render(
    <ReviewSurface
      version={version}
      theses={demo.theses}
      onOpenEvidence={noop}
      onConfirm={noop}
      onCancel={noop}
    />,
  );
  assert.match(html, /class="fig"/, "no clickable figure on the review surface");
  assert.match(html, /51\.46%/, "the audited gross margin should be traceable from 画面二");
});
