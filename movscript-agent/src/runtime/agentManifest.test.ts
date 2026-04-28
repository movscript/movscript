import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST, normalizeAgentManifest } from './agentManifest.js'

test('normalizes a valid agent manifest v1', () => {
  const manifest = normalizeAgentManifest({
    schema: 'movscript.agent.v1',
    id: 'studio.shot-planner',
    version: '1.2.3',
    name: 'Shot Planner',
    permissions: ['project.read', 'draft.write', 'project.read'],
    tools: [
      { name: 'movscript.search_entities', mode: 'allow', approval: 'never' },
      { name: 'movscript.apply_draft', mode: 'allow', approval: 'always' },
      { name: '', mode: 'allow' },
    ],
    metadata: { owner: 'studio' },
  })

  assert.equal(manifest.schema, 'movscript.agent.v2')
  assert.equal(manifest.sourceSchema, 'movscript.agent.v1')
  assert.equal(manifest.id, 'studio.shot-planner')
  assert.deepEqual(manifest.permissions, ['project.read', 'draft.write'])
  assert.equal(manifest.tools.length, 2)
  assert.equal(manifest.tools[1].approval, 'always')
  assert.equal(manifest.metadata?.owner, 'studio')
})

test('normalizes structured skills from manifest v2', () => {
  const manifest = normalizeAgentManifest({
    schema: 'movscript.agent.v2',
    id: 'studio.writer',
    version: '2.0.0',
    name: 'Writer',
    permissions: [],
    tools: [],
    skills: [
      {
        id: 'drafting',
        name: 'Drafting',
        description: 'Write drafts',
        enabled: true,
        priority: 10,
        instruction: 'Create draft-first output.',
        toolHints: ['movscript.create_draft'],
      },
    ],
  })

  assert.equal(manifest.skills.length, 1)
  assert.equal(manifest.skills[0].id, 'drafting')
  assert.equal(manifest.skills[0].instruction, 'Create draft-first output.')
  assert.deepEqual(manifest.skills[0].toolHints, ['movscript.create_draft'])
})

test('falls back to default manifest for unsupported input', () => {
  assert.equal(normalizeAgentManifest(null).id, DEFAULT_AGENT_MANIFEST.id)
  assert.equal(normalizeAgentManifest({ schema: 'unknown' }).id, DEFAULT_AGENT_MANIFEST.id)
})
