import type { ThesisBrief } from "./types";

/**
 * Card copy for the research desk.
 *
 * A thesis card is four lines: what changed, the verdict, what to watch next,
 * and — only when the honest status is lower than the headline number suggests
 * — a door into why. Everything else is reachable by expanding.
 *
 * FIGURE PLACEHOLDERS
 *   Verdict prose must never restate a number by hand, or the card will drift
 *   from the calculation it is describing. Instead the copy references the
 *   argument that produced it:
 *
 *     ⟦ARG:arg-a1-1⟧  → that argument's Decimal resultDisplay, clickable
 *     ⟦GAP:arg-a1-1⟧  → its gap against the threshold
 *
 *   `renderVerdict` resolves these against the verification data at render
 *   time, so the figure on the card is always the figure the code computed, and
 *   clicking it always opens the chain that produced it.
 */

export const FIGURE_TOKEN = /⟦(ARG|GAP):([a-z0-9-]+)⟧/gi;

type BriefKey = string; // `${thesisId}@${version}`

export const BRIEFS: Record<BriefKey, ThesisBrief> = {
  /* ══════════════ 论述 1 · 产品结构升级驱动盈利修复 ══════════════ */

  "ths-8f21c4a0@T0": {
    keyFact: "尚无定期报告，无可核验数字。",
    keyFactSource: null,
    gap: null,
    assessment: "跟踪基线已建立：把这句话拆成毛利率数值、产品结构变化幅度、以及两者之间的因果，三条各自独立核验。",
    nextStep: "首个可比定期报告的合并利润表（营业收入与营业成本）。",
    change: "新建基线",
  },

  "ths-8f21c4a0@T1": {
    keyFact: "⟦ARG:arg-a1-1⟧ 已过门槛",
    keyFactSource: { fileName: "圣邦股份_2025年第三季度报告.pdf", page: 12 },
    gap: "⟦GAP:arg-a1-1⟧（年初至今口径）",
    assessment:
      "年初至今毛利率已过线，但年度窗口尚未到期；且这是成本端红利还是结构升级，三季报分辨不出来。",
    nextStep: "年报是否单列高端产品（车规 / 高精度信号链）收入占比。",
    change: "待跟踪 → 部分支持",
  },

  "ths-8f21c4a0@T2": {
    keyFact: "全年毛利率 ⟦ARG:arg-a1-1⟧ 达标",
    keyFactSource: { fileName: "圣邦股份_2025年年度报告.pdf", page: 85 },
    gap: "⟦GAP:arg-a1-1⟧，高于门槛",
    assessment:
      "数值部分已获强支撑；但「产品结构升级驱动」只有管理层归因，缺分产品毛利率，因果不予采纳。",
    nextStep: "2026 半年报的分产品毛利率，用于独立验证结构升级假设。",
    change: "数值论据转为已验证，论述仍停在部分支持",
  },

  /* ══════════════ 论述 2 · 现金流与盈利匹配 ══════════════ */

  "ths-3b90d7e2@T0": {
    keyFact: "尚无定期报告，无可核验数字。",
    keyFactSource: null,
    gap: null,
    assessment: "跟踪基线已建立：核验门槛为现金利润比（经营现金流净额 / 归母净利润）≥ 0.90。",
    nextStep: "首个定期报告的合并现金流量表与利润表。",
    change: "新建基线",
  },

  "ths-3b90d7e2@T1": {
    keyFact: "现金利润比 ⟦ARG:arg-a2-1⟧",
    keyFactSource: { fileName: "圣邦股份_2025年第三季度报告.pdf", page: 16 },
    gap: "⟦GAP:arg-a2-1⟧",
    assessment: "首次跌破 0.90 门槛，同主体同口径构成直接反证；三季报未说明原因。",
    nextStep: "下滑是应收账款占用还是存货备货所致。",
    change: "待跟踪 → 被削弱",
  },

  "ths-3b90d7e2@T2": {
    keyFact: "全年现金利润比 ⟦ARG:arg-a2-1⟧",
    keyFactSource: { fileName: "圣邦股份_2025年年度报告.pdf", page: 89 },
    gap: "⟦GAP:arg-a2-1⟧",
    assessment: "较三季度的 0.83 略回升，但仍低于门槛，削弱结论维持；年报同样未披露归因。",
    nextStep: "应收账款与存货的明细附注，定位现金流缺口的来源。",
    change: "0.83 → 0.85，状态未变",
  },

  /* ══════════════ 论述 3 · 研发投入强度 ══════════════ */

  "ths-6d47f1b8@T0": {
    keyFact: "尚无定期报告，无可核验数字。",
    keyFactSource: null,
    gap: null,
    assessment: "跟踪基线已建立：拆为研发费用率区间与研发费用同比增速两条数值论据。",
    nextStep: "研发费用及其上年同期可比数。",
    change: "新建基线",
  },

  "ths-6d47f1b8@T1": {
    keyFact: "研发费用率 ⟦ARG:arg-a3-1⟧ 落在区间内；同比增速 ⟦ARG:arg-a3-2⟧",
    keyFactSource: { fileName: "圣邦股份_2025年第三季度报告.pdf", page: 12 },
    gap: "费用率距下界 +1.81pp；增速因缺上年同期可比数被拒绝计算",
    assessment:
      "费用率在区间内但年度未到期；增速这条系统选择拒绝计算，而不是用本期数除以任意基数造一个看似合理的数。",
    nextStep: "年报中的上期比较列，补齐同比操作数。",
    change: "待跟踪 → 部分支持",
  },

  "ths-6d47f1b8@T2": {
    keyFact: "研发费用率 ⟦ARG:arg-a3-1⟧，同比 ⟦ARG:arg-a3-2⟧",
    keyFactSource: { fileName: "圣邦股份_2025年年度报告.pdf", page: 85 },
    gap: "⟦GAP:arg-a3-2⟧",
    assessment: "两条数值论据均获强支撑且期间已到期，判定为已验证。",
    nextStep: "研发转化效率（新品收入贡献）研报未提，下一期单独建一条论述。",
    change: "部分支持 → 已验证",
  },
};

export function briefKey(thesisId: string, version: string): BriefKey {
  return `${thesisId}@${version}`;
}

/** Fallback so a missing brief degrades to the roll-up sentence, never to a crash. */
export const FALLBACK_BRIEF: ThesisBrief = {
  keyFact: "本轮无新增事实。",
  keyFactSource: null,
  gap: null,
  assessment: "",
  nextStep: "",
  change: null,
  noNewEvidence: true,
};
