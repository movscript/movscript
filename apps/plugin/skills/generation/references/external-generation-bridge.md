# External Generation Bridge

Use this reference when the user chooses LibTV or another non-MovScript generation system, but the generated text, image, video, or audio must return into MovScript.

## Contract

- Tool choice comes first. Do not use MovScript generation tools until the user chooses MovScript. If the user chooses LibTV, do not silently fall back to MovScript generation.
- External generation outputs must be imported into MovScript RawResource. An external URL, canvas node, or provider task ID is not enough for downstream MovScript use.
- If the output targets a MovScript content unit such as `scene_moment_ref`, `expression_unit_ref`, `asset_ref`, `storyboard_ref`, `keyframe_ref`, or `audio_cue_ref`, manually register the uploaded RawResource as a content-unit candidate. Do not auto-select it.
- Tool choice is separate from paid video confirmation. If the external system will run video generation, ask for explicit confirmation of that video generation job before triggering the paid run.

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
- Create or update nodes with `libtv node create <name> -t <type> ... --run` or `libtv node <name> ... --run`.
- `libtv node --run` is synchronous: wait for it to exit and read the terminal JSON. Do not add a second polling loop around it.
- Extract generated outputs from returned node data, commonly `data.url`, `data.originalUrl`, `data.poster`, or text content fields depending on node type.

## Import Back to MovScript

For every generated output:

1. Materialize the output into an agent-accessible artifact:
   - Download image/video/audio URLs to local temp files with stable extensions.
   - Save generated text/script output as a UTF-8 `.txt`, `.md`, or `.json` artifact as appropriate.
2. Upload each artifact with `system_resource_upload` or `system_resource_upload_batch`.
3. Pass explicit `mime_type` when the extension is ambiguous or when uploading audio/text, such as `audio/mpeg`, `audio/wav`, `audio/mp4`, `text/plain`, or `application/json`.
4. Preserve provenance in metadata whenever registering a candidate: external system `libtv`, LibTV node name/key, model, prompt snapshot, original URL, and generation settings.

## Manual Candidate Registration

If the LibTV result is meant to satisfy a MovScript scene moment, expression unit, asset, storyboard, keyframe, or audio cue:

1. Ensure the matching content unit exists. If it does not, use planning/domain tools to create the appropriate `scene_moment_ref`, `expression_unit_ref`, `asset_ref`, `storyboard_ref`, `keyframe_ref`, or `audio_cue_ref` content unit first.
2. Register the uploaded RawResource with `domain_register_raw_resource_as_content_unit_candidate`, or `generation_result_register` when using the low-level generation result registration path.
3. Set `outputKind`/`output_kind` to `image`, `video`, `audio`, `text`, or `metadata`.
4. Treat the candidate as imported/manual/external. Do not call selection/adoption tools unless the user explicitly chooses `adopt`/`select`.
5. Run `domain_inspect` and `domain_interpret` when downstream dependencies need refreshed candidate state.

## Do Not

- Do not leave generated LibTV URLs outside MovScript when the user expects MovScript continuity, review, editing, or downstream generation.
- Do not register a scene-moment or expression-unit candidate before uploading the generated artifact as a RawResource.
- Do not claim the result is selected or stable until the user or workflow adopts/selects the candidate.
- Do not run video generation on LibTV merely because the user chose LibTV; still ask for the paid video job confirmation.
