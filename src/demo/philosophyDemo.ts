import type { PhilosophyDemo } from "./types";

/**
 * STATIC DEMO FIXTURE — synthetic figures in the shape of a real A-share
 * analogue-semiconductor filing. Not a real disclosure, not real advice.
 *
 * The scenario is constructed so each pillar has a case that actually stresses
 * it, rather than a case where everything passes:
 *
 *   THESIS 1  毛利率达标 + 归因于产品结构升级
 *             → The numeric target IS met, and the thesis is still only
 *               PARTIALLY_SUPPORTED, because the causal argument is admitted
 *               only on management attribution. This is pillar 3's whole point.
 *   THESIS 2  盈利质量稳健（现金流与利润匹配）
 *             → WEAKENED. Profit grew while cash conversion fell below the
 *               threshold. Demonstrates that negative facts lower confidence.
 *   THESIS 3  研发投入构筑壁垒
 *             → SUPPORTED. Both channels agree with strong evidence, so the
 *               demo is not uniformly pessimistic.
 *
 * Version progression demonstrates pillar 1 and the maturity/interimSignal
 * separation: at T1 the annual window has NOT matured, so hitting the year-to-
 * date number yields PARTIALLY_SUPPORTED / IN_PROGRESS / ABOVE — never
 * "verified". At T2 the window closes and the status is allowed to firm up.
 */
export const PHILOSOPHY_DEMO: PhilosophyDemo = {
  meta: {
    company: "圣邦股份",
    securityCode: "300661",
    exchange: "SZSE",
    industry: "模拟集成电路设计（Fabless）",
    accountingStandard: "中国企业会计准则 CAS",
    defaultScope: "合并报表 CONSOLIDATED",
    isSynthetic: true,
    dataNote:
      "演示数据为合成样例，形态参照 A 股模拟芯片公司定期报告，非真实披露、不构成投资建议。真实管线（上传研报 → 提炼观点 → 财报核验）请切换到「真实研究管线」。",
  },

  pillars: [
    {
      id: "state",
      index: "01",
      title: "面向状态的投研管理",
      claim:
        "长期资产是一份可版本回溯的研究状态，而不是一段对话或一份新报告。论据拥有稳定身份，跨期演进而不漂移。",
      howItShows:
        "切换 T0 / T1 / T2，整个工作台（论据、双通道、聚合结论、未决问题）随状态重放；argumentId 三轮不变；T1 的用户修正在 T2 仍然生效。",
      antiPattern:
        "反例：每期财报重新生成一份互不相关的摘要，上一轮的判断与修正无处可寻。",
    },
    {
      id: "dual-channel",
      index: "02",
      title: "数字与语义双通道",
      claim:
        "数字走确定性代码，先过口径可比性门禁再用 Decimal 计算；语义走模型，先过引用门禁再判断关系。两条通道各自独立出具结论，然后合成。",
      howItShows:
        "每条论据并排展示两个通道：左列是公式、操作数、四项可比性检查与差额；右列是证据原文、页码、支持关系与归因分层。底部显示合成规则与两通道的张力。",
      antiPattern:
        "反例：把整页财报丢给模型，让它同时负责读数字、算比例、判因果，再输出一个 92% 置信度。",
    },
    {
      id: "arguments",
      index: "03",
      title: "论述拆到论据，只有强事实支撑的才作为论据",
      claim:
        "一条论述被拆成若干原子论据，各自独立核验。弱支撑的论据被记录、被展示，但不被采纳为论据、不参与聚合。论述状态只由被采纳的论据决定。",
      howItShows:
        "论据树标注 STRONG / WEAK / PENDING；聚合面板列出「已采纳 / 不予采纳（附理由）/ 仍待证据」，并给出规则推导出的论述状态，同时对照一句「摘要式 AI 会怎么说」。",
      antiPattern:
        "反例：毛利率达标，于是「产品结构升级驱动盈利修复」也被一并标记为已验证。",
    },
  ],

  /* ---------------------------------------------------------------- */
  /* Pillar 1 — the versioned state timeline                            */
  /* ---------------------------------------------------------------- */

  versions: [
    {
      version: "T0",
      label: "T0 · 研报基线",
      confirmedAt: "2025-06-15T09:20:00+08:00",
      asOf: "2025-06-15",
      trigger: "用户上传券商深度研报，确认要持续跟踪的论述与论据",
      documents: [
        {
          role: "THESIS_SOURCE",
          fileName: "圣邦股份_深度研究_20250615.pdf",
          publishedAt: "2025-06-15",
          period: "研报（非财务期间）",
          sha256Short: "2688dd70",
          pages: 32,
        },
      ],
      stateDelta: {
        headline: "建立跟踪基线：3 条论述、8 条原子论据，全部尚无财报证据。",
        changed: ["首次确立 thesisId 与 argumentId，此后跨轮不再变化"],
        unchanged: [],
        newlyUnresolved: [
          "A1-1 毛利率年度目标（等待定期报告）",
          "A1-2 产品结构变化幅度（等待分产品披露）",
          "A1-3 结构改善与毛利率的因果（等待可独立验证证据）",
        ],
      },
      corrections: [
        {
          type: "CRITERION",
          label: "核验门槛修正",
          before: "综合毛利率 ≥ 51.0%（系统从「保持稳态」建议，SYSTEM_PROPOSED）",
          after: "综合毛利率 ≥ 51.0%，且口径限定为合并报表年度值",
          reason: "研究员确认阈值，并显式限定口径，避免后续用单季或母公司数替代",
          carriedForward: true,
        },
      ],
      questions: [
        {
          text: "年报是否单独披露高端产品（车规 / 高精度信号链）收入占比？",
          status: "OPEN",
          createdIn: "T0",
        },
        {
          text: "经营现金流与归母净利润的匹配度能否维持在 0.9 以上？",
          status: "OPEN",
          createdIn: "T0",
        },
      ],
      modelCalls: {
        count: 1,
        inputTokens: 11840,
        outputTokens: 2260,
        note: "研报观点提炼一次调用；数字与口径由代码处理，不消耗模型预算。",
      },
    },

    {
      version: "T1",
      label: "T1 · 2025 三季报",
      confirmedAt: "2025-10-28T21:05:00+08:00",
      asOf: "2025-10-28",
      trigger: "用户上传 2025 年第三季度报告，核验同一组论据",
      documents: [
        {
          role: "THESIS_SOURCE",
          fileName: "圣邦股份_深度研究_20250615.pdf",
          publishedAt: "2025-06-15",
          period: "研报（非财务期间）",
          sha256Short: "2688dd70",
          pages: 32,
        },
        {
          role: "FINANCIAL_FILING",
          fileName: "圣邦股份_2025年第三季度报告.pdf",
          publishedAt: "2025-10-28",
          period: "2025-01-01 → 2025-09-30（YTD）",
          sha256Short: "9f3c1a7e",
          pages: 28,
        },
      ],
      stateDelta: {
        headline:
          "年度窗口尚未到期：毛利率年初至今已过门槛，但只能记为部分支持；现金利润比首次跌破阈值。",
        changed: [
          "A1-1 毛利率：UNRESOLVED → PARTIALLY_SUPPORTED（IN_PROGRESS，阶段信号 ABOVE）",
          "A2-1 现金利润比：UNRESOLVED → WEAKENED（0.83 < 0.90）",
          "A3-1 研发费用率：UNRESOLVED → PARTIALLY_SUPPORTED",
        ],
        unchanged: [
          "A1-2 产品结构变化幅度：年报未披露分产品数据，仍为 UNRESOLVED",
          "A1-3 结构改善与毛利率的因果：仍无可独立验证证据",
        ],
        newlyUnresolved: ["三季报未提供分产品收入与分产品毛利率，因果链无法推进"],
      },
      corrections: [
        {
          type: "USER_JUDGMENT",
          label: "研究员独立研判（论述 1）",
          before: "（未填写）",
          after: "年初至今毛利率已过线，但这是成本端红利还是结构升级，三季报分辨不出来。先不接受因果部分。",
          reason: "研究员拒绝把阶段性数值达标当作因果验证",
          carriedForward: true,
        },
      ],
      questions: [
        {
          text: "年报是否单独披露高端产品（车规 / 高精度信号链）收入占比？",
          status: "OPEN",
          createdIn: "T0",
        },
        {
          text: "经营现金流与归母净利润的匹配度能否维持在 0.9 以上？",
          status: "OPEN",
          createdIn: "T0",
        },
        {
          text: "现金利润比下滑是应收账款占用还是存货备货所致？",
          status: "OPEN",
          createdIn: "T1",
        },
      ],
      modelCalls: {
        count: 1,
        inputTokens: 16420,
        outputTokens: 3180,
        note: "全部论据合并为一次语义核验调用；财务数字与差额由 Decimal 计算，未交给模型。",
      },
    },

    {
      version: "T2",
      label: "T2 · 2025 年报",
      confirmedAt: "2026-04-21T22:40:00+08:00",
      asOf: "2026-04-21",
      trigger: "用户上传 2025 年年度报告，年度窗口到期，重新核验同一组论据",
      documents: [
        {
          role: "THESIS_SOURCE",
          fileName: "圣邦股份_深度研究_20250615.pdf",
          publishedAt: "2025-06-15",
          period: "研报（非财务期间）",
          sha256Short: "2688dd70",
          pages: 32,
        },
        {
          role: "FINANCIAL_FILING",
          fileName: "圣邦股份_2025年第三季度报告.pdf",
          publishedAt: "2025-10-28",
          period: "2025-01-01 → 2025-09-30（YTD）",
          sha256Short: "9f3c1a7e",
          pages: 28,
        },
        {
          role: "FINANCIAL_FILING",
          fileName: "圣邦股份_2025年年度报告.pdf",
          publishedAt: "2026-04-21",
          period: "2025-01-01 → 2025-12-31（YEAR）",
          sha256Short: "c41d8b02",
          pages: 168,
        },
      ],
      stateDelta: {
        headline:
          "年度窗口到期：毛利率论据转为强支撑；但因果论据仅获管理层归因，不予采纳，论述 1 停在部分支持。",
        changed: [
          "A1-1 毛利率：PARTIALLY_SUPPORTED → SUPPORTED（DUE，51.46% ≥ 51.0%，+0.46pp）",
          "A1-2 产品结构：UNRESOLVED → WEAK（年报披露应用领域结构，但未单列高端产品占比）",
          "A1-3 因果：UNRESOLVED → WEAK（取得管理层归因，非独立证据）",
          "论述 1：PARTIALLY_SUPPORTED（数值达标 ≠ 因果成立）",
          "A2-1 现金利润比：0.83 → 0.85，仍低于 0.90，论述 2 维持 WEAKENED",
          "A3-1 / A3-2：研发费用率与增速双双达标，论述 3 → SUPPORTED",
        ],
        unchanged: ["T1 的研究员研判原样保留，未被模型输出覆盖"],
        newlyUnresolved: ["分产品毛利率仍未披露，因果链第三期继续开放"],
      },
      corrections: [
        {
          type: "USER_JUDGMENT",
          label: "研究员独立研判（论述 1）· 自 T1 继承",
          before: "年初至今毛利率已过线，但这是成本端红利还是结构升级，三季报分辨不出来。先不接受因果部分。",
          after: "年报毛利率确认达标，数值部分我接受。管理层把原因归到产品结构，但没有分产品毛利率，我仍不接受因果部分——下一期继续要这个数。",
          reason: "研究员在 T2 更新研判，T1 的原话作为历史保留",
          carriedForward: true,
        },
        {
          type: "RESEARCH_PREFERENCE",
          label: "研究偏好",
          before: "（未设置）",
          after: "该项目优先跟踪分产品收入与分产品毛利率口径",
          reason: "连续两期缺失同一披露，沉淀为项目方法配置",
          carriedForward: true,
        },
      ],
      questions: [
        {
          text: "年报是否单独披露高端产品（车规 / 高精度信号链）收入占比？",
          status: "ANSWERED",
          answer:
            "部分回答：年报披露按应用领域的收入结构（第 21 页），但未单列「高端产品」口径，无法量化研报所指的占比提升幅度。问题转为 DEFERRED 而非关闭。",
          createdIn: "T0",
        },
        {
          text: "经营现金流与归母净利润的匹配度能否维持在 0.9 以上？",
          status: "ANSWERED",
          answer: "已回答：FY2025 现金利润比 0.85，低于 0.90 门槛，未维持。",
          createdIn: "T0",
        },
        {
          text: "现金利润比下滑是应收账款占用还是存货备货所致？",
          status: "OPEN",
          createdIn: "T1",
        },
        {
          text: "分产品毛利率能否在 2026 半年报中取得，用于独立验证结构升级假设？",
          status: "OPEN",
          createdIn: "T2",
        },
      ],
      modelCalls: {
        count: 2,
        inputTokens: 21760,
        outputTokens: 4120,
        note: "一次批量语义核验 + 一次因果论据的对抗性复核（检查是否把管理层观点当事实）。数字仍由代码计算。",
      },
    },
  ],

  /* ---------------------------------------------------------------- */
  /* Pillars 2 & 3 — theses, atomic arguments, dual channels            */
  /* ---------------------------------------------------------------- */

  theses: [
    /* ============================ 论述 1 ============================ */
    {
      thesisId: "ths-8f21c4a0",
      originalStatement:
        "高附加值料号占比提升推动产品结构升级，预计 2025 年综合毛利率保持稳态韧性，盈利能力显著修复。",
      originalSource: {
        fileName: "圣邦股份_深度研究_20250615.pdf",
        page: 6,
        locator: "核心观点 · 盈利预测段第 2 句",
      },
      currentStatement:
        "高附加值料号占比提升推动产品结构升级，2025 年综合毛利率保持稳态韧性（核验门槛：合并年度毛利率 ≥ 51.0%）。",
      revision: 2,
      priority: 1,

      claims: [
        /* ---------------------- A1-1 数值目标 ---------------------- */
        {
          argumentId: "arg-a1-1",
          kind: "NUMERIC_TARGET",
          kindLabel: "数值目标",
          statement: "2025 年度合并综合毛利率 ≥ 51.0%",
          verificationTarget:
            "以年报合并利润表的营业收入与营业成本重算毛利率，与门槛比较；期间基准为 YEAR，口径为 CONSOLIDATED。",
          criterionOrigin: "USER_CONFIRMED",
          versions: {
            T0: {
              status: "UNRESOLVED",
              maturity: "NOT_DUE",
              interimSignal: "UNKNOWN",
              supportLevel: "PENDING",
              gateReason: "尚无定期报告，没有任何可绑定单元格的事实，论据未成立。",
              activeChannels: [],
              changeNote: "首次在 T0 确立，argumentId 此后不变。",
              nextQuestion: {
                text: "首个可比定期报告何时披露营业收入与营业成本？",
                requiredEvidence: "合并利润表主表（含单位与口径说明）",
              },
            },

            T1: {
              status: "PARTIALLY_SUPPORTED",
              maturity: "IN_PROGRESS",
              interimSignal: "ABOVE",
              supportLevel: "WEAK",
              gateReason:
                "数值门禁通过、Decimal 已算出结果，但核验窗口 basis=YEAR 而事实 basis=YTD，年度目标尚未到期。阶段性达标只能记为部分支持，不采纳为「年度目标已验证」的强论据。",
              activeChannels: ["NUMERIC"],
              numeric: {
                formula: "gross_margin = (营业收入 − 营业成本) / 营业收入",
                formulaId: "gross_margin",
                formulaVersion: "1.0",
                operands: [
                  {
                    label: "营业收入",
                    value: "2,865,418,203.44",
                    unit: "元",
                    period: "2025-01-01 → 2025-09-30（YTD）",
                    scope: "合并",
                    source: {
                      fileName: "圣邦股份_2025年第三季度报告.pdf",
                      page: 12,
                      locator: "合并利润表 · 营业收入行 · 本期年初至报告期末列",
                    },
                  },
                  {
                    label: "营业成本",
                    value: "1,402,335,884.10",
                    unit: "元",
                    period: "2025-01-01 → 2025-09-30（YTD）",
                    scope: "合并",
                    source: {
                      fileName: "圣邦股份_2025年第三季度报告.pdf",
                      page: 12,
                      locator: "合并利润表 · 营业成本行 · 本期年初至报告期末列",
                    },
                  },
                ],
                checks: [
                  { code: "ENTITY_MATCH", label: "主体一致", passed: true, explanation: "两个操作数同属 300661 合并主体" },
                  { code: "PERIOD_MATCH", label: "期间一致", passed: true, explanation: "均为 2025-01-01 → 2025-09-30" },
                  { code: "BASIS_MATCH", label: "基准一致", passed: true, explanation: "均为 YTD 累计口径，未混用单季" },
                  { code: "SCOPE_MATCH", label: "口径一致", passed: true, explanation: "均为合并报表，非母公司" },
                  { code: "NON_ZERO_DENOMINATOR", label: "分母非零", passed: true, explanation: "营业收入 28.65 亿元 ≠ 0" },
                ],
                result: "0.5106",
                resultDisplay: "51.06%",
                target: "0.5100",
                targetDisplay: "≥ 51.00%",
                gapDisplay: "+0.06 个百分点（年初至今）",
                status: "PARTIALLY_SUPPORTED",
                maturity: "IN_PROGRESS",
                interimSignal: "ABOVE",
                verdict:
                  "年初至今毛利率 51.06%，已高于年度门槛，但年度窗口未关闭。数字通道只允许得出「阶段信号 ABOVE」，不允许得出「年度目标已达成」。",
              },
              composition: {
                numericConclusion: "YTD 51.06% ≥ 51.00%，差额 +0.06pp；期间未到期。",
                semanticConclusion: "本轮未调用语义通道：该论据是纯数值命题，无需解释性证据。",
                rule: "期间基准不一致（YEAR vs YTD）→ maturity=IN_PROGRESS → 阶段达标记 PARTIALLY_SUPPORTED，不升级为 SUPPORTED。",
                resultingStatus: "PARTIALLY_SUPPORTED",
                tension:
                  "如果没有 maturity 维度，这里最容易被误报成「毛利率目标已验证」。数值本身是对的，错的是期限。",
              },
              changeNote: "UNRESOLVED → PARTIALLY_SUPPORTED：首次取得可绑定单元格的营收与成本事实。",
              nextQuestion: {
                text: "年报全年毛利率能否维持在门槛之上？单季走势是否出现衰减？",
                requiredEvidence: "年报合并利润表 + 可推导单季数的三季报累计值",
              },
            },

            T2: {
              status: "SUPPORTED",
              maturity: "DUE",
              interimSignal: "ABOVE",
              supportLevel: "STRONG",
              gateReason:
                "口径可比性五项检查全部通过，期间基准与核验窗口一致（YEAR/YEAR），Decimal 结果可绑定到具体单元格与列头，且存在差额证据。采纳为强论据。",
              activeChannels: ["NUMERIC"],
              numeric: {
                formula: "gross_margin = (营业收入 − 营业成本) / 营业收入",
                formulaId: "gross_margin",
                formulaVersion: "1.0",
                operands: [
                  {
                    label: "营业收入",
                    value: "3,898,054,583.68",
                    unit: "元",
                    period: "2025-01-01 → 2025-12-31（YEAR）",
                    scope: "合并",
                    source: {
                      fileName: "圣邦股份_2025年年度报告.pdf",
                      page: 85,
                      locator: "合并利润表 · 营业收入行 · 本期发生额列",
                    },
                  },
                  {
                    label: "营业成本",
                    value: "1,892,113,879.42",
                    unit: "元",
                    period: "2025-01-01 → 2025-12-31（YEAR）",
                    scope: "合并",
                    source: {
                      fileName: "圣邦股份_2025年年度报告.pdf",
                      page: 85,
                      locator: "合并利润表 · 营业成本行 · 本期发生额列",
                    },
                  },
                ],
                checks: [
                  { code: "ENTITY_MATCH", label: "主体一致", passed: true, explanation: "两个操作数同属 300661 合并主体" },
                  { code: "PERIOD_MATCH", label: "期间一致", passed: true, explanation: "均为 2025-01-01 → 2025-12-31" },
                  { code: "BASIS_MATCH", label: "基准一致", passed: true, explanation: "均为 YEAR，与核验窗口一致" },
                  { code: "SCOPE_MATCH", label: "口径一致", passed: true, explanation: "均为合并报表" },
                  { code: "NON_ZERO_DENOMINATOR", label: "分母非零", passed: true, explanation: "营业收入 38.98 亿元 ≠ 0" },
                ],
                result: "0.5146",
                resultDisplay: "51.46%",
                target: "0.5100",
                targetDisplay: "≥ 51.00%",
                gapDisplay: "+0.46 个百分点",
                status: "SUPPORTED",
                maturity: "DUE",
                interimSignal: "ABOVE",
                verdict:
                  "全年合并毛利率 51.46%，高于门槛 0.46 个百分点。期间已到期、口径一致、来源可定位到单元格，数字通道判定 SUPPORTED。",
              },
              composition: {
                numericConclusion: "51.46% ≥ 51.00%，差额 +0.46pp；期间已到期（DUE）。",
                semanticConclusion: "本轮未调用语义通道：纯数值命题。",
                rule: "全部关键条件满足 + 期间到期 + 无实质反证 → SUPPORTED。",
                resultingStatus: "SUPPORTED",
                tension:
                  "注意：本论据 SUPPORTED 只代表「毛利率达标」，不代表「因产品结构升级而达标」。后者是 arg-a1-3，独立判定。",
              },
              changeNote:
                "PARTIALLY_SUPPORTED → SUPPORTED：期间由 YTD 推进到 YEAR，maturity 由 IN_PROGRESS 转为 DUE。",
              nextQuestion: {
                text: "单季毛利率是否出现衰减（Q4 单季 vs 前三季）？",
                requiredEvidence: "年报累计值与三季报累计值推导单季收入与成本后重算，不可直接相减两个累计毛利率",
              },
            },
          },
        },

        /* ------------------- A1-2 结构变化（披露依赖） ------------------- */
        {
          argumentId: "arg-a1-2",
          kind: "DISCLOSURE_DEPENDENT",
          kindLabel: "披露依赖",
          statement: "高端产品（车规 / 高精度信号链）收入占比较 2024 年提升",
          verificationTarget:
            "需要年报按产品或按应用口径披露可比两期收入结构，且「高端产品」的定义在两期一致。",
          criterionOrigin: "SYSTEM_PROPOSED",
          versions: {
            T0: {
              status: "UNRESOLVED",
              maturity: "NOT_DUE",
              interimSignal: "UNKNOWN",
              supportLevel: "PENDING",
              gateReason: "研报仅表述「高附加值料号占比提升」，未给可观测口径；系统建议核验标准，标记为 SYSTEM_PROPOSED，未伪装成研报原文。",
              activeChannels: [],
              changeNote: "系统在 T0 提出可观测标准，等待研究员确认。",
              nextQuestion: {
                text: "年报是否单独披露高端产品收入占比？",
                requiredEvidence: "分产品 / 分应用收入结构表（两期可比）",
              },
            },

            T1: {
              status: "UNRESOLVED",
              maturity: "IN_PROGRESS",
              interimSignal: "UNKNOWN",
              supportLevel: "PENDING",
              gateReason: "三季报不含分产品或分应用收入结构，缺少核心披露，不予判定。",
              activeChannels: ["SEMANTIC"],
              semantic: {
                evidence: [],
                relation: "INSUFFICIENT",
                adversarialCheck: {
                  asked: "是否存在任何可间接推断结构变化的披露？",
                  findings: ["三季报仅有合并口径主表与简要经营情况说明，无结构数据"],
                  agreed: true,
                },
                attributions: [],
                missingEvidence: [
                  { what: "分产品或分应用收入结构", whereToLook: "年报「经营情况讨论与分析」及财务报表附注" },
                ],
                status: "UNRESOLVED",
                verdict: "证据不足。语义通道不输出推测，明确记为缺披露。",
              },
              composition: {
                numericConclusion: "无适用数字：结构占比不是已注册指标，且无操作数。",
                semanticConclusion: "INSUFFICIENT：三季报无结构披露。",
                rule: "缺核心披露 → UNRESOLVED，不用行业常识补数。",
                resultingStatus: "UNRESOLVED",
              },
              changeNote: "维持 UNRESOLVED：本期无新增证据，明确记录为「本次无新增证据」而非重新验证。",
              nextQuestion: {
                text: "年报是否单独披露高端产品收入占比？",
                requiredEvidence: "分产品 / 分应用收入结构表（两期可比）",
              },
            },

            T2: {
              status: "PARTIALLY_SUPPORTED",
              maturity: "DUE",
              interimSignal: "UNKNOWN",
              supportLevel: "WEAK",
              gateReason:
                "年报披露了按应用领域的收入结构，方向与研报一致；但「高端产品」不是年报使用的口径，无法量化研报所指的占比提升幅度，且两期口径定义未确认一致。方向成立、幅度不可核验 → 弱支撑，不予采纳为强论据。",
              activeChannels: ["SEMANTIC"],
              semantic: {
                evidence: [
                  {
                    quote:
                      "报告期内，公司下游应用结构中，汽车电子、工业控制领域收入占比较上年同期有所提升，消费电子领域收入占比相应下降。",
                    fileName: "圣邦股份_2025年年度报告.pdf",
                    page: 21,
                    headingPath: ["管理层讨论与分析", "主营业务分析", "按应用领域收入结构"],
                    textHash: "a71f0c93",
                    quality: "NATIVE",
                  },
                ],
                relation: "RELATED_ONLY",
                adversarialCheck: {
                  asked: "「汽车电子 / 工业控制占比提升」是否等同于研报所说的「高附加值料号占比提升」？",
                  findings: [
                    "年报口径为应用领域，研报口径为产品附加值等级，两者不是一一映射",
                    "年报未披露各应用领域的毛利率，无法确认高附加值等价关系",
                    "披露为定性表述「有所提升」，未给具体占比数值，幅度不可核验",
                  ],
                  agreed: true,
                },
                attributions: [
                  {
                    kind: "DISCLOSED_FACT",
                    label: "披露事实",
                    text: "年报确认应用领域结构发生变化，汽车电子与工业控制占比提升。",
                    evidenceIndex: 0,
                  },
                  {
                    kind: "SYSTEM_HYPOTHESIS",
                    label: "系统假设（未证实）",
                    text: "应用领域升级可能与研报所指的高附加值料号占比提升相关，但缺少分产品毛利率无法确认。",
                    evidenceIndex: null,
                  },
                ],
                missingEvidence: [
                  { what: "分产品或分应用的两期毛利率", whereToLook: "年报附注「营业收入与营业成本」分部信息" },
                  { what: "「高端产品」的可量化定义与占比数值", whereToLook: "年报经营讨论或投资者关系活动记录" },
                ],
                status: "PARTIALLY_SUPPORTED",
                verdict:
                  "方向获得披露支持，幅度与口径等价性不可核验。语义通道给出 PARTIALLY_SUPPORTED，并明确列出仍缺的两项证据。",
              },
              composition: {
                numericConclusion: "不适用：无可注册指标与操作数。",
                semanticConclusion: "RELATED_ONLY / PARTIALLY_SUPPORTED：结构方向成立，幅度不可核验。",
                rule: "原子子条件部分支持、其余未决 → PARTIALLY_SUPPORTED，必须列出未决部分。",
                resultingStatus: "PARTIALLY_SUPPORTED",
                tension:
                  "这是最容易被摘要式产品写成「产品结构升级已验证」的地方。披露确实存在，但它证明的是另一件事。",
              },
              changeNote: "UNRESOLVED → PARTIALLY_SUPPORTED：年报首次提供应用领域结构披露。",
              nextQuestion: {
                text: "2026 半年报能否取得分产品毛利率，以验证「高端 = 高毛利」的等价关系？",
                requiredEvidence: "分部 / 分产品毛利率披露",
              },
            },
          },
        },

        /* ---------------------- A1-3 因果链 ---------------------- */
        {
          argumentId: "arg-a1-3",
          kind: "CAUSAL_LINK",
          kindLabel: "因果链",
          statement: "产品结构升级是综合毛利率维持韧性的原因",
          verificationTarget:
            "需要可独立验证的因果证据：分产品毛利率两期对比、或成本端因素被排除的量化说明。仅管理层归因不构成独立证明。",
          criterionOrigin: "REPORT_EXPLICIT",
          versions: {
            T0: {
              status: "UNRESOLVED",
              maturity: "NOT_DUE",
              interimSignal: "UNKNOWN",
              supportLevel: "PENDING",
              gateReason: "因果命题在研报中提出，尚无未来证据可核验。",
              activeChannels: [],
              nextQuestion: {
                text: "后续披露能否提供分产品毛利率以独立验证因果？",
                requiredEvidence: "分部 / 分产品毛利率，或成本端因素的量化拆分",
              },
            },

            T1: {
              status: "UNRESOLVED",
              maturity: "IN_PROGRESS",
              interimSignal: "UNKNOWN",
              supportLevel: "PENDING",
              gateReason: "三季报无任何归因披露，也无分产品数据，因果链无进展。",
              activeChannels: [],
              changeNote: "维持 UNRESOLVED。注意：A1-1 数值达标不能自动传导到本因果论据。",
              nextQuestion: {
                text: "年报管理层讨论是否说明毛利率变化的具体原因？",
                requiredEvidence: "管理层讨论与分析中的归因段落 + 可核验的量化拆分",
              },
            },

            T2: {
              status: "PARTIALLY_SUPPORTED",
              maturity: "DUE",
              interimSignal: "UNKNOWN",
              supportLevel: "WEAK",
              gateReason:
                "取得管理层明确归因，且归因与披露的应用领域结构变化一致；但归因方即被评价方，缺少独立可验证证据（分产品毛利率、成本端拆分）。按「只有强事实支撑的才作为论据」，管理层单方归因不予采纳为因果论据。",
              activeChannels: ["SEMANTIC"],
              semantic: {
                evidence: [
                  {
                    quote:
                      "报告期内，公司综合毛利率为 51.46%，较上年同期基本保持稳定，主要得益于产品结构持续优化以及高附加值产品出货占比提升。",
                    fileName: "圣邦股份_2025年年度报告.pdf",
                    page: 19,
                    headingPath: ["管理层讨论与分析", "盈利能力分析"],
                    textHash: "5c8e21ab",
                    quality: "NATIVE",
                  },
                  {
                    quote:
                      "同期，公司营业成本同比增长 12.94%，低于营业收入 16.46% 的同比增幅。",
                    fileName: "圣邦股份_2025年年度报告.pdf",
                    page: 86,
                    headingPath: ["财务报表附注", "营业收入与营业成本"],
                    textHash: "d19b44f7",
                    quality: "NATIVE",
                  },
                ],
                relation: "RELATED_ONLY",
                adversarialCheck: {
                  asked: "该归因是否把相关性当原因？是否把管理层观点当已证事实？是否遗漏限定语？",
                  findings: [
                    "管理层归因属于 MANAGEMENT_EXPLANATION，非系统独立证明的因果",
                    "成本增幅低于收入增幅与结构升级同时成立，但也可能来自晶圆代工价格回落，年报未拆分两者贡献",
                    "披露使用「主要得益于」这一限定语，未排除其他因素，不能读作唯一原因",
                    "两次判定一致，保留较谨慎状态",
                  ],
                  agreed: true,
                },
                attributions: [
                  {
                    kind: "MANAGEMENT_EXPLANATION",
                    label: "管理层归因",
                    text: "公司将毛利率稳定归因于产品结构优化与高附加值产品出货占比提升。",
                    evidenceIndex: 0,
                  },
                  {
                    kind: "DISCLOSED_FACT",
                    label: "披露事实",
                    text: "营业成本同比 +12.94%，低于营业收入同比 +16.46%，与毛利率维持韧性的方向一致。",
                    evidenceIndex: 1,
                  },
                  {
                    kind: "SYSTEM_HYPOTHESIS",
                    label: "竞争性假设（未排除）",
                    text: "上游晶圆与封测价格回落可能贡献了部分毛利率韧性；年报未量化拆分，无法排除。",
                    evidenceIndex: null,
                  },
                ],
                missingEvidence: [
                  { what: "分产品 / 分应用两期毛利率", whereToLook: "年报附注分部信息，或 2026 半年报" },
                  { what: "成本端价格因素与结构因素的贡献拆分", whereToLook: "管理层讨论、投资者关系活动记录表" },
                ],
                status: "PARTIALLY_SUPPORTED",
                verdict:
                  "存在明确归因与方向一致的相关事实，但竞争性假设未被排除。语义通道判定 PARTIALLY_SUPPORTED，且不将其升级为因果成立。",
              },
              composition: {
                numericConclusion:
                  "数字通道可确认「成本增幅低于收入增幅」，但这是一致性证据，不是因果证据。",
                semanticConclusion: "RELATED_ONLY：管理层归因 + 未排除的竞争假设。",
                rule: "相关性不能单独令因果论据变为 SUPPORTED；归因方即被评价方时需独立证据。",
                resultingStatus: "PARTIALLY_SUPPORTED",
                tension:
                  "两条通道都没有反驳因果，但也都不能证明它。系统选择停在 PARTIALLY_SUPPORTED，并把缺失证据写成下一期的具体索取项。",
              },
              changeNote: "UNRESOLVED → PARTIALLY_SUPPORTED（弱）：取得归因，但不予采纳为强论据。",
              nextQuestion: {
                text: "能否取得分产品毛利率，或成本端价格因素的量化拆分？",
                requiredEvidence: "分部毛利率披露；或公司对代工价格影响的量化说明",
              },
            },
          },
        },
      ],

      versions: {
        T0: {
          status: "UNRESOLVED",
          maturity: "NOT_DUE",
          summary: "已确立跟踪基线：1 条数值论据、1 条披露依赖论据、1 条因果论据，均尚无证据。",
          rollUp: {
            rule: [
              "有核心且期限适用的反证 → WEAKENED",
              "全部关键论据已被强事实支撑 → SUPPORTED",
              "至少一条被采纳、其余未决 → PARTIALLY_SUPPORTED",
              "其余 → UNRESOLVED",
            ],
            admitted: [],
            rejected: [],
            pending: ["arg-a1-1", "arg-a1-2", "arg-a1-3"],
            resultingStatus: "UNRESOLVED",
            naiveSummary: "（本轮无证据，摘要式产品通常在此直接复述研报观点。）",
            honestConclusion:
              "论述处于基线状态。三条论据均无财报证据，不予任何方向性判断。",
          },
          userJudgment: null,
        },

        T1: {
          status: "PARTIALLY_SUPPORTED",
          maturity: "IN_PROGRESS",
          summary:
            "年初至今毛利率 51.06% 已过年度门槛，但年度窗口未关闭；结构与因果两条论据本期无新增证据。",
          rollUp: {
            rule: [
              "有核心且期限适用的反证 → WEAKENED",
              "全部关键论据已被强事实支撑 → SUPPORTED",
              "至少一条被采纳、其余未决 → PARTIALLY_SUPPORTED",
              "其余 → UNRESOLVED",
            ],
            admitted: [],
            rejected: [
              {
                argumentId: "arg-a1-1",
                reason: "数值达标但期间基准为 YTD，年度目标未到期；阶段性达标不采纳为「已验证」。",
              },
            ],
            pending: ["arg-a1-2", "arg-a1-3"],
            resultingStatus: "PARTIALLY_SUPPORTED",
            naiveSummary: "「三季度毛利率已达标，盈利修复逻辑得到验证。」",
            honestConclusion:
              "阶段信号为正（ABOVE），但没有任何论据被采纳为强支撑。论述记为部分支持，理由是期限未到期而非证据充分——这两种「部分支持」必须区分。",
          },
          userJudgment:
            "年初至今毛利率已过线，但这是成本端红利还是结构升级，三季报分辨不出来。先不接受因果部分。",
        },

        T2: {
          status: "PARTIALLY_SUPPORTED",
          maturity: "DUE",
          summary:
            "全年毛利率 51.46% 达标（+0.46pp），数值论据转为强支撑；但结构与因果两条论据仅有方向性披露与管理层归因，不予采纳。论述停在部分支持。",
          rollUp: {
            rule: [
              "有核心且期限适用的反证 → WEAKENED",
              "全部关键论据已被强事实支撑 → SUPPORTED",
              "至少一条被采纳、其余未决 → PARTIALLY_SUPPORTED",
              "其余 → UNRESOLVED",
            ],
            admitted: ["arg-a1-1"],
            rejected: [
              {
                argumentId: "arg-a1-2",
                reason:
                  "年报口径为应用领域，研报口径为产品附加值等级，两者非一一映射；且披露为定性「有所提升」，幅度不可核验。方向成立不足以采纳。",
              },
              {
                argumentId: "arg-a1-3",
                reason:
                  "仅有管理层单方归因，归因方即被评价方；成本端价格回落这一竞争假设未被排除。相关性不作为因果论据采纳。",
              },
            ],
            pending: [],
            resultingStatus: "PARTIALLY_SUPPORTED",
            naiveSummary:
              "「2025 年毛利率 51.46% 达标，产品结构升级驱动盈利修复的逻辑得到充分验证。」",
            honestConclusion:
              "毛利率达标已被强事实支撑；「由产品结构升级驱动」未被证明。三条论据中仅一条被采纳，因此论述为部分支持，并把分产品毛利率列为下一期的具体索取项。",
          },
          userJudgment:
            "年报毛利率确认达标，数值部分我接受。管理层把原因归到产品结构，但没有分产品毛利率，我仍不接受因果部分——下一期继续要这个数。",
          userJudgmentCarriedFrom: "T1",
        },
      },
    },

    /* ============================ 论述 2 ============================ */
    {
      thesisId: "ths-3b90d7e2",
      originalStatement:
        "公司销售回款质量良好，经营活动现金流与盈利保持合理匹配，盈利质量稳健。",
      originalSource: {
        fileName: "圣邦股份_深度研究_20250615.pdf",
        page: 11,
        locator: "财务分析 · 现金流质量段",
      },
      currentStatement:
        "经营活动现金流与盈利保持匹配（核验门槛：现金利润比 = 经营现金流净额 / 归母净利润 ≥ 0.90）。",
      revision: 2,
      priority: 2,

      claims: [
        {
          argumentId: "arg-a2-1",
          kind: "NUMERIC_TARGET",
          kindLabel: "数值目标",
          statement: "2025 年度现金利润比 ≥ 0.90",
          verificationTarget:
            "现金利润比 = 经营活动产生的现金流量净额 / 归母净利润。分母口径在此显式固定为归母净利润；若改用合并净利润须另立指标名。",
          criterionOrigin: "USER_CONFIRMED",
          versions: {
            T0: {
              status: "UNRESOLVED",
              maturity: "NOT_DUE",
              interimSignal: "UNKNOWN",
              supportLevel: "PENDING",
              gateReason: "尚无财报数据。口径分母已在 T0 显式固定，避免后续同名指标混用。",
              activeChannels: [],
              nextQuestion: {
                text: "首份定期报告的经营现金流净额与归母净利润分别是多少？",
                requiredEvidence: "合并现金流量表 + 合并利润表",
              },
            },

            T1: {
              status: "WEAKENED",
              maturity: "IN_PROGRESS",
              interimSignal: "BELOW",
              supportLevel: "STRONG",
              gateReason:
                "五项口径检查通过，Decimal 结果 0.83 低于 0.90 门槛，且属于同主体、同口径、相应期限内的直接反证。反证本身是强事实，予以采纳——强支撑不只代表利好。",
              activeChannels: ["NUMERIC"],
              numeric: {
                formula: "cash_to_profit = 经营活动现金流量净额 / 归母净利润",
                formulaId: "cash_to_profit",
                formulaVersion: "1.0",
                operands: [
                  {
                    label: "经营活动产生的现金流量净额",
                    value: "312,406,882.15",
                    unit: "元",
                    period: "2025-01-01 → 2025-09-30（YTD）",
                    scope: "合并",
                    source: {
                      fileName: "圣邦股份_2025年第三季度报告.pdf",
                      page: 16,
                      locator: "合并现金流量表 · 经营活动产生的现金流量净额行",
                    },
                  },
                  {
                    label: "归属于母公司股东的净利润",
                    value: "376,204,119.60",
                    unit: "元",
                    period: "2025-01-01 → 2025-09-30（YTD）",
                    scope: "合并",
                    source: {
                      fileName: "圣邦股份_2025年第三季度报告.pdf",
                      page: 12,
                      locator: "合并利润表 · 归属于母公司所有者的净利润行",
                    },
                  },
                ],
                checks: [
                  { code: "ENTITY_MATCH", label: "主体一致", passed: true, explanation: "同属 300661 合并主体" },
                  { code: "PERIOD_MATCH", label: "期间一致", passed: true, explanation: "均为 2025 年年初至三季度末" },
                  { code: "BASIS_MATCH", label: "基准一致", passed: true, explanation: "均为 YTD 累计，未混用单季" },
                  { code: "SCOPE_MATCH", label: "口径一致", passed: true, explanation: "均为合并报表" },
                  { code: "NON_ZERO_DENOMINATOR", label: "分母非零", passed: true, explanation: "归母净利润 3.76 亿元 ≠ 0" },
                ],
                result: "0.8304",
                resultDisplay: "0.83 倍",
                target: "0.90",
                targetDisplay: "≥ 0.90 倍",
                gapDisplay: "−0.07 倍（低于门槛）",
                status: "WEAKENED",
                maturity: "IN_PROGRESS",
                interimSignal: "BELOW",
                verdict:
                  "现金利润比 0.83，低于 0.90 门槛。虽然年度窗口未到期，但这是同口径下的直接反证，数字通道判定 WEAKENED 而非 UNRESOLVED。",
              },
              composition: {
                numericConclusion: "0.83 < 0.90，差额 −0.07 倍；期间未到期但已构成直接反证。",
                semanticConclusion: "本轮未调用语义通道：三季报无相关归因披露。",
                rule: "存在同主体、同口径、相应期限内的直接反证 → WEAKENED，优先于「未到期」规则。",
                resultingStatus: "WEAKENED",
                tension:
                  "期限未到期通常意味着不能下结论，但反证是例外：现金转化恶化是已经发生的事实，不是对全年的预测。",
              },
              changeNote: "UNRESOLVED → WEAKENED：首次取得可比口径的现金流与利润事实。",
              nextQuestion: {
                text: "现金利润比下滑来自应收账款占用还是存货备货？",
                requiredEvidence: "年报附注应收账款与存货科目变动说明",
              },
            },

            T2: {
              status: "WEAKENED",
              maturity: "DUE",
              interimSignal: "BELOW",
              supportLevel: "STRONG",
              gateReason:
                "年度窗口到期，全年现金利润比 0.85 仍低于 0.90 门槛，五项口径检查通过，反证成立且可定位。采纳为强论据（方向为负面）。",
              activeChannels: ["NUMERIC", "SEMANTIC"],
              numeric: {
                formula: "cash_to_profit = 经营活动现金流量净额 / 归母净利润",
                formulaId: "cash_to_profit",
                formulaVersion: "1.0",
                operands: [
                  {
                    label: "经营活动产生的现金流量净额",
                    value: "466,319,946.20",
                    unit: "元",
                    period: "2025-01-01 → 2025-12-31（YEAR）",
                    scope: "合并",
                    source: {
                      fileName: "圣邦股份_2025年年度报告.pdf",
                      page: 89,
                      locator: "合并现金流量表 · 经营活动产生的现金流量净额行 · 本期发生额列",
                    },
                  },
                  {
                    label: "归属于母公司股东的净利润",
                    value: "547,382,660.18",
                    unit: "元",
                    period: "2025-01-01 → 2025-12-31（YEAR）",
                    scope: "合并",
                    source: {
                      fileName: "圣邦股份_2025年年度报告.pdf",
                      page: 85,
                      locator: "合并利润表 · 归属于母公司所有者的净利润行 · 本期发生额列",
                    },
                  },
                ],
                checks: [
                  { code: "ENTITY_MATCH", label: "主体一致", passed: true, explanation: "同属 300661 合并主体" },
                  { code: "PERIOD_MATCH", label: "期间一致", passed: true, explanation: "均为 2025 年度" },
                  { code: "BASIS_MATCH", label: "基准一致", passed: true, explanation: "均为 YEAR，与核验窗口一致" },
                  { code: "SCOPE_MATCH", label: "口径一致", passed: true, explanation: "均为合并报表" },
                  { code: "NON_ZERO_DENOMINATOR", label: "分母非零", passed: true, explanation: "归母净利润 5.47 亿元 ≠ 0" },
                ],
                result: "0.8519",
                resultDisplay: "0.85 倍",
                target: "0.90",
                targetDisplay: "≥ 0.90 倍",
                gapDisplay: "−0.05 倍（低于门槛）",
                status: "WEAKENED",
                maturity: "DUE",
                interimSignal: "BELOW",
                verdict:
                  "全年现金利润比 0.85，仍低于门槛。较 T1 的 0.83 略有回升，但未跨过阈值，负面判定维持。",
              },
              semantic: {
                evidence: [
                  {
                    quote:
                      "报告期内，公司经营活动产生的现金流量净额较上年同期下降 15.11%，主要系公司为支持订单交付加大原材料备货，以及部分客户信用期内应收账款增加所致。",
                    fileName: "圣邦股份_2025年年度报告.pdf",
                    page: 20,
                    headingPath: ["管理层讨论与分析", "现金流量分析"],
                    textHash: "8e2f60c4",
                    quality: "NATIVE",
                  },
                ],
                relation: "SUPPORTS",
                adversarialCheck: {
                  asked: "管理层给出的两项原因是否可核验？是否存在把备货说成暂时性的倾向？",
                  findings: [
                    "备货与应收账款两项原因均可在附注中核对科目变动，属于可核验归因",
                    "但「为支持订单交付」隐含需求向好的判断，年报未给出在手订单数据支撑",
                  ],
                  agreed: true,
                },
                attributions: [
                  {
                    kind: "MANAGEMENT_EXPLANATION",
                    label: "管理层归因（可核验）",
                    text: "现金流下降主要系加大原材料备货与应收账款增加。",
                    evidenceIndex: 0,
                  },
                ],
                missingEvidence: [
                  { what: "在手订单或需求前瞻数据", whereToLook: "年报经营讨论、投资者关系活动记录表" },
                ],
                status: "WEAKENED",
                verdict:
                  "语义通道确认了下降原因且原因可在附注核对，因此这是有解释的削弱，而非原因不明的削弱。",
              },
              composition: {
                numericConclusion: "0.85 < 0.90，差额 −0.05 倍；期间已到期。",
                semanticConclusion: "SUPPORTS（支持「已削弱」这一判断）：取得可核验的下降归因。",
                rule: "核心条件未满足且期间到期 → WEAKENED；语义通道补充原因层次，不改变数值判定。",
                resultingStatus: "WEAKENED",
                tension:
                  "两条通道结论一致，但职责不同：数字通道判定「削弱」，语义通道解释「为什么」。混淆这两者是摘要式产品的常见问题。",
              },
              changeNote: "维持 WEAKENED；0.83 → 0.85 属于程度变化，未跨越门槛，不改变状态。",
              nextQuestion: {
                text: "应收账款账龄与存货周转在 2026 半年报是否改善？",
                requiredEvidence: "半年报附注应收账款账龄表、存货明细及周转天数",
              },
            },
          },
        },
      ],

      versions: {
        T0: {
          status: "UNRESOLVED",
          maturity: "NOT_DUE",
          summary: "基线确立，现金利润比口径分母固定为归母净利润。",
          rollUp: {
            rule: ["有核心且期限适用的反证 → WEAKENED", "全部关键论据已被强事实支撑 → SUPPORTED", "其余 → UNRESOLVED"],
            admitted: [],
            rejected: [],
            pending: ["arg-a2-1"],
            resultingStatus: "UNRESOLVED",
            naiveSummary: "（本轮无证据。）",
            honestConclusion: "尚无现金流与利润事实，不予判断。",
          },
          userJudgment: null,
        },

        T1: {
          status: "WEAKENED",
          maturity: "IN_PROGRESS",
          summary: "三季报现金利润比 0.83，首次跌破 0.90 门槛，构成同口径直接反证。",
          rollUp: {
            rule: ["有核心且期限适用的反证 → WEAKENED", "全部关键论据已被强事实支撑 → SUPPORTED", "其余 → UNRESOLVED"],
            admitted: ["arg-a2-1"],
            rejected: [],
            pending: [],
            resultingStatus: "WEAKENED",
            naiveSummary: "「现金流阶段性承压，全年仍有望改善。」",
            honestConclusion:
              "现金转化恶化是已发生事实而非预测，因此即便年度窗口未到期也判定削弱。这是「未到期不轻易下结论」的唯一例外：反证。",
          },
          userJudgment: "现金利润比跌破阈值，需要看年报确认是备货节奏还是回款质量恶化。",
        },

        T2: {
          status: "WEAKENED",
          maturity: "DUE",
          summary:
            "全年现金利润比 0.85，仍低于门槛；年报给出可核验的下降归因（备货 + 应收账款）。这是有解释的削弱。",
          rollUp: {
            rule: ["有核心且期限适用的反证 → WEAKENED", "全部关键论据已被强事实支撑 → SUPPORTED", "其余 → UNRESOLVED"],
            admitted: ["arg-a2-1"],
            rejected: [],
            pending: [],
            resultingStatus: "WEAKENED",
            naiveSummary: "「净利润同比增长，盈利能力持续增强。」",
            honestConclusion:
              "利润增长与现金转化恶化同时成立。系统不把前者当作后者的替代，论述维持削弱，并把账龄与周转列为下一期索取项。",
          },
          userJudgment:
            "年报确认是备货与应收账款双重占用，归因可核验，我接受这个削弱判断。下一期重点看账龄结构而不是总量。",
          userJudgmentCarriedFrom: "T1",
        },
      },
    },

    /* ============================ 论述 3 ============================ */
    {
      thesisId: "ths-6d47f1b8",
      originalStatement:
        "公司维持高强度研发投入，料号持续拓展，研发壁垒构成中长期护城河。",
      originalSource: {
        fileName: "圣邦股份_深度研究_20250615.pdf",
        page: 14,
        locator: "投资要点 · 研发壁垒段",
      },
      currentStatement:
        "研发投入维持高强度（核验门槛：研发费用率处于 25%–28% 区间，且研发费用同比增速 ≥ 15%）。",
      revision: 1,
      priority: 3,

      claims: [
        {
          argumentId: "arg-a3-1",
          kind: "NUMERIC_TARGET",
          kindLabel: "数值区间",
          statement: "2025 年度研发费用率处于 25%–28% 区间",
          verificationTarget: "研发费用率 = 研发费用 / 营业收入，两操作数须同主体、同期间、同口径。",
          criterionOrigin: "REPORT_EXPLICIT",
          versions: {
            T0: {
              status: "UNRESOLVED",
              maturity: "NOT_DUE",
              interimSignal: "UNKNOWN",
              supportLevel: "PENDING",
              gateReason: "尚无财报数据。",
              activeChannels: [],
            },
            T1: {
              status: "PARTIALLY_SUPPORTED",
              maturity: "IN_PROGRESS",
              interimSignal: "ON_TRACK",
              supportLevel: "WEAK",
              gateReason: "三季报披露研发费用，年初至今费用率落在区间内，但年度窗口未到期，不采纳为强论据。",
              activeChannels: ["NUMERIC"],
              numeric: {
                formula: "rd_ratio = 研发费用 / 营业收入",
                formulaId: "rd_ratio",
                formulaVersion: "1.0",
                operands: [
                  {
                    label: "研发费用",
                    value: "768,204,551.02",
                    unit: "元",
                    period: "2025-01-01 → 2025-09-30（YTD）",
                    scope: "合并",
                    source: { fileName: "圣邦股份_2025年第三季度报告.pdf", page: 12, locator: "合并利润表 · 研发费用行" },
                  },
                  {
                    label: "营业收入",
                    value: "2,865,418,203.44",
                    unit: "元",
                    period: "2025-01-01 → 2025-09-30（YTD）",
                    scope: "合并",
                    source: { fileName: "圣邦股份_2025年第三季度报告.pdf", page: 12, locator: "合并利润表 · 营业收入行" },
                  },
                ],
                checks: [
                  { code: "ENTITY_MATCH", label: "主体一致", passed: true, explanation: "同属 300661 合并主体" },
                  { code: "PERIOD_MATCH", label: "期间一致", passed: true, explanation: "均为年初至三季度末" },
                  { code: "SCOPE_MATCH", label: "口径一致", passed: true, explanation: "均为合并报表" },
                  { code: "NON_ZERO_DENOMINATOR", label: "分母非零", passed: true, explanation: "营业收入 ≠ 0" },
                ],
                result: "0.2681",
                resultDisplay: "26.81%",
                target: "0.25–0.28",
                targetDisplay: "25%–28% 区间",
                gapDisplay: "落在区间内，距下界 +1.81pp，距上界 −1.19pp",
                status: "PARTIALLY_SUPPORTED",
                maturity: "IN_PROGRESS",
                interimSignal: "ON_TRACK",
                verdict: "年初至今研发费用率 26.81%，处于目标区间；年度窗口未到期。",
              },
              composition: {
                numericConclusion: "26.81% ∈ [25%, 28%]；期间未到期。",
                semanticConclusion: "本轮未调用语义通道。",
                rule: "阶段达标 + 期间未到期 → PARTIALLY_SUPPORTED / IN_PROGRESS / ON_TRACK。",
                resultingStatus: "PARTIALLY_SUPPORTED",
              },
              changeNote: "UNRESOLVED → PARTIALLY_SUPPORTED。",
            },
            T2: {
              status: "SUPPORTED",
              maturity: "DUE",
              interimSignal: "ON_TRACK",
              supportLevel: "STRONG",
              gateReason: "年度窗口到期，全年研发费用率 26.81% 落在区间内，口径检查通过，可定位到利润表行。采纳为强论据。",
              activeChannels: ["NUMERIC"],
              numeric: {
                formula: "rd_ratio = 研发费用 / 营业收入",
                formulaId: "rd_ratio",
                formulaVersion: "1.0",
                operands: [
                  {
                    label: "研发费用",
                    value: "1,045,194,886.44",
                    unit: "元",
                    period: "2025-01-01 → 2025-12-31（YEAR）",
                    scope: "合并",
                    source: { fileName: "圣邦股份_2025年年度报告.pdf", page: 85, locator: "合并利润表 · 研发费用行 · 本期发生额列" },
                  },
                  {
                    label: "营业收入",
                    value: "3,898,054,583.68",
                    unit: "元",
                    period: "2025-01-01 → 2025-12-31（YEAR）",
                    scope: "合并",
                    source: { fileName: "圣邦股份_2025年年度报告.pdf", page: 85, locator: "合并利润表 · 营业收入行 · 本期发生额列" },
                  },
                ],
                checks: [
                  { code: "ENTITY_MATCH", label: "主体一致", passed: true, explanation: "同属 300661 合并主体" },
                  { code: "PERIOD_MATCH", label: "期间一致", passed: true, explanation: "均为 2025 年度" },
                  { code: "BASIS_MATCH", label: "基准一致", passed: true, explanation: "均为 YEAR" },
                  { code: "SCOPE_MATCH", label: "口径一致", passed: true, explanation: "均为合并报表" },
                  { code: "NON_ZERO_DENOMINATOR", label: "分母非零", passed: true, explanation: "营业收入 ≠ 0" },
                ],
                result: "0.2681",
                resultDisplay: "26.81%",
                target: "0.25–0.28",
                targetDisplay: "25%–28% 区间",
                gapDisplay: "落在区间内，距下界 +1.81pp，距上界 −1.19pp",
                status: "SUPPORTED",
                maturity: "DUE",
                interimSignal: "ON_TRACK",
                verdict: "全年研发费用率 26.81%，处于目标区间，期间已到期。",
              },
              composition: {
                numericConclusion: "26.81% ∈ [25%, 28%]；期间到期（DUE）。",
                semanticConclusion: "本轮未调用语义通道：纯数值区间命题。",
                rule: "全部关键条件满足 + 期间到期 + 无反证 → SUPPORTED。",
                resultingStatus: "SUPPORTED",
              },
              changeNote: "PARTIALLY_SUPPORTED → SUPPORTED：期间由 YTD 推进到 YEAR。",
            },
          },
        },

        {
          argumentId: "arg-a3-2",
          kind: "TREND",
          kindLabel: "趋势",
          statement: "研发费用同比增速 ≥ 15%",
          verificationTarget: "同比 = (本期 − 上年同期) / 上年同期；上年同期为负或零时改判差额，不输出常规增速。",
          criterionOrigin: "SYSTEM_PROPOSED",
          versions: {
            T0: {
              status: "UNRESOLVED",
              maturity: "NOT_DUE",
              interimSignal: "UNKNOWN",
              supportLevel: "PENDING",
              gateReason: "系统在 T0 建议以同比增速作为「高强度研发」的可观测标准，标记 SYSTEM_PROPOSED。",
              activeChannels: [],
            },
            T1: {
              status: "UNRESOLVED",
              maturity: "IN_PROGRESS",
              interimSignal: "UNKNOWN",
              supportLevel: "PENDING",
              gateReason: "三季报未披露上年同期研发费用可比数，缺少同比操作数，不予计算。",
              activeChannels: ["NUMERIC"],
              numeric: {
                formula: "yoy_growth = (本期 − 上年同期) / 上年同期",
                formulaId: "yoy_growth",
                formulaVersion: "1.0",
                operands: [
                  {
                    label: "研发费用（本期 YTD）",
                    value: "768,204,551.02",
                    unit: "元",
                    period: "2025-01-01 → 2025-09-30（YTD）",
                    scope: "合并",
                    source: { fileName: "圣邦股份_2025年第三季度报告.pdf", page: 12, locator: "合并利润表 · 研发费用行" },
                  },
                ],
                checks: [
                  { code: "ENTITY_MATCH", label: "主体一致", passed: true, explanation: "本期数主体明确" },
                  { code: "PERIOD_MATCH", label: "期间一致", passed: false, explanation: "缺少上年同期可比数，期间无法配对" },
                ],
                result: null,
                resultDisplay: "拒绝计算",
                refusalReason:
                  "可比期间操作数缺失。系统不代替披露补数，也不用本期数除以任意基数制造一个看似合理的增速。",
                target: "0.15",
                targetDisplay: "≥ 15%",
                gapDisplay: null,
                status: "UNRESOLVED",
                maturity: "IN_PROGRESS",
                interimSignal: "UNKNOWN",
                verdict: "口径门禁未通过（PERIOD_MATCH=false），拒绝计算，判定为证据不足。",
              },
              composition: {
                numericConclusion: "拒绝计算：缺少上年同期操作数。",
                semanticConclusion: "未调用。",
                rule: "可比性检查未通过 → 不产出数字 → UNRESOLVED。",
                resultingStatus: "UNRESOLVED",
                tension:
                  "这是数字通道「宁可拒绝也不编造」的示例：门禁失败时，诚实的输出是一个拒绝理由，而不是一个数。",
              },
              changeNote: "维持 UNRESOLVED：本期无新增可比数。",
            },
            T2: {
              status: "SUPPORTED",
              maturity: "DUE",
              interimSignal: "ABOVE",
              supportLevel: "STRONG",
              gateReason: "年报提供两期可比研发费用，口径检查通过，同比 +20.03% ≥ 15%。采纳为强论据。",
              activeChannels: ["NUMERIC"],
              numeric: {
                formula: "yoy_growth = (本期 − 上年同期) / 上年同期",
                formulaId: "yoy_growth",
                formulaVersion: "1.0",
                operands: [
                  {
                    label: "研发费用（本期）",
                    value: "1,045,194,886.44",
                    unit: "元",
                    period: "2025-01-01 → 2025-12-31（YEAR）",
                    scope: "合并",
                    source: { fileName: "圣邦股份_2025年年度报告.pdf", page: 85, locator: "合并利润表 · 研发费用行 · 本期发生额列" },
                  },
                  {
                    label: "研发费用（上年同期）",
                    value: "870,765,442.30",
                    unit: "元",
                    period: "2024-01-01 → 2024-12-31（YEAR）",
                    scope: "合并",
                    source: { fileName: "圣邦股份_2025年年度报告.pdf", page: 85, locator: "合并利润表 · 研发费用行 · 上期发生额列" },
                  },
                ],
                checks: [
                  { code: "ENTITY_MATCH", label: "主体一致", passed: true, explanation: "同属 300661 合并主体" },
                  { code: "PERIOD_MATCH", label: "期间一致", passed: true, explanation: "本期与上年同期均为 YEAR，可配对" },
                  { code: "SCOPE_MATCH", label: "口径一致", passed: true, explanation: "均为合并报表，取自同一份年报的上期比较列" },
                  { code: "NON_ZERO_DENOMINATOR", label: "分母为正", passed: true, explanation: "上年同期 8.71 亿元 > 0，可计算常规增速" },
                ],
                result: "0.2003",
                resultDisplay: "+20.03%",
                target: "0.15",
                targetDisplay: "≥ 15%",
                gapDisplay: "+5.03 个百分点（高于门槛）",
                status: "SUPPORTED",
                maturity: "DUE",
                interimSignal: "ABOVE",
                verdict: "研发费用同比 +20.03%，高于 15% 门槛；比较数取自同一份年报的上期列，避免跨重述口径比较。",
              },
              composition: {
                numericConclusion: "+20.03% ≥ 15%；期间到期。",
                semanticConclusion: "未调用：纯数值趋势命题。",
                rule: "关键条件满足 + 期间到期 + 无反证 → SUPPORTED。",
                resultingStatus: "SUPPORTED",
                tension:
                  "T1 曾因缺可比数拒绝计算，T2 取得同份年报的上期列后才计算——优先使用同一份报告内的重述比较数，是口径纪律的体现。",
              },
              changeNote: "UNRESOLVED → SUPPORTED：取得可比期间操作数。",
            },
          },
        },
      ],

      versions: {
        T0: {
          status: "UNRESOLVED",
          maturity: "NOT_DUE",
          summary: "基线确立：研发费用率区间与同比增速两条数值论据。",
          rollUp: {
            rule: ["全部关键论据已被强事实支撑 → SUPPORTED", "至少一条被采纳、其余未决 → PARTIALLY_SUPPORTED", "其余 → UNRESOLVED"],
            admitted: [],
            rejected: [],
            pending: ["arg-a3-1", "arg-a3-2"],
            resultingStatus: "UNRESOLVED",
            naiveSummary: "（本轮无证据。）",
            honestConclusion: "尚无研发费用事实。",
          },
          userJudgment: null,
        },
        T1: {
          status: "PARTIALLY_SUPPORTED",
          maturity: "IN_PROGRESS",
          summary: "研发费用率落在区间内但年度未到期；同比增速因缺可比数被拒绝计算。",
          rollUp: {
            rule: ["全部关键论据已被强事实支撑 → SUPPORTED", "至少一条被采纳、其余未决 → PARTIALLY_SUPPORTED", "其余 → UNRESOLVED"],
            admitted: [],
            rejected: [
              { argumentId: "arg-a3-1", reason: "年度窗口未到期，阶段达标不采纳为强论据。" },
              { argumentId: "arg-a3-2", reason: "可比期间操作数缺失，数字通道拒绝计算。" },
            ],
            pending: [],
            resultingStatus: "PARTIALLY_SUPPORTED",
            naiveSummary: "「研发投入维持高位，护城河持续加固。」",
            honestConclusion:
              "两条论据本轮均未被采纳：一条期限未到，一条拒绝计算。记为部分支持并保留各自的失败理由，不合并成一句乐观表述。",
          },
          userJudgment: null,
        },
        T2: {
          status: "SUPPORTED",
          maturity: "DUE",
          summary: "全年研发费用率 26.81% 落在区间内，研发费用同比 +20.03% 高于门槛，两条论据均为强支撑。",
          rollUp: {
            rule: ["全部关键论据已被强事实支撑 → SUPPORTED", "至少一条被采纳、其余未决 → PARTIALLY_SUPPORTED", "其余 → UNRESOLVED"],
            admitted: ["arg-a3-1", "arg-a3-2"],
            rejected: [],
            pending: [],
            resultingStatus: "SUPPORTED",
            naiveSummary: "「研发投入持续加码，技术壁垒显著增强。」",
            honestConclusion:
              "两条数值论据均被强事实支撑且期间到期，论述判定 SUPPORTED。注意本论述只覆盖投入强度，不覆盖研发转化效率——后者未被提出，因此不被默认成立。",
          },
          userJudgment: "投入强度确认。但研发转化效率（新品收入贡献）研报没提，我也不在这一轮加进去，下期单独建一条论述。",
          userJudgmentCarriedFrom: null,
        },
      },
    },
  ],
};

/** Convenience lookup used by the UI. */
export const DEMO_VERSION_IDS = PHILOSOPHY_DEMO.versions.map((v) => v.version);
export const LATEST_DEMO_VERSION = DEMO_VERSION_IDS[DEMO_VERSION_IDS.length - 1];
