# movscript-agent

Local Agent server for MovScript.

This project is intentionally separate from the Electron frontend. The frontend
exposes MovScript context and draft tools through a local MCP-shaped JSON-RPC
server. The agent process owns identity, planning, memory, run lifecycle, model
calls, and tool orchestration.

First-version scope:

- read MovScript context through MCP resources/tools
- create local draft artifacts through MCP tools
- avoid direct database writes
- avoid generation/cost actions

## Development

Start MovScript Electron first so the frontend MCP server is available at:

```bash
http://127.0.0.1:18765/mcp
```

Then run the local agent server:

```bash
pnpm install
pnpm --filter movscript-agent dev
```

Default endpoint:

```text
http://127.0.0.1:28765
```

The CLI remains as a development smoke-test helper:

```bash
pnpm --filter movscript-agent dev:cli -- inspect
pnpm --filter movscript-agent dev:cli -- context
```

## CLI Commands

- `inspect`: list MCP resources and tools
- `context`: read the current MovScript context pack
- `draft`: create a test draft artifact

Example:

```bash
pnpm --filter movscript-agent dev:cli -- draft --kind note --title "Test draft" --content "Hello from movscript-agent"
```

## Server API v0

- `GET /health`
- `GET /inspect`
- `GET /context`
- `GET /tools`
- `GET /skills`
- `GET /agent-manifest/default`
- `POST /chat`
- `POST /draft`
- `POST /runs/:id/approve`
- `POST /runs/:id/reject`

These are not the final product API. They are a minimal local control surface for
the Electron app while the runtime, memory, and planning layers are introduced.

`POST /chat` accepts:

```json
{
  "message": "帮我看一下当前项目接下来该做什么",
  "includeContext": true
}
```

By default the chat runtime returns a local fallback response so the client/server
path can be tested without model credentials.

To use the MovScript backend model gateway, start the backend and run:

```bash
MOVSCRIPT_AGENT_GATEWAY_USER_ID=1 pnpm --filter movscript-agent dev
```

Optional gateway settings:

- `MOVSCRIPT_AGENT_GATEWAY_MODEL` defaults to `movscript-default-chat`
- `MOVSCRIPT_AGENT_GATEWAY_BASE_URL` defaults to `http://127.0.0.1:8080/v1`

Until backend Gateway API keys are implemented, `MOVSCRIPT_AGENT_GATEWAY_USER_ID`
is sent as `Authorization: Bearer <user id>` and maps to the existing MovScript
user identity.

To bypass the MovScript backend and use a generic OpenAI-compatible provider
directly, start the server with:

```bash
MOVSCRIPT_AGENT_OPENAI_API_KEY=... pnpm --filter movscript-agent dev
```

Optional settings:

- `MOVSCRIPT_AGENT_OPENAI_MODEL` defaults to `gpt-4o-mini`
- `MOVSCRIPT_AGENT_OPENAI_BASE_URL` defaults to `https://api.openai.com/v1`

## Plugin Folders

`movscript-agent` reads installable skills and tool metadata from local folders at
startup:

```text
.movscript-agent/skills
.movscript-agent/tools
```

Override them with:

```bash
MOVSCRIPT_AGENT_SKILLS_DIR=/path/to/skills \
MOVSCRIPT_AGENT_TOOLS_DIR=/path/to/tools \
pnpm --filter movscript-agent dev
```

Each folder accepts `.json` files. A plugin subfolder can also contain
`manifest.json`, `skill.json`, `skills.json`, `tool.json`, or `tools.json`.

Skill file example:

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

Tool metadata file example:

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

Installed skills are merged into the default agent manifest. Installed tools are
merged into the runtime registry; a tool still needs a matching MCP tool at
runtime before it becomes executable.

## Agent Manifest v1

`POST /runs` accepts an optional `agentManifest` using schema
`movscript.agent.v1`. The runtime checks planned tool calls against:

- registered tool metadata
- manifest tool grants
- manifest permissions
- project scope
- approval requirements

Minimal example:

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

`GET /tools` returns the runtime tool registry and
`GET /agent-manifest/default` returns the built-in local-agent manifest.

If a planned tool call needs approval, the run stops with:

```json
{
  "status": "requires_action",
  "pendingApprovals": [
    {
      "id": "approval_...",
      "toolName": "movscript.create_generation_job",
      "reason": "movscript.create_generation_job 需要用户确认后才能执行",
      "risk": "generate",
      "permission": "generation.create",
      "status": "pending"
    }
  ]
}
```

Approve and resume the same run:

```bash
curl -X POST http://127.0.0.1:28765/runs/run_.../approve \
  -H 'Content-Type: application/json' \
  -d '{"approvalIds":["approval_..."]}'
```

Reject and finish the run without executing the pending tool:

```bash
curl -X POST http://127.0.0.1:28765/runs/run_.../reject \
  -H 'Content-Type: application/json' \
  -d '{"approvalIds":["approval_..."]}'
```
