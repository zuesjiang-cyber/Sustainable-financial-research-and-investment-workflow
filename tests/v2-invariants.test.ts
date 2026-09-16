import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { classifyUserInput, createStanceVersion } from "../src/server/v2/stance";
import { canonicalOrigin, uniqueOriginEvidence, verifyProposition } from "../src/server/v2/verification";
import { assertPublicHttpUrl } from "../src/server/v2/ssrf";
import { V2Store } from "../src/server/v2/v2Store";
import { SqliteJobQueue } from "../src/server/v2/jobQueue";
import { ResearchEngine } from "../src/server/v2/researchEngine";
import { BudgetGuard } from "../src/server/v2/budget";
import { CninfoDisclosureClient } from "../src/server/v2/disclosures";
import { TavilyClient } from "../src/server/v2/tavily";
import type { EvidenceRecord } from "../src/shared/v2Domain";

function tmpDir(): string {
  return mkdtempSync(path.join(os.tmpdir(), "fintrust-v2-"));
}

function evidence(partial: Partial<EvidenceRecord>): EvidenceRecord {
  return {
    id: partial.id || "e1",
    projectId: "p1",
    sourceKind: partial.sourceKind || "OFFICIAL_DISCLOSURE",
    title: partial.title || "公告",
    url: partial.url || "http://static.cninfo.com.cn/a.pdf",
    documentId: null,
    quote: partial.quote || "圣邦股份公告已签订合同。",
    occurredAt: partial.occurredAt || "2026-01-01",
    disclosedAt: partial.disclosedAt || "2026-01-02",
    discoveredAt: partial.discoveredAt || "2026-01-02T00:00:00.000Z",
    originKey: partial.originKey || "origin-a",
    parentOriginKey: null,
    companyName: "圣邦股份",
    securityCode: "300661",
    page: 1,
    bbox: [0.1, 0.1, 0.4, 0.2],
    reprintOf: partial.reprintOf || null,
    quality: "NATIVE",
    rawHash: partial.rawHash || "hash-a",
  };
}

test("转发研报且没有认可时不生成用户立场", () => {
  const result = classifyUserInput("转发这篇中金研报如下：预计公司明年毛利率达到30%。");
  assert.equal(result.endorsed, false);
  assert.equal(result.kind, "FORWARD_ONLY");
  assert.equal(createStanceVersion({ rawText: "转发", classification: result, now: new Date().toISOString() }), null);
});

test("长期看好竞争力可以记录立场，但不编造推翻阈值", () => {
  const result = classifyUserInput("我长期看好圣邦股份模拟芯片竞争力");
  assert.equal(result.endorsed, true);
  assert.equal(result.thresholds.length, 0);
});

test("把计划误写成完成、旧闻误写成新事件、引用不匹配必须拦截", () => {
  const planned = verifyProposition({
    projectId: "p1",
    description: "签约",
    stage: "PERFORMED",
    proposition: "合同已经履行",
    companyName: "圣邦股份",
    securityCode: "300661",
    occurredAt: "2026-01-01",
    disclosedAt: "2026-01-02",
    discoveredAt: "2026-01-02T00:00:00.000Z",
    evidence: [evidence({ quote: "圣邦股份拟签订重大合同，有望于明年履行。" })],
  });
  assert.equal(planned.accepted, false);
  assert.equal(planned.event.verification, "REJECTED");

  const mismatch = verifyProposition({
    projectId: "p1",
    description: "签约",
    stage: "ANNOUNCED",
    proposition: "公司公布签约公告",
    companyName: "贵州茅台",
    securityCode: "600519",
    occurredAt: "2026-01-01",
    disclosedAt: "2026-01-02",
    discoveredAt: "2026-01-02T00:00:00.000Z",
    evidence: [evidence({ quote: "圣邦股份公告披露日常经营事项。", title: "圣邦股份公告" })],
  });
  assert.equal(mismatch.accepted, false);

  const oldNews = verifyProposition({
    projectId: "p1",
    description: "旧闻",
    stage: "ANNOUNCED",
    proposition: "公司公布签约公告",
    companyName: "圣邦股份",
    securityCode: "300661",
    occurredAt: "2024-01-01",
    disclosedAt: "2024-01-02",
    discoveredAt: "2026-01-02T00:00:00.000Z",
    claimedNew: true,
    evidence: [evidence({ quote: "圣邦股份公告披露已签订日常经营合同。", occurredAt: "2024-01-01", disclosedAt: "2024-01-02" })],
  });
  assert.equal(oldNews.reasons.some((item) => item.includes("过久")), true);
});

test("多篇转载与同一事实的多条推论不重复增强证据", () => {
  const reprints = uniqueOriginEvidence([
    evidence({ id: "a", originKey: "same", rawHash: "1" }),
    evidence({ id: "b", originKey: "same", rawHash: "2", sourceKind: "REPRINT", title: "转载" }),
  ]);
  assert.equal(reprints.length, 1);
  assert.equal(canonicalOrigin("https://x.com/a?utm=1#frag", "t", "q").includes("utm"), false);
});

test("禁止抓取本地与私有网络地址", async () => {
  await assert.rejects(() => assertPublicHttpUrl("http://127.0.0.1/secret"), /私有|本地/);
  await assert.rejects(() => assertPublicHttpUrl("http://localhost/x"), /私有|本地/);
});

test("SQLite 任务队列重启不丢任务且重复提交不重复写入", async () => {
  const dir = tmpDir();
  process.env.FINTRUST_DATA_DIR = dir;
  try {
    const queue = new SqliteJobQueue(dir, () => new Date("2026-01-01T00:00:00.000Z"));
    const first = await queue.enqueue({ kind: "BACKGROUND", dedupeKey: "bg:run-1", payload: { runId: "run-1" } });
    const second = await queue.enqueue({ kind: "BACKGROUND", dedupeKey: "bg:run-1", payload: { runId: "run-1" } });
    assert.equal(first.id, second.id);
    const claimed = await queue.claimNext("w1");
    assert.ok(claimed);
    await queue.complete(claimed!.id);
    const again = await queue.enqueue({ kind: "BACKGROUND", dedupeKey: "bg:run-1", payload: { runId: "run-1" } });
    assert.equal(again.status, "DONE");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("用户原话保存、已读不改立场、修改理由进入下一版本", async () => {
  const dir = tmpDir();
  process.env.FINTRUST_DATA_DIR = dir;
  const store = new V2Store(dir, () => new Date("2026-06-01T00:00:00.000Z"));
  const engine = new ResearchEngine({
    store,
    disclosures: new CninfoDisclosureClient(async () => new Response(JSON.stringify({ announcements: [] }), { status: 200 })),
    tavily: new TavilyClient("", async () => new Response("{}")),
    roles: { fast: null, research: null, review: null },
    budget: new BudgetGuard(store),
    clock: () => new Date("2026-06-01T00:00:00.000Z"),
  });
  try {
    const started = await engine.startResearch({ text: "我长期看好圣邦股份模拟芯片竞争力" });
    assert.equal(started.project.currentStance?.summary.includes("竞争力"), true);
    const version = started.project.currentStance?.version;
    await engine.applyUserMessage(started.project.id, "我维持判断，但把观察周期改到2026年年报。");
    const updated = await store.getProject(started.project.id);
    assert.equal((updated?.currentStance?.version || 0) > (version || 0), true);
    assert.match(updated?.currentStance?.rawText || "", /年报/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
