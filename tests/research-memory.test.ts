import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { applyResearchUpdate, saveFullProject, updateResearchThesis } from "../src/server/projectRepo";
import { buildResearchContext, researchStateToken } from "../src/server/buildResearchContext";
import { getDb } from "../src/server/db";
import { makeDelta, makeResearchProject, RESEARCH_QUESTION_ID, RESEARCH_THESIS_ID } from "./fixtures/researchMemory";
import type { FollowUpQuestion, ResearchDocument } from "../src/types/fintrust";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "fintrust-research-memory-"));
process.env.FINTRUST_DATA_DIR = dataDir;

function document(id: string, text: string): ResearchDocument {
  return {
    id,
    project_id: "memory-fixture-project",
    source_type: "quarterly_update",
    title: id,
    disclosure_date: "2026-03-31",
    content: text,
    added_at: `${id}-added`,
    evidence_snippets: [{ id: `evidence-${id}`, page: 1, text }],
  };
}

function question(status: FollowUpQuestion["status"], answer_notes: string): FollowUpQuestion {
  return {
    id: RESEARCH_QUESTION_ID,
    question_text: "产品结构与成本各解释多少毛利率变化？",
    status,
    created_in_version: "T0",
    resolved_in_version: null,
    answer_notes,
    updated_at: "",
  };
}

test("T0 -> T1 correction -> T2 keeps the confirmed research memory", async () => {
  await saveFullProject(makeResearchProject());
  let project = (await import("../src/server/projectRepo")).getProjectById
    ? await (await import("../src/server/projectRepo")).getProjectById("memory-fixture-project")
    : null;
  assert.ok(project);
  const t0Token = researchStateToken(project);

  const t1Delta = makeDelta(project, { current_view: "短期盈利承压，但高端化假设仍待拆分" });
  project = await applyResearchUpdate(
    project.id,
    "T1",
    "T0",
    "T1 季报",
    "毛利率下降，成本上升。",
    [t1Delta],
    { [RESEARCH_THESIS_ID]: "高端产品策略仍是研究假设，不能把毛利率下降直接归因于策略失败。" },
    [question("部分解决", "T1 仅确认毛利率下降，尚未拆分产品结构与成本。")],
    [],
    {
      document: document("doc-t1", "毛利率下降，成本上升。"),
      summary: "T1 短期盈利承压，原因尚待拆分",
      original_deltas: [t1Delta],
      request_id: "draft-t1",
      payload_hash: "payload-t1",
      expected_state_token: t0Token,
    }
  );
  assert.equal(project.current_version, "T1");
  assert.equal(project.theses[0].original_view, "高端产品占比提高会改善毛利率");
  assert.equal(project.theses[0].current_view, "短期盈利承压，但高端化假设仍待拆分");
  assert.match(project.theses[0].user_revision || "", /仍是研究假设/);
  assert.equal(project.updates[1].summary, "T1 短期盈利承压，原因尚待拆分");
  assert.deepEqual(project.updates[1].original_deltas, project.updates[1].thesis_deltas);

  const contextT1 = buildResearchContext(project, "T2");
  assert.match(contextT1.prompt_context_text, /仍是研究假设/);
  assert.match(contextT1.prompt_context_text, /产品结构与成本各解释多少/);
  assert.equal(contextT1.theses[0].verification_timeframe, "未来两个财报周期");
  assert.equal(contextT1.theses[0].basis, "T0 用户研究假设");

  // A later round has no usable evidence. Its round-specific explanation is
  // retained in history, while the confirmed thesis basis remains intact.
  const t2Delta = makeDelta(project, {
    new_status: "不足以判断",
    reason: "T2 材料没有新增可核验信息",
    evidence_ids: [],
    round_assessment: "unresolved",
  });
  project = await applyResearchUpdate(
    project.id,
    "T2",
    "T1",
    "T2 经营简报",
    "公司表示将继续优化产品结构。",
    [t2Delta],
    {},
    [question("部分解决", "")],
    [],
    {
      document: document("doc-t2", "公司表示将继续优化产品结构。"),
      original_deltas: [t2Delta],
      request_id: "draft-t2",
      payload_hash: "payload-t2",
      expected_state_token: researchStateToken(project),
    }
  );
  assert.equal(project.current_version, "T2");
  assert.equal(project.theses[0].current_reason, "T1 材料显示毛利率下降，产品结构影响尚待拆分");
  assert.equal(project.theses[0].current_view, "短期盈利承压，但高端化假设仍待拆分");
  assert.equal(project.open_questions[0].answer_notes, "T1 仅确认毛利率下降，尚未拆分产品结构与成本。");
  assert.equal(project.updates[2].thesis_deltas[0].reason, "T2 材料没有新增可核验信息");

  const contextT2 = buildResearchContext(project, "T3");
  assert.match(contextT2.prompt_context_text, /T1 材料显示毛利率下降/);
  assert.match(contextT2.prompt_context_text, /仍是研究假设/);
  assert.match(contextT2.prompt_context_text, /T1 仅确认毛利率下降/);
});

test("confirmation request ids are exactly idempotent and changed payloads conflict", async () => {
  const { getProjectById } = await import("../src/server/projectRepo");
  const current = await getProjectById("memory-fixture-project");
  assert.ok(current);
  const before = current.updates.length;
  const delta = makeDelta(current, { new_status: "保持", reason: "T2 evidence review" });
  const duplicate = await applyResearchUpdate(
    current.id,
    "T2",
    "T1",
    "T1 季报",
    "毛利率下降，成本上升。",
    [delta],
    { [RESEARCH_THESIS_ID]: current.theses[0].user_revision || "" },
    [question("部分解决", "T1 仅确认毛利率下降，尚未拆分产品结构与成本。")],
    [],
    {
      document: document("doc-t1", "毛利率下降，成本上升。"),
      original_deltas: [delta],
      request_id: "draft-t1",
      payload_hash: "payload-t1",
      expected_state_token: "stale-and-ignored-on-retry",
    }
  );
  assert.equal(duplicate.updates.length, before);

  await assert.rejects(
    () =>
      applyResearchUpdate(
        current.id,
        "T2",
        "T1",
        "changed material",
        "changed payload",
        [delta],
        {},
        [],
        [],
        { request_id: "draft-t1", payload_hash: "different-payload" }
      ),
    (error: any) => error.statusCode === 409 && /different payload/.test(error.message)
  );
});

test("serialized stale-parent confirmations allow one writer and reject the other", async () => {
  const { getProjectById } = await import("../src/server/projectRepo");
  const current = await getProjectById("memory-fixture-project");
  assert.ok(current);
  const token = researchStateToken(current);
  const delta = makeDelta(current, { new_status: "保持", reason: "T3 review" });
  const args = (request_id: string): Parameters<typeof applyResearchUpdate> => [
    current.id,
    "T3",
    "T2",
    `T3 ${request_id}`,
    `material ${request_id}`,
    [delta],
    {},
    [],
    [],
    {
      document: document(`doc-t3-${request_id}`, `material ${request_id}`),
      original_deltas: [delta],
      request_id,
      payload_hash: `hash-${request_id}`,
      expected_state_token: token,
    },
  ];
  const results = await Promise.allSettled([
    applyResearchUpdate(...args("writer-a")),
    applyResearchUpdate(...args("writer-b")),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
  assert.equal((rejected.reason as any).statusCode, 409);
});

test("thesis edits append revision history and survive a disk persistence failure", async () => {
  const { getProjectById } = await import("../src/server/projectRepo");
  const before = await getProjectById("memory-fixture-project");
  assert.ok(before);
  const edited = await updateResearchThesis(before.id, RESEARCH_THESIS_ID, {
    current_reason: "用户补充：需要拆分产品结构与成本",
    current_view: "优先验证结构与成本拆分",
  });
  assert.equal(edited.theses[0].revision_history?.at(-1)?.version, "T3");
  assert.equal(edited.theses[0].revision_history?.at(-1)?.changes.current_view, "优先验证结构与成本拆分");

  const originalWrite = fs.writeFileSync;
  (fs as any).writeFileSync = (file: fs.PathLike, ...rest: any[]) => {
    if (String(file).includes(".fintrust.sqlite.tmp-")) throw new Error("injected disk failure");
    return (originalWrite as any).call(fs, file, ...rest);
  };
  try {
    await assert.rejects(() => updateResearchThesis(before.id, RESEARCH_THESIS_ID, { current_reason: "must roll back" }));
  } finally {
    (fs as any).writeFileSync = originalWrite;
  }
  const after = await getProjectById(before.id);
  assert.equal(after?.theses[0].current_reason, "用户补充：需要拆分产品结构与成本");
  assert.equal(after?.theses[0].revision_history?.some((revision) => revision.changes.current_reason === "must roll back"), false);
  assert.ok(fs.existsSync(path.join(dataDir, "fintrust.sqlite")));
  await getDb();

  const childScript = `
    import { getProjectById } from "./src/server/projectRepo.ts";
    import { buildResearchContext } from "./src/server/buildResearchContext.ts";
    const project = await getProjectById(${JSON.stringify(before.id)});
    if (!project) throw new Error("project missing after reload");
    console.log(JSON.stringify({
      version: project.current_version,
      reason: project.theses[0].current_reason,
      revisionCount: project.theses[0].revision_history?.length || 0,
      correction: buildResearchContext(project).theses[0].user_revision,
    }));
  `;
  const child = spawnSync(process.execPath, ["--import", "tsx/esm", "--input-type=module", "--eval", childScript], {
    cwd: path.resolve(process.cwd()),
    env: { ...process.env, FINTRUST_DATA_DIR: dataDir },
    encoding: "utf8",
  });
  assert.equal(child.status, 0, child.stderr);
  const reloaded = JSON.parse(child.stdout.trim().split("\n").at(-1) || "{}");
  assert.equal(reloaded.version, "T3");
  assert.equal(reloaded.reason, "用户补充：需要拆分产品结构与成本");
  assert.ok(reloaded.revisionCount >= 1);
});

test("explicitly clearing a user correction stays cleared in later rounds", async () => {
  const { getProjectById } = await import("../src/server/projectRepo");
  const current = await getProjectById("memory-fixture-project");
  assert.ok(current);
  const cleared = await updateResearchThesis(current.id, RESEARCH_THESIS_ID, { user_revision: "" });
  assert.equal(cleared.theses[0].user_revision, "");
  const context = buildResearchContext(cleared);
  assert.equal(context.theses[0].user_revision, "");
});

test("legacy question ids remain intact while separate projects can use the same imported id", async () => {
  const { getProjectById } = await import("../src/server/projectRepo");
  const second = makeResearchProject();
  second.id = "memory-fixture-project-2";
  second.name = "第二个项目";
  second.theses = second.theses.map((thesis) => ({ ...thesis, id: `${thesis.id}-2`, project_id: second.id }));
  second.open_questions = second.open_questions.map((question) => ({ ...question, id: "Q01" }));
  second.updates = second.updates.map((update) => ({
    ...update,
    id: `${update.id}-2`,
    project_id: second.id,
  }));
  await saveFullProject(second);
  const firstLoaded = await getProjectById("memory-fixture-project");
  const secondLoaded = await getProjectById(second.id);
  assert.equal(firstLoaded?.open_questions[0].id, RESEARCH_QUESTION_ID);
  assert.equal(secondLoaded?.open_questions[0].id, "Q01");
});

test("state token changes when same-id document content changes", async () => {
  const { getProjectById } = await import("../src/server/projectRepo");
  const project = await getProjectById("memory-fixture-project-2");
  assert.ok(project);
  project.documents = [document("same-document-id", "old source text")];
  await saveFullProject(project);
  const firstToken = researchStateToken((await getProjectById(project.id))!);
  project.documents[0].content = "replacement source text";
  project.documents[0].evidence_snippets[0].text = "replacement source text";
  await saveFullProject(project);
  const secondToken = researchStateToken((await getProjectById(project.id))!);
  assert.notEqual(firstToken, secondToken);
});
