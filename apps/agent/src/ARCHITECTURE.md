# Agent Architecture

This directory is the active namespace for the agent architecture.

## Layers

| Layer | Owns | Must Not Own |
| --- | --- | --- |
| `application/` | Agent use cases, run/thread lifecycle facade, resume flows | Model provider details, raw HTTP routing, domain entity algorithms |
| `orchestration/` | Agent loop/graph, model turn -> policy -> tool execution control flow | Tool business logic, persistence implementation |
| `state/` | Run/thread types, factories, trace builders, stores | LLM decisions, tool execution side effects |
| `context/` | Current UI/project/selection context shaping and prompt context text | Project writes, model calls |
| `tools/` | Tool registry, permissions, policy gates, runtime/MCP tool execution | Agent run lifecycle, domain-specific proposals |
| `drafts/` | Local draft lifecycle, apply preview, backend apply client boundary | LLM planning, tool authorization |
| `memory/` | Memory store and memory manager | Prompt compilation policy, formal project writes |
| `manifest/` | Resolved run manifest snapshots, skill metadata, plugin catalog | User-facing permission concepts, runtime execution decisions |
| `model/` | Model config and model client adapter | Tool policy, domain state machines |
| `contracts/` | Extension contracts used by domain-specific agents | Hardcoded domain branches inside core runtime |
| `domains/` | Domain modules such as production orchestration | Generic agent loop, HTTP server wiring |
| `ports/` | Runtime-facing interfaces that connect orchestration, domains, and adapters | Concrete business implementations or external transport details |
| `adapters/` | External adapter boundaries such as HTTP and MCP | Core business rules |

## Rules

1. New agent code should import through these top-level layer folders whenever possible.
2. Move implementation one slice at a time with tests.
3. `server.ts` remains the composition root. It wires adapters, stores, contracts, and runtimes.
4. Domain behavior enters the core agent through tools and contracts, not through manifest-id conditionals in the runtime.
5. Runtime tool handlers implement interfaces from `ports/`; domain handlers must not import `application/` or `orchestration/` directly.
6. There is one active orchestration engine: `orchestration/agentGraph`.
7. Public run creation has one path: `/threads/{id}/runs` through `AgentRuntimeRouter`. Do not reintroduce public `/runs`, `/runs/tool`, or `/context` compatibility endpoints.
8. Agent capability expansion flows through skills, not direct tool self-loading: a run may activate skills, but tools still require catalog/profile/manifest authorization and the final `applyToolPolicy` gate.
9. Orchestration calls external tools through `ExternalToolGatewayPort`; it must not initialize MCP or translate MCP tool names directly.
10. Draft apply flows call backend writes/previews through draft ports. Application/domain code must not branch on backend transport errors such as HTTP client classes.
11. `orchestration/agentGraph.ts` is the graph runner, not the owner of model transport, tool policy, execute-turn aggregation, trace payload formatting, or result DTO shaping.
12. Graph contracts live in `orchestration/agentGraphTypes.ts`; graph helpers should import `AgentGraphInput` and `AgentGraphTraceInput` from that module instead of depending on the runner.
13. Trace events are observability records, not context storage. They should carry ids, refs, hashes, counts, status, and short summaries by default.
14. Full context and payload bodies belong behind versioned context records, explicit evidence lookup, or external blobs. Do not put prompt bodies, tool results, model messages/tools, HTTP bodies, or assistant content directly into ordinary trace events.

## Agent Graph Boundary

`orchestration/agentGraph.ts` should stay a thin state-machine file. Its job is to wire the LangGraph states and route between model, policy, and execute nodes.

Detailed behavior belongs in focused helpers:

- `agentGraphModelInput.ts`, `agentGraphModelTurnContext.ts`, and `agentGraphModelCall.ts` prepare prompts and call the reasoning model.
- `agentGraphPolicyTurn.ts` applies tool policy, user-input pauses, approvals, and skill activation repair.
- `agentGraphExecuteTurn.ts` executes approved tool turns, handles catalog refresh, queues default draft apply calls, and resolves remaining approvals.
- `agentGraphResult.ts` shapes the final graph result and assistant-content fallback.
- `agentGraphTypes.ts` owns shared graph input/trace contracts.

New graph behavior should extend one of these helpers or add a similarly focused helper. Do not grow the graph runner with model-provider calls, direct `applyToolPolicy` calls, tool execution loops, or domain-specific fallback logic.

## Runtime Tool Boundaries

Runtime tools are split into three responsibilities:

- `orchestration/toolExecutor.ts` owns policy interception, runtime handler lookup, and fallback to `ExternalToolGatewayPort`.
- `domains/*/*ToolHandler.ts` owns domain-specific runtime tool behavior and only talks to injected ports.
- `adapters/*` owns concrete MCP/backend transport calls and transport-specific error normalization.

This keeps new tools from adding `if (toolName === ...)` branches in orchestration. Add a domain handler for runtime behavior, or add an external gateway adapter for transport fallback behavior.

Draft apply has two separate boundaries:

- `DraftApplyPort` / `DraftApplyPreviewPort` for model-visible runtime apply tools.
- `RuntimeDraftBackendApplyPort` for UI/application draft operations that need backend apply or preview behavior.

Both boundaries return transport-neutral results to application/domain code. Backend HTTP error details are normalized inside adapters before crossing into these layers.

## Context, Trace, and Message Domains

The agent runtime separates three concepts that are easy to conflate:

- `contextManager/` currently owns the canonical context ledger and model-turn context bundle. If this moves under `domains/context/`, move the implementation and delete the old entrypoint rather than keeping two import paths. Context records are versioned refs and support mutation semantics: append, amend, and delete.
- `domains/trace/` owns compact observability projections. Trace data records what happened and how to find supporting evidence; it must not become the default storage location for large payloads.
- `domains/message/` owns user/model/tool communication shapes. Messages may be rendered into prompts or thread history, but trace records should reference message ids and content hashes rather than duplicate message content.

The default data shape for cross-domain links is a ref:

- Context links use `contextBundleId`, `contextBundleRef`, and context ref keys.
- Payload links use hashes such as `bodyHash`, `resultHash`, `contentHash`, and character counts.
- Debug drilldown uses the run debug ledger and evidence lookup APIs to resolve selected refs.

Exceptions must be explicit and narrow. If a caller needs the full body of an HTTP exchange, a tool result, or a prompt snapshot, add a dedicated evidence/blob path with a retention policy instead of expanding the trace event schema.

## Runtime Router and Thread Runtime

`application/runtimeRouter.ts` is the process-wide application router. It is the only facade that the HTTP server and UI-facing entrypoints should call directly, and it should stay a composition boundary over focused runtime bridges.

`server.ts` should stay an HTTP composition root, not the owner of runtime protocol projections. Runtime snapshot DTO mapping lives in `serverRuntimeProtocol.ts`; SSE subscription and event streaming lives in `serverRuntimeStreams.ts`.

HTTP route groups with non-trivial request parsing, persistence calls, or telemetry phases should move behind focused server route modules. Model configuration endpoints live in `serverModelConfigRoutes.ts`; new route groups should follow that pattern instead of growing `createAgentRequestListener`.

A user-visible thread owns its runtime state through persisted `AgentThread` and `AgentRun` records, plus the `/threads/{id}/runtime` projection. Thread recovery must start from these persisted records rather than from in-memory promises or controllers.

Runtime visibility rules are shared application policy, not router-private helpers. Thread snapshots and stream replay both use `runtimeRunVisibility.ts` to decide when worker-run approvals or input requests should display on another thread. Thread snapshot run selection lives in `runtimeThreadSnapshotSelection.ts`, and thread/session snapshot assembly lives behind `runtimeSnapshotBridge.ts`.

Runtime facade methods should delegate behavior to bridges instead of owning workflow decisions inline. Plan update side effects live behind `runtimePlanToolsBridge.ts`; thread deletion active-run guards live behind `runtimeThreadOperationsBridge.ts`.

All user-triggered execution, including diagnostic single-tool runs, enters through `/threads/{id}/runs`. Diagnostic tool execution may pass a `toolCall` on that route, but external callers must not bypass the thread route or call lower-level runtime creation routes directly.

Startup recovery follows this contract:

- `queued` runs are rescheduled by the router.
- `in_progress` runs are treated as interrupted work and projected to `requires_action` with an explicit recovery input.
- Recovery choices are handled through the normal run input route first; `/runs/{id}/resume` remains a direct operational endpoint for explicit resume actions.
- The frontend must not reconstruct runtime state from local chat memory alone. It should hydrate from the thread runtime projection and send answers/approvals back through runtime routes.

## Runtime Works

Runtime works are execution objects that can outlive one tool call and can be observed, waited on, or cancelled.

- Ordinary synchronous tool calls return their final result or error immediately and should not be wrapped as runtime works.
- `generation_job` is an external async runtime work backed by the MovScript backend job handle. It is managed through the `core_work_start/get/list/wait/cancel` tools.
- `core_work_start` is submit-only: it creates the work and returns the work handle, but it does not wait for backend completion or imply success. When a `continuationPolicy` is present, the runtime monitors the work in the background and schedules a continuation when the policy is satisfied. Use `core_work_wait/get/list` only for explicit inspection or blocking waits.
- Worker subagents are internal async runtime works backed by `AgentRun`. They are managed through `core_work_start/get/list/wait/cancel` with `kind: "subagent_run"`.
- Public runtime work kinds must have a real provider and prompt/tool-schema guidance for that lifecycle.

### Runtime Wakeups

Continuation wakeups are centralized through `RuntimeWakeCoordinator`; callers enqueue lifecycle signals there instead of directly deciding whether to resume a thread.

- Wake events are persisted in the store and drained per scope so duplicate active signals coalesce and a thread/run has one wake decision loop at a time.
- Runtime work providers, `RuntimeWorkManager`, `RuntimeWakeCoordinator`, and observe-failure traces are composed behind `runtimeWorkCoordinatorBridge.ts`; `runtimeRouter.ts` should not create or observe runtime work directly.
- The drain loop owns the runtime decision: if queued wake events or runnable continuations exist, drain and advance; if no tool call, no wake event, and no final output exists, the runtime remains waiting; if no tool call, no wake event, and final output exists, the run is allowed to finish.
- `workStarted` registers continuation policy for async work. It does not synchronously poll external providers from the tool bridge; observation ticks are scheduled by the wake coordinator and re-enter as queued `work.observed` events.
- `workObserved` observes non-terminal work through the provider, evaluates work completion, and advances the parent thread when the continuation is ready and unblocked.
- `runSettled` is fired after any model run finishes. It advances continuations waiting on that run's thread and enqueues observed `subagent_run` work whose external handle points at the settled child run.
- `threadOpened` reconciles persisted async work, so generation jobs or subagent runs that finished while the app was closed can still wake their continuation.

This keeps the three wakeup classes on one path: generation job completion, approved tool execution finishing a run, and child-agent run completion.
