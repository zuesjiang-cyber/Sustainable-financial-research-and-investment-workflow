---
name: report-first-product
status: backlog
created: 2026-09-03T12:39:08Z
updated: 2026-09-03T12:39:08Z
progress: 0%
prd: .claude/prds/report-first-product.md
---

# 完整研报驱动研究产品 V1

设计负责人：主 Agent。实现负责人：用户指定的 Luna max。
本 Epic 尚未执行；0% 指新设计任务未验收，不是否认旧系统已存在的可复用代码。

[完整设计入口](../../../docs/product-architecture-v1/00_README.md)
[迁移与执行安排](../../../docs/product-architecture-v1/13_迁移与执行计划.md)

## Tasks

- [ ] [001 领域契约、PostgreSQL 与持久任务底座](001.md)
- [ ] [002 真实研报上传、PDF 解析与观点提取](002.md)
- [ ] [003 官方财报获取、标准化事实与确定性指标](003.md)
- [ ] [004 ResearchAgent 核验、差距与原因解释](004.md)
- [ ] [005 研究确认、用户修正、Memory 与第二轮更新](005.md)
- [ ] [006 简洁研报入口、研究结果页与 PDF 证据侧栏](006.md)
- [ ] [007 新披露检查、API 收口与研究导出](007.md)
- [ ] [008 私有部署、认证与旧数据迁移](008.md)
- [ ] [009 真实两轮验收、质量与成本记录、最终交付](009.md)

## Dependencies

001 → 002/003 → 004 → 005 → 007；006 可在 001 后以契约样例并行；008 的独立部署工作可并行但与 001 协调数据层；009 在全部功能真实接通后验收。任务 parallel=true 仅表示允许不冲突的工作并行，不表示忽略依赖或同时改共享文件。

## Completion

完整 P0 主路径可在干净环境部署并完成真实两轮操作；质量、成本和失败边界有记录。仅有 demoReplay 或手工输入观点不满足完成定义。

## Execution policy for this epic

保留工作区既有变更和用户数据库。代码任务领取前读对应设计与契约，发生契约修改同步影响方。本地任务文件尚未同步 GitHub；不自动创建 issue、提交或推送。
