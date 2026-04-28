# Runtime

The standalone agent process owns agent state and orchestration. CLI, Electron,
and frontend callers should treat it as an HTTP service and avoid duplicating
runtime decisions.

Current module boundaries:

- `agentRuntime.ts`: in-memory thread/run lifecycle, run execution, MCP step
  recording, and assistant message insertion.
- `types.ts`: shared agent API contract for threads, messages, runs, steps,
  tool calls, and tool outcomes.
- `context.ts`: parsing `movscript.get_context_pack` results into runtime
  context such as the current project id.
- `agentManifest.ts`: `movscript.agent.v1` manifest normalization and the
  default local-agent contract.
- `toolRegistry.ts`: registered tool metadata, permissions, risk levels, and
  default approval requirements.
- `planner.ts`: deterministic first-stage text planner that emits candidate
  tool calls. It does not inject context or enforce policy.
- `toolPolicy.ts`: manifest authorization, tool registration checks,
  approval gating, project-scoped tool gating, and project id injection.
- `assistantMessage.ts`: user-facing assistant content from tool outcomes and
  warnings.

Current open-agent boundary:

- Tool execution must pass the registry and the active agent manifest.
- Project-scoped tools are blocked unless the current MCP context has a project.
- Write/generation/destructive tools can be registered before they are exposed;
  policy blocks them until the manifest grants them and approval is supplied.
- Approval-required calls pause the run with `status: "requires_action"` and
  `pendingApprovals`; `approveRun` resumes the same run with approved tool names.
- Frontend-selected agents can pass a `movscript.agent.v1` manifest to
  `POST /runs`.

The current runtime intentionally does not introduce a database, model planner,
actual write/generation/cost tools, long-running process supervision, or a full
approval UI.
