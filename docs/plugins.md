# Plugins

Movscript has two plugin-related layers:

- Backend plugin manifests: stored in the database and exposed as tool/card/canvas-node catalogs.
- Frontend/plugin runtime surfaces: pages and helpers that render plugin tools and invoke platform APIs.

The current implementation is still evolving. Treat plugin manifest contracts as pre-stable.

## Backend Manifest Format

The backend plugin parser lives in `apps/backend/internal/pluginkit`.

Minimal manifest:

```json
{
  "schema": "movscript.plugin.v1",
  "id": "com.example.scene-helper",
  "name": "Scene Helper",
  "version": "0.1.0",
  "description": "Adds a scene planning tool.",
  "permissions": ["project.read"],
  "contributes": {
    "tools": [
      {
        "id": "outline",
        "title": "Create Scene Outline",
        "description": "Create a draft outline from scene inputs.",
        "inputSchema": {
          "type": "object",
          "properties": {
            "scene_id": { "type": "number", "title": "Scene ID" }
          },
          "required": ["scene_id"]
        },
        "runtime": {
          "kind": "http",
          "endpoint": "http://127.0.0.1:39000/tools/outline",
          "method": "POST",
          "timeout": 30
        }
      }
    ],
    "cards": [
      {
        "id": "outline-card",
        "title": "Scene Outline",
        "tool": "outline"
      }
    ],
    "canvasNodes": [
      {
        "type": "com.example.scene-helper.outline",
        "title": "Scene Outline",
        "tool": "outline",
        "category": "writing"
      }
    ]
  }
}
```

Validation rules include:

- `id`, `name`, and `version` are required.
- `id` cannot contain whitespace or path separators.
- Tool IDs must be unique within a manifest.
- Cards and canvas nodes that reference tools must reference tools declared in the same manifest.

## Import API

Use:

```http
POST /api/v1/plugins
```

Request body options:

```json
{
  "manifest": {
    "schema": "movscript.plugin.v1",
    "id": "com.example.scene-helper",
    "name": "Scene Helper",
    "version": "0.1.0",
    "contributes": {}
  },
  "source": "manifest",
  "trusted": false,
  "enabled": true
}
```

Or, when the backend process can read a local path:

```json
{
  "path": "/absolute/path/to/plugin/folder",
  "source": "local_path",
  "trusted": true,
  "enabled": true
}
```

Path imports search for `movplugin.json` or `plugin.json`. Zip imports currently recognize `.zip` and `.movplugin` files when read from a backend-local path.

## Catalog APIs

Enabled plugin contributions are exposed through:

```text
GET /api/v1/plugins/tools
GET /api/v1/plugins/cards
GET /api/v1/plugins/canvas-nodes
```

Registry proxy endpoints:

```text
GET /api/v1/registry/plugins
GET /api/v1/registry/plugins/:id
```

The proxy base URL defaults to `https://registry.movscript.com` and can be overridden with `PLUGIN_REGISTRY_URL`.

## CLI Status

`apps/movcli` can scaffold and build plugin projects:

```bash
pnpm --filter movcli dev -- init my-plugin
pnpm --filter movcli dev -- build --cwd ./my-plugin
```

The CLI currently builds `.movpkg` archives containing `bundle.js`, `manifest.json`, optional `ui.js`, and assets. Its install command posts to `/api/v1/plugins/upload`, but the backend currently exposes `/api/v1/plugins` for JSON/path imports and does not register `/plugins/upload`. Until that route is implemented, use the JSON/path import API or the frontend pages that target the implemented backend routes.

## Frontend Runtime Notes

Frontend plugin-related code lives primarily in:

- `apps/frontend/src/pages/plugins/`
- `apps/frontend/src/lib/clientPlugins.ts`
- `apps/frontend/src/lib/pluginMarketplace.ts`
- `apps/frontend/src/lib/usePluginBridge.ts`
- `packages/plugin-sdk/`

Older client-plugin types (`movscript.clientPlugin.v1` and `movscript.clientPlugin.v2`) still exist in the SDK for frontend/runtime experimentation. The backend manifest format described above is the source of truth for persisted plugin catalog data.
