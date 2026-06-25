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

The `.mcp.json` file starts the Agent MCP host through `bin/movscript-agent-mcp`, which locates Node.js and then runs the bundled `bin/movscript-agent-mcp.mjs` runtime. The MCP server key is `movscript`, so provider tool grants use names such as `mcp__movscript__domain_interpret`. The host exposes MovScript tools directly from the shared core MCP registry, detects local/cloud backend availability, and does not require MovScript Desktop to be running. MovScript keeps business source files in the project Git workspace; `.interpret/` is interpreter debug output, not product state.

The same plugin bundle also carries the MovScript command line entrypoint:

```bash
bin/movscript daemon start
bin/movscript daemon status
bin/movscript daemon stop
```

Use `bin/movscript daemon start --data-plane cloud --data-service-url <url>` when the daemon should start local Project, Editing, Canvas, Surface, and Media services while reusing a cloud Data Service instead of launching the local Data Service. The plugin also ships `bin/movcli` as a compatibility command name for the legacy CLI surface; it is backed by the same plugin bundle. The older `bin/movscript-agent-mcp local-node ...` command is kept as a compatibility alias.

Inside a MovScript project workspace, the selected local folder is the project repo root. `.movscript/manifest.json` is the local control contract. Agent/UI edits target source paths such as `project.json`, `project_standards.json`, `settings/**`, `scripts/**`, `content_units/**`, and `productions/**`. Agents should use domain query/read tools for derived context rather than reading interpreter debug files. Provider config/cache/run/session indexes live under `.movscript/providers/{profile}`.

The host exposes these MCP surfaces to provider runtimes:

- Runtime tools: `movscript_runtime_status` detects the local runtime daemon, data plane, project source, Desktop enhancement availability, and the discovered `movscript.media.pipeline` endpoint; `movscript_runtime_configure` lets a user explicitly set backend URL or project directory.
- MCP resources: `resources/list` and `resources/read` come from the shared MovScript core MCP resource registry. These are read-only context/catalog entries, not generation input resources.
- System tools: `system_focus_get`, `system_project_create`, `system_model_list`, `system_generate_image`, `system_generate_video`, audio/subtitle generation, generation job polling, resource-library search, shot-library search, external media search, image/video inspection, annotation, and resource upload.
- Domain tools: `domain_get_model`, `domain_overview`, `domain_query_*`, `domain_read_*`, `domain_upsert_*`, `domain_update_*`, candidate tools, `domain_inspect`, `domain_interpret`, and `domain_regeneration_plan`. Planning upserts cover production, segment, scene_moment, shot, keyframe, storyboard, audio_cue, expression_unit, and content_unit source records. `domain_inspect` diagnoses current source; `domain_interpret` validates source and can refresh diagnostic artifacts; `domain_review` is compatibility-only.
- Editing tools: `editing_project_*`, `editing_timeline_*`, `editing_runtime_capabilities_get`, `editing_task_*`, and `editing_export_*`. Pure project/timeline operations can run in the headless host. Render/HLS/transcode/reframe work is routed toward daemon-owned `movscript.media.pipeline`; Desktop may provide enhanced preview or bridge capabilities, but it is not the business sidecar owner.

Together these surfaces cover generation, artifact hosting, and editing tools without treating resource utilities as the product editing path.
The static bootstrap set also advertises the dedicated `editing_*` tool family.

MovScript uses three separate media concepts in the plugin contract:

- MovScript resource library: persisted internal `RawResource` records for images, videos, text, audio, and files. Use `system_resource_library_query`; pass returned `RawResource.ID` values to generation `input_resource_ids` or `reference_resource_ids`.
- resource-level media utilities are only for neutral material preparation, not product editing.
- Provider vision media: use `system_resource_image_read` to inspect image pixels and `system_resource_video_extract_frames` to inspect video frames. Do not send original video blobs to the provider for vision; extract frames instead.
- Provider guidance media: use `system_resource_image_annotate` for simple marks such as rectangles, arrows, highlights, and text. Upload the returned `artifact_path` with `system_resource_upload`; generation tools can then use the returned `resource_id` in `input_resource_ids` or `reference_resource_ids`.
- Shot reference library: searchable shot-reference records for camera, composition, movement, narrative, emotion, and production patterns. Use `system_shot_library_query`; these records are prompt/reference guidance, not generic resource-library files.
- External media search: configured providers such as Pexels or Pixabay. Use `system_external_resource_source_list` and `system_external_resource_search`; results must be imported into MovScript before they become generation-ready `RawResource` IDs.

For `tools/list`, the host returns runtime tools plus the shared core MCP tool registry. It does not ask MovScript Desktop for the tool list. Desktop is treated as an optional enhancement client: when available it can provide UI context, focus, bridge, and preview capabilities, but core project/domain/resource/generation tools should work through the headless host against the local daemon and the configured local/cloud/external data plane.

The host starts by detecting available runtime modes. If a local daemon and project source are available, it can work in local mode. If cloud or external Data Service is configured and a local project source is available, the daemon starts local execution services without launching local Data Service. If multiple write targets are available, the Agent should ask the user which target to use rather than silently switching data ownership.

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
