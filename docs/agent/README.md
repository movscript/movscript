# Agent Documentation

Movscript's local agent is a standalone TypeScript HTTP service in `apps/agent`. It is separate from the Go backend and the Electron frontend.

## Current Responsibilities

- Maintain local threads, messages, runs, run steps, approvals, and memories.
- Load local skill and tool metadata from configured folders.
- Apply agent manifest permissions and tool policy before execution.
- Read Movscript context through the desktop MCP-shaped endpoint.
- Optionally call the Movscript model gateway or a direct OpenAI-compatible endpoint.

## Runtime Entry Points

- [apps/agent/README.md](../../apps/agent/README.md): package-level development and API guide.
- [apps/agent/src/runtime/README.md](../../apps/agent/src/runtime/README.md): runtime module boundaries.
- [mcp-v1.md](mcp-v1.md): first MCP-shaped tool/resource design notes.
- [final-agent-architecture.md](final-agent-architecture.md): longer architecture proposal and acceptance notes.

## Local Development

Start the desktop app first if you need live context from the Electron MCP bridge, then run:

```bash
make dev-agent
```

Default service URL:

```text
http://127.0.0.1:28765
```

Health check:

```bash
curl http://127.0.0.1:28765/health
```

The backend `/mcp` endpoint is currently removed; the agent expects MCP-shaped tools from the desktop/local path.
