# MovScript Product And Agent Workflow Contract

Use this reference when deciding MovScript product boundaries, agent routing, external generation handoffs, or why a request must go through Resource, Candidate, Selection, and impact review instead of direct provider calls.

## Core Positioning

MovScript is the story-state and production-control plane for AI video creation. It is not only a generator. It organizes project context, production structure, story beats, concrete materials, resources, generated options, adopted choices, semantic prompt dependencies, and downstream impact.

Image, video, text, and audio generation may be executed by MovScript's model gateway, provider adapters, LibTV, user uploads, or another external tool. If an output enters a MovScript-managed workflow, every materializable artifact must return as a MovScript Resource before creative quality judgment and, when it satisfies a production target, a generated-option record with an explicit user choice gate.

## Non-Pluggable Core

- **Project / production / timeline namespace**: MovScript manages durable creative workspaces, not isolated provider jobs. New work should preserve the user's creative structure with path-first timeline namespaces rather than forcing legacy `production -> segment` language.
- **Project story graph**: internally, `script`, `scene_moment`, `expression_unit`, `content_unit`, `setting`, `setting_state`, and `asset` are the story-state layer. Agents must translate user intent into concrete production terms: story beats, shots, dialogue voice, narration voice, subtitles, sound/music, 分镜图, 关键帧, reusable references, 内容制作任务, and model-readable production briefs.
- **Resource**: all uploaded files, generated images/videos/audio/text, extracted frames, subtitles, clips, renders, previews, metadata artifacts, and external tool outputs must become MovScript RawResources before later generation, review, editing, or export references them. Do this even for low-quality, unselected, duplicate-looking, exploratory, or intermediate outputs when they can be materialized. Each preserved artifact should carry a discoverable title, purpose, placement, status, version, and provenance when the storage/candidate path supports it.
- **Generated option / Selection / Adoption**: RawResource is only the media/resource body. A candidate is an option for an internal output task. Selection is the current stable choice. Adoption is the explicit user/workflow act that makes an option stable. `reject` and `defer` are generated-option decisions, not deletion or Resource-retention decisions.
- **Semantic refs and impact review**: authored prompts should use refs such as `{{asset::id}}`, `{{storyboard::id}}`, `{{keyframe::id}}`, `{{scene_moment::id}}`, `{{expression_unit::id}}`, `{{content_unit::id}}`, or `{{resource::123}}`. Prompt compilation resolves selected resources. Missing, stale, or unselected upstream candidates block stable downstream generation unless the user explicitly chooses an unstable draft path.

## Pluggable Execution

Generation executors, provider/model routing, external resource search, provider asset libraries, editing engines, renderers, storage backends, and UI surfaces may be replaced or extended. Their outputs still have to respect the MovScript product semantics above.

Do not treat provider-internal state, temporary URLs, external canvas nodes, or successful generation tool calls as final MovScript project state.

## Agent Routing

| User intent | Use | Avoid |
| --- | --- | --- |
| Create, open, or locate a project | `project`, Project Service, runtime status | Inferring write targets from UI focus |
| Define work structure, chapters, scenes, or beats | `planning` + `domain` | Direct media generation |
| Organize script, shots, dialogue/narration, subtitles, sound/music, or continuity | `planning` / `domain` | Passing user prose directly as final prompts |
| Upload/import images, video, audio, text, or subtitles | `generation` resource tools | Storing raw local paths or provider URLs in domain JSON |
| Generate with MovScript | `generation` | Skipping saved prompt backup, prompt compilation, dependency checks, full-context confirmation, or project style gates |
| Generate with LibTV or another external system | External tool + MovScript resource/candidate bridge | Silent fallback to MovScript, provider-only prompts, unconfirmed style refs, or leaving outputs outside MovScript |
| Compare, adopt, reject, defer, or select options | `domain` candidate decision tools | Auto-selecting the newest generated output |
| Edit, assemble, render, or export | `production-editing`, `editing`, `system_edit`, `remotion` | Using generation tools for timeline editing |
| Review stale downstream impact | `domain_inspect`, `domain_interpret`, `domain_regeneration_plan` | Auto-regenerating or accepting stale state |

## Standard Story Workflow

1. Resolve the project. Create one only when the user explicitly wants a new project.
2. Resolve or create the production and review scope.
3. Organize timeline namespaces with the user's own creative vocabulary.
4. Build source story state: scripts, story beats, concrete shot/voice/subtitle/sound items, and internal output tasks.
5. Stabilize style before dependent visual work: use a project style prompt for simple/unambiguous styles; generate style reference images from the prompt and ask the user to choose when the style is special/ambiguous. Then stabilize other reference resources such as assets, 分镜图, 关键帧, audio cues, or uploaded RawResources.
6. Write model-understandable production briefs with MovScript semantic refs and save them in `edit_prompt` before any executor runs.
7. Generate, import, or transform outputs through MovScript or an external system only after full-context user confirmation.
8. Upload every materializable output to RawResource before judging whether it is useful, and name/describe it so the user can find it later.
9. Register target outputs as generated options for their internal output tasks.
10. Record user/workflow decisions as `adopt`, `reject`, or `defer`; do not auto-adopt.
11. Run inspect/interpret/regeneration review when source, candidates, or selections can affect downstream work.
12. Move to editing/preview/render/export only when required story structure and selected materials are stable enough.

## External Generation Bridge

Use an external executor such as LibTV only after tool choice is explicit. Before running it:

1. Identify the target project, production/timeline namespace, and concrete output.
2. Ensure the target 内容制作任务 (`content_unit`) exists and its `edit_prompt` is written or updated as the durable prompt backup.
3. Read selected story context, candidate decisions, resource IDs, project standards, style prompt rules, and `style_reference_resource_ids`.
4. If the task is script-related image/video generation and the project style baseline is missing, use a confirmed reusable style prompt when the style is simple and unambiguous, then save it in `project_standards.json` under `visual_style` or `project_style.custom_rules[key=style_prompt]`. If the style is special, composite, uncommon, subjective, or ambiguous, generate/import a style-reference image batch from the style prompt, let the user choose, and save the selected RawResource IDs under `project_style.custom_rules[key=style_reference_images]`.
5. Translate MovScript semantic refs, confirmed style prompt text, and any confirmed style reference images into every external tool input such as image, video, audio, text, storyboard, or prompt nodes so global style stays consistent.
6. Write the external-tool prompt as a production brief derived from the saved MovScript prompt, not as provider-only shorthand.
7. Summarize the full context and ask for explicit confirmation before any external generation execution.

After it runs:

1. Download or materialize every returned output as an agent-accessible artifact, including low-quality, unselected, alternate, preview, draft, text, and metadata outputs.
2. Upload each artifact as a MovScript RawResource with discoverable title/purpose/status/provenance when supported.
3. Register target artifacts with `domain_register_raw_resource_as_content_unit_candidate` or the appropriate candidate creation path, preserving the same discoverability information on candidate metadata when upload metadata is not available.
4. Ask the user/workflow to `adopt`, `reject`, or `defer`.
5. Run inspect/interpret/regeneration review when the decision affects downstream dependencies.

## Agent Responsibilities

- Maintain story structure and review boundaries.
- Convert scripts and ideas into story beats, concrete shot/voice/subtitle/sound items, 内容制作任务, and stable references.
- Decide which references must be selected before downstream generation.
- Write prompts that are visible/audible, model-understandable, and explicit about resources and constraints.
- Route cleanly between MovScript generation and external systems.
- Bring all materializable outputs back to Resource state, then Candidate state when they target production work.
- Never confuse generated, candidate, selected, and adopted.
