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
    ],
    "workflows": [
      {
        "id": "image-flow",
        "title": "Image Generation Flow",
        "workflowKey": "template:image-generation",
        "inputs": [{ "id": "prompt", "type": "text", "required": true }],
        "outputs": [{ "id": "image", "type": "image" }],
        "tags": ["image", "starter"]
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
- Workflow IDs must be unique within a manifest and must provide a stable `workflowKey`.
- Canvas nodes that reference workflows must reference workflows declared in the same manifest.

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
GET /api/v1/plugins/workflows
```

Registry proxy endpoints:

```text
GET /api/v1/registry/plugins
GET /api/v1/registry/plugins/:id
GET /api/v1/registry/workflows
GET /api/v1/registry/workflows/:id
```

The proxy base URL defaults to `https://registry.movscript.com` and can be overridden with `PLUGIN_REGISTRY_URL`.

## Reusable Workflows

The backend exposes reusable workflow templates and a public workflow market:

```text
GET /api/v1/workflows/templates
POST /api/v1/workflows/templates/:key/install
GET /api/v1/workflows/market
GET /api/v1/workflows/by-key/:key
POST /api/v1/workflows/:id/publish
POST /api/v1/workflows/:id/unpublish
POST /api/v1/workflows/:id/clone
```

Built-in workflow keys currently include `template:text-generation`, `template:image-generation`, and `template:input-output`; the install route uses the suffix, for example `POST /api/v1/workflows/templates/image-generation/install`. Installing a template creates a normal private workflow canvas. Publishing an owned workflow sets `visibility` to `public`, assigns or preserves `workflow_key`, and makes it available in `/api/v1/workflows/market` for other users to inspect, reference, or clone.

Plugins can declare workflow dependencies in `contributes.workflows`. A plugin canvas node can reference one of those workflow contribution IDs through its `workflow` field; hosts should resolve the contribution's `workflowKey` through `/api/v1/workflows/by-key/:key` or clone/install it before wiring a canvas reference node.

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

## Canvas Runtime Boundary

Canvas plugin nodes have two supported runtime boundaries:

- `trusted_local`: client-installed plugins run in the Electron/frontend runtime. If they expose a `compile(args)` function that returns a `CanvasExecutableSpec`, the compiled spec is persisted on the canvas node and can later be executed by the backend workflow runner.
- `plugin_http`: backend-installed, trusted plugin tools can be called by the backend workflow runner through `CanvasExecutableSpec.executor = "plugin_http"` and `pluginToolKey`.

`plugin_http` only runs tools from enabled plugins marked `trusted`. The tool must have runtime `{ "kind": "http", "endpoint": "...", "method": "POST" }`. The backend sends tool params, typed port inputs, input resource ids, canvas node id, task id, and user id as JSON.

HTTP plugin responses should prefer:

```json
{
  "outputs": {
    "result": { "type": "text", "text": "plugin output" }
  }
}
```

Scalar output values are accepted and normalized to `CanvasPortValue`. Top-level `result`, `value`, `data`, or `content` are treated as the default `result` output when `outputs` is omitted.
