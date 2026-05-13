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
- 公开 `POST /runs` 用户会话入口会强制创建 planner run，并忽略外部传入的 worker 层级字段；只有 planner 调度路径会创建 worker。
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
- 显式传 `subagentName` / `subagentNames`；`subagentNames` 可以是与 `taskIds` 同顺序的数组，也可以是 `{ [taskId]: subagentName }` 映射。
- 省略名字，让 runtime 自动按序分配；新建 task 已分配的名字会被保留，不会在 dispatch 前被二次改名。
- 同一个 plan 内 `subagentName` 必须唯一；重复名字会被拒绝，避免 wait/cancel by name 出现歧义。
- 创建新 task 前会先完成名字、task id、已有 task 归属 plan 的校验；校验失败不会留下部分创建的 task。
- 新建 task 的 `parentId` / `deps` 必须指向同一个 plan 内已有 task，或同一次请求中一起创建的 task；自 parent / 自依赖会被拒绝。
- task dependency graph 和 parent hierarchy 都必须保持无环；初始 plan、replan 新增 task、task update 都会拒绝形成 cycle 的 `deps` 或 `parentId`。
- 传 `maxWorkers`、`retryFailed`、`maxTaskAttempts`、`workerTimeoutMs` 控制本次 dispatch；单个 task 的 `maxTaskAttempts` / `workerTimeoutMs` metadata 会覆盖顶层默认值。

默认名字顺序：

```text
爱因斯坦, 霍金, 图灵, 居里, 费曼, 冯诺依曼, 达尔文, 牛顿, 伽利略, 开普勒
```

超过内置列表后使用：

```text
子代理11, 子代理12, ...
```

直接调用 `dispatchPlan()` 的路径也会为 runnable worker task 自动补 `subagentName`，确保 UI 操作和 planner 工具行为一致。
直接 dispatch 也必须提供同一个 plan 内的 planner run；worker run 或其他 plan 的 planner run 不能派发当前 plan 的 worker。
Replan 可以从 worker run 详情页触发，但 runtime 会解析到同 plan 的 planner run；显式传入 worker run 作为 `plannerRunId` 会被拒绝，并且会在修改 task 前失败。

### `list_subagents`

返回当前 plan 下 task 和 worker 快照，包含：

- task status / progress / blocker / artifact
- worker run status / progress / pending input / pending approval
- `subagentName`
- `nameConflicts`，用于提示历史状态里重复的 `subagentName` 及对应 task ids。
- `artifacts`，使用和 planner prompt 相同的 plan artifact reference 摘要，包括 source task title / status / owner run。
- `summary`，包含 task 状态计数、worker 数、active worker 数、artifact 数、name conflict 数，以及 blocked / needs_review / failed task ids。

### `wait_subagent`

支持按以下方式定位：

- `subagentName`
- `taskId`
- `runId`
- 整个 plan

如果历史状态里已经存在重复 `subagentName`，按名字 wait 会返回歧义错误，不会静默选择第一个匹配项。

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

如果 task 已经有 owner worker run，会取消该 worker run subtree；如果 task 还没有 owner run，且状态是 `pending`、`blocked` 或 `needs_review`，会直接把该 subagent task 标记为 `cancelled`，用于取消尚未启动的排队工作。

返回结构包含：

- `target.kind`
- `target.run` 或 `target.task`
- `target.run.subagentName` / `target.task.subagentName`
- `target.run.status` / `target.task.status`
- `cancelledRunIds`
- `snapshot`

取消边界：

- 只能取消同一个 plan 内的 worker run。
- 没有 worker run 的 task 只能在 `pending`、`blocked` 或 `needs_review` 状态下被关闭为 cancelled；已完成、已失败或已取消的 task 会返回 unchanged。
- 不能跨 plan 取消。
- 不能用 `cancel_subagent` 取消 planner/root run。
- 如果历史状态里已经存在重复 `subagentName`，按名字 cancel 会返回歧义错误；需要改用 `taskId` / `runId` 或先修复重复名字。
- 后续新的 planner run 可以继续取消同 plan 中旧 planner 创建的 worker，因此支持跨 run 生命周期管理。

### Task Update 边界

外部 task update 入口不能破坏 plan DAG：

- 初始 `createPlan` 和 `replan addTasks` 会在写入前校验整批 task graph；失败不会留下 plan 或部分新增 task。
- `replanRun` 会把同次 `addTasks` 和 `updates` 放在同一个预校验视图里检查；update 可以引用本次新增 task，但任何 update 校验失败都不会先写入新增 task。
- `ownerRunId` 必须指向同一个 plan 内的 run；如果该 run 已绑定 `taskId`，必须和被更新 task 一致。
- `parentId` / `deps` 必须指向同一个 plan 内真实存在的 task。
- `parentId: null` 或空字符串可以清除父节点，把 task 移回顶层。
- task 不能把自己设为 parent，也不能依赖自己；任何更新都不能让 dependency graph 或 parent hierarchy 形成 cycle。
- `metadata.subagentName` 不能和同一个 plan 内其它 task / worker run 重名。

## 前端行为

Plan overview 面板当前支持：

- 显示 plan 进度、plan-level 状态解释和 task 状态。
- Plan-level active worker 计数只统计 worker run，不把用户会话默认 planner/root run 计入 worker 数。
- 显示 task 对应的 `subagentName`，没有名字时才回退到 `ownerRunId`。
- 显示历史 `subagentName` 冲突摘要和每个冲突 task 的状态、owner run，并可从冲突条目跳转到 task / run，避免用户或 planner 在 wait/cancel 前看不到名字歧义。
- Dispatch / Replan / Cancel tree 操作。
- Replan 会重置 `blocked`、`needs_review`、`failed`、`cancelled` 任务，并可重新派发可运行 worker。
- Dispatch / Replan 可在 Plan overview 面板中配置并发 worker 数、单任务最大尝试次数和 worker timeout；task metadata 里的 `maxTaskAttempts` / `workerTimeoutMs` 可覆盖单个 worker task 的 retry / timeout 策略；Rework 会复用当前 retry/timeout 策略，但只派发当前任务。
- 这些 Plan overview 调度偏好会写入前端 agent settings 并持久化，刷新后仍保留；异常旧值会被归一化到安全默认值。
- `needs_review` 任务行支持 Accept / Rework / Reject：Accept 将任务标记为完成，Rework 只重置当前任务并重新派发 worker，Reject 将任务关闭为 cancelled 并记录拒绝原因。
- 任务行会显示 retry attempt、max attempts、timeout、previous status / previous owner run 等调度线索，并提供 pending / running / blocked / needs_review / done / failed / cancelled 的简短状态解释；任务行可展开查看 pending input / pending approval 的标题、问题、工具名、风险和权限。
- 任务行可展开查看 worker run 详情，包括 run id、parent/task、状态、进度、step 数、最近 steps、时间戳、error 和 warnings。
- Worker run 详情可按需加载 trace summary，展示 trace event 总数、按 kind 统计和最新事件，默认不增加 plan 轮询成本。
- Worker run 详情可按需加载最近 trace events，展示 event kind、title、status、tool、step、时间和 summary，支持按 kind 过滤和 Load more 分页追加。
- Worker run 详情可跳转到 `/agent/runs/:runId` 完整运行视图。
- `/agent/runs/:runId` 可查看 run 基本信息、child runs、pending input / approval 详情、plan/task context、当前 task 状态解释、当前 task artifact 摘要、trace summary、trace events、kind 过滤、搜索、分页和 `#event-{eventId}` 深链接；planner/root run 可从 child runs 直接跳转到 worker run；当前 task artifact 会显示 source task title / status，并可跳转到 source run 或 source task owner run；Refresh 会同步刷新 run、child runs、plan context、trace summary 和已加载 trace events；在 run 之间导航会重置 trace event 列表、搜索和过滤，并忽略旧 run 的过期 trace events 响应；事件行可复制当前事件链接，并可展开查看结构化 event data JSON；直接打开事件深链时会自动分页加载 trace events 直到找到目标或没有更多事件，找不到目标时会显示明确提示；非终态 worker run 可直接从 run detail 取消 worker subtree，并刷新 run / plan / trace 状态；取消失败会在页面内显示 runtime 返回的错误，避免静默失败；pending approval 可在 run detail 直接 Approve / Reject，成功后刷新 run / plan / trace，失败时在 approval 区域显示 runtime 错误；pending input 可在 run detail 直接选择预设答案或提交自定义文本，成功后刷新 run / plan / trace，失败时在 input 区域显示 runtime 错误。
- Plan overview 顶部提供 plan-level artifact summary，可按类型快速看聚合数量、按 artifact type 过滤、按最近产物浏览跨任务输出，并可从产物跳转到 owning task、来源 run 或 source task owner run。
- Plan overview 会优先使用后端 plan snapshot 的 `summary` 渲染 plan-level 状态解释；旧 snapshot 或缺少 summary 时才从本地 task/run 状态回退计算。
- Plan overview 暴露稳定 UI test hooks，用于 E2E/契约测试定位 overview、summary stats、状态解释、name conflict 和 artifact summary 区域。
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

`GET /plans/:id` 返回的 plan snapshot 会携带可复用的 `summary`，字段和 subagent tool snapshot 对齐：task 状态计数、worker 数、active worker 数、artifact 数、name conflict 数，以及 blocked / needs_review / failed task refs。`GET /plans/:id/stream` replay 和后续 lifecycle event snapshot 也使用同一套 summary。这样 UI、planner prompt、plan stream 和 planner-only tool results 使用同一套 plan-level 摘要口径。

Planner-only subagent tools 通过模型 tool 调用进入 runtime，不作为面向普通 UI 的独立 HTTP endpoint 暴露。

## Prompt 和上下文

Planner prompt 在 subagent 工具可用时会注入 `Planner Subagent Policy`，核心约束：

- 简单任务自己完成。
- 可并行、隔离上下文或可能跨 run 的任务才 spawn worker。
- spawn / redispatch worker 时可用 `maxWorkers` 控制并发，用 `retryFailed` + `maxTaskAttempts` 重试 failed/cancelled 任务，用 `workerTimeoutMs` 在派发前取消 stale active worker；task-level override 优先于本次调用默认值。
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

- plan summary：task 状态计数、active worker、artifact、name conflict 和重点 task refs
- artifact title / type / ref uri
- task / source task
- source task title / status / owner run
- source run
- subagentName
- toolName / rollback policy

这样 planner 在最终综合、返工和解释产物来源时，不需要回退到自然语言猜测。

如果 plan context 发现历史重复 `subagentName`，会渲染 `nameConflicts`，并带上冲突 task 的 title / status / owner run / worker status，让 planner 在 wait/cancel 前先处理歧义。

## 关键测试覆盖

主要覆盖在：

- `apps/agent/src/application/agentRuntime.test.ts`
- `apps/agent/src/orchestration/contextBuilder.test.ts`
- `apps/agent/src/server.memories.test.ts`
- `apps/frontend/src/lib/agentGenerationUiContract.test.tsx`
- `apps/frontend/src/lib/agentPlanUi.test.ts`
- `apps/frontend/src/e2e/agent-planner.spec.ts`

覆盖点包括：

- planner runtime tools spawn/list/wait worker subagents。
- `spawn_subagent` 自动分配人类可读名字。
- 直接 `dispatchPlan()` 自动补 worker 名字。
- 可按 `subagentName` wait/cancel。
- 后续 planner run 可取消同 plan 内旧 worker。
- worker run 不能使用 planner-only subagent tools。
- planner capabilities 暴露 subagent scheduling tools。
- prompt context 名字优先，id 仅作为 reference。
- HTTP `GET /plans/:id` plan snapshot 会暴露可复用 summary。
- Plan stream replay / lifecycle snapshots 会暴露同一套 summary，并覆盖 artifact count、active worker count 和完成状态。
- 前端 plan snapshot 轮询和 planner run 解析。
- 前端 Plan overview 会从 task/run 状态生成 plan-level 状态解释，汇总 active worker、blocked、needs review、failed、cancelled、pending 和 completed 状态。
- 前端 Plan overview 会优先使用后端 plan snapshot summary，并在缺失时回退到本地 task/run 汇总。
- 前端 Plan overview 保留稳定 UI hooks，覆盖 overview、stats、状态解释、name conflict 和 artifact summary。
- 前端 plan task view 会保留 pending input / approval 的结构化详情，而不是只显示数量。
- 前端 plan task view 会保留 worker run 详情和最近 step 摘要，用于解释 worker 生命周期和排查失败。
- 前端 plan task view 会为每个 task 生成简短状态解释，明确等待输入、等待审批、等待 review、blocked、running、failed、cancelled、done 等状态含义。
- 前端 name conflict view 会展示冲突 task 的 title、status、owner run、worker status，并支持跳转到对应 task / run。
- 前端 worker 详情可按需调用 run trace summary endpoint，辅助 drilldown。
- 前端 worker 详情可按需调用 run trace events endpoint，查看最近事件列表、按 event kind 过滤，并用 cursor 追加更多事件。
- 前端提供 `/agent/runs/:runId` 完整运行视图，并可从 Plan overview worker detail 或 artifact source run 进入；该页面复用 Plan overview 的 task 状态解释，并支持 pending input / approval 详情、plan/task context、当前 task artifact 摘要与来源 run 跳转、parent/root run 跳转、trace event 搜索、分页、事件深链接复制、深链自动分页查找和缺失事件提示。
- 前端 `/agent/runs/:runId` 保留稳定 UI hooks，覆盖 header、sidebar、child runs、plan context、task artifacts、pending input / approval、input choice / text / submit / error、approval action / error、trace summary、trace search、trace load、trace event rows、trace event details、worker cancel 操作和 cancel error。
- 浏览器级 planner E2E 覆盖从默认 planner 会话的 Plan overview 到 planner root child-run drilldown 和 worker run detail，并校验 trace summary、trace event 加载、搜索、trace event details、worker subtree 取消后的刷新状态、取消失败时的错误反馈、pending approval 成功处理和失败反馈，以及 pending input 成功回答和失败反馈。
- 前端 artifact summary 会对整个 plan 的产物做按类型统计、按时间排序、按类型过滤，并保留 owning task id/title、source task title/status/owner run 与 source run/task provenance 用于 UI 跳转。
- subagent 工具结果契约覆盖 `spawn/list/wait/cancel` 的顶层字段、target、snapshot summary、snapshot artifact references 和 name-first worker summary。
- `needs_review` 任务可通过 replan 重置为 pending，并保留 previous status / owner 后重新派发 worker。
- `needs_review` 任务可通过 task update 验收为 done，并记录 review outcome metadata。
- `needs_review` 任务可通过 task update 拒绝为 cancelled，并记录 review outcome metadata 和关闭原因。
- worker retry / timeout 会写入 task metadata，并在 plan task view 中展示 attempt、timeout 和 previous run/status。
- worker task 可通过 metadata 覆盖 `maxTaskAttempts` 和 `workerTimeoutMs`；supervisor retry / timeout 会优先使用 task-level override，再回退到 dispatch / replan / `spawn_subagent` 顶层默认值。
- 前端 Plan overview 可配置 worker 并发、最大尝试次数和 timeout，并将配置传给 dispatch / replan。
- worker 并发、最大尝试次数和 timeout 已进入持久化 agent settings，并带有迁移归一化测试。
- planner prompt 会渲染 plan summary 和 plan artifact references，保留 task / run / subagent / tool / policy provenance。
- default profile 的自动 tool grants 只补充 enabled packs 覆盖的工具，避免 profile 越过 pack 边界。

## 剩余演进方向

- 将 plan/task/subagent 状态做成更完整的 UI，继续补齐更细的状态解释和跨视图跳转。
- 继续增强 artifact browser 和子 agent 详情的联动能力。
