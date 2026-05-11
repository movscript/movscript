# MovScript Agent 设计规范

> 本文档定义 MovScript agent 的定位、交互模型、架构原则和重构路线图。面向产品和工程决策，可直接作为重构 `apps/production-runtime/` → `apps/agent/` 的实施依据。

> 更新：Agent 的上层产品模型已经收敛为 proposal-first。任何 Agent 都可以在对话中直接创建一个或多个 proposal；workflow、页面按钮和插件只是 proposal producer。完整设计见 [Proposal-first Agent Design](proposal-first-agent-design.md)。本文中较早的“草稿预览”“确认”“应用”示例，都应按 `proposal -> review -> apply preview -> apply` 解释；Agent 不直接修改正式项目数据。

---

## 一、Agent 是什么

MovScript agent 是一个**创作助手**，专门帮助用户完成两件事：

1. **规划项目** — 把用户的想法转化为项目结构（集数、场景、素材位）
2. **创作内容** — 针对当前选中的实体，生成或修改具体内容

Agent 不是通用 AI 助手。它不回答"帮我写一封邮件"，不做项目管理，不处理与当前项目无关的请求。它的能力边界由它能调用的工具决定，工具之外的事它不做。

---

## 二、核心用户场景

### 场景 A：规划项目

**用户在哪里**：项目首页、项目结构页，或者刚创建了一个空项目。

**用户想做什么**：把脑子里的想法变成一个有结构的项目。

**典型对话**：
```
用户：我想做一个5集的都市爱情短剧，主角是两个在咖啡馆相遇的陌生人
Agent：好的，我来帮你搭一个基础结构。
      第一集通常是相遇和建立关系，你希望两人在第几集产生冲突？
用户：第三集
Agent：明白了。我给你起草一个5集结构：
      第1集：相遇（咖啡馆，初识）
      第2集：靠近（日常接触，好感建立）
      第3集：冲突（误会或价值观碰撞）
      第4集：和解（转折点）
      第5集：结局
      [草稿预览]
      确认后我会创建这5个集的框架。
```

**Agent 的职责**：
- 理解用户的创作意图
- 主动提问补全关键信息（集数、类型、核心冲突）
- 生成结构草稿，等待用户确认
- 用户确认后，批量创建实体

**Agent 不做的事**：
- 不自动写完所有内容（用户还没确认方向）
- 不在用户没有明确意图时主动修改已有内容

---

### 场景 B：创作/修改内容

**用户在哪里**：某个具体实体的编辑页面（某一集、某个场景、某个内容单元）。

**用户想做什么**：针对当前这个实体，生成或改写内容。

**典型对话**：
```
用户：[当前选中：第3集 > 场景2：咖啡馆争吵]
用户：这个场景太平了，帮我改得更有张力一点
Agent：我先读一下当前内容。
      [读取场景2的现有内容]
      我看到现在的写法是两人平静地说出分歧。
      我给你改一版，加入情绪爆发和一个反转：
      [草稿预览]
      这个方向对吗？
用户：对，但结尾改成她先离开
Agent：好，更新草稿：
      [更新后的草稿预览]
用户：确认
Agent：已应用。
```

**Agent 的职责**：
- 自动读取当前选中实体的内容（不需要用户说"先读一下"）
- 理解修改意图，填充或修改草稿
- 支持多轮修改草稿，直到用户满意
- 用户确认后写入

**Agent 不做的事**：
- 不在用户没有确认的情况下直接写入
- 不跨越当前实体去修改其他内容（除非用户明确要求）

---

## 三、交互模型

### 3.1 Agentic Loop：Agent 自主规划

移除独立 Planner 组件。LLM 在每一步都能看到之前所有工具调用的结果，自己决定下一步做什么。

```
用户消息
    ↓
LLM 决定：我需要做什么？（可能先读取上下文）
    ↓
调用工具（读取数据、填充或修改草稿等）
    ↓
LLM 观察结果，决定下一步
    ↓
调用工具 或 直接回复用户
    ↓
...直到任务完成或达到迭代上限
```

**为什么移除 Planner**：
- Plan 在执行前就固定了，无法根据中间结果调整
- LLM 本身就有规划能力，不需要一个独立组件来"帮它规划"
- 现有 Planner 产生的 Plan/Task 结构增加了维护负担，没有对应的产品价值

**Agentic loop 的好处**：
- Agent 能根据读到的内容调整方向（比如发现项目已经有5集了，就不再建议创建新集）
- 行为更可预测：每一步工具调用都是 LLM 当下决策的结果
- 代码更简单：去掉 Planner 层，执行流程变成一个 while 循环

### 3.2 上下文感知：Agent 知道用户在哪里

Agent 启动时自动获取最小上下文：
- 当前页面路由
- 当前项目 ID
- 当前选中的实体（类型 + ID）

这是 agent 的起点。它不需要用户说"我在看第3集的场景2"，它已经知道了。

其他数据（实体内容、项目结构等）通过工具调用按需获取，不在启动时一次性加载。

### 3.3 Proposal-first：所有写操作先进入可审阅提案

Agent、页面按钮、workflow、插件或批处理都可以作为 producer 创建本地 proposal draft。页面预置草稿壳可以提升体验，但不是创建 proposal 的硬前置。

```
producer → proposal draft → review → apply preview → apply
```

这里的 proposal draft 是 runtime 和客户端之间的审阅协议对象，不是后端正式领域实体。它是本地的，不影响正式数据。用户可以拒绝 proposal，什么都不会发生。

这个机制适用于所有正式写入：创建实体、修改内容、批量操作和跨实体合并。Agent 可以创建和修改 proposal，但最终 apply 是 UI/应用层在用户确认后的动作。

AI 面板和页面任务里的 artifact/产物在当前阶段不表示另一套实体。`AgentTaskArtifactRef` 只是指向本地 proposal draft 的轻量引用，用来把一次 run 和页面可审阅提案关联起来。产品界面应优先使用“提案”或具体业务名词；只有未来出现非提案输出（图片、文件、生成任务结果等）时，才把 artifact 扩展为真正的多类型产物集合。

默认一个页面任务只绑定一个主 proposal，但一个 thread 可以产生多个 proposal。批量变更应进入一个复合 proposal，例如 `production_proposal` 内部承载多个 segment、scene moment、creative reference usage 和 asset need 节点；内容单元、关键帧、台词定稿和运镜表属于下游制作工作台，不要默认让 Agent 在编排 proposal 里一起写入，以免用户面对应用顺序、部分失败和撤销边界不清的问题。

Proposal draft 不属于 AI 面板会话，也不属于前端 conversation。它是 local runtime 持久化的审阅协议对象，应通过项目、类型、状态、来源 thread/run、目标实体和页面上下文来定位。AI 面板只展示当前 thread 涉及的 proposal；跨 thread 的历史 proposal 必须进入独立的 Proposal Center 或历史草稿页。

当前 thread 涉及的 proposal 包括：

- `createdByThreadId` 或 `sourceThreadId` 等于当前 thread。
- `createdByRunId` 或 `sourceRunId` 属于当前 thread 的 run。
- `source`、`target`、`metadata` 明确引用当前页面上下文，并且该引用来自当前 run。

Proposal Center / AI 历史草稿页是跨 thread 的提案资产库，负责筛选、预览、打开来源 thread、跳转目标页面、apply preview、应用、拒绝和归档。AI 面板可以提供入口链接，但不能把历史 proposal 库合并进聊天面板，也不能把 proposal 内容保存到前端持久化 store。

### 3.4 AI 面板、Thread 和持久化边界

AI 面板是展示层和操作入口，不是会话数据库。

最终状态下：

- `apps/agent runtime` 是 thread、message、run、trace、draft、memory 的唯一持久化事实源。
- AI 面板根据当前 `threadId` 读取 runtime 状态并渲染消息、运行进度、审批和当前 thread 草稿。
- 前端 store 只能保存短生命周期 UI 状态，例如输入框、当前选中 `threadId`、展开状态、筛选条件、临时 streaming 文本。
- 页面任务桥只能保存 `requestId -> threadId/runId` 这类最小索引，不能保存完整消息、thread、run 或 draft。
- 刷新、重开面板、恢复任务时必须回读 runtime；如果 runtime 记录不存在，展示缺失状态，不用前端旧快照伪造对话。

现有 `agentStore` / `agentSessionStore` 中保存面板 conversation、消息、thread 绑定和 run 摘要的做法是过渡实现，需要逐步迁移到 runtime thread 读取模型。

---

## 四、工具设计原则

### 4.1 工具是 Agent 的能力边界

Agent 能做的事 = 它拥有的工具。工具之外的事，agent 应该明确告诉用户"我做不到"，而不是编造一个假的执行过程。

### 4.2 工具分三类

**读取类**（无需审批，自动执行）：
- `get_context_pack` — 读取当前上下文快照
- `list_projects` — 列出可见项目
- `list_productions` / `read_current_production` / `read_production_context` — 读取制作业务上下文
- `list_drafts` — 列出本地草稿

**草稿类**（页面/应用层拥有，不作为默认 agent 工具暴露）：
- `update_draft` — 更新草稿内容（待实现）

**写入类**（需要用户确认）：
- `create_script` — 保存正式剧本记录（`risk: write`，`approval: always`）
- `create_generation_job` — 触发 AI 生成任务（`risk: generate`，`approval: always`）

`apply_draft` 不再作为 agent 可见工具暴露。草稿应用是 UI/应用层审阅动作：agent 只产出或修改 draft，UI 根据 draft 类型、页面上下文和用户确认调用应用层 apply API。

**UI 类**（触发前端行为，无需审批）：
- 不暴露给 agent 的通用实体打开工具；前端根据页面上下文自行导航

### 4.3 工具粒度：一个工具做一件事

不要有"读取所有项目数据"这样的大工具。应该是：
- 读取项目基本信息
- 读取集列表
- 读取指定集的场景列表
- 读取指定场景的内容

粒度细的工具让 agent 的每一步操作都是可见的、可解释的。

---

## 五、Sandbox 模式（调试模式）

### 5.1 目的

Sandbox 模式是一个**调试工具**，让开发者和测试人员能够：
- 观察 agent 在真实输入下的完整执行轨迹
- 验证 agent 的工具调用决策是否符合预期
- 在不污染真实数据的情况下测试写操作路径

Sandbox 模式下，agent **完整运行到结束**，不会因为遇到写操作而中断。读操作正常执行，写操作被拦截并返回模拟结果。

### 5.2 拦截规则

| 工具风险级别 | Sandbox 行为 |
|---|---|
| `read` | 正常执行 |
| `ui` | 正常执行 |
| `draft` | 正常执行（本地操作，无副作用） |
| `write` | 拦截，返回模拟结果 |
| `generate` | 拦截，返回模拟结果 |
| `destructive` | 拦截，返回模拟结果 |

**被拦截工具的模拟返回格式**：

```json
{
  "sandboxed": true,
  "wouldHaveExecuted": {
    "name": "movscript.create_generation_job",
    "args": { "prompt": "example" }
  },
  "simulatedResult": "写入/生成工具已模拟执行（sandbox 模式，未实际写入）",
  "interceptedAt": "2024-01-01T00:00:00.000Z"
}
```

### 5.3 类型变更

**`AgentRunPolicy`（`types.ts`）**：

```typescript
interface AgentRunPolicy {
  approvalMode: 'interactive' | 'auto_readonly' | 'auto'
  sandboxMode?: boolean        // 新增：启用 sandbox 拦截
  maxToolCalls: number
  maxIterations: number
  allowNetwork: boolean
  allowFileBytes: boolean
}
```

注：移除 `dry_run` approvalMode（当前是死代码），用 `sandboxMode: true` 替代其语义。

**`AgentRunStep`（`types.ts`）**：

```typescript
interface AgentRunStep {
  id: string
  type: 'tool_call' | 'message'   // 移除 'planning' | 'subagent'（随 Planner 一起删除）
  status: 'pending' | 'running' | 'completed' | 'failed'
  toolName?: string
  args?: Record<string, unknown>
  result?: unknown
  error?: string
  sandboxed?: boolean              // 新增：该步骤是否被 sandbox 拦截
  createdAt: string
  completedAt?: string
}
```

**`CreateRunInput`（`types.ts`）**：

```typescript
interface CreateRunInput {
  threadId?: string
  agentManifest?: AgentManifest
  approvedToolNames?: string[]
  clientInput: AgentClientInput
  backendAuthToken?: string
  sandboxMode?: boolean            // 新增：是否以 sandbox 模式运行
}
```

### 5.4 实现位置

在 `agentRuntime.ts` 的 `callTool()` 方法中，在实际执行工具之前插入拦截逻辑：

```typescript
// callTool() 内，工具执行前
if (run.policy.sandboxMode && isSandboxIntercepted(tool.risk)) {
  const sandboxResult = buildSandboxResult(call)
  recordStep(run, {
    type: 'tool_call',
    toolName: call.name,
    args: call.args,
    result: sandboxResult,
    sandboxed: true,
    status: 'completed',
  })
  return sandboxResult
}
```

`isSandboxIntercepted(risk)` 返回 `true` 的风险级别：`write`、`generate`、`destructive`。

草稿 apply 走 UI/应用层 API，不进入 agent tool loop；sandbox 只负责拦截 agent 可见的写入、生成和破坏性工具。

### 5.5 HTTP API

`POST /runs` 请求体新增 `sandboxMode` 字段：

```json
{
  "threadId": "thread_abc",
  "message": "帮我修改第3集场景2的内容",
  "sandboxMode": true
}
```

响应中的 steps 会包含 `sandboxed: true` 标记，前端可以用不同样式展示被拦截的步骤。

### 5.6 前端展示建议

- 被拦截的步骤显示为灰色或带"沙盒"标签
- Run 整体标记为 `sandbox` 模式，在 UI 顶部显示提示条
- 沙盒 Run 的结果不触发草稿确认流程

---

## 六、命名规范

### 6.1 服务命名

当前 `apps/production-runtime/` 这个名字有两个问题：
- `production` 在工程语境里是"生产环境"，在产品语境里是"内容制作"，两个含义撞车
- `runtime` 暗示它是某个东西的运行时，但它实际上是主 agent 服务

**改名为 `apps/agent/`**。

### 6.2 核心概念命名

**保留**：
- **Thread**（对话线程）：一个持续的对话会话
- **Run**（执行实例）：用户发一条消息，创建一个 Run 来处理
- **Draft**（草稿）：待确认的内容变更
- **Step**（执行步骤）：Run 中的每一个操作记录

**产品入口**：
- **AI 面板**：当前 thread 的展示与操作入口，只展示当前 thread 涉及的草稿。
- **AI 历史草稿页**：跨 thread 的草稿库，展示所有可审阅草稿并提供筛选和处理动作。

**移除**：
- **Plan / Planner**：不再有独立的规划阶段，LLM 在 agentic loop 中自主决策
- **Task**：Plan 的子概念，随 Plan 一起移除
- **Envelope**：实现细节，不需要作为核心概念暴露

### 6.3 产品内"制作"概念

产品内的"制作"流程（生成视频、分配任务等）建议用 **Creation** 或 **Authoring** 而不是 **Production**，避免与工程术语冲突。

---

## 七、架构图

```
┌─────────────────────────────────────────────────────┐
│                    前端（Web / Electron）              │
│  项目规划页 / 内容编辑页                               │
│  发送消息 → 读取 Runtime Thread/Run/Draft 并展示        │
│  AI 面板只保存临时 UI 状态，不保存历史消息或草稿         │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP
                       ▼
┌─────────────────────────────────────────────────────┐
│                  Agent 服务（Node.js）                 │
│                                                      │
│  Thread / Run 管理                                    │
│       ↓                                              │
│  Agentic Loop                                        │
│    LLM ←→ 工具调用 ←→ 工具结果                        │
│       ↓                                              │
│  [Sandbox 拦截层]（可选）                              │
│       ↓                                              │
│  Draft 管理（本地，跨 Thread 可查询）                   │
│       ↓                                              │
│  Apply Client（用户确认后写入）                        │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP
                       ▼
┌─────────────────────────────────────────────────────┐
│                  后端（Go API）                        │
│  实体数据（集、场景、内容单元等）                       │
│  LLM 网关                                             │
│  MCP 工具实现                                         │
└─────────────────────────────────────────────────────┘
```

---

## 八、两个场景的 Agent 行为约束

### 场景 A（规划项目）的约束

- Agent 应该主动提问，补全创作意图（类型、集数、核心冲突）
- 生成结构草稿前，必须确认用户的基本方向
- 批量创建实体前，必须展示完整预览并等待确认
- 不应该在用户没有明确意图时修改已有项目结构

### 场景 B（创作内容）的约束

- Agent 启动时自动读取当前选中实体的内容，不需要用户说"先读一下"
- 修改建议必须以草稿形式呈现，不直接写入
- 支持多轮修改草稿（用户说"改一下结尾"，agent 更新草稿而不是创建新草稿）
- 不跨越当前实体去修改其他内容，除非用户明确要求

---

## 九、不在 Agent 能力范围内的事

以下场景 agent 应该明确拒绝或引导用户用其他方式处理：

- 与当前项目无关的通用问答
- 视频渲染、导出等技术操作（这些是系统功能，不是 agent 的工作）
- 需要外部信息的任务（agent 没有联网能力）
- 超出工具能力范围的操作（agent 不能凭空创造工具不支持的功能）

---

## 十、重构指南

### 10.1 重构目标

将 `apps/production-runtime/` 重构为 `apps/agent/`，核心变化：

1. 移除 Planner 层，用 agentic loop 替代
2. 移除 Plan/Task/Envelope 类型
3. 实现 sandbox 模式
4. 简化执行流程

### 10.2 文件处置清单

#### 保留（基本不动）

| 文件 | 说明 |
|---|---|
| `runtime/toolRegistry.ts` | 工具注册表，风险级别定义 |
| `runtime/toolPolicy.ts` | 工具权限检查逻辑 |
| `runtime/draftStore.ts` | 草稿存储接口和实现 |
| `runtime/draftApply.ts` | 草稿应用逻辑 |
| `runtime/backendApplyClient.ts` | 后端写入客户端 |
| `runtime/store.ts` | Thread/Run 内存存储 |
| `runtime/fileStore.ts` | Thread/Run 文件持久化 |
| `runtime/capabilityResolver.ts` | 工具能力解析 |
| `runtime/agentManifest.ts` | Agent 清单定义 |
| `runtime/context.ts` | 上下文提取 |
| `runtime/skillResolver.ts` | Skill 解析 |
| `runtime/modelConfig.ts` | LLM 模型配置 |
| `runtime/memory/` | 记忆系统（全部保留） |
| `server.ts` | HTTP 服务器（小改动） |

#### 重写

| 文件 | 说明 |
|---|---|
| `runtime/agentRuntime.ts` | 核心执行引擎，移除 Plan/Task，改为 agentic loop |
| `runtime/types.ts` | 类型定义，移除 Plan/Task/Envelope，新增 sandboxMode/sandboxed |
| `runtime/assistantMessage.ts` | 适配 agentic loop，移除对 plan/envelope 的依赖 |
| `runtime/promptCompiler.ts` | 重新设计系统提示，面向 agentic loop |

#### 删除

| 文件 | 说明 |
|---|---|
| `runtime/planner.ts` | 基于规则的 Planner，完全删除 |
| `runtime/modelPlanner.ts` | 基于模型的 Planner，完全删除 |

### 10.3 类型系统变更

#### 移除的类型

```typescript
// 全部删除
interface AgentTaskPlan { ... }
interface AgentPlanTask { ... }
interface AgentInputEnvelope { ... }
interface AgentModelPlanner { ... }
```

#### 修改的类型

```typescript
// AgentRunPolicy：移除 dry_run，新增 sandboxMode
interface AgentRunPolicy {
  approvalMode: 'interactive' | 'auto_readonly' | 'auto'
  sandboxMode?: boolean
  maxToolCalls: number
  maxIterations: number
  allowNetwork: boolean
  allowFileBytes: boolean
}

// AgentRunStep：移除 planning/subagent 类型，新增 sandboxed
interface AgentRunStep {
  id: string
  type: 'tool_call' | 'message'
  status: 'pending' | 'running' | 'completed' | 'failed'
  toolName?: string
  args?: Record<string, unknown>
  result?: unknown
  error?: string
  sandboxed?: boolean
  createdAt: string
  completedAt?: string
}

// AgentRun：移除 plan、pendingApprovals（或简化）、envelope
interface AgentRun {
  id: string
  threadId: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  steps: AgentRunStep[]
  agentManifest?: AgentManifest
  policy: AgentRunPolicy
  createdAt: string
  completedAt?: string
}

// CreateRunInput：新增 sandboxMode
interface CreateRunInput {
  threadId?: string
  agentManifest?: AgentManifest
  approvedToolNames?: string[]
  clientInput: AgentClientInput
  backendAuthToken?: string
  sandboxMode?: boolean
}
```

### 10.4 Agentic Loop 实现规范

新的 `executeRun()` 核心逻辑：

```typescript
async function executeRun(run: AgentRun, input: AgentClientInput): Promise<void> {
  // 1. 加载上下文（轻量，只拿路由/项目ID/选中实体）
  const context = await loadMinimalContext(input)

  // 2. 加载记忆
  const memories = await memoryManager.loadRelevantMemories(run, context)

  // 3. 解析工具能力
  const capabilities = await resolveAgentCapabilities(run.agentManifest, context)

  // 4. 构建初始消息列表
  const messages: ChatMessage[] = [
    buildSystemPrompt(run, context, capabilities),
    { role: 'user', content: input.message.content },
  ]

  // 5. Agentic loop
  let iterations = 0
  while (iterations < run.policy.maxIterations) {
    iterations++

    // 调用 LLM
    const llmResponse = await callLLM(messages, capabilities.tools)

    // 如果 LLM 直接回复（无工具调用），结束循环
    if (!llmResponse.toolCalls || llmResponse.toolCalls.length === 0) {
      recordMessageStep(run, llmResponse.content)
      break
    }

    // 执行工具调用
    const toolResults: ToolCallResult[] = []
    for (const toolCall of llmResponse.toolCalls) {
      const result = await callTool(run, toolCall)  // sandbox 拦截在这里
      toolResults.push(result)
      recordToolStep(run, toolCall, result)
    }

    // 把工具结果追加到消息列表，让 LLM 继续
    messages.push({ role: 'assistant', content: llmResponse.content, toolCalls: llmResponse.toolCalls })
    messages.push({ role: 'tool', content: formatToolResults(toolResults) })
  }

  // 6. 提取记忆
  await memoryManager.extractAndWriteMemories(run, messages)
}
```

**关键约束**：
- `maxIterations`：默认 8，防止无限循环
- `maxToolCalls`：单次 Run 的工具调用总数上限，默认 20
- 每次工具调用都记录为一个 Step，前端可实时展示进度

### 10.5 系统提示设计

系统提示应该包含：

```
你是 MovScript Agent，一个专注于短剧和视频内容创作的助手。

你的能力边界：
- 读取和修改当前项目的内容（集、场景、内容单元等）
- 创建内容草稿，等待用户确认后写入
- 帮助用户规划项目结构

你不做的事：
- 不回答与当前项目无关的问题
- 不在用户确认前直接写入数据
- 不跨越当前选中实体去修改其他内容（除非用户明确要求）

当前上下文：
- 路由：{route}
- 项目：{projectId} {projectName}
- 选中实体：{entityType} {entityId}

可用工具：{toolList}
```

### 10.6 重构步骤

按以下顺序执行，每步可独立验证：

**第一步：类型清理**
1. 在 `types.ts` 中删除 `AgentTaskPlan`、`AgentPlanTask`、`AgentInputEnvelope`
2. 修改 `AgentRunPolicy`：移除 `dry_run`，新增 `sandboxMode`
3. 修改 `AgentRunStep`：移除 `planning`/`subagent` 类型，新增 `sandboxed`
4. 修改 `AgentRun`：移除 `plan`、`envelope` 字段
5. 修改 `CreateRunInput`：新增 `sandboxMode`

**第二步：删除 Planner**
1. 删除 `planner.ts`
2. 删除 `modelPlanner.ts`
3. 在 `agentRuntime.ts` 中移除所有对 Planner 的引用

**第三步：重写执行引擎**
1. 重写 `agentRuntime.ts` 的 `executeRun()` 为 agentic loop
2. 重写 `callTool()` 加入 sandbox 拦截逻辑
3. 删除 `planRun()`、`executeTask()` 方法

**第四步：适配 LLM 调用**
1. 重写 `assistantMessage.ts`，移除对 plan/envelope 的依赖
2. 重写 `promptCompiler.ts`，面向 agentic loop 的系统提示

**第五步：HTTP API 更新**
1. 在 `server.ts` 的 `POST /runs` 处理中读取 `sandboxMode` 并传入 `CreateRunInput`
2. 移除 `/runs/preview` 端点（或保留但标记为 deprecated）

**第六步：重命名**
1. 将 `apps/production-runtime/` 目录重命名为 `apps/agent/`
2. 更新所有引用该路径的配置文件（`package.json`、`docker-compose.yml`、CI 配置等）
3. 更新 `fileStore.ts` 中的默认状态路径（`.movscript-production-runtime/` → `.movscript-agent/`）

### 10.7 不需要改动的部分

以下逻辑在重构后保持不变，不要动：

- `backendApplyClient.ts` 的 PATCH 路由和字段白名单
- `draftStore.ts` 的草稿生命周期（draft → accepted → applied）
- `toolPolicy.ts` 的权限检查逻辑
- `toolRegistry.ts` 的工具注册和风险级别定义
- `memory/` 目录的全部文件
- `capabilityResolver.ts` 的工具发现逻辑
- `agentManifest.ts` 的默认清单（不默认授予 `create_draft`，`apply_draft` 不暴露给 agent）
