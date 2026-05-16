import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST } from '../catalog/agentManifest.js'
import { DEFAULT_TOOL_REGISTRY } from '../tools/toolRegistry.js'
import { RuntimeCatalogSnapshotRegistry, buildRuntimeCatalogSnapshot } from './runtimeCatalogSnapshot.js'

const emptyLayeredRegistry = {
  version: 'test',
  schemas: new Map(),
  tools: new Map(),
  skills: new Map(),
  packs: new Map(),
  profiles: new Map(),
  knowledge: new Map(),
}

test('buildRuntimeCatalogSnapshot freezes catalog identity, manifest, registries, and warnings', () => {
  const snapshot = buildRuntimeCatalogSnapshot({
    id: 'catalog_1',
    defaultAgentManifest: DEFAULT_AGENT_MANIFEST,
    toolRegistry: DEFAULT_TOOL_REGISTRY,
    layeredRegistry: emptyLayeredRegistry,
    pluginCatalogInfo: {
      skillsDir: '/tmp/skills',
      toolsDir: '/tmp/tools',
      skillCount: 2,
      toolCount: 3,
      metadata: { catalogVersion: 'catalog-v1' },
    },
    pluginWarnings: ['missing optional skill'],
  })

  assert.equal(snapshot.id, 'catalog_1')
  assert.equal(snapshot.catalogVersion, 'catalog-v1')
  assert.equal(snapshot.defaultAgentManifest, DEFAULT_AGENT_MANIFEST)
  assert.equal(snapshot.toolRegistry, DEFAULT_TOOL_REGISTRY)
  assert.equal(snapshot.layeredRegistry, emptyLayeredRegistry)
  assert.deepEqual(snapshot.pluginWarnings, ['missing optional skill'])
})

test('buildRuntimeCatalogSnapshot defaults absent plugin metadata to a stable empty snapshot shape', () => {
  const snapshot = buildRuntimeCatalogSnapshot({
    id: 'catalog_2',
    defaultAgentManifest: DEFAULT_AGENT_MANIFEST,
    toolRegistry: DEFAULT_TOOL_REGISTRY,
    layeredRegistry: emptyLayeredRegistry,
  })

  assert.equal(snapshot.catalogVersion, null)
  assert.equal(snapshot.pluginCatalogInfo, undefined)
  assert.deepEqual(snapshot.pluginWarnings, [])
})

test('RuntimeCatalogSnapshotRegistry keeps in-flight run snapshots stable across current replacements', () => {
  const first = buildRuntimeCatalogSnapshot({
    id: 'catalog_1',
    defaultAgentManifest: DEFAULT_AGENT_MANIFEST,
    toolRegistry: DEFAULT_TOOL_REGISTRY,
    layeredRegistry: emptyLayeredRegistry,
  })
  const second = buildRuntimeCatalogSnapshot({
    id: 'catalog_2',
    defaultAgentManifest: DEFAULT_AGENT_MANIFEST,
    toolRegistry: DEFAULT_TOOL_REGISTRY,
    layeredRegistry: emptyLayeredRegistry,
  })
  const registry = new RuntimeCatalogSnapshotRegistry(first)

  assert.equal(registry.captureRun('run_1'), first)
  registry.replaceCurrent(second)

  assert.equal(registry.current, second)
  assert.equal(registry.getForRun('run_1'), first)
  assert.equal(registry.getForRun('run_2'), second)

  registry.deleteRun('run_1')
  assert.equal(registry.getForRun('run_1'), second)
})
