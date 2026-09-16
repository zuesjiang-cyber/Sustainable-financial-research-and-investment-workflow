import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { executeV2Tool, nextLeadCheckAt, overlapSince, type AgentContext } from "../src/server/v2/agentTools";
import { maybeDailyDigest } from "../src/server/v2/agentLoop";
import { V2Store } from "../src/server/v2/v2Store";
import { ResearchEngine } from "../src/server/v2/researchEngine";
import { BudgetGuard } from "../src/server/v2/budget";
import { CninfoDisclosureClient } from "../src/server/v2/disclosures";
import { TavilyClient } from "../src/server/v2/tavily";
import { BACKGROUND_LIMITS, type V2Project, type V2Run } from "../src/shared/v2Domain";

function tmpDir(): string {
  return mkdtempSync(path.join(os.tmpdir(), "fintrust-v2-agent-"));
}

function ctxFor(project: V2Project, run: V2Run, extras: Partial<AgentContext> = {}): AgentContext {
  return {
    project,
    run,
    disclosures: new CninfoDisclosureClient(async () => new Response("nope", { status: 500 })),
    tavily: new TavilyClient("", async () => new Response("{}")),
    fetchImpl: fetch,
    clock: () => new Date("2026-06-10T00:00:00.000Z"),
    newEvents: [],
    notes: { completed: [], unresolved: [], supported: [], needsRevision: [] },
    ...extras,
  };
}

test("官方检索窗口：首次回看 12 个月，之后相对上次成功重叠 7 天", () => {
  const now = new Date("2026-06-10T00:00:00.000Z");
  assert.equal(overlapSince(null, now), "2025-06-10");
  assert.equal(overlapSince("2026-06-01T12:00:00.000Z", now), "2026-05-25");
});

test("未核实线索按 1/6/24 小时再查，不会把未核实提交升格为 VERIFIED", async () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  assert.equal(nextLeadCheckAt(0, now), "2026-01-01T01:00:00.000Z");
  assert.equal(nextLeadCheckAt(1, now), "2026-01-01T06:00:00.000Z");
  assert.equal(nextLeadCheckAt(2, now), "2026-01-02T00:00:00.000Z");
  assert.equal(nextLeadCheckAt(9, now), "2026-01-02T00:00:00.000Z");

  const store = new V2Store(tmpDir(), () => now);
  const project = store.emptyProject({ title: "t" });
  const run: V2Run = {
    id: "run-1",
    projectId: project.id,
    kind: "BACKGROUND",
    status: "RUNNING",
    parentRunId: null,
    idempotencyKey: null,
    input: { text: "", url: null, documentId: null, question: null },
    preliminary: null,
    modelCalls: 0,
    documentsRead: 0,
    limits: { ...BACKGROUND_LIMITS },
    coverage: { official: "NOT_STARTED", external: "NOT_STARTED", notes: [] },
    error: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    completedAt: null,
    events: [],
    resultSummary: null,
  };
  const result = await executeV2Tool("submit_event_verification", {
    description: "未读原文",
    stage: "ANNOUNCED",
    proposition: "公司已公告重大合同",
    evidenceIds: [],
  }, ctxFor(project, run));
  assert.equal((result as { accepted?: boolean }).accepted, false);
});

test("工具链读取官方列表并提交核验；失败覆盖不得标 COMPLETE", async () => {
  const dir = tmpDir();
  process.env.FINTRUST_DATA_DIR = dir;
  const store = new V2Store(dir, () => new Date("2026-06-10T00:00:00.000Z"));
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes("cninfo.com.cn/new/hisAnnouncement")) {
      return new Response(JSON.stringify({
        announcements: [{
          announcementId: "A1",
          announcementTitle: "关于签订日常经营重大合同的公告",
          announcementTime: Date.parse("2026-06-08T00:00:00.000Z"),
          secCode: "300661",
          secName: "圣邦股份",
          adjunctUrl: "finalpage/2026-06-08/a.pdf",
        }],
      }), { status: 200 });
    }
    return new Response("missing", { status: 404 });
  };
  const engine = new ResearchEngine({
    store,
    disclosures: new CninfoDisclosureClient(fetchImpl),
    tavily: new TavilyClient("", fetchImpl),
    roles: { fast: null, research: null, review: null },
    budget: new BudgetGuard(store),
    clock: () => new Date("2026-06-10T00:00:00.000Z"),
    fetchImpl,
  });
  try {
    const started = await engine.startResearch({ text: "我长期看好圣邦股份模拟芯片竞争力" });
    assert.equal(started.project.company?.securityCode, "300661");
    const run = await engine.runBackground(started.run.id, "BACKGROUND");
    assert.equal(run.events.some((item) => item.phase === "tool"), true);
    const project = await store.getProject(started.project.id);
    assert.ok(project);
    assert.equal(project!.events.some((item) => item.verification === "VERIFIED"), true);
    assert.notEqual(run.coverage.official, "FAILED");
    assert.ok(project!.monitoring.lastOfficialSuccessAt);
    const digest = maybeDailyDigest(project!, new Date("2026-06-11T00:00:00.000Z"), []);
    assert.ok(digest === null || digest.kind === "DAILY_DIGEST");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
