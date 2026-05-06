# Agent Architecture

This directory is the target namespace for the agent architecture. Existing code still lives under `src/runtime`, `src/production`, `src/mcpClient.ts`, and `src/server.ts`; this layer gives those modules a clear migration destination without breaking current imports.

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
| `manifest/` | Agent manifest, skills, plugin catalog | Runtime execution decisions |
| `model/` | Model config and model client adapter | Tool policy, domain state machines |
| `contracts/` | Extension contracts used by domain-specific agents | Hardcoded domain branches inside core runtime |
| `domains/` | Domain modules such as production orchestration | Generic agent loop, HTTP server wiring |
| `adapters/` | External adapter boundaries such as HTTP and MCP | Core business rules |

## Migration Rules

1. New agent code should import through these top-level layer folders whenever possible.
2. Move implementation one slice at a time: create tests, move the module, then update the compatibility export.
3. `server.ts` remains the composition root. It wires adapters, stores, contracts, and runtimes.
4. Domain behavior enters the core agent through tools and contracts, not through manifest-id conditionals in the runtime.
5. There should be one active orchestration engine. `orchestration/agentGraph` is the target; the old direct loop is kept only as a compatibility export until removed.

## Current Compatibility Map

| Target | Current Source |
| --- | --- |
| `application` | `runtime/agentRuntime.ts` |
| `orchestration` | `runtime/loop/*` |
| `state` | `runtime/types.ts`, `runtime/run/*`, `runtime/store/*` |
| `context` | `runtime/context.ts`, `runtime/contextText.ts`, `runtime/debug/*`, `runtime/input/*` |
| `tools` | `runtime/tools/*`, `runtime/loop/toolExecutor.ts` |
| `drafts` | `runtime/store/draftStore.ts`, `runtime/store/draftApply.ts`, `runtime/store/backendApplyClient.ts` |
| `memory` | `runtime/memory/*` |
| `manifest` | `runtime/manifest/*`, `runtime/pluginCatalog.ts` |
| `model` | `runtime/model/*`, `runtime/modelConfig.ts` |
| `contracts` | `runtime/contracts/*` |
| `domains/production` | `production/*` |
| `adapters/mcp` | `mcpClient.ts` |
| `adapters/http` | `server.ts` composition root |
