# Client Plugin Architecture

Movscript plugins are installed and executed in the frontend. The backend does
not keep a plugin registry, call plugin runtimes, or expose installed plugins to
MCP. Its responsibility is the stable capability surface used by plugins:

- `GET /api/v1/models?capability=image`
- `GET /api/v1/resources`
- `POST /api/v1/resources/upload`
- `POST /api/v1/gen-jobs`
- `GET /api/v1/gen-jobs/:id`

This keeps plugin installation on the user's personal host and avoids making the
shared backend aware of arbitrary plugin code.

## Manifest

Client plugins use a JSON manifest pasted into the Local Plugins page:

```json
{
  "schema": "movscript.clientPlugin.v1",
  "id": "local.ref-image-generator",
  "name": "Local Reference Image",
  "version": "1.0.0",
  "description": "Submit an image generation job from a local script.",
  "permissions": ["model.image.generate", "resource.read"],
  "inputSchema": {
    "type": "object",
    "required": ["prompt"],
    "properties": {
      "prompt": { "type": "string", "title": "Prompt" },
      "reference_resource_ids": { "type": "string", "title": "Reference resource IDs" }
    }
  },
  "script": "async function run(mov, args) { return mov.generateImage({ model_config_id: 1, prompt: args.prompt }) }"
}
```

The script must define `async function run(mov, args)`. The `mov` runtime
object provides:

- `mov.get(path)` and `mov.post(path, body)`
- `mov.models(capability)`
- `mov.resources()`
- `mov.generateImage(request)`
- `mov.sleep(ms)`

## Runtime Boundary

Scripts run in the frontend process and are stored in `localStorage` under
`movscript.clientPlugins.v1`. They can call backend APIs through the same
authenticated Axios client as the rest of the app.

The backend generation flow remains asynchronous: plugins create a generation
job and poll it until it succeeds, fails, is cancelled, or times out.

## Marketplace

The Local Plugins page does not ship built-in marketplace entries. Users can
install custom plugins from a `.movpkg` file or from a URL.
