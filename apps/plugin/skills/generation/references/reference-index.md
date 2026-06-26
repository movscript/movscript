# Generation Reference Index

Use this index when deciding which generation reference files to open. Open only the files needed for the current task.

## Core Routing

- `model-usage.md`: decide whether to generate a scene moment directly, split into expression-unit materials, or route through editing.
- `content-unit-prompt-craft.md`: before writing or refining content-unit prompts from scripts, scene notes, or story-heavy wording; convert source text into analyzed production direction instead of copying it.
- `image-prompt-craft.md`: before writing or refining image prompts for storyboard panels, keyframes, asset images, products/props, environment references, non-person scene images, and image edits.
- `video-model-prompt-routing.md`: after model discovery/selection, align video prompt structure with model capabilities.
- `video-prompt-craft.md`: before writing or refining a video prompt, run the director-style prompt pass, including narrative-to-shootable layering for story-heavy scenes.
- `seedance2-prompt-methods.md`: for 即梦 / Seedance-like requests, image-to-video, storyboard-driven prompts, camera codec, aesthetic layer, and AI clip rhythm.
- `provider-generated-artifact-trust.md`: for Seedance/Seedream trusted-reference provenance, effective dates, 30-day validity windows, and tail-frame inheritance rules.

## Continuity and Dependencies

- `continuity-asset-prompts.md`: when stabilizing reusable characters, products, props, places, costumes, material states, instruments, or voice identities.
- `candidate-selection-flow.md`: when writing, registering, adopting, rejecting, deferring, or selecting candidates.
- `resource-id-rules.md`: when a request mixes URLs, local files, MCP resources, uploaded resources, prompt refs, or RawResource IDs.

## Visual Evidence and Imitation

- `shot-imitation-workflow.md`: when mimicking a specific reference video or shot grammar.

## Common Sequences

### Direct Video Draft

1. `model-usage.md`
2. `content-unit-prompt-craft.md` if the prompt is derived from script/story material
3. `video-model-prompt-routing.md`
4. `video-prompt-craft.md`

### Seedance-Like Image-to-Video

1. `model-usage.md`
2. `video-model-prompt-routing.md`
3. `seedance2-prompt-methods.md`
4. `provider-generated-artifact-trust.md` if references must be provider-trusted
5. `video-prompt-craft.md`
6. `resource-id-rules.md` if refs/resources are ambiguous

### Reusable Character/Product First

1. `model-usage.md`
2. `image-prompt-craft.md`
3. `continuity-asset-prompts.md`
4. `candidate-selection-flow.md`
5. `video-prompt-craft.md` for downstream video after asset adoption/selection

### Storyboard or Keyframe Image

1. `model-usage.md`
2. `content-unit-prompt-craft.md` if derived from script/story material
3. `image-prompt-craft.md`
4. `continuity-asset-prompts.md` if selected reusable entities must be referenced

### Reference Shot Imitation

1. `shot-imitation-workflow.md`
2. `continuity-asset-prompts.md` if identity or products must remain stable
3. `video-model-prompt-routing.md`
4. `video-prompt-craft.md`

### Multi-Clip or Long Video

1. `model-usage.md`
2. `seedance2-prompt-methods.md` for Path B/D-style decomposition when relevant
3. `../../planning/references/video-production-paths.md` when the request needs planning before generation
4. `content-unit-prompt-craft.md` for script-to-content-unit prompt conversion
5. `continuity-asset-prompts.md` for reusable assets
6. Switch to the editing skill when clips must be assembled, trimmed, color-matched, subtitled, or exported.
7. In the editing skill, open `../../editing/references/ai-clip-editing-rhythm.md` when the timeline needs rhythm, clip trimming, transition, color/style matching, or AI artifact mitigation guidance.

## Do Not

- Do not open every reference file by default.
- Do not use provider-only placeholder syntax in MovScript content-unit prompts unless a provider adapter explicitly owns that conversion.
- Do not use unselected upstream candidates as stable continuity refs. If asset/storyboard/keyframe candidates exist but are unselected, guide the user to adopt/select one before downstream generation. Continue only when the user explicitly asks for an unstable draft.
- Do not route editing, subtitle burn-in, final stitching, color matching, or export through generation references; use the editing skill.
