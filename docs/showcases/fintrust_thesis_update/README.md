# FinTrust Thesis Update P0 MVP 交付文档

## 1. 项目简介与背景
本工程为 **FinTrust Thesis Update P0 MVP**，针对标杆案例 **圣邦微电子（300661.SZ）** 从 **FY2024 至 FY2025** 的年报更新场景，提供端到端的买方投研观点更新与主张核验系统。

系统核心原则：
1. **硬指标 Decimal 计算**：拒绝大模型幻觉与浮点误差，使用高精度 Decimal 进行两期财报财务指标重算；
2. **AI 叙事语义受限比较**：单次受限 Prompt 批量对比业务模式、研发投入、供应链三组两期披露，提取真实战略差异；
3. **四条投资逻辑动态裁决**：按财报重算事实对比预设阈值，输出“保持/削弱/加强”的客观裁决；
4. **七条主张严格核验与拦截**：成功拦截草稿中“现金流同比增长 15.11%”（方向写反）与“综合毛利率 52.00%”（数值虚高），防范幻觉污染最终研报；
5. **证据链 100% 可穿透**：所有指标、观点与核验均具备年报原件文档名、报告期、真实页码与高亮底稿切片索引。

---

## 2. 工程目录结构

```
project/
├── agent/
│   ├── showcase_models.py           # Pydantic 核心数据模型 (CaseInput, MetricResult, ThesisResult, ClaimAuditResult 等)
│   ├── narrative_change_analyzer.py # 双期叙事语义比较模块 (支持 Gemini API 与结构化 Stub 容灾)
│   └── thesis_update_engine.py      # 财务重算引擎、观点规则判定、主张核验器与发布简报构建
├── data/
│   └── showcases/
│       └── sbg_fy2025/
│           ├── case_input.json      # 圣邦股份真实两期年报输入数据 (10 项财务事实、3 组叙事、4 项观点、7 条草稿主张、7 条证据)
│           └── assets/              # 年报原始底稿切片图证 (P13, P16, P85, P89, P141 等)
├── tests/
│   ├── fixtures/
│   │   └── alternate_case_input.json # 反事实回归测试用例 (证明规则非硬编码)
│   └── test_thesis_update_mvp.py     # T01 - T08 全量验收测试用例 (pytest)
├── Makefile                         # check, test, run, clean 自动化指令
src/
├── App.tsx                          # 买方研报更新工作台 (React + Tailwind + Lucide)
├── components/
│   └── EvidenceDrawer.tsx           # 证据链追溯抽屉 (页码原文、切片高亮、MD5 签名)
├── lib/
│   └── fintrustEngine.ts            # 前端 Decimal 计算引擎与数据桥接
└── types/
    └── fintrust.ts                  # 前端 TypeScript 类型定义
```

---

## 3. 验收测试执行情况 (pytest T01 - T08)

```bash
$ pytest project/tests/test_thesis_update_mvp.py -v
============================= test session starts ==============================
project/tests/test_thesis_update_mvp.py::test_t01_input_loading_and_assets PASSED [ 12%]
project/tests/test_thesis_update_mvp.py::test_t02_financial_metrics_recalculation PASSED [ 25%]
project/tests/test_thesis_update_mvp.py::test_t03_narrative_analyzer_structured_output PASSED [ 37%]
project/tests/test_thesis_update_mvp.py::test_t04_four_thesis_pillars_evaluated_correctly PASSED [ 50%]
project/tests/test_thesis_update_mvp.py::test_t05_seven_claims_audit_5_verified_2_mismatch PASSED [ 62%]
project/tests/test_thesis_update_mvp.py::test_t06_published_summary_excludes_hallucinations PASSED [ 75%]
project/tests/test_thesis_update_mvp.py::test_t07_counterfactual_alternate_input_switches_thesis PASSED [ 87%]
project/tests/test_thesis_update_mvp.py::test_t08_export_serialization PASSED [100%]
============================== 8 passed in 0.38s ===============================
```

---

## 4. 核心功能与交付结果

| 模块 | 核心功能 | 圣邦微电子 FY2025 交付结论 |
| :--- | :--- | :--- |
| **P1 收入增长** | 营业收入同比由负转正，检验景气复苏 | **保持 (MAINTAINED)**：营收 38.98 亿元，同比 +16.46%，满足 >=15% 门槛 |
| **P2 盈利质量** | 综合毛利率是否稳定或提升 | **削弱 (WEAKENED)**：毛利率 50.94%，同比微降 0.52 个百分点，面临价格竞争 |
| **P3 现金流质量**| 经营活动现金流是否与利润匹配 | **削弱 (WEAKENED)**：现金流 4.66 亿元，同比下降 15.11%，现金利润比 0.85 倍跌破警戒线 |
| **P4 研发投入** | 高研发壁垒与料号拓展护城河 | **加强 (STRENGTHENED)**：研发费用破 10.45 亿元 (+20.03%)，费用率 26.81% 稳居目标区间 |
| **主张核验** | 草稿事实性核查 C01–C07 | **5 条通过 / 2 条拦截**：成功拦截 C04 现金流方向写反，拦截 C05 毛利率虚高 52.00% |
| **证据穿透** | 全链路审计追溯 | 点击任意 `evidence_id` 查看真实页码、原文段落和底稿图证 |
| **报告导出** | 研报简报与结构化数据包 | 支持一键下载 `Markdown` 投研简报与机器可读 `JSON` 数据 |
