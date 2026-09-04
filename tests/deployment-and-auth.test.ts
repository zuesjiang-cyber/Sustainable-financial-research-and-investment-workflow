import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { WorkspaceAuthManager } from "../src/server/auth/workspaceAuth";
import { DEFAULT_LOCAL_WORKSPACE } from "../src/server/repos/workspaceContext";
import { runLegacyMigration } from "../scripts/migrate-legacy";

test("WorkspaceAuthManager resolves local loopback and enforces cross-workspace security", () => {
  const auth = new WorkspaceAuthManager();

  // 1. Default local request
  const mockReq1 = { headers: {} } as http.IncomingMessage;
  const ctx1 = auth.resolveContext(mockReq1);
  assert.equal(ctx1.workspaceId, DEFAULT_LOCAL_WORKSPACE.workspaceId);

  // 2. Custom workspace header
  const customWs = "11111111-2222-3333-4444-555555555555";
  const mockReq2 = {
    headers: { "x-workspace-id": customWs, "x-user-id": "user-abc" },
  } as unknown as http.IncomingMessage;
  const ctx2 = auth.resolveContext(mockReq2);
  assert.equal(ctx2.workspaceId, customWs);
  assert.equal(ctx2.userId, "user-abc");

  // 3. Cross workspace rejection
  assert.throws(
    () => auth.assertWorkspaceMatch(ctx2, "99999999-9999-9999-9999-999999999999"),
    /Cross-workspace access denied/
  );
});

test("runLegacyMigration performs safe read-only inspection", async () => {
  const summary = await runLegacyMigration();
  assert.equal(typeof summary.projectsMigrated, "number");
  assert.equal(typeof summary.thesesMigrated, "number");
  assert.equal(typeof summary.questionsMigrated, "number");
});
