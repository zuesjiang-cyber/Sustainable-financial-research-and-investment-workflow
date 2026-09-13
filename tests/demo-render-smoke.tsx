/**
 * Runtime smoke test for the philosophy demo.
 *
 * Type checking cannot catch an undefined lookup in the fixture (e.g. a thesis
 * missing a version entry), and the demo has no test harness of its own. This
 * renders the whole demo surface through react-dom/server and asserts the three
 * pillars actually produced markup. It lives in tests/ rather than src/demo/ so
 * the isolation guard still sees src/demo/ as pure presentation code.
 *
 * Run: node --import tsx tests/demo-render-smoke.tsx
 */
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { PhilosophyDemoApp } from "../src/demo/PhilosophyDemoApp";
import { PHILOSOPHY_DEMO } from "../src/demo/philosophyDemo";

const html = renderToStaticMarkup(<PhilosophyDemoApp />);

assert.ok(html.length > 20_000, `expected substantial markup, got ${html.length} chars`);

/* ---- Pillar 1: versioned state ---- */
assert.match(html, /研究状态时间轴/, "timeline missing");
for (const v of ["T0", "T1", "T2"]) {
  assert.ok(html.includes(v), `version ${v} not rendered`);
}
assert.match(html, /状态变化/, "state delta ledger missing");
assert.match(html, /未决问题账本/, "question ledger missing");

/* ---- Pillar 2: dual channel ---- */
assert.match(html, /数字通道/, "numeric channel panel missing");
assert.match(html, /口径可比性门禁/, "comparability gate missing");
assert.match(html, /双通道合成/, "composition panel missing");

/* ---- Pillar 3: arguments + admission gate ---- */
assert.match(html, /论据准入门禁/, "admission gate missing");
assert.match(html, /合成判定/, "roll-up missing");
assert.match(html, /朴素汇总会写成/, "naive-vs-honest contrast missing");
assert.match(html, /不予采纳/, "rejection bucket missing");

/* ---- Synthetic marking must be visible to the viewer ---- */
assert.match(html, /合成数据/, "synthetic banner missing");

/* ---- Every thesis × version combination must resolve in the fixture ---- */
for (const thesis of PHILOSOPHY_DEMO.theses) {
  for (const version of PHILOSOPHY_DEMO.versions) {
    const view = thesis.versions[version.version];
    assert.ok(view, `${thesis.thesisId} has no view for ${version.version}`);
    assert.ok(view.rollUp, `${thesis.thesisId}@${version.version} has no rollUp`);
    assert.ok(
      view.rollUp.rule.length > 0,
      `${thesis.thesisId}@${version.version} has no aggregation rule`,
    );

    // Every argument named in the roll-up must exist on the thesis.
    const ids = new Set(thesis.claims.map((c) => c.argumentId));
    for (const id of [...view.rollUp.admitted, ...view.rollUp.pending]) {
      assert.ok(ids.has(id), `${thesis.thesisId}@${version.version} roll-up names unknown argument ${id}`);
    }
    for (const r of view.rollUp.rejected) {
      assert.ok(ids.has(r.argumentId), `${thesis.thesisId}@${version.version} rejects unknown argument ${r.argumentId}`);
      assert.ok(r.reason.length > 0, `${r.argumentId} rejected without a reason`);
    }

    // Admitted arguments must be STRONG; rejected/pending must not be STRONG.
    for (const claim of thesis.claims) {
      const av = claim.versions[version.version];
      if (!av) continue;
      if (view.rollUp.admitted.includes(claim.argumentId)) {
        assert.equal(
          av.supportLevel,
          "STRONG",
          `${claim.argumentId}@${version.version} admitted without STRONG support`,
        );
      } else {
        assert.notEqual(
          av.supportLevel,
          "STRONG",
          `${claim.argumentId}@${version.version} is STRONG but not admitted`,
        );
      }

      // A numeric channel that refused must not carry a result, and vice versa.
      if (av.numeric) {
        const refused = av.numeric.result === null;
        assert.ok(
          refused === Boolean(av.numeric.refusalReason),
          `${claim.argumentId}@${version.version} refusal state inconsistent with refusalReason`,
        );
        if (!refused) {
          assert.ok(av.numeric.resultDisplay, `${claim.argumentId}@${version.version} missing resultDisplay`);
        }
        // Every operand must be traceable to a page.
        for (const op of av.numeric.operands) {
          assert.ok(op.source.page > 0, `${claim.argumentId} operand ${op.label} has no page`);
          assert.ok(op.source.locator.length > 0, `${claim.argumentId} operand ${op.label} has no locator`);
        }
      }

      // Semantic evidence must be citable.
      if (av.semantic) {
        for (const e of av.semantic.evidence) {
          assert.ok(e.page > 0, `${claim.argumentId} evidence without page`);
          assert.ok(e.textHash.length > 0, `${claim.argumentId} evidence without textHash`);
        }
      }
    }
  }
}

/* ---- Argument identity must be stable across versions (pillar 1) ---- */
for (const thesis of PHILOSOPHY_DEMO.theses) {
  for (const claim of thesis.claims) {
    const versionsSeen = Object.keys(claim.versions);
    assert.ok(versionsSeen.length > 0, `${claim.argumentId} has no versions`);
    for (const v of versionsSeen) {
      assert.ok(
        PHILOSOPHY_DEMO.versions.some((rv) => rv.version === v),
        `${claim.argumentId} references undeclared version ${v}`,
      );
    }
  }
}

console.log(`demo render smoke: OK (${html.length} chars, ${PHILOSOPHY_DEMO.theses.length} theses)`);
