import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST, normalizeAgentManifest } from './agentManifest.js'

test('normalizes a valid current agent manifest', () => {
  const manifest = normalizeAgentManifest({
    schema: 'movscript.agent.current',
    id: 'studio.content-unit-task-graphner',
    version: '1.2.3',
    name: 'Content Unit Planner',
    tools: [
      { name: 'movscript_project_create', mode: 'allow', approval: 'always' },
      { name: '', mode: 'allow' },
    ],
    metadata: { owner: 'studio' },
  })

  assert.equal(manifest.schema, 'movscript.agent.current')
  assert.equal(manifest.id, 'studio.content-unit-task-graphner')
  assert.equal(manifest.tools.length, 1)
  assert.equal(manifest.tools[0].approval, 'always')
  assert.equal(manifest.metadata?.owner, 'studio')
})

test('active manifest does not grant generic draft creation', () => {
  assert.equal(DEFAULT_AGENT_MANIFEST.tools.some((tool) => tool.name === 'draft_create'), false)
})

test('falls back to active manifest for unsupported input', () => {
  assert.equal(normalizeAgentManifest(null).id, DEFAULT_AGENT_MANIFEST.id)
  assert.equal(normalizeAgentManifest({ schema: 'unknown' }).id, DEFAULT_AGENT_MANIFEST.id)
  assert.equal(normalizeAgentManifest({ schema: 'movscript.agent.v1' }).id, DEFAULT_AGENT_MANIFEST.id)
})

test('drops manifest metadata with non-finite JSON numbers', () => {
  const manifest = normalizeAgentManifest({
    schema: 'movscript.agent.current',
    id: 'studio.content-unit-task-graphner',
    version: '1.2.3',
    name: 'Content Unit Planner',
    tools: [],
    metadata: {
      owner: 'studio',
      score: Number.POSITIVE_INFINITY,
    },
  })

  assert.equal(manifest.metadata, undefined)
})
