# MovScript Provider Plugin

Provider-native workspace plugin bundle for MovScript.

MovScript keeps a provider-neutral manifest and a Codex-compatible plugin manifest for providers that read that shape directly:

- `.provider-plugin/plugin.json`
- Codex-compatible manifest at `.codex-plugin/plugin.json`
- `skills/domain/SKILL.md`
- `skills/project/SKILL.md`
- `skills/planning/SKILL.md`
- `skills/editing/SKILL.md`
- `skills/generation/SKILL.md`
- `skills/review/SKILL.md`
- compatibility guidance at `skills/workspace/SKILL.md`
- `.mcp.json`

The `.mcp.json` file starts a small provider stdio bridge through `bin/mcp-stdio-bridge`, which locates Node.js and then runs `bin/mcp-stdio-bridge.mjs`. The MCP server key is `movscript`, so provider tool grants use names such as `mcp__movscript__domain_interpret`. The bridge exposes MovScript tools to provider SDK runtimes and forwards tool calls to the MovScript core MCP server over local HTTP. MovScript keeps business source files in the project Git workspace; `.interpret/` is interpreter debug output, not product state.

Inside a MovScript project workspace, the selected local folder is the project repo root. `.movscript/manifest.json` is the local control contract. Agent/UI edits target source paths such as `project.json`, `project_standards.json`, `settings/**`, `scripts/**`, `content_units/**`, and `productions/**`. Agents should use domain query/read tools for derived context rather than reading interpreter debug files. Provider config/cache/run/session indexes live under `.movscript/providers/{profile}`.

The bridge exposes these MCP surfaces to provider runtimes:

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

The selected provider runtime starts the bridge by itself, but it does not start MovScript Desktop. Start MovScript Desktop first, or otherwise run the core MCP server, before using workspace, project/script, or generation tools.

By default the bridge forwards tool calls to:

```text
http://127.0.0.1:18765/mcp
```

MovScript Desktop also defaults to port `18765`. If that port is occupied and Desktop auto-selects another port, a separately launched provider process will not discover that dynamic value automatically. For direct provider use, prefer starting Desktop with `MOVSCRIPT_MCP_PORT=18765`, or launch the provider with `MOVSCRIPT_MCP_ENDPOINT` set to the endpoint printed by Desktop.

## Runtime and skills

From the MovScript repo root:

```bash
pnpm prepare:sdk-runtimes
pnpm smoke:sdk-runtimes
```

Project skills are materialized into the current workspace's provider-native folders:

- Codex: `.codex/skills`
- Mova: `.mova/skills`
- Claude: `.claude/skills`

Global skills stay under the matching provider home, such as `~/.codex/skills`, `~/.mova/skills`, or `~/.claude/skills`. The neutral `.agents` area may track manifests, source records, catalogs, and locks, but it is not a runtime skill directory.
