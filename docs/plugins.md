# Plugins

[简体中文](plugins.zh-CN.md)

Movscript supports local plugins for extending the desktop production workspace. Plugin contracts are still early and may change before a stable release.

## Main Areas

| Area | Path |
| --- | --- |
| Plugin SDK | `packages/plugin-sdk` |
| CLI tooling | `apps/movcli` |
| Backend manifest import | `apps/backend/internal/infra/pluginkit` |
| Frontend plugin surfaces | `apps/frontend/src/pages/plugins` and `apps/frontend/src/lib` |
| First-party examples | `plugins/` |

## Example Plugin

The first-party image generator plugin lives at:

```text
plugins/image-generator
```

Use first-party examples as the starting point for manifest shape, package scripts, and runtime expectations.

## Development Workflow

```bash
pnpm install
pnpm --filter @movscript/plugin-sdk build
pnpm run build:plugins
make dev-movcli
```

Use `apps/movcli` for plugin packaging and smoke tests as the CLI matures.

## Plugin Documentation Expectations

When changing plugin support, document:

- Manifest fields and compatibility expectations.
- Required package metadata.
- Runtime permissions or host capabilities.
- How the plugin appears in the desktop UI.
- Packaging and validation commands.
- Known unstable or experimental fields.

## Stability

Plugin manifests and runtime contracts are not stable yet. Mark experimental capabilities clearly in plugin examples and release notes.
