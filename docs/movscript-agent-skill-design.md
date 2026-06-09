# MovScript Agent Skill Design

## Purpose

This document defines how MovScript agent skills should be organized around
`movscript-lang` semantics.

The goal is not to teach an agent general film theory. The goal is to make an
agent operate correctly inside MovScript:

- read the current project state before editing
- edit canonical source entities through domain APIs when possible
- use `inspect` / `review` to understand pending source changes
- use `compile` as a semantic checkpoint after each coherent editing step
- use content unit artifacts and regeneration planning to reason about stale
  downstream outputs
- preserve user review boundaries for generated, uploaded, or shot candidates

## Current Language Model

`movscript-lang` already defines the main production concepts:

- `setting`: reusable character, location, prop, world rule, or style fact
- `setting_state`: contextual variant of a setting, such as rain, anger, damage,
  broken, wounded, or aged
- `asset`: setting-owned or setting-state-owned resource slot
- `production`: makeable video unit, such as one episode or one film
- `segment`: rhythm or dramatic section inside a production
- `scene_moment`: narrative event or beat inside a segment
- `storyboard`: planning-only cinematic expression of a scene moment, including
  shot plans, setting refs, blocking, camera, lighting, performance, coverage,
  continuity, and panels
- `expression_unit`: semantic expression inside a scene moment, such as dialogue,
  action, narration, caption, subtitle, or visual note
- `audio_cue`: independent sound, music, ambience, dialogue, or foley planning
  object
- `content_unit`: project-level stable production task or producible output slot
- `candidate`: one possible runtime result for an asset, keyframe, or content unit
- `selection`: the chosen candidate or resource for a target

Mapping from product language to current `movscript-lang` names:

| Product term | Current language entity |
| --- | --- |
| 设定 | `setting` |
| 设定状态 | `setting_state` |
| 资产 | `asset` |
| 制作 | `production` |
| 段 | `segment` |
| 情节 | `scene_moment` |
| 表达单元 | `expression_unit` |
| 分镜 / 分镜脚本 | `storyboard`, especially `shot_plans` |
| 内容单元 | `content_unit` |
| 候选 | `candidate` |
| 选择 / 确认 | `selection` or inline `lock` |

Skill instructions should use the current language entity names when calling
tools or editing files. They may mention the Chinese product term only as a
human-facing alias.

## Source, Build, And Checkpoint Model

MovScript separates editable source from compiled current state.

- Source files live under paths such as `project.json`, `project_standards.json`,
  `settings/**`, `scripts/**`, `productions/**`, and `content_units/**`.
- `.build/current` is the last successful compiled source baseline.
- `.build/indexes`, `.build/manifests`, `.build/reviews`, preview timelines, and
  content unit artifacts are deterministic compiler outputs.
- Agents must not edit `.build/**` directly.

`inspect` / `review` and `compile` have different roles:

- `inspect` / `review`: read-only diagnostics. They compare current source with
  the last successful compile and report pending file/entity/business changes and
  issues.
- `compile`: accepts current source as the next stable semantic baseline and
  writes deterministic build artifacts.
- `regeneration_plan`: after compile, reports downstream content units, prompt
  bundles, selected outputs, or preview timelines that may need review or
  regeneration.

Therefore `compile` is an agent checkpoint, not final rendering.

Agent skills should state this rule:

```text
After each coherent semantic editing step, run inspect/review, fix blocking
issues, then compile. Treat compile as the checkpoint that makes the step
available for later review and as the baseline for the next step.
```

Do not compile after every single field edit. Compile after a meaningful unit of
work, for example:

- creating a setting and its first asset slots
- creating a setting state and its state-specific assets
- creating a production, segment, and scene moment
- creating a storyboard with shot plans and expression units
- creating a content unit that references existing planning context
- writing or selecting a candidate
- updating an upstream reference that may stale generated outputs

Without compile, later inspect/review output becomes a cumulative diff from an
older baseline. That makes it harder for the agent and user to understand which
step introduced which change.

## Proposed Skill Set

The current plugin already has these skills:

- `project`
- `workspace`
- `domain`
- `generation`

The next version should keep the skill set small and avoid duplicating the full
language schema in every skill.

Recommended structure:

```text
plugins/movscript/skills/
  project/SKILL.md
  domain/SKILL.md
  planning/SKILL.md
  generation/SKILL.md
  review/SKILL.md
```

`workspace` should remain only as a compatibility skill and should point agents
to `domain`.

### project

Use when the user asks to identify the current project, create a project, inspect
project context, or read scripts.

Responsibilities:

- resolve focus with `system_focus_get`
- pass explicit `projectId` to project-scoped tools
- avoid creating a project unless explicitly requested
- distinguish source from compiled state
- use `domain_overview` before deeper project work

This skill should stay short.

### domain

Use when the user asks to inspect, change, compile, or reason about MovScript
domain entities.

Responsibilities:

- explain source vs `.build/current`
- list allowed source roots
- prefer structured `domain_*` APIs over direct file edits
- require `domain_get_model` before direct entity editing
- run inspect/review after source changes
- compile after each coherent semantic editing step
- run regeneration planning when upstream references, candidates, selections, or
  generated outputs may be affected

This is the base operational skill. It should not contain long creative
workflows.

### planning

Use when the user asks to plan creative structure, define settings, build
productions, break scripts into segments, create scene moments, expression units,
storyboards, shot plans, or content units.

Responsibilities:

- map user language to current MovScript entity names
- create or update canonical upstream entities before downstream content units
- keep content units as project-level production tasks with flat refs
- avoid treating storyboard containment as content unit ownership
- use the compile checkpoint loop while building the plan step by step

Recommended planning order:

```text
project standards
-> settings
-> setting states
-> asset slots
-> production
-> segments
-> scene moments
-> expression units / audio cues
-> storyboards / shot plans
-> content units
-> candidates / selections
```

This is not a rigid order. The agent can start from any user-provided material,
but should normalize the result into this dependency direction.

### generation

Use when the user asks to generate, plan generation, write candidates, select
outputs, or use resources as references.

Responsibilities:

- read relevant content unit artifacts before generation
- use resource IDs, not URLs or local paths, for generation inputs
- generate resources first, then write them as candidates or selections
- preserve the distinction between generated resource, candidate, selected
  candidate, and compiled stable state
- inspect/review and compile after candidate or selection writes
- run regeneration planning when selected outputs may be stale

The existing `generation` skill already covers most of this. It should stay
focused on generation and avoid owning general planning semantics.

### review

Use when the user asks what changed, what may be stale, whether the project is
ready, what needs regeneration, or why a content unit changed.

Responsibilities:

- call `domain_overview` first for current build status
- call `domain_inspect` or `domain_review` for pending source changes
- read content unit `dependency_report`, `input_version`,
  `selection_validity`, and `runtime_panel` when explaining content unit effects
- call `domain_regeneration_plan` after compile when downstream output review is
  needed
- explain "affected" separately from "must regenerate"

Important rule:

```text
Affected does not mean regenerate. Affected means review the downstream content
unit and choose one action: keep, relink, re-prompt, regenerate, re-shoot,
deprecate, or accept stale.
```

## Agent Workflows

### Orienting

Use this before any non-trivial domain work:

```text
1. system_focus_get, if current project/production/entity matters.
2. domain_overview with projectId.
3. domain_query_* for focused context.
4. domain_read_* artifact tools when generated content or stale state matters.
```

### Editing Domain Source

```text
1. Identify the target entity kind and intended semantic step.
2. Read existing context.
3. Call domain_get_model for the entity kind when editing structure.
4. Prefer domain write APIs.
5. Use direct source edits only when no structured API covers the field.
6. Run domain_inspect or domain_review.
7. Fix blocking issues.
8. Run domain_compile.
9. Summarize the checkpoint and relevant impact/regeneration state.
```

### Planning A Production

```text
1. Establish project standards and key settings.
2. Add setting states and asset slots needed for continuity.
3. Create production and segment structure.
4. Create scene moments as narrative events.
5. Add expression units and audio cues under scene moments.
6. Add storyboards and shot plans for cinematic expression.
7. Add content units for desired outputs.
8. Compile after each coherent step.
9. Generate or select candidates only after content unit artifacts are ready.
```

### Creating A Content Unit

```text
1. Confirm what output is needed: keyframe, asset reference, storyboard video,
   scene video, blocking diagram, storyboard panel, audio, text, metadata, or
   another production slot.
2. Use an existing `content_unit_type` when possible.
3. Reference upstream entities with flat refs.
4. Run inspect/review.
5. Compile.
6. Read the new content unit runtime panel, input version, dependency report,
   and selection validity before generation.
```

Current implemented content unit types are limited. The skill must not invent a
new `content_unit_type` unless the language schema and compiler adapter support
it.

### Writing Candidates And Selections

```text
1. Generate, upload, import, or record the runtime resource.
2. Write the resource as a candidate on the correct target.
3. Select the candidate only when the user or workflow confirms it should become
   the chosen output/reference.
4. Store accepted input hash when selecting content unit candidates.
5. Run inspect/review.
6. Compile.
7. Run regeneration_plan if downstream generated content may reference the
   selected output.
```

Candidates are source changes. They need checkpointing like other domain edits.

## Content Unit Dependency Rules

The skill should teach agents to rely on compiler artifacts, not ad hoc guesses.

For content unit analysis, prefer this order:

1. `domain_read_content_unit_dependency_report`
2. `domain_read_content_unit_input_version`
3. `domain_read_content_unit_selection_validity`
4. `domain_read_content_unit_runtime_panel`
5. `domain_regeneration_plan`

Use dependency reports to explain why a content unit references a setting, state,
asset, scene moment, storyboard, keyframe, expression unit, audio cue, or upstream
selection.

Use input version and selection validity to explain stale selected outputs:

- `current_input_hash`: hash of current compiler inputs
- `accepted_input_hash`: hash accepted when the candidate was selected
- `stale: true`: selected output was accepted against older inputs
- `stale_policy: accept_stale`: stale output may remain selected intentionally

## Boundaries

Skills should not:

- reimplement compiler semantics in prose
- edit `.build/**`
- store resource binaries in domain JSON
- pass local paths, external URLs, or MCP resource URIs as generation resource IDs
- infer project ID from session, route, cwd, user ID, or organization ID
- treat generation output as accepted domain state before candidate/selection write,
  inspect/review, and compile
- force regeneration just because an upstream object changed
- create unsupported `content_unit_type` values

Skills should:

- use `projectId` explicitly
- prefer domain APIs
- compile after coherent semantic steps
- keep planning source and runtime outputs separate
- explain affected downstream content units as review targets

## Recommended SKILL.md Shape

Each `SKILL.md` should stay concise. Put only operating rules and tool workflow
there. Move long examples and terminology tables into references if needed.

Recommended `planning/SKILL.md` outline:

```markdown
---
name: planning
description: Plan MovScript productions, settings, scene moments, storyboards,
  expression units, and content units using domain APIs, inspect/review, compile
  checkpoints, and regeneration awareness.
toolGrants:
  - mcp__movscript__system_focus_get
  - mcp__movscript__domain_overview
  - mcp__movscript__domain_query_entities
  - mcp__movscript__domain_query_settings
  - mcp__movscript__domain_query_assets
  - mcp__movscript__domain_query_production_context
  - mcp__movscript__domain_get_model
  - mcp__movscript__domain_upsert_setting
  - mcp__movscript__domain_upsert_asset
  - mcp__movscript__domain_upsert_content_unit
  - mcp__movscript__domain_update_storyboard_shot_plans
  - mcp__movscript__domain_update_storyboard_timeline
  - mcp__movscript__domain_update_entity_transition
  - mcp__movscript__domain_inspect
  - mcp__movscript__domain_review
  - mcp__movscript__domain_compile
  - mcp__movscript__domain_regeneration_plan
---

# Planning

Use this skill when planning or changing MovScript creative structure.

## Rules

- Use current movscript-lang entity names.
- Treat scene moments as narrative events and storyboards as cinematic planning.
- Treat content units as project-level production slots with flat refs.
- Prefer domain APIs over direct source edits.
- Compile after each coherent semantic editing step.
- Affected downstream content units require review, not automatic regeneration.

## Workflow

1. Resolve focus and overview.
2. Query existing context.
3. Edit one coherent planning step.
4. Inspect/review.
5. Fix issues.
6. Compile.
7. Read regeneration state when relevant.
```

## Implementation Gaps To Track

These are not skill problems, but they affect what skills can truthfully claim:

- `inspect` currently reports pending changes and issues, but full downstream
  affected content unit data is mainly produced through compile impact reports.
  If agents need pre-compile impact prediction, `inspect` should compute an
  inspect-time impact report.
- `content_unit_type` currently supports a small set. Planning skills should not
  advertise keyframe-as-content-unit, blocking diagrams, scene videos, or other
  production slots until schemas and adapters support them.
- Current terminology uses `scene_moment` for 情节. If the product later wants a
  distinct `plot_event`, migration rules and skills must be updated together.
- Current storyboard owns `shot_plans` inline. If individual shots become stable
  addressable entities later, skills must stop treating shot plans as only nested
  storyboard fields.

