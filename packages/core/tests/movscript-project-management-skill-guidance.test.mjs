import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const repoRoot = resolve(import.meta.dirname, '../../..')

function readRepoFile(path) {
  return readFileSync(resolve(repoRoot, path), 'utf8')
}

test('project skill defines an explicit project management gate', () => {
  const project = readRepoFile('plugins/movscript/skills/project/SKILL.md')

  assert.match(project, /## Project Management Gate/)
  assert.match(project, /project-management gate before any project-scoped planning, domain, generation, editing, or review task/)
  assert.match(project, /Confirm Project Service can return project context before handing work to planning, domain, generation, editing, or review/)
  assert.match(project, /use `system_project_fetch` or `system_project_open` for that explicit locator/)
  assert.match(project, /Use `system_project_init` only when the user explicitly asks/)
  assert.match(project, /Use `system_project_create` only when the user explicitly asks/)
  assert.match(project, /stop project-scoped writes and report the missing locator\/service\/intent/)
})

test('project-scoped execution skills route unclear project state through the project gate', () => {
  const skillFiles = [
    'planning/SKILL.md',
    'domain/SKILL.md',
    'generation/SKILL.md',
    'review/SKILL.md',
    'editing/SKILL.md',
    'workspace/SKILL.md',
  ]

  for (const file of skillFiles) {
    const skill = readRepoFile(`plugins/movscript/skills/${file}`)

    assert.match(skill, /project locator, initialization, open\/fetch state/)
    assert.match(skill, /Project Management Gate/)
    assert.match(skill, /unresolved project initialization\/open state/)
    assert.match(skill, /Do not infer it from UI focus/)
    assert.match(skill, /init\/create only when the user explicitly asks or confirms/)
  }
})
