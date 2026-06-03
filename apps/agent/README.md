# movscript-agent

`movscript-agent` is the MovScript session runtime. In the desktop app, each session owns its own agent child process instead of sharing a standalone local service.

The desktop side exposes MovScript context through an MCP-shaped local endpoint. The runtime owns run lifecycle, the agentic loop, memory, tool metadata, active config file manifests, approval gates, sandbox interception, local candidate/workspace state, and optional model calls.

## Development

For normal desktop agent-flow debugging, let the Electron session own the agent process:

```bash
pnpm --filter @movscript/desktop dev:agent-workspace
```

By default this uses the repository `.movscript-dev` workspace. Override it with `MOVSCRIPT_AGENT_WORKSPACE_DIR` when a debugging run needs a clean workspace.

Use the standalone server command only when you are debugging the agent package itself.

Start the Electron app first if you need live MovScript context from:

```text
http://127.0.0.1:18765/mcp
```

Then run:

```bash
pnpm install
pnpm --filter @movscript/agent dev
```

Default agent endpoint:

```text
http://127.0.0.1:28765
```

Liveness and compatibility checks:

```bash
curl http://127.0.0.1:28765/livez
curl http://127.0.0.1:28765/runtime/compat
```

Observability endpoints:

```bash
curl http://127.0.0.1:28765/metrics
curl http://127.0.0.1:28765/runtime/telemetry
```

The agent uses a three-layer observability model: Prometheus-compatible metrics for trend aggregation, trace-derived spans for per-run diagnosis, and structured diagnostic logs for slow/error hints. Long-term aggregation belongs in Prometheus/Grafana or an OpenTelemetry backend; the frontend console only reads the recent local window. See `observability/README.md` for a Prometheus scrape config and Grafana dashboard starter.

## Packaging

`apps/agent` is the canonical source tree. The Electron frontend build runs `apps/frontend/scripts/prepare-agent-deploy.mjs`, which builds this package and copies only `dist/`, `catalog/`, and a minimal `package.json` into `apps/frontend/movscript-agent`. Treat that frontend directory as a generated packaged-runtime artifact, not a second implementation.

## Environment

| Variable | Default | Description |
| --- | --- | --- |
| `MOVSCRIPT_AGENT_PORT` | `28765` | Local agent HTTP port. |
| `MOVSCRIPT_MCP_ENDPOINT` | `http://127.0.0.1:18765/mcp` | Desktop MCP-shaped endpoint. |
| `MOVSCRIPT_AGENT_RUNTIME_DATA_DIR` | `.movscript-agent` under the process cwd | Root directory for local runtime data, including the runtime log, traces, memories, workspace registry, catalog defaults, and model config. |
| `MOVSCRIPT_AGENT_CATALOG_STORE_DIR` | derived from runtime data dir | Root directory for frontend-managed agent catalog plugin files. Electron sets this explicitly for session child processes. |
| `MOVSCRIPT_AGENT_SKILLS_DIR` | derived from catalog store dir | Local skill metadata directory. Built-in generic skills from `apps/agent/catalog/skills` are always loaded first. Plugin skills are installed under this directory by the desktop/shared pack store. |
| `MOVSCRIPT_AGENT_TOOLS_DIR` | derived from catalog store dir | Local tool metadata directory. Built-in generic tools from `apps/agent/catalog/tools` are always loaded first. Plugin tools are installed under this directory by the desktop/shared pack store. |
| `MOVSCRIPT_AGENT_PACKS_DIR` | derived from catalog store dir | Local pack metadata directory. Plugin packs are installed here by the desktop/shared pack store. |
| `MOVSCRIPT_AGENT_CONFIG_FILES_DIR` | derived from catalog store dir | Local config-file metadata directory. Plugin config files are installed here by the desktop/shared pack store. |
| `MOVSCRIPT_BACKEND_API_BASE_URL` | `http://localhost:8765/api/v1` for model calls | MovScript backend API base URL. Agent model calls use backend model configs through `/model-gateway/chat/completions`; provider API keys stay in the backend. |
| `MOVSCRIPT_AGENT_MODEL_CONFIG_PATH` | derived from runtime data dir | Optional path for the local Agent model routing file. The file stores the backend public `model_id`, optional legacy `modelConfigId` for audit, and usage flags. |

## HTTP API

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/livez` | Minimal liveness probe for the HTTP runtime. |
| `GET` | `/runtime/compat` | Lightweight runtime compatibility handshake: API version, feature flags, and MCP endpoint. |
| `GET` | `/health` | Legacy lightweight health response. Prefer `/livez` and `/runtime/compat` for new callers. |
| `GET` | `/runtime/capabilities` | Server capability metadata, plugin catalog summary, paths, update state, and backend apply status. |
| `GET` | `/metrics` | Prometheus-compatible metrics for agent operations and trace spans. |
| `GET` | `/runtime/telemetry` | Recent in-memory runtime telemetry snapshot: operations, spans, metrics, logs, retention metadata. |
| `GET` | `/inspect` | MCP resources/tools plus registered agent tools and skills. |
| `GET` | `/capabilities` | Agent capabilities, optionally for a project. |
| `GET` | `/tools` | Registered tool metadata. |
| `GET` | `/skills` | Loaded skill catalog. |
| `GET` | `/agent-manifest/active` | Current active config file manifest. |
| `POST` | `/workspace` | Create a local workspace/candidate artifact. |
| `GET` | `/workspaces` | List local workspace/candidate artifacts. |
| `GET` | `/workspaces/:id` | Read one local workspace/candidate artifact. |
| `POST` | `/workspaces/:id/apply-preview` | Build before/after review metadata for applying the workspace's current content. |
| `POST` | `/workspaces/:id/reject` | Record a local workspace review rejection without closing the workspace. |
| `POST` | `/threads` | Agent thread creation. |
| `GET` | `/threads` | Agent thread summaries. |
| `DELETE` | `/threads` | Physically delete all thread history, related runs, plans, runtime records, and trace files. Queued or in-progress runs must be cancelled first; waiting `requires_action` history is deletable. |
| `GET` | `/threads/:id` | Read one agent thread. |
| `PATCH` | `/threads/:id` | Update agent thread metadata. |
| `DELETE` | `/threads/:id` | Physically delete one thread, its related runs, plans, runtime records, and trace files. Queued or in-progress runs must be cancelled first; waiting `requires_action` history is deletable. |
| `GET` | `/threads/:id/timeline` | Read the thread timeline page. This is the display source for transcript, runtime status, plan, and diagnostic items. |
| `GET` | `/threads/:id/timeline/stream` | Stream thread timeline item upserts and reset requests. |
| `GET` | `/threads/:id/runtime` | Read a protocol v2 runtime snapshot for one thread. |
| `GET` | `/threads/:id/stream` | Stream thread-scoped runtime entity events. |
| `POST` | `/threads/:id/messages` | Append a user transcript message only. This is not a message-history read API and does not accept runtime fields. |
| `POST` | `/threads/:id/runs` | The only public entrypoint that creates and executes an agent run for a thread. Diagnostic single-tool runs also enter here through `toolCall`. |
| `GET` | `/sessions/:id/timeline` | Read a session timeline page across all session threads, optionally filtered by `threadId`. |
| `GET` | `/sessions/:id/timeline/stream` | Stream session timeline item upserts and reset requests, optionally filtered by `threadId`. |
| `GET` | `/sessions/:id/runtime` | Read a protocol v2 runtime snapshot for all threads in a session. |
| `GET` | `/sessions/:id/stream` | Stream session-scoped runtime entity events. |
| `POST` | `/runs/preview` | Read-only preview of context, prompt, first tool calls, and approval gates without creating or executing a run. |
| `GET` | `/runs` | List runs. |
| `GET` | `/runs/:id` | Read one run. |
| `POST` | `/runs/:id/resume` | Explicit operational resume endpoint for persisted interrupted runs. Normal recovery should use the thread runtime input route first. |
| `POST` | `/interactions/:id/approve` | Approve a pending interaction and resume through runtime control. |
| `POST` | `/interactions/:id/reject` | Reject a pending interaction. |
| `GET` | `/memories` | List memories. |
| `POST` | `/memories` | Create memory. |
| `DELETE` | `/memories/:id` | Delete memory. |

## Skills and Tools

The agent service reads local catalog metadata from skills, tools, packs, and config-file directories at startup. Electron owns plugin installation into those directories through the shared pack store; the session agent process only loads what is present.

The agent package ships a built-in generic platform catalog in `apps/agent/catalog/skills`, `apps/agent/catalog/tools`, `apps/agent/catalog/packs`, and `apps/agent/catalog/config-files`. MovScript business-specific skills are distributed as frontend bundled plugins and installed into the shared catalog store at desktop startup.

Skills and tools are file-defined resources. A resource is scanned into the catalog when its file is valid, but it becomes runtime-available only when a pack lists it and the active config file enables that pack. Config files choose packs, skills, tool grants, approval defaults, and limits. Skill loading behavior, trigger metadata, and tool grants are derived from enabled packs, the active config file, and skill definitions.

Installed plugin tools are also merged into the agent tool registry for schema discovery. Non-runtime plugin or MCP tools still require a matching MCP tool before execution can succeed.
