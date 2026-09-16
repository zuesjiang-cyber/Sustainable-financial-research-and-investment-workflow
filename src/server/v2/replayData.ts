import type { AnalysisRecord, CompanyIdentity, EvidenceRecord, ResearchEvent, UserStanceVersion } from "../../shared/v2Domain";

export interface ReplayPack {
  id: string;
  projectId: string;
  asOf: string;
  summary: string;
  company: CompanyIdentity;
  stance: UserStanceVersion;
  evidence: EvidenceRecord[];
  events: ResearchEvent[];
  analyses: AnalysisRecord[];
}

function packShengbang(): ReplayPack {
  const projectId = "11111111-1111-4111-8111-111111111111";
  const stance: UserStanceVersion = {
    id: "11111111-1111-4111-8111-111111111201",
    version: 1,
    rawText: "我长期看好圣邦股份模拟芯片竞争力，但不设置具体毛利率阈值。",
    summary: "长期看好模拟芯片竞争力",
    reasons: ["模拟芯片竞争力"],
    coreReasons: ["模拟芯片竞争力"],
    auxiliaryReasons: [],
    thresholds: [],
    horizon: "长期",
    createdAt: "2025-06-01T00:00:00.000Z",
    supersedesId: null,
    changeReason: null,
  };
  const evidence: EvidenceRecord[] = [
    {
      id: "11111111-1111-4111-8111-111111111301",
      projectId,
      sourceKind: "OFFICIAL_DISCLOSURE",
      title: "2025年第三季度报告",
      url: "http://static.cninfo.com.cn/finalpage/2025-10-28/1223902341.PDF",
      documentId: null,
      quote: "圣邦股份2025年第三季度综合毛利率为28.4%。",
      occurredAt: "2025-09-30",
      disclosedAt: "2025-10-28",
      discoveredAt: "2025-10-28T08:00:00.000Z",
      originKey: "cninfo-300661-2025-q3",
      parentOriginKey: null,
      companyName: "圣邦股份",
      securityCode: "300661",
      page: 13,
      bbox: [0.12, 0.22, 0.88, 0.31],
      reprintOf: null,
      quality: "NATIVE",
      rawHash: "replay-sbg-q3",
    },
  ];
  const events: ResearchEvent[] = [
    {
      id: "11111111-1111-4111-8111-111111111401",
      projectId,
      description: "2025年三季报披露综合毛利率 28.4%",
      stage: "RECOGNIZED",
      proposition: "公司已披露2025年前三季度综合毛利率为28.4%",
      occurredAt: "2025-09-30",
      disclosedAt: "2025-10-28",
      discoveredAt: "2025-10-28T08:00:00.000Z",
      verification: "VERIFIED",
      evidenceIds: [evidence[0].id],
      originKey: "cninfo-300661-2025-q3",
      correctionOf: null,
      checkScope: ["company_identity", "quote_stage_alignment", "official_source"],
      limitations: [],
      attributedSpeaker: "圣邦股份",
    },
  ];
  const analyses: AnalysisRecord[] = [
    {
      id: "11111111-1111-4111-8111-111111111501",
      projectId,
      runId: "11111111-1111-4111-8111-111111111601",
      stanceVersion: 1,
      eventIds: [events[0].id],
      evidenceIds: [evidence[0].id],
      text: "三季报毛利率 28.4% 可核验，但不构成对“竞争力”立场的定量推翻，因为用户未给出阈值。",
      assumptionsUnmet: [],
      importance: "MEDIUM",
      supportsStance: "NEUTRAL",
      createdAt: "2025-10-28T08:10:00.000Z",
    },
  ];
  return {
    id: "sbg-fy2025-q3",
    projectId,
    asOf: "2025-10-28",
    summary: "回放圣邦股份三季报对“长期竞争力”立场的核验，不把毛利率缺口写成用户阈值。",
    company: { name: "圣邦股份", securityCode: "300661", exchange: "SZSE" },
    stance,
    evidence,
    events,
    analyses,
  };
}

function packMoutai(): ReplayPack {
  const projectId = "22222222-2222-4222-8222-222222222222";
  const stance: UserStanceVersion = {
    id: "22222222-2222-4222-8222-222222222201",
    version: 1,
    rawText: "我认为茅台批价波动会影响短期情绪，但不改变长期品牌价值判断。",
    summary: "批价波动不影响长期品牌价值判断",
    reasons: ["长期品牌价值"],
    coreReasons: ["长期品牌价值"],
    auxiliaryReasons: ["批价波动影响短期情绪"],
    thresholds: [],
    horizon: "长期",
    createdAt: "2025-01-10T00:00:00.000Z",
    supersedesId: null,
    changeReason: null,
  };
  const evidence: EvidenceRecord[] = [
    {
      id: "22222222-2222-4222-8222-222222222301",
      projectId,
      sourceKind: "OFFICIAL_DISCLOSURE",
      title: "2024年年度报告",
      url: "https://www.cninfo.com.cn/",
      documentId: null,
      quote: "贵州茅台2024年营业总收入1708.99亿元，同比增长15.66%。",
      occurredAt: "2024-12-31",
      disclosedAt: "2025-04-03",
      discoveredAt: "2025-04-03T08:00:00.000Z",
      originKey: "cninfo-600519-2024-annual",
      parentOriginKey: null,
      companyName: "贵州茅台",
      securityCode: "600519",
      page: 8,
      bbox: [0.1, 0.2, 0.9, 0.28],
      reprintOf: null,
      quality: "NATIVE",
      rawHash: "replay-mt-2024",
    },
  ];
  const events: ResearchEvent[] = [
    {
      id: "22222222-2222-4222-8222-222222222401",
      projectId,
      description: "2024年年报披露营业总收入 1708.99 亿元",
      stage: "RECOGNIZED",
      proposition: "公司已披露2024年营业总收入1708.99亿元",
      occurredAt: "2024-12-31",
      disclosedAt: "2025-04-03",
      discoveredAt: "2025-04-03T08:00:00.000Z",
      verification: "VERIFIED",
      evidenceIds: [evidence[0].id],
      originKey: "cninfo-600519-2024-annual",
      correctionOf: null,
      checkScope: ["company_identity", "quote_stage_alignment", "official_source"],
      limitations: [],
      attributedSpeaker: "贵州茅台",
    },
  ];
  return {
    id: "moutai-2024-annual",
    projectId,
    asOf: "2025-04-03",
    summary: "回放茅台年报收入确认，与批价传闻隔离；转载不增加证据份数。",
    company: { name: "贵州茅台", securityCode: "600519", exchange: "SSE" },
    stance,
    evidence,
    events,
    analyses: [{
      id: "22222222-2222-4222-8222-222222222501",
      projectId,
      runId: "22222222-2222-4222-8222-222222222601",
      stanceVersion: 1,
      eventIds: [events[0].id],
      evidenceIds: [evidence[0].id],
      text: "年报收入已核实。批价传闻若无官方原文，不得进入事实评估。",
      assumptionsUnmet: [],
      importance: "MEDIUM",
      supportsStance: "SUPPORTS",
      createdAt: "2025-04-03T08:20:00.000Z",
    }],
  };
}

function packGoodix(): ReplayPack {
  const projectId = "33333333-3333-4333-8333-333333333333";
  const stance: UserStanceVersion = {
    id: "33333333-3333-4333-8333-333333333201",
    version: 1,
    rawText: "我看好汇顶科技指纹与触控业务复苏，观察周期到下一年度报告。",
    summary: "看好指纹与触控业务复苏",
    reasons: ["指纹与触控业务复苏"],
    coreReasons: ["指纹与触控业务复苏"],
    auxiliaryReasons: [],
    thresholds: [],
    horizon: "至下一年度报告",
    createdAt: "2025-03-01T00:00:00.000Z",
    supersedesId: null,
    changeReason: null,
  };
  return {
    id: "goodix-correction",
    projectId,
    asOf: "2025-04-18",
    summary: "回放汇顶科技年报及更正传播：已通知事实被更正后必须同步提醒。",
    company: { name: "汇顶科技", securityCode: "603160", exchange: "SSE" },
    stance,
    evidence: [{
      id: "33333333-3333-4333-8333-333333333301",
      projectId,
      sourceKind: "OFFICIAL_DISCLOSURE",
      title: "2024年年度报告",
      url: "http://static.sse.com.cn/",
      documentId: null,
      quote: "汇顶科技披露2024年年度报告。",
      occurredAt: "2024-12-31",
      disclosedAt: "2025-04-18",
      discoveredAt: "2025-04-18T08:00:00.000Z",
      originKey: "sse-603160-2024-annual",
      parentOriginKey: null,
      companyName: "汇顶科技",
      securityCode: "603160",
      page: 1,
      bbox: [0.08, 0.08, 0.92, 0.2],
      reprintOf: null,
      quality: "NATIVE",
      rawHash: "replay-goodix-2024",
    }],
    events: [{
      id: "33333333-3333-4333-8333-333333333401",
      projectId,
      description: "2024年年度报告披露",
      stage: "ANNOUNCED",
      proposition: "公司公布2024年年度报告",
      occurredAt: "2024-12-31",
      disclosedAt: "2025-04-18",
      discoveredAt: "2025-04-18T08:00:00.000Z",
      verification: "VERIFIED",
      evidenceIds: ["33333333-3333-4333-8333-333333333301"],
      originKey: "sse-603160-2024-annual",
      correctionOf: null,
      checkScope: ["company_identity", "official_source"],
      limitations: [],
      attributedSpeaker: "汇顶科技",
    }],
    analyses: [{
      id: "33333333-3333-4333-8333-333333333501",
      projectId,
      runId: "33333333-3333-4333-8333-333333333601",
      stanceVersion: 1,
      eventIds: ["33333333-3333-4333-8333-333333333401"],
      evidenceIds: ["33333333-3333-4333-8333-333333333301"],
      text: "年报已披露。若后续出现更正公告，将沿依赖关系修正分析并发送更正提醒。",
      assumptionsUnmet: [],
      importance: "MEDIUM",
      supportsStance: "NEUTRAL",
      createdAt: "2025-04-18T08:15:00.000Z",
    }],
  };
}

export function makeReplayPacks(): ReplayPack[] {
  return [packShengbang(), packMoutai(), packGoodix()];
}
