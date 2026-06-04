# Agent Architecture

This directory is the active namespace for the agent architecture.

## Layers

| Layer | Owns | Must Not Own |
| --- | --- | --- |
| `application/` | Agent use cases, run/thread lifecycle facade, resume flows | Model provider details, raw HTTP routing, domain entity algorithms |
| `orchestration/` | Agent loop/graph, model turn -> permission gates -> tool execution control flow, split by graph/model/tools | Tool business logic, persistence implementation |
| `state/` | Run/thread types, task graph projection, subagent helpers, trace builders, stores | LLM decisions, tool execution side effects |
| `context/` | Current UI/project/selection context shaping, prompt context text, command/input normalization, runtime context extraction | Project writes, model calls |
| `tools/` | Tool registry, permissions, permission gates, runtime/MCP/plugin tool execution, runtime tool handlers split by registry/permissions/catalog/calls/handlers | Agent run lifecycle, workspace persistence, business service ownership |
| `memory/` | Memory store, memory types, and memory manager | Prompt compilation rules, formal project writes |
| `catalog/` | Manifest defaults, catalog loading/reload, registry state/types, inspect views, validation | Runtime execution decisions, model/tool side effects |
| `model/` | Model config, model client adapter, model router, provider schema projection | Tool permission rules, domain state machines |
| `reference/` | Reference loading, storage, search, and manager facade | Runtime run orchestration, prompt assembly rules |
| `files/` | Agent file refs, edit primitives, file-system facade, and providers | Workspace lifecycle decisions, tool authorization |
| `generation/` | Generation job events, backend error normalization, and retry repair | Runtime work scheduling, MCP transport ownership |
| `media/` | Image preprocessing and video-frame extraction helpers | Backend route handling, workspace persistence |
| `configFiles/` | Config-file merge and resolution helpers | Catalog loading, runtime skill activation |
| `telemetry/` | Runtime telemetry registry and exporters | Business decisions or route parsing |
| `updates/` | Agent update policy evaluation | Catalog/runtime mutation execution |
| `messages/` | User/model/tool communication shapes and message formatting helpers | Trace storage, persistence, model transport |
| `trace/` | Compact observability projections and trace debug views | Context storage, large payload retention, thread mutation |
| `shared/` | Cross-layer JSON/value primitives and protocol DTO types | Runtime state ownership, domain behavior, adapter logic |
| `server/` | HTTP composition, request helpers, route groups, runtime DTO projection, SSE streams, split by core/protocol/routes/streams | Application use case logic, orchestration decisions |
| `bootstrap/` | Process startup composition helpers, split by entrypoint surface such as `server/` | Request handling, runtime use case decisions |
| `cli/` | CLI command implementation and local command parsing | Long-running server composition, HTTP route ownership |
| `contracts/` | Extension contracts used by domain-specific agents, split by contract surface such as `runtime/` | Hardcoded domain branches inside core runtime |
| `ports/` | Runtime-facing interfaces split by capability, such as files/media/runtime/tools | Concrete business implementations or external transport details |
| `adapters/` | External adapter boundaries split by capability, such as files/media/backend/MCP | Core business rules |

## Rules

1. New agent code should import through these top-level layer folders whenever possible.
2. Move implementation one slice at a time with tests.
3. `server.ts` and `cli.ts` remain thin executable shims. Server composition lives in `server/server.ts`; CLI command behavior lives in `cli/cli.ts`.
4. Domain behavior enters the core agent through tools and contracts, not through manifest-id conditionals in the runtime.
5. Runtime tool handlers live in `tools/handlers/` and implement interfaces from `ports/`; they must not import `application/` or `orchestration/` directly.
6. There is one active orchestration engine: `orchestration/graph/runner/agentGraph`.
7. Public run creation has one path: `/threads/{id}/runs` through `AgentRuntimeRouter`. Do not reintroduce public `/runs`, `/runs/tool`, or `/context` compatibility endpoints.
8. Agent capability expansion flows through skills, not direct tool self-loading: a run may activate skills, but tools still require catalog/config-file/manifest authorization and the final `applyToolPermissions` gate.
9. Orchestration calls external tools through `ExternalToolGatewayPort`; it must not initialize MCP or translate MCP tool names directly.
10. Workspace lifecycle, workspace apply, reference lookup, and other business/domain tools are external MCP/plugin capabilities. The agent runtime must not provide local fallback implementations for them.
11. `orchestration/graph/runner/agentGraph.ts` is the graph runner, not the owner of model transport, tool permission, execute-turn aggregation, trace payload formatting, or result DTO shaping.
12. Graph contracts live in `orchestration/graph/types/agentGraphTypes.ts`; graph helpers should import `AgentGraphInput` and `AgentGraphTraceInput` from that module instead of depending on the runner.
13. Trace events are observability records, not context storage. They should carry ids, refs, hashes, counts, status, and short summaries by default.
14. Full context and payload bodies belong behind versioned context records, explicit evidence lookup, or external blobs. Do not put prompt bodies, tool results, model messages/tools, HTTP bodies, or assistant content directly into ordinary trace events.

## Agent Graph Boundary

`orchestration/graph/runner/agentGraph.ts` should stay a thin state-machine file. Its job is to wire the LangGraph states and route between model, permission, and execute nodes.

Detailed behavior belongs in focused helpers:

- `orchestration/model/graph/input/agentGraphModelInput.ts`, `orchestration/model/graph/context/agentGraphModelTurnContext.ts`, and `orchestration/model/graph/call/agentGraphModelCall.ts` prepare prompts and call the reasoning model.
- `orchestration/model/permissions/turn/agentGraphPermissionTurn.ts` applies tool permissions, user-input pauses, approvals, and skill activation repair.
- `orchestration/graph/execution/agentGraphExecuteTurn.ts` executes approved tool turns, handles catalog refresh, and resolves remaining approvals.
- `orchestration/graph/result/agentGraphResult.ts` shapes the final graph result and assistant-content fallback.
- `orchestration/graph/types/agentGraphTypes.ts` owns shared graph input/trace contracts.

New graph behavior should extend one of these helpers or add a similarly focused helper. Do not grow the graph runner with model-provider calls, direct `applyToolPermissions` calls, tool execution loops, or domain-specific fallback logic.

## Runtime Tool Boundaries

Runtime tools are split into layered responsibilities:

- `orchestration/tools/execution/toolExecutor.ts` owns permission interception, runtime handler lookup, and explicit routing to `ExternalToolGatewayPort` for MCP/plugin tools. Registered runtime tools do not silently fall back to external tools.
- `tools/registry/` owns registered tool definitions, names, execution metadata, and risk defaults.
- `tools/permissions/` owns authorization, approval, sandbox, and unavailable-reason decisions.
- `orchestration/tools/rules/` owns graph-local execution rules such as forced approvals and concurrency.
- `tools/catalog/` owns capability and visible-tool projections from catalog/config-file/runtime context.
- `tools/calls/` owns normalized tool-call input and rollback metadata records.
- `tools/handlers/` owns runtime tool behavior and only talks to injected ports.
- `adapters/{files,media,backend,mcp}/` owns concrete MCP/backend transport calls and transport-specific error normalization.

This keeps new tools from adding `if (toolName === ...)` branches in orchestration. Add a tool handler for runtime behavior, or add an external gateway adapter for transport fallback behavior.

Workspace file management is owned by the MovScript frontend. The agent process does not persist workspace records, hydrate workspace snapshots, or implement model-visible workspace lifecycle tools. When a workspace is needed, frontend MCP/plugin tools expose `.movscript` files and the agent edits those files through the provided file boundary.

## Catalog and Skill Boundaries

`catalog/` separates durable catalog concerns from runtime activation:

- `catalog/manifest/` owns current-agent manifest defaults and normalization.
- `catalog/loading/` owns built-in file catalog loading, frontend/shared-store plugin catalog loading, reload staging, and MCP virtual packs. Pack install/remove belongs to the desktop/shared pack store boundary, not the session agent process.
- `catalog/registry/` owns catalog registry types, registry construction, and persisted catalog state.
- `catalog/inspect/` owns public catalog inspect views and catalog issue blocking rules.
- `catalog/validation/` owns linter and layering invariants.

`skills/` owns runtime skill selection and prompt composition over the catalog:

- `skills/activation/` owns active-skill state, active-skill views, and trigger evaluation.
- `skills/resolution/` owns intent detection and runtime layer resolution.
- `skills/prompt/` owns prompt composition for selected skills.

`model/` keeps runtime model concerns separated by role:

- `model/client/` owns provider/gateway calls and model response normalization.
- `model/config/` owns persisted runtime model config and model content helpers.
- `model/router/` owns capability routing over configured models.
- `model/schema/` owns provider-specific tool schema projection.

`workspaces/` no longer owns local workspace state in the agent and should not be reintroduced as a runtime tool implementation layer. Frontend MCP owns workspace files, workspace model lookup, and review/apply handoff. Backend/resource clients live under generic adapter paths and must not encode workspace lifecycle behavior. Media code depends on `ResourceFileDownloadPort`, not backend/apply clients.

`memory/` is split into `memory/store/`, `memory/manager/`, and `memory/shared/` so persistence, write rules, and shared memory DTOs do not grow in one flat namespace.

Supporting runtime modules follow the same split:

- `reference/loading/`, `reference/store/`, `reference/search/`, `reference/manager/`, and `reference/shared/` are offline/reference-library helpers. Runtime model-visible reference tools are provided by MCP/plugins and observed through context ledger traces, not by injecting `ReferenceManager` into graph execution.
- `files/core/` owns canonical refs, edit primitives, and the file-system facade; `files/providers/` owns concrete file providers.
- `generation/events/`, `generation/errors/`, and `generation/repair/` separate lifecycle projection, backend error normalization, and retry repair.
- `media/image/` and `media/video/` keep image preprocessing and video frame extraction independent.
- `configFiles/merge/` and `configFiles/resolution/` keep config-file composition separate from catalog config file lookup.
- `telemetry/runtime/` owns the in-memory telemetry registry; `telemetry/exporters/` owns OTLP/Prometheus projection.
- `updates/policy/` owns update decision policy without applying updates directly.
- `shared/types.ts` and `shared/jsonValue.ts` are the root cross-layer primitives. More specific shared DTOs stay inside their owning layer, such as `state/shared/`, `memory/shared/`, and `reference/shared/`.

## Context, Trace, and Message Domains

The agent runtime separates three concepts that are easy to conflate:

- `context/ledger/`, `context/prompt/`, `context/tool-result/`, `context/diagnostics/`, `context/command/`, `context/input/`, and `context/runtime/` own canonical context records, model-turn prompt assembly, tool-result projection, local context diagnostics, command parsing, client/run input normalization, and runtime context extraction. Context records are versioned refs and support mutation semantics: append, amend, and delete.
- `trace/` owns compact observability projections. Trace data records what happened and how to find supporting evidence; it must not become the default storage location for large payloads.
- `messages/` owns user/model/tool communication shapes. Messages may be rendered into prompts or thread history, but trace records should reference message ids and content hashes rather than duplicate message content.

Conversation state has four separate projections and new code must keep their boundaries explicit:

- Transcript messages are durable natural-language conversation turns in `thread.messages`. They are the only message records eligible for routine prompt history. User text and final assistant answers belong here; tool-call bodies, tool results, reasoning streams, activity cards, approvals, plan revisions, diagnostics, and async-work status payloads do not.
- Run activity is operational state for one run. Tool calls/results, model rounds, reasoning, approvals, input requests, async-work lifecycle events, and debug traces belong to `AgentRun.steps`, `AgentRun.traceEvents`, pending interaction records, debug evidence, or tool-result storage. They are UI/debug material, not transcript history.
- Timeline projection is the UI projection. Server protocol code exposes `AgentTimelineItem`; every item must carry explicit `origin`, `purpose`, `surface`, `contentPromptEligibility`, and `sortRank` semantics. `purpose: "transcript"` means conversation text; prompt history eligibility is controlled only by `contentPromptEligibility`. Compact run activity attached to a final assistant transcript item is display data; it does not make activity part of the transcript or model context.
- Timeline activity uses the sanitized `AgentTimelineActivity` type. It must not carry raw tool args, tool results, approval args/previews, model request/response bodies, or arbitrary trace `data`; keep those behind debug/evidence APIs. The narrow exception is whitelisted generation progress metadata needed by the pinned generation status.
- Model context is built from prompt-safe transcript history, current-run tool-loop history, thread summaries, context ledger refs, runtime state, and the current user input. Old run tool results can re-enter a later prompt only through explicit refs/summaries/context records, never by leaking UI activity or status messages through `thread.messages`.
- Timeline cursors are opaque pagination tokens. Server and client ordering must use explicit item fields: `createdAt`, `sortRank`, then `id`; clients must not parse cursor internals for display order.

Assistant metadata boundaries are centralized in `@movscript/protocol`:

- Runtime status, plan revisions, diagnostics, and compact activity are display/control projections. They may remain in raw timeline state so pinned status, plan state, and diagnostics can read their metadata, but they must project to non-`message_stream` surfaces unless they are attached to real transcript content.
- Prompt-excluded assistant metadata is an explicit hygiene boundary. Existing assistant messages are excluded from prompt history only when metadata declares `promptEligibility: "exclude"`; display activity, status, diagnostics, or payload-shaped metadata must not create implicit prompt-history rules.
- Frontend transcript view-models may attach sanitized `AgentTimelineActivity` as `timelineActivity` display data derived from timeline items. It is not chat message metadata, not a message source, not a prompt source, and not a debug payload carrier; raw args/results/previews stay behind run debug/evidence APIs.

Prompt history must pass through `context/prompt/hygiene/promptHygiene.ts`. Prompt-excluded assistant messages are filtered before compaction so their content cannot return through a summary. New display/control data should be modeled as timeline/status/debug projection data, not as assistant message kinds.

The default data shape for cross-domain links is a ref:

- Context links use `contextBundleId`, `contextBundleRef`, and context ref keys.
- Payload links use hashes such as `bodyHash`, `resultHash`, `contentHash`, and character counts.
- Debug drilldown uses the run debug ledger and evidence lookup APIs to resolve selected refs.

Exceptions must be explicit and narrow. If a caller needs the full body of an HTTP exchange, a tool result, or a prompt snapshot, add a dedicated evidence/blob path with retention rules instead of expanding the trace event schema.

## Runtime Router and Thread Runtime

`application/router/runtimeRouter.ts` is the process-wide application router. It is the only facade that the HTTP server and UI-facing entrypoints should call directly, and it should stay a composition boundary over focused runtime bridges. Runtime use cases live in application sublayers such as `run/`, `thread/`, `taskgraph/`, `catalog/`, `work/`, `stream/`, `memory/`, `read/`, `graph/`, `local-command/`, and `shared/`; new runtime modules should join the matching sublayer instead of growing the application root. Workspace use cases belong to frontend MCP/file management, not an agent runtime sublayer.

`src/server.ts` and `src/cli.ts` are thin executable shims. HTTP implementation lives in `server/server.ts`, which should stay a composition root rather than the owner of runtime protocol projections. CLI command behavior lives in `cli/cli.ts`. Runtime snapshot DTO mapping lives in `server/protocol/runtimeProtocol.ts`; SSE subscription and event streaming lives in `server/streams/runtimeStreams.ts`; shared HTTP helpers live in `server/core/http.ts`.

HTTP route groups with non-trivial request parsing, persistence calls, or telemetry phases should move behind focused server route modules. Model configuration endpoints live in `server/routes/modelConfigRoutes.ts`; new route groups should follow that pattern instead of growing `createAgentRequestListener`.

A user-visible thread owns its runtime state through persisted `AgentThread` and `AgentRun` records, plus the `/threads/{id}/runtime` projection. Thread recovery must start from these persisted records rather than from in-memory promises or controllers.

Runtime visibility rules are shared application rules, not router-private helpers. Thread snapshots and stream replay both use `run/runtimeRunVisibility.ts` to decide when worker-run approvals or input requests should display on another thread. Thread snapshot run selection lives in `thread/runtimeThreadSnapshotSelection.ts`, and thread/session snapshot assembly lives behind `read/runtimeSnapshotBridge.ts`.

Runtime facade methods should delegate behavior to bridges instead of owning orchestration decisions inline. Plan update side effects live behind `taskgraph/runtimePlanToolsBridge.ts`; thread deletion active-run guards live behind `thread/runtimeThreadOperationsBridge.ts`.

All user-triggered execution, including diagnostic single-tool runs, enters through `/threads/{id}/runs`. Diagnostic tool execution may pass a `toolCall` on that route, but external callers must not bypass the thread route or call lower-level runtime creation routes directly.

Startup recovery follows this contract:

- `queued` runs are rescheduled by the router.
- `in_progress` runs are treated as interrupted work and projected to `requires_action` with an explicit recovery input.
- Recovery choices are handled through the normal run input route first; `/runs/{id}/resume` remains a direct operational endpoint for explicit resume actions.
- The frontend must not reconstruct runtime state from local chat memory alone. It should hydrate from the thread runtime projection and send answers/approvals back through runtime routes.

## Runtime Works

Runtime works are execution objects that can outlive one tool call and can be observed, waited on, or cancelled.

- `runtime-work/core/` owns protocol-facing runtime work types and terminal status helpers.
- `runtime-work/manager/` owns provider dispatch, observation, waiting, cancellation, and manager tests.
- `runtime-work/store/` owns in-memory and agent-store-backed runtime work persistence adapters.
- `runtime-work/providers/` owns concrete runtime work providers such as generation jobs and subagent runs.
- Ordinary synchronous tool calls return their final result or error immediately and should not be wrapped as runtime works.
- `generation_job` is an external async runtime work backed by the MovScript backend job handle. It is managed through the `core_work_start/get/list/wait/cancel` tools.
- `core_work_start` is submit-only: it creates the work and returns the work handle, but it does not wait for backend completion or imply success. When a `continuationPolicy` is present, the runtime monitors the work in the background and schedules a continuation when the policy is satisfied. Use `core_work_wait/get/list` only for explicit inspection or blocking waits.
- Worker subagents are internal async runtime works backed by `AgentRun`. They are managed through `core_work_start/get/list/wait/cancel` with `kind: "subagent_run"`.
- Public runtime work kinds must have a real provider and prompt/tool-schema guidance for that lifecycle.

### Runtime Wakeups

Continuation wakeups are centralized through `RuntimeWakeCoordinator`; callers enqueue lifecycle signals there instead of directly deciding whether to resume a thread.

- Wake events are persisted in the store and drained per scope so duplicate active signals coalesce and a thread/run has one wake decision loop at a time.
- Runtime work providers, `RuntimeWorkManager`, `RuntimeWakeCoordinator`, and observe-failure traces are composed behind `work/bridge/runtimeWorksBridge.ts`; `runtimeRouter.ts` should not create or observe runtime work directly.
- The drain loop owns the runtime decision: if queued wake events or runnable continuations exist, drain and advance; if no tool call, no wake event, and no final output exists, the runtime remains waiting; if no tool call, no wake event, and final output exists, the run is allowed to finish.
- `workStarted` registers continuation policy for async work. It does not synchronously poll external providers from the tool bridge; observation ticks are scheduled by the wake coordinator and re-enter as queued `work.observed` events.
- `workObserved` observes non-terminal work through the provider, evaluates work completion, and advances the parent thread when the continuation is ready and unblocked.
- `runSettled` is fired after any model run finishes. It advances continuations waiting on that run's thread and enqueues observed `subagent_run` work whose external handle points at the settled child run.
- `threadOpened` reconciles persisted async work, so generation jobs or subagent runs that finished while the app was closed can still wake their continuation.

This keeps the three wakeup classes on one path: generation job completion, approved tool execution finishing a run, and child-agent run completion.
