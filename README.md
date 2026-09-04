# FinTrust

> 把一次性研报，变成会随财报进化的研究记忆。

FinTrust 是一款面向投研工作者的 AI 研究工作台。它记录研究员过去相信什么，用新财报检验这些判断，解释结论发生变化的原因，并把用户确认后的结果写入 Research Memory。

一份研报不再停留在 PDF 里。每条观点都会获得核验条件、证据位置、状态变化和下一步问题。下一期财报到来时，研究从旧状态继续，而不是从空白对话重新开始。

## 核心价值

- **观点有记忆**：研究结论形成版本化 Markdown Memory。
- **证据有来源**：财报事实绑定页码、坐标与原文片段。
- **变化有解释**：系统展示旧判断、新事实、差距与原因。
- **研究有方向**：未解决问题进入下一轮研究清单。
- **用户有最终决定权**：模型生成草稿，研究员确认状态。

## 产品工作流

```text
研报 PDF
  ↓
Ling 提取投资观点
  ↓
用户确认 T0
  ↓
财报 PDF
  ↓
Ling 提取事实并核验观点
  ↓
用户确认 T1 / T2
  ↓
Markdown Research Memory
```

这条链路回答一个投研问题：

> 我过去的判断是什么？新财报验证了什么？哪些判断出现偏差？偏差来自哪里？下一轮需要研究什么？

## 产品界面

首页包含两个入口：

| 入口 | 内容 | 数据行为 |
| --- | --- | --- |
| 核验 Demo | 圣邦股份研究案例，六条观点，四种状态 | 只读展示，不创建项目，不写入 Memory |
| 研报上传 | PDF 上传、解析、观点提取 | 创建研究项目，生成 T0 草稿 |

Demo 把产品价值放在首屏：

- 本轮研究结论
- 四类观点状态
- T0 旧判断
- T1 财报事实
- T2 研究状态
- 偏差与原因
- 下一轮问题

## 观点状态

| 状态 | 含义 |
| --- | --- |
| `SUPPORTED` | 财报证据满足原观点的核验条件 |
| `PARTIALLY_SUPPORTED` | 观点方向成立，阈值或范围存在偏差 |
| `WEAKENED` | 财报事实削弱原观点的可信度 |
| `UNRESOLVED` | 财报缺少结论所需证据 |

FinTrust 不把所有观点包装成“已验证”。证据不足的观点保留为待跟踪状态。负面事实会降低观点信心。研究员可以修改模型结论。

## P0 功能

| 模块 | 输入 | 输出 |
| --- | --- | --- |
| 研报上传 | 券商研报 PDF | 文件记录、SHA-256、解析结果、证据坐标 |
| 观点提取 | 研报文本与表格 | 观点、观点类型、核验条件、研究问题 |
| T0 确认 | Ling 草稿、用户修改 | 项目基线、Markdown Memory |
| 财报上传 | 公司财报 PDF | 财报记录、文本片段、证据坐标 |
| 财报核验 | T0 状态、财报事实 | 状态判断、差距、原因、下一步问题 |
| T1 / T2 确认 | 核验草稿、用户修改 | 新研究版本、历史记录、Memory 更新 |
| 项目恢复 | Markdown Memory、运行数据 | 项目状态、研究历史、未决问题 |

## 人、模型与代码

FinTrust 不用复杂的多 Agent 叙事掩盖产品逻辑。系统采用一条清晰的研究链路。

| 参与者 | 职责 |
| --- | --- |
| Ling-3.0-Flash-Fin | 研报观点提取、财报事实对齐、原因解释、问题生成 |
| TypeScript 服务 | 文件校验、状态机、版本控制、数值计算、API 契约 |
| PDF 解析器 | 页面文本、表格、页码、坐标、文本哈希 |
| 用户 | 观点选择、结论修改、版本确认 |
| Markdown Memory | 研究状态、用户修正、研究问题、版本信息 |

核心模型：

```text
inclusionai/ling-3.0-flash-fin:free
```

模型接口采用 OpenAI-compatible 协议。模型服务采用 OpenRouter。

## 技术栈

| 层级 | 技术 |
| --- | --- |
| Web | React 19、Vite 6、TypeScript |
| API | Express 4 |
| 业务模型 | Ling-3.0-Flash-Fin |
| 模型网关 | OpenRouter |
| 运行数据 | SQLite / sql.js |
| 研究记忆 | Markdown 文件 |
| PDF 解析 | Python 3、pdfplumber |
| 数据校验 | Zod |
| 数值计算 | Decimal.js |

## 项目结构

```text
.
├── src/
│   ├── components/research/      # V1 研究界面
│   ├── data/demoResearch.ts      # 首页只读 Demo
│   ├── server/
│   │   ├── documents/            # PDF 上传、解析、观点提取
│   │   ├── memory/               # Research Memory 与状态编译
│   │   ├── agent/                # Research Agent 编排
│   │   ├── facts/                # 财报事实与指标定义
│   │   └── v1/                   # V1 API 与状态存储
│   └── shared/domain.ts          # 领域类型
├── python/document_parser/       # PDF 解析器
├── research-memory/              # 研究记忆，Git 忽略
├── uploads-local/                # 上传文件，Git 忽略
├── data-local/                   # 运行数据，Git 忽略
├── tests/                        # Node 测试
├── docs/product-architecture-v1/ # 产品与技术设计
├── server.ts                     # 服务入口
└── DESIGN.md                     # 界面设计规范
```

## 环境要求

- Node.js 22+
- npm
- Python 3
- `pdfplumber`
- OpenRouter API Key

## 安装

```bash
npm ci
python3 -m venv .venv
./.venv/bin/pip install pdfplumber
cp .env.example .env
```

填写 `.env`：

```dotenv
HOST=127.0.0.1
PORT=3000
FINTRUST_DATA_DIR=./data-local
FINTRUST_MEMORY_DIR=./research-memory
FINTRUST_UPLOAD_STORAGE_DIR=./uploads-local
FINTRUST_LLM_BASE_URL=https://openrouter.ai/api/v1
FINTRUST_LLM_MODEL=inclusionai/ling-3.0-flash-fin:free
FINTRUST_LLM_API_KEY=YOUR_OPENROUTER_KEY
FINTRUST_MAX_MODEL_CALLS=2
FINTRUST_MAX_OUTPUT_TOKENS=24000
FINTRUST_MODEL_TIMEOUT_MS=45000
```

## 启动

开发服务：

```bash
npm run dev
```

访问地址：<http://127.0.0.1:3000>

生产服务：

```bash
npm run build
NODE_ENV=production npm start
```

## 模型检查

文本响应：

```bash
npm run model:check
```

Tool Calling：

```bash
npm run model:check -- --tools
```

检查结果包含：模型标识、文本响应、Tool Calling、Token 用量和请求耗时。

## 代码检查

```bash
npm run lint
npm test
npm run build
```

## 本地数据

| 路径 | 内容 | Git 状态 |
| --- | --- | --- |
| `research-memory/` | 项目 Markdown Memory | 忽略 |
| `uploads-local/` | PDF、manifest、文本片段 | 忽略 |
| `data-local/` | SQLite 数据与运行草稿 | 忽略 |
| `.env` | API Key 与运行配置 | 忽略 |

研究资料留在使用者的文件区。Git 仓库不保存 API Key、上传文件和个人 Research Memory。

## MVP 范围

MVP 包含：研报上传、观点提取、人工确认、财报上传、事实核验、观点变化、Markdown Memory、历史版本。

MVP 不包含：财报抓取、行情交易、组合管理、多 Agent 展示、向量数据库。

## 项目文档

- [产品架构索引](docs/product-architecture-v1/00_README.md)
- [完整产品 Walkthrough](docs/product-architecture-v1/17_MVP完整Walkthrough.md)
- [产品定义与交互](docs/product-architecture-v1/01_产品定义与交互.md)
- [总体架构与技术选型](docs/product-architecture-v1/02_总体架构与技术选型.md)
- [Research Memory 设计](docs/product-architecture-v1/07_研究状态与Memory.md)
- [API 契约](docs/product-architecture-v1/09_API与事件契约.md)
- [验收与评测](docs/product-architecture-v1/12_验收与评测.md)
- [界面设计规范](DESIGN.md)

## 演示路径

```text
上传研报
→ Ling 提取观点
→ 用户确认 T0
→ 上传财报
→ Ling 提取事实
→ 观点核验
→ 用户修改与确认
→ Research Memory 更新
→ 新一期材料继承旧状态
```

FinTrust 的目标不是生成更多文字。它的目标是让研究结论拥有历史、证据和下一步。
