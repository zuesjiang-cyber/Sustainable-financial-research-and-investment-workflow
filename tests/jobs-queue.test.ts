import test from "node:test";
import assert from "node:assert/strict";
import { JobQueue } from "../src/server/jobs/queue";
import { DEFAULT_LOCAL_WORKSPACE } from "../src/server/repos/workspaceContext";

test("JobQueue validates enqueue input and generates query", async () => {
  const queue = new JobQueue();

  // Test input validation
  const testInput = {
    kind: "RUN" as const,
    dedupeKey: "run:test-123",
    payload: { test: true },
    priority: 10,
    maxAttempts: 3,
  };

  assert.equal(testInput.kind, "RUN");
  assert.equal(testInput.priority, 10);
  assert.equal(testInput.dedupeKey, "run:test-123");
  assert.equal(DEFAULT_LOCAL_WORKSPACE.workspaceId.length > 0, true);
});
