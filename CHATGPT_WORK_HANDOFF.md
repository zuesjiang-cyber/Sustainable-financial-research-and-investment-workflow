# FinTrust ChatGPT Work 云端开发交接

## 究极目标

FinTrust 要针对一个公司持续维护可复用的投研状态：用户上传研报，系统自动拆成可验证的投资观点；用户上传新财报后，系统逐条判断哪些观点被验证、哪些被削弱、还有什么差距以及原因是什么；用户确认后，将观点、事实、判断、修正、未决问题和下一步研究沉淀为 Research Memory。下一期财报到来时，系统沿用相同 thesis IDs 继续更新，而不是重新生成一份无关报告。

## 已确认的产品与技术决策

- 产品范围是个人可完成、可真实演示的 P0 MVP。
- 核心模型使用 `Ling-3.0-flash-Fin`，当前路由为 `inclusionai/ling-3.0-flash-fin:free`。
- 模型只负责研报语义理解、观点提炼、披露原因理解和下一步问题生成。
- 财务数字、单位、期间、毛利率、增速、差额和状态版本由确定性代码处理。
- 研报提炼尽量一次模型调用；单期财报的语义解释尽量把全部观点合并为一次模型调用。
- 财报由用户上传；不开发自动寻找最新财报。
- 暂不开发 PDF 原页查看器、复杂权限、云对象存储、多 Agent 和自动交易。
- 本地 MVP 使用当前 SQLite/sql.js 数据路径，不让 PostgreSQL 成为运行前提。
- 固定圣邦/汇顶内容只能作为明确标识的 Demo，不能进入真实上传路径。

## 完整用户主链路

```text
上传真实研报 PDF
→ 保存与解析
→ Ling 提炼观点
→ 用户编辑并确认，形成 T0
→ 用户上传对应财报并填写期间
→ 提取相关事实并确定性计算
→ 核验支持/削弱/未解决、差距与原因
→ 用户确认形成 T1
→ 上传下一期财报
→ 沿用相同 thesis IDs 形成 T2/T3
```

## 优先阅读

1. `docs/product-architecture-v1/17_MVP完整Walkthrough.md`
2. `src/server/v1/v1Router.ts`
3. `src/server/v1/v1Store.ts`
4. `src/server/documents/uploadService.ts`
5. `src/server/documents/thesisExtractor.ts`
6. `src/server/facts/factExtractor.ts`
7. `src/server/agent/researchAgent.ts`
8. `src/server/researchModel.ts`
9. `src/shared/domain.ts`
10. `src/components/research/ReportFirstContainer.tsx`
11. `src/components/research/ThesisReviewView.tsx`
12. `src/components/research/UploadFilingModal.tsx`
13. `src/components/research/ReportResearchView.tsx`

## 当前代码状态

- Ling 模型适配和真实连接检查代码已经存在。
- 真实 PDF 上传、哈希、Parser Manifest、Evidence Spans 和上传回执代码已经存在。
- `v1Store`、`v1Router`、观点确认页面和财报上传页面已经开始编写，但需要以当前文件内容为准继续审计和收口。
- 独立的 thesis extractor、fact extractor、research agent、memory/state 模块已经存在，但此前多数没有接到真实 HTTP 和前端主流程。
- 工作区包含大量未提交改动。必须保留，不得 reset、checkout 或覆盖用户文件。
- 用户此前要求不要增加多余测试与边界体系；先完成真实主链路，再做最小验证。

## 云端开发要求

1. 先读取完整工作区和 walkthrough，再决定改动；不要重新发明第三套数据层或分析引擎。
2. 复用 `v1Store`、`v1Router`、上传服务、Ling transport 和现有 React 页面。
3. 完成从真实研报到 T0、从财报到 T1、从下一期财报到 T2 的全部接线。
4. 模型调用要经济：输入先由代码筛选和截断，避免把整本 PDF 重复发送；一次任务尽量批量处理多条观点。
5. 不得硬编码公司、财报数值、原因和核验结论；事实不足就返回 `UNRESOLVED`。
6. 同一观点跨期保持稳定 `thesisId`；用户修正必须进入下一轮上下文。
7. 正常路径的页面只展示真实状态，不使用定时器伪造处理进度。
8. 不提交任何 `.env`、API Key、本地数据库、上传的私人 PDF 或运行产物。

## 交付标准

代码完成后，用户应当可以不修改代码地完成：

```text
真实研报 → 真实观点 → T0 → 用户财报 → 真实核验 → T1 → 下一期财报 → T2
```

交付汇报需要列出实际修改文件、完整用户路径、模型调用次数设计和仍未覆盖项。不得把设计文件、固定 Demo 或未执行的检查写成已完成能力。

