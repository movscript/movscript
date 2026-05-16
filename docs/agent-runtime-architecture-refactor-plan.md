# Agent Runtime Architecture Refactor Plan

本文档定义 Movscript Agent 后续重构的目标架构、核心语义、模块边界、迁移步骤和验收标准。

目标不是一次性推翻现有实现，而是把当前已经能运行的系统逐步调整到更高质量项目应有的标准：实体语义清晰、上下文不污染、状态流可追踪、策略可解释、模块责任可测试。

## 背景

当前 Agent 已经包含 thread/run/task、skills、tools、drafts、memory、context、approval/input、stream、subagent 等能力。主要问题不是功能缺失，而是多个概念被混在同一个控制面里：

- `Thread` 既表示用户对话，又被用作 worker/subagent 的任务消息通道。
- `Run` 既表示执行记录，又承载 catalog snapshot、context ledger、approval state、forced tool call、client input 等多类运行状态。
- `Task` 与 `Run` 双写状态，缺少清晰的 source of truth。
- `AgentRuntime` 同时承担 use case facade、编排器、catalog manager、plan manager、stream hub、draft/memory facade、approval/input handler 等职责。
- Skill 激活和 tool 可见性依赖多层隐式规则，解释成本高。
- 前端 conversation、runtime thread、run、page task request id 多套会话标识并存。

这些问题会让系统继续增长时出现上下文污染、并发任务互相干扰、策略配置失真、UI 状态难以恢复、测试难以定位等风险。

## 设计目标

1. 实体语义稳定：每个核心实体只承担一种主要职责。
2. 上下文隔离：用户对话历史、执行输入、工具结果、检索上下文、任务消息不能互相污染。
3. 状态单向投影：避免多个实体同时作为同一状态的源。
4. 策略可解释：工具为什么可见、为什么可调用、为什么需要审批，必须能从明确规则推出。
5. 运行可恢复：approval/input/cancel/resume 都应基于持久化 run state，而不是依赖内存时序。
6. 模块可测试：核心编排、工具策略、skill routing、plan dispatch 都能用纯输入输出测试覆盖。
7. 渐进迁移：保持现有 API 大体可用，先引入新模型和适配层，再逐步收敛旧路径。

## Canonical Terms

### Thread

`Thread` 是用户可见的对话容器。

它应该只包含用户和 assistant 最终可见消息，以及必要的对话级 metadata。

Thread 不应该承担：

- worker task queue
- subagent private prompt history
- tool loop transcript
- approval/input pending state
- plan dispatch state

### Message

`Message` 是 thread 中的用户可见消息。

模型内部工具调用、工具结果、worker 任务输入、运行 trace 不应该作为普通 user message 写入 thread。需要展示时，通过 run trace 或 artifact 引用生成 UI 视图。

### Run

`Run` 是一次执行尝试。

Run 应该拥有：

- immutable input snapshot
- execution status
- selected manifest/profile/catalog snapshot
- policy snapshot
- approval/input pending state
- steps and trace refs
- output message/artifact refs

Run 不应该通过读取 thread 最新 user message 来推断自己的执行输入。创建 run 时必须冻结 `RunInput`。

### RunInput

`RunInput` 是 run 的不可变执行输入。

建议新增一等字段或一等存储对象：

```ts
interface AgentRunInput {
  schema: 'movscript.agent.run-input.v1'
  userMessage: string
  clientInput?: NormalizedClientInput
  sourceMessageId?: string
  executionMode: 'chat' | 'tool' | 'worker' | 'resume'
  parent?: {
    runId?: string
    planId?: string
    taskId?: string
  }
  task?: {
    id: string
    title: string
    description?: string
    instructions: string
    expectedArtifacts?: string[]
  }
  forcedToolCall?: ToolCall
  createdAt: string
}
```

`thread.messages` 可以作为历史上下文输入的一部分，但不能作为 run 当前任务的唯一来源。

### Plan

`Plan` 是同一用户目标下的一组任务集合和调度状态。

Plan 只描述任务图、整体进度和调度摘要，不直接承载 worker 的 prompt 或工具结果。

### Task

`Task` 是 plan 中的工作单元。

Task 是计划层状态，Run 是执行层状态。建议规则：

- Task 的结构字段由 plan/replan 维护：title、description、deps、parentId、expectedArtifacts。
- Task 的执行状态由 owner run 投影：running、blocked、done、failed、cancelled。
- UI 可以标记 review outcome，但不应随意覆盖 run-derived execution status。

### Step

`Step` 是 run 中的结构化执行步骤，主要用于恢复和简要展示。

Step 应该保持轻量，完整细节进入 trace。

### TraceEvent

`TraceEvent` 是运行可观测性日志。

它可以记录 prompt、policy、model_call、tool_call、approval、input、context、task、error 等事件。Trace 不应作为业务状态的 source of truth。

### ContextLedger

`ContextLedger` 是 run 内上下文账本。

它记录哪些上下文来自哪里、证据等级是什么、是否进入 prompt。它是 run context 的结构化审计记录，不应混在任意 metadata 里长期漂移。

## Target Architecture

目标目录结构建议：

```text
apps/agent/src/
  jsonValue.ts                   Shared JSON value / JSON record guards

  application/
    agentRuntime.ts              Thin facade / composition boundary
    runService.ts                Run create/start/resume/cancel
    threadService.ts             User-visible thread/message lifecycle
    threadLifecycle.ts           Thread/message input normalization and mutation helpers
    runtimeThreadLifecycle.ts    Runtime thread/message store-facing lifecycle
    runtimeThreadRead.ts         Runtime thread read boundary
    interactionService.ts        Approval and user input lifecycle
    planService.ts               Plan/task CRUD, replan, review outcome
    streamService.ts             Run/plan SSE subscription and replay
    runExecutionInput.ts         Run creation, preview, tool-run, and execution input selection
    runAuth.ts                   Backend auth token/base URL normalization, metadata, and per-run auth registry
    runLifecycleControl.ts       Run cancellation, controller registry, subtree traversal, and lifecycle timing helpers
    runtimeRunInteraction.ts     Runtime approval/input interaction flow and visible messages
    runtimeMessageFactory.ts     Runtime user-visible message creation
    runtimePlanContext.ts        Runtime plan debug-context store attachment
    runtimeReplanTaskCreation.ts Runtime replan add-task creation validation
    runtimeScalarInput.ts        Facade-level scalar input normalization
    runtimeCapabilities.ts       Runtime manifest/tool/MCP capability response boundary
    runtimeIdentity.ts           Runtime-local ID and timestamp construction
    runtimeManifest.ts           Runtime manifest selection and normalization
    runtimeMemoryOperations.ts   Runtime memory list/get/create/delete facade boundary
    runtimeCatalogSnapshot.ts    Runtime catalog snapshot construction, version normalization, and per-run snapshot registry
    runtimeCatalogRead.ts        Runtime tools/skills/default-manifest/catalog-inspection read boundary
    runtimeCatalogReload.ts      Runtime catalog reload decision and response projection
    runtimeDeferredTasks.ts      Runtime deferred task tracking and flush coordination
    runtimeDraftOperations.ts    Runtime draft CRUD/validation/preview/simulate/apply boundary
    runtimeEventSubscribers.ts   Run/plan stream listener registry and lifecycle cleanup
    runtimeAgentPlanTools.ts     Runtime agent plan tool binding and response projection boundary
    runtimePlanBinding.ts        Runtime store boundary for planner-run and plan attachment
    runtimePlanCreation.ts       Runtime plan creation, task generation, root run, and creation flow
    runtimePlanDispatch.ts       Runtime dispatch full flow and result boundary
    runtimePlanProjection.ts     Runtime plan status projection persistence
    runtimePlanRead.ts           Runtime plan and task-tree read boundary
    runtimePlanSnapshot.ts       Runtime plan snapshot store projection
    runtimePlanTreeCancellation.ts Runtime plan tree cancellation root validation
    runtimeReplanPreparation.ts  Runtime replan validation, task changes, and finalization boundary
    runtimeRunCancellation.ts    Runtime run subtree cancellation planning and application boundary
    runtimeRunCreation.ts        Runtime chat/tool run construction and creation application boundary
    runtimeRunPreview.ts         Runtime preview context, skills, tools, policy, and prompt boundary
    runtimeStoreLookup.ts        Runtime entity lookup and stable not-found errors
    runtimeSubagentTaskCancellation.ts Runtime subagent cancellation flow and response boundary
    runtimeSubagentRead.ts       Runtime subagent list/wait read and snapshot boundary
    runtimeSubagentSpawn.ts      Runtime spawn_subagent full flow and response projection
    runtimeTaskAssignment.ts     Runtime task ownership assignment persistence
    runtimeTaskDispatch.ts       Runtime dispatch blocker and worker ownership persistence
    runtimePlanTaskMaintenance.ts Runtime retry/replan task reset persistence and callback boundary
    runtimeTaskRunSync.ts        Runtime run-to-task projection persistence and callback boundary
    runtimeTaskUpdate.ts         Runtime task update validation, persistence, and callback boundary
    runtimeWorkerTimeout.ts      Runtime worker timeout detection application and task metadata persistence
    runtimeRunProjection.ts      Runtime product-safe run lookup projection
    runtimeThreadTitle.ts        Runtime thread title generation state, model call, and fallback boundary
    runtimeThreadProjection.ts   Runtime thread run-status projection persistence
    assistantMessage.ts          User-visible assistant message composition helpers

  orchestration/
    agentGraph.ts                Model-policy-tool loop only
    executionCoordinator.ts      Run setup -> graph -> completion persistence
    runContextBuilder.ts         Runtime focus, memory, skills, tools, prompt setup
    toolExecutor.ts              Runtime/MCP tool execution
    supervisorGraph.ts           Plan dispatch decision only

  catalog/
    catalogInspectView.ts        Catalog/profile/pack/skill/tool inspection views and summaries
    catalogIssuePolicy.ts        Catalog lint issue rollback/blocking policy
    loader.ts                    Catalog filesystem/plugin loading
    registry.ts                  Layered catalog registry construction
    linter.ts                    Catalog integrity validation

  drafts/
    draftRuntimeContent.ts       Runtime draft content/source normalization rules
    draftRuntimeInput.ts         Runtime draft API input normalization
    draftApply.ts                Local draft apply preview and status transitions
    draftStore.ts                Draft persistence and patch validation

  generation/
    generationEvents.ts          Generation job event and monitor request projection
    generationBackendError.ts    MCP backend generation error data normalization

  state/
    types.ts                     Canonical entity types
    store.ts                     Persistence port
    planFactory.ts               Plan creation input normalization, plan construction, and root planner run input construction
    planDispatchInput.ts         Plan dispatch input normalization, target boundary validation, and worker run input construction
    threadTitle.ts               User-visible thread title normalization
    runFactory.ts                Pure run construction and creation metadata projection
    runProjection.ts             Run -> thread/task/plan projections
    runStreamView.ts             Run stream/product-safe view and assistant stream projection
    runInput.ts                  RunInput normalization and validation
    runStatus.ts                 Run lifecycle status classification and lifecycle mutation
    runHierarchy.ts              Run role / parent / plan / task linkage normalization
    runPolicy.ts                 Run execution policy defaults and overrides
    runInteractionState.ts       Approval/input state transitions and run interaction mutation
    runRound.ts                  Run step/trace round metadata
    runTrace.ts                  Run step mutation, trace data bounding, and trace page projection
    planRunBinding.ts            Planner run to plan binding and access boundary rules
    workerTaskPrompt.ts          Worker task execution prompt and instructions
    subagentNameValidation.ts    Subagent name lookup, input resolution, collection, and duplicate validation
    subagentTaskCancellation.ts  Pending subagent task cancellation rules and target view
    planWorkerMaintenance.ts     Worker timeout, retry, and replan-reset selection rules
    planProjection.ts            Plan status/progress projection from task state
    taskProjection.ts            Task status projection rules
    taskProtocolEvent.ts         Task lifecycle protocol event classification and before/after snapshots
    planContextView.ts           Plan context and subagent snapshot view projection
    planTaskInput.ts             Plan/task input normalization and task construction
    planTaskLifecycle.ts         Task lifecycle transitions for planner/worker/blocked/retry/replan
    planTaskOwner.ts             Task owner run boundary validation and owner lookup
    planTaskUpdate.ts            Single task update mutation and validation
    planTaskGraph.ts             Task dependency/parent graph validation
    planTaskCreation.ts          Atomic task creation validation before persistence
    replanTaskValidation.ts      Replan task input normalization and update validation over task snapshots
    subagentIdentity.ts          Subagent naming, lookup aliases, and conflict detection
    subagentRunView.ts           Subagent run summaries and wait status mapping
    subagentWaitTarget.ts        wait_subagent target resolution and boundary validation
    planSnapshot.ts              Plan snapshot, artifact references, and reusable summary projection

  skills/
    runtimeLayerResolver.ts      Profile/persona/policy/workflow composition
    intentResolver.ts            Structured intent + fallback inference
    activeSkillView.ts           Active skill ids recovered from runtime context events
    triggerEvaluator.ts          Pure trigger matching
    promptComposer.ts            Skill instruction rendering

  tools/
    toolCatalogResolver.ts       Registered/MCP/plugin tool catalog merge
    toolCallInput.ts             Tool call / approved tool input normalization
    toolVisibility.ts            Whether model can see a tool
    toolAuthorization.ts         Manifest/profile grants
    toolApprovalPolicy.ts        Approval decision
    toolRollbackRecords.ts       Tool side-effect rollback record serialization
    toolPolicy.ts                Compatibility facade while migrating

  contextManager/
    contextLedger.ts             Ledger model and update rules
    modelContextBuilder.ts       Prompt/model context composition
    toolResultContext.ts         Tool result compaction
    sourceBoundary.ts            Source/evidence rules

  context/
    runtimeContext.ts            Runtime focus context and focus timing extraction
    runtimeThreadContextSummary.ts Thread/run context summary persistence projection
```

`AgentRuntime` 最终应只负责把 HTTP/server 层需要的 use case 聚合起来，不再直接包含所有业务规则。

## State Flow

### Chat Run

```text
POST /threads/:id/messages
  -> ThreadService appends user-visible message

POST /runs
  -> RunService freezes RunInput from message/clientInput
  -> Run status queued
  -> ExecutionCoordinator starts or scheduler picks it up

ExecutionCoordinator
  -> resolve focus/context
  -> resolve skills/profile/catalog/tools
  -> build ContextLedger
  -> run AgentGraph
  -> persist steps/traces
  -> persist assistant message or pending interaction
  -> project run status to thread
```

### Worker Run

```text
PlanService dispatches task
  -> create RunInput(executionMode='worker', task snapshot)
  -> create worker Run linked to task
  -> do not append worker task as user message to thread
  -> ExecutionCoordinator runs worker from RunInput
  -> TaskProjection updates task from worker run outcome
```

Worker input should be private run input. The user-visible thread can later show a summary or artifact link, not the worker prompt itself.

### Approval Resume

```text
Run reaches requires_action
  -> pendingApprovals or pendingInputRequests persisted on run
  -> stream emits blocked state

User approves / answers
  -> InteractionService records answer
  -> creates resume input event or appends structured resume state
  -> RunService starts same run from persisted state
```

Resume should not depend on adding synthetic user messages to thread unless the answer is intentionally user-visible.

Current implementation note:

- `state/runInteractionState.ts` now owns pure run interaction state transitions for approving tool calls, rejecting tool calls, answering input requests, applying approved/rejected/input/required-action state back onto runs, merging pending approvals/input requests, cancelling pending interactions, and rendering intentional user-visible input answers.
- `AgentRuntime` still owns persistence, trace events, stream emission, thread projection, and resume execution, but no longer embeds the approval/input state transition rules inline.
- Interaction state tests cover selected/all approval, pending-only rejection, input answer validation, pending request merge rules, cancellation of pending interactions, and answer message rendering.

## Module Boundaries

### ThreadService

Owns:

- create thread
- update thread metadata
- append user-visible user/assistant messages
- thread summary projection

Must not own:

- model calls
- tool calls
- plan dispatch
- approval/input state

### RunService

Owns:

- create run
- freeze run input
- start run
- cancel run
- retrieve run
- attach immutable snapshots: policy, manifest, catalog

Must not own:

- skill trigger details
- tool business logic
- draft apply logic
- plan dispatch decisions

### ExecutionCoordinator

Owns:

- run lifecycle transition `queued -> in_progress -> terminal/requires_action`
- setup context
- call `AgentGraph`
- persist final output and trace
- call projection functions

Must not own:

- HTTP request parsing
- thread message creation rules outside final projection
- low-level tool implementations

### AgentGraph

Owns:

- model turn
- tool policy gate
- tool execution loop
- max iteration/tool limits
- return graph result

Must stay mostly pure relative to persistence. It can emit callbacks, but should not mutate store directly.

### PlanService

Owns:

- create/replan plan
- task graph validation
- dispatch runnable tasks
- task review outcome

Must not own:

- worker prompt injection into thread
- model loop execution

### TaskProjection

Owns:

- translating run status into task status
- artifact references from run outputs
- plan progress recompute

This should be centralized so there is one place to inspect task/run consistency rules.

### Tool Policy Stack

Split tool policy into four decisions:

1. Catalog resolution: does the tool exist, and from which source?
2. Authorization: is the tool granted by profile/manifest?
3. Visibility: should this tool be exposed to the model in this run?
4. Execution approval: does this specific call require user approval or sandboxing?

These are separate concerns. A tool can be authorized but not visible. A visible tool can still require approval. A read tool can be visible but fail at runtime because MCP is unavailable.

### Skill Routing

Skill routing should prefer structured signals:

1. explicit client intent
2. route/page context
3. selected entity type
4. active draft kind/status
5. user message fallback keywords

Keyword inference should be the fallback, not the primary routing contract.

Recommended future input:

```ts
interface AgentClientIntent {
  primary?: string
  candidates?: string[]
  source: 'ui_action' | 'route' | 'user_message' | 'system'
  confidence?: number
}
```

### Draft Boundary

Drafts are local review artifacts until an apply flow succeeds. Runtime code may orchestrate preview/apply/reject flows, but draft content rules should live in the drafts layer.

Current implementation note:

- `application/runtimeDraftOperations.ts` now owns runtime-facing draft CRUD, patch validation projection, apply preview, validation, backend apply simulation, UI apply orchestration, asset-planning apply skip projection, backend apply error projection, canonical post-apply rebasing, rejection, and backend failure metadata persistence, while `AgentRuntime` retains draft store/backend client dependency injection and thin facade methods.
- `drafts/draftRuntimeContent.ts` now owns runtime-facing draft content rules: asset-proposal backend-apply skip detection, project-proposal canonical snapshot rebasing, and allowlisted JSON-safe draft source normalization.
- `drafts/draftRuntimeInput.ts` now owns runtime draft API input normalization for create, update, patch, backend apply auth, and draft id requirements.

## Context Management Rules

1. Thread history is conversation context, not current project truth.
2. Tool results and backend/MCP reads are runtime facts.
3. Drafts are review artifacts until apply succeeds.
4. Memories and knowledge are advisory unless verified by a tool/backend read.
5. Tool loop history is private run context, not thread message history.
6. Worker task instructions are run input, not thread user messages.
7. Every prompt should be explainable from:
   - RunInput
   - Thread history slice
   - Runtime focus
   - Active skills
   - Visible tools
   - Retrieved context ledger

## API Direction

Keep existing endpoints initially, but introduce clearer internal semantics.

Recommended additions:

```text
POST /runs
  accepts sourceMessageId or explicit runInput

GET /runs/:id/input
  returns immutable RunInput

GET /runs/:id/context-ledger
  returns ContextLedger

POST /plans/:id/dispatch
  creates worker runs from task snapshots without writing worker messages to thread
```

Compatibility behavior:

- Existing `POST /runs` can still infer `sourceMessageId` from latest user message, but should immediately freeze it into RunInput.
- Existing frontend can continue calling `runMessageStream`, but internal run execution should stop depending on latest thread message after run creation.

## Frontend Contract

Frontend should converge on one mapping:

```text
frontend conversationId -> local runtime threadId
runId -> execution record
requestId -> UI task/request tracking only
```

Rules:

- A missing thread should be a visible recovery event, not silent conversation replacement.
- `runId` should not be treated as conversation identity.
- Page task request id should not leak into core runtime semantics.
- Approval/input UI should operate on run interaction state, then refresh run/thread projections.

## Migration Plan

### Phase 1: Document and Freeze Semantics

Deliverables:

- Add this document.
- Add tests that describe current thread/run/task behavior.
- Add comments or type docs for canonical meanings in `state/types.ts`.

No behavior change yet.

### Phase 2: Introduce RunInput

Deliverables:

- Add `state/runInput.ts`.
- Add `AgentRun.input?: AgentRunInput` or `run.metadata.runInput` as transitional storage.
- Make `createRun` freeze latest user message into RunInput.
- Make `agentGraph` receive `runInput.userMessage` rather than re-selecting latest thread user message.

Acceptance:

- A run always has a stable user message even if thread receives new messages later.
- Existing chat behavior remains unchanged from UI perspective.

Current implementation note:

- `AgentRun.input` and `state/runInput.ts` have been added.
- `state/threadTitle.ts` now owns user-visible thread title normalization, fallback generation, length trimming, and title generation lifecycle metadata mutation.
- `state/runStatus.ts` now owns shared run lifecycle classification such as active, finished, and finished-or-cancelled status checks, plus canonical start/cancellation/completion/failure mutation for run lifecycle fields and pending interactions.
- `state/runHierarchy.ts` now owns run role, parent run, plan, task, progress, and blocked-reason input normalization.
- `state/runPolicy.ts` now owns run policy defaults and numeric limit override normalization.
- `state/runRound.ts` now owns run step/trace round metadata construction.
- `state/runTrace.ts` now owns run step construction, append/completion mutation, trace event data bounding, trace page limit normalization, and trace page projection, while `AgentRuntime` retains persistence and stream emission.
- `state/runFactory.ts` now owns run object construction and creation-time metadata projection for input metadata, manifest source, and catalog snapshot references.
- `createRun` and `createToolRun` now freeze their execution input at run creation.
- `agentGraph` receives the frozen user message so later thread messages no longer change an existing run's current request.

### Phase 3: Stop Worker Prompt Pollution

Deliverables:

- Change `dispatchPlan` to create worker RunInput from task snapshot.
- Stop appending worker task messages into `thread.messages`.
- Update worker prompt composition to include task instructions from RunInput.
- Add tests for multiple worker runs sharing one thread without seeing each other's task prompt as user input.

Acceptance:

- Parallel workers do not affect each other's effective user message.
- Thread message count no longer grows with internal worker dispatch.

Current implementation note:

- `dispatchPlan` now creates worker runs with explicit `userMessage` and task snapshots in `RunInput`.
- Worker task prompts are no longer appended to `thread.messages` during dispatch.
- Runtime tests assert worker runs have structured task input and dispatch no longer increases thread user-message count.
- `state/workerTaskPrompt.ts` now owns worker task execution instructions and worker task user-message formatting, and `state/runInput.ts` reuses the same instruction constant for `RunInput.task`.

### Phase 4: Extract ExecutionCoordinator

Deliverables:

- Move `executeRun` setup and completion logic out of `AgentRuntime`.
- Keep `AgentRuntime.startRunExecution` as facade only.
- Centralize final projection to thread/task/plan.

Acceptance:

- `AgentRuntime` no longer contains prompt setup, graph call, final assistant persistence, task projection logic inline.

Current implementation note:

- `jsonValue.ts` now owns shared JSON value / JSON record guards used by runtime metadata and generation backend error normalization.
- `application/runExecutionInput.ts` now owns run creation, tool-run, preview, and execution-time user-message selection rules.
- `application/runAuth.ts` now owns backend auth token/base URL normalization, raw-input merge/remember rules, serializable setup metadata, and the in-memory per-run auth registry.
- `application/runLifecycleControl.ts` now owns cancellation error construction/detection, execution cancellation assertions, run controller registry, cancel reason normalization, run subtree id collection, and non-negative lifecycle duration calculation.
- `application/runtimeRunInteraction.ts` now owns approval/input interaction flow and persistence: approve/reject/answer state transitions, thread run-status projection, assistant rejection messages, intentional user-visible answer messages, approval/input trace payload construction, rejection message-step completion, stream snapshot callback ordering, auth-memory callback ordering, and execution-restart callback ordering, while `AgentRuntime` retains the concrete trace sink, step creation, stream sink, auth registry, and execution scheduler.
- `application/runtimeMessageFactory.ts` now owns runtime user-visible message id/time creation on top of `threadLifecycle.buildThreadMessage`, removing the message creation wrapper from `AgentRuntime`.
- `application/runtimePlanContext.ts` now owns store-facing plan debug-context attachment for runs, while `state/planContextView.ts` keeps the pure projection shape.
- `application/runtimeReplanTaskCreation.ts` now owns store-facing replan add-task creation validation, including existing task lookup and subagent-name uniqueness across persisted task/run state.
- `application/runtimeScalarInput.ts` now owns facade-level scalar normalization used by catalog/plan/subagent runtime entrypoints.
- `application/runtimeCapabilities.ts` now owns public runtime capability resolution across request manifest selection, MCP discovery, tool registry, plugin catalog metadata, plugin warnings, update state, resource inclusion, project scope, and run-role filtering.
- `application/runtimeIdentity.ts` now owns runtime-local ID and timestamp construction instead of leaving those helpers in the runtime facade.
- `application/runtimeManifest.ts` now owns runtime manifest selection and normalization for capabilities, run creation, tool runs, and previews.
- `application/runtimeMemoryOperations.ts` now owns runtime-facing memory list, summary, get, create, and delete facade calls, preserving project scoping through `MemoryManager` while `AgentRuntime` keeps dependency injection only.
- `application/runtimeCatalogSnapshot.ts` now owns runtime catalog snapshot construction and the current/per-run snapshot registry, including catalog version normalization, manifest/registry capture, plugin catalog info, warning defaults, and in-flight run snapshot stability across catalog reloads.
- `application/runtimeCatalogRead.ts` now owns runtime catalog read entrypoints for registered tools, layered skills, the default manifest, and per-run catalog inspection over captured snapshots.
- `application/runtimeCatalogReload.ts` now owns dynamic catalog reload decision flow, unchanged/rollback/reloaded response projection, and plugin-catalog metadata construction, while `AgentRuntime` applies the committed catalog state and snapshot replacement.
- `application/runtimeDeferredTasks.ts` now owns deferred task tracking and flush coordination used by post-run memory/rollback records.
- `application/runtimeEventSubscribers.ts` now owns run/plan stream listener registration, replay attachment, listener failure cleanup, unsubscribe, and terminal close mechanics while `AgentRuntime` retains event construction and replay content.
- `application/runtimeAgentPlanTools.ts` now owns agent-facing plan tool boundaries for create/get/replan: planner-run validation, existing plan detection, thread-plan attachment, created-plan finalization, plan inspection authorization, replan planner-plan resolution, and stable tool response projection, while `AgentRuntime` retains createPlan/replanRun execution plus task/run event side effects.
- `application/runtimePlanBinding.ts` now owns the store-facing planner-run lookup, thread-plan lookup, planner-to-plan attachment persistence, and runtime plan id resolution, while `state/planRunBinding.ts` keeps the pure boundary rules.
- `application/runtimePlanCreation.ts` now owns plan creation preparation, task generation resolution, and creation flow: thread id validation, thread lookup, one-plan-per-thread validation, task input normalization, goal extraction, planner task generation request construction, generated task/source/warning projection, store-facing plan construction, initial task validation, atomic create-before-events persistence, created-task callback ordering, root planner run input creation/application, plan rootRunId/status persistence, and inline planner task assignment callbacks, while `AgentRuntime` retains planner generation dependency injection, runtime run creation dependency bridging, snapshot return, and task protocol/stream event callbacks.
- `application/runtimePlanDispatch.ts` now owns the dispatch flow and result finalization: plan id/control normalization, planner-run validation, timed-out worker application callback ordering, retryable task reset callback ordering, requested task validation, supervisor decision construction, dispatch subagent-name map construction, blocked-task marker persistence, worker run input construction, worker ownership persistence, dispatch application callbacks, final recompute callback ordering, and stable `DispatchPlanResult` projection, while `AgentRuntime` retains actual run cancellation/creation, run-to-task sync, recompute, and event bridge callbacks.
- `application/runtimePlanProjection.ts` now owns store-facing task-to-plan status/progress projection persistence, while `AgentRuntime` retains plan completion trace emission.
- `application/runtimePlanRead.ts` now owns store-facing plan list/detail and task-tree reads with stable plan-boundary validation.
- `application/runtimePlanSnapshot.ts` now owns store-facing plan snapshot construction and product-safe run projection, while `state/planSnapshot.ts` keeps the pure snapshot/summary rules.
- `application/runtimePlanTreeCancellation.ts` now owns `cancelPlanTree` root planner and plan attachment validation before side effects, while `AgentRuntime` retains subtree cancellation and run-cancellation side effects.
- `application/runtimeReplanPreparation.ts` now owns replan preparation, task create/update application, and finalization: source run and plan lookup, replan planner-run selection, planner-plan authorization, create/update task input splitting, new task validation, update validation, owner-run checks, graph checks, subagent-name uniqueness checks, create/update persistence calls, stable created/updated id projection, post-reset plan recompute callback ordering, optional dispatch input construction, and final result projection, while `AgentRuntime` retains reset policy application plus recompute/dispatch/event bridge callbacks.
- `application/runtimeRunCancellation.ts` now owns run subtree cancellation planning and application order: root run validation, cancel reason normalization, leaf-first subtree ordering, finished/cancelled run filtering, cancel-run callback ordering, and cancelled id projection, while `AgentRuntime` retains controller aborts, run status persistence, trace/message emission, thread projection, and stream side effects.
- `application/runtimeRunCreation.ts` now owns normal chat run and forced tool run construction plus the creation application order: manifest resolution, policy normalization, hierarchy normalization, source user/message selection, frozen run-input snapshot creation, forced tool-call metadata, runtime contract metadata, approved-tool metadata, catalog snapshot metadata, catalog/auth remembering callbacks, run persistence callback, run-to-thread projection, thread timestamp update, and start-run callback, while `AgentRuntime` retains thread lookup, user-message append, and dependency bridge callbacks.
- `application/runtimeRunPreview.ts` now owns the preview-only runtime boundary: preview thread/message resolution, client input normalization, focus/context read, memory indexing, layered skill activation, planner tool capability resolution, policy construction, prompt preview construction, speculative tool-plan prediction, and preview response projection, while `AgentRuntime` only injects store/MCP/memory/draft/catalog/contract dependencies and id/time factories.
- `application/runtimeStoreLookup.ts` now owns common thread/run/plan/task lookup helpers and stable not-found errors, removing basic entity lookup wrappers from `AgentRuntime`.
- `application/runtimeSubagentTaskCancellation.ts` now owns the `cancel_subagent` flow and response projection for pending-task and worker-run targets: target resolution, pending task cancellation validation, task-update callback invocation, subtree-cancellation callback invocation, pending/run result projection, and snapshot callback invocation, while `AgentRuntime` retains runtime task update bridging, subtree cancellation execution, trace emission, snapshot lookup, and stream side-effect ordering.
- `application/runtimeSubagentRead.ts` now owns store-facing `list_subagents` and `wait_subagent` read flows, including planner-run plan resolution, subagent-name target resolution, bounded wait polling, and subagent snapshot response construction.
- `application/runtimeSubagentSpawn.ts` now owns the `spawn_subagent` flow and response projection: planner-plan validation, new worker task construction, requested task id normalization, fallback/explicit subagent-name assignment, duplicate-name validation, atomic target validation, new-task persistence callbacks, existing-task subagent-name update calls, blocked/failed/cancelled target reset calls, created-task id projection, dispatch input construction, dispatch callback invocation, snapshot callback invocation, and spawn tool result/snapshot view construction, while `AgentRuntime` retains task event bridge callbacks, runtime task update bridging, worker dispatch execution, and snapshot lookup.
- `application/runtimeTaskAssignment.ts` now owns store-facing planner-inline task assignment and previous-task snapshot capture, while `AgentRuntime` retains protocol event and stream emission.
- `application/runtimeTaskDispatch.ts` now owns store-facing dispatch blocker persistence and worker ownership assignment snapshots, while `AgentRuntime` retains worker run creation plus protocol event and stream emission.
- `application/runtimePlanTaskMaintenance.ts` now owns store-facing retryable task reset and replan task reset persistence plus reset callback application, returning previous task snapshots and invoking event/recompute bridge callbacks so `AgentRuntime` no longer needs private reset wrapper methods.
- `application/runtimeTaskRunSync.ts` now owns store-facing run-to-task projection persistence, previous-task snapshot capture, and sync callback ordering for plan recomputation plus task events, while `AgentRuntime` retains the actual recompute/event bridge callbacks.
- `application/runtimeTaskUpdate.ts` now owns store-facing task update validation, owner-run boundary checks, subagent-name uniqueness checks, persistence, previous-task snapshot capture, and post-update callback ordering for plan recomputation plus task update events, while `AgentRuntime` retains the actual recompute/event bridge callbacks.
- `application/runtimeWorkerTimeout.ts` now owns worker timeout application over plan workers: timeout eligibility scanning, cancellation/sync callback ordering, timed-out task metadata persistence, and task event callbacks, while `AgentRuntime` retains the actual run cancellation semantics and plan task event emission bridge.
- `application/runtimeRunProjection.ts` now owns product-safe run list/detail/child lookup projection, including stripping persisted trace payloads from public run views.
- `application/runtimeThreadTitle.ts` now owns runtime thread title generation: should-generate gating, pending/completed/fallback title state transitions, model config resolution, auth normalization, model-call prompt construction, and fallback projection, while `AgentRuntime` retains thread storage injection and `thread_title` stream emission.
- `application/runtimeThreadLifecycle.ts` now owns public thread create/update and user-visible message append persistence, while `threadLifecycle.ts` keeps pure thread/message normalization and mutation helpers.
- `application/runtimeThreadRead.ts` now owns store-facing thread list/detail and summary reads.
- `application/runtimeThreadProjection.ts` now owns store-facing thread run-status projection persistence, while `state/runProjection.ts` keeps the pure projection rules.
- `application/assistantMessage.ts` now owns user-visible assistant message role checks, multi-turn assistant content de-duplication, final assistant content rendering, and configured assistant message composition.
- `application/threadLifecycle.ts` now owns thread creation field normalization, initial visible message filtering, thread updates, user-visible message construction, runtime message construction, thread message append/update metadata mutation, and last client input metadata recording.
- `state/planFactory.ts` now owns create-plan thread id normalization, goal selection, `AgentPlan` construction, and root planner run creation input construction while task validation stays in `planTaskCreation.ts`.
- `state/planDispatchInput.ts` now owns `dispatchPlan` plan id, planner run id, retry/timeout/maxWorkers, requested task id normalization, dispatch boundary validation, and worker run creation input construction.
- `state/planTaskOwner.ts` now owns owner run to task boundary validation used by task updates and replan validation, plus task owner-run lookup within plan boundaries.
- `state/planSnapshot.ts` now owns complete `AgentPlanSnapshot` projection, including name conflicts, artifact references, and reusable plan summary.
- `state/replanTaskValidation.ts` now owns replan `tasks`/`addTasks`/`updates`/`updateTasks` input normalization in addition to validating update application over task snapshots.
- `skills/activeSkillView.ts` now owns active-skill id recovery for catalog inspection, keeping skill view logic out of `AgentRuntime`.
- `context/runtimeContext.ts` now owns focus timing extraction in addition to current project/production context extraction.
- `context/runtimeThreadContextSummary.ts` now owns applying thread context summaries back onto thread/run metadata and carrying existing thread summaries into a run's execution metadata.
- `state/planRunBinding.ts` now owns planner-run validation, thread-plan selection, replan planner-run selection, plan access boundaries, and root-run repair rules while `application/runtimePlanBinding.ts` owns the store-facing persistence boundary.
- `catalog/catalogInspectView.ts` now owns full read-only catalog inspection view assembly for summary, pack, skill, tool, profile, and knowledge views.
- `state/planContextView.ts` now owns plan debug-context and subagent snapshot view projection for model/tool consumption.
- `state/subagentNameValidation.ts` now owns subagent name lookup, wait/cancel input resolution, dispatch fallback-name assignment, collection, and duplicate validation across task/run state; runtime read/cancellation/dispatch helpers call these helpers instead of keeping pass-through wrappers in `AgentRuntime`.
- `state/subagentWaitTarget.ts` now owns `wait_subagent` target resolution, plan boundary validation, and wait target view construction.
- `state/subagentTaskCancellation.ts` now owns pending subagent task cancellation rules and task target rendering.
- `state/planWorkerMaintenance.ts` now owns pure worker timeout, retry eligibility, and replan-reset selection rules while `AgentRuntime` retains side-effect ordering.
- `AgentRuntime` now consumes `planContextView` and `subagentRunView` projections directly for planner tool responses instead of keeping private snapshot/summary wrappers.
- `generation/generationBackendError.ts` now owns MCP backend generation validation error normalization used by forced generation tool handling.
- `executeRun` delegates frozen input, title source, and answered input merge handling to this helper.
- Explicit private run input, such as worker task input, no longer falls back to the latest thread message as its source user.

### Phase 5: Centralize Projections

Deliverables:

- Add `runProjection.ts` and `taskProjection.ts`.
- Move run -> thread status projection.
- Move run -> task status/artifact projection.
- Make task status update rules explicit.

Acceptance:

- Task status cannot drift silently from owner run status.
- Tests cover completed, completed_with_warnings, requires_action, failed, cancelled.

Current implementation note:

- `state/runProjection.ts` now owns the pure run-to-thread status projection rules.
- `state/runStreamView.ts` now owns run stream/product-safe projection and assistant stream helpers, including omitting persisted trace event payloads from run snapshots, preserving stream step summaries, deriving assistant deltas from trace events, and finding assistant messages for replay.
- `AgentRuntime` delegates `lastRunId`, `lastRunStatus`, `activeRunId`, and thread status updates to projection helpers.
- Projection tests cover active, terminal, and unrelated active-run preservation behavior.
- `state/taskProjection.ts` now owns the pure worker run-to-task status/artifact projection rules.
- Task projection tests cover completed/completed_with_warnings, rollback artifacts, requires_action, failed, cancelled, and ignored active runs.
- `state/taskProtocolEvent.ts` now owns task lifecycle status to protocol event classification and before/after task snapshots, including blocked vs needs-input task semantics.
- `state/planTaskInput.ts` now owns plan task input arrays, task status/progress normalization, execution overrides, task construction, inline planner-task selection, and task artifact normalization.
- `state/planTaskLifecycle.ts` now owns task lifecycle state transitions for planner-inline ownership, worker dispatch, dispatch blockers, retry reset, replan reset, and worker timeout metadata.
- `state/planTaskUpdate.ts` now owns single-task update mutation: status timestamps, parent/dependency validation, owner-run validation hooks, title/description/progress, blocked reason, artifact append, and metadata/subagent-name validation hooks.
- `state/planTaskGraph.ts` now owns pure task dependency/parent graph cycle validation and task validation clones.
- `state/planTaskCreation.ts` now owns atomic task creation validation: duplicate ids, references to newly-created or existing tasks, self references, subagent-name validation hooks, and create-time graph checks.
- `state/replanTaskValidation.ts` now owns replan task update normalization, parent/dependency reference validation, owner-run validation hooks, duplicate-name validation hooks, and final graph checks over validation snapshots.
- `state/planProjection.ts` now owns pure task-to-plan status/progress projection, including terminal timestamp and blocked-reason rules.
- `state/subagentIdentity.ts` now owns subagent name selection, user-provided name mapping, task/run name extraction, and duplicate-name conflict detection.
- `state/subagentRunView.ts` now owns subagent run summary serialization, terminal run/plan status checks, and wait-status mappings.
- `state/planSnapshot.ts` now owns task artifact reference derivation and reusable plan summary counts for snapshots and debug context.

### Phase 6: Split Tool Policy

Deliverables:

- Add `toolAuthorization.ts`, `toolVisibility.ts`, `toolApprovalPolicy.ts`.
- Keep `toolPolicy.ts` as compatibility wrapper.
- Make `approvalMode` actually affect approval decision or remove/rename it.
- Ensure `allowNetwork` and `allowFileBytes` either enforce behavior or are removed from active policy.

Acceptance:

- Debug trace can answer:
  - tool exists?
  - granted?
  - visible?
  - requires approval?
  - sandboxed?

Current implementation note:

- `tools/toolApprovalPolicy.ts` now owns default approval, explicit grant approval, and sandbox auto-allow approval rules.
- `toolPolicy.ts` and `capabilityResolver.ts` both delegate approval decisions to this shared helper.
- Approval policy tests cover default approval, explicit `never`/`always`/`on_write`, unknown tools, and sandbox interception behavior.
- `tools/toolVisibility.ts` now owns base retrieval tools, command-required tools, and workflow scoped tool visibility.
- `capabilityResolver.ts` delegates workflow visibility to this shared helper.
- Visibility tests cover base tools, `/image` and `/video` command tools, workflow hints, non-workflow skills, and union scope.
- `tools/toolAuthorization.ts` now owns base unavailable-reason checks for registration, MCP availability, manifest grants, run role, and project scope.
- `capabilityResolver.ts` delegates base authorization, workflow visibility, and approval decisions to dedicated helpers.
- Authorization tests cover unregistered tools, unavailable MCP tools, denied/not-granted tools, wrong run role, missing project scope, and successful authorization.
- `tools/toolCallInput.ts` now owns API/metadata-facing tool call and approved tool name input normalization.
- `AgentRuntime` consumes tool-call input normalization from the tools layer, while `context/normalizeRunInput.ts` keeps compatibility re-exports for older callers.
- `tools/toolRollbackRecords.ts` now owns rollback record extraction and run metadata serialization for tool side effects, so completion metadata and rollback policy trace events share one representation.
- `catalog/catalogInspectView.ts` now owns inspect-agent-catalog view normalization, enabled pack closure calculation, and profile/pack/skill/tool/knowledge summary serialization.
- `catalog/catalogIssuePolicy.ts` now owns the reload rollback/blocking decision for catalog lint issues.

### Phase 7: Structured Skill Intent

Deliverables:

- Add structured client intent support.
- Move hardcoded keyword matching into fallback resolver.
- Add trigger traces that show whether activation came from UI intent, route, selection, or keyword.

Acceptance:

- UI-triggered workflows activate deterministically.
- Keyword-only activation is visible as lower-confidence fallback.

Current implementation note:

- `skills/intentResolver.ts` now owns runtime intent inference from client labels, label aliases, keyword fallback, route context, active plan context, visual context, and derived intents.
- `runtimeLayerResolver.ts` now consumes structured intent resolution instead of embedding keyword and route inference inline.
- Layer debug trace now exposes `intentSignals`, including intent source, confidence, and evidence, so keyword-only activation is distinguishable from high-confidence UI/route activation.
- Intent resolver tests cover structured client labels, keyword fallback confidence, route activation, negated visual-generation requests, and image-context edit references.

### Phase 8: Frontend Session Cleanup

Deliverables:

- Make missing local thread recovery explicit.
- Keep stable conversationId -> threadId mapping.
- Reduce silent thread replacement.
- Display run execution records as children of conversation, not alternate conversations.

Acceptance:

- User can understand whether a message continued an existing runtime thread or created a new one.

## Testing Strategy

Add focused tests in these layers:

- RunInput freeze:
  - creating a run freezes source message
  - later thread messages do not alter run input

- Worker isolation:
  - dispatching two worker tasks does not append worker prompts to thread
  - each worker sees only its own task input

- Projection:
  - run terminal statuses project to thread status
  - worker run statuses project to task/plan statuses

- Tool policy:
  - authorized but invisible
  - visible but approval required
  - sandbox write auto-simulated
  - wrong run role blocked

- Skill routing:
  - structured intent wins over keyword fallback
  - route-based activation is deterministic
  - negated generation requests do not activate generation workflow

- Interaction resume:
  - approval resumes same run from persisted pending state
  - input answer does not accidentally change run root message

## Quality Bar

A refactor step is acceptable only if:

- Entity ownership is clearer than before.
- Existing UI behavior either remains compatible or has an intentional migration note.
- New state has tests.
- Runtime trace remains at least as informative as before.
- No new hidden coupling is introduced through generic metadata unless explicitly marked transitional.

## Anti-Patterns To Avoid

- Adding more fields to `run.metadata` without a typed owner.
- Using thread user messages as internal command queue.
- Making model prompts depend on mutable latest thread state after run creation.
- Letting UI directly patch execution-derived task status without projection rules.
- Treating skill activation as a bag of keywords with no source/confidence.
- Combining authorization, visibility, approval, and sandbox into one boolean.
- Making `AgentRuntime` the destination for every new use case.

## Near-Term First PR Recommendation

The first code PR should be intentionally small:

1. Add `AgentRunInput` type and builder.
2. Store frozen run input on new runs.
3. Change `runAgentGraph` input to use frozen user message.
4. Keep old metadata fields for compatibility.
5. Add tests proving later thread messages do not alter an existing run.

This gives the rest of the migration a stable foundation without forcing immediate frontend or plan/subagent rewrites.
