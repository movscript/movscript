import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST } from '../catalog/agentManifest.js'
import { resolveRuntimeAgentManifest } from './runtimeManifest.js'

test('resolveRuntimeAgentManifest uses the catalog default when no explicit manifest is provided', () => {
  const manifest = resolveRuntimeAgentManifest({
    defaultAgentManifest: {
      ...DEFAULT_AGENT_MANIFEST,
      id: 'catalog.default',
      name: 'Catalog Default',
    },
  })

  assert.equal(manifest.id, 'catalog.default')
  assert.equal(manifest.name, 'Catalog Default')
})

test('resolveRuntimeAgentManifest normalizes an explicit manifest over the catalog default', () => {
  const manifest = resolveRuntimeAgentManifest({
    defaultAgentManifest: DEFAULT_AGENT_MANIFEST,
    inputManifest: {
      schema: 'movscript.agent.current',
      id: 'explicit.agent',
      version: '1.0.0',
      name: 'Explicit Agent',
      tools: [{ name: 'movscript_get_focus', mode: 'allow', approval: 'never' }],
    },
  })

  assert.equal(manifest.id, 'explicit.agent')
  assert.equal(manifest.version, '1.0.0')
  assert.deepEqual(manifest.tools, [{ name: 'movscript_get_focus', mode: 'allow', approval: 'never' }])
})

test('resolveRuntimeAgentManifest falls back to built-in defaults for invalid explicit manifests', () => {
  const manifest = resolveRuntimeAgentManifest({
    defaultAgentManifest: {
      ...DEFAULT_AGENT_MANIFEST,
      id: 'catalog.default',
    },
    inputManifest: { schema: 'unknown' },
  })

  assert.equal(manifest.id, DEFAULT_AGENT_MANIFEST.id)
})
