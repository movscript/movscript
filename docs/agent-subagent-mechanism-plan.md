# Agent 子 Agent 机制

本文档记录当前 `apps/agent` 中已经落地的 `planner + worker subagent` 机制，以及后续演进边界。它不再是早期实施计划。

## 当前目标

- 简单、单上下文任务由 planner 自己完成。
- 需要并行、隔离上下文、长时间运行或可独立验收的任务，由 planner 调度 worker subagent。
- Worker 复用现有单 run 执行器，不重写 agent loop。
- Planner 通过结构化 plan/task/run 状态监控 worker，而不是靠自然语言猜测进度。
- 面向用户和 AI 的表达优先使用 `subagentName`，例如 `爱因斯坦`、`霍金`；`taskId` / `runId` 只作为稳定引用和 API 参数。

## 运行模型

```text
User Goal
  -> Planner run
  -> Plan + Task DAG
  -> Worker subagent runs
  -> Task/run trace, artifacts, blockers
  -> Planner list/wait/cancel/replan
  -> Planner final synthesis
```

### Planner

Planner 负责：

- 用户会话创建的根 run 默认就是 planner。
- 生成或维护 task DAG。
- 判断任务由自己完成还是交给 worker。
- 调用 planner-only 工具调度 worker。
- 处理 wait 结果里的 `pending`、`blocked`、`needs_review`、`failed`、`cancelled`、`completed` 状态。
- 做最终汇总、重规划和用户可见结论。

### Worker Subagent

Worker 负责：

- 只作为 planner 派生出的 worker/subagent run 存在；普通用户会话不会默认创建 worker。
- 执行一个明确子任务。
- 使用局部上下文和可用工具。
- 通过 run step、trace event、task artifact、blocked reason 回传结构化状态。
- 不调度其他 subagent。调度工具对 worker run 不可用。

### Runtime / Orchestrator

Runtime 负责：

- plan/task/run 持久化。
- worker spawn、dispatch、cancel、retry、timeout。
- task 状态从 worker run 同步。
- plan stream / run stream / trace 回放。
- `subagentName` 分配、查找和跨 run 生命周期管理。

## 数据结构

`AgentRun` 已支持：

- `role`: `planner | worker`
- `parentRunId`
- `planId`
- `taskId`
- `progress`
- `blockedReason`
- `metadata.subagentName`

`AgentTask` 已支持：

- `id`
- `planId`
- `parentId`
- `deps`
- `title`
- `description`
- `status`: `pending | running | blocked | needs_review | done | failed | cancelled`
- `progress`
- `ownerRunId`
- `blockedReason`
- `artifacts`
- `metadata.subagentName`

底层仍保留 `taskId` / `runId`，用于稳定关联、API 路由、trace 和存储。Planner 和前端展示应优先使用 `subagentName`。

## Planner 工具

以下 runtime tools 只对 planner run 开放：

- `movscript_spawn_subagent`
- `movscript_list_subagents`
- `movscript_wait_subagent`
- `movscript_cancel_subagent`

Worker run 的能力解析会把这些工具标为 `wrong_run_role`，避免 worker 再调度 worker。

### `spawn_subagent`

Planner 可以：

- 创建新 worker task 并 dispatch。
- 对已有 `taskId` / `taskIds` dispatch worker。
- 显式传 `subagentName` / `subagentNames`。
- 省略名字，让 runtime 自动按序分配。

默认名字顺序：

```text
爱因斯坦, 霍金, 图灵, 居里, 费曼, 冯诺依曼, 达尔文, 牛顿, 伽利略, 开普勒
```

超过内置列表后使用：

```text
子代理11, 子代理12, ...
```

直接调用 `dispatchPlan()` 的路径也会为 runnable worker task 自动补 `subagentName`，确保 UI 操作和 planner 工具行为一致。

### `list_subagents`

返回当前 plan 下 task 和 worker 快照，包含：

- task status / progress / blocker / artifact
- worker run status / progress / pending input / pending approval
- `subagentName`

### `wait_subagent`

支持按以下方式定位：

- `subagentName`
- `taskId`
- `runId`
- 整个 plan

返回结构化状态：

- `pending`
- `completed`
- `failed`
- `cancelled`
- `blocked`
- `needs_review`

如果返回 `pending`，planner 必须继续处理其他独立工作或如实说明 worker 仍在运行，不能假装完成。

### `cancel_subagent`

支持按 `subagentName`、`taskId` 或 `runId` 取消 worker subagent。

返回结构包含：

- `target.kind`
- `target.run`
- `target.run.subagentName`
- `target.run.status`
- `cancelledRunIds`
- `snapshot`

取消边界：

- 只能取消同一个 plan 内的 worker run。
- 不能跨 plan 取消。
- 不能用 `cancel_subagent` 取消 planner/root run。
- 后续新的 planner run 可以继续取消同 plan 中旧 planner 创建的 worker，因此支持跨 run 生命周期管理。

## 前端行为

Plan overview 面板当前支持：

- 显示 plan 进度和 task 状态。
- 显示 task 对应的 `subagentName`，没有名字时才回退到 `ownerRunId`。
- Dispatch / Replan / Cancel tree 操作。
- Replan 会重置 `blocked`、`needs_review`、`failed`、`cancelled` 任务，并可重新派发可运行 worker。
- Dispatch / Replan 可在 Plan overview 面板中配置并发 worker 数、单任务最大尝试次数和 worker timeout；Rework 会复用当前 retry/timeout 策略，但只派发当前任务。
- 这些 Plan overview 调度偏好会写入前端 agent settings 并持久化，刷新后仍保留；异常旧值会被归一化到安全默认值。
- `needs_review` 任务行支持 Accept / Rework / Reject：Accept 将任务标记为完成，Rework 只重置当前任务并重新派发 worker，Reject 将任务关闭为 cancelled 并记录拒绝原因。
- 任务行会显示 retry attempt、timeout、previous status / previous owner run 等调度线索，并可展开查看 pending input / pending approval 的标题、问题、工具名、风险和权限。
- 任务行可展开查看 worker run 详情，包括 run id、parent/task、状态、进度、step 数、最近 steps、时间戳、error 和 warnings。
- Worker run 详情可按需加载 trace summary，展示 trace event 总数、按 kind 统计和最新事件，默认不增加 plan 轮询成本。
- Worker run 详情可按需加载最近 trace events，展示 event kind、title、status、tool、step、时间和 summary，支持按 kind 过滤和 Load more 分页追加。
- Worker run 详情可跳转到 `/agent/runs/:runId` 完整运行视图。
- `/agent/runs/:runId` 可查看 run 基本信息、trace summary、trace events、kind 过滤和分页。
- Plan overview 顶部提供 plan-level artifact summary，可按类型快速看聚合数量、按 artifact type 过滤、按最近产物浏览跨任务输出，并可从产物跳转到 owning task。
- 当前 active run 是 worker 时，前端仍会解析到 plan root planner run，避免 UI 被某个 worker 接管。
- 只要 plan 未终态，或 snapshot 里仍有 active worker run，就继续轮询 plan snapshot。

相关前端 helper：

- `apps/frontend/src/lib/agentPlanUi.ts`

## API

已支持：

- `POST /plans`
- `GET /plans`
- `GET /plans/:id`
- `GET /plans/:id/tasks`
- `POST /plans/:id/dispatch`
- `GET /plans/:id/stream`
- `GET /runs?parentRunId=...`
- `GET /runs/:id`
- `GET /runs/:id/children`
- `GET /runs/:id/trace`
- `GET /runs/:id/trace/summary`
- `POST /runs/:id/replan`
- `POST /runs/:id/cancel-tree`

Planner-only subagent tools 通过模型 tool 调用进入 runtime，不作为面向普通 UI 的独立 HTTP endpoint 暴露。

## Prompt 和上下文

Planner prompt 在 subagent 工具可用时会注入 `Planner Subagent Policy`，核心约束：

- 简单任务自己完成。
- 可并行、隔离上下文或可能跨 run 的任务才 spawn worker。
- 后续 wait/cancel 使用 `subagentName`。
- list/wait 结构化状态优先于自然语言推测。
- planner 保持最终综合和重规划责任。

Plan context 渲染时，有名字的 worker/task 会以 `subagentName` 作为主标签，例如：

```text
- 爱因斯坦: Run worker (status=running; progress=25%; taskRef=task#task_b)
- 爱因斯坦: in_progress (runRef=run#run_worker; task=task#task_b)
```

`taskRef` / `runRef` 仅用于工具参数和调试，不应成为用户可见主称呼。

Planner prompt 还会带上 plan artifact references，摘要包含：

- artifact title / type / ref uri
- task / source task
- source run
- subagentName
- toolName / rollback policy

这样 planner 在最终综合、返工和解释产物来源时，不需要回退到自然语言猜测。

## 关键测试覆盖

主要覆盖在：

- `apps/agent/src/application/agentRuntime.test.ts`
- `apps/agent/src/orchestration/contextBuilder.test.ts`
- `apps/frontend/src/lib/agentPlanUi.test.ts`

覆盖点包括：

- planner runtime tools spawn/list/wait worker subagents。
- `spawn_subagent` 自动分配人类可读名字。
- 直接 `dispatchPlan()` 自动补 worker 名字。
- 可按 `subagentName` wait/cancel。
- 后续 planner run 可取消同 plan 内旧 worker。
- worker run 不能使用 planner-only subagent tools。
- planner capabilities 暴露 subagent scheduling tools。
- prompt context 名字优先，id 仅作为 reference。
- 前端 plan snapshot 轮询和 planner run 解析。
- 前端 plan task view 会保留 pending input / approval 的结构化详情，而不是只显示数量。
- 前端 plan task view 会保留 worker run 详情和最近 step 摘要，用于解释 worker 生命周期和排查失败。
- 前端 worker 详情可按需调用 run trace summary endpoint，辅助 drilldown。
- 前端 worker 详情可按需调用 run trace events endpoint，查看最近事件列表、按 event kind 过滤，并用 cursor 追加更多事件。
- 前端提供 `/agent/runs/:runId` 完整运行视图，并可从 Plan overview worker detail 进入。
- 前端 artifact summary 会对整个 plan 的产物做按类型统计、按时间排序、按类型过滤，并保留 owning task id/title 用于 UI 跳转。
- subagent 工具结果契约覆盖 `spawn/list/wait/cancel` 的顶层字段、target、snapshot 和 name-first worker summary。
- `needs_review` 任务可通过 replan 重置为 pending，并保留 previous status / owner 后重新派发 worker。
- `needs_review` 任务可通过 task update 验收为 done，并记录 review outcome metadata。
- `needs_review` 任务可通过 task update 拒绝为 cancelled，并记录 review outcome metadata 和关闭原因。
- worker retry / timeout 会写入 task metadata，并在 plan task view 中展示 attempt、timeout 和 previous run/status。
- 前端 Plan overview 可配置 worker 并发、最大尝试次数和 timeout，并将配置传给 dispatch / replan。
- worker 并发、最大尝试次数和 timeout 已进入持久化 agent settings，并带有迁移归一化测试。
- planner prompt 会渲染 plan artifact references，保留 task / run / subagent / tool / policy provenance。
- default profile 的自动 tool grants 只补充 enabled packs 覆盖的工具，避免 profile 越过 pack 边界。

## 剩余演进方向

- 将 plan/task/subagent 状态做成更完整的 UI，包括完整运行视图里的 trace event 搜索和深链接。
- 支持更细的 task-level override，例如某类 worker 使用独立 timeout / retry 策略。
- 继续增强 artifact browser 和子 agent 详情的联动能力。
