# Generation Reference Index

Use this index when deciding which generation reference files to open. Open only the files needed for the current task.

## Core Routing

- `external-generation-bridge.md`: when the user chooses LibTV or another external generation system and generated text/image/video/audio must return into MovScript as RawResources and manual candidates.
- `model-usage.md`: decide whether to generate a story beat directly, split into shot/voice/subtitle/sound/music materials, or route through editing.
- `prompt-mode-router.md`: before writing or diagnosing image/video prompts with multiple output modes, reference roles, model families, quality-score checks, or failure symptoms.
- `content-unit-prompt-craft.md`: before writing or refining saved prompts from scripts, scene notes, or story-heavy wording; convert source text into analyzed production direction instead of copying it.
- `image-prompt-craft.md`: before writing or refining image prompts for 分镜图, 关键帧, asset images, products/props, environment references, non-person scene images, and image edits.
- `video-model-prompt-routing.md`: after model discovery/selection, align video prompt structure with model capabilities.
- `video-prompt-craft.md`: before writing or refining a video prompt, run the director-style prompt pass, including narrative-to-shootable layering for story-heavy scenes.
- `seedance2-prompt-methods.md`: for 即梦 / Seedance-like requests, image-to-video, storyboard-driven prompts, camera codec, aesthetic layer, and AI clip rhythm.
- `provider-generated-artifact-trust.md`: for Seedance/Seedream trusted-reference provenance, effective dates, 30-day validity windows, and tail-frame inheritance rules.

## Continuity and Dependencies

- `continuity-asset-prompts.md`: when stabilizing reusable characters, products, props, places, costumes, material states, instruments, or voice identities.
- `candidate-selection-flow.md`: when writing, registering, adopting, rejecting, deferring, or selecting candidates.
- `resource-id-rules.md`: when a request mixes URLs, local files, MCP resources, uploaded resources, prompt refs, or RawResource IDs.
- `../../domain/references/resource-discoverability.md`: when generated/imported/uploaded/rendered artifacts become Resources or candidates and need user-readable names, purpose, status, and provenance.

## Visual Evidence and Imitation

- `shot-imitation-workflow.md`: when mimicking a specific reference video or shot grammar.

## Common Sequences

### Direct Video Draft

1. `model-usage.md`
2. `prompt-mode-router.md`
3. `content-unit-prompt-craft.md` if the prompt is derived from script/story material
4. `video-model-prompt-routing.md`
5. `video-prompt-craft.md`

### External Generation Returning to MovScript

1. `external-generation-bridge.md`
2. `content-unit-prompt-craft.md` / `image-prompt-craft.md` / `video-prompt-craft.md` only when MovScript prompt authoring is still needed.
3. `candidate-selection-flow.md` when uploaded RawResources must become content-unit candidates.

### Seedance-Like Image-to-Video

1. `model-usage.md`
2. `prompt-mode-router.md`
3. `video-model-prompt-routing.md`
4. `seedance2-prompt-methods.md`
5. `provider-generated-artifact-trust.md` if references must be provider-trusted
6. `video-prompt-craft.md`
7. `resource-id-rules.md` if refs/resources are ambiguous

### Reusable Character/Product First

1. `model-usage.md`
2. `prompt-mode-router.md`
3. `image-prompt-craft.md`
4. `continuity-asset-prompts.md`
5. `candidate-selection-flow.md`
6. `video-prompt-craft.md` for downstream video after asset adoption/selection

### Storyboard or Keyframe Image

1. `model-usage.md`
2. `prompt-mode-router.md`
3. `content-unit-prompt-craft.md` if derived from script/story material
4. `image-prompt-craft.md`
5. `continuity-asset-prompts.md` if selected reusable entities must be referenced

### Reference Shot Imitation

1. `shot-imitation-workflow.md`
2. `continuity-asset-prompts.md` if identity or products must remain stable
3. `prompt-mode-router.md`
4. `video-model-prompt-routing.md`
5. `video-prompt-craft.md`

### Multi-Clip or Long Video

1. `model-usage.md`
2. `prompt-mode-router.md`
3. `seedance2-prompt-methods.md` for Path B/D-style decomposition when relevant
4. `../../planning/references/video-production-paths.md` when the request needs planning before generation
5. `content-unit-prompt-craft.md` for script-to-saved prompt conversion
6. `continuity-asset-prompts.md` for reusable assets
7. Switch to the editing skill when clips must be assembled, trimmed, color-matched, subtitled, or exported.
8. In the editing skill, open `../../editing/references/ai-clip-editing-rhythm.md` when the timeline needs rhythm, clip trimming, transition, color/style matching, or AI artifact mitigation guidance.

## Do Not

- Do not open every reference file by default.
- Do not use provider-only placeholder syntax in MovScript saved prompts unless a provider adapter explicitly owns that conversion.
- Do not use unselected upstream candidates as stable continuity refs. If asset/storyboard/keyframe/audio cue candidates exist but are unselected, guide the user to adopt/select one before downstream generation. Continue only when the user explicitly asks for an unstable draft.
- Do not route editing, subtitle burn-in, final stitching, color matching, or export through generation references; use the editing skill.
