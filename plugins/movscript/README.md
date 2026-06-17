# MovScript App-Server Plugin

App-server workspace plugin for MovScript.

MovScript keeps a provider-neutral manifest and also ships the upstream compatibility manifest required by current app-server providers:

- `.provider-plugin/plugin.json`
- upstream compatibility manifest at `.codex-plugin/plugin.json`
- `skills/domain/SKILL.md`
- `skills/project/SKILL.md`
- `skills/planning/SKILL.md`
- `skills/editing/SKILL.md`
- `skills/generation/SKILL.md`
- `skills/review/SKILL.md`
- compatibility guidance at `skills/workspace/SKILL.md`
- `.mcp.json`

The `.mcp.json` file starts a small app-server stdio bridge at `bin/mcp-stdio-bridge.mjs`. The MCP server key is `movscript`, so provider tool grants use names such as `mcp__movscript__domain_interpret`. The bridge exposes MovScript tools to app-server providers and forwards tool calls to the MovScript core MCP server over local HTTP. MovScript keeps business source files in the project Git workspace; `.interpret/` is interpreter debug output, not product state.

Inside a MovScript project workspace, the selected local folder is the project repo root. `.movscript/manifest.json` is the local control contract. Agent/UI edits target source paths such as `project.json`, `project_standards.json`, `settings/**`, `scripts/**`, `content_units/**`, and `productions/**`. Agents should use domain query/read tools for derived context rather than reading interpreter debug files. Provider config/cache/run/session indexes live under `.movscript/providers/{profile}`.

The bridge now exposes these MCP surfaces to app-server providers:

- MCP resources: `resources/list` and `resources/read` are forwarded to MovScript Desktop when it is running. These are read-only context/catalog entries, not generation input resources.
- System tools: `system_focus_get`, `system_project_create`, `system_model_list`, `system_generate_image`, `system_generate_video`, audio/subtitle generation, generation job polling, resource-library search, shot-library search, external media search, image/video inspection, annotation, and resource upload.
- Domain tools: `domain_get_model`, `domain_overview`, `domain_query_*`, `domain_read_*`, `domain_upsert_*`, `domain_update_*`, candidate tools, `domain_inspect`, `domain_interpret`, and `domain_regeneration_plan`. Planning upserts cover production, segment, scene_moment, shot, keyframe, storyboard, audio_cue, expression_unit, and content_unit source records. `domain_inspect` diagnoses current source; `domain_interpret` validates source and can refresh diagnostic artifacts; `domain_review` is compatibility-only.
- Editing tools: `editing_project_*`, `editing_timeline_*`, `editing_runtime_capabilities_get`, `editing_task_*`, and `editing_export_*`. These operate on MovScript `MediaEditingProject` data and dispatch local render/HLS/transcode/reframe work to Electron `mediaPipeline`; resource-level media utilities are only for neutral material preparation, not product editing.

MovScript uses three separate media concepts in the plugin contract:

- MovScript resource library: persisted internal `RawResource` records for images, videos, text, audio, and files. Use `system_resource_library_query`; pass returned `RawResource.ID` values to generation `input_resource_ids` or `reference_resource_ids`.
- Provider vision media: use `system_resource_image_read` to inspect image pixels and `system_resource_video_extract_frames` to inspect video frames. Do not send original video blobs to the provider for vision; extract frames instead.
- Provider guidance media: use `system_resource_image_annotate` for simple marks such as rectangles, arrows, highlights, and text. Upload the returned `artifact_path` with `system_resource_upload`; generation tools can then use the returned `resource_id` in `input_resource_ids` or `reference_resource_ids`.
- Shot reference library: searchable shot-reference records for camera, composition, movement, narrative, emotion, and production patterns. Use `system_shot_library_query`; these records are prompt/reference guidance, not generic resource-library files.
- External media search: configured providers such as Pexels or Pixabay. Use `system_external_resource_source_list` and `system_external_resource_search`; results must be imported into MovScript before they become generation-ready `RawResource` IDs.

For `tools/list`, the bridge asks MovScript Desktop for the full dynamic tool list. If Desktop is not reachable during provider startup, the bridge still advertises a static bootstrap tool set for system, domain, resource/query, image/video/audio/subtitle generation, artifact hosting, and editing tools so the provider can discover the intended interface. Actual tool calls still require MovScript Desktop MCP to be reachable.

The static bootstrap set also advertises the dedicated `editing_*` tool family. Runtime task tools still require MovScript Desktop/Electron to be running because `editing_task_*` work is executed by Electron `mediaPipeline`, not by the provider process or backend server.

The app-server provider starts the bridge by itself, but it does not start MovScript Desktop. Start MovScript Desktop first, or otherwise run the core MCP server, before using workspace, project/script, or generation tools.

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
