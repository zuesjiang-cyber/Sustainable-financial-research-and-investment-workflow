# 06 Agent 编排与核验算法

## 1. ResearchAgent 的责任

输入不是空白聊天，而是研报观点、最新研究状态、用户修正、待解问题和可用财报清单。输出不是长篇自由发挥，而是每条观点的结构化核验与更新草稿。

固定阶段负责正确的数据流；阶段内 Agent 根据证据决定下一步。例如毛利率改善已能计算，但原因缺失时，先搜业务结构说明，读相关附注，再决定因果部分只能待验证。这种证据反馈后的行动选择才是本产品的 Agent 能力。

## 2. 模型接入

核心模型使用用户指定的 Ling-3.0-flash-Fin；适配器配置 `MODEL_BASE_URL / MODEL_API_KEY / MODEL_ID`，记录实际 provider、model ID 和请求参数。当前 OpenRouter 路由支持工具调用，但不支持强制结构化输出 `response_format`，因此本产品使用工具 schema + Zod 验证 + 一次定向修复，不假定模型提供原生严格 JSON。[当前模型路由说明](https://openrouter.ai/inclusionai/ling-3.0-flash-fin:free)

免费路由只作为开发配置，部署不把“永久免费或无并发限制”作为成立前提。是否稳定提供该模型、实际 token 单价和限额由环境验收记录。这里确定调用接口，不替用户开通或购买服务。

模型输出策略：低随机性，提示词带 schema version；解析失败时把具体 validation issues 和原输出发送一次修复。再失败只让该阶段/观点进入可重试错误，不用静默假数据代替。

## 3. Agent 输入包

```text
runContext: runId, asOf, baseStateVersion, company, allowedDocumentIds
researchMemory: confirmedTheses, userCorrections, unresolvedQuestions, recentChanges
sourceReport: original thesis revisions + source spans
availableFacts: dimension summaries + IDs, not entire database
budget: remainingCalls, remainingTokens, remainingToolCalls, deadline
```

模型需要正文时通过工具读取；不把所有 PDF 塞进每一次请求。用户研报和来源文本放在清晰的数据区，不提升为系统指令。工具参数使用已登记文档/观点/事实 ID，来源里出现的任意 URL 不自动成为可访问目标。

## 4. 工具契约

| 工具 | 输入 | 输出与执行 |
|---|---|---|
| `find_facts` | metric、period、scope、segment、nature | 兼容候选 Fact IDs、维度、来源；SQL 结构化过滤 |
| `search_evidence` | query、documentIds、heading、topK≤8 | 中文 BM25 片段、页码、span IDs、分数；仅本轮资料包 |
| `read_evidence` | spanIds 或 documentId+page范围（≤5页） | 原始段落、表格、上下文；禁止仅凭搜索摘要下最终判断 |
| `calculate_metric` | formulaId、operandFactIds、operandCalculationIds；目标比较另带 thesisRevisionId/conditionPath | Decimal 结果、量纲与可比性检查、calculation ID；目标值由已存条件读取 |
| `request_disclosure` | reportPeriod、reportKind、reason | 经 provider 发现的材料候选；由编排器加入资料包补充版本 |
| `submit_assessment` | 本章定义的 assessment JSON | Zod 校验、引用检查、数值条件复算；不写确认状态 |

`request_disclosure` 是本轮计划扩充：仅加入发布时间不晚于 asOf 的材料，并生成新的 sourcePackHash；已完成观点在冻结最终 manifest 后绑定该版本。新增公告发布时间超过 asOf 则留待新 run。模型不执行任意 Python、SQL 或 shell。

## 5. 规划和工具循环

规划先把观点转换为 evidence needs：要什么指标、哪个期间、对比对象、什么披露段落、怎样才足够。数值条件直接确定事实请求；原因或竞争优势需要语义检索。

默认每轮先按相关观点批量获取基础事实，再逐组分析。每组最多 3 轮证据反馈、6 次工具调用；整轮初值最多 30 次模型调用、60 次工具调用、180k 输入 tokens、24k 输出 tokens。长报告提取也计入整轮预算。达到预算保留已有结果，把剩余内容标记为待补查，并允许用户明确继续一轮。此为可调成本配置，不是质量达标证明。

停止条件：条件可判且引用有效；所需信息在已覆盖资料中未披露；连续两次检索无新增证据；或预算/时间到达。缺证据时输出具体缺什么，不反复同义查询。

每次调用记录输入哈希、工具参数、结果 IDs、token 数、耗时、错误、prompt version；不在普通日志打印整份私人研报或密钥。

精确参数见 [工具 JSON](contracts/agent-tools.json)。assessment 的 inputHash 绑定观点 revision、记忆 hash 和实际引用的事实/计算版本；run 的 sourcePackHash 绑定整包清单。按需补充合法历史文件时更新整包 hash，已有 assessment 的引用不变化；最终检查所有引用均属于最终资料包。

## 6. 三层核验

**第一层：来源真实性。** 引用 ID 必须存在于本轮资料；原句来自相应页；数值能追到具体单元格及列头；低质量 OCR 不当作可靠数值。

**第二层：金融可比性与计算。** 检查主体、期间、单位、合并范围、事实性质和重述。所有阈值、差额、同比、百分点变化由代码计算。错误口径不能通过“模型觉得大致一致”放行。

**第三层：命题关系。** 在来源及口径成立后，模型判断该证据是支持、反驳、仅相关还是缺信息，并解释涉及哪一子条件。对于语义/因果观点，另一次短校验调用检查“是否把相关性当原因、是否把管理层观点当事实、是否遗漏限定语”。两次不一致则保留较谨慎状态及争议说明，不声称独立模型共识。

## 7. 结果状态和期限

| 状态 | 判定规则 |
|---|---|
| `SUPPORTED` | 已到适当核验时点，关键条件得到直接事实/披露支持，未发现实质反证 |
| `PARTIALLY_SUPPORTED` | 原子子条件有支持但仍存在未解决部分；必须列出各部分 |
| `WEAKENED` | 同主体、同口径、相应期限内出现直接反证或核心条件未满足 |
| `UNRESOLVED` | 未到期、缺核心披露、标准未明确或证据不可靠，尚不能定论 |

期限另存 `maturity=NOT_DUE/IN_PROGRESS/DUE`，阶段信号另存 `interimSignal=ABOVE/ON_TRACK/BELOW/UNKNOWN`。不能用一个状态枚举把“结果已失败”和“季度进度慢”混成一件事。

聚合顺序：有核心且期限适用的反证 → WEAKENED；全部关键条件已满足 → SUPPORTED；至少一个已支持而其余未决 → PARTIALLY_SUPPORTED；其余 → UNRESOLVED。子命题结果永远可展开，长期因果命题的待验证不会被短期数字自动覆盖。

例：研报预测 2026 年收入同比 20%，一季报同比 8%。全年目标未到期，结果为 UNRESOLVED / IN_PROGRESS，阶段信号可以 BELOW，说明目前低于全年目标节奏；不能说全年预测被证伪。直接预测“一季度增长 20%”则可以按同口径实际数判断 WEAKENED。

## 8. 差距、原因和后续问题

每项 assessment 分四层生成：

1. `observedGap`：实际与目标/上次事实差多少，引用 calculation 或事实。
2. `disclosedCauses`：公司明确披露的影响因素，引用原文并标记为披露方解释。
3. `hypotheses`：系统可能解释，分别记录支持线索、反证和缺少的验证，不与前一层混排。
4. `nextQuestions`：为缩小上述不确定性需要的具体证据与触发时间，例如“下一期是否披露高端产品收入占比”，而不是“持续关注公司发展”。

如果来源未说明原因，成品应该准确地说“已确认差距，原因尚未披露”，而不是编造漂亮的行业套话。

## 9. Thesis Diff

按稳定 thesis ID 对齐上次确认 assessment 与本轮 assessment，比较状态、关键事实、目标差距、解释和待解问题。变更分为 `NEW / CHANGED / UNCHANGED / ARCHIVED`；状态相同但关键事实或解释有实质变化仍属于 CHANGED。

diff 含 previous、proposed、newEvidenceIds、changeReason。用户判断保持独立，模型可以提出“新证据与上次用户判断冲突”，但不能改写用户过去说过什么。

## 10. 提示词与评估资产

版本化模板：report-extraction、thesis-normalization、verification-plan、tool-executor、semantic-check、diff-summary。输入使用 JSON 数据块，输出分别绑定 schema。更换模型或 prompt 后跑同一冻结资料集，不凭演示话术判断提升。

核心能力可对外准确描述为：**能利用新披露自主补查证据、调用确定性财务计算、更新有出处的观点状态的研究 Agent**。不用并不存在的自治子 Agent 数量包装架构。
