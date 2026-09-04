export type DemoResearchStatus =
  | "SUPPORTED"
  | "PARTIALLY_SUPPORTED"
  | "WEAKENED"
  | "UNRESOLVED";

export interface DemoResearchItem {
  id: string;
  title: string;
  status: DemoResearchStatus;
  maturity: string;
  verdict: string;
  originalView: string;
  latestFact: string;
  gap: string;
  reason: string;
  nextQuestion: string;
  evidence: string;
}

/**
 * A deliberately static, read-only result for the homepage walkthrough.
 * It is not passed to the API and never becomes a real project or run.
 */
export const DEMO_RESEARCH = {
  company: "圣邦股份",
  ticker: "300661.SZ",
  period: "FY2024 → FY2025",
  memoryVersion: "Research Memory · Demo v2",
  roundSummary: {
    headline: "增长逻辑得到验证，现金流质量成为新的核心矛盾。",
    detail: "收入与研发投入符合原预期，毛利率仅略低于稳定区间；经营现金流同比下滑，需要下调对盈利兑现质量的信心。",
    nextFocus: "下一期优先拆解应收账款、存货周转与汽车电子收入贡献。",
  },
  items: [
    {
      id: "demo-revenue",
      title: "主营业务收入恢复增长",
      status: "SUPPORTED" as const,
      maturity: "已验证",
      verdict: "收入增速越过验证门槛，原判断成立。",
      originalView: "行业去库存周期结束，收入重回两位数增长轨道。",
      latestFact: "FY2025 营业收入 38.98 亿元，同比增长 16.46%。",
      gap: "目标 ≥ 15%；实际 16.46%，高于门槛 1.46 个百分点。",
      reason: "收入增速重新回到目标区间，披露口径与原判断一致。",
      nextQuestion: "汽车电子与泛工业订单能否将增长延续到下一期？",
      evidence: "2025 年报 · 第 13 页",
    },
    {
      id: "demo-margin",
      title: "综合毛利率保持稳态韧性",
      status: "PARTIALLY_SUPPORTED" as const,
      maturity: "进展中",
      verdict: "方向基本成立，但毛利率略低于预设边界。",
      originalView: "高附加值料号占比提升，毛利率波动保持平稳。",
      latestFact: "FY2025 综合毛利率约 50.94%，同比下降 0.52 个百分点。",
      gap: "稳定区间 ±0.50 个百分点；实际下降 0.52 个百分点，略超边界。",
      reason: "晶圆、封测成本与产品结构变化带来轻微压力，尚未形成趋势性破坏。",
      nextQuestion: "下一期高毛利产品占比与代工成本是否同步改善？",
      evidence: "2025 年报 · 第 85 页",
    },
    {
      id: "demo-cashflow",
      title: "经营现金流与盈利匹配度稳健",
      status: "WEAKENED" as const,
      maturity: "被削弱",
      verdict: "现金流明显偏离预期，需要下调观点信心。",
      originalView: "销售回款良好，经营现金流与净利润保持合理匹配。",
      latestFact: "FY2025 经营现金流 4.66 亿元，同比下降 15.11%。",
      gap: "目标为现金流不下滑；实际较 FY2024 减少约 0.83 亿元。",
      reason: "利润增长没有同步转化为现金，营运资本占用需要进一步拆解。",
      nextQuestion: "应收账款账龄与存货周转是否解释现金流回落？",
      evidence: "2025 年报 · 第 89 页",
    },
    {
      id: "demo-rd",
      title: "高强度研发投入驱动料号扩张",
      status: "SUPPORTED" as const,
      maturity: "已验证",
      verdict: "投入强度与绝对额双双达标，原判断成立。",
      originalView: "维持 25%–28% 的研发投入，推动高性能产品线扩张。",
      latestFact: "FY2025 研发费用 10.45 亿元，同比增长约 20.03%。",
      gap: "目标为费用率 25%–28% 且绝对额不下降；绝对额与投入强度均达标。",
      reason: "研发资源继续向高压、高精度与车规级产品倾斜。",
      nextQuestion: "新增料号能否在未来两期转化为收入和毛利？",
      evidence: "2025 年报 · 第 85 页",
    },
    {
      id: "demo-auto",
      title: "车规级产品进入放量验证期",
      status: "UNRESOLVED" as const,
      maturity: "待跟踪",
      verdict: "只验证了认证进度，尚未验证规模化收入。",
      originalView: "车规级模拟芯片将进入核心主机厂供应链并贡献增量。",
      latestFact: "披露多款 AEC-Q100 产品进入供应链验证流程，尚未披露量产规模。",
      gap: "原判断要求形成可观收入贡献；当前证据仍停留在验证阶段。",
      reason: "认证与导入是前置条件，订单、量产和单车价值量尚未被财报充分验证。",
      nextQuestion: "下一期是否出现车规客户、出货量或收入贡献的可核验披露？",
      evidence: "2025 年报 · 第 12 页",
    },
    {
      id: "demo-supply",
      title: "供应链双重货源降低交付风险",
      status: "UNRESOLVED" as const,
      maturity: "待跟踪",
      verdict: "披露了协同动作，但没有交付韧性的量化证据。",
      originalView: "定制工艺与双重货源将提升极端情景下的交付韧性。",
      latestFact: "公司披露深化核心代工协同，但未量化双重货源的产能覆盖率。",
      gap: "原判断关注极端扰动下的持续交付；当前缺少压力情景或产能数据。",
      reason: "战略动作已披露，实际韧性需要在订单、交期或供应扰动数据中验证。",
      nextQuestion: "下一期管理层是否披露关键工艺的备用产能与交付指标？",
      evidence: "2025 年报 · 第 11 页",
    },
  ] satisfies DemoResearchItem[],
} as const;

export const DEMO_STATUS_META: Record<
  DemoResearchStatus,
  { label: string; shortLabel: string; className: string; iconClassName: string }
> = {
  SUPPORTED: {
    label: "已验证",
    shortLabel: "SUPPORTED",
    className: "demo-status-supported",
    iconClassName: "text-emerald-600",
  },
  PARTIALLY_SUPPORTED: {
    label: "部分支持",
    shortLabel: "PARTIALLY_SUPPORTED",
    className: "demo-status-partial",
    iconClassName: "text-blue-600",
  },
  WEAKENED: {
    label: "被削弱",
    shortLabel: "WEAKENED",
    className: "demo-status-weakened",
    iconClassName: "text-rose-600",
  },
  UNRESOLVED: {
    label: "待跟踪",
    shortLabel: "UNRESOLVED",
    className: "demo-status-unresolved",
    iconClassName: "text-amber-600",
  },
};
