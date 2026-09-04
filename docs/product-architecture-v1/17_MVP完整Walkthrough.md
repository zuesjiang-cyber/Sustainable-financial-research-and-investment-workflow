# FinTrust MVP 完整 Walkthrough

## 0. 这款产品最终让用户完成什么

FinTrust 不是一次性总结研报的聊天工具。它维护的是一个公司的持续研究状态。

用户第一次上传研报，系统把研报拆成可以被未来财报验证的投资观点。用户确认这些观点后，再上传对应财报。系统从财报中寻找事实、完成必要计算，并逐条回答：

- 哪些观点已经得到验证；
- 哪些观点被削弱；
- 哪些观点因为时间未到或证据不足，仍然无法判断；
- 实际结果与原预期相差多少；
- 公司披露了什么原因；
- 哪些原因只是待验证假设；
- 下一期应该继续寻找什么证据。

用户确认本轮判断后，结果成为这个项目的新 Research Memory。下一期财报到来时，系统继续更新同一组观点，而不是重新生成一份互不相关的报告。

完整主流程是：

```text
上传研报
   ↓
解析 PDF
   ↓
Ling 提炼可验证观点
   ↓
用户确认观点，形成 T0
   ↓
用户上传财报
   ↓
解析财报并提取相关事实
   ↓
确定性财务计算 + Research Agent 核验
   ↓
用户确认本轮判断，形成 T1
   ↓
下一期财报到来
   ↓
沿用相同 thesisId 更新为 T2、T3……
```

## 1. 演示前需要准备什么

一次完整演示只需要两份真实资料：

1. 一份包含明确投资判断的 PDF 研报；
2. 一份能够验证其中部分观点的 PDF 财报。

建议研报至少包含三类观点中的两类：

- 数值预测，例如“2025 年毛利率达到 30%”；
- 方向判断，例如“经营现金流将持续改善”；
- 原因判断，例如“高毛利产品占比提升推动盈利能力恢复”。

建议财报至少包含：

- 合并利润表中的营业收入和营业成本；
- 合并现金流量表中的经营活动产生的现金流量净额；
- 管理层讨论与分析中的业绩变化原因。

用户需要知道财报的报告期间和披露日期。MVP 不自动寻找最新财报，财报由用户上传。

运行环境需要在服务端配置：

```text
FINTRUST_LLM_BASE_URL=https://openrouter.ai/api/v1
FINTRUST_LLM_MODEL=inclusionai/ling-3.0-flash-fin:free
FINTRUST_LLM_API_KEY=<只保存在本地环境变量中>
FINTRUST_DATA_DIR=./data-local
FINTRUST_UPLOAD_STORAGE_DIR=./uploads-local
```

密钥只由服务端读取，不进入浏览器、不写入研究状态。

## 2. 第一次进入产品

### 用户看到什么

首页只保留一个主任务：上传研报。

页面文案告诉用户：系统会先解析研报并提炼观点，之后由用户上传财报进行核验。页面不宣称自动寻找最新财报。

固定样例可以保留，但必须明确标记为 Demo。用户上传的真实文件不能进入固定样例逻辑。

### 系统内部状态

此时还没有研究项目，也没有 Research Memory。

```text
project = null
researchState = null
```

## 3. 第一步：上传真实研报

### 用户操作

用户点击上传区域或拖入一份 PDF。

### 前端请求

```http
POST /v1/uploads
Content-Type: multipart/form-data
Idempotency-Key: fintrust-<uuid>
```

表单字段：

```text
file=<真实 PDF 字节>
role=THESIS_SOURCE
```

### 后台执行

后台依次完成：

1. 检查文件非空、PDF 类型和 50 MiB 上限；
2. 保存原始 PDF；
3. 计算 SHA-256；
4. 调用 PDF Parser；
5. 生成 Parser Manifest；
6. 生成带页码和区域信息的 Evidence Spans；
7. 保存文档回执和解析结果；
8. 返回 `documentId`。

同一个 `Idempotency-Key` 和相同文件重复提交时返回同一个结果；同一个 Key 被用于不同文件时返回冲突。

### 返回结果

```json
{
  "uploadId": "document-uuid",
  "document": {
    "id": "document-uuid",
    "role": "THESIS_SOURCE",
    "fileName": "某公司深度研报.pdf",
    "mimeType": "application/pdf",
    "sha256": "...",
    "origin": "USER_UPLOAD"
  },
  "parseSummary": {
    "status": "COMPLETED",
    "pageCount": 32,
    "blockCount": 186,
    "tableCount": 9,
    "spanCount": 231
  }
}
```

### 用户看到什么

页面显示：

- 文件名；
- 页数；
- 提取片段数；
- 缩略后的 SHA-256；
- “开始提炼观点”按钮。

此时不能显示公司、观点或核验结论，因为这些步骤还没有发生。

## 4. 第二步：Ling 提炼投资观点

### 用户操作

用户点击“开始提炼观点”。

### 前端请求

```http
POST /v1/runs
Content-Type: application/json
```

```json
{
  "kind": "INITIAL_REPORT",
  "reportDocumentId": "document-uuid"
}
```

### Research Pipeline 执行

```text
读取 SourceDocument
   ↓
读取 Evidence Spans
   ↓
识别公司名称、股票代码和研报日期候选
   ↓
选择包含投资要点、盈利预测、风险因素的高价值片段
   ↓
调用 Ling-3.0-flash-Fin
   ↓
结构化校验模型输出
   ↓
生成 Initial Thesis Draft
```

Ling 的任务不是总结整篇研报，而是找出未来可以被事实验证的观点。

每条观点至少包含：

```ts
{
  thesisId: string;
  title: string;
  statement: string;
  type: "NUMERIC_FORECAST" | "DIRECTIONAL" | "CAUSAL" | "QUALITATIVE";
  criterion: {
    kind: "COMPARE" | "TREND" | "SEMANTIC";
    metric?: string;
    operator?: string;
    target?: string;
    period?: Period;
    scope: "CONSOLIDATED" | "PARENT" | "SEGMENT";
  };
  sourceEvidenceIds: string[];
  extractionIssues: string[];
}
```

模型输出必须经过结构校验。不能把无法解析的自然语言当作成功结果，也不能失败后替换成圣邦股份固定观点。

### 公司识别

系统给出公司候选，但用户拥有最终确认权。

```text
识别明确：预填公司和代码
识别冲突：展示候选，让用户选择
无法识别：要求用户输入公司名称和证券代码
```

公司识别失败不应生成一个错误公司的研究项目。

## 5. 第三步：用户确认观点，形成 T0

### 用户看到什么

页面按卡片展示 3–6 条观点。每条卡片只展示真正影响后续核验的内容：

- 观点标题；
- 当前表述；
- 观点类型；
- 验证指标或判断条件；
- 验证期间；
- 会计口径；
- 系统仍不确定的地方。

用户可以：

- 修改观点表述；
- 调整目标值或验证期间；
- 删除无关观点；
- 补充系统漏掉的观点；
- 确认公司；
- 保存初始研究状态。

原文引用和原页查看在本 MVP 中不展示，但后台继续保留 `sourceEvidenceIds`，以后可以直接增加查看器。

### 确认请求

```http
POST /v1/runs/{runId}/draft/confirm
```

```json
{
  "draftRevision": 1,
  "company": {
    "name": "某公司",
    "securityCode": "000000"
  },
  "theses": [
    {
      "thesisId": "stable-thesis-uuid",
      "title": "综合毛利率恢复至30%以上",
      "statement": "预计2025年综合毛利率达到30%以上",
      "criterion": {
        "kind": "COMPARE",
        "metric": "gross_margin",
        "op": "GTE",
        "target": "0.30",
        "period": {
          "start": "2025-01-01",
          "end": "2025-12-31",
          "basis": "YEAR"
        },
        "scope": "CONSOLIDATED"
      }
    }
  ]
}
```

### T0 保存内容

```text
Project
├── Company
├── Thesis 1
├── Thesis 2
├── Thesis 3
├── Source Document: 研报
├── Open Questions
└── Research State T0
```

T0 表示“用户已经确认要持续跟踪什么”，还不代表这些观点已经得到验证。

## 6. 第四步：上传用于核验的财报

### 用户操作

用户点击“上传财报”，选择 PDF，并填写：

- 报告类型：季报、半年报或年报；
- 报告期末日；
- 披露日期；
- 是否为合并口径，默认选择合并口径。

### 上传请求

仍然使用同一上传接口：

```http
POST /v1/uploads
```

```text
file=<财报 PDF>
role=FINANCIAL_FILING
projectId=<当前项目 ID>
```

财报上传完成后，用户点击“开始核验”。

```http
POST /v1/projects/{projectId}/filing-runs
```

```json
{
  "filingDocumentId": "filing-document-uuid",
  "period": {
    "start": "2025-01-01",
    "end": "2025-09-30",
    "basis": "YTD"
  },
  "publishedAt": "2025-10-28",
  "scope": "CONSOLIDATED"
}
```

用户填写的期间信息优先于模型猜测。模型可以发现矛盾，但不能悄悄覆盖用户输入。

## 7. 第五步：财报事实提取

系统不需要把整份财报转换成一个庞大的通用数据库。MVP 只提取当前观点实际需要的事实。

例如当前观点需要验证：

```text
毛利率达到 30%
经营现金流改善
收入同比增长 20%
```

系统生成事实需求：

```text
revenue
cost_of_revenue
operating_cash_flow
prior_period_revenue
```

### 提取过程

```text
读取财报 Evidence Spans
   ↓
Ling 定位利润表、现金流量表和管理层解释候选片段
   ↓
代码标准化字段、单位、期间和口径
   ↓
保存 Fact
   ↓
Decimal 执行财务计算
```

每条 Fact 必须绑定：

```ts
{
  metric: string;
  value: string;
  unit: "CURRENCY" | "RATIO" | "COUNT";
  period: Period;
  scope: "CONSOLIDATED" | "PARENT" | "SEGMENT";
  documentId: string;
  evidenceIds: string[];
}
```

### 确定性计算

毛利率由代码计算：

```text
gross_margin = (revenue - cost_of_revenue) / revenue
```

同比增长由代码计算：

```text
yoy_growth = (current_value - prior_value) / prior_value
```

模型不负责心算，也不能在缺少原始事实时生成一个看起来合理的数字。

## 8. 第六步：Research Agent 核验观点

MVP 使用一个 Research Agent，不需要多个相互对话的 Agent。

这个 Agent 接收：

```text
上一版 Research State
+ 当前 Thesis
+ 当前财报 Facts
+ 相关 Evidence Spans
+ 确定性 Calculations
```

Agent 可以调用的能力是：

```text
find_facts        查找某指标事实
search_evidence   搜索财报相关段落
read_evidence     读取候选证据全文
calculate_metric  请求确定性计算
submit_assessment 提交结构化判断
```

最终每条观点返回：

```ts
{
  status: "SUPPORTED" | "PARTIALLY_SUPPORTED" | "WEAKENED" | "UNRESOLVED";
  maturity: "NOT_DUE" | "IN_PROGRESS" | "DUE";
  summary: string;
  observedGap: {
    text: string;
    factIds: string[];
    calculationIds: string[];
    evidenceIds: string[];
  } | null;
  disclosedCauses: CitedStatement[];
  hypotheses: {
    text: string;
    supportingEvidenceIds: string[];
    missingEvidence: string[];
  }[];
  nextQuestions: ResearchQuestion[];
  limitations: string[];
}
```

状态判断遵循三个简单原则：

1. 期间尚未结束时，阶段性达标只能叫“部分支持”，不能提前宣布全年观点得到验证；
2. 缺少对应事实时必须是“未解决”，不能用行业常识补数字；
3. 公司明确披露的原因和 Agent 推测的原因必须分开显示。

## 9. 第七步：用户审阅核验草稿

### 页面结构

结果页顶部展示本轮概况：

```text
支持 2 条｜削弱 1 条｜未解决 2 条
```

每张观点卡片固定回答五个问题：

1. 原观点是什么；
2. 当前财报披露了什么；
3. 实际值与目标相差多少；
4. 为什么出现这个结果；
5. 下一步还要研究什么。

### 用户可以做什么

- 接受系统判断；
- 修改观点当前表述；
- 修正验证条件；
- 把系统假设标记为不认可；
- 增加自己的研究判断；
- 编辑下一步问题；
- 确认保存本轮更新。

系统生成的是 Draft。只有用户点击确认，Draft 才能进入 Research Memory。

## 10. 第八步：保存 T1 Research Memory

### 确认请求

```http
POST /v1/runs/{runId}/draft/confirm
```

确认时保存：

- 本轮所有 Thesis Assessment；
- 用户修改后的观点；
- 用户判断；
- 新增和已解决的问题；
- 使用的研报、财报、Fact、Calculation 和 Evidence ID；
- 本轮状态与上一版状态的 Diff。

### T1 结构

```text
Research State T1
├── Thesis A
│   ├── 当前观点
│   ├── 状态：PARTIALLY_SUPPORTED
│   ├── 本轮事实与计算
│   ├── 已披露原因
│   ├── 待验证假设
│   └── 下一步问题
├── Thesis B
├── Thesis C
├── 用户修正
├── Source Manifest
└── 与 T0 的变化
```

保存成功后，项目首页展示的是 T1 当前状态，而不是本轮模型生成的临时文本。

## 11. 第九步：下一期财报继续研究

下一期财报到来时，用户进入同一个项目并上传新财报。

系统执行：

```text
读取 T1
   ↓
读取同一组稳定 thesisId
   ↓
加载用户在 T1 的修正
   ↓
只解析新增财报
   ↓
提取新事实并重新核验
   ↓
生成 T1 → T2 Diff
```

页面要明确告诉用户：

- 哪些观点状态发生变化；
- 哪些观点没有新增证据；
- 哪些旧问题被本期财报回答；
- 哪些问题仍未解决；
- 本轮新增了哪些下一步问题。

同一观点在 T0、T1、T2 中保持相同 `thesisId`。观点文字可以产生新的 revision，但不能因为重新调用模型而变成一个毫无关联的新观点。

## 12. 用户可以查看的项目状态

项目页只需要四块信息：

### 当前结论

展示每条观点当前状态和一句话结论。

### 本轮变化

展示最新财报让哪些观点变强、变弱或仍然未解决。

### 下一步问题

展示接下来真正需要找的数据、看哪张表或关注哪个经营指标。

### 历史版本

展示 T0、T1、T2 的确认时间、使用资料和状态变化。

对应读取接口：

```http
GET /v1/projects/{projectId}/state
GET /v1/projects/{projectId}/history
GET /v1/runs/{runId}
```

## 13. 核心数据如何关联

```text
Project
├── Documents
│   ├── Thesis Source PDF
│   └── Financial Filing PDFs
├── Evidence Spans
├── Theses
│   └── Thesis Revisions
├── Facts
├── Calculations
├── Runs
│   └── Drafts
├── User Corrections
└── Research States
    ├── T0
    ├── T1
    └── T2
```

最重要的稳定关系是：

```text
Project → stable thesisId → revisions → assessments over time
```

文档和模型输出都只是输入；Research State 才是产品长期维护的核心资产。

## 14. 模型与代码的职责边界

| 工作 | Ling | 确定性代码 |
|---|---:|---:|
| 理解研报语义 | 是 | 否 |
| 提炼投资观点 | 是 | 校验结构 |
| 定位财报候选表格和原因段落 | 是 | 过滤与绑定 |
| 单位和期间标准化 | 提供候选 | 最终校验 |
| 毛利率、增速和差额计算 | 否 | 是 |
| 判断证据是否足以支持观点 | 是 | 执行硬规则 |
| 生成原因解释和下一步问题 | 是 | 校验引用完整性 |
| 保存历史版本 | 否 | 是 |

这保证了产品既有 AI 对语义的理解能力，又不会把财务数字交给模型自由生成。

## 15. 页面状态与错误反馈

每一步只展示真实发生的状态：

```text
UPLOADING_REPORT
PARSING_REPORT
EXTRACTING_THESES
AWAITING_THESIS_REVIEW
UPLOADING_FILING
EXTRACTING_FACTS
VERIFYING_THESES
AWAITING_ASSESSMENT_REVIEW
SAVING_STATE
COMPLETED
FAILED
```

失败信息应该告诉用户下一步能做什么：

- PDF 无法解析：请换用文本型 PDF 或重新导出；
- 公司无法确认：请手动填写公司名称和证券代码；
- Ling 返回格式错误：允许重新提炼，不生成固定结果；
- 财报缺少所需指标：把对应观点标记为未解决；
- 保存冲突：刷新最新状态后重新确认。

## 16. 五分钟现场演示脚本

### 第 1 分钟：上传研报

上传一份此前没有运行过的真实研报。展示真实文件名、页数、片段数和 SHA-256。

### 第 2 分钟：自动提炼观点

点击“开始提炼观点”。展示 Ling 提炼出的 3–6 条观点，现场修改其中一条验证条件并确认，形成 T0。

### 第 3 分钟：上传财报

上传对应公司的一份真实财报，填写期间和披露日期，开始核验。

### 第 4 分钟：展示核验结果

选择一条数值观点，展示实际值、目标值、差额和计算过程；再选择一条未解决观点，展示缺少什么证据。

### 第 5 分钟：保存并展示 Memory

修改一条下一步问题，确认保存 T1。返回项目页，展示 T0 → T1 的变化。最后说明：下一期财报会继续更新相同观点，而不是重新生成一份报告。

## 17. 当前代码与完整 Walkthrough 的对应关系

以下状态用于区分“已经有代码”与“成品应该具备”，不代表已经经过运行验收。

| Walkthrough 环节 | 当前代码状态 | 主要代码位置 |
|---|---|---|
| Ling API 适配 | 已有真实调用适配 | `src/server/researchModel.ts` |
| 研报 PDF 上传 | 已编写上传与本地保存代码 | `src/server/documents/uploadService.ts` |
| PDF 解析 | 已有 Parser Client 和 Python Parser | `src/server/documents/pdfParser.ts`、`python/document_parser/` |
| 上传页面 | 已改为传输真实 File 并显示解析回执 | `src/components/research/ReportUploadView.tsx` |
| 观点提炼 | 有独立 Extractor 骨架，尚需接入真实上传主流程 | `src/server/documents/thesisExtractor.ts` |
| 财报事实提取 | 有少量指标提取骨架，尚需按观点驱动并接入主流程 | `src/server/facts/factExtractor.ts` |
| 观点核验 | 有判断类骨架，但固定解释必须被真实证据流程替换 | `src/server/agent/researchAgent.ts` |
| Research Memory | 有状态和 Diff 模块，尚需接入本地运行时与 HTTP 接口 | `src/server/memory/` |
| 三步真实前端 | 上传部分已开始，观点确认、财报上传和状态页尚需接线 | `src/components/research/` |

因此，当前最接近完成的是“上传并解析 PDF”；完整 Walkthrough 中从“开始提炼观点”到“T2 持续更新”的代码仍需接通后才能称为可运行 MVP。

## 18. 本 MVP 的完成定义

只有当一个用户能够不修改代码地完成下面这条路径，MVP 才算完成：

```text
上传此前未运行过的研报
→ 得到真实提炼的观点
→ 人工确认形成 T0
→ 上传用户提供的财报
→ 得到真实事实和逐条核验
→ 人工确认形成 T1
→ 再上传一期财报
→ 相同观点更新形成 T2
```

本轮明确不要求：

- 自动从交易所寻找最新财报；
- 在页面中打开 PDF 原页和高亮引用；
- 多人协作权限；
- 云端对象存储；
- 多 Agent 协作；
- 自动交易或投资建议。

这些能力不影响 MVP 展示核心价值：把一次性研报阅读变成可验证、可更新、可积累的持续投研状态。
