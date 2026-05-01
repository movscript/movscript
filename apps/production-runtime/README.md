# movscript-production-runtime

`movscript-production-runtime` is the local MovScript production runtime service. It is intentionally separate from the Electron frontend and the Go backend.

The desktop side exposes MovScript context through an MCP-shaped local endpoint. The runtime owns run lifecycle, planning, memory, tool metadata, manifest policy, approval gates, local candidate/draft state, and optional model calls.

The current implementation still contains legacy agent/chat API names while V3 production action APIs are introduced.

## Development

Start the Electron app first if you need live MovScript context from:

```text
http://127.0.0.1:18765/mcp
```

Then run:

```bash
pnpm install
pnpm --filter movscript-production-runtime dev
```

Default runtime endpoint:

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
| `MOVSCRIPT_AGENT_PORT` | `28765` | Local HTTP port. Legacy name retained during the runtime rename. |
| `MOVSCRIPT_MCP_ENDPOINT` | `http://127.0.0.1:18765/mcp` | Desktop MCP-shaped endpoint. |
| `MOVSCRIPT_AGENT_SKILLS_DIR` | derived from state path | Local skill metadata override directory. Built-in skills from `apps/production-runtime/catalog/skills` are always loaded first. |
| `MOVSCRIPT_AGENT_TOOLS_DIR` | derived from state path | Local tool metadata override directory. Built-in tools from `apps/production-runtime/catalog/tools` are always loaded first. |
| `MOVSCRIPT_AGENT_GATEWAY_BASE_URL` | `http://127.0.0.1:8080/v1` | Optional OpenAI-compatible gateway URL. |
| `MOVSCRIPT_AGENT_GATEWAY_MODEL` | `movscript-default-chat` | Gateway model. |
| `MOVSCRIPT_AGENT_GATEWAY_USER_ID` | unset | Enables backend gateway identity shim. |
| `MOVSCRIPT_AGENT_OPENAI_API_KEY` | unset | Direct OpenAI-compatible API key. |
| `MOVSCRIPT_AGENT_OPENAI_BASE_URL` | `https://api.openai.com/v1` | Direct provider base URL. |
| `MOVSCRIPT_AGENT_OPENAI_MODEL` | `gpt-4o-mini` | Direct provider model. |
| `MOVSCRIPT_AGENT_PLANNER_MODEL` | inherits chat model | Optional model used only for model-driven run planning. |
| `MOVSCRIPT_BACKEND_API_BASE_URL` | unset | Optional MovScript backend origin or `/api/v1` URL used for approved `apply_draft` PATCH writes. |

## HTTP API

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health` | Server health and plugin catalog metadata. |
| `GET` | `/inspect` | MCP resources/tools plus registered runtime tools and skills. |
| `GET` | `/capabilities` | Runtime capabilities, optionally for a project. |
| `GET` | `/tools` | Registered tool metadata. |
| `GET` | `/skills` | Loaded skill catalog. |
| `GET` | `/agent-manifest/default` | Legacy built-in/default manifest. |
| `GET` | `/context` | Current MovScript context pack from MCP. |
| `POST` | `/draft` | Create a local draft/candidate artifact. |
| `GET` | `/drafts` | List local draft/candidate artifacts. |
| `GET` | `/drafts/:id` | Read one local draft/candidate artifact. |
| `POST` | `/drafts/:id/apply-preview` | Build before/after review metadata for applying a draft. |
| `POST` | `/drafts/:id/reject` | Mark a local draft rejected. |
| `POST` | `/chat` | Legacy simple chat endpoint. |
| `POST` | `/threads` | Legacy thread creation. |
| `GET` | `/threads` | Legacy thread summaries. |
| `GET` | `/threads/:id` | Read one legacy thread. |
| `PATCH` | `/threads/:id` | Update legacy thread metadata. |
| `POST` | `/threads/:id/messages` | Add legacy thread message. |
| `POST` | `/runs` | Create and execute a legacy run. |
| `POST` | `/runs/preview` | Preview a legacy run plan. |
| `GET` | `/runs` | List runs. |
| `GET` | `/runs/:id` | Read one run. |
| `POST` | `/runs/:id/approve` | Approve pending tool calls and resume. |
| `POST` | `/runs/:id/reject` | Reject pending tool calls. |
| `GET` | `/memories` | List memories. |
| `POST` | `/memories` | Create memory. |
| `DELETE` | `/memories/:id` | Delete memory. |

## Skills and Tools

The runtime reads local JSON metadata from skills and tools directories at startup.
It also ships a built-in MovScript catalog in `apps/production-runtime/catalog/skills` and `apps/production-runtime/catalog/tools`.

Installed skills are merged into the default manifest. Installed tools are merged into the runtime registry, but a matching MCP tool must exist before execution can succeed.
