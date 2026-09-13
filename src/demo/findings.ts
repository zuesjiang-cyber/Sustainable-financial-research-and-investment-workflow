import type { EvidenceNature, Fact, Inference, RoundFindings } from "./types";
import { NATURE } from "./meta";

/**
 * Facts and inferences for every thesis × round.
 *
 * TWO DISCIPLINES govern this file, and they are the product.
 *
 * 1. A fact is binary. It holds or it does not, and a FAILS always carries a
 *    reason. Note what is NOT here: when the comparability gate refuses to
 *    compute a growth rate, there is no fact saying "增速 ≥ 15% 不成立" — that
 *    would be a verdict the system cannot reach. Instead the binary fact is
 *    about the evidence: "披露了计算同比所需的上年同期可比数 → 不成立". The
 *    metric question simply has no fact this round. Absence of a fact and a
 *    failing fact are different statements, and confusing them is how a system
 *    starts lying.
 *
 * 2. An inference carries 依据 / 局限 / 缺口 or it is not written. T0 has no
 *    inferences at all, because there are no financial facts yet to reason
 *    from — restraint that costs nothing to implement and everything to fake.
 */

const REPORT = "圣邦股份_深度研究_20250615.pdf";
const Q3 = "圣邦股份_2025年第三季度报告.pdf";
const FY = "圣邦股份_2025年年度报告.pdf";

export const FINDINGS: Record<string, RoundFindings> = {
  /* ═══════════════ 论述 1 · 产品结构升级驱动盈利修复 ═══════════════ */

  "ths-8f21c4a0@T0": {
    facts: [
      {
        statement: "研报原文包含「高附加值料号占比提升推动产品结构升级」的因果表述",
        verdict: "HOLDS",
        kind: "DISCLOSURE",
        nature: "THIRD_PARTY",
        source: { fileName: REPORT, page: 6, locator: "核心观点 · 盈利预测段第 2 句" },
      },
      {
        statement: "存在可用于核验该观点的定期报告财务数据",
        verdict: "FAILS",
        kind: "EVIDENCE_EXISTS",
        nature: "THIRD_PARTY",
        source: null,
        failReason: "本轮只有研报，尚无任何定期报告。",
      },
    ],
    // No facts about the company yet, so no inference is drawn. Emitting one
    // here would be exactly the confabulation this product exists to prevent.
    inferences: [],
  },

  "ths-8f21c4a0@T1": {
    facts: [
      {
        statement: "2025 年初至今综合毛利率 ≥ 51.0%",
        verdict: "HOLDS",
        kind: "NUMERIC",
        nature: "UNAUDITED_ACTUAL",
        source: { fileName: Q3, page: 12, locator: "合并利润表 · 营业收入与营业成本行" },
        argumentId: "arg-a1-1",
      },
      {
        statement: "2025 年度核验窗口已到期",
        verdict: "FAILS",
        kind: "EVIDENCE_EXISTS",
        nature: "UNAUDITED_ACTUAL",
        source: null,
        failReason: "三季报覆盖年初至九月末，年度窗口仍在进行中。",
      },
      {
        statement: "三季报披露了分产品或分应用的毛利率",
        verdict: "FAILS",
        kind: "DISCLOSURE",
        nature: "UNAUDITED_ACTUAL",
        source: null,
        failReason: "三季报不含分部信息附注。",
      },
      {
        statement: "存在可独立验证「结构升级驱动毛利率」的证据",
        verdict: "FAILS",
        kind: "EVIDENCE_EXISTS",
        nature: "UNAUDITED_ACTUAL",
        source: null,
        failReason: "既无分部毛利率，也无量价拆分。",
      },
    ],
    inferences: [
      {
        text: "年初至今毛利率过线，可能来自成本端价格回落，也可能来自产品结构升级，三季报无法分辨。",
        basis: "年初至今毛利率 51.06%，高于门槛 0.06 个百分点；同期无分部披露。",
        limitation: "两种解释都与现有数据一致，三季报不提供区分它们所需的口径。",
        gap: "年报的分部信息附注（分产品或分应用的两期毛利率）。",
        strength: "TENTATIVE",
      },
    ],
  },

  "ths-8f21c4a0@T2": {
    facts: [
      {
        statement: "2025 年度合并综合毛利率 ≥ 51.0%",
        verdict: "HOLDS",
        kind: "NUMERIC",
        nature: "AUDITED",
        source: { fileName: FY, page: 85, locator: "合并利润表 · 营业收入与营业成本行 · 本期发生额列" },
        argumentId: "arg-a1-1",
      },
      {
        statement: "2025 年度核验窗口已到期",
        verdict: "HOLDS",
        kind: "EVIDENCE_EXISTS",
        nature: "AUDITED",
        source: null,
      },
      {
        statement: "年报披露了按应用领域的收入结构",
        verdict: "HOLDS",
        kind: "DISCLOSURE",
        nature: "NARRATIVE",
        source: { fileName: FY, page: 21, locator: "管理层讨论与分析 · 营业收入构成" },
      },
      {
        statement: "年报披露了分产品毛利率",
        verdict: "FAILS",
        kind: "DISCLOSURE",
        nature: "AUDITED",
        source: null,
        failReason: "年报仅披露分应用领域的收入结构，未披露对应的毛利率。",
      },
      {
        statement: "存在可独立验证「结构升级驱动毛利率」的证据",
        verdict: "FAILS",
        kind: "EVIDENCE_EXISTS",
        nature: "AUDITED",
        source: { fileName: FY, page: 19, locator: "管理层讨论与分析 · 经营情况说明" },
        failReason: "唯一依据是管理层归因。归因方即被评价方，不构成独立证据。",
      },
    ],
    inferences: [
      {
        text: "毛利率的韧性可能部分来自成本端价格回落，而非产品结构升级。",
        basis: "营业成本同比 +12.94%，低于营业收入同比 +16.46%，方向与毛利率维持韧性一致。",
        limitation: "年报未做量价拆分，这一解释既不能确认也不能排除；它与管理层归因同时成立。",
        gap: "分产品或分应用的两期毛利率；上游晶圆与封测价格的成本占比拆分。",
        strength: "MODERATE",
      },
      {
        text: "年报披露的应用领域结构变化，方向上与研报所指的高端化一致。",
        basis: "年报第 21 页披露汽车电子与工业控制占比提升。",
        limitation: "「高端产品」不是年报使用的口径，两者非一一映射；且披露为定性表述，幅度不可核验。",
        gap: "「高端产品」的可量化定义与占比数值。",
        strength: "TENTATIVE",
      },
    ],
  },

  /* ═══════════════ 论述 2 · 现金流与盈利匹配 ═══════════════ */

  "ths-3b90d7e2@T0": {
    facts: [
      {
        statement: "研报原文包含「经营活动现金流与盈利保持合理匹配」的表述",
        verdict: "HOLDS",
        kind: "DISCLOSURE",
        nature: "THIRD_PARTY",
        source: { fileName: REPORT, page: 11, locator: "财务分析 · 现金流质量段" },
      },
      {
        statement: "存在可用于核验该观点的定期报告财务数据",
        verdict: "FAILS",
        kind: "EVIDENCE_EXISTS",
        nature: "THIRD_PARTY",
        source: null,
        failReason: "本轮只有研报，尚无任何定期报告。",
      },
    ],
    inferences: [],
  },

  "ths-3b90d7e2@T1": {
    facts: [
      {
        statement: "2025 年初至今现金利润比 ≥ 0.90",
        verdict: "FAILS",
        kind: "NUMERIC",
        nature: "UNAUDITED_ACTUAL",
        source: { fileName: Q3, page: 16, locator: "合并现金流量表 · 经营活动产生的现金流量净额行" },
        argumentId: "arg-a2-1",
        failReason: "实测 0.83 倍，低于门槛 0.07 倍。同主体、同口径、相应期限内构成直接反证。",
      },
      {
        statement: "三季报披露了现金流缺口的成因",
        verdict: "FAILS",
        kind: "DISCLOSURE",
        nature: "UNAUDITED_ACTUAL",
        source: null,
        failReason: "三季报正文与附注均未说明。",
      },
    ],
    inferences: [
      {
        text: "现金利润比低于门槛，可能反映回款周期拉长，也可能反映存货备货增加。",
        basis: "年初至今现金利润比 0.83 倍，低于 0.90 门槛。",
        limitation: "三季报未披露成因，两种解释都无法排除；本期为季节性较强的三季度末，单期偏离需与全年对照。",
        gap: "应收账款账龄与存货构成附注。",
        strength: "TENTATIVE",
      },
    ],
  },

  "ths-3b90d7e2@T2": {
    facts: [
      {
        statement: "2025 年度现金利润比 ≥ 0.90",
        verdict: "FAILS",
        kind: "NUMERIC",
        nature: "AUDITED",
        source: { fileName: FY, page: 89, locator: "合并现金流量表 · 经营活动产生的现金流量净额行 · 本期发生额列" },
        argumentId: "arg-a2-1",
        failReason: "全年实测 0.85 倍，低于门槛 0.05 倍。经审计年度数，反证成立。",
      },
      {
        statement: "全年现金利润比较上期改善",
        verdict: "HOLDS",
        kind: "NUMERIC",
        nature: "AUDITED",
        source: { fileName: FY, page: 89, locator: "合并现金流量表 · 本期与上期发生额列" },
        argumentId: "arg-a2-1",
      },
      {
        statement: "年报披露了现金流缺口的成因",
        verdict: "FAILS",
        kind: "DISCLOSURE",
        nature: "AUDITED",
        source: null,
        failReason: "年报未对现金利润比低于净利润作出说明。",
      },
    ],
    inferences: [
      {
        text: "连续两期低于门槛，可能反映回款周期的结构性拉长，而非单季波动。",
        basis: "0.83 倍（年初至今）→ 0.85 倍（全年），两期同口径实际数，均低于 0.90。",
        limitation: "改善幅度有限且仍未达标；缺应收账款账龄与存货构成，无法定位缺口来源。",
        gap: "应收账款账龄表、存货构成附注、以及主要客户的信用期变化。",
        strength: "MODERATE",
      },
    ],
  },

  /* ═══════════════ 论述 3 · 研发投入强度 ═══════════════ */

  "ths-6d47f1b8@T0": {
    facts: [
      {
        statement: "研报原文包含「维持高强度研发投入，研发壁垒构成中长期护城河」的表述",
        verdict: "HOLDS",
        kind: "DISCLOSURE",
        nature: "THIRD_PARTY",
        source: { fileName: REPORT, page: 14, locator: "投资要点 · 研发壁垒段" },
      },
      {
        statement: "存在可用于核验该观点的定期报告财务数据",
        verdict: "FAILS",
        kind: "EVIDENCE_EXISTS",
        nature: "THIRD_PARTY",
        source: null,
        failReason: "本轮只有研报，尚无任何定期报告。",
      },
    ],
    inferences: [],
  },

  "ths-6d47f1b8@T1": {
    facts: [
      {
        statement: "2025 年初至今研发费用率处于 25%–28% 区间",
        verdict: "HOLDS",
        kind: "NUMERIC",
        nature: "UNAUDITED_ACTUAL",
        source: { fileName: Q3, page: 12, locator: "合并利润表 · 研发费用行与营业收入行" },
        argumentId: "arg-a3-1",
      },
      {
        statement: "2025 年度核验窗口已到期",
        verdict: "FAILS",
        kind: "EVIDENCE_EXISTS",
        nature: "UNAUDITED_ACTUAL",
        source: null,
        failReason: "年度窗口仍在进行中。",
      },
      /* The refusal to compute shows up here, as a binary fact about the
         evidence — NOT as a verdict on the growth rate, which the system
         cannot reach this round. */
      {
        statement: "三季报披露了计算研发费用同比所需的上年同期可比数",
        verdict: "FAILS",
        kind: "EVIDENCE_EXISTS",
        nature: "UNAUDITED_ACTUAL",
        source: { fileName: Q3, page: 12, locator: "合并利润表 · 研发费用行（无上期比较列）" },
        argumentId: "arg-a3-2",
        failReason: "缺少上年同期操作数，口径门禁的期间一致项不通过，系统拒绝计算同比增速。",
      },
    ],
    inferences: [
      {
        text: "年初至今研发费用率落在目标区间，节奏上与全年达标一致。",
        basis: "年初至今研发费用率 26.81%，处于 25%–28% 区间。",
        limitation: "年度窗口未到期，四季度费用确认节奏可能改变全年水平；这是阶段信号，不是全年结论。",
        gap: "年报的全年研发费用与营业收入。",
        strength: "TENTATIVE",
      },
    ],
  },

  "ths-6d47f1b8@T2": {
    facts: [
      {
        statement: "2025 年度研发费用率处于 25%–28% 区间",
        verdict: "HOLDS",
        kind: "NUMERIC",
        nature: "AUDITED",
        source: { fileName: FY, page: 85, locator: "合并利润表 · 研发费用行 · 本期发生额列" },
        argumentId: "arg-a3-1",
      },
      {
        statement: "研发费用同比增速 ≥ 15%",
        verdict: "HOLDS",
        kind: "NUMERIC",
        nature: "AUDITED",
        source: { fileName: FY, page: 85, locator: "合并利润表 · 研发费用行 · 本期与上期发生额列" },
        argumentId: "arg-a3-2",
      },
      {
        statement: "年报披露了计算研发费用同比所需的上年同期可比数",
        verdict: "HOLDS",
        kind: "EVIDENCE_EXISTS",
        nature: "AUDITED",
        source: { fileName: FY, page: 85, locator: "合并利润表 · 研发费用行 · 上期发生额列" },
        argumentId: "arg-a3-2",
      },
      {
        statement: "2025 年度核验窗口已到期",
        verdict: "HOLDS",
        kind: "EVIDENCE_EXISTS",
        nature: "AUDITED",
        source: null,
      },
    ],
    inferences: [
      {
        text: "研发费用增速高于营业收入增速，投入强度可能在提升。",
        basis: "研发费用同比 +20.03%，营业收入同比 +16.46%，两者均取自同一份年报的比较列。",
        limitation: "年报未披露研发支出资本化政策是否发生变化，无法排除口径变动对增速的贡献。",
        gap: "研发投入的资本化与费用化拆分，及资本化率的两期对比。",
        strength: "MODERATE",
      },
      {
        text: "本论述只覆盖投入强度，不覆盖研发转化效率。",
        basis: "研报原文的核验门槛为费用率区间与费用增速，未涉及新品收入贡献。",
        limitation: "转化效率未被提出，因此不被默认成立，也不被默认否定。",
        gap: "若需跟踪，应在下一期单独建立一条观点并设定其门槛。",
        strength: "MODERATE",
      },
    ],
  },
};

export function findingsKey(thesisId: string, version: string): string {
  return `${thesisId}@${version}`;
}

/**
 * Restraint check used by both the UI and the tests: an inference without a
 * basis, a limitation or a gap is not an inference this product is willing to
 * make.
 */
export function inferenceIsWellFormed(i: Inference): boolean {
  return i.basis.trim().length > 0 && i.limitation.trim().length > 0 && i.gap.trim().length > 0;
}

/** Language a restrained inference must not use, because it asserts proof. */
export const OVERCLAIMING_PHRASES = [
  "充分验证",
  "得到验证",
  "显著增强",
  "逻辑得到确认",
  "已被证明",
  "完全符合",
  "确认无疑",
];

/* ------------------------------------------------------------------ */
/* The evidence-nature cap — enforced here, not trusted in the data     */
/* ------------------------------------------------------------------ */

/**
 * Which fact kinds are measurements *of the company*, and therefore subject to
 * the evidence-nature cap.
 *
 * A NUMERIC fact asserts something about the company's economics, so only an
 * audited figure or an actual unaudited figure can make it hold. A forecast or
 * an express report points at a number; it does not settle one. A third-party
 * document is not a source of facts about the company at all.
 *
 * DISCLOSURE and EVIDENCE_EXISTS facts are statements about a document —
 * 「年报披露了按应用领域的收入结构」— and those stay binary whatever the
 * document's nature, because the claim is about the page in front of us, not
 * about the company's economics. This distinction is what lets a research report
 * still yield the honest fact that it *said* something, without that sentence
 * ever becoming evidence about the business.
 */
const NATURE_CAPPED_KINDS = new Set<Fact["kind"]>(["NUMERIC"]);

export function natureCapsFact(fact: Fact): boolean {
  if (!NATURE_CAPPED_KINDS.has(fact.kind)) return false;
  return !NATURE[fact.nature]?.canSettleNumericFact;
}

/**
 * Build the inference a demoted fact becomes.
 *
 * The wording is generated rather than authored so the cap cannot be softened by
 * a nicer sentence: whatever the fact claimed, the demotion says the same thing
 * about where it came from, states plainly that this nature cannot settle a
 * measurement, and names the disclosure that would.
 */
function demoteToInference(fact: Fact): Inference {
  const nature = NATURE[fact.nature];
  const where = fact.source ? `${fact.source.fileName} 第 ${fact.source.page} 页` : "本轮资料包";
  return {
    text: fact.statement,
    basis: `${nature?.label ?? fact.nature}（${where}）指向该数值，但未经审计确认。`,
    limitation: `${nature?.label ?? fact.nature}不能作为事实成立的依据：它指向一个数，并没有确认一个数。因此本条是判断，不是核验结果。`,
    gap: "需等待经审计的正式披露，按同一口径重新计算后方可作为事实判定。",
    strength: "TENTATIVE",
    natureCaveat: `证据性质为${nature?.label ?? fact.nature}，数值类事实的判定上限是「不产出事实」，已降级为推论。`,
  };
}

/**
 * Partition a round into what may be shown as fact and what must be demoted.
 *
 * The review surface renders the output of this function and never the raw
 * round, so the cap holds no matter which fixture is loaded — the data cannot
 * grant itself a verdict. This is the concrete form of 「AI 驱动判断，代码守住
 * 事实」: the model proposes, and this is where the proposal is refused.
 */
export function partitionFindings(round: RoundFindings): {
  facts: Fact[];
  inferences: Inference[];
  demoted: Array<{ fact: Fact; inference: Inference }>;
  notTouched?: string;
} {
  const facts: Fact[] = [];
  const demoted: Array<{ fact: Fact; inference: Inference }> = [];

  for (const fact of round.facts) {
    if (natureCapsFact(fact)) {
      demoted.push({ fact, inference: demoteToInference(fact) });
    } else {
      facts.push(fact);
    }
  }

  return {
    facts,
    /* Demotions are appended after the authored inferences and marked
       TENTATIVE, so a cap never disguises itself as the model's own reading. */
    inferences: [...round.inferences, ...demoted.map((d) => d.inference)],
    demoted,
    notTouched: round.notTouched,
  };
}
