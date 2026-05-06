# Agent Runtime and Debug Architecture

This document is the working map for the current MovScript agent framework and the frontend agent debug surface.

## Layered Architecture

| Layer | Scope | Main code | Runtime artifacts | Debug visibility |
| --- | --- | --- | --- | --- |
| Product surface | User entrypoints and current workspace context. | `apps/admin/src/pages/admin/AgentDebugPage.tsx`, `apps/frontend/src/components/layout/AIAgentPanel.tsx`, `apps/frontend/src/mcp/MCPContextBridge.tsx` | `clientInput`, `uiSnapshot`, attachments, route, current project, selection | Preview input, Context tab, run input snapshot |
| Local agent | Run lifecycle, agentic loop, permissions, drafts, memory, sandbox mode. | `apps/agent/src/server.ts`, `apps/agent/src/runtime/agentRuntime.ts` | thread, message, run, policy, steps, approvals, memories, drafts | Overview, Manifest, Skills, Tools, Prompt, Run Timeline, Raw JSON |
| Business context layer | MovScript project entities and production state. | `apps/backend/internal/interfaces/http/router/router.go`, `apps/backend/internal/domain/workflow/entity_schema.go`, `apps/frontend/src/lib/mcpTools.ts` | context pack, semantic entities, workflow schemas, resource bindings, canvas tasks | Context JSON, tool result JSON, AI Function Inventory |
| Tool execution layer | MCP/runtime/plugin tool discovery, grants, policy, execution. | `apps/agent/src/runtime/toolRegistry.ts`, `apps/agent/src/runtime/toolPolicy.ts`, `apps/agent/catalog/tools` | resolved tool catalog, blocked tools, tool calls, tool outcomes | Tools table, approval preview, step timeline args/result/error |
| Model layer | Optional assistant chat reply through backend model gateway. | `apps/agent/src/runtime/modelConfig.ts`, `apps/agent/src/runtime/assistantMessage.ts` | compiled prompt, assistant message | Model Connection, Prompt tab, final assistant message |

## Business Flow

The business layer should stay readable as:

```text
Project
  -> Script / Setting
  -> Segment / SceneMoment
  -> StoryboardLine
  -> ContentUnit / Keyframe
  -> AssetSlot
  -> Preview / Delivery
```

The Go backend owns formal project entities, semantic schemas, workflow schemas, resources, jobs, and canvas execution. The local runtime reads that state through MCP-shaped tools and the frontend context bridge. Agent writes should go through drafts or approval requests first, then use explicit apply flows for formal backend mutations.

## Runtime Flow

```text
clientInput
  -> thread/message
  -> movscript.get_context_pack
  -> skill + manifest + tool + memory resolution
  -> compiled prompt preview
  -> agentic loop
  -> tool policy / approval / sandbox gate
  -> tool call steps
  -> assistant message
  -> memory extraction
```

The frontend debug page exposes both dry-run preview and executed run views:

- Dry-run preview: context, prompt, predicted first tool calls, approval preview.
- Executed run: actual run status, step timeline, tool args/results/errors, pending approval actions, final assistant message, raw JSON.

## Interaction Commands

Commands are product-level conventions for making agent interactions explicit. They still flow through `clientInput.message`, so natural language and commands share the same runtime envelope.

### `/production_plan`

Intent: compile the current script input, selected project context, and available tools into a machine-readable agentic-loop summary.

Input contract:

```json
{
  "command": "/production_plan",
  "payload": "script text, selected entity, or planning goal",
  "uiSnapshot": {
    "route": "current frontend route",
    "project": "current project summary",
    "selection": "optional selected entity",
    "recentResources": "optional resources"
  }
}
```

Runtime behavior:

1. Resolve the MCP context pack and memories.
2. Compile the agentic-loop prompt from context, manifest, skills, tools, policy, and memories.
3. Select the next tool calls.
4. Apply tool policy, approval gates, and sandbox interception.
5. Return assistant content as JSON when the executed input starts with `/production_plan`.

`/project_plan` is kept as a compatibility alias, but `/production_plan` is the preferred command name because it describes the short-drama production workflow rather than only project metadata.

Output contract:

```json
{
  "command": "/production_plan",
  "runId": "run_...",
  "threadId": "thread_...",
  "objective": "string",
  "strategy": "agentic_loop",
  "steps": [
    {
      "id": "step_...",
      "type": "tool_call | message",
      "status": "in_progress | completed | failed",
      "toolName": "optional string",
      "sandboxed": false
    }
  ],
  "warnings": [],
  "toolResults": [],
  "pendingApprovals": []
}
```

### `/draft`

Intent: create a local draft or candidate artifact without writing formal project entities.

Current support: `/draft <goal>` is an explicit command form for `movscript.create_draft`. Natural language draft requests are still supported.

Example:

```text
/draft 写一版第一场镜头草稿
```

### `/inspect_context`

Intent: show the runtime input context that will be used by the agentic loop and tools.

Current support: `/inspect_context` returns assistant content as JSON. The Agent Debug `Context` and `Raw` tabs are only frontend renderers over the same text-representable data.

Output shape:

```json
{
  "command": "/inspect_context",
  "runId": "run_...",
  "threadId": "thread_...",
  "context": {},
  "memories": [],
  "labels": [],
  "warnings": []
}
```

### Other Debug Commands

The Agent Debug page exposes a command-first matrix for current runtime functions:

| Command | Runtime function | Notes |
| --- | --- | --- |
| `/search <query>` | `movscript.search_entities` | Project-scoped read; results appear in run steps and assistant summary. |
| `/project_structure` | `movscript.read_project_structure` | Reads the compact project structure as a standalone debug action. |
| `/read_entity <type> #<id>` | `movscript.read_entity` | Reads one formal entity. |
| `/list_drafts` | `movscript.list_drafts` | Lists local Agent drafts without a dedicated draft UI. |
| `/apply_draft draft_xxx to <type> #<id> field <field>` | `movscript.apply_draft` | Creates an approval request before applying. |
| `POST /runs/tool` payload | UI/cost tools such as `movscript.open_entity`, `movscript.create_generation_job` | Used when a feature is better represented as a command payload than a custom UI. |

## Current Debug Inventory

The Agent Debug page includes:

- `Architecture`: layered agent architecture, business flow, runtime flow, interaction command contracts.
- `Commands`: one-by-one command/debug entrypoints for current runtime and tool functions.
- `AI Functions`: frontend AI feature inventory, trigger, endpoint, request shape, trace, visible/missing debug fields.
- `Manifest`, `Skills`, `Tools`: effective runtime policy inputs.
- `Prompt`, `Context`, `Runs`, `Raw`: prompt, context, approval, tool execution, and raw payload inspection.
