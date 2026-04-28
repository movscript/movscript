import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { loadAgentPluginCatalog } from './pluginCatalog.js'

test('loads plugin catalog from json files and merges default grants', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-plugins-'))
  const skillsDir = join(dir, 'skills')
  const toolsDir = join(dir, 'tools')

  try {
    writePluginFile(skillsDir, 'writer.json', {
      id: 'studio.writer',
      name: 'Writer',
      description: 'Writes scene drafts',
      enabled: true,
      priority: 20,
      instruction: 'Write in short scene beats.',
      appliesWhen: 'scene',
      toolHints: ['studio.script_outline'],
    })
    writePluginFile(toolsDir, 'outline.json', {
      name: 'studio.script_outline',
      description: 'Create a script outline draft.',
      permission: 'draft.write',
      risk: 'draft',
      projectScoped: true,
      requiresApprovalByDefault: false,
      defaultGrant: { name: 'studio.script_outline', mode: 'allow', approval: 'never' },
    })

    const catalog = loadAgentPluginCatalog({ skillsDir, toolsDir })

    assert.equal(catalog.skillsDir, skillsDir)
    assert.equal(catalog.toolsDir, toolsDir)
    assert.equal(catalog.skills[0]?.id, 'studio.writer')
    assert.equal(catalog.tools[0]?.name, 'studio.script_outline')
    assert.equal(catalog.tools[0]?.source, 'plugin')
    assert.ok(catalog.manifest.skills.some((skill) => skill.id === 'studio.writer'))
    assert.ok(catalog.manifest.tools.some((grant) => grant.name === 'studio.script_outline'))
    assert.ok(catalog.registry.get('studio.script_outline'))
    assert.deepEqual(catalog.warnings, [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

function writePluginFile(dir: string, filename: string, value: unknown): void {
  const filePath = join(dir, filename)
  mkdirSync(dir, { recursive: true })
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}
