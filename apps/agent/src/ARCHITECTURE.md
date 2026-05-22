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
| `adapters/` | External adapter boundaries such as HTTP and MCP | Core business rules |

## Rules

1. New agent code should import through these top-level layer folders whenever possible.
2. Move implementation one slice at a time with tests.
3. `server.ts` remains the composition root. It wires adapters, stores, contracts, and runtimes.
4. Domain behavior enters the core agent through tools and contracts, not through manifest-id conditionals in the runtime.
5. There is one active orchestration engine: `orchestration/agentGraph`.
6. Public run creation has one path: `/threads/{id}/runs` through `AgentRuntimeRouter`. Do not reintroduce public `/runs`, `/runs/tool`, or `/context` compatibility endpoints.
7. Agent capability expansion flows through skills, not direct tool self-loading: a run may activate skills, but tools still require catalog/profile/manifest authorization and the final `applyToolPolicy` gate.

## Runtime Router and Thread Runtime

`application/runtimeRouter.ts` is the process-wide application router. It is the only facade that the HTTP server and UI-facing entrypoints should call directly, and it should stay a composition boundary over focused runtime bridges.

A user-visible thread owns its runtime state through persisted `AgentThread` and `AgentRun` records, plus the `/threads/{id}/runtime` projection. Thread recovery must start from these persisted records rather than from in-memory promises or controllers.

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
