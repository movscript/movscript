# Documentation

This directory contains user, operator, developer, API, plugin, UI, and agent documentation for Movscript.

## Start Here

- [Getting started](getting-started.md): local development setup from a fresh clone.
- [Configuration](configuration.md): backend and frontend environment variables.
- [Troubleshooting](troubleshooting.md): common local setup and runtime failures.

## Product and Operations

- [API reference](api.md): route groups exposed by the backend.
- [AI providers](ai-providers.md): provider adapters, model configuration, capabilities, and generation jobs.
- [Model gateway](model-gateway.md): OpenAI-compatible gateway design and current implementation notes.
- [Deployment](deployment.md): Docker Compose backend deployment and desktop frontend build notes.
- [Internationalization](internationalization.md): locale files and translation rules.

## Development

- [Architecture](architecture.md): repository boundaries and runtime flows.
- [Development](development.md): commands, validation, coding conventions, and PR checklist.
- [Plugins](plugins.md): plugin manifest format, backend import behavior, runtime boundary, and CLI notes.

## Agent

- [Agent docs index](agent/README.md)
- [MCP v1 notes](agent/mcp-v1.md)
- [Final agent architecture proposal](agent/final-agent-architecture.md)

## UI

- [UI docs index](ui/README.md)
- [UI package architecture](ui/architecture.md)
- [UI adoption plan](ui/adoption.md)
- [Agent UI](ui/agent-ui.md)

## Maintainer Memory

Long-lived design history and implementation notes live in [`../memory`](../memory/README.md). Files in `memory/` are not the public user manual; they preserve context for maintainers and future planning.
