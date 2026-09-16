# 模型比较结果

比较预算上限 60 元，单独列支。实施前应通过 OpenRouter `/api/v1/models` 检查可用性与工具/结构化输出能力。

计划比较：

| 角色 | 候选 | 筛选规则 |
| --- | --- | --- |
| 研究 | GPT-5.6 Sol、DeepSeek V4 Pro 0813 | 证据准确性、观点归属、推理质量最高 |
| 快速 | GPT-5.6 Luna（及通过质量门槛者） | 质量门槛内延迟最低 |
| 复核 / 复杂反证 | GPT-6 Astra | 反证与冲突处理 |

## 当前实测

**未完成真实连通。** 本环境未配置 `FINTRUST_LLM_API_KEY`，因此没有锁定具体生产版本，也没有静默跳过结构化输出验证。

请在本地填写 Key 后执行：

```bash
curl -s https://openrouter.ai/api/v1/models -H "Authorization: Bearer $FINTRUST_LLM_API_KEY" | head
npm run model:check
```

以及 `GET /v2/models/probe`。若候选 ID 在目录中不存在，保持环境变量显式指定可用模型，而不是改用规则引擎冒充研究完成。
