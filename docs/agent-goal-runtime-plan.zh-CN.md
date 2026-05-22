# Agent Goal Runtime 实现规划

本文档规划在 Movscript Agent Runtime 中实现类似 Codex `goal` 的线程级目标能力。目标不是替换现有 taskGraph，而是把用户长期目标提升为 Runtime 状态，再让 taskGraph、planner run、worker run 成为执行载体。

## 背景

当前代码已经支持把 `goal` 作为 taskGraph 创建输入：

- `CreateTaskGraphInput.goal` / `message` 定义在 `apps/agent/src/state/types.ts`。
- `createTaskGraphGoal` 会优先取 `goal`，没有时退回 `message`。
- `runtimePlanCreation` 会在没有显式 tasks 但存在 goal 时调用 `generatePlanTasks`。
- `generatePlanTasks` 会使用规划模型拆任务；模型不可用或返回无效时 fallback 为单个 `task_execute_goal`。

这套能力解决的是“用目标生成计划”。Codex 风格的 goal 还需要解决“跨轮次保存目标、把目标注入上下文、由 agent 正确更新完成或阻塞状态”。

## 设计目标

- `goal` 是 thread-level runtime state，一条 thread 最多一个 active goal。
- `goal` 保存用户真正想达成的结果，而不是短期 checklist。
- `goal` 每轮参与模型上下文组装，使 agent 能跨 turn 持续推进。
- `goal` 与 taskGraph 解耦：goal 是目标合同，taskGraph 是执行计划。
- `goal` 更新必须受规则约束，避免模型随意创建、改写或完成目标。
- 最小版本先实现持久状态、runtime tools、上下文注入和 UI 可见性；预算、自动续跑和严格 blocked 判定分阶段加入。

## 非目标

- 不实现多层级 nested goals。
- 不把 `progressChecklist` 合并进 goal。
- 不把每个 taskGraph 都自动视为 goal。
- 不在没有用户明确意图时自动创建 goal。
- 不把 goal 作为普通聊天消息写入历史后依赖历史回放。

## 概念边界

### Goal

`Goal` 表示用户希望 agent 在当前 thread 中持续推进的最终结果。

示例：

```text
修复 dashboard 日期筛选刷新后丢失的问题，补回归测试，并确认相关前端测试通过。
```

### Plan / Progress Checklist

`progressChecklist` 是当前执行步骤的短期状态，适合表达“读代码、改实现、跑测试”。它可以随执行变化频繁更新。

### TaskGraph

`taskGraph` 是实现 goal 的结构化工作图，适合承载 planner/worker 分工、依赖、worker dispatch 和产物聚合。

推荐关系：

```text
AgentGoal
  -> optional linked AgentTaskGraph
      -> AgentTask[]
          -> AgentRun planner / worker
```

## 数据模型

在 `apps/agent/src/state/types.ts` 增加：

```ts
export type AgentGoalStatus = 'active' | 'complete' | 'blocked' | 'cancelled'

export interface AgentGoal {
  id: string
  threadId: string
  objective: string
  status: AgentGoalStatus
  tokenBudget?: number
  tokenUsed?: number
  blockedReason?: string
  linkedTaskGraphId?: string
  createdByRunId?: string
  completedByRunId?: string
  blockedByRunId?: string
  createdAt: string
  updatedAt: string
  completedAt?: string
  blockedAt?: string
  cancelledAt?: string
  metadata?: Record<string, JSONValue>
}
```

字段说明：

- `objective`：目标正文，由 agent 在用户明确要求时提炼成可验收结果。
- `status`：`active` 表示仍需继续推进；`complete` / `blocked` / `cancelled` 为终态。
- `tokenBudget` / `tokenUsed`：先预留；MVP 可只保存 budget，不做强预算调度。
- `linkedTaskGraphId`：关联已有 taskGraph，不强制所有 goal 都创建 taskGraph。
- `metadata`：保留扩展，例如 blocked audit、来源、产品入口。

## Store 变更

在 `AgentStore` 增加 goal 存取能力：

```ts
createGoal(goal: AgentGoal): void
getGoal(goalId: string): AgentGoal | undefined
getThreadActiveGoal(threadId: string): AgentGoal | undefined
listThreadGoals(threadId: string): AgentGoal[]
updateGoal(goal: AgentGoal): void
```

约束：

- 同一个 thread 同时只能有一个 `active` goal。
- `objective` 创建后默认不可改。后续如需改目标，应显式实现 `replaceGoal` 或 `cancelGoal + createGoal`。
- `complete`、`blocked`、`cancelled` 为终态，不能恢复为 `active`，除非后续明确设计 `resumeGoal`。

## Runtime Tools

新增内部 runtime tools，而不是 MCP 外部工具：

```text
core_goal_get
core_goal_create
core_goal_update
```

建议工具语义：

```ts
interface CreateGoalRequest {
  objective: unknown
  tokenBudget?: unknown
  linkTaskGraph?: unknown
}

interface UpdateGoalRequest {
  goalId?: unknown
  status?: unknown
  blockedReason?: unknown
}
```

规则：

- `core_goal_create` 只能在用户明确要求创建、追踪、持续推进目标时调用。
- `core_goal_get` 可随时读取当前 thread active goal。
- `core_goal_update` 只允许写 `complete`、`blocked`、`cancelled`。
- `complete` 必须基于 objective 的验收条件已经满足。
- `blocked` 必须包含可读原因；严格版再加入“同一阻塞条件连续三轮”判定。
- `cancelled` 只用于用户明确取消或切换目标。

实现位置建议：

- `apps/agent/src/application/runtimeGoalTools.ts`：目标工具的 normalize、校验和状态更新。
- `apps/agent/src/tools/toolNames.ts`：注册工具名。
- `apps/agent/src/tools/toolRegistry.ts` 或现有 runtime tool 注册路径：加入工具 schema。
- `apps/agent/src/application/runtimeRouter.ts`：把工具执行接入 run tool handling。

## 上下文注入

goal 必须进入模型上下文，而不是只存在 store。

在 context 构建层增加一个 goal context part：

```text
Current active goal:
- Objective: ...
- Status: active
- Linked taskGraph: task_graph_1
- Token budget: 20000
- Token used: 4200
- Remaining budget: 15800

Rules:
- Continue this goal when the latest user message is consistent with it.
- The latest user message has priority if it redirects the conversation.
- Mark complete only when the objective is actually satisfied.
- Mark blocked only with a concrete repeated blocker.
```

建议落点：

- `apps/agent/src/contextManager/modelContextBuilder.ts`：新增 `goal` debug part。
- `apps/agent/src/context/debugContext.ts`：如 debug context 需要展示，加入 active goal 摘要。
- `apps/agent/src/application/runtimeRunPreview.ts`：preview 中应能看到 goal part。
- `apps/agent/src/application/runtimePlanContext.ts`：如果 run 绑定 taskGraph，可通过 `linkedTaskGraphId` 互相补充。

prompt 统计中应能看到 goal part，方便调试页确认 agent 当时是否看到了 goal。

## 与 taskGraph 的集成

MVP 不强制创建 taskGraph。推荐支持两个入口：

### 只创建 Goal

```text
core_goal_create({ objective })
  -> store active goal
  -> 后续 run 上下文注入 goal
```

适合用户只是要求“持续追踪这个目标”，但还没要求拆计划。

### 创建 Goal 并生成 TaskGraph

```text
core_goal_create({ objective, linkTaskGraph: true })
  -> createGoal
  -> createTaskGraph({ threadId, goal: objective })
  -> goal.linkedTaskGraphId = taskGraph.id
  -> optional planner run starts
```

这可以复用现有 `runtimePlanCreation` 和 `generatePlanTasks`，不需要重写规划模型。

当 taskGraph 终态变化时：

- `taskGraph.status === 'done'` 不应自动把 goal 标为 `complete`，但可以提示 planner 判断是否 update goal。
- `taskGraph.status === 'blocked'` 不应自动把 goal 标为 `blocked`，但可记录 blocked signal。
- goal 完成后，相关 taskGraph 可以保持原状态，不强制同步为 done；同步策略后续单独设计。

## API 与前端客户端

后端 HTTP API 可先做最小集：

```text
GET  /threads/:threadId/goal
POST /threads/:threadId/goal
POST /threads/:threadId/goal/update
```

前端 `apps/frontend/src/lib/localAgentClient.ts` 增加：

```ts
getThreadGoal(threadId: string): Promise<AgentGoal | null>
createThreadGoal(threadId: string, input: CreateGoalInput): Promise<AgentGoal>
updateThreadGoal(threadId: string, input: UpdateGoalInput): Promise<AgentGoal>
```

如果只通过 agent tool 创建 goal，第一阶段也可以只做 `GET`，让 UI 只读显示。

## UI 规划

Agent Console / Run 页面增加轻量 Goal 面板：

```text
Goal
Active
修复 dashboard 日期筛选刷新后丢失的问题，补回归测试，并确认相关前端测试通过。

TaskGraph: task_graph_1
Budget: 4200 / 20000 tokens
Actions: Mark complete / Mark blocked / Cancel
```

UI 原则：

- 面板只展示一个 active goal，历史 goals 后续再做。
- 用户操作 `complete` / `blocked` / `cancel` 需要确认。
- 如果当前消息与 active goal 明显无关，UI 不应强拦用户，但应保留 goal 状态。
- Run 详情页展示“本轮 prompt 是否注入 goal”，便于调试上下文问题。

## 状态流

### 创建

```text
用户明确要求持续追踪目标
  -> agent 调用 core_goal_create
  -> runtime 校验 thread 没有 active goal
  -> 保存 AgentGoal(status=active)
  -> 可选创建 taskGraph
  -> 后续 prompt 注入 active goal
```

### 推进

```text
新一轮 run
  -> context builder 读取 active goal
  -> prompt 注入 goal 摘要
  -> agent 判断最新用户消息是否仍服务 goal
  -> 使用 plan/taskGraph/tools 推进
```

### 完成

```text
objective 验收条件满足
  -> agent 调用 core_goal_update(status=complete)
  -> runtime 写 completedAt/completedByRunId
  -> 后续 prompt 不再注入 active goal，可在历史摘要中保留终态记录
```

### 阻塞

```text
同一阻塞条件重复出现
  -> agent 调用 core_goal_update(status=blocked, blockedReason)
  -> runtime 写 blockedAt/blockedByRunId
  -> UI 展示 blocked reason 和恢复入口
```

## 分阶段实施

### Phase 1：Goal 状态与只读上下文

- 增加 `AgentGoal` 类型。
- Store 支持 create/get/list/update。
- 增加 `core_goal_create`、`core_goal_get`、`core_goal_update`。
- Context builder 注入 active goal。
- Run preview 和 trace 能看到 goal prompt part。
- UI 只读展示 active goal。

验收：

- 创建 goal 后，下一轮 run 的 prompt preview 包含 goal objective。
- 同 thread 不能创建第二个 active goal。
- complete 后，active goal 不再注入。

### Phase 2：TaskGraph 关联

- `core_goal_create` 支持 `linkTaskGraph`。
- 复用 `createTaskGraph({ goal: objective })` 生成计划。
- Goal 保存 `linkedTaskGraphId`。
- Goal 面板展示关联 taskGraph 状态和入口。

验收：

- 用户创建 goal 并要求拆计划时，能得到 linked taskGraph。
- planner/worker run 的上下文同时包含 goal 和 taskGraph。
- taskGraph 终态不会绕过 agent 判断直接完成 goal。

### Phase 3：预算与阻塞审计

- 记录 run usage 到 `tokenUsed`。
- prompt 中展示 budget / remaining。
- `blocked` 更新加入 repeated blocker audit。
- Debug 页面展示 goal 预算和阻塞历史。

验收：

- goal budget 可在多轮 run 中累计消耗。
- 未满足阻塞规则时，runtime 拒绝 blocked 更新。
- Debug bundle 能包含脱敏 goal 状态。

### Phase 4：自动续跑

- 当 active goal 未完成且 run 停在可继续状态时，支持自动 continuation。
- 预算耗尽、需要审批、需要用户输入、blocked 时停止。
- UI 明确显示自动续跑状态和停止原因。

验收：

- 简单 goal 可以跨多轮自动推进直到 complete。
- 需要用户输入时不会继续空转。
- 用户发新消息改变方向时，最新用户消息优先。

## 测试计划

### Unit Tests

- `runtimeGoalTools.test.ts`
  - 创建 goal。
  - 拒绝空 objective。
  - 拒绝同 thread 第二个 active goal。
  - complete / blocked / cancelled 终态更新。
  - 拒绝终态恢复 active。

- `store.test.ts`
  - goal clone 行为。
  - listThreadGoals 排序。
  - getThreadActiveGoal 只返回 active。

- `modelContextBuilder.test.ts`
  - active goal 注入 prompt。
  - completed goal 不作为 active goal 注入。
  - promptStats 包含 goal part。

### Integration Tests

- `runtimeRouter.test.ts`
  - tool call 创建 goal 后，下一轮 run 能看到 goal。
  - `linkTaskGraph` 复用现有 plan creation。
  - complete 后后续 run 不继续 goal。

- `runtimeRunPreview.test.ts`
  - preview 展示 active goal context。

- `runtimePlanCreation.test.ts`
  - goal objective 传给 taskGraph 创建时保持原文。

### Frontend Contract Tests

- `agentGenerationUiContract.test.tsx`
  - Agent 面板保留 `data-testid="agent-goal-panel"`。
  - active/blocked/complete 状态文案存在。
  - linked taskGraph 入口存在。

## 风险与取舍

- Goal 与 taskGraph 双状态可能产生不一致。解决方式是明确边界：goal 只能由 goal tool 更新，taskGraph 只提供执行信号。
- 模型可能过早 complete。解决方式是把 objective 写成可验收结果，并在 runtime/system prompt 中强调完成条件。
- 自动创建 goal 可能误伤普通对话。解决方式是 Phase 1 明确要求“用户显式要求”才创建。
- token budget 需要可靠 usage 来源。MVP 只预留字段，不把 budget 作为强调度约束。
- blocked 规则如果过严会降低可用性。先允许 blocked reason，后续再加 repeated blocker audit。

## 建议落地顺序

1. 新增 `AgentGoal` 类型和 store 方法。
2. 实现 `runtimeGoalTools.ts` 与工具注册。
3. 在 context builder 注入 active goal。
4. 补 runtime/tool/context 单测。
5. 前端只读展示 active goal。
6. 接 `linkTaskGraph`。
7. 再做预算、blocked audit 和自动续跑。

这个顺序可以先验证最核心闭环：用户目标被保存、被注入、被执行、被正确终结。后续再把 Codex 风格的预算和自动续跑叠上去。
