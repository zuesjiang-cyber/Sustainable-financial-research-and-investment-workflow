import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/server/app";

/**
 * The demo run (`run-demo-t0`) is a read-only product showcase. It must stay
 * readable so the UI can render the walkthrough, but it must never be able to
 * create a real project: doing so previously wrote a 圣邦股份 project whose
 * theses cited a non-existent synthetic PDF into Markdown Memory, where it
 * showed up under "继续已有真实研究项目".
 *
 * Every directory this test touches is an isolated tmpdir. It must not write to
 * ./research-memory or ./data, which are the real (and Git-tracked) locations.
 */
test("FinTrust Demo Pipeline: demo run stays readable but cannot become a real project", async () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), "fintrust-demo-db-"));
  const storageRoot = mkdtempSync(path.join(tmpdir(), "fintrust-demo-storage-"));
  const memoryDir = mkdtempSync(path.join(tmpdir(), "fintrust-demo-memory-"));
  process.env.FINTRUST_DATA_DIR = dataDir;
  process.env.FINTRUST_UPLOAD_STORAGE_DIR = storageRoot;
  process.env.FINTRUST_MEMORY_DIR = memoryDir;
  delete process.env.FINTRUST_LLM_API_KEY;
  delete process.env.GEMINI_API_KEY;

  const realMemoryDir = path.resolve("research-memory");
  const realMemoryBefore = existsSync(realMemoryDir) ? readdirSync(realMemoryDir).sort() : [];

  const app = await createApp();
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const root = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    // 1. The demo run and its draft remain readable for the UI walkthrough.
    const runRes = await fetch(`${root}/v1/runs/run-demo-t0`);
    assert.equal(runRes.status, 200);
    const run = await runRes.json() as any;
    assert.equal(run.id, "run-demo-t0");
    assert.equal(run.companyCandidates[0].name, "圣邦股份");
    assert.equal(run.draft.items.length, 2);
    // The demo document is explicitly synthetic.
    assert.equal(run.draft.sourceDocument.isSynthetic, true);

    const draftRes = await fetch(`${root}/v1/runs/run-demo-t0/draft`);
    assert.equal(draftRes.status, 200);
    assert.equal((await draftRes.json() as any).items.length, 2);

    // 2. Confirming the demo run is rejected: demo content cannot enter the
    //    real research path.
    const confirmRes = await fetch(`${root}/v1/runs/run-demo-t0/draft/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        draftRevision: 1,
        company: { name: "圣邦股份", securityCode: "300661", exchange: "SZSE" },
        theses: [{
          thesisId: "00000000-0000-4000-8000-000000000201",
          statement: "预计2025年综合毛利率有望达到30%以上，盈利能力显著修复。",
          type: "NUMERIC_FORECAST",
          criterion: {
            kind: "COMPARE", metric: "gross_margin", op: "GTE", target: "30", unit: "RATIO",
            period: { start: "2025-01-01", end: "2025-12-31", basis: "YEAR" },
            scope: "CONSOLIDATED",
          },
          sourceEvidenceIds: ["00000000-0000-4000-8000-000000000102"],
        }],
      }),
    });
    assert.equal(confirmRes.status, 409);
    assert.match((await confirmRes.json() as any).error, /只读|演示/);

    // The legacy "span-thesis-1" alias must not become a way around the guard.
    const legacyRes = await fetch(`${root}/v1/runs/run-demo-t0/draft/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        draftRevision: 1,
        company: { name: "圣邦股份", securityCode: "300661", exchange: "SZSE" },
        theses: [{
          thesisId: "00000000-0000-4000-8000-000000000201",
          statement: "预计2025年综合毛利率有望达到30%以上。",
          type: "NUMERIC_FORECAST",
          criterion: {
            kind: "COMPARE", metric: "gross_margin", op: "GTE", target: "30", unit: "RATIO",
            period: { start: "2025-01-01", end: "2025-12-31", basis: "YEAR" },
            scope: "CONSOLIDATED",
          },
          sourceEvidenceIds: ["span-thesis-1"],
        }],
      }),
    });
    assert.equal(legacyRes.status, 409);

    // 3. Nothing was persisted: no project, no Memory file.
    const projectsRes = await fetch(`${root}/v1/projects`);
    assert.equal(projectsRes.status, 200);
    assert.deepEqual(await projectsRes.json(), []);
    assert.deepEqual(
      (await (await fetch(`${root}/v1/projects?includeSynthetic=true`)).json()) as unknown[],
      [],
    );
    const memoryFiles = readdirSync(memoryDir).filter((f) => f.endsWith(".md"));
    assert.deepEqual(memoryFiles, [], "demo confirm must not write Markdown Memory");

    // 4. The real (Git-tracked) Memory location this repo ships was untouched.
    //    A developer may legitimately have real projects there, so compare
    //    before/after rather than asserting the directory is absent.
    const realMemory = existsSync(realMemoryDir) ? readdirSync(realMemoryDir).sort() : [];
    assert.deepEqual(realMemory, realMemoryBefore, "test must not write to the real ./research-memory");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(storageRoot, { recursive: true, force: true });
    rmSync(memoryDir, { recursive: true, force: true });
  }
});
