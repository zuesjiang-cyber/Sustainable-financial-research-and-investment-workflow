import test from "node:test";
import assert from "node:assert/strict";
import { createAsyncGenerationGuard } from "./asyncGuard";

test("invalidates work from an earlier generation", () => {
  const guard = createAsyncGenerationGuard();
  const first = guard.current();

  assert.equal(guard.isCurrent(first), true);
  const second = guard.next();
  assert.equal(guard.isCurrent(first), false);
  assert.equal(guard.isCurrent(second), true);
});
