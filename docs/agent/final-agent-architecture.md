# MovScript Agent Final Architecture

更新时间：2026-04-29

## 当前判断

现有实现已经有本地 `movscript-agent`、MCP client、runtime thread/run、manifest、静态 tool registry 和审批策略；前端 `AIAgentPanel` 也可以在 debug preview 中触发 local runtime dry-run。

但 agent 能力还不是最终形态：

- skills 目前主要是 agent 配置里的 `skills: [{ id, name, description }]`，前端只把 `skillIds` 放进 manifest metadata；runtime 不会解析 skill 内容，也不会把 skill 当作独立上下文包注入 planner/model。
- tools 已有静态 `DEFAULT_TOOL_REGISTRY` 和 MCP 调用通道，但还没有把 MCP `tools/list` 动态发现结果统一纳入可执行工具目录；planner 还是规则式关键词 planner，不是基于模型 tool calling 做选择。
- local runtime 已经支持客户端只提交结构化 `clientInput`，由 runtime 构建消息、上下文、skills、tools、policy 和 prompt preview。前端仍保留 legacy cloud-chat 路径，但 local runtime 路径不再需要前端拼接 agent prompt。

## 最终目标

Agent 发送前、执行中、执行后都应围绕同一个结构化契约：

```text
Agent Input Envelope
  context: 当前业务与会话上下文
  skills: 该 agent 可用的行为/专业能力包
  tools: 该 agent 被授权使用的 MCP/runtime tools
  messages: 用户可见对话
  policy: 权限、审批、风险和成本约束
```

debug 页面展示的是这个 envelope，而不是拼接后的 prompt。拼接 prompt 只是某个 model adapter 的序列化结果。

## 前端边界

前端必须保持展示层定位。它可以收集用户输入、附件引用和当前 UI snapshot，但不能拥有 agent 的核心决策：

- 不在前端拼 system prompt、skills prompt、tool prompt 或最终模型消息。
- 不在前端决定 planner、tool ordering、权限策略、审批策略或最终回复模型。
- 不在前端把用户自定义 agent 转成 manifest；manifest/profile 的解析属于 agent runtime 或 agent gateway。
- 不在前端直接执行 agent tool；前端只展示 run、plan、tool call、approval、draft 和 debug trace。

前端到 agent runtime 的输入契约应保持稳定：

```ts
interface AgentClientInput {
  message: string
  attachments?: Array<{
    id?: string
    name?: string
    type?: string
    mimeType?: string
    size?: number
    resourceId?: number
  }>
  uiSnapshot?: {
    route?: { pathname?: string; search?: string; hash?: string }
    project?: { id?: number; name?: string; status?: string; description?: string }
    selection?: { entityType?: string; entityId?: number | string; label?: string } | null
    recentResources?: Array<{ id?: number; name?: string; type?: string; mimeType?: string; size?: number }>
    labels?: string[]
  }
}
```

这使前端可以替换 agent provider：只要新 agent 实现相同 thread/run/approval/draft/debug API，前端无需理解新 agent 的内部 planner、prompt 或工具实现。

## Debug 页面结构

### 1. 上下文 Context

展示 agent 本轮能看到的事实，不展示能力。

建议字段：

```ts
interface AgentDebugContextPanel {
  route: {
    pathname: string
    search?: string
    hash?: string
  }
  project?: {
    id: number
    name: string
    status?: string
    description?: string
  }
  user?: {
    id: number
    username: string
    systemRole?: string
  }
  selection?: {
    entityType: string
    entityId: number | string
    label?: string
  } | null
  recentResources: Array<{
    id: number
    name: string
    type: string
    mimeType?: string
    size?: number
  }>
  attachments: Array<{
    id: string
    name: string
    type: string
    resourceId?: number
  }>
  memories: Array<{
    id: string
    scope: 'global' | 'project' | 'thread'
    kind: string
    content: string
  }>
  labels: string[]
}
```

UI 形态：

- summary row：项目、route、selection、memory count、attachment count。
- `Project / Route / Selection` 小节。
- `Recent Resources / Attachments / Memories` 列表。
- `Raw context JSON` 可折叠。

### 2. Skills

展示该 agent 的“稳定能力定义”，不是临时上下文。

建议把现有 `AgentSkill` 升级为 manifest 一等字段：

```ts
interface AgentSkillManifest {
  id: string
  name: string
  description: string
  version?: string
  enabled: boolean
  priority?: number
  instruction: string
  appliesWhen?: string
  inputHints?: string[]
  outputContract?: string
  toolHints?: string[]
  metadata?: Record<string, unknown>
}
```

debug 展示：

- enabled skills 数量。
- 每个 skill 的 name、description、instruction 摘要。
- skill 影响的 prompt 片段。
- skill 推荐 tools：只作为 planner hint，不直接越权授权。

重要边界：

- skill 负责“怎么做”，tool grant 负责“能不能做”。
- skill 不能绕过 manifest permissions 和 tool policy。
- skill 可以建议使用 `movscript.create_draft`，但是否允许执行仍由 tools/policy 决定。

### 3. Tools

展示本轮“可发现、可授权、可执行、需审批”的工具集合。

建议统一三个来源：

```text
MCP discovered tools
  来自 MCP tools/list，描述真实可调用 schema

Runtime registered tools
  来自 ToolRegistry，描述 permission、risk、projectScoped、approval 默认值

Agent tool grants
  来自 AgentManifest，描述当前 agent 是否允许、审批模式
```

合并后的 debug 数据结构：

```ts
interface AgentDebugTool {
  name: string
  description?: string
  inputSchema?: unknown
  source: 'mcp' | 'runtime' | 'plugin'
  registered: boolean
  granted: boolean
  permission?: string
  risk?: 'read' | 'draft' | 'write' | 'generate' | 'destructive' | 'ui'
  projectScoped?: boolean
  approval: 'never' | 'always' | 'on_write'
  available: boolean
  unavailableReason?: string
}
```

debug 展示：

- Available tools：本轮模型可选择的工具。
- Blocked tools：发现了但由于 permission / grant / project context / approval 不可执行。
- Planned tool calls：planner/model 本轮实际选择的工具调用。
- Pending approvals：需要用户确认的调用。
- Raw tool schemas：可折叠，方便排查 MCP schema。

## 运行时架构

### 1. Agent Manifest v2

现有 `movscript.agent.v1` 可以保留兼容，但最终建议扩展为：

```ts
interface AgentManifestV2 {
  schema: 'movscript.agent.v2'
  id: string
  version: string
  name: string
  description?: string
  soul?: string
  skills: AgentSkillManifest[]
  permissions: string[]
  tools: Array<{
    name: string
    mode: 'allow' | 'deny'
    approval?: 'never' | 'always' | 'on_write'
  }>
  model?: {
    provider?: string
    modelId?: string
    platformModelId?: number
  }
  metadata?: Record<string, unknown>
}
```

兼容策略：

- 前端仍可提交 v1。
- runtime `normalizeAgentManifest` 将 v1 转成内部 `ResolvedAgentManifest`。
- v1 的 `metadata.skillIds` 只作为历史字段，不再作为最终 skill 来源。

### 2. Runtime Agent Input Builder

```text
apps/agent/src/runtime/agentRuntime.ts
  normalizeClientInput()
  buildRuntimeUserMessage()
  buildDebugContext()
  compilePromptPreview()
```

职责：

- 接收前端传入的 `clientInput`。
- 从 MCP `movscript.get_context_pack` 和 `uiSnapshot` 合并 route、project、selection、recent resources、attachments。
- 收集 active manifest、skills、tools、policy、memories。
- 生成 runtime request、debug 页面和 model adapter 共用的 envelope。

### 3. Runtime Capability Resolver

在 `movscript-agent` 增加 capability resolver：

```text
MCPClient.listTools()
        +
StaticToolRegistry.list()
        +
AgentManifest.tools
        +
current context
        ↓
ResolvedToolCatalog
```

建议 endpoint：

```text
GET /capabilities
POST /runs/preview
```

`/capabilities` 返回当前 MCP resources、MCP tools、registered tools、default manifest、resolved tool catalog。

`/runs/preview` 返回：

```ts
interface AgentRunPreview {
  context: AgentDebugContextPanel
  skills: AgentSkillManifest[]
  tools: AgentDebugTool[]
  promptPreview?: {
    system: string
    messages: Array<{ role: string; content: string }>
  }
  plan: AgentTaskPlan
  toolCalls: ToolCall[]
  pendingApprovals: AgentApprovalRequest[]
  warnings: string[]
}
```

### 4. Planner / Model Loop

最终执行链路：

```text
user message
  -> AgentInputEnvelope
  -> context pack
  -> skill instruction pack
  -> resolved tool catalog
  -> model planner/tool calling
  -> tool policy validation
  -> execute MCP tools
  -> observe results
  -> optional approval pause
  -> final response synthesis
```

短期可以保留当前规则式 `planner.ts`，但它的输入应改成：

```ts
planAgentRun({
  message,
  context,
  skills,
  tools,
  memories,
})
```

这样后续替换成模型 planner 时，不需要改 UI/debug/API 契约。

## MCP Tools 引入方式

MCP 的角色应该是“真实工具发现与执行通道”，不是只读 context helper。

分层：

```text
MCP Tool Definition
  name, description, inputSchema

Runtime Tool Registration
  permission, risk, projectScoped, approval default

Agent Grant
  allow/deny + approval override

Policy Decision
  available / blocked / requires approval
```

执行前必须检查：

- tool 是否存在于 MCP `tools/list`。
- tool 是否在 runtime registry 注册。
- agent manifest 是否 grant。
- required permission 是否在 manifest.permissions 中。
- projectScoped tool 是否有 currentProjectId。
- risk 是否需要 approval。

## Skills 引入方式

skills 不应该只是 UI 配置字段，而应该进入 prompt/context 编译链路。

推荐分三层：

```text
Skill Definition
  平台/用户配置：名称、说明、稳定指令、适用条件、输出约束、推荐工具

Skill Resolver
  根据当前 agent、用户请求、上下文选择 enabled skills

Skill Compiler
  编译成 model system/developer prompt 片段，并写入 debug preview
```

第一阶段可以先不做复杂选择，直接启用当前 agent 的所有 skills；但数据结构要预留 `enabled`、`appliesWhen` 和 `priority`。

## 核心数据契约

最终内部运行时不应该直接依赖前端 payload 或某个模型 provider 的 message 格式，而应该先归一化成稳定的 `AgentInputEnvelope`。

```ts
interface AgentInputEnvelope {
  id: string
  threadId?: string
  runId?: string
  mode: 'preview' | 'run'
  message: {
    role: 'user'
    content: string
    attachments?: AgentInputAttachment[]
  }
  history: Array<{
    id: string
    role: 'user' | 'assistant' | 'system'
    content: string
    createdAt: string
  }>
  context: AgentDebugContextPanel
  manifest: ResolvedAgentManifest
  skills: ResolvedAgentSkill[]
  tools: ResolvedToolCatalog
  policy: AgentRunPolicy
  memories: AgentMemoryRef[]
  model?: AgentModelBinding
  debug: {
    source: 'frontend' | 'runtime'
    warnings: string[]
    compiledPrompt?: CompiledPromptPreview
  }
}
```

配套类型：

```ts
interface ResolvedAgentManifest {
  schema: 'movscript.agent.v2'
  id: string
  version: string
  name: string
  description?: string
  soul?: string
  permissions: string[]
  tools: AgentToolGrant[]
  skills: AgentSkillManifest[]
  model?: AgentModelBinding
  metadata: Record<string, unknown>
  sourceSchema: 'movscript.agent.v1' | 'movscript.agent.v2'
}

interface ResolvedAgentSkill extends AgentSkillManifest {
  enabled: boolean
  resolvedPriority: number
  activationReason: 'manifest' | 'applies_when' | 'user_selected' | 'default'
  compiledInstruction: string
  warnings: string[]
}

interface ResolvedToolCatalog {
  discovered: AgentDebugTool[]
  available: AgentDebugTool[]
  blocked: AgentDebugTool[]
  byName: Record<string, AgentDebugTool>
}

interface AgentRunPolicy {
  approvalMode: 'interactive' | 'dry_run' | 'auto_readonly'
  maxToolCalls: number
  maxIterations: number
  allowNetwork: false
  allowFileBytes: false
  costLimit?: {
    currency: string
    amount: number
  }
}
```

边界规则：

- 前端可以构造 envelope 初稿，但 runtime 必须重新 normalize manifest、resolve tools、检查 policy。
- debug 页面消费 envelope 和 preview，不从 prompt 字符串反推 context/skills/tools。
- model adapter 只消费 `CompiledPrompt` 和 `available tools`，不能直接读未经 resolver 处理的 manifest。

## 前端 Agent Input Builder

前端 builder 的目标是“收集 UI 已知事实”和“展示 runtime 结果”，不是执行安全决策。

建议文件：

```text
apps/frontend/src/agent/inputBuilder.ts
apps/frontend/src/agent/manifest.ts
apps/frontend/src/agent/debugSections.ts
```

`buildAgentInputEnvelopeDraft()` 输入：

```ts
interface BuildAgentInputEnvelopeDraftInput {
  message: string
  conversationId: string
  threadId?: string
  agentManifest?: AgentManifest
  project?: Project
  route: {
    pathname: string
    search?: string
    hash?: string
  }
  selection?: AgentDebugContextPanel['selection']
  recentResources: AgentDebugContextPanel['recentResources']
  attachments: AgentDebugContextPanel['attachments']
  memories: AgentDebugContextPanel['memories']
  labels: string[]
}
```

builder 输出不应包含 runtime 自己才能判断的字段，例如 `available`、`requiresApproval`、`unavailableReason`。这些字段必须由 local agent `/runs/preview` 或 `/capabilities` 返回。

前端 debug tab 建议按照同一份数据渲染：

```text
Envelope
  Context
  Skills
  Tools
  Messages
  Policy
  Compiled Prompt
  Runtime Trace
  Raw
```

`Compiled Prompt` 是可选 tab。provider 没有被选择、或 preview 只做规则 planner 时，可以显示“未编译”，但 Context/Skills/Tools 仍必须完整。

## Runtime Capability Resolver 细节

resolver 是 agent 安全边界的核心，不应散落在 planner、server handler 和 tool executor 里。

建议文件：

```text
apps/agent/src/runtime/capabilityResolver.ts
apps/agent/src/runtime/skillResolver.ts
apps/agent/src/runtime/inputEnvelope.ts
apps/agent/src/runtime/promptCompiler.ts
```

resolver 流程：

```text
normalize manifest
  -> load MCP tools/list
  -> load runtime registered tools
  -> merge by tool name
  -> apply manifest grants
  -> apply permissions
  -> apply project context
  -> apply approval policy
  -> produce ResolvedToolCatalog
```

合并规则：

- `MCP discovered` 有 schema 和 description，但没有业务 permission。
- `Runtime registered` 有 permission、risk、projectScoped、approval default，但不证明 MCP 当前可调用。
- `Agent grant` 只表达该 agent 想允许什么，不能创建工具能力。
- 同名工具必须同时满足 discovered + registered + granted 才能进入 `available`。
- registry 中存在但 MCP 没发现的工具进入 `blocked`，原因是 `mcp_unavailable`。
- MCP 发现但 registry 未注册的工具进入 `blocked`，原因是 `unregistered`。

建议补齐 blocked reason：

```ts
type ToolUnavailableReason =
  | 'mcp_unavailable'
  | 'unregistered'
  | 'not_granted'
  | 'denied'
  | 'missing_permission'
  | 'missing_project'
  | 'approval_required'
  | 'schema_invalid'
```

`applyToolPolicy()` 可以继续保留，但最终应只处理“本轮请求调用是否可以执行”。工具目录是否可用应提前由 `resolveToolCatalog()` 计算。

## Prompt 编译

Prompt 编译需要可追踪，不能把 soul、skills、context、policy 混成一整段无法调试的字符串。

建议中间结构：

```ts
interface CompiledPrompt {
  system: string
  developer: string[]
  messages: Array<{
    role: 'user' | 'assistant' | 'system'
    content: string
  }>
  toolDefinitions: Array<{
    name: string
    description?: string
    inputSchema?: unknown
  }>
  debugParts: Array<{
    id: string
    kind: 'soul' | 'skill' | 'context' | 'policy' | 'tool'
    title: string
    content: string
  }>
}
```

编译顺序：

1. 平台基础系统指令：MovScript agent 的边界、不得越权、草稿优先。
2. Agent soul：agent 的人设/协作方式，只影响表达和偏好。
3. Skills：按 `priority` 排序编译，每个 skill 保留独立 debug part。
4. Context：只放本轮必要摘要；大型资源通过 tool 读取。
5. Policy：审批、成本、写入限制、最大 tool calls。
6. Messages：对话历史和当前用户消息。

Context 编译原则：

- route、project、selection 可以进入 prompt 摘要。
- resources 只进入名称、类型、ID、摘要，不进入文件 bytes。
- memories 要标注 scope，避免 thread memory 被误当成 global fact。
- attachments 如果需要读取内容，必须通过受控 tool 或后续明确的 attachment resolver。

## Planner 与模型循环

短期规则 planner 和长期模型 planner 应共享同一个接口。

```ts
interface AgentPlanner {
  plan(input: {
    envelope: AgentInputEnvelope
    prompt?: CompiledPrompt
  }): Promise<AgentTaskPlan>
}

interface AgentExecutor {
  run(input: {
    envelope: AgentInputEnvelope
    plan: AgentTaskPlan
  }): Promise<AgentRunExecutionResult>
}
```

规则 planner 阶段：

- 根据 message keyword 和 available tools 生成计划。
- 不再直接引用 `DEFAULT_TOOL_REGISTRY`。
- 不能计划 blocked tool，除非是为了在 preview 里解释为什么不可用。

模型 planner 阶段：

- 第一次模型调用生成 plan 或直接 tool calls。
- 每次 tool call 进入 runtime policy validation。
- tool result 作为 observation 回灌模型。
- 达到 `maxIterations` 或 `maxToolCalls` 后停止，并输出 warnings。
- 如果出现 pending approval，run 进入 `requires_action`，暂停模型循环。

最终响应合成：

- 已执行 tool 的结果要被总结给用户。
- 未执行 tool 要说明原因，例如缺少项目、未授权、需要审批但被拒绝。
- draft 创建后只返回 draft 引用，不把它伪装成正式写入。

## 审批与写入策略

审批对象应该是“具体 tool call”，不是只按 tool name 粗略批准。

```ts
interface AgentApprovalRequestV2 {
  id: string
  runId: string
  toolName: string
  args: Record<string, unknown>
  reason: string
  risk: AgentDebugTool['risk']
  permission: string
  diffPreview?: unknown
  costPreview?: {
    currency: string
    estimatedAmount: number
    modelId?: string
  }
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
  updatedAt: string
}
```

审批恢复规则：

- `approve` 必须按 `approvalIds` 批准具体请求；`approvedToolNames` 只保留为 v1 兼容。
- 批准后恢复同一个 run，继续从暂停点执行。
- 如果用户修改了上下文、项目或 manifest，应创建新 run，不复用旧 approval。
- `reject` 后当前 tool call 标记 skipped，run 可以生成带 warning 的回答。

写入类能力分阶段开放：

```text
read
  可直接执行，默认不审批

draft
  写入本地草稿，可不审批或轻审批

apply draft
  将草稿应用到项目实体，必须展示 diff 并审批

generate
  发起模型生成任务，必须展示成本/模型/输入摘要并审批

destructive
  删除、覆盖、批量修改，默认不进入普通 agent grant
```

## Memory 与上下文策略

memory 需要分 scope 管理，否则 debug 很难解释模型为什么知道某些事实。

建议 memory scope：

```text
global
  用户跨项目偏好，例如输出语言、格式偏好

project
  项目稳定事实，例如世界观、角色固定设定、命名规范

thread
  当前对话内的临时目标和决策

agent
  某个 agent 的长期行为偏好，不等同于业务事实
```

注入规则：

- `global` memory 默认最多注入少量高置信偏好。
- `project` memory 只有当前项目匹配时注入。
- `thread` memory 只在同一个 thread 内注入。
- 每条 memory 在 debug 中显示 id、scope、kind、source 和是否进入 prompt。
- 大段 memory 应先摘要，再注入摘要；原文通过 debug raw 或受控读取接口查看。

## API 设计

建议保持现有 API 可用，同时引入更适合 debug 和 resolver 的接口。

```text
GET /health
GET /inspect
GET /capabilities
POST /runs/preview
POST /threads
POST /threads/{threadId}/messages
POST /threads/{threadId}/runs
POST /runs/{runId}/approve
POST /runs/{runId}/reject
GET /runs/{runId}
GET /threads/{threadId}
```

`GET /capabilities` 可接收 query：

```text
projectId?: number
agentId?: string
includeSchemas?: boolean
```

响应：

```ts
interface AgentCapabilitiesResponse {
  defaultAgentManifest: ResolvedAgentManifest
  mcp: {
    connected: boolean
    resources: Array<{ uri: string; name?: string; mimeType?: string }>
    tools: Array<{ name: string; description?: string; inputSchema?: unknown }>
    error?: string
  }
  registry: RegisteredTool[]
  resolvedTools: ResolvedToolCatalog
  warnings: string[]
}
```

`POST /runs/preview` 必须做到：

- 不执行真实 tool。
- 返回 planned tool calls、blocked reasons、pending approvals。
- 返回 envelope 摘要和 compiled prompt preview。
- 与正式 run 使用同一套 resolver 和 policy。

## 可观测性与调试

每个 run 都应能回答四个问题：

```text
agent 看到了什么 context
agent 带了哪些 skills
agent 有哪些 available/blocked tools
agent 为什么选择或没有选择某个 tool
```

建议 run metadata：

```ts
interface AgentRunDebugTrace {
  envelopeId: string
  manifestId: string
  manifestVersion: string
  skillIds: string[]
  availableToolNames: string[]
  blockedTools: Array<{
    name: string
    reason: ToolUnavailableReason
  }>
  promptPartIds: string[]
  planner: 'rule' | 'model'
  model?: AgentModelBinding
}
```

debug UI 不需要默认展示全部 trace，但 raw 里必须能看到。

## 测试与验收标准

runtime 单元测试：

- v1 manifest 能 normalize 到内部 v2，旧字段不丢。
- skill resolver 能按 enabled、priority、appliesWhen 排序和过滤。
- capability resolver 能区分 discovered、registered、granted、available、blocked。
- MCP 未连接时，工具进入 blocked 并给出 `mcp_unavailable`。
- projectScoped tool 在没有 current project 时不可用。
- approval 只批准对应 approval id，不误放行同名其它调用。

前端测试：

- `buildLocalAgentManifest` 不再只输出 `metadata.skillIds`。
- debug preview 能展示 Context / Skills / Tools / Messages / Raw。
- local runtime offline 时仍能展示前端 envelope draft。
- local runtime online 时优先展示 runtime preview 返回的 resolved 数据。

集成验收：

- 用户问“查找项目里的镜头”，preview 显示 search/read tools available，run 能调用 read/search。
- 用户问“创建一个镜头草稿”，draft tool 可用，结果是 draft，不修改正式实体。
- 用户问“删除这个镜头”，tool 不可用或需要 destructive approval，默认不执行。
- 没有当前项目时，projectScoped tools 全部 blocked，并说明缺少项目上下文。
- MCP tools/list 返回新工具时，如果 runtime registry 没注册，debug 显示 discovered but blocked。

## 建议落地顺序

1. 调整 debug preview UI：把现有内容拆成 `Context / Skills / Tools / Messages / Runtime Preview / Raw`，先用已有数据填充。
2. 扩展前端 `AgentManifest` 类型：加入 `skills`，`buildLocalAgentManifest` 将 `agent.skills` 变成结构化 skills，而不是只放 `metadata.skillIds`。
3. 扩展 local agent `/inspect` 或新增 `/capabilities`：返回 MCP discovered tools + runtime registered tools + default manifest。
4. 扩展 `AgentRunPreview`：返回 resolved context、skills、tools，debug UI 改为消费 runtime 返回的结构。
5. 改造 `planner.ts` 输入，让规则 planner 先能读取 skills/tool catalog。
6. 引入模型 planner/tool calling：只替换 planner，不改变 envelope、debug、policy、execution API。
7. 接 write/generation tools：必须先走 draft/apply 和 cost approval，不直接默认开放。

## 不建议做的事

- 不要把 skills 塞进一整段不可追踪 prompt 后就结束；debug 必须能看到每个 skill 如何影响本轮输入。
- 不要让 MCP discovered tools 自动可执行；发现、注册、授权、审批必须分开。
- 不要让前端和 runtime 各自维护一套 tool policy；最终决策应在 `movscript-agent` runtime。
- 不要在 debug 页面只展示 raw JSON；raw 只能作为最后的排查入口。
