# Agent 消息卡片信息架构整理稿

本文整理 MovScript Agent / Codex 对话流里的消息、通知、运行活动和协议详情应该如何分层展示。目标不是立刻重写 UI，而是先把“哪些信息有价值”“它们应该出现在哪里”“每类卡片应该承担什么任务”讲清楚，后续再按这个设计逐步调整前端组件。

## 背景

当前新版 agent 卡片的问题不是信息没有价值，而是信息位置混乱。

典型现象：

- `Goal updated`、`Token usage updated`、`MCP status` 这类状态信息被渲染成很大的消息卡片。
- `Message details`、`Event details`、`Notice details`、`Tool details` 等 raw payload 被散落在每条消息下面。
- 主对话流、运行活动、系统状态、协议详情四种信息混在同一个视觉层级里。
- 卡片边框、折叠区、代码块层层嵌套，用户看到的是“日志墙”，而不是 agent 正在做什么。

因此本次整理的核心判断是：

> 信息不应该被删除，但必须从主对话流中重新归位。主流负责理解，详情负责检查，Inspect 负责承载原始协议信息。运行过程只保留摘要级信息，不再规划独立调试工作台。

## 当前代码里的信息来源

### 1. Codex ThreadItem

来源：

- `apps/frontend/src/shared/infrastructure/app-server/app-server-protocol/v2/ThreadItem.ts`
- `apps/frontend/src/shared/infrastructure/app-server/appServerThreadTurnItemItems.ts`
- `apps/frontend/src/features/agent/domain/agentChatThreadItems.ts`

`ThreadItem` 是对话主时间线的骨架。它包含用户消息、agent 消息、计划、推理摘要、命令执行、工具调用、文件变更、多 agent 协作、图片生成等。

它应该优先进入主对话流或运行活动流。

### 2. App-server Notification

来源：

- `apps/frontend/src/shared/infrastructure/app-server/appServerThreadTurnItemProtocolAdapter.ts`
- `apps/frontend/src/features/agent/domain/agentChatProtocol.ts`
- `apps/frontend/src/features/agent/domain/agentChatNotificationDispatcher.ts`

通知包括 thread 状态、turn 状态、goal、token usage、MCP server 状态、process output、file system changed、model reroute、config warning、realtime transcript 等。

通知不应该默认成为大消息卡片。它们应该根据语义进入状态条、运行活动、临时 toast、诊断面板或当前 turn 的轻量状态事件。

### 3. ServerRequest

来源：

- `apps/frontend/src/features/agent/domain/agentChatServerRequests.ts`
- `apps/frontend/src/features/agent/components/agent-chat-items/AgentChatServerRequestCard.tsx`

Server request 是需要用户决策或补充输入的事件，例如 command approval、file change approval、permissions request、MCP elicitation、tool result submission。

它不是普通日志，而是高优先级交互卡。它应该被设计成“风险说明 + 决策按钮 + 更多详情”。

### 4. Run Activity Summary

来源：

- `apps/frontend/src/features/agent/presentation/agentRunActivityTimeline.ts`
- `apps/frontend/src/features/agent/domain/agentRunActivitySnapshot.ts`
- `apps/frontend/src/features/agent/domain/agentRunUi.ts`
- `packages/ui/src/components/business/agent/page/index.tsx`

Run activity 更适合承载运行摘要，例如工具调用、用户输入请求、审批、生成任务、HTTP/工具流的简短状态。

运行底层事件不再作为独立 surface 规划。它只为 UI 提供摘要、状态、耗时、错误定位和少量关联信息；完整原始信息进入 Inspect。

### 5. Raw Payload

几乎所有 neutral item 都保留 `raw?: unknown`。

这部分非常有价值，但价值主要是：

- 检查协议是否映射正确。
- 定位 provider / app-server 错误。
- 给开发者检查字段兼容性。
- 在新版 UI 没覆盖某个字段时保底查看。

它不应该散落在每张消息卡片里，而应该有统一入口。

## 信息层级

### L1 主对话流

主对话流只回答：

- 用户说了什么。
- Agent 回答了什么。
- Agent 当前在做什么大步骤。
- 是否需要用户立刻决策。
- 是否发生了阻塞或失败。

主对话流不应该展示：

- 完整 raw JSON。
- provider 内部字段。
- 纯遥测状态。
- 频繁变化的 token / mcp / process 底层事件。
- 细粒度运行事件明细。

### L2 卡片内轻量详情

卡片内详情回答：

- 这一步用了什么关键输入。
- 产出了什么关键结果。
- 有哪些用户可能需要检查的摘要。
- 错误或风险是什么。

适合放在 L2 的信息：

- command output 摘要或短输出。
- tool arguments。
- structured result。
- file change summary / diff 摘要。
- memory citation 摘要。
- MCP result content。
- approval risk / rationale。

L2 可以折叠，但视觉上应该轻，不要像嵌套日志面板。

### L3 Inspect 侧边详情

Inspect 侧边详情回答：

- 当前卡片完整结构是什么。
- 原始协议字段是什么。
- 这个 item / notification / request 如何映射成当前 UI。
- 当前信息从哪里来。

适合放在 L3 的信息：

- raw item。
- raw notification。
- raw server request。
- 完整 arguments。
- 完整 result。
- 完整 contentItems。
- token usage breakdown。
- goal object。
- hook fragments。
- MCP startup raw status。

L3 是产品内可达的“检查详情”。它可以包含 raw JSON，但不再扩展成独立调试工作台。

## ThreadItem 设计归位

| 类型 | 用户价值 | L1 主对话流 | L2 卡片详情 | L3 Inspect |
| --- | --- | --- | --- | --- |
| `userMessage` | 看到自己发了什么，附了哪些资源 | 文本、图片/视频/音频预览、资源名称 | text elements 摘要、附件列表、资源 id/mime | raw item、完整 input structure |
| `agentMessage` | agent 的真实回复 | 正文 | phase badge、memory citation 摘要 | raw item、token/model/metadata |
| `hookPrompt` | 系统或项目注入额外上下文 | 默认不进入主流，异常时用状态条 | hook 名称、片段摘要 | 完整 fragments/raw |
| `plan` | agent 的计划和进度 | 任务列表、状态 | 原始 plan text、步骤状态 | raw item |
| `reasoning` | agent 思考摘要 | 默认只显示 summary | 运行摘要、result/error 摘要 | full content/raw |
| `commandExecution` | agent 执行了什么本地命令 | 命令、状态、exit code、短输出 | cwd、parsed actions、terminal input、完整 output | raw command item、相关 process 摘要 |
| `fileChange` | agent 修改了什么 | 文件数、状态、关键文件列表 | diff/patch 摘要 | full changes/raw |
| `mcpToolCall` | agent 调用了哪个 MCP 工具 | server/tool、状态、关键结果预览 | arguments、progress、structured result、error | raw MCP item |
| `dynamicToolCall` | 内置或动态工具调用 | tool、状态、输出预览 | arguments、contentItems、result/error | raw dynamic item |
| `collabAgentToolCall` | 多 agent 协作 | 子 agent 数量、整体状态 | prompt、目标 thread、agent states | raw collab item |
| `webSearch` | 搜索行为 | query、search/open/find action | action summary/result | raw search item |
| `imageView` | agent 查看了图片 | 图片预览、路径/资源名 | source path | raw item |
| `imageGeneration` | agent 生成图片 | 状态、生成图、保存位置 | revised prompt、result text | raw generation item |
| `reviewMode` | 进入或退出 review 状态 | 轻量状态条 | review 文案 | raw item |
| `contextCompaction` | 上下文压缩发生了 | 轻量状态条，显示压缩前后 token | reason、token delta | raw item |
| `unknown` | 新协议兜底 | 小 warning，提示未知类型 | provider type、id、status | full raw item |

## Notification 设计归位

| 通知 | 当前常见表现 | 建议位置 | 设计说明 |
| --- | --- | --- | --- |
| `thread/goal/updated` | 大 system card | Thread 状态条或右上状态区 | goal 是 thread control state，不是聊天消息。主流最多显示一次轻提示。 |
| `thread/goal/cleared` | system notice | Thread 状态条 / toast | 不进入对话正文。 |
| `thread/tokenUsage/updated` | 大 system card | Context usage indicator | token usage 是上下文仪表盘，不是消息。必要时 Inspect 显示 breakdown。 |
| `mcpServer/startupStatus/updated` | 大 system card | Capability/status strip | MCP 状态影响工具可用性，应该聚合展示，不要每个 server 一张大卡。 |
| `mcpServer/oauthLogin/completed` | system notice | Capability/status strip + toast | 成功轻提示，失败进入 warning。 |
| `remoteControl/status/changed` | 大 system card | 环境状态区 | 属于运行环境，不属于本 turn 对话。 |
| `model/rerouted` | system notice | 当前 turn 的 warning event | 用户需要知道模型被换了，但应是轻量 warning。 |
| `model/verification` | system notice | Inspect | 除非失败，否则不占主流。 |
| `rawResponseItem/completed` | system notice | Inspect | 完全是 provider 协议检查信息。 |
| `hook/started/completed` | system notice | Run activity | 只在失败/阻塞时进入主流 warning。 |
| `command/exec/outputDelta` | recent event / output | 合并到 commandExecution | output delta 不应单独成为卡片。 |
| `process/outputDelta` / `process/exited` | recent event | Run activity summary / Inspect | process 级别事件应合并成运行摘要，原始事件进 Inspect。 |
| `fs/changed` | recent event | Run activity | 如果和 fileChange 有关联，应合并到 file change 卡。 |
| `account/*` | recent event | account/status area | 登录、限额属于账户状态。 |
| `warning` / `guardianWarning` | system notice | 高优先级 warning | 需要进入主流或固定 warning 区。 |
| `configWarning` / `deprecationNotice` | system notice | 设置/环境 warning | 主流轻提示，详情进 Inspect。 |
| realtime transcript/audio | recent event 或 transient item | 实时消息/媒体 item | transcript done 可成为消息，delta 不独立成卡。 |

## ServerRequest 设计归位

ServerRequest 是最重要的交互信息，应单独设计。

### Approval Request

适用：

- `item/commandExecution/requestApproval`
- `item/fileChange/requestApproval`
- `item/permissions/requestApproval`
- `applyPatchApproval`
- `execCommandApproval`

主卡应该显示：

- 请求类型。
- 风险等级或权限影响。
- 操作对象：命令、文件、网络 host、MCP 工具。
- 推荐操作按钮：Allow once、Reject、Cancel。
- 可选次级操作：Allow for session、Allow similar command、Allow network policy。

详情应该显示：

- cwd。
- command argv。
- patch file list。
- network protocol/host/port。
- approval reason。

Inspect 显示：

- raw request。
- policy amendment。
- reviewer data。

### User Input / Elicitation

适用：

- `item/tool/requestUserInput`
- `mcpServer/elicitation/request`

主卡应该显示：

- agent 需要用户回答什么。
- 表单或选项。
- 取消/提交按钮。

详情应该显示：

- schema 摘要。
- 默认值。
- required fields。

Inspect 显示：

- requestedSchema。
- raw request。

### Dynamic Tool Result Submission

适用：

- `item/tool/call`

主卡应该显示：

- tool name。
- 需要用户/前端补充什么 tool result。
- 成功/失败切换。
- 文本、媒体、resource 输出输入区。

Inspect 显示：

- params。
- generated response payload。

## 视觉模型

### 主消息

用于：

- `userMessage`
- `agentMessage`

形态：

- 聊天气泡或正文块。
- 少量 badge。
- 不显示 raw。
- 不出现 “details” 这种开发者词，除非用户显式进入 Inspect。

### 运行活动节点

用于：

- `plan`
- `reasoning`
- `commandExecution`
- `mcpToolCall`
- `dynamicToolCall`
- `fileChange`
- `webSearch`
- `imageGeneration`
- `collabAgentToolCall`

形态：

- 左侧状态线或状态点。
- 一行标题：动作 + 对象。
- 一行 meta：状态、耗时、数量。
- 主体只放结果摘要。
- 详情区使用轻量 disclosure，不嵌套重卡。

### 状态条

用于：

- goal。
- token usage。
- MCP readiness。
- remote control。
- account/rate limit。
- context compaction。

形态：

- 不进入大消息流。
- 可放在 thread header、pinned status、activity rail。
- 点击进入 Inspect。

### 操作卡

用于：

- approvals。
- elicitation。
- request user input。
- tool result submission。

形态：

- 高对比但不危险化。
- 明确风险、对象和结果。
- 按钮区固定，主按钮有限。
- 更多选项进入菜单。

### Inspect 面板

用于：

- 当前选中卡片的完整结构。
- raw item / notification / request。
- 映射过程。
- 关联运行摘要。

形态：

- 右侧 panel 或 modal。
- 分区：Summary、Structured fields、Raw JSON、Related activity。
- 支持复制 JSON。
- 支持从 raw 字段回到对应消息或运行活动。

## 命名建议

避免在主 UI 使用这些词：

- `Raw item`
- `Event details`
- `Message details`
- `Notice details`
- `Tool details`

建议替换为：

- 主流：`输出`、`结果`、`变更`、`需要确认`、`上下文已压缩`
- 卡片详情：`参数`、`文件变更`、`执行输出`、`引用`、`风险说明`
- Inspect：`协议详情`、`原始事件`、`原始消息`、`请求载荷`、`响应载荷`

英文 UI 可对应：

- `Inspect`
- `Protocol details`
- `Raw event`
- `Request payload`
- `Response payload`
- `Activity`

## 迁移路线

### Phase 1：建立统一信息策略

新增或整理一个中间 view model 层，让每类 item 输出同样结构：

```ts
interface AgentMessageCardView {
  title: string
  tone: 'neutral' | 'process' | 'result' | 'diagnostic'
  meta: string[]
  primary: AgentCardPrimaryContent[]
  details: AgentCardDetailSection[]
  inspect?: AgentCardInspectPayload
}
```

关键点：

- renderer 不再自己判断 raw 放哪里。
- raw 统一进入 `inspect`。
- 卡片内详情只放经过选择和命名的信息。

### Phase 2：重做核心卡片

优先顺序：

1. `commandExecution`
2. `mcpToolCall` / `dynamicToolCall`
3. `fileChange`
4. `plan` / `reasoning`
5. `serverRequest`

这五类决定 agent 是否“可信、可读、可操作”。

### Phase 3：状态信息离开主流

把这些从大卡片迁走：

- token usage。
- goal update。
- MCP startup/status。
- remote control status。
- account/rate limit。
- raw response item。
- hook started/completed。

迁移目标：

- thread status strip。
- run activity timeline。
- Inspect panel。

### Phase 4：统一 Inspect

每张主卡只保留一个小的 Inspect 入口。

Inspect 需要支持：

- 当前 card 的 structured view。
- raw payload。
- related thread/turn/item id。
- related activity id。
- copy JSON。

### Phase 5：清理旧版卡片和旧契约

清理范围：

- `apps/frontend/src/features/agent/components/agent-chat-items/*`
- `apps/frontend/src/features/agent/domain/agentChat*Views.ts`
- `packages/ui/src/components/business/agent/run-activity/*`
- `packages/ui/src/components/business/agent/message/*`
- 旧 `old-movscript/apps/frontend` 和 `old-movscript/packages` 中仍被引用的卡片实现。

目标不是一次性删除，而是按新信息层级逐类替换。

## 当前不做的事

本整理暂不决定：

- 最终视觉稿。
- 是否用 drawer、popover 还是 modal 做 Inspect。
- 是否引入新的全局 timeline 数据结构。
- 是否修改 app-server 协议。
- 是否删除 raw 字段。
- 是否保留轻量运行活动摘要入口。

raw 字段应继续保留。问题只是它不应该默认铺在主对话流里。

## 待确认问题

1. Inspect 面板是 thread 级右侧面板，还是每张卡片的弹窗？
2. Token usage 是显示在 composer 上方，thread header，还是独立 context 状态条？
3. MCP server 状态是全局能力状态，还是当前 thread 状态？
4. `reasoning.content` 对普通用户默认是否完全隐藏？
5. `hookPrompt` 是否只有失败/阻塞时才进入主流？
6. ServerRequest 是否应该从聊天流中固定到底部，避免用户错过操作？
7. 多 agent `collabAgentToolCall` 是否需要树状 thread 展示，而不是普通工具卡？

## 建议的下一步

下一步先不要继续动所有卡片。建议先做两份更小的规格：

1. **CommandExecution 卡片规格**
   - 主信息、详情、Inspect 字段逐项列清。
   - 对成功、失败、running、approval pending 四种状态画出文本结构。

2. **MCP ToolCall 卡片规格**
   - MovScript MCP 工具和普通 MCP 工具分开。
   - 资源类、生成类、workspace 类、查询类结果使用不同摘要模板。

这两类做好后，再推广到其他工具和系统通知。
