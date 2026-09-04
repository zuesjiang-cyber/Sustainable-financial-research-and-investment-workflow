import type { ProjectState, ThesisDelta, FollowUpQuestion } from "../../src/types/fintrust";

export const RESEARCH_PROJECT_ID = "memory-fixture-project";
export const RESEARCH_THESIS_ID = "memory-fixture-thesis";
export const RESEARCH_QUESTION_ID = "memory-fixture-question";

export function makeResearchProject(): ProjectState {
  const now = "2026-01-01T00:00:00.000Z";
  const question: FollowUpQuestion = {
    id: RESEARCH_QUESTION_ID,
    question_text: "产品结构与成本各解释多少毛利率变化？",
    status: "未解决",
    created_in_version: "T0",
    resolved_in_version: null,
    answer_notes: "",
    updated_at: now,
  };
  return {
    id: RESEARCH_PROJECT_ID,
    name: "持续研究记忆测试",
    company: "模拟公司",
    ticker: "TEST",
    current_version: "T0",
    status: "active",
    summary: "测试用户持续修正的研究假设",
    created_at: now,
    updated_at: now,
    theses: [
      {
        id: RESEARCH_THESIS_ID,
        project_id: RESEARCH_PROJECT_ID,
        title: "高端产品结构改善盈利",
        original_view: "高端产品占比提高会改善毛利率",
        formed_at: now,
        basis: "T0 用户研究假设",
        verification_criteria: "毛利率同比提升",
        verification_timeframe: "未来两个财报周期",
        current_status: "保持",
        current_view: "高端产品结构改善盈利",
        current_reason: "等待新材料核验",
        citations: [],
        revision_history: [],
        updated_at: now,
      },
    ],
    documents: [],
    updates: [
      {
        id: "memory-fixture-update-t0",
        project_id: RESEARCH_PROJECT_ID,
        version: "T0",
        parent_version: null,
        title: "T0 初始研究假设",
        material_id: "",
        thesis_deltas: [],
        user_revisions: {},
        follow_up_questions: [question],
        confirmed_at: now,
        confirmed_by: "用户",
        summary: "T0 初始研究假设",
      },
    ],
    open_questions: [question],
  };
}

export function makeDelta(
  project: ProjectState,
  overrides: Partial<ThesisDelta> = {}
): ThesisDelta {
  const thesis = project.theses[0];
  return {
    thesis_id: thesis.id,
    title: thesis.title,
    previous_status: thesis.current_status,
    new_status: "削弱",
    reason: "T1 材料显示毛利率下降，产品结构影响尚待拆分",
    gap_explanation: {
      observed: "毛利率下降",
      disclosed_reason: "公司披露成本上升",
      unverified_hypotheses: "产品结构与成本各解释多少变化",
    },
    evidence_ids: ["evidence-t1"],
    next_steps: "补查产品结构与成本拆分",
    round_assessment: "weakened",
    ...overrides,
  };
}
