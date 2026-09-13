import test from "node:test";
import assert from "node:assert/strict";
import {
  initialDemoVersion,
  demoDraft,
  confirmDemo,
  restoreDemo,
} from "./demoMemory";
test("demo keeps T0 immutable and carries researcher corrections across rounds", () => {
  const initial = initialDemoVersion();
  const draft = demoDraft(initial);
  assert.equal(initial.items[0].status, "UNRESOLVED");
  assert.equal(draft[0].status, "SUPPORTED");
  draft[0].note = "需要继续观察";
  draft[0].status = "PARTIALLY_SUPPORTED";
  const history = confirmDemo([initial], draft, "2026-09-13T00:00:00Z");
  draft[0].note = "changed later";
  assert.equal(history[1].items[0].note, "需要继续观察");
  assert.equal(history[0].items[0].note, "");
  assert.equal(demoDraft(history[1])[0].status, "PARTIALLY_SUPPORTED");
  assert.deepEqual(restoreDemo(JSON.stringify(history)), history);
});
test("demo corrupt local data falls back to a clean baseline", () => {
  for (const raw of ["bad", "null", "[]", '[{"version":0}]'])
    assert.deepEqual(restoreDemo(raw), [initialDemoVersion()]);
});
