import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const repoRoot = resolve(import.meta.dirname, '../../..')

function readRepoFile(path) {
  return readFileSync(resolve(repoRoot, path), 'utf8')
}

const mirroredSettingReferenceSetFiles = [
  'generation/SKILL.md',
  'generation/references/continuity-asset-prompts.md',
  'generation/references/model-usage.md',
  'planning/SKILL.md',
  'planning/references/content-unit-recipes.md',
  'planning/references/planning-workflows.md',
]

test('MovScript setting reference-set guidance is mirrored in app and packaged plugin skills', () => {
  for (const file of mirroredSettingReferenceSetFiles) {
    assert.equal(
      readRepoFile(`apps/plugin/skills/${file}`),
      readRepoFile(`plugins/movscript/skills/${file}`),
      `${file} should stay mirrored between apps/plugin and plugins/movscript`,
    )
  }
})

test('continuity asset prompts define source-of-truth setting reference sets', () => {
  const continuity = readRepoFile('plugins/movscript/skills/generation/references/continuity-asset-prompts.md')

  assert.match(continuity, /## Setting Reference Set Source-of-Truth/)
  assert.match(continuity, /Do not generate multiple setting reference images in parallel from text/)
  assert.match(continuity, /one source-of-truth base asset first/)
  assert.match(continuity, /Generate and adopt\/select the base asset before derivative views, states, sheets, or detail callouts/)
  assert.match(continuity, /Every derivative `asset_ref` prompt must reference the selected base asset/)
  assert.match(continuity, /`{{asset::base_character_id}}`/)
  assert.match(continuity, /`{{asset::base_room_layout}}`/)
  assert.match(continuity, /`{{asset::base_prop_shape}}`/)
  assert.match(continuity, /Character\/person: base identity or neutral full-body reference first/)
  assert.match(continuity, /Place, scene space, room, set, or environment: base layout or clean wide view first/)
  assert.match(continuity, /Prop, product, vehicle, instrument, or material: base shape\/material reference first/)
  assert.match(continuity, /Costume or makeup tied to a person: reference the selected character base identity first/)
})

test('continuity guidance defines scene reference packs for reusable locations', () => {
  const continuity = readRepoFile('plugins/movscript/skills/generation/references/continuity-asset-prompts.md')

  assert.match(continuity, /## Scene Reference Pack/)
  assert.match(continuity, /visual source, a structural source, then only useful derivative views/)
  assert.match(continuity, /Do not create new entity types for floor plans, control maps, or structure notes/)
  assert.match(continuity, /`base_scene_view`: first adopted\/selected visual mother reference/)
  assert.match(continuity, /`topdown_layout_ref`: derive an abstract top-down floor plan, zone map, or object-placement map from `{{asset::base_scene_view}}`/)
  assert.match(continuity, /`depth_line_layout_ref`: optional depth, lineart, canny-like, sketch, mask, or annotated control image/)
  assert.match(continuity, /Do not generate a top-down layout, corner view, or final shot by repeating text only when the base scene exists/)
  assert.match(continuity, /door\/window count, object placement, orientation, scale, materials, and light-source logic/)
})

test('planning and generation block derivative setting references without an adopted base', () => {
  const planning = readRepoFile('plugins/movscript/skills/planning/SKILL.md')
  const generation = readRepoFile('plugins/movscript/skills/generation/SKILL.md')

  assert.match(planning, /group, batch, set, or all reference images for one `setting`/)
  assert.match(planning, /Do not plan parallel independent `asset_ref` generations from text/)
  assert.match(planning, /source-of-truth base asset/)
  assert.match(planning, /derivative `asset_ref` prompts that reference the base semantically/)
  assert.match(planning, /`{{asset::base_character}}`/)
  assert.match(planning, /For a setting reference set, the base asset is the source of truth/)

  assert.match(generation, /When generating a setting reference set/)
  assert.match(generation, /do not submit parallel `asset_ref` jobs from text/)
  assert.match(generation, /Stabilize one source-of-truth base asset first/)
  assert.match(generation, /If no adopted\/selected base exists, stop/)
  assert.match(generation, /generate\/adopt the base first, then generate derivative views\/states with semantic refs to that base/)
  assert.match(planning, /plan a scene reference pack: `base_scene_view` first, then `topdown_layout_ref`/)
  assert.match(planning, /top-down layout is a structural reference derived from the adopted base scene/)
  assert.match(generation, /follow the scene reference pack order/)
  assert.match(generation, /generate\/adopt `base_scene_view` first; derive `topdown_layout_ref` from that selected base/)
  assert.match(generation, /Do not generate a top-down\/floor-plan\/control image from text alone when a base scene is available/)
})

test('recipes and model usage route grouped setting refs through base then derivatives', () => {
  const recipes = readRepoFile('plugins/movscript/skills/planning/references/content-unit-recipes.md')
  const modelUsage = readRepoFile('plugins/movscript/skills/generation/references/model-usage.md')
  const workflows = readRepoFile('plugins/movscript/skills/planning/references/planning-workflows.md')

  assert.match(recipes, /### Setting Reference Sets/)
  assert.match(recipes, /source-of-truth reference set/)
  assert.match(recipes, /base asset_ref 内容制作任务/)
  assert.match(recipes, /derivative asset_ref 内容制作任务 with {{asset::base_\*}} refs/)
  assert.match(recipes, /Character\/person: base identity or neutral full-body reference/)
  assert.match(recipes, /Place, scene space, room, set, or environment: base layout or clean wide view/)
  assert.match(recipes, /If the base is not adopted\/selected, classify the derivative work as `缺选择` or `可补图` and stop before generation/)

  assert.match(modelUsage, /When a group of reference images is needed for one setting/)
  assert.match(modelUsage, /do not generate the set as independent images from repeated text/)
  assert.match(modelUsage, /create a source-of-truth base asset first/)
  assert.match(modelUsage, /After the base `asset_ref` candidate is adopted\/selected/)
  assert.match(modelUsage, /This keeps character identity, scene-space layout, prop shape, material, and state variants tied to one source/)
  assert.match(recipes, /### Scene Reference Packs/)
  assert.match(recipes, /base_scene_view asset_ref/)
  assert.match(recipes, /topdown_layout_ref asset_ref/)
  assert.match(recipes, /depth_line_layout_ref/)
  assert.match(recipes, /Before marking a scene pack derivative as stable, check door\/window count/)
  assert.match(modelUsage, /treat the reference set as a scene reference pack/)
  assert.match(modelUsage, /Create\/adopt `base_scene_view` as the visual source of truth/)
  assert.match(modelUsage, /derive `topdown_layout_ref` as an abstract structural source from `{{asset::base_scene_view}}`/)
  assert.match(workflows, /stricter scene reference pack order/)
  assert.match(workflows, /Treat the top-down layout as structural evidence, not an independent design pass/)
})
