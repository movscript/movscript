# movscript-agent

`movscript-agent` is the local Movscript agent server. It is intentionally separate from the Electron frontend and the Go backend.

The frontend/desktop side exposes Movscript context through an MCP-shaped local endpoint. The agent process owns thread/run lifecycle, planning, memory, tool metadata, manifest policy, approval gates, and optional model calls.

## Development

Start the Electron app first if you need live Movscript context from:

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
| `MOVSCRIPT_AGENT_PORT` | `28765` | Local HTTP port. |
| `MOVSCRIPT_MCP_ENDPOINT` | `http://127.0.0.1:18765/mcp` | Desktop MCP-shaped endpoint. |
| `MOVSCRIPT_AGENT_SKILLS_DIR` | derived from state path | Skill metadata directory. |
| `MOVSCRIPT_AGENT_TOOLS_DIR` | derived from state path | Tool metadata directory. |
| `MOVSCRIPT_AGENT_GATEWAY_BASE_URL` | `http://127.0.0.1:8080/v1` | Optional OpenAI-compatible gateway URL. |
| `MOVSCRIPT_AGENT_GATEWAY_MODEL` | `movscript-default-chat` | Gateway model. |
| `MOVSCRIPT_AGENT_GATEWAY_USER_ID` | unset | Enables backend gateway identity shim. |
| `MOVSCRIPT_AGENT_OPENAI_API_KEY` | unset | Direct OpenAI-compatible API key. |
| `MOVSCRIPT_AGENT_OPENAI_BASE_URL` | `https://api.openai.com/v1` | Direct provider base URL. |
| `MOVSCRIPT_AGENT_OPENAI_MODEL` | `gpt-4o-mini` | Direct provider model. |

## HTTP API

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health` | Server health and plugin catalog metadata. |
| `GET` | `/inspect` | MCP resources/tools plus registered agent tools and skills. |
| `GET` | `/capabilities` | Runtime capabilities, optionally for a project. |
| `GET` | `/tools` | Registered tool metadata. |
| `GET` | `/skills` | Loaded skill catalog. |
| `GET` | `/agent-manifest/default` | Built-in/default agent manifest. |
| `GET` | `/context` | Current Movscript context pack from MCP. |
| `POST` | `/draft` | Create a draft through MCP. |
| `POST` | `/chat` | Simple chat endpoint. |
| `POST` | `/threads` | Create a thread. |
| `GET` | `/threads` | List thread summaries. |
| `GET` | `/threads/:id` | Read one thread. |
| `PATCH` | `/threads/:id` | Update thread metadata. |
| `POST` | `/threads/:id/messages` | Add thread message. |
| `POST` | `/runs` | Create and execute a run. |
| `POST` | `/runs/preview` | Preview a run plan. |
| `GET` | `/runs` | List runs. |
| `GET` | `/runs/:id` | Read one run. |
| `POST` | `/runs/:id/approve` | Approve pending tool calls and resume. |
| `POST` | `/runs/:id/reject` | Reject pending tool calls. |
| `GET` | `/memories` | List memories. |
| `POST` | `/memories` | Create memory. |
| `DELETE` | `/memories/:id` | Delete memory. |

## CLI Smoke Tests

`movcli` can talk to the local agent:

```bash
pnpm --filter movcli dev -- agent status
pnpm --filter movcli dev -- agent chat "Help summarize the current project"
pnpm --filter movcli dev -- agent run "Create a planning note" --json
```

## Skills and Tools

The agent reads local JSON metadata from skills and tools directories at startup.

Skill example:

```json
{
  "id": "studio.writer",
  "name": "Writer",
  "description": "Writes scene drafts",
  "enabled": true,
  "priority": 20,
  "instruction": "Write in short scene beats.",
  "appliesWhen": "scene,draft",
  "toolHints": ["studio.script_outline"]
}
```

Tool metadata example:

```json
{
  "name": "studio.script_outline",
  "description": "Create a script outline draft.",
  "permission": "draft.write",
  "risk": "draft",
  "projectScoped": true,
  "requiresApprovalByDefault": false,
  "defaultGrant": {
    "name": "studio.script_outline",
    "mode": "allow",
    "approval": "never"
  }
}
```

Installed skills are merged into the default agent manifest. Installed tools are merged into the runtime registry, but a matching MCP tool must exist before execution can succeed.

## Agent Manifest

Runs may include a `movscript.agent.v1` manifest:

```json
{
  "threadId": "thread_...",
  "agentManifest": {
    "schema": "movscript.agent.v1",
    "id": "studio.shot-planner",
    "version": "1.0.0",
    "name": "Shot Planner",
    "permissions": ["project.read", "draft.write"],
    "tools": [
      { "name": "movscript.search_entities", "mode": "allow", "approval": "never" },
      { "name": "movscript.create_draft", "mode": "allow", "approval": "never" }
    ]
  }
}
```

The runtime checks tool registration, manifest grants, permissions, project scope, and approval requirements before execution.
