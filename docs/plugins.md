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

## First-Party Plugins

The first-party generator plugins live at:

```text
plugins/image-generator
plugins/video-generator
```

Use first-party examples as the starting point for manifest shape, package scripts, runtime expectations, and canvas node contributions.

The image generator calls `mov.generateMedia()` for `image` and `image_edit` jobs. The video generator calls the same SDK entrypoint for `video` and `video_i2v` jobs. Both plugins should package `contributes.canvasNodes` so they appear as local plugin cards on the canvas after installation.

## Development Workflow

```bash
pnpm install
pnpm --filter @movscript/plugin-sdk build
pnpm run build:plugins
make dev-movcli
```

Use `apps/movcli` for plugin packaging and smoke tests as the CLI matures.

`apps/movcli/registry-example.json` lists the expected registry shape for the first-party image and video generator packages. Registry entries used by `movcli install` must include `package_url`; entries shown by `movcli list` may also include `description` and `manifest_url`.

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
