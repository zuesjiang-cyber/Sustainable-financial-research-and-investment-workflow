# FinTrust V2 持续研究

SQLite 是唯一运行依据。Markdown 只是可重新生成的导出。`/v1` 保留为研报核验历史入口，不再作为默认写入路径。

## 启动

```bash
cp .env.example .env
# 建议使用新目录，避免覆盖旧研究数据
# FINTRUST_DATA_DIR=./data-v2-local
npm ci
npm run dev
```

打开首页即进入真实研究（文字 / 链接 / PDF）。后台研究走工具链：官方披露检索、Tavily 发现、原文抓取、PDF 解析、项目记忆、确定性计算、核验提交。模型不能自行把未核实内容标成事实。历史事件回放与研报核验为独立入口，不混入实时结果。

## 接口

| 方法 | 路径 | 职责 |
| --- | --- | --- |
| POST | `/v2/research` | 文字、链接或文档 ID 创建研究 |
| GET | `/v2/runs/:id` `/v2/runs/:id/events` | 可恢复任务与 SSE |
| GET | `/v2/projects` `/v2/projects/:id` | 首页与完整记录 |
| POST | `/v2/projects/:id/messages` | 先保存用户原话 |
| POST | `/v2/projects/:id/research-runs` | 手动检查或深入研究 |
| GET | `/v2/evidence/:id` | 原文、核验与依赖 |
| GET/POST | `/v2/notifications` `/v2/notifications/:id/read` | 提醒与已读 |
| PATCH | `/v2/projects/:id/monitoring` | 跟踪与提醒偏好 |

## 模型角色

环境变量 `FINTRUST_MODEL_FAST` / `FINTRUST_MODEL_RESEARCH` / `FINTRUST_MODEL_REVIEW` 覆盖角色模型。未设置时回退到 `FINTRUST_LLM_MODEL`。不再硬编码只允许 Ling。候选评测见 `MODEL_EVAL.md`。
