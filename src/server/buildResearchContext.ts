import type { ProjectState, ResearchThesis, FollowUpQuestion } from "../types/fintrust";

export interface ThesisContextItem {
  id: string;
  title: string;
  original_view: string;
  baseline_criteria: string;
  current_status: string;
  current_reason: string;
  user_revision?: string;
  citations: string[];
}

export interface QuestionContextItem {
  id: string;
  question_text: string;
  status: "未解决" | "部分解决" | "已解决";
  created_in_version: string;
  resolved_in_version?: string | null;
  answer_notes: string;
}

export interface MaterialContextItem {
  version: string;
  title: string;
  disclosure_date: string;
  snippet_count: number;
}

export interface ResearchContext {
  project_id: string;
  company: string;
  ticker: string;
  current_version: string;
  target_version: string;
  theses: ThesisContextItem[];
  open_questions: QuestionContextItem[];
  resolved_questions: QuestionContextItem[];
  confirmed_materials: MaterialContextItem[];
  user_corrections_summary: string;
  prompt_context_text: string;
}

/**
 * Builds the structured memory context for continuous research evolution.
 * Ensures analyst revisions and past questions from prior confirmed versions
 * are strictly preserved and injected into the next round of analysis.
 */
export function buildResearchContext(
  project: ProjectState,
  targetVersion?: string
): ResearchContext {
  const currentVersion = project.current_version;
  const nextVer =
    targetVersion ||
    (currentVersion === "T0"
      ? "T1"
      : currentVersion === "T1"
      ? "T2"
      : `T${parseInt(currentVersion.replace("T", "") || "1") + 1}`);

  // Collect latest user revisions from updates if thesis does not have it directly
  const revisionMap: Record<string, string> = {};
  for (const update of project.updates || []) {
    if (update.user_revisions) {
      Object.assign(revisionMap, update.user_revisions);
    }
  }

  // Build theses context
  const thesesItems: ThesisContextItem[] = project.theses.map((t) => {
    const revision = t.user_revision || revisionMap[t.id] || undefined;
    return {
      id: t.id,
      title: t.title,
      original_view: t.original_view,
      baseline_criteria: t.verification_criteria,
      current_status: t.current_status,
      current_reason: t.current_reason || "基于基线假设确立",
      user_revision: revision,
      citations: t.citations || [],
    };
  });

  // Separate questions into open and resolved
  const openQuestions: QuestionContextItem[] = [];
  const resolvedQuestions: QuestionContextItem[] = [];

  for (const q of project.open_questions || []) {
    const item: QuestionContextItem = {
      id: q.id,
      question_text: q.question_text,
      status: q.status,
      created_in_version: q.created_in_version,
      resolved_in_version: q.resolved_in_version,
      answer_notes: q.answer_notes || "",
    };
    if (q.status === "已解决") {
      resolvedQuestions.push(item);
    } else {
      openQuestions.push(item);
    }
  }

  // Summary of confirmed materials
  const confirmedMaterials: MaterialContextItem[] = (project.documents || []).map((doc) => ({
    version: doc.id.startsWith("DOC_T") ? doc.id.split("_")[1] : currentVersion,
    title: doc.title,
    disclosure_date: doc.disclosure_date,
    snippet_count: doc.evidence_snippets ? doc.evidence_snippets.length : 0,
  }));

  // Build user corrections summary
  const userCorrections = thesesItems
    .filter((t) => t.user_revision && t.user_revision.trim().length > 0)
    .map((t) => `【观点 ${t.id} - ${t.title}】分析师人工复核修订：${t.user_revision}`)
    .join("\n");

  // Format into rich, clear prompt context text
  const promptLines: string[] = [
    `=== 持续研究记忆上下文 (RESEARCH MEMORY CONTEXT) ===`,
    `标的公司：${project.company} (${project.ticker})`,
    `演进阶段：当前已确认版本【${currentVersion}】→ 目标推进版本【${nextVer}】`,
    `项目背景：${project.summary || "买方核心投资观点持续跟踪"}`,
    ``,
    `--- 1. 已确认核心投资假设与最新核验依据 ---`,
  ];

  thesesItems.forEach((t) => {
    promptLines.push(
      `[${t.id}] ${t.title}`,
      `  • 初始基准观点：${t.original_view}`,
      `  • 量化验证阈值：${t.baseline_criteria}`,
      `  • 当前核验状态：【${t.current_status}】`,
      `  • 最新事实依据：${t.current_reason}`
    );
    if (t.user_revision) {
      promptLines.push(
        `  ★【分析师已确认修正/新研究假设】（高优先级）：${t.user_revision}`
      );
    }
    if (t.citations.length > 0) {
      promptLines.push(`  • 已关联证据底稿：${t.citations.join(", ")}`);
    }
    promptLines.push(``);
  });

  promptLines.push(`--- 2. 前期遗留待验证疑问 (必须在本轮材料中对照排查) ---`);
  if (openQuestions.length === 0) {
    promptLines.push(`（暂无未决疑问）`);
  } else {
    openQuestions.forEach((q) => {
      promptLines.push(
        `- [${q.id}] (${q.status}，起源于${q.created_in_version}): ${q.question_text}`
      );
      if (q.answer_notes) {
        promptLines.push(`    已积累笔记：${q.answer_notes}`);
      }
    });
  }

  if (resolvedQuestions.length > 0) {
    promptLines.push(``, `--- 3. 历史已解决疑问 (供背景参照，勿重复发问) ---`);
    resolvedQuestions.forEach((q) => {
      promptLines.push(
        `- [${q.id}] (已在${q.resolved_in_version || "历史版本"}解决): ${q.question_text}`
      );
    });
  }

  promptLines.push(
    ``,
    `--- 4. 已审计入库历史材料索引 ---`,
    confirmedMaterials.map((m) => `• [${m.version}] 《${m.title}》（披露日期：${m.disclosure_date}，含${m.snippet_count}条底稿切片）`).join("\n"),
    `=== 记忆上下文结束 ===`
  );

  return {
    project_id: project.id,
    company: project.company,
    ticker: project.ticker,
    current_version: currentVersion,
    target_version: nextVer,
    theses: thesesItems,
    open_questions: openQuestions,
    resolved_questions: resolvedQuestions,
    confirmed_materials: confirmedMaterials,
    user_corrections_summary: userCorrections,
    prompt_context_text: promptLines.join("\n"),
  };
}
