import { createHash } from "crypto";
import type {
  ProjectState,
  ResearchThesis,
  FollowUpQuestion,
  ThesisRevision,
} from "../types/fintrust";

export interface ThesisContextItem {
  id: string;
  title: string;
  original_view: string;
  current_view?: string;
  basis: string;
  baseline_criteria: string;
  verification_timeframe: string;
  current_status: string;
  current_reason: string;
  user_revision?: string;
  revision_history: ThesisRevision[];
  citations: string[];
}

export interface QuestionContextItem {
  id: string;
  question_text: string;
  status: "未解决" | "部分解决" | "已解决";
  created_in_version: string;
  resolved_in_version?: string | null;
  answer_notes: string;
  evidence_ids: string[];
}

export interface MaterialContextItem {
  id: string;
  version: string;
  title: string;
  disclosure_date: string;
  snippet_count: number;
  evidence_ids: string[];
}

export interface ResearchContext {
  project_id: string;
  company: string;
  ticker: string;
  current_version: string;
  target_version: string;
  state_token: string;
  theses: ThesisContextItem[];
  open_questions: QuestionContextItem[];
  resolved_questions: QuestionContextItem[];
  confirmed_materials: MaterialContextItem[];
  user_corrections_summary: string;
  prompt_context_text: string;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => stableValue(item));
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return Object.keys(object)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = stableValue(object[key]);
        return result;
      }, {});
  }
  return value;
}

/**
 * A deterministic fingerprint of the confirmed research state. Document ids
 * and a content/evidence fingerprint are both included so callers can use it
 * as an optimistic-concurrency token even when an import replaces text under
 * an existing id.
 */
export function researchStateToken(project: ProjectState): string {
  const state = {
    current_version: project.current_version,
    summary: project.summary || "",
    theses: (project.theses || [])
      .map((thesis) => ({
        id: thesis.id,
        title: thesis.title,
        original_view: thesis.original_view,
        current_view: thesis.current_view,
        basis: thesis.basis,
        verification_criteria: thesis.verification_criteria,
        verification_timeframe: thesis.verification_timeframe,
        current_status: thesis.current_status,
        current_reason: thesis.current_reason,
        user_revision: thesis.user_revision,
        revision_history: thesis.revision_history || [],
        citations: thesis.citations || [],
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    questions: (project.open_questions || [])
      .map((question) => ({
        id: question.id,
        question_text: question.question_text,
        status: question.status,
        created_in_version: question.created_in_version,
        resolved_in_version: question.resolved_in_version || null,
        answer_notes: question.answer_notes || "",
        evidence_ids: question.evidence_ids || [],
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    document_ids: (project.documents || []).map((document) => document.id).sort(),
    // Include a deterministic document fingerprint as well as ids. An import
    // may replace a document's text while retaining its id and version; such a
    // replacement must invalidate an older analysis draft.
    documents: (project.documents || [])
      .map((document) => ({
        id: document.id,
        content: document.content,
        source_type: document.source_type,
        disclosure_date: document.disclosure_date,
        evidence_snippets: document.evidence_snippets || [],
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
  return createHash("sha256").update(JSON.stringify(stableValue(state))).digest("hex");
}

function nextVersion(currentVersion: string): string {
  const match = /^T(\d+)$/.exec(currentVersion);
  return match ? `T${Number(match[1]) + 1}` : "T1";
}

function latestRevisionMap(project: ProjectState): Record<string, string> {
  const revisions: Record<string, string> = {};
  for (const update of project.updates || []) {
    for (const [thesisId, value] of Object.entries(update.user_revisions || {})) {
      // Presence matters: an explicitly confirmed empty string is a deliberate
      // clearing and must not fall back to an older correction.
      if (typeof value === "string") revisions[thesisId] = value;
    }
  }
  for (const thesis of project.theses || []) {
    for (const history of thesis.revision_history || []) {
      if (Object.prototype.hasOwnProperty.call(history.changes || {}, "user_revision")) {
        const value = history.changes.user_revision;
        if (typeof value === "string") revisions[thesis.id] = value;
      }
    }
  }
  return revisions;
}

function questionContext(question: FollowUpQuestion): QuestionContextItem {
  return {
    id: question.id,
    question_text: question.question_text,
    status: question.status,
    created_in_version: question.created_in_version,
    resolved_in_version: question.resolved_in_version,
    answer_notes: question.answer_notes || "",
    evidence_ids: question.evidence_ids || [],
  };
}

/**
 * Assemble the confirmed state and relevant evidence index for the next
 * analysis round. This is intentionally derived from ProjectState so there is
 * one source of truth for current theses, corrections and questions.
 */
export function buildResearchContext(project: ProjectState, targetVersion?: string): ResearchContext {
  const currentVersion = project.current_version;
  const target = targetVersion || nextVersion(currentVersion);
  const revisionMap = latestRevisionMap(project);

  const thesisItems: ThesisContextItem[] = (project.theses || []).map((thesis: ResearchThesis) => {
    const hasDirectRevision = thesis.user_revision !== undefined;
    const revision = hasDirectRevision ? thesis.user_revision : revisionMap[thesis.id];
    return {
      id: thesis.id,
      title: thesis.title,
      original_view: thesis.original_view,
      current_view: thesis.current_view,
      basis: thesis.basis,
      baseline_criteria: thesis.verification_criteria,
      verification_timeframe: thesis.verification_timeframe,
      current_status: thesis.current_status,
      // Preserve an explicitly empty reason; only an absent legacy value gets
      // the baseline label.
      current_reason: thesis.current_reason !== undefined ? thesis.current_reason : "基于基线假设确立",
      user_revision: revision,
      revision_history: thesis.revision_history || [],
      citations: thesis.citations || [],
    };
  });

  const openQuestions: QuestionContextItem[] = [];
  const resolvedQuestions: QuestionContextItem[] = [];
  for (const question of project.open_questions || []) {
    const item = questionContext(question);
    if (question.status === "已解决") resolvedQuestions.push(item);
    else openQuestions.push(item);
  }

  const versionByDocument = new Map<string, string>();
  for (const update of project.updates || []) {
    if (update.material_id) versionByDocument.set(update.material_id, update.version);
  }
  const confirmedMaterials: MaterialContextItem[] = (project.documents || []).map((document) => ({
    id: document.id,
    version:
      versionByDocument.get(document.id) ||
      (document.id.startsWith("DOC_T") ? document.id.split("_")[1] : currentVersion),
    title: document.title,
    disclosure_date: document.disclosure_date,
    snippet_count: document.evidence_snippets ? document.evidence_snippets.length : 0,
    evidence_ids: (document.evidence_snippets || []).map((snippet) => snippet.id),
  }));

  const correctionLines = thesisItems
    .filter((thesis) => thesis.user_revision !== undefined && thesis.user_revision.trim().length > 0)
    .map((thesis) => `【观点 ${thesis.id} - ${thesis.title}】分析师人工复核修订：${thesis.user_revision}`);
  const historyLines = thesisItems.flatMap((thesis) =>
    thesis.revision_history
      .filter((revision) => {
        const value = revision.changes?.user_revision;
        return typeof value === "string" && value.trim().length > 0;
      })
      .map(
        (revision) =>
          `【观点 ${thesis.id}，${revision.version}】历史修订：${String(revision.changes.user_revision)}`
      )
  );
  const userCorrections = Array.from(new Set([...correctionLines, ...historyLines])).join("\n");

  const promptLines: string[] = [
    `=== 持续研究记忆上下文 (RESEARCH MEMORY CONTEXT) ===`,
    `标的公司：${project.company} (${project.ticker})`,
    `演进阶段：当前已确认版本【${currentVersion}】→ 目标推进版本【${target}】`,
    `研究状态令牌：${researchStateToken(project)}`,
    `项目背景：${project.summary || "买方核心投资观点持续跟踪"}`,
    ``,
    `--- 1. 已确认核心投资假设、当前判断与依据 ---`,
  ];

  thesisItems.forEach((thesis) => {
    promptLines.push(
      `[${thesis.id}] ${thesis.title}`,
      `  • 初始基准观点（不可覆盖）：${thesis.original_view}`,
      `  • 研究依据/口径：${thesis.basis || "未记录"}`,
      `  • 验证条件：${thesis.baseline_criteria || "未设定"}`,
      `  • 验证期限：${thesis.verification_timeframe || "未设定"}`,
      `  • 当前已确认判断：【${thesis.current_view || thesis.current_status}】`,
      `  • 当前核验状态：【${thesis.current_status}】`,
      `  • 当前判断理由（含分析判断，需核对来源）：${thesis.current_reason}`
    );
    if (thesis.user_revision !== undefined && thesis.user_revision.trim().length > 0) {
      promptLines.push(`  ★【分析师已确认修正/新研究假设】（高优先级，非已披露事实）：${thesis.user_revision}`);
    }
    if (thesis.revision_history.length > 0) {
      promptLines.push(`  • 修订历史条数：${thesis.revision_history.length}`);
    }
    if (thesis.citations.length > 0) promptLines.push(`  • 已关联证据底稿：${thesis.citations.join(", ")}`);
    promptLines.push(``);
  });

  promptLines.push(`--- 2. 前期遗留待验证疑问 (必须在本轮材料中对照排查) ---`);
  if (openQuestions.length === 0) promptLines.push(`（暂无未决疑问）`);
  else {
    openQuestions.forEach((question) => {
      promptLines.push(
        `- [${question.id}] (${question.status}，起源于${question.created_in_version}): ${question.question_text}`
      );
      if (question.answer_notes) promptLines.push(`    已积累笔记：${question.answer_notes}`);
      if (question.evidence_ids.length > 0) promptLines.push(`    关联证据：${question.evidence_ids.join(", ")}`);
    });
  }

  promptLines.push(``, `--- 3. 历史已解决疑问 (供背景参照，勿重复发问) ---`);
  if (resolvedQuestions.length === 0) promptLines.push(`（暂无已解决疑问）`);
  else {
    resolvedQuestions.forEach((question) => {
      promptLines.push(
        `- [${question.id}] (已在${question.resolved_in_version || "历史版本"}解决): ${question.question_text}`
      );
      if (question.answer_notes) promptLines.push(`    已确认答案：${question.answer_notes}`);
      if (question.evidence_ids.length > 0) promptLines.push(`    关联证据：${question.evidence_ids.join(", ")}`);
    });
  }

  promptLines.push(
    ``,
    `--- 4. 已入库历史材料索引 ---`,
    confirmedMaterials.length > 0
      ? confirmedMaterials
          .map(
            (material) =>
              `• [${material.version}] ${material.id}《${material.title}》（披露日期：${material.disclosure_date}，含${material.snippet_count}条底稿切片${material.evidence_ids.length > 0 ? `：${material.evidence_ids.join(", ")}` : ""}）`
          )
          .join("\n")
      : "（暂无已入库材料）",
    ``,
    `--- 5. 分析师修订摘要（与公开事实严格区分） ---`,
    userCorrections || "（暂无人工修订）",
    `=== 记忆上下文结束 ===`
  );

  return {
    project_id: project.id,
    company: project.company,
    ticker: project.ticker,
    current_version: currentVersion,
    target_version: target,
    state_token: researchStateToken(project),
    theses: thesisItems,
    open_questions: openQuestions,
    resolved_questions: resolvedQuestions,
    confirmed_materials: confirmedMaterials,
    user_corrections_summary: userCorrections,
    prompt_context_text: promptLines.join("\n"),
  };
}
