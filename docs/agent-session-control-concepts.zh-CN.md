# Agent 会话控制概念整理讨论稿

本文整理 MovScript agent 会话控制相关概念。目标不是一次性改完代码，而是先把当前代码里的命名、Codex 的真实概念、MovScript 未来需要表达的领域对象分清楚，避免 `session`、`thread`、`conversation`、`workspace root` 在不同层里互相污染。

本文使用中文描述产品概念，代码名保持英文。

## 核心结论

MovScript 应该把 agent 会话控制拆成四层：

```text
UI Conversation
  MovScript 前端的会话/tab/历史展示单位。

Provider Thread
  provider 侧的长期对话或任务会话，Codex 主操作对象是 thread。

Provider Session Tree
  provider 侧把多个 thread 归到同一棵 session tree 的分组概念。Codex app-server 的 Thread.sessionId 属于这一层。

Runtime Instance / Workspace Context
  provider app-server 进程实例、启动配置、cwd、项目上下文、文件系统边界。
```

当前代码的问题不是“有没有 session”，而是 `sessionId` 裸字段在不同地方同时表示：

- Codex `Thread.sessionId`，也就是同一 session tree 下共享的 id。
- MovScript provider runtime 的会话或运行态 id。
- 前端 conversation 与 provider thread 的绑定 id。
- app-server 进程或 scoped workspace 的隐含上下文。

因此后续整理的重点不是删掉 session，而是给每一种 session 一个明确名字。

## Codex 侧概念

### Thread

Codex SDK 的主操作对象是 `Thread`。`Codex.startThread()` 创建新 thread，`Codex.resumeThread(id)` 用 thread id 恢复旧 thread。SDK 注释明确说 thread 持久化在 `~/.codex/sessions`。

在 app-server 协议中，`Thread` 有这些关键字段：

```text
Thread.id
  单个 thread 的身份。

Thread.sessionId
  归属 session tree 的 id。多个 fork/subagent 相关 thread 可以共享。

Thread.forkedFromId
  fork 来源 thread。

Thread.parentThreadId
  subagent 父 thread。

Thread.path
  thread 在磁盘上的持久化路径，协议里标注为 unstable。

Thread.cwd
  thread 捕获的工作目录。

Thread.status
  thread 当前运行态。
```

所以对 MovScript 来说，Codex `Thread.id` 应该映射为 `providerThreadId` 或 `codexThreadId`；Codex `Thread.sessionId` 应该映射为 `providerSessionTreeId` 或 `codexSessionId`，不能继续裸叫 `sessionId`。

### Turn

Codex `Turn` 是 thread 里一次用户输入和 agent 执行。app-server 通过 `turn/start`、`turn/steer`、`turn/interrupt` 控制它。

Turn 可以携带本次执行的模型、cwd、sandbox、approval 等覆盖项。因此 sandbox/approval 更接近 turn/thread 执行策略，不是 conversation 本身。

### Session

Codex 里至少有三种 session 语义：

```text
Session tree
  app-server Thread.sessionId。用于把 fork/subagent 相关 thread 分到一棵树。

Persisted sessions directory
  $CODEX_HOME/sessions，默认 ~/.codex/sessions。里面保存可 resume 的 thread transcript/rollout。

Auth session
  ChatGPT/API key 登录缓存。和 thread/session tree 是不同概念。
```

CLI 文档和命令里常把可 resume 的本地交互称为 session，但协议和 SDK 里的恢复主键仍然优先是 `threadId`。

### Workspace 与 Project Root

Codex 也有 workspace/project root 语义：

- `cwd` 是 thread 或 turn 的工作目录。
- project root 用来发现 `.codex/config.toml`、`AGENTS.md` 等配置层。
- workspace roots 是 sandbox 权限边界，决定能读写哪些目录。

这些都不等于 MovScript 业务 workspace，也不等于 CLI `--workspace` 保存配置的根目录。

## Codex 会话控制能力分层

Codex 的会话控制不只包含 start/resume。它还包括协作模式、目标、模型、权限、上下文、多 agent 等控制面。后续 MovScript 做 agent adapter 时，应把这些能力作为 thread control state，而不是继续塞进 `ProviderSession`。

### Thread 生命周期控制

Thread 是 provider 会话的主操作对象。Codex 支持：

```text
thread/start
  创建新 thread。

thread/resume
  按 threadId、history 或 path 恢复已有 thread。协议建议优先用 threadId。

thread/fork
  从已有 thread 分叉出新 thread。

thread/read
  读取 thread 状态和 turns。

thread/list
  列出已有 thread。

thread/archive / thread/unarchive / thread/closed
  管理 thread 历史和可见状态。
```

CLI 层还提供：

```text
/resume
  恢复历史 session/thread。

/fork
  分叉当前 conversation 到新 thread。

/new
  在同一个 CLI session 中开始新 conversation。

/clear
  清空终端并开始新 chat。注意它不同于 Ctrl+L，Ctrl+L 只清屏。
```

这些能力应该映射到 MovScript 的 `ConversationThreadBinding` 和 thread lifecycle actions，而不是 runtime state flags。

### Turn 生命周期控制

Turn 是 thread 内的一次执行。Codex app-server 支持：

```text
turn/start
  在指定 thread 上开始一次执行。

turn/steer
  向正在执行或可 steer 的 turn 追加输入。

turn/interrupt
  中断指定 turn。
```

Turn 级控制通常应该进入：

```text
activeTurnId
turnStatus
turnInput
turnOverrides
```

它和 MovScript `AgentRun` 可以有关联，但不应默认认为一一对应。`AgentRun` 更像 MovScript 自己的任务图或运行记录；Codex `Turn` 是 provider 对话协议中的执行回合。

### 协作模式：Plan mode

Codex 的 plan 模式属于 collaboration mode，不是 goal，也不是 todo list。

协议中的模型是：

```ts
type ModeKind = "plan" | "default"

type CollaborationMode = {
  mode: ModeKind
  settings: Settings
}
```

`/plan` 会把当前 conversation/thread 切到 plan mode，并可附带一段 inline prompt。Plan mode 的职责是让 Codex 先调研、提计划、问澄清问题，再进入执行。它是“当前 thread 如何协作”的控制项。

不要把 Plan mode 和 `update_plan` 混淆：

```text
Plan mode
  thread 的协作模式。决定接下来主要规划还是直接执行。

update_plan
  agent 可调用的任务清单/进度工具。用于展示步骤，不等于 thread 模式。
```

Plan mode 应映射为：

```ts
interface AgentThreadControlState {
  collaborationMode?: "default" | "plan"
}
```

如果 provider 不支持 plan mode，也可以由 MovScript adapter 用 prompt 或 UI 流程模拟，但应标记 capability。

### 目标控制：Goal mode

Goal mode 是 thread 级持久目标。它给 Codex 一个跨多 turn 的完成标准。

协议中的目标模型是：

```ts
interface ThreadGoal {
  threadId: string
  objective: string
  status: "active" | "paused" | "blocked" | "usageLimited" | "budgetLimited" | "complete"
  tokenBudget: number | null
  tokensUsed: number
  timeUsedSeconds: number
  createdAt: number
  updatedAt: number
}
```

相关控制包括：

```text
/goal <objective>
  设置目标。

/goal
  查看当前目标。

/goal pause
  暂停目标。

/goal resume
  恢复目标。

/goal clear
  清除目标。
```

Goal mode 和 Plan mode 的区别：

```text
Plan mode
  工作方式：先规划，少做或不做实施。

Goal mode
  完成标准：持续追踪一个目标是否达成。
```

Goal mode 应映射为：

```ts
interface AgentThreadGoalState {
  objective: string
  status: "active" | "paused" | "blocked" | "usageLimited" | "budgetLimited" | "complete"
  tokenBudget?: number | null
  tokensUsed?: number
  timeUsedSeconds?: number
}
```

不要把 goal 存成 conversation title，也不要把 goal 当成一次 user message。它是 thread control state。

### 模型与推理控制

Codex 支持在 thread 和 turn 层设置模型：

```text
ThreadStartParams
  model
  modelProvider
  serviceTier

ThreadResumeParams / ThreadForkParams
  可覆盖 model、modelProvider、serviceTier。

TurnStartParams
  model
  serviceTier
  effort
  summary
  personality
```

CLI 中对应：

```text
/model
  切换当前模型和可用 reasoning effort。

/fast
  切换 Fast service tier，如果当前模型目录支持。

/personality
  切换沟通风格。
```

这些都属于执行设置：

```ts
interface AgentThreadExecutionSettings {
  model?: string
  modelProvider?: string
  serviceTier?: string | null
  reasoningEffort?: string | null
  reasoningSummary?: string | null
  personality?: string | null
}

interface AgentTurnExecutionOverrides extends Partial<AgentThreadExecutionSettings> {
  cwd?: string | null
}
```

默认值可以来自 provider profile、model catalog 或 user settings；turn 覆盖应该明确记录，避免 UI 误以为全局设置已经改变。

### 权限与执行边界控制

Codex 把权限控制拆成 approval 与 sandbox 两个方向：

```text
approvalPolicy
  什么时候向用户请求确认。

approvalsReviewer
  谁审核需要 approval 的动作，例如 user 或 auto_review。

sandbox / sandboxPolicy
  文件和网络执行边界。

permission profile
  命名权限配置。
```

CLI 中对应：

```text
/permissions
  在 Auto、Read Only、Full Access 或自定义 permission profile 间切换。

/approve
  对 auto-review 最近拒绝的动作批准一次重试。

/sandbox-add-read-dir
  Windows 下临时增加 sandbox 可读目录。
```

这些不是 conversation 属性，也不是 provider session tree 属性，而是 thread/turn execution boundary：

```ts
interface AgentThreadPermissionSettings {
  approvalPolicy?: string
  approvalsReviewer?: string
  sandboxMode?: string
  sandboxPolicy?: unknown
  permissionProfileId?: string
  sandboxWorkspaceRoots?: string[]
}
```

在 MovScript UI 中，权限设置应该显示为当前 thread 的执行边界，并允许 turn 级覆盖。

### 上下文控制

Codex thread 需要管理模型上下文窗口。相关能力包括：

```text
/compact
  压缩可见 transcript，释放 context window。

thread/tokenUsage/updated
  通知 thread token usage。

thread/compacted
  通知 context 已 compact。

/mention
  把文件或目录作为上下文附加到下一次输入。

/ide
  引入 IDE 当前打开文件、选择区等上下文。

attachments / images
  把截图或文件作为输入上下文。
```

这些应映射为：

```ts
interface AgentThreadContextState {
  tokenUsage?: unknown
  contextWindow?: number | null
  compactedAt?: number
  attachedContext?: unknown[]
}
```

不要把 context compaction 当成新 conversation。它仍然发生在同一个 provider thread 上。

### 外部能力控制

Codex 支持在 session/thread 中启用和查看外部能力：

```text
/mcp
  查看 MCP server 和工具。

/skills
  浏览和使用 skills。

/plugins
  管理 plugins。

/apps
  浏览 apps/connectors。

/hooks
  查看 lifecycle hooks。

/experimental
  切换实验能力。

/memories
  控制 memory 注入和生成。
```

这些不是 thread lifecycle，但会影响 thread 可用工具和上下文。可以归为：

```ts
interface AgentThreadCapabilityState {
  mcpServers?: unknown[]
  skills?: unknown[]
  plugins?: unknown[]
  apps?: unknown[]
  hooks?: unknown[]
  memories?: unknown
  experimentalFeatures?: string[]
}
```

其中 memories 具有跨 thread 性质，应区分：

```text
thread 是否使用 memories
thread 是否允许生成 memories
全局/配置默认 memory 策略
```

### 多 agent 与 session tree

Codex subagent 会产生 child threads。相关字段包括：

```text
Thread.parentThreadId
Thread.sessionId
```

`Thread.sessionId` 用于表达这些相关 thread 属于同一个 session tree。CLI 里 `/agent` 可以切换 active agent thread。

MovScript 应明确：

```text
providerThreadId
  当前展示或操作的具体 thread。

providerSessionTreeId
  一组相关 thread 的树 id。

parentProviderThreadId
  subagent 父 thread。
```

如果未来支持多 agent 面板，应该以 `providerSessionTreeId` 聚合，以 `providerThreadId` 作为具体 tab/action 主键。

### 控制能力总表

| 分类 | Codex 能力 | MovScript 推荐状态 |
|---|---|---|
| Thread 生命周期 | start、resume、fork、read、list、archive、unarchive、close | `AgentConversationThreadBinding` |
| Turn 生命周期 | start、steer、interrupt | `activeTurnId`、`turnStatus` |
| 协作模式 | `/plan`、`CollaborationMode` | `collaborationMode` |
| 目标控制 | `/goal`、`ThreadGoal` | `threadGoal` |
| 模型控制 | `/model`、`model`、`modelProvider` | `executionSettings` |
| 速度/服务档 | `/fast`、`serviceTier` | `executionSettings.serviceTier` |
| 推理控制 | `effort`、`summary` | `executionSettings.reasoning*` |
| 个性控制 | `/personality`、`personality` | `executionSettings.personality` |
| 权限边界 | `/permissions`、approval、sandbox | `permissionSettings` |
| 自动审核 | `approvalsReviewer`、`/approve` | `permissionSettings.approvalsReviewer` |
| 上下文窗口 | `/compact`、token usage | `contextState` |
| 外部上下文 | `/mention`、`/ide`、attachments | `contextState.attachedContext` |
| 外部工具 | MCP、skills、plugins、apps、hooks | `capabilityState` |
| 多 agent | subagent、`/agent`、parent thread | `sessionTreeState` |

目标上，MovScript 的 agent adapter 不应只抽象“发消息”。它应该抽象完整的 thread control surface：

```ts
interface AgentThreadControlSurface {
  lifecycle: AgentThreadLifecycleActions
  turns: AgentTurnActions
  collaboration: AgentCollaborationModeActions
  goals?: AgentThreadGoalActions
  executionSettings: AgentThreadExecutionSettingsActions
  permissions: AgentThreadPermissionActions
  context: AgentThreadContextActions
  capabilities: AgentThreadCapabilityActions
}
```

不同 provider 可以声明 capability，而不是强行都支持。

## 当前 MovScript 代码现状

### `AgentChatDataSource`

位置：

```text
apps/frontend/src/features/agent/domain/agentChatProtocol.ts
```

这层目前是最接近正确方向的抽象。它暴露的是：

```text
listThreads
readThread
startThread
renameThread
archiveThread
unarchiveThread
deleteThread
startTurn
steerTurn
interruptTurn
startTextTurn
subscribeThread
subscribeServerRequests
```

这基本对齐 Codex app-server 的 thread/turn 模型。它应该继续作为前端 agent adapter 的统一接口。

需要补强的是类型命名：

```ts
export interface AgentChatThread {
  provider: AgentChatProviderKind
  id: string
  sessionId: string
  // ...
}
```

这里的 `sessionId` 对 Codex 来说是 `Thread.sessionId`，语义更准确的名字应是：

```ts
providerSessionTreeId?: string
codexSessionId?: string
```

保留 `sessionId` 会让调用方误以为这是 provider runtime instance、登录 session 或 MovScript conversation id。

### `createAppServerChatDataSource`

位置：

```text
apps/frontend/src/shared/infrastructure/app-server/appServerChatDataSource.ts
```

这层把 app-server RPC 转成 `AgentChatDataSource`。当前映射关系是合理的：

```text
thread/list       -> listThreads
thread/read       -> readThread
thread/start      -> startThread
thread/archive    -> archiveThread
thread/unarchive  -> unarchiveThread
turn/start        -> startTurn
turn/steer        -> steerTurn
turn/interrupt    -> interruptTurn
```

它还把 run profile 映射到 approval/sandbox：

```text
approvalPolicy
approvalsReviewer
permissions
sandbox
sandboxPolicy
```

这个方向是对的。未来不要把 sandbox/approval 放进 `Conversation` 作为长期属性，而应该作为 thread 默认策略或 turn 覆盖策略。

### `agentChatThreadFromAppServerThreadTurnItem`

位置：

```text
apps/frontend/src/shared/infrastructure/app-server/appServerThreadTurnItemProtocolAdapter.ts
```

当前代码把 app-server `Thread` 映射成前端 `AgentChatThread`：

```ts
return {
  provider,
  id: thread.id,
  sessionId: thread.sessionId || thread.id,
  // ...
}
```

这里 `id` 是 provider thread id，`sessionId` 是 Codex session tree id。这个 fallback 虽然便于 UI 不空值，但会隐藏概念差异。

建议迁移为：

```ts
return {
  provider,
  id: thread.id,
  providerThreadId: thread.id,
  providerSessionTreeId: thread.sessionId || undefined,
  // ...
}
```

如果兼容旧代码需要保留 `sessionId`，也应该在类型上标注 deprecated，并让新代码只读 `providerSessionTreeId`。

### `agentSessionStore`

位置：

```text
apps/frontend/src/features/agent/state/agentSessionStore.ts
```

当前状态里最混乱的是：

```ts
export interface AgentConversationProviderSessionState {
  conversationId: string
  sessionId?: string
  threadId?: string
  runId?: string
  run?: AgentRun
  status?: string
  loading: boolean
  building: boolean
  approving: boolean
  stopping: boolean
  stopRequested: boolean
}
```

它同时承载：

- UI conversation 的本地状态。
- provider thread 绑定。
- provider session tree id。
- active run。
- transient UI loading/stopping 状态。

建议拆成两个方向：

```ts
interface AgentConversationThreadBinding {
  conversationId: string
  provider: AgentChatProviderKind
  providerInstanceId?: string
  providerThreadId: string
  providerSessionTreeId?: string
}

interface AgentConversationRuntimeState {
  conversationId: string
  activeTurnId?: string
  activeRunId?: string
  run?: AgentRun
  status?: string
  loading: boolean
  building: boolean
  approving: boolean
  stopping: boolean
  stopRequested: boolean
  error?: string
  updatedAt: number
}
```

不一定要马上物理拆 store，但新代码应按这个模型理解。

### `AgentChatDataSourceFactoryOptions.workspaceContext`

位置：

```text
apps/frontend/src/features/agent/application/agentChatDataSourceFactory.ts
```

当前 `workspaceContext` 用来启动 scoped app-server：

```text
workspaceContext -> ensureScopedAppServer -> providerSessionCwd -> defaultThreadCwd
```

这里的 `workspaceContext` 是 MovScript 业务上下文；`providerSessionCwd` 是 provider thread 默认 cwd。二者相关但不等价。

建议未来改名：

```text
MovScriptWorkspaceContext
  业务上下文，包含 project/production/entity 等语义。

ProviderThreadCwd
  provider 执行目录。

AppServerInstanceScope
  app-server 进程实例的启动范围。
```

## 建议命名表

| 名称 | 含义 | 推荐字段 |
|---|---|---|
| UI Conversation | MovScript 前端会话/tab/历史项 | `conversationId` |
| Provider Thread | provider 侧长期对话/任务会话 | `providerThreadId` |
| Codex Thread | Codex 的 thread | `codexThreadId`，或在通用层使用 `providerThreadId` |
| Provider Session Tree | 同一 session tree 的 thread 分组 | `providerSessionTreeId` |
| Codex Session Tree | Codex `Thread.sessionId` | `codexSessionId` |
| Active Turn | 当前执行中的 turn | `activeTurnId` |
| Agent Run | MovScript runtime 的 run/task graph | `runId` 或 `activeRunId` |
| App Server Instance | provider app-server 进程实例 | `providerInstanceId` / `appServerInstanceId` |
| Thread CWD | provider thread 执行目录 | `providerThreadCwd` |
| MovScript Workspace Context | 业务上下文 | `workspaceContext` |
| Codex Project Root | Codex 配置发现根 | `codexProjectRoot` |
| Sandbox Workspace Roots | 权限边界 | `workspaceRoots` / `sandboxWorkspaceRoots` |

## 不建议继续使用的裸名

### `sessionId`

除非字段所在类型已经非常明确，例如直接对应 Codex generated protocol `Thread.sessionId`，否则业务代码不应继续新增裸 `sessionId`。

推荐替代：

```text
providerSessionTreeId
codexSessionId
authSessionId
appServerSessionId
providerRuntimeSessionId
```

根据语义选择一个。

### `workspaceRoot`

除非字段明确处在文件系统权限或 CLI 配置模块里，否则不要裸用。

推荐替代：

```text
movscriptWorkspaceRoot
codexProjectRoot
providerThreadCwd
sandboxWorkspaceRoots
projectSourceRoot
```

### `ProviderSession`

这个词可以保留，但要限定语义。它不应再同时表达 conversation、thread、run、cwd、runtime instance。

如果指 Codex `Thread.sessionId`，用 `ProviderSessionTree`。

如果指 app-server 进程实例，用 `ProviderRuntimeInstance` 或 `AppServerInstance`。

如果指前端 conversation 绑定，用 `ConversationThreadBinding`。

## 目标架构

推荐的长期模型：

```text
AgentConversation
  id
  title
  archived
  createdAt
  updatedAt

AgentConversationThreadBinding
  conversationId
  provider
  providerId
  providerInstanceId
  providerThreadId
  providerSessionTreeId
  providerThreadCwd

AgentConversationRuntimeState
  conversationId
  activeTurnId
  activeRunId
  run
  ui status flags

AgentChatDataSource
  provider-neutral thread/turn operations

Provider Adapter
  Codex app-server / Mova / Claude 等协议转换

Runtime Instance Registry
  app-server endpoint、profile、workspaceContext、cwd、health
```

关系如下：

```text
AgentConversation
  1 -> 0..1 AgentConversationThreadBinding
  1 -> 0..1 AgentConversationRuntimeState

AgentConversationThreadBinding
  -> AgentChatDataSource(providerInstanceId)
  -> Provider Thread(providerThreadId)
  -> Provider Session Tree(providerSessionTreeId)

Runtime Instance Registry
  -> AppServer endpoint/profile
  -> scoped workspaceContext
  -> default providerThreadCwd
```

## 迁移路线

### 第一阶段：只加概念层与类型别名

不改行为，先减少新代码继续扩大混乱。

- 新增 `AgentConversationThreadBinding` 类型。
- 新增 `providerSessionTreeId` 字段。
- 在 `AgentChatThread` 中保留 `sessionId`，但标注为兼容旧代码。
- 新代码优先读写 `providerSessionTreeId`。
- 写一两个纯函数集中解析旧字段：

```ts
function providerSessionTreeIdFromThread(thread: AgentChatThread): string | undefined
function providerThreadIdFromConversation(...)
```

### 第二阶段：收敛 store 写入入口

把这些入口集中为一个绑定 API：

```text
bindConversationToProviderThread
clearConversationThreadBinding
updateConversationRuntimeState
```

逐步替代：

```text
setConversationProviderSessionId
setConversationProviderThreadId
setProviderThreadId
setConversationSessionId
setConversationProviderSessionState
```

这些旧方法可以先保留，内部转调新方法。

### 第三阶段：UI 与 query cache 读新字段

优先迁移：

- conversation sidebar grouping。
- thread restore。
- active conversation selection。
- provider session status light。
- page task attach/run restore。

迁移时不改变本地存储 schema 的清理策略，先兼容读旧字段，写新字段。

### 第四阶段：重命名 legacy `ProviderSession`

当调用点收敛后，再把 legacy 名称拆掉：

```text
AgentConversationProviderSessionState
  -> AgentConversationRuntimeState

conversationProviderSessionStates
  -> conversationRuntimeStates

providerThreadIdsByConversation
  -> conversationThreadBindings[conversationId].providerThreadId

sessionIdsByConversation
  -> conversationThreadBindings[conversationId].providerSessionTreeId
```

### 第五阶段：文案与用户概念统一

用户可见文案里建议统一：

```text
Conversation
  对话

Thread
  provider 线程 / Agent 线程 / 任务线程

Session tree
  会话树，通常只在 debug 面板出现

Workspace root
  根据上下文写成 MovScript 工作区根、Codex 项目根、执行目录、权限根
```

不要在普通 UI 里展示裸 `session`，除非页面是 debug/diagnostic。

## 判断规则

遇到命名不确定时，按下面问题判断：

```text
这个 ID 是 UI tab/history 的 ID？
  -> conversationId

这个 ID 能传给 provider 的 thread/read、turn/start、resume？
  -> providerThreadId

这个 ID 表示多个 related threads 的共同分组？
  -> providerSessionTreeId

这个 ID 是一次执行或任务图？
  -> runId / activeRunId

这个 ID 是一次 thread 内的执行回合？
  -> turnId / activeTurnId

这个值是 provider 进程 endpoint/profile？
  -> providerInstanceId / appServerInstanceId

这个路径是 provider 执行 cwd？
  -> providerThreadCwd

这个路径是 MovScript 配置/数据根？
  -> movscriptWorkspaceRoot

这个路径是 Codex 发现 .codex/AGENTS.md 的根？
  -> codexProjectRoot

这个路径是 sandbox 可读写边界？
  -> sandboxWorkspaceRoots
```

## app-server 重启后旧 thread 404 的排查结论

现象：

```text
重启 MovScript 管理的 app-server 后，前端保存的旧 thread id 再打开时返回 404 / 找不到。
磁盘上又能看到类似：
$CODEX_HOME/sessions/2026/06/07/rollout-...jsonl
```

这里最容易误判的点是：Codex 的 `$CODEX_HOME/sessions` 存在，不代表当前 app-server 进程一定在同一个 home 下查找，也不代表前端传给 `thread/read` 的就是 Codex `Thread.id`。

### Codex 侧实际行为

Codex app-server 里有两条相关 RPC：

```text
thread/read
  输入 threadId。
  返回 Thread 视图。
  includeTurns=true 时会加载 rollout history。

thread/resume
  输入 threadId / history / path。
  对非运行 thread，按 threadId 从磁盘加载并恢复成可继续运行的 thread。
  对已经运行的 thread，则 rejoin 现有 thread 并订阅后续事件。
```

从当前源码看，`thread/read` 不是只读内存。它会：

1. 先看 `thread_manager` 里有没有 loaded thread。
2. 再通过 `LocalThreadStore.read_thread()` 读持久化信息。
3. 本地 store 会先查 SQLite metadata，再查 live writer，最后扫描 `$CODEX_HOME/sessions` / `$CODEX_HOME/archived_sessions` 里的 rollout 文件。
4. 按 id 查找时要求 id 是 UUID 格式，并最终按 rollout 文件名或 session metadata 里的 thread id 匹配。

所以：如果同一个 `$CODEX_HOME` 下确实有对应 `Thread.id` 的 rollout，`thread/read` 理论上也应能读到。`thread/resume` 仍然是“恢复并继续运行”的更准确入口，但当前这个 404 不能简单归因成 `thread/read` 完全不支持磁盘恢复。

### MovScript 当前调用链

当前前端 app-server datasource 是这样走的：

```text
AgentChatDataSourceShell.openThread()
AgentChatDataSourceShell.loadThreads()
  -> dataSource.readThread(threadId, { includeTurns: true })
  -> AppServerChatDataSource.readThread()
  -> AppServerRpcClient.readThread()
  -> JSON-RPC thread/read
```

`AppServerRpcClient` 目前没有显式封装 `thread/resume`。这会带来一个语义问题：UI 的“打开历史 thread”和“恢复一个 provider thread 继续跑”都被压成了 `readThread()`。

建议整理后把两种动作拆开：

```text
readThread(threadId)
  只表达读取 Thread 视图。

resumeThread(threadId, options)
  表达恢复/重连 provider runtime。
  后续继续 turn/start 前，应优先确保已经 resume/rejoin。
```

短期最小修复可以是：

```text
AppServerRpcClient 增加 resumeThread()
AppServerChatDataSource 增加 resumeThread() 或 restoreThread()
AgentChatDataSourceShell.openThread()/active restore 对 app-server provider 优先走 resumeThread()
```

如果只是左侧列表点击后展示历史，`readThread` 仍可保留；如果点击后用户马上可能继续发送消息，语义上应该先 `thread/resume`。

### 404 最可能的原因

按当前代码，优先怀疑下面几类。

前端保存的不是 Codex `Thread.id`。

Codex `Thread` 里同时有：

```text
id
sessionId
```

MovScript adapter 目前映射为：

```text
AgentChatThread.id = Thread.id
AgentChatThread.sessionId = Thread.sessionId || Thread.id
```

`thread/read` / `thread/resume` 要传的是 `Thread.id`。如果某条路径把 `sessionId`、provider profile id、MovScript conversation id 当成 thread id 传回 app-server，就会找不到。尤其要避免把 `sessionIdsByConversation` 里的值拿去调 `thread/read`。

4. thread 没有 materialize 到磁盘。

Codex 的空 thread 或还没产生首个用户消息的 thread，可能只有内存态或 metadata 不完整。重启后没有可读 rollout，就会出现 `thread not loaded`、`no rollout found for thread id ...`、`includeTurns is unavailable before first user message` 这类错误。

5. thread 被 archive 到 `archived_sessions`，或过滤条件不一致。

`thread/read` / `thread/resume` 当前代码对 archived 有不同处理：read 会 include archived 构建视图，resume 会拒绝 archived thread 并提示先 unarchive。列表还可能受 source/provider/cwd 过滤影响，导致 UI 列表看不到但磁盘上存在。

### 现场验证步骤

先不要只看磁盘路径，应该对齐四个值：

```text
前端要打开的 threadId
app-server status.home
app-server status.workspaceDir
app-server status.providerSessionCwd
```

具体检查：

1. 在 Electron app-server status 里看当前进程：

```text
profileId
home
workspaceDir
providerSessionCwd
config.sourceConfigPath
```

2. 确认旧 rollout 是否在当前 `home` 下：

```text
<status.home>/sessions/YYYY/MM/DD/rollout-...-<threadId>.jsonl
```

3. 确认文件名里的 UUID 和前端传入的 threadId 一致。Codex 按 id 查找要求 UUID 格式；如果传入的是 `session_xxx`、`thread_xxx`、provider profile id 或 conversation id，就不是同一个概念。

4. 如果当前 provider 是 Mova，确认当前进程环境应满足：

```text
MOVA_HOME=<workspaceDir>/.movscript/.mova
CODEX_HOME=<workspaceDir>/.movscript/.mova
```

如果当前 provider 是 Codex，则通常是：

```text
CODEX_HOME=<workspaceDir>/.movscript/.codex
```

5. 如果 `thread/read` 失败但文件确定存在，可用 `thread/resume` 再验证一次。若 `resume` 也返回 `no rollout found for thread id ...`，基本就是 home/id 不一致，而不是 UI read/resume 选择问题。

### 建议改造点

这块整理应该放在 agent adapter 层和 app-server datasource 层，而不是让 UI 组件理解 Codex 的所有细节。

建议新增抽象：

```text
AgentChatDataSource.readThread(threadId)
  读取 provider thread 视图。

AgentChatDataSource.resumeThread(threadId, options)
  恢复 provider thread runtime，并返回完整 Thread。

AgentChatDataSource.restoreThread(threadRef)
  MovScript 语义：从 UI/history 恢复一个 thread。
  app-server provider 内部可选择 thread/resume。
```

`threadRef` 不要只放一个字符串，建议至少包含：

```text
providerId
providerKind
providerInstanceId
providerThreadId
providerSessionTreeId?
movscriptWorkspaceRoot?
providerThreadCwd?
```

这样重启 app-server 时可以用 provider profile + workspace root 找到正确的 home，而不是拿一个裸 thread id 去当前默认 provider 里碰运气。

## Codex 风格输入框 UI 抽象

用户截图里的 Codex 输入框可以拆成三层：

```text
Composer shell
  输入区域本体，承载文本、附件、语音、发送。

Context menu
  通过左下角 + 打开，管理本 turn 要附加的上下文和工具入口。

Thread control strip
  输入框底部/右侧的轻量控制区，管理模型、权限、发送动作等。
```

截图中的菜单项不是同一类概念，应该在 MovScript UI 里分组建模：

```text
添加照片和文件
  类型：turn input attachment
  作用域：当前 turn
  provider 映射：UserInput image/localImage/file/mention

附加 Cursor
  类型：external app/context connector
  作用域：当前 turn 或当前 thread
  provider 映射：IDE/app connector、MCP resource、workspace context

包含 IDE 背景信息
  类型：context toggle
  作用域：当前 thread 默认值，可被 turn 覆盖
  provider 映射：IDE diagnostics、open files、selection、terminal state

计划模式
  类型：thread control mode
  作用域：thread / next turn
  provider 映射：Codex plan mode 或 adapter 模拟的 planning-only prompt

追求目标
  类型：thread goal state
  作用域：thread
  provider 映射：Codex goal mode / thread goal API

插件
  类型：capability/plugin marketplace
  作用域：provider instance / user settings / thread available tools
  provider 映射：Codex plugin、skill、MCP、app connector
```

输入框底部的控制也应该拆成不同字段：

```text
+ button
  打开上下文菜单，不直接代表一个 provider capability。

默认权限
  当前 thread/turn 的 execution permission profile。
  对 Codex 映射到 sandbox、approvalPolicy、permissions、approvalsReviewer。
  UI 上不要叫 session 权限，应该叫权限/执行权限/运行权限。

模型选择，例如 5.5 中
  当前 thread 默认模型或下一 turn 覆盖模型。
  应记录 model、modelProvider、reasoningEffort / serviceTier。
  切模型不等于新建 session，也不等于切 provider home。

麦克风
  输入方式，属于 composer modality。
  输出仍应归一化成 UserInput 或 transcript item。

发送按钮
  turn/start。
  如果当前 thread 是历史恢复来的，发送前应确保已经 resume/rejoin。
```

### UI 到数据模型的建议

建议在 `AgentComposer` 附近形成一个中间状态，而不是把这些开关散落在 UI 组件里：

```text
AgentComposerDraft
  text
  inputs[]
  attachments[]
  contextAttachments[]
  modelOverride?
  permissionProfileOverride?
  planModeEnabled?
  goalModeEnabled?
  goalId?
  pluginSelections[]
```

发送时 adapter 转成 provider 请求：

```text
AgentComposerDraft
  -> AgentChatDataSource.startTurn({
       threadId,
       inputs,
       model?,
       runProfile?,
       context?,
       controlState?
     })
```

不要让 UI 直接拼 Codex 的 `ThreadResumeParams`、`TurnStartParams`。UI 只表达 MovScript 概念；app-server adapter 再把它映射到 Codex 协议。

### UI 交互规范

Codex 截图给 MovScript 的参考价值主要是信息架构：

```text
左下角：上下文和能力入口。
底部中间：执行权限。
右下角：模型、语音、发送。
菜单中段：thread control toggles。
菜单底部：插件/扩展入口。
```

建议 MovScript 保持这个布局，但文案按自己的概念改清楚：

```text
添加照片和文件
附加工作区上下文 / 附加 IDE 上下文
包含 IDE 背景信息
计划模式
追求目标
插件
默认权限
模型
```

不要把 `session` 暴露到这个输入框主 UI。`sessionId` / `providerSessionTreeId` 只应该在 debug 面板、thread 详情或诊断信息里出现。

### 与 agent adapter 的边界

输入框组件只需要依赖 capability：

```text
supportsAttachments
supportsIdeContext
supportsPlanMode
supportsGoalMode
supportsPlugins
supportsPermissionProfiles
supportsModelOverride
supportsVoiceInput
```

adapter 负责回答：

```text
这个 provider 是否支持原生 plan mode？
goal mode 是原生 API，还是 prompt 模拟？
权限 profile 能否 turn 级覆盖？
模型切换是 thread 级，还是 turn 级？
插件列表来自 Codex plugin、MCP、还是 MovScript 自己的 registry？
```

这样 UI 不需要知道 Codex 的 plan/goal/model/permission 具体 RPC，也不会把 provider-specific 概念扩散到 MovScript 通用组件。

### 与恢复旧 thread 的关系

这个输入框还有一个重要状态：

```text
canSend
```

当用户打开历史 thread 时，如果它只是 `readThread()` 读出来的视图，不一定已经 rejoin provider runtime。用户点击发送前，应该有一层保障：

```text
ensureThreadReadyForTurn(threadRef)
  app-server provider -> thread/resume
  已 loaded/running -> rejoin
  找不到 -> 给出 home/provider/thread id 诊断
```

所以 UI 上看起来只是一个发送按钮，底层应该明确区分：

```text
展示历史：readThread
继续对话：resumeThread + turn/start
```

## 仍需确认的问题

- MovScript 自己的 provider runtime 是否也需要 session tree，还是只复用 Codex `Thread.sessionId`。
- `AgentRun` 与 Codex `Turn` 是否需要一一映射，还是只在特定 provider 上有关联。
- 页面任务 `AgentPageTaskState` 是否应该绑定 conversation，还是应该直接绑定 provider thread。
- app-server scoped instance 是否应该按 workspaceContext 复用，还是每个 conversation 独立启动。
- 后续物理删除 `conversationProviderSessionStates` 前，标题、历史 projection、旧 provider runtime session 是否要拆成独立 store。

## 当前保留边界

已经执行的低风险整理：

- app-server/Codex adapter 新代码使用 `providerThreadId` / `providerSessionTreeId`。
- UI 和 send pipeline 主路径使用 `conversationThreadBindings` / `conversationRuntimeStates`。
- 旧 `providerThreadIdsByConversation` / `sessionIdsByConversation` 已退出 runtime store 主状态，仅 e2e seed 保留输入兼容。
- Debug/diagnostic 文案区分 runtime session、thread 和 session tree。
- Codex generated protocol 和旧 provider runtime API 中语义明确的 `sessionId` 不改名。

仍不直接做的事项：

- 重写 `AgentChatDataSource`。
- 把 Codex generated protocol 里的 `sessionId` 改名。
- 把 sandbox/approval 固化成 conversation 属性。
- 用 app-server process id 替代 provider thread id 作为 conversation 绑定主键。
- 直接删除 `conversationProviderSessionStates`。它仍承担旧 provider runtime projection、标题兼容和历史反查。

## 已落地的代码边界

当前整理已经按低风险迁移路线落到前端 agent/app-server adapter：

```text
AgentChatThread
  新增 providerThreadId。
  新增 providerSessionTreeId。
  保留 sessionId 作为 deprecated 兼容字段。

agentChatThreadFromAppServerThreadTurnItem
  id -> provider thread id。
  Thread.sessionId -> providerSessionTreeId。
  不再把 thread.id fallback 成 sessionId。

AppServerRpcClient / AgentChatDataSource
  新增 resumeThread。
  app-server provider 映射到 thread/resume。

AgentChatDataSourceShell
  打开/恢复 active thread 时优先 resumeThread。
  resume 不可用或失败时回退 readThread。

agentSessionStore
  新增 conversationThreadBindings。
  新增 conversationRuntimeStates。
  新增 AgentConversationRuntimePatch，应用层运行态 patch 不再依赖旧 ProviderSessionState 类型。
  旧 providerThreadIdsByConversation / sessionIdsByConversation 已从 runtime store 主状态移除。
  e2e seed 仍兼容旧 providerThreadIdsByConversation 输入，但会归一化写入 conversationThreadBindings。
  旧 setConversationProviderSessionId / setConversationProviderThreadId / setProviderThreadId / setConversationSessionId 转写新 binding。

UI / send pipeline
  conversationThreadBindings 作为 conversation -> provider thread 的优先读取来源。
  conversationRuntimeStates 作为 active run / loading / building / approving / stopping / stopRequested 的主读取来源。
  send stream / stop / approval / plan / error cleanup 的运行态 patch 通过 updateConversationRuntimeState 注入。
  send stream 的停止请求判断读取 conversationRuntimeStates，不再读取 conversationProviderSessionStates。
  sessionIdsByConversation / providerThreadIdsByConversation 不再作为 UI fallback。
  conversationProviderSessionStates 只作为旧 provider runtime projection、标题兼容和历史 binding fallback，不再作为 UI 运行态主读取来源。
  send completion / accepted source 绑定优先写 setConversationProviderSessionTreeId 和 setConversationProviderThreadBindingId。
  删除 provider thread 时会同时扫描 conversationThreadBindings，避免只写新 binding 的 conversation 残留。

Composer / debug 文案
  输入框主 UI 显示 provider/model 标识和执行控制，不暴露裸 session。
  Debug/diagnostic 文案区分 runtime session、thread 和 session tree。
```

需要特别注意：旧 `provider-session-client` 的 `sessionId` 仍表示 MovScript/provider runtime session。app-server/Codex adapter 的 `providerSessionTreeId` 表示 Codex session tree。这两类语义已经分轨，后续不要再把 app-server `Thread.sessionId` 当作通用 provider runtime session 使用。

第四阶段的实际边界是：新 app-server/Codex thread 绑定主路径已经脱离裸 `sessionId`，旧 `providerThreadIdsByConversation` / `sessionIdsByConversation` 不再存在于 runtime store 主状态；运行态主路径已经迁到 `conversationRuntimeStates` 和 `updateConversationRuntimeState`。仍保留 `conversationProviderSessionStates`，原因是旧 `provider-session-client`、trace、run detail、timeline 仍以 `ProviderSession` 表达 MovScript/provider runtime session，同时部分历史 conversation 仍需要从旧 projection 反查 thread/session tree。后续如果要物理删除 `conversationProviderSessionStates`，应先把标题存储和旧 provider runtime projection 拆出独立命名，并补本地状态 schema migration。
