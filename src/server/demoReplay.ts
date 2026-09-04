import { randomUUID } from "node:crypto";
import { ingestMaterial, type MaterialInput } from "./materialIngestion";
import { buildResearchContext, researchStateToken } from "./buildResearchContext";
import { executeResearchTool, type FinancialCalculationResult } from "./researchTools";
import { validateResearchClaims } from "./claimVerification";
import type { ContinuousAnalysisResult, ProjectState, ResearchToolTrace, ThesisDelta } from "../types/fintrust";

/** Authored fictional scenario, explicitly selected by the user; never a live-model fallback. */
export function demoProjectInput() {
  return { company: "星辰芯片（虚构演示公司）", ticker: "DEMO", name: "持续投研 Demo：从观点到证据再到记忆",
    summary: "演示回放：财务数字为虚构数据，解读按预设剧本；检索、计算、保存和跨轮记忆使用真实产品流程。",
    initial_notes: "T0 研究底稿：预期收入同比至少增长15%；毛利率比上一观察期提升至少1个百分点；经营现金流/净利润应达到0.9倍。提价可能解释毛利率改善，但尚未验证。",
    theses: [
      { title: "收入增长", original_view: "收入恢复增长，需求开始改善。", verification_criteria: "收入同比增长至少15%", current_status: "待评估" },
      { title: "毛利率改善", original_view: "毛利率将改善，提价可能是原因。", verification_criteria: "毛利率提升至少1个百分点；单独核查改善原因", current_status: "待评估" },
      { title: "现金流质量", original_view: "盈利增长应转化为经营现金流。", verification_criteria: "同期经营现金流/净利润至少0.9倍", current_status: "待评估" },
    ], questions: ["毛利率改善来自提价、产品结构还是成本？", "利润能否转化为现金？"] };
}

export function demoMaterial(version: string): MaterialInput {
  if (version !== "T1" && version !== "T2") throw Object.assign(new Error("演示包含 T1、T2 两轮；之后可继续提供自己的材料。"), { statusCode: 400 });
  return version === "T1" ? {
    title: "【演示回放 T1】星辰芯片首轮业绩更新", source_type: "quarterly_update", disclosure_date: "2025-04-30",
    content: "【虚构演示数据，不是真实公告】\n2025Q1营业收入120万元；2024Q1营业收入100万元。\n2025Q1毛利率22%；2024Q1毛利率20%。\n2025Q1经营现金流6万元；2025Q1净利润10万元。\n公司称高端产品占比提升，但未披露提价幅度及毛利率改善原因的定量拆分。\n回款落后于利润，部分客户货款尚未收到。",
  } : {
    title: "【演示回放 T2】星辰芯片补充经营资料", source_type: "quarterly_update", disclosure_date: "2025-07-31",
    content: "【虚构演示数据，不是真实公告】\n2025Q2营业收入132万元；2024Q2营业收入110万元。\n2025Q2毛利率24%；2025Q1毛利率22%。\n2025Q2经营现金流12万元；2025Q2净利润12万元。\n公司披露：产品售价基本未变，测试成本下降是本季度毛利率改善的主要原因。\n前期客户货款已回收；产品结构对毛利率的具体贡献仍未披露。",
  };
}

export async function runDemoReplay(project: ProjectState, input: MaterialInput): Promise<ContinuousAnalysisResult> {
  const started = Date.now();
  if (project.ticker !== "DEMO") throw Object.assign(new Error("演示回放仅用于示例项目"), { statusCode: 400 });
  const version = `T${Number(project.current_version.slice(1)) + 1}`;
  const sample = demoMaterial(version);
  if (input.title !== sample.title || input.content !== sample.content) throw Object.assign(new Error("示例资料已修改，请使用正常研究模式重新分析"), { statusCode: 400 });
  const material = ingestMaterial(project.id, sample);
  const context = { project, material };
  const memory = buildResearchContext(project);
  const traces: ResearchToolTrace[] = [];
  const call = async (tool: string, args: Record<string, unknown>) => {
    const start = Date.now();
    const result = await executeResearchTool(tool, args, context);
    traces.push({ id: randomUUID(), tool, arguments: args, result, status: (result as any)?.status === "error" ? "error" : "ok", duration_ms: Date.now() - start });
    return result;
  };
  await call("search_project_documents", { query: "收入 毛利率 现金流", document_ids: [material.id] });
  await call("read_document", { document_id: material.id });
  const sourceId = material.evidence_snippets[0].id;
  const t2 = version === "T2";
  const period = t2 ? "2025Q2" : "2025Q1";
  const operand = (metric: string, value: string, unit: string, at = period) => ({ metric, value, unit, period: at, evidence_id: sourceId });
  const calculations: FinancialCalculationResult[] = [];
  calculations.push(await call("calculate_financial_metrics", { operation: "yoy", current: operand("营业收入", t2 ? "132" : "120", "万元"), prior: operand("营业收入", t2 ? "110" : "100", "万元", t2 ? "2024Q2" : "2024Q1") }) as FinancialCalculationResult);
  calculations.push(await call("calculate_financial_metrics", { operation: "pct_points", current: operand("毛利率", t2 ? "24" : "22", "%"), prior: operand("毛利率", t2 ? "22" : "20", "%", t2 ? "2025Q1" : "2024Q1") }) as FinancialCalculationResult);
  calculations.push(await call("calculate_financial_metrics", { operation: "ratio", numerator: operand("经营现金流", t2 ? "12" : "6", "万元"), denominator: operand("净利润", t2 ? "12" : "10", "万元") }) as FinancialCalculationResult);
  if (calculations.some((c) => c.status !== "ok")) throw new Error("示例计算未完成，请检查演示数据与计算工具接口");
  const kindOf = (title: string) => title.includes("收入") ? 0 : title.includes("毛利率") ? 1 : 2;
  const deltas: ThesisDelta[] = project.theses.map((thesis) => {
    const kind = kindOf(thesis.title);
    const calc = calculations[kind];
    const correction = thesis.user_revision?.trim();
    const reason = kind === 0 ? "收入同比增长20%，超过15%的验证门槛，收入恢复观点得到支持。"
      : kind === 1 ? t2 ? "毛利率继续提升2个百分点。材料说明主要来自测试成本下降，原先的提价解释需要修正。" : "毛利率提升2个百分点，改善得到验证；提价是否为原因仍缺少证据。"
      : t2 ? "现金利润比从上轮0.60倍恢复至1.00倍，客户回款使现金流匹配度改善。" : "现金利润比只有0.60倍，未达到0.90倍门槛，现金流质量观点被削弱。";
    return { thesis_id: thesis.id, title: thesis.title, previous_status: thesis.current_status,
      new_status: kind === 2 && !t2 ? "削弱" : "支持", round_assessment: kind === 2 && !t2 ? "weakened" : "supported",
      current_view: kind === 1 && t2 ? "毛利率改善成立；当前证据指向测试成本下降，而非提价。" : thesis.current_view || thesis.original_view,
      reason, gap_explanation: { observed: calc.explanation,
        disclosed_reason: kind === 1 ? t2 ? "公司披露：产品售价基本未变，测试成本下降是本季度毛利率改善的主要原因。" : "公司称高端产品占比提升，但尚未定量解释毛利率变化。" : kind === 2 ? t2 ? "前期客户货款已回收。" : "部分客户货款尚未收到。" : "收入增长的持续性仍需后续订单验证。",
        unverified_hypotheses: kind === 1 ? "产品结构的具体贡献，以及降本是否可持续。" : "改善能否持续到下一季度。" },
      evidence_ids: [sourceId], next_steps: correction ? `沿用你的研究修正：${correction}` : "下一轮检查变化的持续性和对应来源。" };
  });
  const rawClaims = project.theses.map((thesis) => {
    const kind = kindOf(thesis.title); const calc = calculations[kind];
    return { id: randomUUID(), thesis_id: thesis.id, kind: "calculated", claim_text: kind === 0 ? "营业收入同比增长20%" : kind === 1 ? "毛利率提升2个百分点" : `现金利润比${t2 ? "1.00" : "0.60"}倍`, evidence_ids: [sourceId], calculation_id: calc.calculation_id };
  });
  const claims = validateResearchClaims(rawClaims, context, calculations).claims;
  const questions = project.open_questions.map((q) => ({ ...q, status: t2 && q.question_text.includes("现金") ? "已解决" as const : "部分解决" as const,
    answer_notes: q.question_text.includes("现金") ? t2 ? "本轮现金利润比1.00倍，前期货款已回收；后续继续观察。" : "本轮现金利润比0.60倍，回款仍落后。" : t2 ? "材料支持测试成本下降这一解释；产品结构贡献仍需拆分。" : "毛利率改善已确认，提价/结构/成本贡献仍待核查。",
    resolved_in_version: t2 && q.question_text.includes("现金") ? version : null, evidence_ids: [sourceId], updated_at: new Date().toISOString() }));
  const priorCorrections = memory.theses.filter((t) => t.user_revision).map((t) => `${t.title}：${t.user_revision}`).join("；");
  return { draft_id: randomUUID(), project_id: project.id, parent_version: project.current_version, state_token: researchStateToken(project), version,
    material_title: material.title, material, deltas, questions_update: questions, claims, tool_trace: traces,
    overall_summary: (t2 ? "收入增长持续，毛利率改善原因由待证实的提价转向有材料支持的降本，现金回款改善。" : "收入和毛利率改善得到支持，但现金回款落后；毛利率改善原因仍需研究。") + (priorCorrections ? ` 本轮继承用户修正：${priorCorrections}` : ""),
    analysis_meta: { model_name: "预设演示剧本 + 真实工具计算", llm_calls: 0, latency_ms: Date.now() - started, retry_count: 0, execution_mode: "replay_stub" } };
}
