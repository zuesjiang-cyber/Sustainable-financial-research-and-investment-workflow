import type { ProjectState, CaseInput } from "../types/fintrust";
import fs from "fs";
import path from "path";

// Read default case inputs from file system
export function loadCaseInput(filePath: string): CaseInput | null {
  try {
    const fullPath = path.resolve(process.cwd(), filePath);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, "utf-8");
      return JSON.parse(content);
    }
  } catch (err) {
    console.warn(`Could not load case input from ${filePath}:`, err);
  }
  return null;
}

export function getInitialSbgProject(): ProjectState {
  return {
    id: "proj_sbg_300661",
    name: "【历史演示样例】圣邦股份研究状态追踪",
    company: "圣邦微电子（北京）股份有限公司",
    ticker: "300661.SZ",
    current_version: "T1",
    status: "active",
    summary: "演示数据：历史版本沿用旧项目的研究假设、摘录与模拟修正，未经本轮原件核验，时间轴不作为真实披露日期。用于展示观点、证据、用户修正如何跨轮次保存；正式使用请新建项目并提供实际材料。",
    created_at: "2024-05-10T09:00:00Z",
    updated_at: "2025-04-20T16:30:00Z",
    theses: [
      {
        id: "THESIS_01",
        project_id: "proj_sbg_300661",
        title: "收入恢复增长与下游景气修复",
        original_view: "公司营业收入由前期库存去化低谷走向复苏，下游消费电子、工业控制及汽车电子需求逐步修复。",
        formed_at: "2024-05-10T09:00:00Z",
        basis: "FY2024年报指引及渠道库存去化接近尾声，终端客户提货回暖。",
        verification_criteria: "营收同比增速不低于 15%，超越 20% 为加速",
        verification_timeframe: "4个季度内验证",
        current_status: "保持",
        current_reason: "营业收入同比增长 16.46%，满足 >=15% 基线门槛，处于稳态复苏区间。",
        user_revision: undefined,
        citations: ["E25_P13_SUMMARY"],
        updated_at: "2025-04-20T16:30:00Z",
      },
      {
        id: "THESIS_02",
        project_id: "proj_sbg_300661",
        title: "综合毛利率与产品组合升级",
        original_view: "高毛利高性能信号链芯片与车规级产品放量，有望支撑公司综合毛利率保持稳定或温和提升。",
        formed_at: "2024-05-10T09:00:00Z",
        basis: "高壁垒料号持续推出，高端车规芯片定价韧性强于消费级通用芯片。",
        verification_criteria: "综合毛利率变动在 ±0.50 个百分点以内为稳态，提升 >0.50 pct 为加强，下降 >0.50 pct 为削弱",
        verification_timeframe: "半年度及全年度财报核验",
        current_status: "削弱",
        current_reason: "综合毛利率 50.94%，同比下降 0.52 个百分点，突破稳定区间（±0.50 pct）下限，触发削弱。",
        user_revision: "演示用户修正：测试中心初期折旧及通用产品降价是待验证的可能原因，不能当作已证实归因。下一轮分别寻找证据并跟踪拐点。",
        citations: ["E25_P85_COST_REVENUE", "E25_P141_INVENTORY_MARGIN"],
        updated_at: "2025-04-20T16:30:00Z",
      },
      {
        id: "THESIS_03",
        project_id: "proj_sbg_300661",
        title: "经营现金流与盈利匹配度",
        original_view: "伴随收入改善，经营活动现金流应当同步复苏，与归母净利润保持高度匹配（比率高于 0.9 倍）。",
        formed_at: "2024-05-10T09:00:00Z",
        basis: "模拟芯片回款周期较健康，应收账款控制良好。",
        verification_criteria: "现金利润比 >= 0.90 倍且经营现金流同比不出现下滑",
        verification_timeframe: "全年度现金流量表审计",
        current_status: "削弱",
        current_reason: "经营现金流 4.66 亿元，同比下滑 15.11%，现金利润比为 0.85 倍（低于 0.90 倍健康基线）。",
        user_revision: undefined,
        citations: ["E25_P89_CASH_FLOW"],
        updated_at: "2025-04-20T16:30:00Z",
      },
      {
        id: "THESIS_04",
        project_id: "proj_sbg_300661",
        title: "高强度研发驱动长期技术壁垒",
        original_view: "持续的高研发投入是模拟芯片设计企业拓宽料号池与技术护城河的核心驱动，研发费用率应维持在 25%–28% 区间。",
        formed_at: "2024-05-10T09:00:00Z",
        basis: "模拟芯片靠料号积累形成网络效应与客户粘性。",
        verification_criteria: "研发费用绝对额保持双位数增长，且研发费用率处于 25%–28% 战略区间",
        verification_timeframe: "持续追踪",
        current_status: "加强",
        current_reason: "研发费用 10.45 亿元（同比+20.03%），研发费用率提升至 26.81%，在售料号扩充至 6,000 款以上。",
        user_revision: undefined,
        citations: ["E25_P85_COST_REVENUE"],
        updated_at: "2025-04-20T16:30:00Z",
      },
    ],
    documents: [
      {
        id: "DOC_T0_NOTES",
        project_id: "proj_sbg_300661",
        source_type: "notes",
        title: "圣邦股份买方研究底稿（T0基线建仓观点）",
        disclosure_date: "2024-05-10",
        content: `【公司概况与历史基准】\n圣邦股份是国内模拟集成电路龙头，产品覆盖信号链与电源管理两大领域。2024年收入33.47亿元，研发费用8.71亿元（费用率26.02%），料号超过5200款。\n【核心判断】\n1. 营收走出半导体下行周期，2025年有望重回15%以上稳步增长。\n2. 车规级与高性能信号链放量，毛利率有望稳定在51%以上。\n3. 研发投入维持在25%-28%高位，为长期国产替代筑牢护城河。\n【待解疑问】\nQ01: 自建江阴测试中心投产后，能否如期压缩测试周期并降低外协成本？车规料号在Tier-1客户处的放量节奏如何？`,
        added_at: "2024-05-10T09:00:00Z",
        evidence_snippets: [
          { id: "E24_P17_SUMMARY", page: 17, text: "公司长期深耕模拟集成电路芯片设计领域，采用行业成熟的 Fabless 经营模式。" },
          { id: "E24_P25_RD", page: 25, text: "2024年度公司研发费用为 8.71 亿元，研发费用率达 26.02%，可销售料号超过 5,200 款。" },
        ],
      },
      {
        id: "DOC_T1_FY2025_ANNUAL",
        project_id: "proj_sbg_300661",
        source_type: "annual_report",
        title: "圣邦股份2025年年度报告法定披露",
        disclosure_date: "2025-04-20",
        content: `【主要财务数据】\n营业收入 3,898,054,583.68 元（同比+16.46%）；归母净利润 547,059,403.97 元（同比+9.36%）；经营活动产生的现金流量净额 466,319,946.20 元（同比-15.11%）；研发费用 1,045,194,886.44 元（同比+20.03%，占营收26.81%）。\n综合毛利率 50.94%（上年同期 51.46%，下降0.52个百分点）。\n【业务模式演进】\n公司持续深化“Fabless+”业务模式。晶圆制造委托台积电、华润微等代工；自有江阴测试中心稳定运行，高可靠性测试周期有所压缩，实现关键环节自主掌控。`,
        added_at: "2025-04-20T16:00:00Z",
        evidence_snippets: [
          { id: "E25_P13_SUMMARY", page: 13, text: "营业收入 3,898,054,583.68 元，同比增长 16.46%；经营活动产生的现金流量净额 466,319,946.20 元，同比下降 15.11%。" },
          { id: "E25_P16_FABLESS", page: 16, text: "公司持续演进深化“Fabless+”业务模式，自有专业测试中心稳定运行。" },
          { id: "E25_P85_COST_REVENUE", page: 85, text: "研发费用 1,045,194,886.44 元，营业收入 3,898,054,583.68 元，营业成本 1,912,334,714.23 元。" },
          { id: "E25_P89_CASH_FLOW", page: 89, text: "经营活动现金流入 4,098,284,811.23 元，经营活动净额 466,319,946.20 元。" },
          { id: "E25_P141_INVENTORY_MARGIN", page: 141, text: "综合毛利率 50.94%，上年同期为 51.46%，比上年同期下降 0.52 个百分点。" },
        ],
      },
    ],
    updates: [
      {
        id: "UPDATE_T0_BASE",
        project_id: "proj_sbg_300661",
        version: "T0",
        parent_version: null,
        title: "T0 基线建仓与买方假设确立",
        material_id: "DOC_T0_NOTES",
        thesis_deltas: [
          {
            thesis_id: "THESIS_01",
            title: "收入恢复增长与下游景气修复",
            previous_status: "待评估",
            new_status: "保持",
            reason: "确立基准假设：要求收入增速恢复至15%以上。",
            gap_explanation: {
              observed: "2024年收入33.47亿元，处于周期底部修复初期。",
              disclosed_reason: "消费类客户库存出清，工业和汽车占比温和爬坡。",
              unverified_hypotheses: "2025年汽车与工控芯片订单能否实现连续环比加速。",
            },
            evidence_ids: ["E24_P17_SUMMARY"],
            next_steps: "跟踪后续季度营收环比变动趋势。",
          },
          {
            thesis_id: "THESIS_02",
            title: "综合毛利率与产品组合升级",
            previous_status: "待评估",
            new_status: "保持",
            reason: "确立基准假设：毛利率稳定在51%合理中枢区间。",
            gap_explanation: {
              observed: "2024年综合毛利率 51.46%。",
              disclosed_reason: "高性能信号链产品结构优化对冲晶圆代工降价压力。",
              unverified_hypotheses: "行业降价竞争是否会传导至主营电源管理产品线。",
            },
            evidence_ids: ["E24_P25_RD"],
            next_steps: "核算2025年报综合毛利率与分产品毛利表现。",
          },
        ],
        user_revisions: {},
        follow_up_questions: [
          {
            id: "Q01",
            question_text: "关注后续车规专用模拟芯片在新客户（尤其是主流主机厂与 Tier-1）的导入放量节奏，以及江阴自建测试中心的利用率和降本效果。",
            status: "未解决",
            created_in_version: "T0",
            resolved_in_version: null,
            answer_notes: "",
            updated_at: "2024-05-10T09:00:00Z",
          },
        ],
        confirmed_at: "2024-05-10T09:00:00Z",
        confirmed_by: "买方分析师",
        summary: "完成 T0 基线观点录入，设定 4 项核心跟踪逻辑及 1 项未决问题。",
      },
      {
        id: "UPDATE_T1_FY25",
        project_id: "proj_sbg_300661",
        version: "T1",
        parent_version: "T0",
        title: "T1 圣邦股份2025年报业绩与业务模式更新",
        material_id: "DOC_T1_FY2025_ANNUAL",
        thesis_deltas: [
          {
            thesis_id: "THESIS_01",
            title: "收入恢复增长与下游景气修复",
            previous_status: "保持",
            new_status: "保持",
            reason: "营业收入同比增长 16.46%，满足 >=15% 基线门槛，但未达 20% 加速门槛。",
            gap_explanation: {
              observed: "营收达到 38.98 亿元，增速 16.46%。",
              disclosed_reason: "各细分应用领域逐步复苏，在售料号扩充至 6,000 款以上。",
              unverified_hypotheses: "海外市场开拓及工业客户长单可持续性待观察。",
            },
            evidence_ids: ["E25_P13_SUMMARY"],
            next_steps: "观察2026年Q1淡季订单韧性。",
          },
          {
            thesis_id: "THESIS_02",
            title: "综合毛利率与产品组合升级",
            previous_status: "保持",
            new_status: "削弱",
            reason: "综合毛利率 50.94%，同比下降 0.52 个百分点，突破稳定区间（±0.50 pct）下限，触发削弱。",
            gap_explanation: {
              observed: "毛利率由 51.46% 微降至 50.94%。",
              disclosed_reason: "集成电路通用料号面临一定程度市场竞价，上游晶圆成本结转平稳。",
              unverified_hypotheses: "自建江阴测试中心初期固定资产折旧摊销增加是否对短期毛利形成压制。",
            },
            evidence_ids: ["E25_P85_COST_REVENUE", "E25_P141_INVENTORY_MARGIN"],
            next_steps: "排查测试中心产能爬坡与折旧计提节奏。",
          },
          {
            thesis_id: "THESIS_03",
            title: "经营现金流与盈利匹配度",
            previous_status: "保持",
            new_status: "削弱",
            reason: "经营现金流 4.66 亿元，同比下滑 15.11%，现金利润比为 0.85 倍（低于 0.90 倍健康基线）。",
            gap_explanation: {
              observed: "经营性净现金流由 5.49 亿元降至 4.66 亿元，与净利润增长背离。",
              disclosed_reason: "备货及支付供应商货款与研发人员薪酬支出增加。",
              unverified_hypotheses: "营运资本占用中应收账款与存货去化周期是否边际拉长。",
            },
            evidence_ids: ["E25_P89_CASH_FLOW"],
            next_steps: "核算存货周转天数与现金流量表附表营运变动。",
          },
          {
            thesis_id: "THESIS_04",
            title: "高强度研发驱动长期技术壁垒",
            previous_status: "保持",
            new_status: "加强",
            reason: "研发费用 10.45 亿元（同比+20.03%），研发费用率提升至 26.81%，研发成果转化料号过 6,000 款。",
            gap_explanation: {
              observed: "研发投入绝对额突破 10 亿元大关，费用率保持高位。",
              disclosed_reason: "聚焦车规专用模拟芯片与高性能信号链研发项目。",
              unverified_hypotheses: "车规料号向整车厂规模出货转化拐点。",
            },
            evidence_ids: ["E25_P85_COST_REVENUE"],
            next_steps: "追踪2026年车规认证通过数量。",
          },
        ],
        user_revisions: {
          THESIS_02: "分析师复核：毛利率下降0.52个百分点虽微弱突破阈值，但主要系测试中心投产初期固定折旧摊销及通用产品小幅降价所致，需在T2材料中密切追踪折旧消化后的拐点。",
        },
        follow_up_questions: [
          {
            id: "Q01",
            question_text: "关注后续车规专用模拟芯片在新客户（尤其是主流主机厂与 Tier-1）的导入放量节奏，以及江阴自建测试中心的利用率和降本效果。",
            status: "部分解决",
            created_in_version: "T0",
            resolved_in_version: null,
            answer_notes: "T1年报确认自建江阴测试中心已稳定运行，测试周期压缩约15%，但车规在Tier-1出货的具体客户规模尚未披露具体财务拆分，需在T2继续跟进。",
            updated_at: "2025-04-20T16:30:00Z",
          },
          {
            id: "Q02",
            question_text: "2025经营现金流同比下滑15.11%且现金利润比低于0.9倍，主要营运资本占用是在存货备库还是应收回款？后续季度能否修复回1.0倍以上？",
            status: "未解决",
            created_in_version: "T1",
            resolved_in_version: null,
            answer_notes: "",
            updated_at: "2025-04-20T16:30:00Z",
          },
        ],
        confirmed_at: "2025-04-20T16:30:00Z",
        confirmed_by: "买方分析师",
        summary: "完成 T1 年报全面更新：研发维持高强驱动（加强），收入恢复满足基线（保持），毛利率与现金流评级转向削弱，留存 2 项核心追踪疑问。",
      },
    ],
    open_questions: [
      {
        id: "Q01",
        question_text: "关注后续车规专用模拟芯片在新客户（尤其是主流主机厂与 Tier-1）的导入放量节奏，以及江阴自建测试中心的利用率和降本效果。",
        status: "部分解决",
        created_in_version: "T0",
        resolved_in_version: null,
        answer_notes: "T1年报确认自建江阴测试中心已稳定运行，测试周期压缩约15%，但车规在Tier-1出货的具体客户规模尚未披露具体财务拆分，需在T2继续跟进。",
        updated_at: "2025-04-20T16:30:00Z",
      },
      {
        id: "Q02",
        question_text: "2025经营现金流同比下滑15.11%且现金利润比低于0.9倍，主要营运资本占用是在存货备库还是应收回款？后续季度能否修复回1.0倍以上？",
        status: "未解决",
        created_in_version: "T1",
        resolved_in_version: null,
        answer_notes: "",
        updated_at: "2025-04-20T16:30:00Z",
      },
    ],
  };
}

// Sample T2 Material (Qualitative Operational Update without requiring full annual accounts!)
export const SAMPLE_T2_MATERIAL = {
  id: "DOC_T2_QUALITATIVE_BRIEF",
  title: "【虚构演示材料】圣邦股份 T2 运营跟踪情景",
  source_type: "qualitative_brief",
  disclosure_date: "",
  content: `【虚构演示材料，不是真实公告或管理层纪要；以下数字仅用于测试】
1. 【车规认证与客户突破】：公司多款高精度车规级专用模拟芯片（包含低噪声放大器、车身马达驱动、高压BMS监控芯片）顺利通过核心国内主机厂及国际 Tier-1 供应商的供货前 AEC-Q100 综合严格测试，本季度实现千万元级小批量出货并进入主流车型供应链目录。
2. 【江阴测试基地利用率与效益】：江阴测试中心二期产能如期投产，芯片综合良品率提升至 99.2%，自主定制测试程序使高可靠性芯片测试周转周期再压缩约 10%，自建测试产能在第一季度已承接公司超过 45% 的量产测试任务，测试单只成本同比下降约 12%，初步显现规模经济降本效应。
3. 【毛利率与定价走势】：虽然通用消费类料号价格依然平稳，但车规与高性能工业信号链产品占比稳步提升至 35% 以上，产品综合售价组合有所改善，初步企稳。
4. 【营运资本与现金流回款】：一季度销售商品收到的现金充沛，部分前期战略存货得到消化，应收账款周转保持平稳，经营现金流态势较去年同期大幅改善。`,
  evidence_snippets: [
    {
      id: "E26_Q1_AUTO_TIER1",
      page: 2,
      text: "高精度车规芯片顺利通过国内主机厂及国际 Tier-1 供货测试，本季度实现千万元级批量出货进入供应链目录。",
    },
    {
      id: "E26_Q1_JIANGYIN_YIELD",
      page: 3,
      text: "江阴测试中心芯片综合良率达 99.2%，测试单只成本同比下降约 12%，承接超过 45% 的量产测试任务。",
    },
    {
      id: "E26_Q1_CASH_IMPROVEMENT",
      page: 4,
      text: "销售商品收到的现金充沛，战略存货逐步消化，一季度经营现金流态势较去年同期显著改善。",
    },
  ],
};
