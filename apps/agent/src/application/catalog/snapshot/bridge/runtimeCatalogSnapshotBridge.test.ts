import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_AGENT_MANIFEST } from '../../../../catalog/manifest/agentManifest.js'
import { StaticToolRegistry } from '../../../../tools/registry/core/toolRegistry.js'
import { createRuntimeCatalogSnapshotBridge } from './runtimeCatalogSnapshotBridge.js'

const emptyLayeredRegistry = {
  version: 'test',
  schemas: new Map(),
  tools: new Map(),
  skills: new Map(),
  packs: new Map(),
  configFiles: new Map(),
}

test('createRuntimeCatalogSnapshotBridge captures the current catalog state when requested', () => {
  const firstRegistry = new StaticToolRegistry([])
  const secondRegistry = new StaticToolRegistry([])
  let toolRegistry = firstRegistry
  const bridge = createRuntimeCatalogSnapshotBridge({
    getCatalogState: () => ({
      activeAgentManifest: DEFAULT_AGENT_MANIFEST,
      toolRegistry,
      layeredRegistry: emptyLayeredRegistry,
      pluginWarnings: ['warning'],
    }),
  })

  const first = bridge.createSnapshot()
  toolRegistry = secondRegistry
  const second = bridge.createSnapshot()

  assert.equal(first.toolRegistry, firstRegistry)
  assert.equal(second.toolRegistry, secondRegistry)
  assert.match(first.id, /^catalog_/)
  assert.match(second.id, /^catalog_/)
  assert.deepEqual(second.pluginWarnings, ['warning'])
})
