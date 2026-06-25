# @movscript/agent-protocol

Browser-safe Agent protocol contracts shared by Desktop, Agent runtime clients, MCP host adapters, and provider integrations.

This package owns provider-session snapshots/events, run/thread/task/trace contracts, provider catalog/model contracts, media artifact contracts, and small pure helper functions. It must not import Desktop UI, Electron, React, MCP transports, or service host implementations.
