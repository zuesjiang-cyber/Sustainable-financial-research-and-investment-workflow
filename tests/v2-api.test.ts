import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { createApp } from "../src/server/app";
import { V2Store } from "../src/server/v2/v2Store";
import { SqliteJobQueue } from "../src/server/v2/jobQueue";
import { V2Worker } from "../src/server/v2/worker";
import { createV2Runtime } from "../src/server/v2/v2Router";

test("V2 HTTP: 输入一句话得到初步判断，后台核验不把失败标成成功，已读不改立场", async () => {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "fintrust-v2-api-"));
  process.env.FINTRUST_DATA_DIR = dataDir;
  delete process.env.FINTRUST_LLM_API_KEY;
  delete process.env.TAVILY_API_KEY;
  const store = new V2Store(dataDir);
  const queue = new SqliteJobQueue(dataDir);
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes("cninfo")) return new Response("nope", { status: 500 });
    if (url.includes("tavily")) return new Response("nope", { status: 500 });
    return new Response("not found", { status: 404 });
  };
  const app = await createApp({
    disableV2Worker: true,
    v2: { store, queue, fetchImpl, disableWorker: true },
  });
  let server: Server;
  const port = await new Promise<number>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve(typeof addr === "object" && addr ? addr.port : 0);
    });
  });
  const base = `http://127.0.0.1:${port}`;
  try {
    const created = await fetch(`${base}/v2/research`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "abc12345" },
      body: JSON.stringify({ text: "转发这篇研报：圣邦股份 300661 预计毛利率达到30%。" }),
    });
    assert.equal(created.status, 201);
    const body = await created.json() as any;
    assert.equal(body.project.currentStance, null);
    assert.equal(body.project.materialViews.length >= 1, true);
    assert.ok(body.run.preliminary.headline);

    const runtime = createV2Runtime({ store, queue, fetchImpl });
    const worker = new V2Worker(runtime.queue, runtime.engine, runtime.store);
    await worker.tick();
    const run = await store.getRun(body.runId);
    assert.ok(run);
    assert.notEqual(run!.coverage.official, "COMPLETE");
    assert.equal(run!.coverage.official === "FAILED" || run!.coverage.notes.length > 0, true);

    await fetch(`${base}/v2/projects/${body.projectId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "我长期看好竞争力" }),
    });
    const afterStance = await store.getProject(body.projectId);
    const version = afterStance?.currentStance?.version;
    const note = {
      id: "note-1",
      projectId: body.projectId,
      kind: "IMPORTANT_CHANGE" as const,
      title: "测试",
      body: "已读不应改立场",
      eventIds: [],
      analysisIds: [],
      importance: "HIGH" as const,
      createdAt: new Date().toISOString(),
      readAt: null,
      reason: "test",
      correctionOf: null,
    };
    await store.saveNotification(note);
    const read = await fetch(`${base}/v2/notifications/note-1/read`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    assert.equal(read.status, 200);
    const still = await store.getProject(body.projectId);
    assert.equal(still?.currentStance?.version, version);

    const replay = await fetch(`${base}/v2/replays/sbg-fy2025-q3/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    assert.equal(replay.status, 201);
    const replayProject = await replay.json() as any;
    assert.equal(replayProject.isReplay, true);
    const live = await fetch(`${base}/v2/projects`);
    const liveList = await live.json() as any[];
    assert.equal(liveList.some((item) => item.id === replayProject.id), false);

    const valuation = await fetch(`${base}/v2/projects/${body.projectId}/valuation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priceDate: "not-a-date", accountingScope: "CONSOLIDATED", assumptions: ["永续增长"] }),
    });
    assert.equal(valuation.status, 400);
  } finally {
    await new Promise<void>((resolve, reject) => server!.close((err) => err ? reject(err) : resolve()));
    rmSync(dataDir, { recursive: true, force: true });
  }
});
