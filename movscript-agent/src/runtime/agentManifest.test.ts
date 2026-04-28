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

  assert.equal(manifest.schema, 'movscript.agent.v1')
  assert.equal(manifest.id, 'studio.shot-planner')
  assert.deepEqual(manifest.permissions, ['project.read', 'draft.write'])
  assert.equal(manifest.tools.length, 2)
  assert.equal(manifest.tools[1].approval, 'always')
  assert.equal(manifest.metadata?.owner, 'studio')
})

test('falls back to default manifest for unsupported input', () => {
  assert.equal(normalizeAgentManifest(null).id, DEFAULT_AGENT_MANIFEST.id)
  assert.equal(normalizeAgentManifest({ schema: 'unknown' }).id, DEFAULT_AGENT_MANIFEST.id)
})
