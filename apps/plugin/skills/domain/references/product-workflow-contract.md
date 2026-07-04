# MovScript Product And Agent Workflow Contract

Use this reference when deciding MovScript product boundaries, agent routing, external generation handoffs, or why a request must go through Resource, Candidate, Selection, and impact review instead of direct provider calls.

## Core Positioning

MovScript is the story-state and production-control plane for AI video creation. It is not only a generator. It organizes project context, production structure, timeline namespaces, story graph entities, resources, generated options, adopted choices, semantic prompt dependencies, and downstream impact.

Image, video, text, and audio generation may be executed by MovScript's model gateway, provider adapters, LibTV, user uploads, or another external tool. If an output enters a MovScript-managed workflow, it must return as a MovScript Resource and, when it satisfies a production target, a Candidate with an explicit Selection/Adoption gate.

## Non-Pluggable Core

- **Project / production / timeline namespace**: MovScript manages durable creative workspaces, not isolated provider jobs. New work should preserve the user's creative structure with path-first timeline namespaces rather than forcing legacy `production -> segment` language.
- **Domain story graph**: `script`, `scene_moment`, `expression_unit`, `content_unit`, `setting`, `setting_state`, and `asset` are the story-state layer. Agents must translate user intent into shootable story structure and model-readable production briefs.
- **Resource**: all uploaded files, generated images/videos/audio, extracted frames, subtitles, clips, and external tool outputs must become MovScript RawResources before later generation, review, editing, or export references them.
- **Candidate / Selection / Adoption**: RawResource is only the media body. Candidate is an option for a content unit. Selection is the current stable choice. Adoption is the explicit user/workflow act that makes an option stable.
- **Semantic refs and impact review**: authored prompts should use refs such as `{{asset::id}}`, `{{storyboard::id}}`, `{{keyframe::id}}`, `{{scene_moment::id}}`, `{{expression_unit::id}}`, `{{content_unit::id}}`, or `{{resource::123}}`. Prompt compilation resolves selected resources. Missing, stale, or unselected upstream candidates block stable downstream generation unless the user explicitly chooses an unstable draft path.

## Pluggable Execution

Generation executors, provider/model routing, external resource search, provider asset libraries, editing engines, renderers, storage backends, and UI surfaces may be replaced or extended. Their outputs still have to respect the MovScript product semantics above.

Do not treat provider-internal state, temporary URLs, external canvas nodes, or successful generation jobs as final MovScript project state.

## Agent Routing

| User intent | Use | Avoid |
| --- | --- | --- |
| Create, open, or locate a project | `project`, Project Service, runtime status | Inferring write targets from UI focus |
| Define work structure, chapters, scenes, or beats | `planning` + `domain` | Direct media generation |
| Organize script, shots, expression material, or continuity | `planning` / `domain` | Passing user prose directly as final prompts |
| Upload/import images, video, audio, text, or subtitles | `generation` resource tools | Storing raw local paths or provider URLs in domain JSON |
| Generate with MovScript | `generation` | Skipping prompt compilation, dependency checks, or paid video confirmation |
| Generate with LibTV or another external system | External tool + MovScript resource/candidate bridge | Silent fallback to MovScript or leaving outputs outside MovScript |
| Compare, adopt, reject, defer, or select options | `domain` candidate decision tools | Auto-selecting the newest generated output |
| Edit, assemble, render, or export | `production-editing`, `editing`, `system_edit`, `remotion` | Using generation tools for timeline editing |
| Review stale downstream impact | `domain_inspect`, `domain_interpret`, `domain_regeneration_plan` | Auto-regenerating or accepting stale state |

## Standard Story Workflow

1. Resolve the project. Create one only when the user explicitly wants a new project.
2. Resolve or create the production and review scope.
3. Organize timeline namespaces with the user's own creative vocabulary.
4. Build source story state: scripts, scene moments, expression units, and content units.
5. Stabilize reference resources before dependent work: assets, storyboards, keyframes, audio cues, or uploaded RawResources.
6. Write model-understandable production briefs with MovScript semantic refs.
7. Generate, import, or transform outputs through MovScript or an external system.
8. Upload every media output to RawResource.
9. Register target outputs as content-unit candidates.
10. Record user/workflow decisions as `adopt`, `reject`, or `defer`; do not auto-adopt.
11. Run inspect/interpret/regeneration review when source, candidates, or selections can affect downstream work.
12. Move to editing/preview/render/export only when required story structure and selected materials are stable enough.

## External Generation Bridge

Use an external executor such as LibTV only after tool choice is explicit. Before running it:

1. Identify the target project, production/timeline namespace, and content unit.
2. Read selected story context, candidate decisions, and resource IDs.
3. Translate MovScript semantic refs into external tool inputs such as image, video, audio, text, storyboard, or prompt nodes.
4. Write an external-tool prompt as a production brief, not a MovScript shorthand.
5. Ask for confirmation before paid video execution.

After it runs:

1. Download or materialize the output as an agent-accessible artifact.
2. Upload it as a MovScript RawResource.
3. Register it with `domain_register_raw_resource_as_content_unit_candidate` or the appropriate candidate creation path.
4. Ask the user/workflow to `adopt`, `reject`, or `defer`.
5. Run inspect/interpret/regeneration review when the decision affects downstream dependencies.

## Agent Responsibilities

- Maintain story structure and review boundaries.
- Convert scripts and ideas into scene beats, expression material, output tasks, and stable references.
- Decide which references must be selected before downstream generation.
- Write prompts that are visible/audible, model-understandable, and explicit about resources and constraints.
- Route cleanly between MovScript generation and external systems.
- Bring all outputs back to Resource and Candidate state.
- Never confuse generated, candidate, selected, and adopted.
