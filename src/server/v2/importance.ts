import type { AnalysisRecord, ResearchEvent, UserStanceVersion, V2Importance } from "../../shared/v2Domain";

export function judgeImportance(input: {
  event: ResearchEvent;
  stance: UserStanceVersion | null;
  novelty: boolean;
}): { importance: V2Importance; reason: string; supports: AnalysisRecord["supportsStance"] } {
  if (input.event.verification !== "VERIFIED") {
    return { importance: "LOW", reason: "未核实线索不得作为重要变化提醒", supports: "UNKNOWN" };
  }
  const text = `${input.event.description} ${input.event.proposition}`;
  const stanceText = `${input.stance?.summary || ""} ${input.stance?.reasons.join(" ") || ""}`;
  const magnitude = /回购|减持|立案|退市|亏损|暴增|腰斩|中标|重大合同|商誉减值/.test(text);
  const related = stanceText && stanceText.split("").some((ch) => ch.trim() && text.includes(ch) && /[\u4e00-\u9fff]/.test(ch))
    ? input.stance?.reasons.some((reason) => reason && text.includes(reason.slice(0, 4)))
    : false;
  const challenges = Boolean(input.stance && /不及|下降|亏损|风险|推迟|取消/.test(text));
  const supports = Boolean(input.stance && /增长|超预期|中标|回购|改善/.test(text));
  if (magnitude && input.novelty) {
    return {
      importance: "HIGH",
      reason: "已核实事实对投资理由可能产生较大、较新的影响",
      supports: challenges ? "CHALLENGES" : supports ? "SUPPORTS" : "NEUTRAL",
    };
  }
  if (related && input.novelty) {
    return {
      importance: "MEDIUM",
      reason: "已核实事实与当前用户理由相关，但幅度有限",
      supports: challenges ? "CHALLENGES" : supports ? "SUPPORTS" : "NEUTRAL",
    };
  }
  return {
    importance: "LOW",
    reason: "已核实但新颖程度或对投资理由影响不足，进入日常摘要",
    supports: "NEUTRAL",
  };
}
