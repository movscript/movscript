# MovScript App-Server Plugin

App-server workspace plugin for MovScript.

MovScript keeps a provider-neutral manifest and also ships the upstream compatibility manifest required by current app-server providers:

- `.provider-plugin/plugin.json`
- upstream compatibility manifest at `.codex-plugin/plugin.json`
- `skills/workspace/SKILL.md`
- `.mcp.json`

The `.mcp.json` file starts a small app-server stdio bridge at `bin/mcp-stdio-bridge.mjs`. The bridge exposes MovScript tools to app-server providers and forwards tool calls to the MovScript core MCP server over local HTTP. MovScript keeps business files under `.movscript/data`; provider-facing workspace tools operate on workspace namespaces, such as `movscript.project:123`, which map internally to project-level working trees.

Inside a MovScript workspace, the selected local folder is the workspace root and `.movscript/manifest.json` is the root contract. Business projections live under `.movscript/data`: `data/users/{userId}/projects.index.json` lists visible projects for the current user, `data/users/{userId}/projects/{projectId}/project.json` stores project metadata, project-level workspace JSON files store settings/assets/standards, and `scripts/{scriptId}/script.md` stores editable script text. Preview/apply evidence lives under `.movscript/reviews`, sync metadata under `.movscript/sync`, and provider config/cache/run/session indexes under `.movscript/providers/{profile}`. Production projections live under `productions/{productionId}`; unit-scoped content projections include `scene_moments/{sceneMomentId}/content_units/{contentUnitId}`. Sync records mirror projection paths and store content hashes plus the latest dirty, preview, materialized, and conflict state. `.movscript/.mova`, `.movscript/.codex`, and other `.movscript/.{provider}` directories are managed app-server provider homes for compatibility; they are not business workspace roots and must not contain MovScript project, script, production, asset projection files, or workspace-level session indexes.

The bridge now exposes these MCP surfaces to app-server providers:

- MCP resources: `resources/list` and `resources/read` are forwarded to MovScript Desktop when it is running. These are read-only context/catalog entries, not generation input resources.
- Project tools: current focus and project creation. Project/script data should be read from local workspace files after fetching the project namespace.
- Workspace tools: `workspace_fetch`, `workspace_status`, `workspace_review`, and `workspace_submit`. A workspace namespace is a project-level working repository, for example `movscript.project:123`, containing project metadata, references, assets, scripts, productions, and future project-owned business object groups. These MCP tools return Git-canonical handoffs; actual synchronization, review, and submit happen through standard git fetch/status/diff/commit/push.
- Query tools: MovScript resource-library search, shot-library search, and external media search.
- Vision and guidance tools: `movscript_resource_image_read` returns image RawResources as MCP image content, `movscript_resource_video_extract_frames` extracts video frames with fine-grained sampling, `movscript_resource_image_annotate` creates simple SVG guidance images with structured marks, and `movscript_resource_upload` stores provider-created image artifacts as RawResources for generation.
- Generation tools: `generation_model_list`, `generation_image_generate`, `generation_image_job_get`, `generation_video_generate`, and `generation_video_job_get`.

MovScript uses three separate media concepts in the plugin contract:

- MovScript resource library: persisted internal `RawResource` records for images, videos, text, audio, and files. Use `movscript_resource_library_query`; pass returned `RawResource.ID` values to generation `input_resource_ids` or `reference_resource_ids`.
- Provider vision media: use `movscript_resource_image_read` to inspect image pixels and `movscript_resource_video_extract_frames` to inspect video frames. Do not send original video blobs to the provider for vision; extract frames instead.
- Provider guidance media: use `movscript_resource_image_annotate` for simple marks such as rectangles, arrows, highlights, and text. Upload the returned `artifact_path` with `movscript_resource_upload`; generation tools can then use the returned `resource_id` in `input_resource_ids` or `reference_resource_ids`.
- Shot reference library: searchable shot-reference records for camera, composition, movement, narrative, emotion, and production patterns. Use `movscript_shot_library_query`; these records are prompt/reference guidance, not generic resource-library files.
- External media search: configured providers such as Pexels or Pixabay. Use `movscript_external_resource_source_list` and `movscript_external_resource_search`; results must be imported into MovScript before they become generation-ready `RawResource` IDs.

For `tools/list`, the bridge asks MovScript Desktop for the full dynamic tool list. If Desktop is not reachable during provider startup, the bridge still advertises a static fallback set for project, workspace, resource/query, and image/video generation tools so the provider can discover the intended interface. Actual tool calls still require MovScript Desktop MCP to be reachable.

The app-server provider starts the bridge by itself, but it does not start MovScript Desktop. Start MovScript Desktop first, or otherwise run the core MCP server, before using `movscript_workspace` tools, project/script tools, or generation tools.

By default the bridge forwards tool calls to:

```text
http://127.0.0.1:18765/mcp
```

MovScript Desktop also defaults to port `18765`. If that port is occupied and Desktop auto-selects another port, a separately launched provider process will not discover that dynamic value automatically. For direct provider use, prefer starting Desktop with `MOVSCRIPT_MCP_PORT=18765`, or launch the provider with `MOVSCRIPT_MCP_ENDPOINT` set to the endpoint printed by Desktop.

## Install locally

From the MovScript repo root:

```bash
pnpm app-server:install-plugin -- --provider mova
```

The installer links this plugin into the selected provider's personal app-server plugin root, updates that provider's marketplace manifest, enables plugins in the selected provider home, and runs the selected provider CLI `plugin add movscript@personal` unless `--no-add` is passed.

Provider-neutral environment variables are preferred for scripted setup: `MOVSCRIPT_APP_SERVER_PROVIDER`, `MOVSCRIPT_APP_SERVER_HOME`, `MOVSCRIPT_APP_SERVER_BIN`, and `MOVSCRIPT_APP_SERVER_PLUGIN_SOURCE`.

For another app-server provider, pass its provider key, for example `--provider codex`. After installing, restart the provider so plugin-provided MCP servers are loaded during session initialization.

## Verify app-server startup

From the MovScript repo root:

```bash
pnpm --filter @movscript/desktop verify:app-server -- --provider mova
```

The verifier defaults to `--transport stdio`, matching the MovScript-managed desktop launch path and avoiding local port binding requirements. It auto-discovers sibling Mova debug builds named `app-server`, `mova-app-server`, `codex`, plus the transitional upstream app-server binary name; use `--app-server-bin` only when overriding that discovery. The stdio smoke initializes the app-server session, verifies `thread/list`, creates a thread with `thread/start`, and checks that `plugin/list` plus `skills/list` expose the bundled MovScript plugin. Use `--transport websocket` only when explicitly checking an app-server build's local WebSocket listener and `/readyz` endpoint.
