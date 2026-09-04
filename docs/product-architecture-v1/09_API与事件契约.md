# 09 API 与事件契约

完整路径及结构见 [OpenAPI](contracts/openapi.yaml)，领域语义见 [domain.ts](contracts/domain.ts)。前缀统一 `/v1`，新主界面不混用旧 `/api` 写入接口。

## 1. 通用规则

JSON 使用 camelCase；ID 为 UUID；数值事实使用 decimal string；UTC 时间 ISO8601。普通错误体为 `{error:{code,message,retryable,details?,requestId}}`。HTTP 成功响应返回具体资源，不另外套一个不必要的 `success=true`。

云端浏览器通过 HttpOnly session cookie 认证，同源部署。所有写请求校验 Origin，要求 `X-CSRF-Token`；上传、运行创建、确认、导出同时带 `Idempotency-Key`。幂等键按 workspace+操作路径+key 唯一，保存请求 hash 与响应；同 key 不同内容返回 409。记录保留至少 7 天。

分页返回 `{items,nextCursor}`，cursor 是服务端编码的稳定 `(createdAt,id)`，默认 20、最大 100。不能依赖可变数组下标。

## 2. 接口总览

| 方法与路径 | 作用 | 核心返回 |
|---|---|---|
| GET `/v1/session` | 当前工作区、用户、本地/云端模式、CSRF token | Session |
| GET `/v1/projects` | 首页已有研究 | ProjectSummary page |
| GET `/v1/projects/{id}` | 当前公司研究与活动 run | ProjectDetail |
| PATCH `/v1/projects/{id}` | 改标题、归档、定期检查开关 | ProjectDetail |
| POST `/v1/uploads` | multipart PDF/补充文本文件 | UploadReceipt |
| POST `/v1/runs` | 首次研报/新增研报/财报刷新/调整研究 | Run，202 |
| GET `/v1/runs/{id}` | 恢复页面所需运行快照 | RunDetail |
| GET `/v1/runs/{id}/events` | SSE 进度 | 持久事件流 |
| POST `/v1/runs/{id}/input` | 提交公司/日期/补充文件 | Run，202 |
| POST `/v1/runs/{id}/retry` | 从检查点重试可恢复失败 | Run，202 |
| POST `/v1/runs/{id}/cancel` | 请求取消 | Run，202 |
| GET `/v1/runs/{id}/draft` | 当前草稿、diff、引用 | Draft + ETag |
| PATCH `/v1/runs/{id}/draft` | 调整观点、标准、用户判断、保留项 | Draft + ETag |
| POST `/v1/runs/{id}/draft/reverify` | 重算失效观点 | Run，202 |
| POST `/v1/runs/{id}/draft/confirm` | 原子保存研究 | version、updateId |
| POST `/v1/runs/{id}/rebase` | 基于最新状态重算原草稿 | 新 Run，202 |
| GET `/v1/projects/{id}/states` | 历史版本列表 | StateSummary page |
| GET `/v1/projects/{id}/states/{version}` | 某次已确认研究 | ResearchState |
| GET `/v1/documents/{id}` | 文件、解析和披露元数据 | Document |
| GET `/v1/documents/{id}/content` | 同源受控文件流 | application/pdf 或 text/plain |
| GET `/v1/evidence/{id}` | 证据原文、位置、关联文件 | EvidenceSpan |
| GET `/v1/projects/{id}/evidence-bundle` | 当前状态/指定版本/草稿引用的数据集合 | documents、spans、facts、calculations |
| POST `/v1/projects/{id}/exports` | 构建导出包 | ExportJob，202 |
| GET `/v1/exports/{id}` | 导出状态 | ExportJob |
| GET `/v1/exports/{id}/content` | 读取已生成 ZIP | application/zip |

OIDC 使用 `/auth/login`、`/auth/callback`、`/auth/logout` 服务端路由；不和业务 JSON 写入混合。`/health/live` 只检查进程，`/health/ready` 检查数据库/迁移；密钥配置和详细运行指标仅限授权维护者。

## 3. 创建运行

```json
{
  "kind": "INITIAL_REPORT",
  "uploadIds": ["11111111-1111-4111-8111-111111111111"],
  "asOf": "2026-09-03T12:00:00Z"
}
```

INITIAL_REPORT 不需要先建项目，服务端创建暂定项目并返回 projectId。ADD_REPORT、REFRESH_FILINGS、REVIEW_STATE 必须传已有 projectId。INITIAL_REPORT/ADD_REPORT 必须有 THESIS_SOURCE 上传；REFRESH_FILINGS 可以带用户补充的 FINANCIAL_FILING，也仍记录官方查询覆盖情况。REVIEW_STATE 用于用户主动修正已保存研究，复制最新状态成 draft，只有改动验证对象时才重新分析。

普通用户不传 asOf 时取服务器当前时间；传入不得晚于服务器时间。上传文件与 project 必须在当前 workspace，角色匹配。

## 4. 交互暂停载荷

`requiredInput` 是判别联合：COMPANY_SELECTION 带候选公司；REPORT_DATE 带识别片段；MISSING_SOURCE 带缺失期间和已有资料。用户选择或补充后从本阶段继续。用户可以在不影响其它观点时选择“按已有资料继续”，对应缺失观点输出 UNRESOLVED。

## 5. 草稿修正

GET draft 返回 `ETag: "draft-<id>-r<revision>"`。PATCH 与 confirm 要求 If-Match；revision 已变化返回 412。

```json
{
  "edits": [{
    "thesisId": "22222222-2222-4222-8222-222222222222",
    "include": true,
    "userJudgment": "目前只确认利润率改善，产品结构的解释仍需验证。"
  }]
}
```

编辑 text/criterion 会使该观点 stale；只改 userJudgment 不改变系统核验。include=false 在初次草稿中是忽略提取项；已有观点则提出归档，确认时保留历史。草稿里人工意见与系统输出分别展示。

确认体 `{baseStateVersion,draftRevision}`，只有当前 draft 非 stale 且基准一致才成功。响应 `{projectId,version,updateId,runId}`。用户确认只保存当前草稿选择，不重新调用模型。

## 6. SSE

```text
id: 1842
event: run.progress
data: {"runId":"...","status":"RUNNING","phase":"VERIFY","completed":3,"total":6,"message":"已核验 3 条观点"}
```

事件种类：run.status、run.progress、run.input_required、draft.ready、run.error。心跳每 15 秒（注释帧）；断线重连按 ID 补齐。事件持久保留 30 天供恢复，超过保留窗返回 snapshot_required，客户端 GET run/draft 重新取得权威快照。

## 7. 错误如何呈现

| code | HTTP | 用户动作 |
|---|---|---|
| INVALID_INPUT / UNSUPPORTED_FILE | 400 / 415 | 修改文件或字段 |
| UPLOAD_TOO_LARGE | 413 | 显示实际上限 |
| NOT_AUTHENTICATED / NOT_FOUND | 401 / 404 | 登录；不存在或不属于工作区统一 404 |
| ACTIVE_RUN_EXISTS | 409 | 打开当前分析，不重复建任务 |
| STATE_CONFLICT / IDEMPOTENCY_CONFLICT | 409 | 重算草稿 / 使用新的请求键 |
| DRAFT_REVISION_CONFLICT | 412 | 拉取最新草稿 |
| PARSE_FAILED / PROVIDER_UNAVAILABLE / MODEL_OUTPUT_INVALID | 运行错误字段 | 展示失败阶段、已完成成果和可用继续入口 |
| BUDGET_EXHAUSTED | 运行结果标记 | 展示未处理观点和“继续分析”入口；继续通过 retry 增加明确预算批次 |

长任务业务失败不伪装成 HTTP 请求永远 pending。run 快照始终能获取，并指出 retryable 与最后 checkpoint。

## 8. 文件和证据

PDF 接口支持 Range/206 供 PDF.js 按页加载，设置正确 Content-Type、Content-Length、Content-Disposition inline 及私有缓存策略。S3 存储仍经鉴权代理或短时签名，URL 不写进长期研究状态。证据引用存 ID 与坐标，不保存即将过期的下载地址。

Evidence bundle 查询不传参数时取当前确认状态；传 version 时取历史，传 runId 时取该项目草稿，两参数互斥。服务端沿引用关系只打包涉及的事实、计算及 spans；页面可一次读取观点所需数据，避免只有 fact ID 却无法显示数值。大 PDF 正文仍按页读取，不放进 bundle。
