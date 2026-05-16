# Claude Code Integration Plan

This page tracks the planned Claude Code integration path for Movscript. The current product direction is local-first: the desktop app owns the user workflow, the local backend owns project data and model configuration, and the local Agent owns run state, plans, drafts, memory, and trace data.

## Local Development Baseline

Use the local desktop startup path first:

```bash
make dev-frontend-local
```

This command builds the backend and admin UI, then lets Electron host the local backend at `http://localhost:8766`. After first launch, create the local admin user and open the admin console:

```text
http://localhost:8766/admin
```

Configure provider credentials and enabled models before testing AI generation or Agent workflows.

## Integration Boundaries

- Claude Code integration should operate through explicit local tools, files, and reviewable changes.
- Provider credentials should remain in the Movscript backend model configuration; they should not move into the Agent or Claude Code integration layer.
- Formal project state should be read and written through backend APIs or MCP-shaped desktop endpoints.
- Drafts, traces, and local review artifacts can be stored by the local Agent, but applying them to project state should remain an explicit user action.
- Long-running work should produce resumable run state and trace events, not only conversational text.

## Related Docs

- [Getting started](getting-started.md)
- [Configuration](configuration.md)
- [Architecture](architecture.md)
- [AI providers](ai-providers.md)
- [Troubleshooting](troubleshooting.md)
- [Agent runtime architecture refactor plan](agent-runtime-architecture-refactor-plan.md)
- [Agent context management architecture](agent-prompt-loading-architecture.md)
