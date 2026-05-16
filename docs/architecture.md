# Architecture

Movscript is a local-first desktop workspace built around four applications:

- Desktop frontend: Electron + React for user workflows, project context, and local service startup.
- Go backend: source of truth for projects, resources, users, jobs, model configuration, and generation jobs.
- Admin console: credentials, models, feature routing, users, organizations, resources, and debug views.
- Local Agent: standalone Node service for threads, runs, plans, tool policy, and local drafts.

Runtime boundaries:

- The backend stores formal project data and provider credentials.
- The desktop app owns active UI context and exposes it to the Agent through a local MCP-shaped endpoint.
- The Agent owns local run state, memory, drafts, and trace data.
- The admin console changes system-level configuration through backend APIs.
