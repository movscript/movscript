# MovScript Agent 架构指南

> 本文档面向 MovScript 开发者，帮助你理解 production-runtime 的 agent 系统，并指导你如何改进它。不需要 agent 开发背景，所有概念都会从头解释。

---

## 第一部分：系统全景

### 1.1 三层架构

MovScript 的 agent 系统由三层组成：

```
┌─────────────────────────────────────────────────────────────────┐
│                    前端（Electron / Web）                         │
│  AgentDebugPage / ProductionOrchestratePage                      │
│  发送 HTTP 请求到 production-runtime                              │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTP (port 28765)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│              production-runtime（Node.js 进程）                   │
│  server.ts → AgentRuntime → planner → toolRegistry              │
│  监听 http://127.0.0.1:28765                                     │
│                           │                                      │
│                           │ MCP (port 18765)                     │
│                           ▼                                      │
│              MCPClient → movscript.* tools                       │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTP PATCH (port 8765)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    后端（Go API）                                  │
│  /api/v1/model-gateway/chat/completions  ← model planner 调用    │
│  /api/v1/scripts/:id  PATCH              ← apply_draft 写入       │
│  /api/v1/projects/:id/entities/*  PATCH  ← 各类实体写入           │
└─────────────────────────────────────────────────────────────────┘
```

**三层的职责：**

- **前端**：用户界面，发起对话，展示 run 状态和 debug 信息
- **production-runtime**：agent 的大脑，负责规划、执行工具调用、管理草稿和记忆
- **后端 Go API**：数据持久化，提供 MCP 工具的实际数据，以及 LLM 网关

### 1.2 核心概念词典

理解这些概念是读懂代码的前提。

**Thread（对话线程）**
一个持续的对话会话，包含多条消息。类似于 ChatGPT 的一个对话窗口。每个 Thread 有唯一 ID（如 `thread_abc123`），保存在 `~/.movscript-production-runtime/agent-state.json`。

**Run（执行实例）**
用户发送一条消息后，系统创建一个 Run 来处理这条消息。一个 Thread 可以有多个 Run（每次用户发消息就创建一个新 Run）。Run 有状态：`queued → in_progress → completed`，也可能是 `requires_action`（等待用户审批）或 `failed`。

**Plan（任务计划）**
Planner 分析用户消息后生成的执行计划。包含一个 `objective`（目标）、一个 `strategy`（策略）和多个 `tasks`（子任务）。Plan 是 Run 的一部分，存储在 `run.plan`。

**Task（子任务）**
Plan 中的一个执行单元。每个 Task 有 `title`、`description`、`agentRole`（planner/researcher/creator/reviewer/coordinator）和 `toolCalls`（要执行的工具调用列表）。Task 按顺序执行。

**Tool Call（工具调用）**
Agent 要执行的一个具体操作，如 `movscript.search_entities`、`movscript.create_draft`。每个 Tool Call 有 `name` 和 `args`。工具调用的结果会被收集到 `toolResults` 中，最终用于生成 assistant 回复。

**Draft（草稿）**
Agent 生成的内容草稿，存储在本地（不写入后端数据库）。草稿有生命周期：`draft → accepted/rejected → applied/superseded`。只有用户审批后，`apply_draft` 工具才会把草稿内容通过 PATCH 写入后端。草稿文件存储在 `~/.movscript-production-runtime/drafts/`。

**Memory（记忆）**
Agent 在对话过程中积累的知识片段。分三个作用域：`global`（全局）、`project`（项目级）、`thread`（对话级）。记忆会在每次 Run 开始时加载，并在 Run 结束时提取新记忆写入。记忆文件存储在 `~/.movscript-production-runtime/memories.json`。

**Manifest（能力清单）**
描述 agent 能力的配置文件，定义了 agent 的 `permissions`（权限）、`tools`（工具授权）和 `skills`（技能）。默认 manifest 在 `agentManifest.ts` 中定义，也可以通过插件系统扩展。

**Envelope（执行信封）**
一次 Run 的完整输入包，包含：用户消息、对话历史、当前上下文（路由、项目、选中实体）、可用工具列表、记忆、manifest 等。Planner 接收 Envelope 并生成 Plan。Envelope 存储在 `run.envelope`，可用于调试。

### 1.3 一次完整的 Run 是怎么走的

以用户发送"帮我分析第一集的场景"为例，完整流程如下：

**步骤 1：创建 Run**
`POST /runs` → `agentRuntime.createRun()` (`agentRuntime.ts:250`)
- 创建 Run 对象，状态设为 `queued`
- 异步调用 `executeRun(run.id)`，立即返回 Run 给前端

**步骤 2：获取上下文**
`executeRun()` → `callTool(run, 'movscript.get_context_pack')` (`agentRuntime.ts:635`)
- 调用 MCP 工具 `movscript.get_context_pack`，获取当前 UI 状态
- 返回：当前路由、当前项目 ID、当前用户、当前选中实体、最近访问资源
- 这是"推"模式的核心：所有上下文在这里一次性获取

**步骤 3：加载记忆**
`memoryManager.loadRelevantMemories()` (`agentRuntime.ts:641`)
- 加载 global 记忆 + 当前项目记忆 + 当前 thread 记忆
- 记忆会被放入 Envelope，供 Planner 参考

**步骤 4：解析能力**
`resolveAgentCapabilities()` (`agentRuntime.ts:645`)
- 调用 MCP `listTools()` 获取所有可用 MCP 工具
- 与 toolRegistry 中注册的工具对比，生成 `resolvedTools`（可用工具 + 被阻止工具）

**步骤 5：构建 Envelope**
(`agentRuntime.ts:655-680`)
- 把上下文、记忆、工具列表、manifest、用户消息打包成 `AgentInputEnvelope`
- 编译 prompt 预览（`compilePromptPreview`）

**步骤 6：规划**
`planRun(envelope, memories, auth)` (`agentRuntime.ts:919`)
- 检查是否有 `forcedToolCall`（产品界面直接触发的工具调用）
- 检查 `modelPlanner.isEnabled()`：
  - 如果 model-config.json 存在且有效 → 调用后端 LLM 生成 Plan（`modelPlanner.ts`）
  - 否则 → 使用 regex 规则匹配生成 Plan（`planner.ts`）
- 返回 `{ plan, toolCalls, planner: 'rule'|'model', warnings }`

**步骤 7：应用工具策略**
`applyToolPolicy()` (`agentRuntime.ts:703`)
- 检查每个 tool call 是否被授权（manifest 权限检查）
- 检查是否需要用户审批（`requiresApprovalByDefault`）
- 如果有需要审批的工具 → Run 状态变为 `requires_action`，等待用户操作

**步骤 8：执行任务**
`executeTask()` for each task (`agentRuntime.ts:861`)
- 按顺序执行每个 Task 中的 tool calls
- 每个 tool call 创建一个 `tool_call` 类型的 Step
- 工具结果收集到 `toolResults`

**步骤 9：生成回复**
`buildConfiguredAssistantContent()` (`agentRuntime.ts:750`)
- 把所有 tool results 和 warnings 整合成 assistant 消息
- 消息添加到 Thread

**步骤 10：提取记忆**
`memoryManager.extractAndWriteMemories()` (`agentRuntime.ts:763`)
- 从这次 Run 中提取值得记住的信息（草稿创建记录、实体读取记录、用户偏好等）
- 写入 memory store

**步骤 11：完成**
- Run 状态变为 `completed` 或 `completed_with_warnings`
- 前端轮询 `GET /runs/:id` 获取最终状态


---

## 第二部分：两个 Planner 的区别

这是整个系统最重要的部分。Planner 决定了 agent 会做什么。

### 2.1 规则规划器（Rule Planner）

**文件**：`apps/production-runtime/src/runtime/planner.ts`

**什么时候用**：当 model-config.json 不存在或无效时（这是默认情况）。

**怎么工作**：

1. 先检查消息是否以 `/` 开头（slash command），如 `/draft`、`/production_plan`
2. 如果不是 slash command，用 regex 匹配消息内容，判断用户意图
3. 根据意图选择工具调用

核心 regex 示例（`planner.ts:367`）：
```typescript
// 判断是否想查看项目内容
function wantsProjectLookup(message: string): boolean {
  return /查|找|搜索|检索|读取|查看|列出|有哪些|项目内容|剧本|设定|角色|资产|素材位|
         资产位|场景|情节|分镜|镜头|内容单元|关键帧|任务|search|find|lookup|read|
         list|show|project|script|setting|asset|asset_slot|segment|scene|
         scene_moment|storyboard|storyboard_line|content_unit|shot|keyframe|task/i.test(message)
}

// 判断是否想创建草稿
function wantsDraft(message: string): boolean {
  return /草稿|起草|写一版|写个|帮我写|生成.*稿|create.*draft|draft|proposal|outline/i.test(message)
}
```

**支持的 slash commands**：
- `/production_plan` 或 `/project_plan` → 生产编排计划
- `/draft <内容>` → 直接创建草稿
- `/inspect_context` 或 `/context` → 输出当前上下文
- `/project_structure` → 读取项目结构
- `/list_drafts` 或 `/drafts` → 列出草稿
- `/apply_draft <draftId>` → 应用草稿
- `/search <关键词>` → 搜索实体
- `/read_entity <类型> #<ID>` → 读取指定实体

**问题**：
- Regex 很脆弱：用户说"帮我看看第一集"可能匹配不到，说"查看 segment #1"才能匹配
- 无法处理新颖请求：如果用户说"帮我检查剧情逻辑"，regex 不知道该调用什么工具
- 维护困难：每次要支持新的用户表达方式，都要修改 regex
- 中英文混合时容易误匹配

### 2.2 模型规划器（Model Planner）

**文件**：`apps/production-runtime/src/runtime/modelPlanner.ts`

**什么时候用**：当 `~/.movscript-production-runtime/model-config.json` 存在且包含有效的 `modelConfigId`，且 `useForPlanner: true` 时。

**怎么工作**：

1. `BackendModelPlanner.isEnabled()` 检查配置文件是否存在（`modelPlanner.ts:41`）
2. 调用 `buildPlannerMessages(envelope)` 构建 LLM 输入（`modelPlanner.ts:67`）
3. 通过后端 LLM 网关发送请求：`POST /api/v1/model-gateway/chat/completions`
4. LLM 返回 JSON 格式的 Plan
5. `normalizeModelPlan()` 验证并规范化 Plan

**发给 LLM 的内容**（`modelPlanner.ts:96`）：
```json
{
  "userMessage": "帮我分析第一集的场景",
  "context": {
    "route": { "pathname": "/projects/42/production" },
    "project": { "id": 42, "name": "我的短剧" },
    "selection": { "entityType": "segment", "entityId": 1 },
    "recentResources": [...],
    "memories": [...]
  },
  "skills": [...],
  "availableTools": [...],
  "blockedTools": [...],
  "policy": { "approvalMode": "interactive", "maxToolCalls": 8 }
}
```

**LLM 返回的格式**：
```json
{
  "objective": "分析第一集的场景结构",
  "strategy": "1. researcher: 读取第一集数据\n2. creator: 分析场景",
  "tasks": [
    {
      "title": "读取第一集数据",
      "description": "获取 segment #1 的详细信息",
      "agentRole": "researcher",
      "successCriteria": "获得第一集的场景列表",
      "toolCalls": [
        { "name": "movscript.read_entity", "args": { "entityType": "segment", "entityId": 1 } }
      ]
    },
    {
      "title": "分析场景结构",
      "description": "基于读取的数据分析场景",
      "agentRole": "creator",
      "successCriteria": "输出场景分析报告",
      "toolCalls": []
    }
  ]
}
```

**优势**：
- 能理解自然语言，不依赖 regex
- 能处理新颖请求
- 推理过程可见（LLM 的 strategy 字段）
- 能根据上下文（当前选中实体、最近资源）做出更智能的决策

**注意**：Model Planner 也有工具调用上限（每个 task 最多 8 个 tool calls，`modelPlanner.ts:210`），且只能使用 `availableTools` 中的工具。

### 2.3 如何知道当前走的是哪个 Planner

**方法 1：检查 run.metadata.debugTrace**
```bash
curl http://127.0.0.1:28765/runs/<runId> | jq '.metadata.debugTrace.planner'
# 返回 "rule" 或 "model"
```

**方法 2：检查 /health 端点**
```bash
curl http://127.0.0.1:28765/health | jq '.modelConfig'
# configured: false → 使用 rule planner
# configured: true  → 使用 model planner（如果 useForPlanner: true）
```

**方法 3：检查 /model-config 端点**
```bash
curl http://127.0.0.1:28765/model-config
# 返回当前 model config 状态
```

**方法 4：看 run.steps 中的 planning step**
```bash
curl http://127.0.0.1:28765/runs/<runId> | jq '.steps[] | select(.type == "planning") | .result.planner'
```


---

## 第三部分：当前架构的核心问题

### 3.1 问题一：上下文是"推"进去的，不是"拉"出来的

**当前的"推"模式（Push Model）**

```
用户消息
    ↓
get_context_pack()  ← 一次性获取所有上下文
    ↓
构建 Envelope（包含完整项目数据）
    ↓
Planner（拿到一大包数据，不知道用了哪些）
    ↓
执行工具调用
```

问题在于：`movscript.get_context_pack` 在 Run 开始时就被调用，把所有上下文塞进 Envelope。这意味着：

1. **上下文可能过多**：LLM 收到大量可能不相关的数据，增加 token 消耗，也可能干扰推理
2. **不透明**：你看不出 agent 实际用了哪些上下文来做决策
3. **不灵活**：如果用户问的是第 3 集，但 context pack 只包含第 1 集的数据，agent 就无法获取正确信息

**更好的"拉"模式（Pull Model）**

这是开发者的核心洞察：

```
用户消息
    ↓
最小初始上下文（只有路由、项目ID、用户）
    ↓
Planner（知道自己需要什么）
    ↓
Agent 调用工具获取需要的上下文：
  → get_project_info()    ← 只获取项目基本信息
  → get_segments()        ← 只获取片段列表
  → get_scene_moments(1)  ← 只获取第1集的场景
    ↓
Agent 现在有了精确的上下文
    ↓
执行后续工具调用
```

好处：
- **可见性**：每个工具调用都出现在 run.steps 中，你能看到 agent 查了什么
- **精确性**：agent 只获取需要的数据
- **可调试**：如果 agent 做了错误决策，你能看到它查了哪些数据

### 3.2 问题二：Production Orchestration 是假的

当用户发送 `/production_plan` 或包含"制作编排"等关键词的消息时，`buildProductionOrchestrationTasks()` 会创建 5 个任务（`planner.ts:276`）：

```
Task 1: 读取项目事实源        → toolCalls: [read_project_structure]  ✓ 有工具调用
Task 2: 规划制作对象清单      → toolCalls: []                        ✗ 空的
Task 3: 分派工作人员生成素材  → toolCalls: []                        ✗ 空的
Task 4: 管理人员项目预演      → toolCalls: []                        ✗ 空的
Task 5: 进入正式内容单元生成  → toolCalls: []                        ✗ 空的
```

Tasks 2-5 的 `toolCalls` 是空数组。这意味着：
- Agent 会"执行"这些任务，但实际上什么都不做
- `executeTask()` 遇到空 toolCalls 时直接跳过（`agentRuntime.ts:892`）
- 用户看到的是一个看起来很完整的计划，但只有第一步真正执行了

这是一个规划模板，不是可执行的计划。

### 3.3 问题三：Model Planner 默认未启用

`BackendModelPlanner.isEnabled()` 的实现（`modelPlanner.ts:41`）：
```typescript
isEnabled(): boolean {
  return !!resolvePlannerConfig()
}
```

`resolvePlannerConfig()` 调用 `resolveRuntimePlannerModelConfig()`，它读取 `model-config.json` 文件。如果文件不存在，返回 `undefined`，`isEnabled()` 返回 `false`。

**结果**：绝大多数用户在不知情的情况下使用 regex 规则规划器。UI 上没有任何提示说明当前使用的是哪个 planner。

model-config.json 的默认路径（`modelConfig.ts:158`）：
```
~/.movscript-production-runtime/model-config.json
```

或者通过环境变量 `MOVSCRIPT_AGENT_MODEL_CONFIG_PATH` 指定。

### 3.4 问题四：调试信息不够直观

当前的调试信息分散在多个地方：
- `run.metadata.debugTrace`：包含 envelopeId、planner 类型、可用工具列表
- `run.steps`：包含每个步骤的执行结果
- `run.envelope`：包含完整的输入信封（数据量很大）

但是：
- 没有"为什么这么做"的解释字段
- Model Planner 的 LLM 输入输出没有被记录到 steps 中
- 前端 AgentDebugPage 展示的信息有限


---

## 第四部分：目标架构（你应该建成什么样）

### 4.1 架构原则

**原则 1：Agent 应该"拉"上下文，不是被"推"上下文**

初始 context pack 只包含最小信息：当前路由、当前项目 ID、当前用户、当前选中实体。其他所有数据都通过工具调用获取。

**原则 2：Model Planner 是主路径，Rule Planner 是紧急 fallback**

Model Planner 应该是默认启用的。Rule Planner 只在 Model Planner 不可用时作为降级方案。当前代码已经实现了 fallback 逻辑（`agentRuntime.ts:961`），但问题是 Model Planner 默认不启用。

**原则 3：每个决策都要有可见的 trace**

每次工具调用、每次规划决策都应该出现在 `run.steps` 中，包括 LLM 的输入输出。

**原则 4：Tool 粒度要小，职责单一**

一个工具只做一件事。不要有"读取所有项目数据"这样的大工具，而是"读取项目基本信息"、"读取片段列表"、"读取指定片段的场景"等细粒度工具。

### 4.2 工具粒度重设计

**当前工具（粒度太粗）**：

| 工具名 | 问题 |
|--------|------|
| `movscript.read_project_structure` | 返回所有类型的数据，limit=50 可能截断重要信息 |
| `movscript.search_entities` | 通用搜索，结果不可预测 |
| `movscript.read_entity` | 需要知道 entityType 和 entityId，不适合探索性查询 |

**建议的细粒度工具**：

```
读取类（只读，无需审批）：
  get_project_info          → 项目基本信息（名称、状态、描述）
  get_script(projectId)     → 剧本内容
  get_settings(projectId)   → 设定列表（角色、世界观等）
  get_segments(projectId)   → 片段/集列表
  get_scene_moments(segmentId)  → 指定片段的场景列表
  get_storyboard(segmentId)     → 指定片段的分镜
  get_asset_slots(filter)       → 素材位列表（可按类型过滤）
  get_content_units(filter)     → 内容单元列表
  get_keyframes(contentUnitId)  → 指定内容单元的关键帧

写入类（需要审批）：
  create_segment(data)      → 创建一个片段
  update_segment(id, patch) → 更新片段字段
  create_scene_moment(data) → 创建场景
  update_scene_moment(id, patch) → 更新场景

草稿类（本地操作，无需审批）：
  create_draft(content)     → 创建草稿
  apply_draft(draftId)      → 应用草稿（需要审批）
```

**在 toolRegistry.ts 中注册新工具**：
```typescript
// 在 DEFAULT_TOOL_REGISTRY 中添加：
{
  name: 'movscript.get_segments',
  description: 'Get the list of segments (episodes) for the current project.',
  permission: 'project.read',
  risk: 'read',
  projectScoped: true,
  requiresApprovalByDefault: false,
},
```

**在 MCP server 中实现对应 handler**（这部分在后端 Go 代码中）。

### 4.3 上下文拉取模式

**新的执行流程示例**：

用户：「帮我分析第一集的场景」

```
步骤 1: get_context_pack()
  → 返回: { projectId: 42, route: "/projects/42/production", userId: 1 }
  （只有最小信息，不包含项目数据）

步骤 2: Model Planner 生成计划
  → 看到 projectId: 42，决定需要获取片段信息
  → 生成 Task 1: 获取片段列表
    toolCalls: [{ name: "movscript.get_segments", args: { projectId: 42 } }]

步骤 3: 执行 Task 1
  → 调用 get_segments(42)
  → 返回: [{ id: 1, title: "第一集", ... }, { id: 2, title: "第二集", ... }]

步骤 4: Model Planner 生成 Task 2（或者 Task 1 的后续）
  → 看到 segment id=1，决定需要获取场景
  → 生成 Task 2: 获取第一集场景
    toolCalls: [{ name: "movscript.get_scene_moments", args: { segmentId: 1 } }]

步骤 5: 执行 Task 2
  → 调用 get_scene_moments(1)
  → 返回: [{ id: 10, title: "开场", ... }, { id: 11, title: "冲突", ... }]

步骤 6: 生成分析报告
  → Agent 现在有了精确的数据
  → 生成 assistant 消息
```

**每个步骤都出现在 run.steps 中**，你能清楚地看到 agent 查了什么、为什么查。

### 4.4 Production Orchestration 修复方案

**方案 A：两阶段流程（推荐）**

第一阶段：生成规划草案（不执行）
- Task 1：读取项目结构（有工具调用）
- Task 2：生成规划草案（`create_draft`，内容是完整的制作计划）

第二阶段：用户确认后执行
- 用户审查草案，确认后触发第二阶段
- 第二阶段按草案逐步执行

**方案 B：为每个 Task 定义真实工具调用**

```typescript
// Task 2: 规划制作对象清单
{
  title: '规划制作对象清单',
  toolCalls: [
    { name: 'movscript.create_draft', args: {
      kind: 'note',
      title: '制作对象清单',
      content: '...'  // 由 LLM 生成
    }}
  ]
}

// Task 3: 分派工作人员
{
  title: '分派工作人员生成素材',
  toolCalls: [
    { name: 'movscript.create_draft', args: {
      kind: 'pipeline',
      title: '工作人员任务队列',
      content: '...'
    }}
  ]
}
```


---

## 第五部分：调试手册

### 5.1 调试工具清单

| 端点 | 方法 | 用途 |
|------|------|------|
| `/health` | GET | 检查服务状态、model config、MCP 连接 |
| `/model-config` | GET | 查看当前 model config |
| `/model-config` | POST | 设置 model config |
| `/model-config/test` | POST | 测试 model config 连通性 |
| `/inspect` | GET | 查看 MCP 工具列表、注册工具、manifest |
| `/capabilities` | GET | 查看当前可用工具（需要 projectId 参数） |
| `/runs` | GET | 列出所有 runs |
| `/runs/:id` | GET | 查看完整 run 状态（含 steps、plan、envelope） |
| `/runs/preview` | POST | 预览 run（不执行，只生成 plan） |
| `/threads` | GET | 列出所有 threads |
| `/threads/:id` | GET | 查看 thread 详情（含消息历史） |
| `/drafts` | GET | 列出草稿 |
| `/drafts/:id` | GET | 查看草稿详情 |
| `/memories` | GET | 列出记忆 |
| `/context` | GET | 直接调用 get_context_pack，查看当前上下文 |

### 5.2 常见问题诊断

**问题：Agent 没有调用任何工具**

症状：run 完成了，但 run.steps 中没有 `tool_call` 类型的步骤，只有 `planning` 和 `message`。

诊断步骤：
```bash
# 1. 查看 plan 中的 tasks
curl http://127.0.0.1:28765/runs/<runId> | jq '.plan.tasks[] | {title, toolCallCount: (.toolCalls | length)}'

# 2. 查看使用的是哪个 planner
curl http://127.0.0.1:28765/runs/<runId> | jq '.metadata.debugTrace.planner'
```

原因 1：Rule planner 没有匹配到关键词
- 解决：使用 slash command，如 `/search 第一集` 或 `/project_structure`
- 根本解决：配置 model planner（见 5.3）

原因 2：Model planner 返回了空 tasks
- 解决：检查 model planner 的输入输出（目前没有记录，需要加日志）
- 临时解决：在消息中更明确地描述需要什么工具

原因 3：工具被 policy 阻止
- 解决：见下面"工具调用被 blocked"

---

**问题：Agent 调用了错误的工具**

症状：run.steps 中有 `tool_call`，但调用的工具不是预期的。

诊断步骤：
```bash
# 查看所有工具调用
curl http://127.0.0.1:28765/runs/<runId> | jq '.steps[] | select(.type == "tool_call") | {toolName, args}'
```

原因：Rule planner 的 regex 误匹配
- 例如：用户说"帮我写一个草稿"，regex 匹配到 `wantsDraft`，但用户其实想先查看项目结构
- 解决：配置 model planner

---

**问题：工具调用被 blocked**

症状：run 状态变为 `requires_action`，`run.pendingApprovals` 不为空。

诊断步骤：
```bash
# 查看待审批的工具调用
curl http://127.0.0.1:28765/runs/<runId> | jq '.pendingApprovals'
```

原因：工具需要用户审批（`requiresApprovalByDefault: true`）
- `movscript.apply_draft`：默认需要审批
- `movscript.create_generation_job`：默认需要审批

解决：
```bash
# 审批所有待审批的工具调用
curl -X POST http://127.0.0.1:28765/runs/<runId>/approve \
  -H "Content-Type: application/json" \
  -d '{}'

# 或者只审批特定工具
curl -X POST http://127.0.0.1:28765/runs/<runId>/approve \
  -H "Content-Type: application/json" \
  -d '{"approvedToolNames": ["movscript.apply_draft"]}'
```

---

**问题：Model Planner 不工作**

症状：`run.metadata.debugTrace.planner` 仍然是 `"rule"`，即使已经配置了 model config。

诊断步骤：
```bash
# 1. 检查 model config 是否已配置
curl http://127.0.0.1:28765/model-config
# 期望: { "configured": true, "modelConfigId": <id>, ... }

# 2. 测试连通性
curl -X POST http://127.0.0.1:28765/model-config/test \
  -H "Authorization: Bearer <your-token>"
# 期望: { "ok": true, "latencyMs": <ms>, "content": "..." }
```

原因 1：model-config.json 不存在
- 解决：见 5.3

原因 2：modelConfigId 无效
- 解决：在后台管理页面确认 AI Model Config 的 ID

原因 3：后端 LLM 网关不可达
- 检查：`MOVSCRIPT_BACKEND_API_BASE_URL` 环境变量是否正确
- 默认值：`http://localhost:8765/api/v1`

原因 4：`useForPlanner` 被设置为 `false`
- 解决：重新 POST /model-config，设置 `useForPlanner: true`

---

**问题：apply_draft 没有写入后端**

症状：草稿状态变为 `applied`，但后端数据没有变化。

诊断步骤：
```bash
# 查看草稿的 metadata
curl http://127.0.0.1:28765/drafts/<draftId> | jq '.metadata'
# 检查 backendWritePerformed 和 backendWriteError
```

原因：`MOVSCRIPT_BACKEND_API_BASE_URL` 未配置
- `BackendApplyClient.isEnabled()` 返回 `false`（`backendApplyClient.ts:56`）
- 解决：设置环境变量 `MOVSCRIPT_BACKEND_API_BASE_URL=http://localhost:8765`

### 5.3 如何配置 Model Planner（最重要的第一步）

这是提升 agent 智能程度最高价值的操作。

**步骤 1：在后台管理页面创建 AI Model Config**
- 进入 MovScript 后台管理
- 找到 AI 模型配置页面
- 创建一个新的 Model Config，选择你的 LLM 提供商
- 记下生成的 ID（如 `42`）

**步骤 2：配置 production-runtime**
```bash
curl -X POST http://127.0.0.1:28765/model-config \
  -H "Content-Type: application/json" \
  -d '{
    "modelConfigId": 42,
    "useForPlanner": true,
    "useForChat": true
  }'
```

成功响应：
```json
{
  "configured": true,
  "provider": "backend-model-config",
  "modelConfigId": 42,
  "model": "model_config:42",
  "useForChat": true,
  "useForPlanner": true,
  "source": "file"
}
```

这会在 `~/.movscript-production-runtime/model-config.json` 创建配置文件。

**步骤 3：验证连通性**
```bash
curl -X POST http://127.0.0.1:28765/model-config/test \
  -H "Authorization: Bearer <your-backend-token>"
```

成功响应：
```json
{
  "ok": true,
  "provider": "backend-model-config",
  "model": "model_config:42",
  "modelConfigId": 42,
  "latencyMs": 1234,
  "content": "MovScript runtime model connection works."
}
```

**步骤 4：验证 Planner 切换**
```bash
# 创建一个新的 run
curl -X POST http://127.0.0.1:28765/runs \
  -H "Content-Type: application/json" \
  -d '{"threadId": "<threadId>"}' 

# 等待 run 完成，然后检查 planner
curl http://127.0.0.1:28765/runs/<runId> | jq '.metadata.debugTrace.planner'
# 期望: "model"
```

### 5.4 如何读懂一个 Run 的 trace

**Run 的完整结构**：
```json
{
  "id": "run_abc123",
  "threadId": "thread_xyz",
  "status": "completed",
  "plan": {
    "id": "plan_def456",
    "objective": "分析第一集的场景",
    "strategy": "1. researcher: 读取数据\n2. creator: 分析",
    "tasks": [
      {
        "id": "task_ghi789",
        "title": "读取第一集数据",
        "agentRole": "researcher",
        "status": "completed",
        "toolCalls": [
          { "name": "movscript.read_entity", "args": { "entityType": "segment", "entityId": 1 } }
        ]
      }
    ]
  },
  "steps": [
    {
      "id": "step_001",
      "type": "tool_call",
      "toolName": "movscript.get_context_pack",
      "status": "completed",
      "result": { "snapshot": { "project": { "id": 42 }, ... } }
    },
    {
      "id": "step_002",
      "type": "planning",
      "title": "任务规划",
      "status": "completed",
      "result": {
        "planId": "plan_def456",
        "objective": "分析第一集的场景",
        "taskCount": 2,
        "planner": "model"
      }
    },
    {
      "id": "step_003",
      "type": "subagent",
      "title": "读取第一集数据",
      "agentRole": "researcher",
      "status": "completed",
      "result": { "taskId": "task_ghi789", "toolCount": 1 }
    },
    {
      "id": "step_004",
      "type": "tool_call",
      "toolName": "movscript.read_entity",
      "parentStepId": "step_003",
      "args": { "entityType": "segment", "entityId": 1, "projectId": 42 },
      "status": "completed",
      "result": { "id": 1, "title": "第一集", "scenes": [...] }
    },
    {
      "id": "step_005",
      "type": "message",
      "status": "completed",
      "result": { "messageId": "msg_jkl012" }
    }
  ],
  "metadata": {
    "debugTrace": {
      "envelopeId": "envelope_mno345",
      "manifestId": "movscript.default.local-agent",
      "skillIds": ["movscript.default.safe-project-assistant"],
      "availableToolNames": ["movscript.search_entities", "movscript.read_entity", ...],
      "blockedTools": [],
      "promptPartIds": ["part_001", "part_002"],
      "planner": "model"
    }
  }
}
```

**Step 类型说明**：

| type | 含义 |
|------|------|
| `tool_call` | 执行了一个工具调用（包括 get_context_pack） |
| `planning` | Planner 生成了执行计划 |
| `subagent` | 开始执行一个 Task（子 agent） |
| `message` | 生成了 assistant 消息 |

**parentStepId**：`tool_call` 步骤的 `parentStepId` 指向它所属的 `subagent` 步骤，这样你能知道哪个工具调用属于哪个任务。


---

## 第六部分：分步实施计划

### 步骤 1（立即，30 分钟）：配置 Model Planner

**为什么**：这是最高价值的改变。把 agent 从 regex 驱动变成 AI 驱动，不需要改任何代码。

**怎么做**：见 5.3 的详细步骤。

**验证**：创建一个 run，检查 `run.metadata.debugTrace.planner === 'model'`。

**预期效果**：
- Agent 能理解更自然的中文表达
- Agent 能根据上下文做出更智能的工具选择
- 不再需要记忆 slash commands

---

### 步骤 2（1-2 天）：拆分工具粒度

**为什么**：让 agent 能精确拉取需要的上下文，而不是一次性获取所有数据。

**要做什么**：

1. 在 `toolRegistry.ts` 中注册新的细粒度工具：
```typescript
// 在 DEFAULT_TOOL_REGISTRY 中添加
{
  name: 'movscript.get_segments',
  description: 'Get the list of segments (episodes) for the current project.',
  permission: 'project.read',
  risk: 'read',
  projectScoped: true,
  requiresApprovalByDefault: false,
},
{
  name: 'movscript.get_scene_moments',
  description: 'Get scene moments for a specific segment.',
  permission: 'project.read',
  risk: 'read',
  projectScoped: true,
  requiresApprovalByDefault: false,
},
// ... 其他细粒度工具
```

2. 在 MCP server（后端 Go 代码）中实现对应的 handler

3. 在 `agentManifest.ts` 的 `DEFAULT_AGENT_MANIFEST` 中添加工具授权：
```typescript
tools: [
  // ... 现有工具
  { name: 'movscript.get_segments', mode: 'allow', approval: 'never' },
  { name: 'movscript.get_scene_moments', mode: 'allow', approval: 'never' },
]
```

**注意**：不要删除现有工具，保持向后兼容。

---

### 步骤 3（2-3 天）：减少 context pack 的内容

**为什么**：当前 `get_context_pack` 返回太多数据，增加 token 消耗，也让 agent 难以聚焦。

**要做什么**：

修改 MCP server 中 `movscript.get_context_pack` 的实现，只返回：
```json
{
  "snapshot": {
    "route": { "pathname": "/projects/42/production" },
    "project": { "id": 42, "name": "我的短剧" },
    "user": { "id": 1, "username": "admin" },
    "selection": { "entityType": "segment", "entityId": 1, "label": "第一集" },
    "recentResources": [...]
  }
}
```

不再返回：完整的项目数据、剧本内容、实体列表等。

**注意**：这个改动需要同时更新 `agentRuntime.ts` 中的 `extractAgentContext()` 调用，确保它能正确解析新的精简格式。

---

### 步骤 4（3-5 天）：修复 Production Orchestration

**为什么**：当前 tasks 2-5 没有实际执行，用户看到的是假计划。

**要做什么**：

**方案 A（推荐）**：改成两阶段流程

第一阶段（立即执行）：
```typescript
// Task 1: 读取项目结构（有工具调用）
// Task 2: 生成规划草案（create_draft，内容由 LLM 生成）
```

第二阶段（用户确认后）：
- 用户审查草案
- 用户点击"开始执行"
- 前端发送 `/production_execute <draftId>` 触发第二阶段

**方案 B**：为每个 task 定义真实工具调用

修改 `buildProductionOrchestrationTasks()` 函数（`planner.ts:276`），为 tasks 2-5 添加实际的工具调用（主要是 `create_draft`）。

---

### 步骤 5（持续）：完善调试可见性

**为什么**：让你能看到 agent 的每个决策，快速定位问题。

**要做什么**：

1. **在 planning step 中记录 LLM 输入输出**

修改 `modelPlanner.ts`，在 plan 结果中包含 LLM 的原始输入输出：
```typescript
// 在 ModelPlannerResult 中添加
interface ModelPlannerResult {
  plan: AgentTaskPlan
  toolCalls: ToolCall[]
  warnings: string[]
  debug?: {
    llmInput: object
    llmOutput: string
    latencyMs: number
  }
}
```

然后在 `agentRuntime.ts` 的 planning step 中记录这些信息：
```typescript
planningStep.result = {
  planId: planned.plan.id,
  objective: planned.plan.objective,
  taskCount: planned.plan.tasks.length,
  planner: planned.planner,
  warnings: planned.warnings,
  // 新增：
  llmDebug: planned.debug,
}
```

2. **在 AgentDebugPage 中展示完整决策链**

前端展示：
- 使用了哪个 planner
- LLM 的输入（用户消息 + 上下文摘要）
- LLM 的输出（原始 JSON）
- 每个工具调用的输入输出

3. **加一个"为什么这么做"字段**

在 `AgentPlanTask` 中添加 `reasoning` 字段，让 LLM 解释为什么选择这些工具：
```typescript
interface AgentPlanTask {
  // ... 现有字段
  reasoning?: string  // LLM 的推理说明
}
```


---

## 第七部分：Agent 工作模式

### 7.1 为什么需要工作模式

当前的 agent 只有一种工作方式：接收消息 → 规划 → 执行工具 → 返回结果。但实际使用中，用户的需求差异很大：

- 有时用户想**探索**：「帮我看看第一集有什么问题」→ 需要来回对话，agent 可以问「你想重点看哪方面？」
- 有时用户想要**结论**：「给我一份项目进度报告」→ 不需要对话，直接返回完整报告
- 有时用户想**批量执行**：「帮我把所有片段的场景都整理一遍」→ 顺序执行多个任务，返回执行摘要

这三种场景对应三种不同的工作模式。

### 7.2 三种工作模式

#### 交互式（Interactive）

**特征**：
- Agent 可以提问，要求用户澄清
- 分步展示中间结果，等待用户确认
- 写操作默认需要用户逐个审批
- 输出风格：对话式，增量式

**适用场景**：
- 探索性查询（「帮我看看这个项目」）
- 创作类任务（「帮我写一版剧本大纲」）
- 需求不明确时（「帮我优化一下」）

**对应的 approvalMode**：`'interactive'`

**示例**：
```
用户：帮我分析第一集
Agent：我找到了第一集的 12 个场景。你想重点分析哪方面？
  A. 场景节奏（时长分布）
  B. 角色出场（谁在哪个场景出现）
  C. 情节逻辑（场景之间的因果关系）
用户：B
Agent：好的，我来分析角色出场...
```

#### 结论式（Conclusive）

**特征**：
- Agent 不提问，直接执行完整任务
- 返回一个完整的、结构化的结论
- 读操作自动执行，写操作仍需审批
- 输出风格：报告式，一次性

**适用场景**：
- 分析报告（「给我一份项目进度报告」）
- 明确的查询（「第一集有几个场景」）
- 批量读取（「列出所有角色的出场场景」）

**对应的 approvalMode**：`'auto_readonly'`

**示例**：
```
用户：给我一份第一集的场景分析报告
Agent：[执行：读取第一集 → 读取所有场景 → 分析]
      第一集场景分析报告
      ==================
      总场景数：12
      平均时长：3.2 分钟
      ...（完整报告）
```

#### 流水线式（Pipeline）

**特征**：
- Agent 按预定流程顺序执行多个任务
- 每个任务完成后更新进度，不等待用户输入
- 写操作在流水线开始前统一审批
- 输出风格：进度日志 + 最终摘要

**适用场景**：
- 生产编排（「帮我把第一集的所有场景都生成分镜草稿」）
- 批量操作（「帮我更新所有素材位的描述」）
- 自动化工作流

**对应的 approvalMode**：`'interactive'`（开始前统一审批所有写操作）

**示例**：
```
用户：帮我为第一集的所有场景生成分镜草稿
Agent：我将执行以下流水线：
  1. 读取第一集场景列表（12 个场景）
  2. 为每个场景生成分镜草稿
  3. 汇总结果
  [需要审批：创建 12 个草稿]

用户：[审批]

Agent：流水线执行中...
  ✓ 场景 1/12：开场 → 草稿已创建
  ✓ 场景 2/12：冲突 → 草稿已创建
  ...
  完成！共创建 12 个分镜草稿。
```

### 7.3 工作模式与现有代码的关系

**现有的 `approvalMode`**（`types.ts` 中的 `AgentRunPolicy`）：

```typescript
interface AgentRunPolicy {
  approvalMode: 'interactive' | 'dry_run' | 'auto_readonly'
  maxToolCalls: number
  maxIterations: number
}
```

`approvalMode` 控制的是**写操作的审批行为**，是工作模式的一个维度，但不是全部。工作模式还影响 agent 的提问行为、输出格式、以及 LLM 的规划策略。

**新增 `workMode` 字段**：

```typescript
// apps/production-runtime/src/runtime/types.ts
interface AgentRunPolicy {
  approvalMode: 'interactive' | 'dry_run' | 'auto_readonly'
  workMode?: 'interactive' | 'conclusive' | 'pipeline'  // 新增
  maxToolCalls: number
  maxIterations: number
}
```

**两者的推荐搭配**：

| workMode | 推荐的 approvalMode | 说明 |
|----------|---------------------|------|
| `interactive` | `interactive` | 写操作需要逐个审批 |
| `conclusive` | `auto_readonly` | 读操作自动执行，写操作仍需审批 |
| `pipeline` | `interactive` | 流水线开始前统一审批所有写操作 |

### 7.4 工作模式如何影响 Agent 行为

**影响 Planner（`modelPlanner.ts`）**

在 `buildPlannerMessages()` 中把 `workMode` 传给 LLM，让它调整规划策略：

```typescript
// buildPlannerMessages() 中的 policy 部分
policy: {
  approvalMode: envelope.policy.approvalMode,
  workMode: envelope.policy.workMode ?? 'interactive',
  maxToolCalls: envelope.policy.maxToolCalls,
}
```

LLM 会根据 `workMode` 调整：
- `interactive`：可以生成"等待用户输入"的任务，允许留空 toolCalls
- `conclusive`：生成完整的端到端计划，每个 task 都必须有明确的 toolCalls
- `pipeline`：生成顺序执行的任务链，每个任务都有明确的工具调用和成功标准

**影响 Assistant 消息（`assistantMessage.ts`）**

在 `buildAssistantMessages()` 的 system prompt 中，根据 `workMode` 添加输出指令：

```typescript
const workModeInstruction: Record<string, string> = {
  interactive: 'You may ask clarifying questions. Show intermediate results and invite user input.',
  conclusive: 'Do not ask questions. Return a complete, structured conclusion in one response.',
  pipeline: 'Report progress for each completed step. End with a summary of all results.',
}

// 在 system content 中加入：
workModeInstruction[run?.policy?.workMode ?? 'interactive']
```

**影响 Run 创建**

前端在创建 Run 时可以指定 `workMode`：

```bash
curl -X POST http://127.0.0.1:28765/runs \
  -H "Content-Type: application/json" \
  -d '{
    "threadId": "<threadId>",
    "policy": {
      "workMode": "conclusive",
      "approvalMode": "auto_readonly"
    }
  }'
```

### 7.5 实施步骤

**步骤 1（30 分钟）**：在 `types.ts` 中添加 `workMode` 字段

```typescript
// apps/production-runtime/src/runtime/types.ts
export interface AgentRunPolicy {
  approvalMode: 'interactive' | 'dry_run' | 'auto_readonly'
  workMode?: 'interactive' | 'conclusive' | 'pipeline'
  maxToolCalls: number
  maxIterations: number
}
```

**步骤 2（1 小时）**：在 `modelPlanner.ts` 中传递 `workMode` 给 LLM

修改 `buildPlannerMessages()` 中的 policy 部分，包含 `workMode`。同时在 system prompt 中加入对应的规划约束（结论式要求每个 task 都有 toolCalls，流水线式要求任务有明确的成功标准）。

**步骤 3（1 小时）**：在 `assistantMessage.ts` 中根据 `workMode` 调整 system prompt

修改 `buildAssistantMessages()` 中的 system prompt，根据 `workMode` 添加对应的输出指令。

**步骤 4（半天）**：在前端添加工作模式选择器

在 `ProductionOrchestratePage` 的消息输入框旁边添加模式切换：
- 💬 交互式（默认）
- 📋 结论式
- ⚙️ 流水线式

选择后，前端在创建 Run 时带上对应的 `policy.workMode`。

### 7.6 快速判断用哪种模式

```
用户的请求是...
  ├── 探索性的、需要来回确认的？ → 交互式
  ├── 明确的、需要完整报告的？   → 结论式
  └── 批量操作、多步骤流程的？   → 流水线式
```

**经验法则**：
- 问句（「有哪些...」「帮我看看...」）→ 交互式
- 报告类（「给我一份...报告」「分析一下...」）→ 结论式
- 批量类（「帮我把所有...都...」「生成所有...」）→ 流水线式

---

## 附录

### A. 文件索引

| 文件路径 | 职责 |
|----------|------|
| `apps/production-runtime/src/server.ts` | HTTP 服务器，所有 API 端点的路由 |
| `apps/production-runtime/src/runtime/agentRuntime.ts` | AgentRuntime 主类，Run 的完整生命周期 |
| `apps/production-runtime/src/runtime/planner.ts` | 规则规划器，regex 匹配意图，生成 Plan |
| `apps/production-runtime/src/runtime/modelPlanner.ts` | 模型规划器，调用后端 LLM 生成 Plan |
| `apps/production-runtime/src/runtime/modelConfig.ts` | Model config 存储，读写 model-config.json |
| `apps/production-runtime/src/runtime/toolRegistry.ts` | 工具注册表，8 个内置工具的定义 |
| `apps/production-runtime/src/runtime/toolPolicy.ts` | 工具策略，权限检查和审批逻辑 |
| `apps/production-runtime/src/runtime/capabilityResolver.ts` | 能力解析，合并 MCP 工具和注册工具 |
| `apps/production-runtime/src/runtime/backendApplyClient.ts` | 后端写入客户端，PATCH 请求到 Go API |
| `apps/production-runtime/src/runtime/draftStore.ts` | 草稿存储，草稿的 CRUD 和生命周期 |
| `apps/production-runtime/src/runtime/agentManifest.ts` | Agent manifest 定义，默认 manifest |
| `apps/production-runtime/src/runtime/promptCompiler.ts` | Prompt 编译，把 Envelope 转成 LLM prompt |
| `apps/production-runtime/src/runtime/assistantMessage.ts` | Assistant 消息生成，整合工具结果 |
| `apps/production-runtime/src/runtime/skillResolver.ts` | Skill 解析，根据消息匹配适用的 skill |
| `apps/production-runtime/src/runtime/context.ts` | 上下文解析，从 MCP 结果提取 agent 上下文 |
| `apps/production-runtime/src/runtime/fileStore.ts` | 文件存储，threads/runs 持久化到 JSON 文件 |
| `apps/production-runtime/src/runtime/store.ts` | 内存存储，threads/runs 的内存实现 |
| `apps/production-runtime/src/runtime/draftApply.ts` | 草稿应用，生成 before/after review |
| `apps/production-runtime/src/runtime/pluginCatalog.ts` | 插件目录，加载外部 skill 和 tool 插件 |
| `apps/production-runtime/src/runtime/types.ts` | 所有类型定义 |
| `apps/production-runtime/src/runtime/memory/memoryManager.ts` | 记忆管理，加载和提取记忆 |
| `apps/production-runtime/src/runtime/memory/memoryStore.ts` | 记忆存储接口 |
| `apps/production-runtime/src/runtime/memory/fileMemoryStore.ts` | 记忆文件存储实现 |
| `apps/production-runtime/src/runtime/memory/types.ts` | 记忆相关类型定义 |
| `apps/production-runtime/src/mcpClient.ts` | MCP 客户端，连接 MCP server |
| `apps/production-runtime/src/chatRuntime.ts` | Chat 运行时（独立于 agent，用于简单对话） |

### B. 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `MOVSCRIPT_AGENT_PORT` | `28765` | production-runtime HTTP 服务端口 |
| `MOVSCRIPT_MCP_ENDPOINT` | `http://127.0.0.1:18765/mcp` | MCP server 地址 |
| `MOVSCRIPT_BACKEND_API_BASE_URL` | `http://localhost:8765/api/v1` | 后端 Go API 地址（用于 apply_draft 和 model gateway） |
| `MOVSCRIPT_API_BASE_URL` | 同上 | 同上（别名） |
| `MOVSCRIPT_AGENT_MODEL_CONFIG_PATH` | `~/.movscript-production-runtime/model-config.json` | model config 文件路径 |

**状态文件路径**（由 `fileStore.ts` 中的 `resolveAgentStatePath()` 决定）：
- 默认：`~/.movscript-production-runtime/agent-state.json`
- 记忆：`~/.movscript-production-runtime/memories.json`
- 草稿：`~/.movscript-production-runtime/drafts/`
- Model config：`~/.movscript-production-runtime/model-config.json`

### C. HTTP API 速查

**服务状态**
```
GET  /health                    检查服务状态
GET  /inspect                   查看 MCP 工具、注册工具、manifest
GET  /capabilities?projectId=N  查看当前可用工具
GET  /context                   直接调用 get_context_pack
```

**Model Config**
```
GET  /model-config              查看当前 model config
POST /model-config              设置 model config
     body: { modelConfigId, useForPlanner, useForChat }
POST /model-config/test         测试 model config 连通性
```

**Threads**
```
POST /threads                   创建 thread
     body: { title?, projectId?, messages? }
GET  /threads                   列出所有 threads（摘要）
GET  /threads/:id               查看 thread 详情
PATCH /threads/:id              更新 thread（title, archived）
POST /threads/:id/messages      添加消息
     body: { role, content }
```

**Runs**
```
POST /runs                      创建 run（触发 agent 执行）
     body: { threadId, agentManifest?, approvedToolNames? }
POST /runs/tool                 创建工具 run（直接执行指定工具）
     body: { toolCall: { name, args }, threadId? }
POST /runs/preview              预览 run（不执行，只生成 plan）
     body: { threadId?, message?, agentManifest? }
GET  /runs                      列出所有 runs
GET  /runs/:id                  查看 run 详情
POST /runs/:id/approve          审批工具调用
     body: { approvalIds?, approvedToolNames? }
POST /runs/:id/reject           拒绝工具调用
     body: { approvalIds? }
```

**Drafts**
```
POST /draft                     创建本地草稿
     body: { kind, title, content, projectId?, source?, target? }
GET  /drafts                    列出草稿
     query: projectId?, kind?, status?, limit?
GET  /drafts/:id                查看草稿详情
POST /drafts/:id/apply-preview  预览草稿应用效果
POST /drafts/:id/reject         拒绝草稿
     body: { reason? }
```

**Memories**
```
GET  /memories                  列出记忆
     query: scope?, projectId?, threadId?, kind?
POST /memories                  创建记忆
     body: { scope, kind, content, projectId?, threadId? }
DELETE /memories/:id            删除记忆
```

**Production（独立的生产运行时）**
```
POST /production/actions        创建生产动作
GET  /production/runs           列出生产 runs
GET  /production/runs/:id       查看生产 run
GET  /production/candidates     列出候选结果
GET  /production/candidates/:id 查看候选结果
POST /production/candidates/:id/apply-preview  预览候选应用
POST /production/candidates/:id/accept         接受候选
POST /production/candidates/:id/reject         拒绝候选
POST /production/candidates/:id/revise         修订候选
POST /production/candidates/:id/supersede      替换候选
```

---

## 快速参考：关键代码位置

| 功能 | 文件 | 行号 |
|------|------|------|
| Run 执行入口 | `agentRuntime.ts` | 619 |
| 获取上下文 | `agentRuntime.ts` | 635 |
| 构建 Envelope | `agentRuntime.ts` | 655 |
| 规划入口 | `agentRuntime.ts` | 919 |
| Model Planner 启用检查 | `modelPlanner.ts` | 41 |
| Model Planner 构建消息 | `modelPlanner.ts` | 67 |
| Rule Planner 入口 | `planner.ts` | 9 |
| Production Orchestration 任务 | `planner.ts` | 276 |
| 工具策略检查 | `toolPolicy.ts` | 24 |
| 工具注册表 | `toolRegistry.ts` | 68 |
| 后端写入 | `backendApplyClient.ts` | 60 |
| Model Config 路径 | `modelConfig.ts` | 158 |
| 记忆加载 | `memory/memoryManager.ts` | 23 |
| 记忆提取 | `memory/memoryManager.ts` | 37 |
| Debug Trace 构建 | `agentRuntime.ts` | 1446 |

