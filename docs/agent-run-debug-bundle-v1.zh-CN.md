# AgentRun 调试包 v1 契约

`/agent/runs/:runId` 的“复制调试包”会输出脱敏后的 JSON，用于复现一次 AgentRun 的上下文、模型 HTTP、工具调用、历史写入和异常事件。

## 版本识别

- `schema`: 固定为 `movscript.agent-run-debug-bundle.v1`。
- `schemaUrl`: 指向 `agent-run-debug-bundle-v1.schema.json`。
- `generatedAt`: 复制调试包的时间。
- `capabilities`: 当前调试包携带的能力列表。消费方应先检查 capabilities，再读取对应字段。

这些版本识别字段都是 v1 schema 的必填字段。`schemaUrl` 必须等于 `https://movscript.dev/schemas/agent-run-debug-bundle-v1.schema.json`，`generatedAt` 必须是可解析的 date-time 字符串。
`run.createdAt`、`runSummary.createdAt`、`runSummary.startedAt`、`runSummary.terminalAt` 和 `attentionEvents[*].createdAt` 也按 date-time 校验，便于和后端日志、CI 截图时间线互相定位。

## 必读字段

| 字段 | 含义 |
| --- | --- |
| `run` | 脱敏后的 run 快照，至少包含 `id`、`threadId`、`status`、`createdAt`，用于和外部日志、后端记录或截图验收互相定位。 |
| `runSummary` | run 状态、角色、时间、错误、待处理项数量。 |
| `fieldGuide` | 字段判断口径，解释模型请求、模型响应、历史写入和缺失项。 |
| `coverage` | 当前调试包采集覆盖情况，包括事件、模型调用、请求负载、响应正文、上下文详情、历史写入和工具详情。 |
| `readinessChecklist` | 面向排查的诊断项，每项包含 `status`、`detail` 和 `action`。 |
| `modelCalls` | 每轮模型调用摘要，标记请求/响应/结果事件和缺失情况。 |
| `modelCallContexts` | 按轮次关联模型事件、工具调用和 assistant 历史写入。 |
| `promptDetails` | 发送给模型前的上下文组成，包括来源层级、片段和工具定义。 |
| `messageWrites` | assistant 写入线程历史的消息摘要。 |
| `toolCalls` | 工具调用结构化摘要，包括工具名、状态、来源、耗时和脱敏数据预览。 |
| `attentionEvents` | 失败、阻塞、审批、输入等待等需要优先查看的事件。 |
| `pendingActions` | 当前仍待用户处理的审批或输入请求。 |
| `events` | 已加载的脱敏原始运行事件。 |

## 读取顺序

`runSummary.role` 固定为 `planner`、`worker` 或 `unknown`。旧 run 缺少角色字段时会写入 `unknown`，保证调试包仍满足 schema。
`run.status` 和 `runSummary.status` 固定为 `queued`、`in_progress`、`requires_action`、`completed`、`completed_with_warnings`、`failed` 或 `cancelled`，消费方应把其他值视为不符合 v1 契约。
`modelCalls[*].status` 和 `modelCallContexts[*].status` 固定为 `complete`、`request_only`、`response_only`、`result_only` 或 `failed`，两处含义一致。
`pendingActions[*]` 至少包含 `type`、`id`、`createdAt`。其中 `type` 固定为 `approval` 或 `input`，`createdAt` 按 date-time 校验。调试包只导出仍处于 pending 状态的请求。

`pendingActions[*].type === "approval"` 时还必须包含：

- `toolName`: 等待审批的工具名。
- `reason`: 触发审批的原因。
- `risk`、`permission`: 可选的风险和权限提示。

`pendingActions[*].type === "input"` 时还必须包含：

- `title`、`question`: 待输入请求的标题和问题。
- `inputType`: 固定为 `choice`、`text` 或 `confirmation`。
- `choices`: 输入选项列表，每项至少包含 `id` 和 `label`。
- `allowCustomAnswer`: 是否允许自定义回答。

1. 先看 `coverage.issues` 和 `readinessChecklist`，判断这份包是否完整。
2. 再看 `modelCallContexts`，按轮次确认模型请求、模型响应、工具调用和历史写入是否能对上。
3. 需要核对模型输入时看 `promptDetails` 和相关 model request event。
4. 需要核对模型输出是否进入历史时看 `messageWrites`。
5. 有失败或等待时优先看 `attentionEvents` 和 `pendingActions`。

## 脱敏边界

调试包复制前会脱敏常见敏感信息：

- `authorization`、`api_key`、`token`、`secret`、`cookie` 等字段。
- URL query 中的签名、token、key 类参数。
- 嵌套 JSON 字符串中的敏感字段。
- 常见 inline secret 片段。

脱敏不是权限边界。调试包仍可能包含业务文本、用户提示词、工具结果摘要和上下文片段，只应发给有权调试该项目的人。

## 旧运行限制

旧 run 或异常中断的 run 可能缺少：

- 完整 request payload。
- 原始 HTTP response body。
- prompt/context 组成详情。
- assistant 历史写入事件。
- 结构化工具详情。

这些数据如果当时没有采集，调试包只能标记缺失并给出下一步动作，不能事后补齐。需要完整证据时应重新运行并重新采集。

## 兼容策略

- v1 消费方必须容忍未知字段。
- 新能力优先追加到 `capabilities`，而不是修改已有字段语义。
- 如果字段语义发生不兼容变化，应发布新的 schema 名称，例如 `movscript.agent-run-debug-bundle.v2`。
