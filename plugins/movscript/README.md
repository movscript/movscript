# MovScript Codex Plugin

Codex-native workspace plugin for MovScript.

This plugin intentionally does not use `@movscript/plugin-sdk`. Codex loads it through:

- `.codex-plugin/plugin.json`
- `skills/workspace/SKILL.md`
- `.mcp.json`

The `.mcp.json` file starts a small Codex stdio bridge at `bin/mcp-stdio-bridge.mjs`. The bridge exposes MovScript tools to Codex and forwards tool calls to the MovScript frontend MCP server over local HTTP. The frontend owns workspace files under `.movscript`, exposes file/model/review tools, and keeps backend apply behind the UI review boundary.

The bridge now exposes these MCP surfaces to Codex:

- MCP resources: `resources/list` and `resources/read` are forwarded to MovScript Desktop when it is running. These are read-only context/catalog entries, not generation input resources.
- Project and script tools: current focus, project list/create, script list, and fuzzy screenplay passage location across script-version files.
- Query tools: creative references, asset slots, production context, MovScript resource-library search, shot-library search, and external media search.
- Vision and guidance tools: `movscript_resource_image_read` returns image RawResources as MCP image content, `movscript_resource_video_extract_frames` extracts video frames with fine-grained sampling, `movscript_resource_image_annotate` creates simple SVG guidance images with structured marks, and `movscript_resource_upload` stores agent-created image artifacts as RawResources for generation.
- Generation tools: `generation_model_list`, `generation_image_generate`, `generation_image_job_get`, `generation_video_generate`, and `generation_video_job_get`.
- Candidate handoff tools: `candidate_asset_slot_attach` and `candidate_keyframe_attach` for attaching generated output resources to reviewable targets.

MovScript uses three separate media concepts in the plugin contract:

- MovScript resource library: persisted internal `RawResource` records for images, videos, text, audio, and files. Use `movscript_resource_library_query`; pass returned `RawResource.ID` values to generation `input_resource_ids` or `reference_resource_ids`.
- Codex vision media: use `movscript_resource_image_read` to inspect image pixels and `movscript_resource_video_extract_frames` to inspect video frames. Do not send original video blobs to Codex for vision; extract frames instead.
- Agent guidance media: use `movscript_resource_image_annotate` for simple marks such as rectangles, arrows, highlights, and text. Upload the returned `artifact_path` with `movscript_resource_upload`; generation tools can then use the returned `resource_id` in `input_resource_ids` or `reference_resource_ids`.
- Shot reference library: searchable shot-reference records for camera, composition, movement, narrative, emotion, and production patterns. Use `movscript_shot_library_query`; these records are prompt/reference guidance, not generic resource-library files.
- External media search: configured providers such as Pexels or Pixabay. Use `movscript_external_resource_source_list` and `movscript_external_resource_search`; results must be imported into MovScript before they become generation-ready `RawResource` IDs.

For `tools/list`, the bridge asks MovScript Desktop for the full dynamic tool list. If Desktop is not reachable during Codex startup, the bridge still advertises a static fallback set for project, script, workspace, query, and image/video generation tools so Codex can discover the intended interface. Actual tool calls still require MovScript Desktop MCP to be reachable.

Codex starts the bridge by itself, but it does not start MovScript Desktop. Start MovScript Desktop first, or otherwise run the frontend MCP server, before using `movscript_workspace` tools, project/script tools, or generation tools.

By default the bridge forwards tool calls to:

```text
http://127.0.0.1:18765/mcp
```

MovScript Desktop also defaults to port `18765`. If that port is occupied and Desktop auto-selects another port, a separately launched Codex process will not discover that dynamic value automatically. For direct Codex use, prefer starting Desktop with `MOVSCRIPT_MCP_PORT=18765`, or launch Codex with `MOVSCRIPT_MCP_ENDPOINT` set to the endpoint printed by Desktop.

## Install locally

From the MovScript repo root:

```bash
pnpm codex:install-plugin
```

The installer links this plugin into the default personal Codex plugin root, writes or updates `~/.agents/plugins/marketplace.json`, enables Codex plugins in `~/.codex/config.toml`, and runs `codex plugin add movscript@personal`.

After installing, restart Codex so plugin-provided MCP servers are loaded during session initialization.
