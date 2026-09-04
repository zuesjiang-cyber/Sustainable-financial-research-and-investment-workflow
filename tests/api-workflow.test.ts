import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

process.env.FINTRUST_DATA_DIR = mkdtempSync(path.join(tmpdir(), "fintrust-api-test-"));
delete process.env.GEMINI_API_KEY;
delete process.env.FINTRUST_LLM_API_KEY;
const { createApp } = await import("../src/server/app");

test("HTTP P0: create isolated projects, draft/confirm/retry, memory retention, stale conflict and snapshot", async () => {
  const app = await createApp();
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const root = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  async function request(url: string, method = "GET", body?: unknown) {
    const response = await fetch(root + url, { method, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, data: await response.json() as any };
  }
  try {
    const newProject = { company: "测试公司", ticker: "TEST", theses: [{ id: "THESIS_01", title: "毛利率", original_view: "毛利率应改善", verification_criteria: "同比提升超过0.5个百分点" }], questions: [{ id: "Q01", question_text: "改善原因是否为折旧下降？" }], initial_notes: "2024 年毛利率为 20%。" };
    const first = await request("/api/projects", "POST", newProject);
    const second = await request("/api/projects", "POST", newProject);
    assert.equal(first.status, 201, JSON.stringify(first.data));
    assert.equal(second.status, 201, JSON.stringify(second.data));
    assert.notEqual(first.data.theses[0].id, second.data.theses[0].id);
    assert.notEqual(first.data.open_questions[0].id, second.data.open_questions[0].id);
    const id = first.data.id;
    const thesisId = first.data.theses[0].id;
    const base = `/api/projects/${id}`;
    const preview = await request(base + "/analyze-material", "POST", { title: "T1 实验材料", content: "2025 年毛利率为 21%。\n折旧变化尚未披露。", snippets: [{ id: "FAKE", page: 1, text: "伪造证据" }] });
    assert.equal(preview.status, 200, JSON.stringify(preview.data));
    assert.equal(preview.data.analysis_meta.execution_mode, "manual_review");
    assert.equal(preview.data.deltas[0].round_assessment, "unresolved");
    assert.equal((await request(base)).data.current_version, "T0", "preview must not mutate current state");
    assert.ok(preview.data.material.evidence_snippets.length);
    for (const s of preview.data.material.evidence_snippets) {
      assert.ok(preview.data.material.content.includes(s.text));
      assert.equal(s.page, null);
      assert.notEqual(s.id, "FAKE");
    }
    const confirmation = { draftId: preview.data.draft_id, parentVersion: "T0", deltas: preview.data.deltas,
      userRevisions: { [thesisId]: "不把折旧下降当已证实原因；T2 需要折旧拆分。" }, questions: preview.data.questions_update };
    confirmation.deltas[0].reason = "人工确认：毛利率改善，但原因未知。";
    confirmation.deltas[0].new_status = "部分支持";
    const saved = await request(base + "/update", "POST", confirmation);
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    assert.equal(saved.data.current_version, "T1");
    assert.equal(saved.data.updates.at(-1).original_deltas[0].new_status, "待评估");
    assert.equal(saved.data.theses[0].current_reason, confirmation.deltas[0].reason);
    assert.equal((await request(base + "/update", "POST", confirmation)).status, 200);
    assert.equal((await request(base + "/update", "POST", { ...confirmation, userRevisions: { [thesisId]: "不同内容" } })).status, 409);
    assert.equal((await request(`/api/projects/${second.data.id}/update`, "POST", confirmation)).status, 409);
    const t2 = (await request(base + "/analyze-material", "POST", { title: "T2 无关材料", content: "本次公告仅更新办公室地址，尚未披露成本细项。" })).data;
    const saved2 = await request(base + "/update", "POST", { draftId: t2.draft_id, parentVersion: "T1", deltas: t2.deltas, userRevisions: {}, questions: t2.questions_update });
    assert.equal(saved2.status, 200, JSON.stringify(saved2.data));
    assert.equal(saved2.data.theses[0].current_status, "部分支持");
    assert.equal(saved2.data.theses[0].user_revision, confirmation.userRevisions[thesisId]);
    const context = await request(base + "/context");
    assert.match(JSON.stringify(context.data), /T2 需要折旧拆分/);
    const stale = (await request(base + "/analyze-material", "POST", { title: "T3 材料", content: "测试材料：新数据尚待确认。" })).data;
    assert.equal((await request(base + `/theses/${thesisId}`, "PUT", { verification_criteria: "以两个季度改善为标准" })).status, 200);
    const staleSave = await request(base + "/update", "POST", { draftId: stale.draft_id, parentVersion: "T2", deltas: stale.deltas, userRevisions: {}, questions: stale.questions_update });
    assert.equal(staleSave.status, 409);
    const snapshot = await request(base + "/export");
    assert.equal((await request("/api/projects/import", "POST", snapshot.data)).status, 200);
    const restored = await request(base);
    assert.equal(restored.data.current_version, "T2");
    assert.equal(restored.data.theses[0].user_revision, confirmation.userRevisions[thesisId]);
    assert.equal(restored.data.documents[1].content, "2025 年毛利率为 21%。\n折旧变化尚未披露。");
    assert.equal((await request(base + "/update", "POST", { newVersion: "T3", materialContent: "old unsafe API" })).status, 400);
  } finally { await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve())); }
});
