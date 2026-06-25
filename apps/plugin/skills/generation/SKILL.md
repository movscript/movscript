---
name: generation
description: Generate MovScript AI source resources and candidates from content units, including image, video, voiceover, music, sound effects, and subtitles; enforce upstream selection gates, inspect reference-shot imitation via frames, and interpret candidate writes.
toolGrants:
  - mcp__movscript__movscript_runtime_status
  - mcp__movscript__system_model_list
  - mcp__movscript__system_generate_content_unit_image
  - mcp__movscript__system_generate_content_unit_image_job_get
  - mcp__movscript__system_generate_image
  - mcp__movscript__system_generate_image_job_get
  - mcp__movscript__system_generate_image_job_get_batch
  - mcp__movscript__system_generate_content_unit_video
  - mcp__movscript__system_generate_content_unit_video_job_get
  - mcp__movscript__system_generate_video
  - mcp__movscript__system_generate_video_job_get
  - mcp__movscript__system_generate_video_job_get_batch
  - mcp__movscript__system_generate_voiceover
  - mcp__movscript__system_generate_music
  - mcp__movscript__system_generate_sfx
  - mcp__movscript__system_generate_subtitle
  - mcp__movscript__system_align_subtitle
  - mcp__movscript__system_translate_subtitle
  - mcp__movscript__generation_audio_job_get
  - mcp__movscript__generation_audio_job_get_batch
  - mcp__movscript__system_focus_get
  - mcp__movscript__system_resource_library_query
  - mcp__movscript__system_resource_image_read
  - mcp__movscript__system_resource_image_transform_to_resource
  - mcp__movscript__system_resource_video_extract_frames
  - mcp__movscript__system_resource_video_probe
  - mcp__movscript__system_resource_video_extract_frame_to_resource
  - mcp__movscript__system_resource_video_extract_frames_to_resources
  - mcp__movscript__system_resource_video_trim_to_resource
  - mcp__movscript__system_resource_video_contact_sheet_to_resource
  - mcp__movscript__system_resource_video_extract_audio_to_resource
  - mcp__movscript__system_resource_image_annotate
  - mcp__movscript__system_resource_upload
  - mcp__movscript__system_shot_library_query
  - mcp__movscript__system_external_resource_source_list
  - mcp__movscript__system_external_resource_search
  - mcp__movscript__domain_get_model
  - mcp__movscript__domain_overview
  - mcp__movscript__domain_query_entities
  - mcp__movscript__domain_query_assets
  - mcp__movscript__domain_query_production_context
  - mcp__movscript__domain_read_project_context_snapshot
  - mcp__movscript__domain_read_scene_moment_edit_plan
  - mcp__movscript__domain_derive_content_unit_artifact
  - mcp__movscript__domain_build_content_unit_backend_prompt
  - mcp__movscript__domain_read_content_unit_runtime_panel
  - mcp__movscript__domain_read_content_unit_generation_prompt
  - mcp__movscript__domain_read_content_unit_dependency_report
  - mcp__movscript__domain_read_content_unit_selection_validity
  - mcp__movscript__domain_update_content_unit_prompt
  - mcp__movscript__domain_append_candidate
  - mcp__movscript__domain_register_raw_resource_as_content_unit_candidate
  - mcp__movscript__domain_create_content_candidate
  - mcp__movscript__domain_create_content_candidate_batch
  - mcp__movscript__domain_create_asset_slot_candidate
  - mcp__movscript__domain_create_keyframe_candidate
  - mcp__movscript__domain_decide_content_unit_candidate
  - mcp__movscript__domain_select_content_unit_candidate
  - mcp__movscript__domain_select_content_unit_candidate_batch
  - mcp__movscript__domain_select_candidate
  - mcp__movscript__domain_update_candidate
  - mcp__movscript__domain_unlock_candidate
  - mcp__movscript__domain_inspect
  - mcp__movscript__domain_review
  - mcp__movscript__domain_interpret
  - mcp__movscript__domain_production_status_summary
  - mcp__movscript__domain_regeneration_plan
---

# Generation

Use this skill when a user asks the provider to generate or plan AI-created source resources through MovScript, including images, videos, voiceover, music, sound effects, and subtitles. If runtime ownership, provider gateway, or model capability availability is unclear, use the `runtime` skill first.

## Agent Surface URLs

- When a generation, prompt, candidate, resource, or impact MCP result includes `surface.kind: "browser_url"` and `surface.url`, include that URL in the user-facing response and tell the user to open it to continue.
- Map the URL to the concrete action: open the prompt page to edit/save the current prompt, open the generation job page to monitor output and candidate write status, open the candidate page to choose `采纳`/`放弃`/`待定`, or open the impact page before accepting stale dependencies.
- A returned URL is a handoff, not a completed user decision. Do not say generation output is accepted, selected, or stale impact is accepted unless the page action happened or the matching domain decision tool was called.
- If multiple surfaces are returned, lead with the primary `surface.url`; mention secondary URLs only when useful for review. Use URLs exactly as returned.

## Concepts

- MovScript MCP may be running as a cloud/external entrypoint, a local daemon-attached session, or a diagnostic/basic session. Generation depends on Data Service model/provider gateway, resource capabilities, Project Service prompt/candidate context, and MCP capability gating; do not require Desktop or cloud auth when `movscript_runtime_status` shows the workflow is available locally.
- Generation tools do not infer project from session, cwd, route, or focus. Pass the intended `projectId`/`project_id` for project-scoped generation.
- User and organization identity are handled by MovScript app/frontend state and the MCP service. Do not pass `userId`, `user_id`, `orgId`, or `org_id` to MCP tools.
- Generation outputs are MovScript resources first. They become effective domain state only when written as backend candidates or selections.
- Voiceover, music, sound effects, subtitle transcription, subtitle alignment, and subtitle translation are generation jobs, but placing, trimming, mixing, burning-in, rendering, packaging, and exporting them are editing jobs.
- `input_resource_ids` and `reference_resource_ids` accept MovScript RawResource IDs, not MCP resource URIs, local paths, or external provider URLs.
- Resource/media transform tools are intentionally business-neutral. Use `*_to_resource` tools to create reusable RawResources for generation inputs, references, review artifacts, or later candidate writes; do not expect these tools to update content units, candidates, or selections by themselves.
- Resource/media transform uploads persist generic derivative metadata (`operation`, `input_resource_ids`, and params) on the created RawResource. Treat this as provenance, not domain acceptance.
- Video/audio editing, stitching, timeline render, HLS packaging, transcode, reframe, subtitle burn-in, audio mixdown, and export import are editing concerns. Use the `editing` skill and `editing_*` tools for product editing; generation tools only create or prepare source resources.
- Content unit prompts may carry project-wide style reference images from `project_standards.custom_rules[key=style_reference_images]`. Treat `style_reference_resource_ids` and `runtime_request.inputs[role=style_reference]` as house-style references for visual consistency; pass them as `reference_resource_ids` whenever the selected image/video model supports reference images.
- Content unit `edit_prompt` supports MovScript prompt refs. Use `{{asset::id}}`, `{{storyboard::id}}`, `{{keyframe::id}}`, `{{scene_moment::id}}`, `{{expression_unit::id}}`, `{{content_unit::id}}`, `{{candidate::id}}`, or `{{resource::123}}` when the prompt should carry semantic dependency/selection semantics. The single-colon form is legacy-compatible, but the double-colon form is preferred in agent-authored prompts.
- Before generation, use semantic prompt refs for selected upstream assets/storyboards/keyframes/content units. Do not write resolved resource numbers in place of semantic refs unless the user is explicitly providing loose RawResource inputs or a direct `{{resource::123}}` ref. Stop before generation if a semantic ref has no adopted/selected upstream candidate. Unless the user explicitly asks to continue as an unstable draft, guide the user to adopt/select one of the existing asset, storyboard, or keyframe candidates first.
- Prompt refs compile through backend decision metadata: `{{asset::id}}` resolves the matching `asset_ref` content unit, `{{storyboard::id}}` resolves the matching `storyboard_ref` content unit, and the selected/adopted candidate resource becomes a resource mention such as `@[resource:123]` (legacy `[[resource::123]]` is also recognized). If the upstream candidate is not selected, stale, or has no resource, prompt build returns blockers and generation must stop unless the user explicitly asks for an unstable draft. Default response: explain which upstream candidate needs adoption/selection and ask the user to choose `采纳` before proceeding.
- Prompt refs are not mandatory for every raw resource. If the task only needs one or more RawResource IDs as loose model inputs or reference images, and does not need MovScript dependency tracking or selected-candidate semantics, pass them directly as `input_resource_ids` / `reference_resource_ids`, or use direct `{{resource::123}}` refs.
- Before project-scoped generation, call `domain_read_project_context_snapshot`. Use its prompt preview, enabled rules, negative rules, aspect ratio, and `style_reference_resource_ids` as the project context harness for generation decisions.
- Do not change project standards during generation just because they are missing or weak. Only call standards write tools when the user explicitly asks to add, remove, or adjust project-wide rules.
- If the conversation cannot finish all requested production work, persist only stable, reusable, project-wide standards that the user has explicitly stated or clearly confirmed into `project_standards`. Do not store transient task notes, job state, resource URLs, or unconfirmed guesses there.
- Content unit artifact bundles contain runtime panel, input version, dependency report, and selection validity. Derive or read these before changing generated content when they are relevant.
- For content-unit image/video generation, first write or update the content unit `edit_prompt` with semantic MovScript refs, then call `domain_build_content_unit_backend_prompt` to compile and inspect `semantic_ref_replacements`, `resource_ids`, and blockers. Only after the compiled prompt has no blocking missing/stale selections should you call `system_generate_content_unit_image` or `system_generate_content_unit_video`. Use MovScript prompt refs for upstream assets/storyboards/keyframes/resources. These tools compile the backend prompt again, submit generation with the resolved `resource_ids`, and automatically create or refresh content candidates when the monitored job succeeds.
- Content-unit image/video generation is candidate generation, not naked provider generation. Treat returned `generation_mode: content_unit_candidate`, `candidate_policy: auto_create_on_success`, `will_auto_select: false`, and `requires_user_adoption: true` as the contract.
- `system_generate_image` and `system_generate_video` remain low-level prompt channels for free generation, debugging, or non-content-unit workflows. Do not use them as the primary path for content-unit outputs.
- Generated content-unit candidates and selections are backend decision metadata, not workspace source-file edits. Content-unit generation tools create candidates automatically on successful job polling; inspect/review and interpret after candidate writes when downstream artifact tools need refreshed decision context.
- `domain_create_content_candidate` is the preferred backend decision path for production outputs anchored to content units. Asset outputs are anchored through `asset_ref` content units, the same candidate/decision mechanism used by scene_moment, keyframe, and storyboard outputs. Inline asset/keyframe candidates are compatibility paths for legacy source-entity candidate workflows.
- Use `domain_register_raw_resource_as_content_unit_candidate` when the RawResource already exists from upload, transform, import, editing export, or low-level generation and should enter the content-unit candidate pool. Use `domain_create_content_candidate` when you need to record a richer manual candidate payload. Only use decision/selection tools when the candidate already exists and the task is to adopt/reject/defer/select it.
- Candidate decision is separate from candidate creation. Use `domain_decide_content_unit_candidate` when the workflow or UI records `adopt`, `reject`, or `defer`; `adopt` makes the candidate the stable selection, while `reject` and `defer` preserve the candidate without making it a dependency.
- Terms: a RawResource is the media/resource body; a candidate is a content-unit candidate record pointing to one or more outputs; a selection is the currently chosen stable candidate/resource; adoption is the user/workflow action that writes selection. Do not use generated, selected, adopted, and candidate as interchangeable words.
- For completed generated content-unit outputs, omit `status` when calling `domain_create_content_candidate` or `domain_create_content_candidate_batch`; the backend defaults it to `succeeded`. If you must pass `status`, use only `queued`, `running`, `succeeded`, `failed`, `canceled`, or `imported`; never use `completed`, `ready`, `done`, `selected`, or `accepted`.
- Do not select a candidate just because generation succeeded. Select only when the user or an explicit workflow asks to use, confirm, choose, lock, or set the output.
- When generation is happening inside the AI conversation UI, make the newly written content-unit candidate available for the decision card by preserving `projectId`, `contentUnitId`, `candidateId`, and `resourceId` on the generated attachment/candidate metadata. The user-facing choices are `采纳`/`放弃`/`待定`, corresponding to `adopt`/`reject`/`defer`.
- Before generation, identify whether the output center is a direct `scene_moment` or an expression-unit material inside a `scene_moment`, then classify it as `缺规划`, `可补图`, `缺选择`, or `可生成`.
- Treat `缺选择` as a hard stop for normal generation. If required asset/keyframe/storyboard candidates exist but none is adopted/selected, do not generate downstream video or keyframes. Summarize the candidate options and recommend that the user click/choose `采纳`; only proceed without adoption when the user explicitly requests an unstable draft despite the risk.
- Default to one direct `scene_moment_ref` video prompt when the scene moment is the requested output. Do not split a scene moment into multiple shots or expression-unit materials unless the target video model is known to support the needed video/reference inputs, the user/workflow has chosen an editing composition path, or the user explicitly asks for a multi-shot breakdown.
- Generation prompts must be production-ready: specify subject identity, setting, action, camera/framing, motion, lighting, style, continuity references, timing, and negative constraints that matter. For narrative scenes, keep the story overview but translate abstract plot language into cast/blocking, visible actions, dialogue, lighting, camera, and audio layers. Do not rely on the model to guess important visual/audio elements. For video prompts, open `references/video-model-prompt-routing.md` after model selection, then open `references/video-prompt-craft.md` and run its prompt pass before writing or updating the content-unit prompt.
- Video prompts should read like scene direction over time, not image descriptions or keyword lists. Distinguish identity/continuity, action timeline, camera/blocking, lighting/color, performance/audio, and negative constraints. For image-to-video, treat the selected image/keyframe as the visual anchor and focus the prompt on what moves, changes, or performs.
- Keep provider-specific reference syntax out of MovScript content-unit prompts unless a provider adapter explicitly requires it. Translate outside examples such as `@image1` / `@video1` / `@audio1` into MovScript semantic refs, direct `{{resource::123}}` refs, or `input_resource_ids` / `reference_resource_ids`.
- If the selected model/provider is Seedance-like, or the user asks for 即梦 / Seedance 2.0 / 图生视频 / 运镜 / 音乐卡点 / 分镜板驱动 / 视频延长, open `references/seedance2-prompt-methods.md` after `references/video-model-prompt-routing.md` and adapt its methods to MovScript refs and candidate semantics. When the video involves a reusable human/face identity, open `references/provider-generated-artifact-trust.md` and require one of the accepted Seedance face-reference paths before downstream video: certified virtual portrait, certified real-person portrait, or a Seedream 5.0 lite text-to-image identity image with valid RawResource `provider_generated_artifact`.
- For Seedance/即梦 private asset-library flows, use `domain_certify_asset_provider` only after the relevant asset image RawResource has a selected/adopted `asset_ref` candidate or the user explicitly names the RawResource to certify. Prefer a concrete Volcengine Ark `provider_id` when known; otherwise omit `provider` and let the backend choose the enabled `volcengine_ark_official` provider. The backend automatically creates or reuses an official Volcengine Ark AIGC asset group, calls `CreateAsset`, and writes `provider_asset_certifications.<provider_id>` onto the RawResource; asset-level certification metadata is only a mirror of how that certified resource is used. MCP calls with project + setting context should certify into that project/setting group, while direct resource-library certification uses the global managed group. This path does not support third-party SilvaMux gateway compatibility. Certification still needs a public image URL, either supplied as `source_url` or generated from the configured public backend URL. Do not confuse asset-library certification with `provider_generated_artifact` trust provenance. If a Seedance video needs a human face reference and no certified portrait or Seedream 5.0 lite identity image exists, stop and create/stabilize that upstream portrait asset first.
- If a concrete reusable film/music entity or state, such as a character, prop, place, instrument, costume, or voice identity, is involved in multiple generation tasks, or the user is dissatisfied with its look or sound, treat it as a continuity asset gate: open `references/continuity-asset-prompts.md`, generate/refine an `asset_ref` content unit first, and wait for adoption/selection before downstream generation. Do not create settings for abstract styles/rules/moods.
- Asset generation should progress from simple to complex. Generate the base identity/shape/state first, then use the selected base candidate as a reference for white-background/clean-background multi-view sheets, state variants, and more specific assets.
- If composition, blocking, camera motion, subject placement, or rhythm matters but is underspecified, treat it as a visual anchor gate: generate storyboard panels/images first, wait for adoption/selection, then generate selected start/end or other keyframes before video.
- Generate only when the requested output's content unit artifacts and needed upstream visual/audio anchors are ready enough for the user's goal. For a low-consistency draft, a direct scene-moment content unit can be enough; for composed output, generate/select expression-unit material content units before editing.
- If a downstream content unit depends on an upstream content unit output, and the upstream output has no selection, stop before generation. Tell the user which asset/keyframe/storyboard/content-unit candidate should be adopted, and ask for a `采纳`/selection decision. Continue without selection only when the user explicitly asks for an unstable draft path.
- If the user asks to mimic a specific shot or reference video, open `references/shot-imitation-workflow.md`; analyze extracted frames and create storyboard panels before downstream video generation.

## Workflow

1. Read workspace context first when the request references project entities, scenes, script passages, keyframes, asset slots, or house style.
2. Use `system_focus_get` for the selected project/production. Call `domain_read_project_context_snapshot`, then use `domain_overview`, `domain_query_production_context`, `domain_query_assets`, and content-unit artifact tools before reading many files.
3. Identify the output center: a direct `scene_moment`, an `expression_unit` material, or an upstream evidence item such as an asset, keyframe, or storyboard.
4. Decide whether the current goal needs strong consistency evidence or a fast draft path. Do not block a simple draft only because optional setting, asset, keyframe, or storyboard references are absent.
5. If continuity assets are required, open `references/continuity-asset-prompts.md` and generate or refine `asset_ref` candidates first. Use selected simpler asset resources as references for more complex asset variants by writing refs such as `{{asset::base_character}}` in the downstream content unit `edit_prompt`, then compile it with `domain_build_content_unit_backend_prompt`. Stop before downstream generation until required asset candidates are adopted/selected and the compiled prompt has no blockers. If candidates already exist, recommend adoption/selection instead of regenerating or moving downstream.
6. If visual anchoring is required and composition is underspecified, generate storyboard panel/image candidates first and stop before keyframe or video generation until the storyboard candidate is adopted/selected. Reference selected storyboard outputs in downstream prompts with `{{storyboard::id}}` rather than raw resource ids. If storyboard or keyframe candidates already exist, guide the user to adopt/select the best one before continuing.
7. Call `system_model_list` before generation unless the user or UI already provided a valid `model_id`. For video generation, open `references/video-model-prompt-routing.md` after model discovery or selection to align prompt structure with model capabilities. If the model/provider or user request is Seedance-like, also open `references/seedance2-prompt-methods.md`.
8. Use `system_resource_library_query` when you need existing MovScript images/videos/text/audio. Only returned `RawResource.ID` values should be passed as `input_resource_ids` or `reference_resource_ids`.
9. When you need to visually inspect an existing image RawResource, call `system_resource_image_read` with its resource ID. When you need to inspect a video RawResource, call `system_resource_video_extract_frames`; use `mode`, `timestamps_sec`, `range`, or `burst` parameters for fine-grained frame selection, and do not request or read the original video blob for vision.
10. When a frame, crop, resized image, contact sheet, trimmed clip, or extracted audio must be reused by generation or written as a candidate, create a RawResource with a neutral transform tool: `system_resource_video_extract_frame_to_resource`, `system_resource_video_extract_frames_to_resources`, `system_resource_image_transform_to_resource`, `system_resource_video_contact_sheet_to_resource`, `system_resource_video_trim_to_resource`, or `system_resource_video_extract_audio_to_resource`.
11. When a generation needs a simple visual instruction layer, call `system_resource_image_annotate` with structured marks. The tool stores the annotated SVG at `artifact_path` and returns metadata only; call `system_resource_upload` with `artifact_path` so the guidance image becomes a RawResource.
12. When selected expression-unit materials must be stitched into a scene-moment or production video, switch to the `editing` skill. Create a `MediaEditingProject` with `editing_project_create_from_edit_plan`, render through `editing_task_render_create`, and only then explicitly import or write a candidate if the user/workflow asks for it.
13. Use `system_shot_library_query` for camera, composition, motion, narrative, emotion, and production-pattern references. Treat shot-library records as prompt guidance unless they also include a usable MovScript RawResource ID.
14. Use `system_external_resource_source_list` and `system_external_resource_search` only for external provider discovery. External results must be imported into MovScript before they can be used as generation resource IDs.
15. For content-unit image requests, prefer supplementing keyframes when the shot is clear but visual anchors are missing; use `system_generate_content_unit_image` after the content unit prompt and references are clear enough. Use `system_generate_image` only for free generation, debugging, or non-content-unit workflows.
16. For asset references, open `references/continuity-asset-prompts.md`; prefer plain white or very clean backgrounds, multi-view/reference-sheet views when useful, and weakly plot-bound images unless the user asks for scene-specific imagery. Use selected base assets as references for more specific asset states or variants.
17. For storyboard or shot-image requests, prefer supplementing storyboard graph/panels when the shot is clear but storyboard assets are missing.
18. For reference-shot imitation, extract frames across the full reference clip, materialize useful reference frames or contact sheets as RawResources when they will condition generation, analyze the shot, create/update shot/storyboard/keyframe structure, create a storyboard-panel or `storyboard_ref` content unit, and require selection before dependent video generation.
19. For content-unit video requests, open `references/video-model-prompt-routing.md` and `references/video-prompt-craft.md`, classify the prompt mode, and write or refine the content-unit `edit_prompt` using semantic refs plus the model/scenario routing prompt pass. Compile it with `domain_build_content_unit_backend_prompt` and inspect blockers before calling generation. Then use `system_generate_content_unit_video` after the focused scene-moment or visual-expression content unit is ready enough. Require selected upstream assets/keyframes/storyboards when continuity or visual anchoring gates were triggered; if blockers show missing adoption/selection, stop and ask the user to adopt/select the upstream candidate. Use `system_generate_video` only for free generation, debugging, or non-content-unit workflows.
20. For voiceover requests, use `system_generate_voiceover`. Pass script text in `prompt`, voice/language controls as explicit params, and selected reference audio only as MovScript `reference_resource_ids` when the model supports it.
21. For music and sound-effect requests, use `system_generate_music` or `system_generate_sfx`. Treat the result as source audio; do not place it on a timeline, mix it, or write it as final domain state until the user/workflow asks.
22. For subtitle requests, use `system_generate_subtitle` for audio/video transcription, `system_align_subtitle` for forced alignment, and `system_translate_subtitle` for translation. Pass source media or subtitle/script RawResource IDs as `input_resource_ids`; do not burn subtitles into video in generation.
23. Pass semantic upstream images/videos/audio/subtitles through content-unit prompt refs when dependency tracking and selected-candidate semantics matter. Compile the content unit with `domain_build_content_unit_backend_prompt` before generation so selected assets/storyboards/keyframes become resolved resource inputs through backend decision metadata. Use explicit `input_resource_ids` / `reference_resource_ids` only for direct raw resources, uploaded guidance, low-level generation, or model-specific controls outside content-unit prompt compilation. Pass project style/reference resources from `domain_read_project_context_snapshot.style_reference_resource_ids` as `reference_resource_ids` when the selected model supports them.
24. Poll content-unit image/video jobs with `system_generate_content_unit_image_job_get` or `system_generate_content_unit_video_job_get` until `terminal` is true; successful terminal polls automatically create or refresh content candidates. Use `verbosity: "summary"` for repeated polling and `verbosity: "debug"` when inspecting prompt/provider details. Poll low-level image/video jobs with the matching `system_generate_*_job_get` tool and audio/subtitle jobs with `generation_audio_job_get`. When tracking multiple low-level jobs, use `system_generate_image_job_get_batch`, `system_generate_video_job_get_batch`, or `generation_audio_job_get_batch` instead of issuing one call per job.
25. Do not manually call `domain_create_content_candidate` after `system_generate_content_unit_image` or `system_generate_content_unit_video`; the content-unit generation monitor owns candidate creation. Use `domain_create_content_candidate` or batch only for transformed/imported/manual outputs or low-level generation jobs that intentionally bypassed the content-unit path.
26. If the user is choosing among generated candidates, use `domain_decide_content_unit_candidate` with `decision: "adopt" | "reject" | "defer"`. Treat `adopt` as selection, `reject` as discarded candidate, and `defer` as unresolved candidate.
27. Use `domain_select_content_unit_candidate` or its batch variant only for legacy/explicit workflows that confirm the candidate should become the chosen output/reference without the richer decision status.
28. Use `domain_create_asset_slot_candidate`, `domain_create_keyframe_candidate`, or inline `domain_append_candidate` only for compatibility/migration source-entity candidate flows. For normal asset generation, create or use an `asset_ref` content unit and write/select candidates through the content-unit candidate tools.
29. Run `domain_inspect` after content candidate/decision/selection writes, then run `domain_interpret` when downstream artifact tools need refreshed backend decision metadata. Use `domain_regeneration_plan` after interpret when the change may stale downstream generated media.

## Notes

- MovScript MCP host must be running for tool calls to execute. It may connect to cloud/external services or attach to the local runtime daemon; if tools report missing runtime, call `movscript_runtime_status` and explain the missing Data/Project/Editing/Media/gateway capability instead of telling the user Desktop or cloud is mandatory.
- Pass `projectId` for generation and candidate/domain writes. MCP must not infer project.
- Prefer `model_id` values returned by `system_model_list`; do not invent provider-specific model identifiers.
- Keep generation prompts grounded in project context, resource-library records, and shot-library references when available.
- Job prompt display may include both `compiled_prompt_text` and `provider_prompt_text`. The provider prompt may strip resource tokens; this is normal when resources are sent through `input_resource_ids`. Use `input_resource_ids` and `semantic_ref_replacements` for prompt debugging.
- In the final answer, briefly report the focused scene_moment/expression-unit readiness and whether the next action is planning, keyframe/storyboard supplementation, candidate generation, edit-plan composition, dependency selection, or candidate selection.
- Do not pass MCP resource URIs or external provider URLs to `input_resource_ids` / `reference_resource_ids`; those fields accept MovScript RawResource IDs.
- Preserve UI review boundaries. Do not treat generated resources as final accepted domain state until the user/workflow records `adopt` or a legacy selection, and `domain_inspect` plus `domain_interpret` refresh the relevant source or backend decision metadata.
- Use `domain_production_status_summary` before broad production review/generation when you need a compact view of settings/assets, storyboards, keyframes, content-unit candidates, selections, stale hints, and blockers.
- Open `references/reference-index.md` when choosing which generation reference files to load. Common routes include `references/model-usage.md` for direct-vs-composed generation decisions, `references/video-model-prompt-routing.md` plus `references/video-prompt-craft.md` for video prompts, `references/seedance2-prompt-methods.md` for Seedance-like requests, `references/provider-generated-artifact-trust.md` for Seedance/Seedream trusted-reference windows, `references/continuity-asset-prompts.md` for reusable assets, `references/candidate-selection-flow.md` for candidate writes/selections, `references/resource-id-rules.md` for mixed resource inputs, and `references/shot-imitation-workflow.md` for reference-shot imitation.
