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
| `manifest/` | Agent manifest, skills, plugin catalog | Runtime execution decisions |
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
