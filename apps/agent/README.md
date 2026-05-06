# movscript-agent

`movscript-agent` is the local MovScript agent service. It is intentionally separate from the Electron frontend and the Go backend.

The desktop side exposes MovScript context through an MCP-shaped local endpoint. The service owns run lifecycle, the agentic loop, memory, tool metadata, manifest policy, approval gates, sandbox interception, local candidate/draft state, and optional model calls.

## Development

Start the Electron app first if you need live MovScript context from:

```text
http://127.0.0.1:18765/mcp
```

Then run:

```bash
pnpm install
pnpm --filter movscript-agent dev
```

Default agent endpoint:

```text
http://127.0.0.1:28765
```

Health check:

```bash
curl http://127.0.0.1:28765/health
```

## Environment

| Variable | Default | Description |
| --- | --- | --- |
| `MOVSCRIPT_AGENT_PORT` | `28765` | Local agent HTTP port. |
| `MOVSCRIPT_MCP_ENDPOINT` | `http://127.0.0.1:18765/mcp` | Desktop MCP-shaped endpoint. |
| `MOVSCRIPT_AGENT_SKILLS_DIR` | derived from state path | Local skill metadata override directory. Built-in skills from `apps/agent/catalog/skills` are always loaded first. |
| `MOVSCRIPT_AGENT_TOOLS_DIR` | derived from state path | Local tool metadata override directory. Built-in tools from `apps/agent/catalog/tools` are always loaded first. |
| `MOVSCRIPT_BACKEND_API_BASE_URL` | `http://localhost:8765/api/v1` for model calls | MovScript backend API base URL. Agent model calls use backend model configs through `/model-gateway/chat/completions`; provider API keys stay in the backend. |
| `MOVSCRIPT_AGENT_MODEL_CONFIG_PATH` | derived from state path | Optional path for the local Agent model routing file. The file stores only backend `model_config_id` and usage flags. |

## HTTP API

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health` | Server health and plugin catalog metadata. |
| `GET` | `/inspect` | MCP resources/tools plus registered agent tools and skills. |
| `GET` | `/capabilities` | Agent capabilities, optionally for a project. |
| `GET` | `/tools` | Registered tool metadata. |
| `GET` | `/skills` | Loaded skill catalog. |
| `GET` | `/agent-manifest/default` | Legacy built-in/default manifest. |
| `GET` | `/context` | Current MovScript context pack from MCP. |
| `POST` | `/draft` | Create a local draft/candidate artifact. |
| `GET` | `/drafts` | List local draft/candidate artifacts. |
| `GET` | `/drafts/:id` | Read one local draft/candidate artifact. |
| `POST` | `/drafts/:id/apply-preview` | Build before/after review metadata for applying a draft. |
| `POST` | `/drafts/:id/reject` | Mark a local draft rejected. |
| `POST` | `/threads` | Agent thread creation. |
| `GET` | `/threads` | Agent thread summaries. |
| `GET` | `/threads/:id` | Read one agent thread. |
| `PATCH` | `/threads/:id` | Update agent thread metadata. |
| `POST` | `/threads/:id/messages` | Add agent thread message. |
| `POST` | `/runs` | Create and execute an agent run. |
| `POST` | `/runs/preview` | Preview context, prompt, first tool calls, and approval gates without executing tools. |
| `GET` | `/runs` | List runs. |
| `GET` | `/runs/:id` | Read one run. |
| `POST` | `/runs/:id/approve` | Approve pending tool calls and resume. |
| `POST` | `/runs/:id/reject` | Reject pending tool calls. |
| `GET` | `/memories` | List memories. |
| `POST` | `/memories` | Create memory. |
| `DELETE` | `/memories/:id` | Delete memory. |

## Skills and Tools

The agent service reads local JSON metadata from skills and tools directories at startup.
It also ships a built-in MovScript catalog in `apps/agent/catalog/skills` and `apps/agent/catalog/tools`.

Installed skills are merged into the default manifest. Installed tools are merged into the agent tool registry, but a matching MCP tool must exist before execution can succeed.
