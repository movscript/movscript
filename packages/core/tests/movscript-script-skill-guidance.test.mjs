import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const repoRoot = resolve(import.meta.dirname, '../../..')

function readRepoFile(path) {
  return readFileSync(resolve(repoRoot, path), 'utf8')
}

const mirroredSkillFiles = [
  'domain/SKILL.md',
  'editing/SKILL.md',
  'generation/SKILL.md',
  'planning/SKILL.md',
  'planning/references/planning-workflows.md',
  'project/SKILL.md',
  'review/SKILL.md',
  'workspace/SKILL.md',
]

test('MovScript script guidance is mirrored in app and packaged plugin skills', () => {
  for (const file of mirroredSkillFiles) {
    assert.equal(
      readRepoFile(`apps/plugin/skills/${file}`),
      readRepoFile(`plugins/movscript/skills/${file}`),
      `${file} should stay mirrored between apps/plugin and plugins/movscript`,
    )
  }
})

test('planning skill persists important story intent in scripts before downstream planning', () => {
  const planning = readRepoFile('plugins/movscript/skills/planning/SKILL.md')
  const workflows = readRepoFile('plugins/movscript/skills/planning/references/planning-workflows.md')

  assert.match(planning, /mcp__movscript__domain_upsert_script/)
  assert.match(planning, /Treat `scripts\/\*\*` as the durable screenplay and project story memory/)
  assert.match(planning, /write or update the script before deriving scene moments, expression units, content units, or generation prompts/)
  assert.match(planning, /read the existing script before asking the user or guessing/)
  assert.match(planning, /Use `domain_upsert_script` for screenplay\/source text writes/)
  assert.match(planning, /run `domain_snapshot_script_version` when downstream scene moments, expression units, or content units need stable script-block references/)
  assert.match(planning, /update it with `domain_upsert_script` before downstream planning/)

  assert.match(workflows, /Use `scripts\/\*\*` as the durable screenplay and project story memory/)
  assert.match(workflows, /write or update the script before turning that material into scene moments, expression units, content units, or generation prompts/)
  assert.match(workflows, /-> script/)
  assert.match(workflows, /update the script with `domain_upsert_script` before writing downstream planning entities/)
})

test('domain and project skills route unclear creative work through script source first', () => {
  const domain = readRepoFile('plugins/movscript/skills/domain/SKILL.md')
  const project = readRepoFile('plugins/movscript/skills/project/SKILL.md')

  assert.match(domain, /`scripts\/\*\*`: Durable screenplay and project story memory/)
  assert.match(domain, /Store important story intent, scene order, dialogue, narration, character\/world continuity, and project-level creative decisions/)
  assert.match(domain, /Use `domain_upsert_script` for script metadata plus `script\.md` text/)
  assert.match(domain, /Read existing script source before executing project-scoped creative work with unclear story, continuity, character, beat, or dialogue context/)
  assert.match(domain, /Snapshot script versions\/blocks with `domain_snapshot_script_version`/)
  assert.match(domain, /Do not store transient task notes, provider job state, resource URLs, binaries, or unconfirmed guesses in scripts/)

  assert.match(project, /orient agents to source, script\/story context/)
  assert.match(project, /`scripts\/\*\*` stores the durable screenplay and project story memory/)
  assert.match(project, /read script source with `domain_read_script_source` before guessing or asking for details/)
  assert.match(project, /inspect the relevant script before relying on UI focus, recent chat fragments, or generated artifacts/)
})

test('generation and review skills can read scripts before prompt or readiness decisions', () => {
  const generation = readRepoFile('plugins/movscript/skills/generation/SKILL.md')
  const review = readRepoFile('plugins/movscript/skills/review/SKILL.md')

  assert.match(generation, /mcp__movscript__domain_read_script_source/)
  assert.match(generation, /read the script source before writing or compiling prompts/)
  assert.match(generation, /read the script source before authoring the generation prompt/)

  assert.match(review, /mcp__movscript__domain_read_script_source/)
  assert.match(review, /read the relevant script source before explaining readiness or downstream effects/)
  assert.match(review, /read the relevant script source before explaining the result/)
})

test('workspace and editing skills read script source before ambiguous execution choices', () => {
  const workspace = readRepoFile('plugins/movscript/skills/workspace/SKILL.md')
  const editing = readRepoFile('plugins/movscript/skills/editing/SKILL.md')

  assert.match(workspace, /mcp__movscript__domain_read_script_source/)
  assert.match(workspace, /`scripts\/\*\*` is the durable screenplay and project story memory/)
  assert.match(workspace, /read script source before guessing and prefer switching to the `domain` or `planning` skill/)
  assert.match(workspace, /Do not use `\.interpret\/`, UI focus, recent chat fragments, or generated artifacts as a substitute/)

  assert.match(editing, /mcp__movscript__domain_read_script_source/)
  assert.match(editing, /use `domain_read_script_source` when cut rhythm, dialogue placement, continuity, or story intent is unclear/)
  assert.match(editing, /read script source before choosing cuts, clip order, or timing/)
})
