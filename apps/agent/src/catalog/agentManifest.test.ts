import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST, normalizeAgentManifest } from './agentManifest.js'

test('normalizes a valid current agent manifest', () => {
  const manifest = normalizeAgentManifest({
    schema: 'movscript.agent.current',
    id: 'studio.content-unit-planner',
    version: '1.2.3',
    name: 'Content Unit Planner',
    tools: [
      { name: 'movscript_create_script', mode: 'allow', approval: 'always' },
      { name: '', mode: 'allow' },
    ],
    metadata: { owner: 'studio' },
  })

  assert.equal(manifest.schema, 'movscript.agent.current')
  assert.equal(manifest.id, 'studio.content-unit-planner')
  assert.equal(manifest.tools.length, 1)
  assert.equal(manifest.tools[0].approval, 'always')
  assert.equal(manifest.metadata?.owner, 'studio')
})

test('normalizes manifest skills as inert historical input', () => {
  const manifest = normalizeAgentManifest({
    schema: 'movscript.agent.current',
    id: 'studio.writer',
    version: '2.0.0',
    name: 'Writer',
    tools: [],
    skills: [
      {
        id: 'drafting',
        name: 'Drafting',
        description: 'Write drafts',
        enabled: true,
        priority: 10,
        instruction: 'Create draft-first output.',
        toolHints: ['movscript_create_draft'],
      },
    ],
  })

  assert.equal(manifest.skills.length, 1)
  assert.equal(manifest.skills[0].id, 'drafting')
  assert.equal(manifest.skills[0].instruction, 'Create draft-first output.')
  assert.deepEqual(manifest.skills[0].toolHints, ['movscript_create_draft'])
})

test('default manifest does not grant generic draft creation', () => {
  assert.equal(DEFAULT_AGENT_MANIFEST.tools.some((tool) => tool.name === 'movscript_create_draft'), false)
  assert.deepEqual(DEFAULT_AGENT_MANIFEST.skills, [])
})

test('falls back to default manifest for unsupported input', () => {
  assert.equal(normalizeAgentManifest(null).id, DEFAULT_AGENT_MANIFEST.id)
  assert.equal(normalizeAgentManifest({ schema: 'unknown' }).id, DEFAULT_AGENT_MANIFEST.id)
  assert.equal(normalizeAgentManifest({ schema: 'movscript.agent.v1' }).id, DEFAULT_AGENT_MANIFEST.id)
})
