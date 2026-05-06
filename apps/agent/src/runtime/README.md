# Agent Runtime

The standalone agent process owns agent state and orchestration. CLI, Electron, and frontend callers should treat it as an HTTP service and avoid duplicating runtime decisions.

## Module Boundaries

| Module | Responsibility |
| --- | --- |
| `agentRuntime.ts` | Public runtime facade, thread lifecycle, persistence coordination, approval/input resume, and run execution orchestration. |
| `types.ts` | Shared agent API contracts for threads, messages, runs, steps, tool calls, and outcomes. |
| `contracts/` | Runtime extension contracts. Domain modules can contribute structured output requirements, tool schema overrides, command overrides, and model requirements without being hardcoded into the core runtime. |
| `run/runFactory.ts` | Factory for `AgentRun` creation and run metadata assembly. |
| `run/runTrace.ts` | Builders for run steps and trace events. The runtime owns persistence; this module owns trace object shape and data normalization. |
| `preview/` | Preview-time model probing and policy planning. It predicts tool calls and approvals without creating or executing a run. |
| `commands/` | Command parsing and deterministic runtime command handlers such as `/context` and `/memory`. |
| `loop/` | Agentic loop pipeline: context build, model call, policy gate, tool execution, and final loop result. |
| `input/` | Request normalization, default run policy, approval merging, and round identifiers. |
| `context.ts` | Parse `movscript.get_context_pack` results into runtime context such as current project id. |
| `agentManifest.ts` | `movscript.agent.v1` normalization and the default local-agent contract. |
| `toolRegistry.ts` | Tool metadata, permissions, risk levels, and default approval requirements. |
| `toolPolicy.ts` | Manifest authorization, registration checks, approval gating, project-scoped gating, and project id injection. |
| `assistantMessage.ts` | User-facing assistant content from tool outcomes and warnings. |
| `fileStore.ts` | File-backed runtime state path helpers and persistence. |
| `memory/` | File-backed memory store and memory manager contracts. |
| `pluginCatalog.ts` | Local skill/tool metadata loading. |

## Current Runtime Boundary

- Tool execution must pass the registry and active agent manifest.
- Runs use an agentic loop: resolve context, compile the prompt, select tool calls, execute allowed tools, then continue to assistant response.
- Project-scoped tools are blocked unless current MCP context has a project.
- Write/generation/destructive tools can be registered before exposure; policy blocks them until manifest grants and approvals allow them.
- Sandbox mode intercepts write/generation/destructive tools and records `sandboxed: true` steps without performing writes.
- Approval-required calls pause with `status: "requires_action"` and `pendingApprovals`.
- `approveRun` resumes the same run with approved tool names.
- Frontend-selected agents can pass a `movscript.agent.v1` manifest to `POST /runs`.
- Memory is local and file-backed.

## Architecture Pattern Direction

- `server.ts` is the composition root. It wires domain-specific contracts, stores, model config, and MCP clients into the core runtime.
- Domain-specific behavior should enter `AgentRuntime` through strategy-style contracts such as `AgentRuntimeContractResolver`, not through manifest id conditionals inside the runtime.
- Run object creation should stay in factories. Execution code should operate on already-built runs and focus on orchestration.
- The agentic loop is a pipeline: build context, call model, gate requested tools, execute tools, and repeat or finish.

## Current Non-Goals

- No database-backed agent state.
- No production-grade process supervision.
- No full approval UI in this package.
- No direct database writes.
- No backend `/mcp` dependency; MCP-shaped tools come from the desktop/local path.
