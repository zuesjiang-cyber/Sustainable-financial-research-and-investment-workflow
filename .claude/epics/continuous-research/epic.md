---
name: continuous-research
status: in-progress
created: 2026-09-03T08:07:50Z
---

# 持续研究 P0 执行记录

沿用已确认方案：维护当前观点，新资料逐条对账，区分证实、削弱、待验证及原因；用户确认后保存，下一轮继承。

| 工作流 | 负责人 | 验收 |
| --- | --- | --- |
| 状态、事务、研究记忆 | Luna max / research_memory | T1 修正经 T2 保留到 T3；重启恢复；版本冲突不误写 |
| 材料、检索、计算、核验 | Luna max / research_pipeline | 真实工具循环；逐字来源；计算记录；无模型不伪造结论 |
| 页面交互 | Luna max / research_ui | 草稿可修改；失败保留；旧请求不覆盖新资料；原文可看 |
| API、财务规则、集成 | 主 Agent | 草稿绑定资料和状态；新建多个项目；测试、构建及端到端验证 |

本轮复用 React、Express、SQL.js、Decimal 和现有页面。模型由环境配置，不以更换模型阻塞骨架开发。P0 输入为粘贴或文本文件；不新增搜索平台、PDF OCR 或多 Agent 产品运行时。

源版本：13a42f615930440b7912c6c619620f632f68176d。
完成结果及复现命令记录在 README 中。
