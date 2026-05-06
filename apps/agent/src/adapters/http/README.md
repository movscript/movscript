# HTTP Adapter

`src/server.ts` is currently the HTTP composition root and starts a server as a module side effect. Do not import it from a barrel file.

When this adapter is migrated, split server creation from server startup first:

- `createAgentHttpServer(deps)` should live here and return a Node HTTP server.
- `src/server.ts` should become the executable entrypoint that wires dependencies and calls `listen`.
