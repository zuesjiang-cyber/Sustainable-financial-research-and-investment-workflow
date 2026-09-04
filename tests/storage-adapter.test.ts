import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { LocalStorageAdapter } from "../src/server/storage/localStorageAdapter";
import { computeSha256 } from "../src/server/storage/storageAdapter";

test("LocalStorageAdapter stores, retrieves, and checks existence of objects", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "fintrust-storage-test-"));
  const adapter = new LocalStorageAdapter(tmpDir);

  const testKey = "documents/test_doc.txt";
  const testContent = "Hello FinTrust V1 Storage!";
  const expectedSha256 = computeSha256(testContent);

  // 1. Put
  const result = await adapter.putObject(testKey, testContent, "text/plain");
  assert.equal(result.storageKey, testKey);
  assert.equal(result.sha256, expectedSha256);
  assert.equal(result.bytes, Buffer.byteLength(testContent));

  // 2. Exists
  assert.equal(await adapter.exists(testKey), true);
  assert.equal(await adapter.exists("non_existent_key"), false);

  // 3. Get
  const fetched = await adapter.getObject(testKey);
  assert.equal(fetched.toString("utf-8"), testContent);

  // 4. Resolve local path
  const localPath = adapter.resolveLocalPath(testKey);
  assert.equal(localPath.includes(testKey), true);

  // 5. Delete
  await adapter.deleteObject(testKey);
  assert.equal(await adapter.exists(testKey), false);

  // Cleanup
  await fs.rm(tmpDir, { recursive: true, force: true });
});
