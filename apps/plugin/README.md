# MovScript Provider Plugin

Provider-native workspace plugin bundle for MovScript.

MovScript keeps a provider-neutral Agent Package manifest, a provider plugin manifest, and a Codex-compatible plugin manifest for providers that read that shape directly:

- `.agent-package/package.json`
- `.provider-plugin/plugin.json`
- Codex-compatible manifest at `.codex-plugin/plugin.json`
- `skills/domain/SKILL.md`
- `skills/project/SKILL.md`
- `skills/planning/SKILL.md`
- `skills/admin/SKILL.md`
- `skills/editing/SKILL.md`
- `skills/timeline/SKILL.md`
- `skills/generation/SKILL.md`
- `skills/review/SKILL.md`
- compatibility guidance at `skills/workspace/SKILL.md`
- `.mcp.json`

The `.mcp.json` file starts the Agent MCP host through `bin/movscript mcp stdio`, which locates Node.js and then runs the bundled `bin/movscript.mjs` product CLI. The MCP server key is `movscript`, so provider tool grants use names such as `mcp__movscript__domain_interpret`. The host detects local/cloud backend availability and proxies business tools to the daemon MCP endpoint when available; it does not require MovScript Desktop to be running. MovScript keeps business source files in the project Git workspace; `.interpret/` is interpreter debug output, not product state.

`.agent-package/package.json` is the canonical install unit. Provider-specific directories are target projections: Codex uses marketplace registration, Claude Code uses an MCP JSON projection, OpenClaw uses an MCP registry projection, and Harness uses a Worker Agent export. All projections point back to the same MovScript Home current bundle.

The same plugin bundle also carries the MovScript command line entrypoint:

```bash
bin/movscript mcp stdio
bin/movscript daemon start
bin/movscript daemon status
bin/movscript daemon stop
bin/movscript admin provider list
bin/movscript system generation prepare --capability image_generation --json
bin/movscript production editing workspace list --production-id pilot --json
bin/movscript production editing workspace open --production-id pilot --workspace-id rough_cut_v1 --json
bin/movscript workspace get-model project --json
```

This CLI is a product surface, not only an MCP launch script. In no-frontend or CI sessions, `bin/movscript ... --json` should be enough to start/inspect the daemon, configure admin systems, use system generation/resource tools, create/open production editing workspaces, and return structured diagnostics. The MCP host wraps the same command runners and includes `debug.cli_argv` so agent calls can be reproduced from a terminal.

Use `bin/movscript daemon start --data-plane cloud --data-service-url <url>` when the daemon should start local Project, Editing, Canvas, Surface, and Media services while reusing a cloud Data Service instead of launching the local Data Service. The daemon gateway exposes the canonical MCP HTTP endpoint at `/v1/mcp` plus `/v1/mcp/health`; `/mcp` is kept only as a compatibility path. `bin/movscript` is the only CLI product command. `bin/movscript-agent-mcp` is now only a compatibility shim for `bin/movscript mcp stdio`, and the older `local-node` / `__movscript_local_node` commands are compatibility aliases for `daemon`.

Inside a MovScript project workspace, the selected local folder is the project repo root. `.movscript/manifest.json` is the local control contract. Agent/UI edits target source paths such as `project.json`, `project_standards.json`, `settings/**`, `scripts/**`, `content_units/**`, and `productions/**`. Agents should use domain query/read tools for derived context rather than reading interpreter debug files. Provider config/cache/run/session indexes live under `.movscript/providers/{profile}`.

The host exposes these MCP surfaces to provider runtimes:

- Runtime tools: `movscript_runtime_status` detects the local runtime daemon, data plane, project source, Desktop enhancement availability, and the discovered `movscript.media.pipeline` endpoint; `movscript_runtime_configure` lets a user explicitly set backend URL or project directory.
- Context tools: `context_current_get` returns the current UI/session hint for route, selected project, production, user, and selection. It is read-only orientation data and does not replace explicit project locators for writes.
- Admin tools: provider/credential, model catalog/import, route binding/diagnose, model gateway key, generation tool settings, ResourceAccessProfile/public tunnel settings, and resource-access `resolve-test`/`check-test` diagnostics. These are admin-only and run through the shared CLI command runner.
- MCP resources: `resources/list` and `resources/read` come from the shared MovScript core MCP resource registry. These are read-only context/catalog entries, not generation input resources.
- System tools: `system_project_create`, `system_model_list`, unified generation tools (`generation_capability_list`, `generation_prepare`, `generation_submit`, `generation_job_get`, `generation_job_get_batch`, `generation_result_register`), artifact/stream tools (`system_artifact_upload_export`, `system_artifact_upload_hls_stream`, `system_artifact_get_stream`), resource-library search, shot-library search, external media search, image/video inspection, annotation, and resource upload.
- Domain tools: `domain_get_model`, `domain_overview`, `domain_query_*`, `domain_read_*`, `domain_upsert_*`, `domain_update_*`, candidate tools, `domain_inspect`, `domain_interpret`, and `domain_regeneration_plan`. Planning upserts cover production, segment, scene_moment, shot, keyframe, storyboard, audio_cue, expression_unit, and content_unit source records. `domain_inspect` diagnoses current source; `domain_interpret` validates source and can refresh diagnostic artifacts; `domain_review` is compatibility-only.
- Production editing tools: `production_editing_resources_refresh`, `production_editing_workspace_list`, `production_editing_workspace_create`, `production_editing_workspace_get`, `production_editing_workspace_open`, and `production_editing_workspace_delete`. These manage only the production-bound workspace lifecycle; once a workspace is opened, agents hand off to `system_edit` for `system_editing` workspaces or `remotion` for Remotion workspaces.
- Editing tools: `editing_project_*`, `editing_timeline_*`, `editing_runtime_capabilities_get`, `editing_task_*`, and `editing_export_*`. Pure project/timeline operations can run in the headless host. Render/HLS/transcode/reframe work is routed toward Electron `mediaPipeline` / daemon-owned `movscript.media.pipeline`; Desktop may provide enhanced preview or bridge capabilities, but it is not the business sidecar owner.

Together these surfaces cover generation, production editing workspace handoff, artifact hosting, and editing tools without treating resource utilities as the product editing path.
The static bootstrap set also advertises the dedicated `editing_*` and `production_editing_*` tool families.

MovScript uses three separate media concepts in the plugin contract:

- MovScript resource library: persisted internal `RawResource` records for images, videos, text, audio, and files. Use `system_resource_library_query`; pass returned `RawResource.ID` values to generation `input_resource_ids` or `reference_resource_ids`.
- resource-level media utilities are only for neutral material preparation, not product editing.
- Provider vision media: use `system_resource_image_read` to inspect image pixels and `system_resource_video_extract_frames` to inspect video frames. Do not send original video blobs to the provider for vision; extract frames instead.
- Provider guidance media: use `system_resource_image_annotate` for simple marks such as rectangles, arrows, highlights, and text. Upload the returned `artifact_path` with `system_resource_upload`; generation tools can then use the returned `resource_id` in `input_resource_ids` or `reference_resource_ids`.
- Shot reference library: searchable shot-reference records for camera, composition, movement, narrative, emotion, and production patterns. Use `system_shot_library_query`; these records are prompt/reference guidance, not generic resource-library files.
- External media search: configured providers such as Pexels or Pixabay. Use `system_external_resource_source_list` and `system_external_resource_search`; results must be imported into MovScript before they become generation-ready `RawResource` IDs.

For `tools/list`, the provider-facing stdio/HTTP host proxies to the daemon MCP endpoint when MovScript Home advertises a local daemon gateway. If daemon MCP is unavailable, it exposes only runtime bootstrap/control tools so the agent can run `runtime_daemon_ensure` and retry. Desktop is treated as an optional enhancement client: when available it can provide UI context, bridge, and preview capabilities, but core project/domain/resource/generation tools should work through the daemon endpoint and the configured local/cloud/external data plane.

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
