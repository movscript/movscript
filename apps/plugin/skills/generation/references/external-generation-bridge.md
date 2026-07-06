# External Generation Bridge

Use this reference when the user chooses LibTV or another non-MovScript generation system, but the generated text, image, video, or audio must return into MovScript.

## Contract

- Tool choice comes first. Do not use MovScript generation tools until the user chooses MovScript. If the user chooses LibTV, do not silently fall back to MovScript generation.
- For any MovScript project target, create or update the matching MovScript 内容制作任务 (`content_unit`) and its `edit_prompt` before external generation. The saved prompt is the backup source of truth even when LibTV or another tool executes the job.
- For script-related image or video targets, a confirmed project style baseline is required first. Use a confirmed style prompt saved in `visual_style` or `project_style.custom_rules[key=style_prompt]` when the style is simple and unambiguous. If the style is special, composite, uncommon, subjective, or ambiguous, generate style reference images from the style prompt, have the user choose image(s), then save them to `project_standards.json` under `project_style.custom_rules[key=style_reference_images]` before running external visual generation.
- Every materializable external generation output must be imported into MovScript RawResource before quality judgment. An external URL, canvas node, provider task ID, local temp path, or chat summary is not enough for downstream MovScript use.
- Do not skip Resource import because an output looks bad, is not selected, is exploratory, is temporary, or is only an intermediate draft. Resource persistence comes before creative evaluation.
- Imported external outputs must be discoverable later: give each material a user-readable title, purpose, project placement, status, version/batch index, and provenance when the upload/candidate path supports it.
- If the output targets a MovScript story beat, shot/dialogue/narration/subtitle/sound item, reusable asset, 分镜图, 关键帧, audio cue, subtitle, or style/reference batch, manually register the uploaded RawResource as a generated option for that 内容制作任务. Do not auto-select it.
- Tool choice is separate from generation confirmation. Before any external system runs image, video, audio, text, subtitle, or other generation, summarize the full context and ask for explicit confirmation of that specific generation tool call.

## LibTV Setup

When the user chooses LibTV:

1. Check for a local `libtv` command with `command -v libtv` or `~/.libtv/libtv --help`.
2. If the CLI skill/docs are missing, download the LibTV skill zip. Prefer the activity endpoint's `skill` field when available; otherwise use the user-provided fallback URL: `https://liblibai-web-static.liblib.cloud/cli/1.1.1/libtv-cli-skill.zip`.
3. Unzip the skill into a local skill directory, usually `${CODEX_HOME:-$HOME/.codex}/skills/libtv-cli`, or another explicit cache/skills location already used by the environment.
4. From the unzipped skill directory, run the platform installer:
   - macOS/Linux: `chmod +x scripts/install-libtv-cli.sh && ./scripts/install-libtv-cli.sh`
   - Windows PowerShell: `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` then `.\scripts\install-libtv-cli.ps1`
5. If PATH is not refreshed, call the installed binary by absolute path, such as `~/.libtv/libtv`.

## Login

1. Check login with `libtv account info`.
2. If not logged in, run `libtv login web --open` when a browser is available, or `libtv login web` and show the printed login URL to the user.
3. For phone login, follow LibTV's two-step flow only when the user chooses it: send code with `libtv login phone -p <phone>`, then complete with `libtv login phone -p <phone> -c <code>`.
4. Never ask the user for passwords. Let the user complete browser, phone, or captcha steps.
5. After login, rerun `libtv account info` before generation.

## Generate with LibTV

- Ensure a LibTV workspace/project/canvas is selected or created according to the user's request. LibTV uses workspace as the project container and project as the canvas.
- Use `libtv model search --type text|image|video|audio|script|storyboard` and `libtv model <modelKey>` when model/schema details are needed.
- Build the LibTV node prompt from the saved MovScript `edit_prompt`, resolved references, and confirmed project style baseline. For special/ambiguous styles, pass the selected style reference image(s) as global visual references whenever the external model supports them. Do not let a LibTV node prompt be the only copy of the production brief.
- Create or update nodes with `libtv node create <name> -t <type> ... --run` or `libtv node <name> ... --run`.
- `libtv node --run` is synchronous: wait for it to exit and read the terminal JSON. Do not add a second polling loop around it.
- Extract all generated outputs from returned node data, not just the preferred one. Check fields and arrays such as `data.url`, `data.originalUrl`, `data.poster`, batch variants, preview/poster URLs, text content fields, result JSON, and provider job metadata depending on node type.

## Import Back to MovScript

For every generated output, including weak, rejected-looking, unselected, alternate, preview, or draft outputs:

1. Materialize the output into an agent-accessible artifact:
   - Download image/video/audio URLs to local temp files with stable extensions.
   - Save generated text/script output as a UTF-8 `.txt`, `.md`, or `.json` artifact as appropriate.
   - When no media URL can be downloaded but useful result text/JSON exists, save that text/JSON as a metadata artifact so the attempt remains discoverable.
2. Upload each artifact with `system_resource_upload` or `system_resource_upload_batch`.
3. Pass explicit `mime_type` when the extension is ambiguous or when uploading audio/text, such as `audio/mpeg`, `audio/wav`, `audio/mp4`, `text/plain`, or `application/json`.
4. Preserve discoverability and provenance in Resource or candidate metadata whenever available: title, purpose, placement, status, version/batch index, external system `libtv`, LibTV node name/key, model, prompt snapshot, original URL, provider job id, and generation settings.
5. If an output has no target internal output task yet, still keep the RawResource as an exploratory/project-level resource with a title and provenance rather than leaving it only in the external system.

## Manual Candidate Registration

If the LibTV result is meant to satisfy a MovScript story beat, shot/dialogue/narration/subtitle/sound item, reusable asset, 分镜图, 关键帧, or audio cue:

1. Ensure the matching internal 内容制作任务 exists and its `edit_prompt` is written or updated before the external run. If it does not, use planning/domain tools to create the appropriate `scene_moment_ref`, `expression_unit_ref`, `asset_ref`, `storyboard_ref`, `keyframe_ref`, or `audio_cue_ref` 内容制作任务 first.
2. Register each uploaded RawResource with `domain_register_raw_resource_as_content_unit_candidate`, or `generation_result_register` when using the low-level generation result registration path. Preserve the same title, status, prompt snapshot, source refs, and external-job provenance on the candidate when available.
3. Set `outputKind`/`output_kind` to `image`, `video`, `audio`, `text`, or `metadata`.
4. Treat the candidate as imported/manual/external. Do not call selection/adoption tools unless the user explicitly chooses `adopt`/`select`; use `reject` or `defer` only as candidate decisions, not as Resource deletion.
5. Run `domain_inspect` and `domain_interpret` when downstream dependencies need refreshed candidate state.

## Do Not

- Do not leave generated LibTV URLs outside MovScript when the user expects MovScript continuity, review, editing, or downstream generation.
- Do not leave generated assets only in chat, local temp paths, provider pages, or LibTV canvas nodes when they can be materialized into MovScript Resources.
- Do not skip importing a result because it appears low quality, redundant, unselected, or only a draft.
- Do not run LibTV or another external generator for MovScript project content before the matching 内容制作任务 `edit_prompt` exists.
- Do not run script-related visual generation before a confirmed style prompt for simple styles or confirmed style reference images for special/ambiguous styles are saved in project standards.
- Do not register a story-beat or concrete shot/voice/subtitle/sound candidate before uploading the generated artifact as a RawResource.
- Do not claim the result is selected or stable until the user or workflow adopts/selects the candidate.
- Do not run generation on LibTV merely because the user chose LibTV; still summarize the full context and ask for explicit confirmation before triggering the job.
