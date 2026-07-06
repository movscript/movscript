import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const repoRoot = resolve(import.meta.dirname, '../../..')

function readRepoFile(path) {
  return readFileSync(resolve(repoRoot, path), 'utf8')
}

const mirroredSettingGuidanceFiles = [
  'domain/SKILL.md',
  'domain/references/domain-story.md',
  'domain/references/entity-glossary.md',
  'generation/SKILL.md',
  'generation/references/continuity-asset-prompts.md',
  'planning/SKILL.md',
  'planning/references/content-unit-recipes.md',
  'planning/references/entity-mapping.md',
  'planning/references/planning-workflows.md',
  'planning/references/production-planning-examples.md',
  'planning/references/video-production-paths.md',
]

test('MovScript setting-scene guidance is mirrored in app and packaged plugin skills', () => {
  for (const file of mirroredSettingGuidanceFiles) {
    assert.equal(
      readRepoFile(`apps/plugin/skills/${file}`),
      readRepoFile(`plugins/movscript/skills/${file}`),
      `${file} should stay mirrored between apps/plugin and plugins/movscript`,
    )
  }
})

test('core skills distinguish reusable settings from scene moments', () => {
  const planning = readRepoFile('plugins/movscript/skills/planning/SKILL.md')
  const domain = readRepoFile('plugins/movscript/skills/domain/SKILL.md')
  const generation = readRepoFile('plugins/movscript/skills/generation/SKILL.md')

  assert.match(planning, /Do not map a reusable story place, scene space, set, or environment to `scene_moment` just because the user says "场景"/)
  assert.match(planning, /`setting` must be a concrete screenplay\/production entity/)
  assert.match(planning, /character\/person, script location\/scene space\/set, prop/)

  assert.match(domain, /Do not map a reusable story place, scene space, set, or environment to `scene_moment` just because the user says "场景"/)
  assert.match(domain, /`setting` must be a concrete screenplay\/production entity/)
  assert.match(domain, /reusable location\/scene space\/set/)

  assert.match(generation, /reusable location\/scene space\/set/)
  assert.match(generation, /do not treat a reusable location called "场景" as a `scene_moment`/)
})

test('mapping references treat Chinese scene locations as settings and action beats as scene moments', () => {
  const entityMapping = readRepoFile('plugins/movscript/skills/planning/references/entity-mapping.md')
  const entityGlossary = readRepoFile('plugins/movscript/skills/domain/references/entity-glossary.md')
  const workflows = readRepoFile('plugins/movscript/skills/planning/references/planning-workflows.md')
  const domainStory = readRepoFile('plugins/movscript/skills/domain/references/domain-story.md')
  const recipes = readRepoFile('plugins/movscript/skills/planning/references/content-unit-recipes.md')
  const continuity = readRepoFile('plugins/movscript/skills/generation/references/continuity-asset-prompts.md')

  for (const source of [entityMapping, entityGlossary, domainStory]) {
    assert.match(source, /Chinese "场景" is overloaded/)
    assert.match(source, /map it to `setting`/)
    assert.match(source, /map that beat to `scene_moment`/)
  }

  assert.match(entityMapping, /人物\/场景空间\/道具/)
  assert.match(entityGlossary, /人物\/场景空间\/道具/)
  assert.match(workflows, /Do not turn "场景：老张的厨房" into a `scene_moment`/)
  assert.match(workflows, /characters, scene places\/spaces\/sets, props/)
  assert.match(recipes, /Use `scene_moment` only for the dramatic\/action beat that happens in that place/)
  assert.match(continuity, /If the user says "场景" and means a reusable location, environment, room, stage, or set/)
})
