import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const repoRoot = resolve(import.meta.dirname, '../../..')

function readRepoFile(path) {
  return readFileSync(resolve(repoRoot, path), 'utf8')
}

const mirroredStyleReferenceGateFiles = [
  'domain/references/product-workflow-contract.md',
  'generation/SKILL.md',
  'generation/references/external-generation-bridge.md',
  'generation/references/model-usage.md',
  'planning/SKILL.md',
  'planning/references/content-unit-recipes.md',
  'planning/references/planning-workflows.md',
  'planning/references/video-production-paths.md',
]

test('MovScript prompt-backup and style-reference gate guidance is mirrored', () => {
  for (const file of mirroredStyleReferenceGateFiles) {
    assert.equal(
      readRepoFile(`apps/plugin/skills/${file}`),
      readRepoFile(`plugins/movscript/skills/${file}`),
      `${file} should stay mirrored between apps/plugin and plugins/movscript`,
    )
  }
})

test('generation skill requires saved prompt backup before any project generation executor', () => {
  const generation = readRepoFile('plugins/movscript/skills/generation/SKILL.md')

  assert.match(generation, /mcp__movscript__domain_upsert_project_standards/)
  assert.match(generation, /mcp__movscript__domain_upsert_content_unit/)
  assert.match(generation, /## Saved Prompt Gate/)
  assert.match(generation, /Before any project-scoped generation executor runs, create or update the matching 内容制作任务 \(`content_unit`\) and its `edit_prompt`/)
  assert.match(generation, /whether the actual executor is MovScript, LibTV, or another external tool/)
  assert.match(generation, /Do not leave the only prompt in chat text, provider-node state, a LibTV canvas, or an external task payload/)
  assert.match(generation, /For external tools, translate from the saved prompt into the provider prompt/)
})

test('generation skill blocks script-related visual generation until a style baseline is confirmed', () => {
  const generation = readRepoFile('plugins/movscript/skills/generation/SKILL.md')

  assert.match(generation, /## Project Style Gate/)
  assert.match(generation, /before any script-related image or video generation/)
  assert.match(generation, /First decide whether the requested style is simple\/unambiguous or special\/ambiguous/)
  assert.match(generation, /Simple styles can be carried by a confirmed style prompt/)
  assert.match(generation, /Special, composite, uncommon, or ambiguous styles should be stabilized as global style reference images generated from a style prompt/)
  assert.match(generation, /Read `domain_read_project_context_snapshot` and inspect `prompt_preview`, enabled style rules, core style fields, and `style_reference_resource_ids`/)
  assert.match(generation, /Do not generate script-related images or videos through MovScript, LibTV, or another external tool/)
  assert.match(generation, /If the style is simple and has no meaningful ambiguity/)
  assert.match(generation, /Save the confirmed prompt in `project_standards\.json` with `domain_upsert_project_standards`/)
  assert.match(generation, /visual_style.*style_prompt/s)
  assert.match(generation, /If the style is special, composite, uncommon, subjective, or likely to be interpreted inconsistently/)
  assert.match(generation, /first write a style prompt, then use that prompt to create\/update a project-level style-reference 内容制作任务/)
  assert.match(generation, /Save the chosen RawResource IDs in `project_standards\.json` with `domain_upsert_project_standards`/)
  assert.match(generation, /project_style\.custom_rules.*style_reference_images/s)
  assert.match(generation, /reference_resource_ids: \[123,456\]|resource#123/)
  assert.match(generation, /Only continue with script-related image\/video generation after the snapshot exposes either the confirmed style prompt/)
  assert.match(generation, /Once a style baseline exists, every later generation prompt must cite and use it/)
  assert.match(generation, /pass them as global `reference_resource_ids` for all supported visual generation/)
})

test('planning and references preserve the prompt-backup and style-reference gates', () => {
  const planning = readRepoFile('plugins/movscript/skills/planning/SKILL.md')
  const externalBridge = readRepoFile('plugins/movscript/skills/generation/references/external-generation-bridge.md')
  const productContract = readRepoFile('plugins/movscript/skills/domain/references/product-workflow-contract.md')
  const workflows = readRepoFile('plugins/movscript/skills/planning/references/planning-workflows.md')
  const videoPaths = readRepoFile('plugins/movscript/skills/planning/references/video-production-paths.md')
  const recipes = readRepoFile('plugins/movscript/skills/planning/references/content-unit-recipes.md')
  const modelUsage = readRepoFile('plugins/movscript/skills/generation/references/model-usage.md')

  assert.match(planning, /missing saved prompt backup for any planned generation/)
  assert.match(planning, /ensure the matching 内容制作任务 exists internally and its `edit_prompt` is written as the durable prompt backup/)
  assert.match(planning, /missing confirmed style baseline is a hard blocker/)
  assert.match(planning, /If the style is simple and unambiguous/)
  assert.match(planning, /If the style is special, composite, uncommon, subjective, or ambiguous/)
  assert.match(planning, /After a style baseline exists, every downstream saved prompt and generation prompt must cite and use it/)
  assert.match(planning, /confirmed style prompt for simple styles or confirmed style reference images for special\/ambiguous styles/)

  assert.match(externalBridge, /create or update the matching MovScript 内容制作任务 \(`content_unit`\) and its `edit_prompt` before external generation/)
  assert.match(externalBridge, /Do not run LibTV or another external generator for MovScript project content before the matching 内容制作任务 `edit_prompt` exists/)
  assert.match(externalBridge, /Use a confirmed style prompt saved in `visual_style`/)
  assert.match(externalBridge, /If the style is special, composite, uncommon, subjective, or ambiguous/)
  assert.match(externalBridge, /pass the selected style reference image\(s\) as global visual references/)

  assert.match(productContract, /Skipping saved prompt backup, prompt compilation, dependency checks, full-context confirmation, or project style gates/)
  assert.match(productContract, /Ensure the target 内容制作任务 \(`content_unit`\) exists and its `edit_prompt` is written or updated as the durable prompt backup/)
  assert.match(productContract, /use a project style prompt for simple\/unambiguous styles/)
  assert.match(productContract, /generate style reference images from the prompt and ask the user to choose when the style is special\/ambiguous/)
  assert.match(productContract, /Translate MovScript semantic refs, confirmed style prompt text, and any confirmed style reference images into every external tool input/)

  assert.match(workflows, /Before script-related image or video generation, require a confirmed project style baseline/)
  assert.match(workflows, /If the style is simple and unambiguous/)
  assert.match(workflows, /If the style is special, composite, uncommon, subjective, or ambiguous/)
  assert.match(workflows, /After the baseline exists, every downstream saved prompt and generation prompt must cite and use it/)
  assert.match(workflows, /Any MovScript, LibTV, or external executor should run from this saved 内容制作任务 `edit_prompt`/)
  assert.match(videoPaths, /### Saved Prompt Gate/)
  assert.match(videoPaths, /### Project Style Gate/)
  assert.match(videoPaths, /use that prompt in every downstream generation prompt/)
  assert.match(videoPaths, /use those selected style images as global references for every supported downstream visual generation/)
  assert.match(recipes, /`style_reference_batch_ref` or `project_style_reference_batch_ref`/)
  assert.match(recipes, /Every downstream saved prompt should cite this confirmed style prompt/)
  assert.match(recipes, /Every downstream visual saved prompt should cite the selected style reference images/)
  assert.match(modelUsage, /Before any MovScript, LibTV, or external executor runs for a MovScript project target/)
  assert.match(modelUsage, /Script-related image or video generation requires a confirmed project style baseline before execution/)
  assert.match(modelUsage, /cite that prompt in every later 内容制作任务 prompt and model-facing generation prompt/)
  assert.match(modelUsage, /Use those selected style images globally as reference inputs for every supported downstream visual generation/)
})
