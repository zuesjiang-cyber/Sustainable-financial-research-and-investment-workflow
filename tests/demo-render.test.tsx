/**
 * Runtime smoke test for the philosophy demo.
 *
 * Type checking cannot catch an undefined lookup in the fixture, and the demo
 * has no harness of its own. This renders every surface through
 * react-dom/server — including the drawers, which produce nothing while closed
 * and would otherwise go untested — and then validates the fixture's internal
 * logic. It lives in tests/ rather than src/demo/ so the isolation guard still
 * sees src/demo/ as pure presentation code.
 *
 * Run: npm run test:demo
 */
import assert from "node:assert/strict";
import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PhilosophyDemoApp } from "../src/demo/PhilosophyDemoApp";
import { ThesisRow, normaliseRequest } from "../src/demo/ThesisRow";
import { EvidenceDrawer } from "../src/demo/EvidenceDrawer";
import { ArchiveDrawer } from "../src/demo/ArchiveDrawer";
import { DesignNotesDrawer } from "../src/demo/DesignNotesDrawer";
import { PHILOSOPHY_DEMO, LATEST_DEMO_VERSION } from "../src/demo/philosophyDemo";
import { BRIEFS, briefKey, FIGURE_TOKEN } from "../src/demo/briefs";

const demo = PHILOSOPHY_DEMO;
const render = (node: React.ReactElement) => renderToStaticMarkup(node);

/* ══════════════════════════════════════════════════════════════
   1. The desk — what an analyst sees without clicking anything
   ══════════════════════════════════════════════════════════════ */

const desk = render(<PhilosophyDemoApp />);
/* Deliberately small: a desk that renders everything at once has failed. The
   collapsed three-row view should stay well under the 90k the previous design
   produced, with the machinery reachable but not resident. */
assert.ok(desk.length > 3_000, `expected the desk to render, got ${desk.length}`);
assert.ok(desk.length < 20_000, `desk is too dense again: ${desk.length} chars`);

assert.match(desk, /设计说明/, "design notes entry missing");
assert.match(desk, /研究档案/, "archive entry missing");
assert.match(desk, /本轮 · \d+ 项变化/, "round summary missing");
assert.match(desk, /合成数据/, "synthetic marking must be visible on the desk");

/* Version scrubber present, and no model token counts anywhere (10 §6) */
for (const v of ["T0", "T1", "T2"]) assert.ok(desk.includes(v), `version ${v} missing from scrubber`);
assert.doesNotMatch(desk, /tokens?|inputTokens|模型调用/i, "model token/call counts must not be shown");

/* Every thesis renders as a row. The confirmed revision carries its threshold
   inline as "（核验门槛：…）"; the desk splits that into a title and a quiet
   specification line, so assert both halves survive and nothing is dropped. */
for (const thesis of demo.theses) {
  const m = thesis.currentStatement.match(/^(.*?)（核验门槛：(.+?)）[。.]?$/);
  if (m) {
    assert.ok(desk.includes(m[1].trim()), `thesis ${thesis.thesisId} title not on the desk`);
    assert.ok(desk.includes(m[2].trim()), `thesis ${thesis.thesisId} criterion not on the desk`);
  } else {
    assert.ok(desk.includes(thesis.currentStatement), `thesis ${thesis.thesisId} not on the desk`);
  }
}
assert.match(desk, /核验门槛 ·/, "criterion specification line missing");
assert.match(desk, /rd-status is-/, "status pill missing");
assert.match(desk, /rd-next-label/, "next-step line missing");

/* Figures are doors: clickable, and carrying the computed value */
assert.match(desk, /class="fig"/, "clickable figures missing");
assert.match(desk, /51\.46%/, "the FY gross margin figure should render on the desk");

/* The disclosure is phrased as the question the status invites */
assert.match(desk, /为什么不是「已验证」/, "partially-supported disclosure missing");

/* Internal machinery must NOT be on the desk — it belongs in the drawer */
for (const forbidden of ["口径可比性门禁", "Decimal 计算结果", "textHash", "对抗性复核", "冻结资料包"]) {
  assert.ok(!desk.includes(forbidden), `internal trace "${forbidden}" leaked onto the desk`);
}

/* ══════════════════════════════════════════════════════════════
   2. Expanded rows — the reasoning behind one thesis
   ══════════════════════════════════════════════════════════════ */

for (const version of demo.versions) {
  for (const thesis of demo.theses) {
    const view = thesis.versions[version.version];
    const brief = BRIEFS[briefKey(thesis.thesisId, version.version)];
    assert.ok(view, `${thesis.thesisId} has no view for ${version.version}`);
    assert.ok(brief, `${thesis.thesisId} has no card brief for ${version.version}`);

    const html = render(
      <ThesisRow
        thesis={thesis}
        view={view}
        brief={brief}
        activeVersion={version.version}
        expanded
        onToggle={() => {}}
        onOpenEvidence={() => {}}
      />,
    );

    assert.match(html, /研报原话/, `${thesis.thesisId}@${version.version}: original wording missing`);
    assert.ok(
      html.includes(thesis.originalStatement),
      `${thesis.thesisId}@${version.version}: original sentence not preserved verbatim`,
    );
    assert.match(html, /论据 · 采纳/, `${thesis.thesisId}@${version.version}: admission gate missing`);
    assert.match(html, /摘要式写法会是/, `${thesis.thesisId}@${version.version}: naive contrast missing`);
    assert.ok(
      html.includes(view.rollUp.honestConclusion),
      `${thesis.thesisId}@${version.version}: honest conclusion missing`,
    );

    /* Requests for the same disclosure must collapse into one line: two
       arguments asking for "分产品毛利率" in different words is one ask. */
    {
      const requests = thesis.claims.flatMap(
        (c) => c.versions[version.version]?.semantic?.missingEvidence ?? [],
      );
      const keys = requests.map((r) => normaliseRequest(r.what));
      const rendered = html.match(/<li>[^<]+<em>/g) ?? [];
      const uniqueKeys = new Set(keys);
      assert.ok(
        rendered.length <= uniqueKeys.size,
        `${thesis.thesisId}@${version.version}: rendered ${rendered.length} missing-evidence ` +
          `items from ${uniqueKeys.size} distinct requests — dedup failed`,
      );
    }

    /* Cause layering keeps disclosure and hypothesis in separate blocks */
    const hasSemanticCause = thesis.claims.some((c) =>
      (c.versions[version.version]?.semantic?.attributions.length ?? 0) > 0,
    );
    if (hasSemanticCause) {
      assert.match(html, /rd-cause is-hypo/, `${thesis.thesisId}@${version.version}: hypothesis tier missing`);
      assert.match(html, /公司已披露/, `${thesis.thesisId}@${version.version}: disclosed tier missing`);
    }
  }
}

/* ══════════════════════════════════════════════════════════════
   3. Evidence drawer — the three verification layers
   ══════════════════════════════════════════════════════════════ */

function findClaim(argumentId: string) {
  for (const thesis of demo.theses) {
    const claim = thesis.claims.find((c) => c.argumentId === argumentId);
    if (claim) return claim;
  }
  throw new Error(`unknown argument ${argumentId}`);
}

/* 3a. A computed numeric argument */
{
  const claim = findClaim("arg-a1-1");
  const av = claim.versions["T2"];
  const html = render(
    <EvidenceDrawer open onClose={() => {}} claim={claim} av={av} version="T2" />,
  );
  assert.match(html, /来源真实性/, "layer 1 missing");
  assert.match(html, /可比性与计算/, "layer 2 missing");
  assert.match(html, /命题关系/, "layer 3 missing");
  assert.match(html, /Decimal 计算结果/, "computed result missing");
  assert.match(html, /51\.46%/, "result value missing");
  assert.match(html, /gross_margin/, "registered formula missing");
  /* Every operand must carry a page and a cell locator */
  for (const op of av.numeric!.operands) {
    assert.ok(html.includes(op.value), `operand ${op.label} value not rendered`);
    assert.ok(html.includes(`第 ${op.source.page} 页`), `operand ${op.label} page not rendered`);
    assert.ok(html.includes(op.source.locator), `operand ${op.label} locator not rendered`);
  }
  for (const c of av.numeric!.checks) {
    assert.ok(html.includes(c.label), `comparability check ${c.code} not rendered`);
  }
}

/* 3b. An honest refusal to compute */
{
  const claim = findClaim("arg-a3-2");
  const av = claim.versions["T1"];
  assert.equal(av.numeric!.result, null, "fixture should refuse to compute at T1");
  const html = render(
    <EvidenceDrawer open onClose={() => {}} claim={claim} av={av} version="T1" />,
  );
  assert.match(html, /拒绝计算/, "refusal state missing");
  assert.ok(html.includes(av.numeric!.refusalReason!), "refusal reason missing");
  assert.match(html, /is-fail/, "a failed comparability check must be marked as failed");
}

/* 3c. A semantic argument with management attribution */
{
  const claim = findClaim("arg-a1-3");
  const av = claim.versions["T2"];
  const html = render(
    <EvidenceDrawer open onClose={() => {}} claim={claim} av={av} version="T2" />,
  );
  assert.match(html, /管理层归因/, "attribution tier missing");
  assert.match(html, /文本指纹/, "citation fingerprint missing");
  for (const e of av.semantic!.evidence) {
    assert.ok(html.includes(e.quote), `evidence quote not rendered: ${e.quote.slice(0, 20)}…`);
    assert.ok(html.includes(e.textHash), `evidence hash not rendered for page ${e.page}`);
  }
  assert.match(html, /合成/, "composition section missing");
}

/* 3d. A closed drawer renders nothing */
{
  const claim = findClaim("arg-a1-1");
  const html = render(
    <EvidenceDrawer open={false} onClose={() => {}} claim={claim} av={claim.versions["T2"]} version="T2" />,
  );
  assert.equal(html, "", "a closed drawer must render nothing");
}

/* ══════════════════════════════════════════════════════════════
   4. Archive and design-notes drawers
   ══════════════════════════════════════════════════════════════ */

{
  const html = render(
    <ArchiveDrawer open onClose={() => {}} version={demo.versions[2]} previous={demo.versions[1]} />,
  );
  assert.match(html, /冻结资料包/, "document pack missing");
  assert.match(html, /未决问题/, "question ledger missing");
  assert.match(html, /用户修正与研判/, "correction ledger missing");
  assert.match(html, /刻意未变/, "deliberately-unchanged ledger missing");
  assert.match(html, /结转生效/, "carried-forward marking missing");
  for (const doc of demo.versions[2].documents) {
    assert.ok(html.includes(doc.fileName), `document ${doc.fileName} missing from archive`);
  }
  assert.doesNotMatch(html, /模型调用|tokens?/i, "archive must not report model token usage");
}

{
  const html = render(<DesignNotesDrawer open onClose={() => {}} demo={demo} />);
  for (const p of demo.pillars) {
    assert.ok(html.includes(p.title), `pillar ${p.index} missing from design notes`);
    assert.ok(html.includes(p.antiPattern), `pillar ${p.index} anti-pattern missing`);
  }
  assert.ok(html.includes(demo.meta.dataNote), "synthetic data note missing from design notes");
}

/* ══════════════════════════════════════════════════════════════
   5. Fixture integrity
   ══════════════════════════════════════════════════════════════ */

for (const thesis of demo.theses) {
  const ids = new Set(thesis.claims.map((c) => c.argumentId));

  for (const version of demo.versions) {
    const view = thesis.versions[version.version];
    assert.ok(view, `${thesis.thesisId} has no view for ${version.version}`);
    assert.ok(view.rollUp.rule.length > 0, `${thesis.thesisId}@${version.version} has no aggregation rule`);

    /* Roll-up may only name arguments that exist */
    for (const id of [...view.rollUp.admitted, ...view.rollUp.pending]) {
      assert.ok(ids.has(id), `${thesis.thesisId}@${version.version} names unknown argument ${id}`);
    }
    for (const r of view.rollUp.rejected) {
      assert.ok(ids.has(r.argumentId), `${thesis.thesisId}@${version.version} rejects unknown ${r.argumentId}`);
      assert.ok(r.reason.length > 0, `${r.argumentId} rejected without a reason`);
    }

    /* The gate and the roll-up must agree: admitted ⟺ STRONG */
    for (const claim of thesis.claims) {
      const av = claim.versions[version.version];
      if (!av) continue;
      if (view.rollUp.admitted.includes(claim.argumentId)) {
        assert.equal(av.supportLevel, "STRONG", `${claim.argumentId}@${version.version} admitted without STRONG`);
      } else {
        assert.notEqual(av.supportLevel, "STRONG", `${claim.argumentId}@${version.version} STRONG but not admitted`);
      }

      /* A refusal must be consistent, and a result must be displayable */
      if (av.numeric) {
        const refused = av.numeric.result === null;
        assert.ok(
          refused === Boolean(av.numeric.refusalReason),
          `${claim.argumentId}@${version.version} refusal state disagrees with refusalReason`,
        );
        if (!refused) assert.ok(av.numeric.resultDisplay, `${claim.argumentId}@${version.version} no resultDisplay`);
        for (const op of av.numeric.operands) {
          assert.ok(op.source.page > 0, `${claim.argumentId} operand ${op.label} has no page`);
          assert.ok(op.source.locator.length > 0, `${claim.argumentId} operand ${op.label} has no locator`);
        }
      }
      if (av.semantic) {
        for (const e of av.semantic.evidence) {
          assert.ok(e.page > 0, `${claim.argumentId} evidence without page`);
          assert.ok(e.textHash.length > 0, `${claim.argumentId} evidence without textHash`);
        }
      }
    }
  }

  /* Argument identity is stable, and every version it names is declared */
  for (const claim of thesis.claims) {
    assert.ok(Object.keys(claim.versions).length > 0, `${claim.argumentId} has no versions`);
    for (const v of Object.keys(claim.versions)) {
      assert.ok(
        demo.versions.some((rv) => rv.version === v),
        `${claim.argumentId} references undeclared version ${v}`,
      );
    }
  }
}

/* ══════════════════════════════════════════════════════════════
   6. Card copy must resolve against real data
   ══════════════════════════════════════════════════════════════ */

/* Every brief exists, and every figure token it uses points at an argument
   that actually produced a value in that round — otherwise the card would
   render a placeholder instead of a number. */
for (const thesis of demo.theses) {
  for (const version of demo.versions) {
    const key = briefKey(thesis.thesisId, version.version);
    const brief = BRIEFS[key];
    assert.ok(brief, `missing card brief for ${key}`);

    const ids = new Set(thesis.claims.map((c) => c.argumentId));
    for (const field of ["keyFact", "gap", "assessment"] as const) {
      const text = brief[field];
      if (!text) continue;
      for (const m of text.matchAll(new RegExp(FIGURE_TOKEN.source, "gi"))) {
        const [, kind, argumentId] = m;
        assert.ok(ids.has(argumentId), `${key}.${field} references unknown argument ${argumentId}`);
        const av = thesis.claims.find((c) => c.argumentId === argumentId)!.versions[version.version];
        assert.ok(av, `${key}.${field} references ${argumentId}, absent in ${version.version}`);
        assert.ok(av.numeric, `${key}.${field} references ${argumentId}, which has no numeric channel in ${version.version}`);
        if (kind.toUpperCase() === "GAP") {
          assert.ok(av.numeric!.gapDisplay, `${key}.${field} asks for a gap that ${argumentId} did not compute`);
        }
      }
    }

    /* The verdict must carry substance, and the next step must be concrete */
    assert.ok(brief.assessment.length >= 12 || brief.noNewEvidence, `${key}: assessment too thin`);
    assert.ok(brief.nextStep.length >= 6 || brief.noNewEvidence, `${key}: next step too thin`);
    assert.doesNotMatch(brief.nextStep, /持续关注|密切关注/, `${key}: next step is a platitude, not an evidence request`);
  }
}

/* The latest round must actually exercise the interesting cases */
{
  const latest = LATEST_DEMO_VERSION;
  const statuses = demo.theses.map((t) => t.versions[latest].status);
  assert.ok(statuses.includes("SUPPORTED"), "the final round should contain a supported thesis");
  assert.ok(
    statuses.includes("PARTIALLY_SUPPORTED"),
    "the final round should contain a thesis held back by the admission gate",
  );
  const refusedSomewhere = demo.theses.some((t) =>
    t.claims.some((c) => Object.values(c.versions).some((av) => av.numeric?.result === null)),
  );
  assert.ok(refusedSomewhere, "the scenario should include an honest refusal to compute");
  const mgmtOnly = demo.theses.some((t) =>
    t.claims.some((c) =>
      Object.values(c.versions).some((av) =>
        av.semantic?.attributions.some((a) => a.kind === "MANAGEMENT_EXPLANATION"),
      ),
    ),
  );
  assert.ok(mgmtOnly, "the scenario should include a management-only attribution");
}

console.log(
  `demo render smoke: OK — desk ${desk.length} chars, ` +
    `${demo.theses.length} theses × ${demo.versions.length} versions, drawers covered`,
);
