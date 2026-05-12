# Agent 子 Agent 机制实现规划

本文档描述如何在当前 `apps/agent` 基础上引入 `plan agent + worker subagent` 机制，并保留现有单层 run 执行器作为 worker 运行核心。

## 目标

- `Plan Agent` 负责拆解任务、排序依赖、分配子任务、监控进度、触发重规划。
- `Worker SubAgent` 负责执行单个子任务，只处理局部上下文和局部工具调用。
- 运行时可以同时管理多个子任务，并把子任务状态回流到父任务和总览视图。
- 现有 `runAgentGraph()` 继续作为 worker loop 使用，不推倒重写。

## 现状判断

当前实现是单层结构：

- `AgentRuntime.createRun()` 创建单个 run。
- `runAgentGraph()` 负责单次 agentic loop。
- `AgentTraceEvent` 和 `AgentRunStreamEvent` 已经支持事件流和流式回放。
- `AgentTraceEvent` 里已有 `agentId` 和 `parentAgentId` 字段，但还没有形成父子 agent 语义。

这意味着可以在现有运行时上加 supervisor 层，而不是先重做执行器。

## 推荐架构

```text
User Goal
  -> Plan Agent
  -> Task DAG
  -> Worker SubAgent Runs
  -> Trace / Step / Progress events
  -> Plan Agent monitors and replans
```

建议拆成三层：

1. `Plan Agent`
   - 负责任务拆分、优先级、依赖关系、重规划。
   - 只看结构化进度，不直接做业务写入。

2. `Worker SubAgent`
   - 复用当前 `runAgentGraph()`。
   - 只执行一个明确子任务。
   - 通过 trace / step / stream 上报进度。

3. `Orchestrator`
   - 负责 spawn、cancel、retry、timeout、事件聚合、状态持久化。
   - 可以先放在 `AgentRuntime` 里，后续再拆模块。

## 需要新增的数据结构

建议先补结构，再补行为。

### Run 维度

在 `AgentRun` 中增加：

- `role`: `planner | worker`
- `parentRunId`
- `planId`
- `taskId`
- `progress`
- `blockedReason`

### Task 维度

新增独立的任务对象，例如：

```json
{
  "id": "task_1",
  "planId": "plan_1",
  "parentId": null,
  "deps": ["task_0"],
  "title": "实现子 agent 机制",
  "status": "running",
  "progress": 0.5,
  "ownerRunId": "run_123",
  "blockedReason": null,
  "artifacts": []
}
```

建议状态至少包括：

- `pending`
- `running`
- `blocked`
- `needs_review`
- `done`
- `failed`
- `cancelled`

### Event 维度

新增或细化 trace 事件，用于监控子任务：

- `task_created`
- `task_started`
- `progress_update`
- `artifact_created`
- `blocked`
- `needs_input`
- `task_completed`
- `task_failed`
- `heartbeat`

## 执行流程

1. 用户提交目标。
2. `Plan Agent` 生成任务 DAG。
3. orchestrator 为叶子任务创建 worker run。
4. worker run 执行现有 `runAgentGraph()`。
5. worker 持续回报 trace / step / progress。
6. `Plan Agent` 订阅 child run stream，更新任务状态。
7. 遇到阻塞、失败、超时或范围变化时，触发重规划。
8. 所有任务完成后，由 `Plan Agent` 做汇总和验收。

## 监控策略

Plan Agent 不应该读取大段自然语言聊天记录来判断进度，而应该读取结构化状态：

- 当前 task 状态
- task progress
- 最近 event
- blocked reason
- child run status
- artifact 列表

建议增加这些能力：

- `getChildRuns(parentRunId)`
- `getTaskTree(planId)`
- `subscribePlanStream(planId)`
- `cancelSubtree(runId)`

## API 规划

建议新增：

- `POST /plans`
- `GET /plans/:id`
- `GET /plans/:id/tasks`
- `GET /runs?parentRunId=...`
- `GET /runs/:id/children`
- `POST /runs/:id/replan`
- `POST /runs/:id/cancel-tree`

## 代码落点

优先改这些文件：

- `apps/agent/src/state/types.ts`
- `apps/agent/src/state/store.ts`
- `apps/agent/src/application/agentRuntime.ts`
- `apps/agent/src/orchestration/agentGraph.ts`
- `apps/agent/src/server.ts`

建议新增这些文件：

- `apps/agent/src/orchestration/supervisorGraph.ts`
- `apps/agent/src/state/planStore.ts`
- `apps/agent/src/state/planTypes.ts`

## 分期实施

### Phase 1: 结构补齐

- 增加 planner/worker role。
- 增加 parent-child run 关系。
- 增加 plan/task 数据模型。
- 复用现有 stream 和 trace 做监控。

### Phase 2: Supervisor

- 新增 plan agent 的调度逻辑。
- 支持 spawn worker run。
- 支持 child run 汇总到 plan 状态。

### Phase 3: UI 和 API

- 增加 plan 总览接口。
- 增加任务树和 child run 视图。
- 增加重规划和 subtree cancel。

### Phase 4: 细化协议

- 统一 progress update 事件。
- 统一 blocked / needs_input 语义。
- 增加重试、超时和回滚策略。

## 关键原则

- 先复用现有 worker loop，不重写执行器。
- planner 只调度和监控，不直接承担业务写权限。
- 任务状态必须结构化，不依赖纯自然语言。
- 子 agent 必须可观测、可取消、可重放。

