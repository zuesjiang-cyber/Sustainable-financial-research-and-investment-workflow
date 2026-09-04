---
name: report-first-product
description: 上传研报后自动提炼观点，以最新财报核验并持续维护研究状态的完整 V1
status: backlog
created: 2026-09-03T12:39:08Z
---

# Report-first product PRD

成品定义与完整 P0 以 [产品 PRD](../../docs/product-architecture-v1/01_产品定义与交互.md) 为唯一产品正文；完整技术设计入口为 [架构文档](../../docs/product-architecture-v1/00_README.md)。

用户不是来管理 Agent 工具的。主流程是上传研报 → 自动观点提取 → 最新官方财报事实 → 逐条核验 → 用户保存 → 下一期继续同一研究。

本轮只完成设计，不启动代码开发。当前代码尚未通过这套终态验收，不把文档完成写成产品完成。

## Success

真实文件自动分析、来源定位、金融口径、用户修正与两轮连续性均通过 [验收](../../docs/product-architecture-v1/12_验收与评测.md)。材料由用户按 [清单](../../docs/product-architecture-v1/14_资料准备清单.md) 提供。
