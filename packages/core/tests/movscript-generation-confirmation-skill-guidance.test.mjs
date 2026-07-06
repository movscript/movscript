import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const repoRoot = resolve(import.meta.dirname, '../../..')

function readRepoFile(path) {
  return readFileSync(resolve(repoRoot, path), 'utf8')
}

const mirroredGenerationConfirmationFiles = [
  'generation/SKILL.md',
  'generation/references/candidate-selection-flow.md',
  'generation/references/continuity-asset-prompts.md',
  'generation/references/external-generation-bridge.md',
  'generation/references/image-prompt-craft.md',
  'generation/references/prompt-mode-router.md',
  'generation/references/seedance2-prompt-methods.md',
  'generation/references/video-prompt-craft.md',
  'planning/SKILL.md',
  'planning/references/content-unit-recipes.md',
  'planning/references/planning-workflows.md',
  'planning/references/video-production-paths.md',
]

test('MovScript generation confirmation guidance is mirrored in app and packaged plugin skills', () => {
  for (const file of mirroredGenerationConfirmationFiles) {
    assert.equal(
      readRepoFile(`apps/plugin/skills/${file}`),
      readRepoFile(`plugins/movscript/skills/${file}`),
      `${file} should stay mirrored between apps/plugin and plugins/movscript`,
    )
  }
})

test('generation skill requires full-context confirmation before generation tools execute', () => {
  const generation = readRepoFile('plugins/movscript/skills/generation/SKILL.md')

  assert.match(generation, /## Generation Confirmation Gate/)
  assert.match(generation, /Every generation task, including image, video, voice, music, sound effect, subtitle, storyboard, keyframe, asset-reference, free-scope, and 内容制作任务 generation/)
  assert.match(generation, /full context summary and explicit user confirmation before any `generation_\*` execution tool or external generation system/)
  assert.match(generation, /do not call `generation_prepare`, `generation_submit`, `generation_result_register`, or any external generation trigger/)
  assert.match(generation, /A prior request to "generate" is not enough if the context has not been summarized/)
  assert.match(generation, /Confirmation must happen after the context summary/)
  assert.match(generation, /Read-only discovery and context tools such as `system_model_list`, `generation_capability_list`, domain reads, resource reads, and `domain_build_content_unit_backend_prompt` may run before confirmation/)
  assert.match(generation, /Poll generation tool calls with `generation_job_get` only for calls that were already confirmed and submitted/)

  assert.doesNotMatch(generation, /Image generation is allowed under normal readiness/)
  assert.doesNotMatch(generation, /This restriction applies to video candidates only/)
  assert.doesNotMatch(generation, /video-specific confirmation/)
})

test('planning and generation references do not allow generation before confirmation', () => {
  const planning = readRepoFile('plugins/movscript/skills/planning/SKILL.md')
  const workflows = readRepoFile('plugins/movscript/skills/planning/references/planning-workflows.md')
  const videoPaths = readRepoFile('plugins/movscript/skills/planning/references/video-production-paths.md')
  const recipes = readRepoFile('plugins/movscript/skills/planning/references/content-unit-recipes.md')
  const candidateFlow = readRepoFile('plugins/movscript/skills/generation/references/candidate-selection-flow.md')
  const externalBridge = readRepoFile('plugins/movscript/skills/generation/references/external-generation-bridge.md')

  assert.match(planning, /Before generation, summarize the full context and wait for explicit confirmation/)
  assert.match(planning, /Before any generation tool or external generation system runs, summarize the full context and ask the user to confirm/)
  assert.match(planning, /D -> create\/update saved prompts for the concrete outputs; do not call generation tools/)
  assert.match(planning, /E -> switch to the `generation` skill after prompt\/readiness context is clear, then call generation tools only after the full confirmation gate/)

  assert.match(workflows, /Storyboard\/keyframe image generation also requires full-context user confirmation before any generation tool runs/)
  assert.match(videoPaths, /Do not run any generation tool or external generation system until the user has seen the full generation context and explicitly confirmed/)
  assert.match(recipes, /full-context user confirmation for generation/)
  assert.match(candidateFlow, /Every generation task requires this context-confirmation gate/)
  assert.match(externalBridge, /Before any external system runs image, video, audio, text, subtitle, or other generation/)

  for (const source of [planning, workflows, videoPaths, candidateFlow, externalBridge]) {
    assert.doesNotMatch(source, /Image generation does not require/)
    assert.doesNotMatch(source, /image generation may proceed under normal readiness/i)
    assert.doesNotMatch(source, /paid video generation/)
  }
})
