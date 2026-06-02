import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST } from '../../../../catalog/manifest/agentManifest.js'
import type { AgentPluginCatalog } from '../../../../catalog/loading/core/loader.js'
import type { CatalogRegistry } from '../../../../catalog/registry/shared/types.js'
import { DEFAULT_TOOL_REGISTRY, StaticToolRegistry } from '../../../../tools/registry/core/toolRegistry.js'
import { resolveRuntimeCatalogInitialization } from './runtimeCatalogInitialization.js'

test('resolveRuntimeCatalogInitialization uses provided plugin catalog without scheduling reload', () => {
  const catalog = makeCatalog('catalog-v1', ['warning-a'])
  let loadCount = 0

  const result = resolveRuntimeCatalogInitialization({
    pluginCatalog: catalog,
    pluginCatalogLoader: () => makeCatalog('catalog-v2'),
    loadCatalogSnapshot: () => {
      loadCount += 1
      return makeCatalog('fallback')
    },
  })

  assert.equal(result.activeAgentManifest, catalog.manifest)
  assert.equal(result.toolRegistry, catalog.registry)
  assert.equal(result.layeredRegistry, catalog.layeredRegistry)
  assert.deepEqual(result.pluginWarnings, ['warning-a'])
  assert.equal(result.pluginCatalogInfo?.skillCount, 0)
  assert.equal(result.shouldReloadCatalog, false)
  assert.equal(loadCount, 0)
})

test('resolveRuntimeCatalogInitialization loads builtin catalog when no catalog options are provided', () => {
  const catalog = makeCatalog('builtin')

  const result = resolveRuntimeCatalogInitialization({
    loadCatalogSnapshot: () => catalog,
  })

  assert.equal(result.activeAgentManifest, catalog.manifest)
  assert.equal(result.toolRegistry, catalog.registry)
  assert.equal(result.layeredRegistry, catalog.layeredRegistry)
  assert.equal(result.pluginCatalogInfo?.skillsDir, '/tmp/builtin/skills')
  assert.equal(result.shouldReloadCatalog, false)
})

test('resolveRuntimeCatalogInitialization builds layered registry from explicit base options', () => {
  const explicitRegistry = new StaticToolRegistry([])
  const layeredCatalog = makeCatalog('layered')
  const result = resolveRuntimeCatalogInitialization({
    activeAgentManifest: DEFAULT_AGENT_MANIFEST,
    toolRegistry: explicitRegistry,
    pluginCatalogInfo: { skillsDir: '/custom/skills', toolsDir: '/custom/tools', skillCount: 2, toolCount: 3 },
    pluginWarnings: ['custom-warning'],
    loadCatalogSnapshot: (options) => {
      assert.equal(options?.baseManifest, DEFAULT_AGENT_MANIFEST)
      assert.deepEqual(options?.baseTools, explicitRegistry.list())
      return layeredCatalog
    },
  })

  assert.equal(result.activeAgentManifest, DEFAULT_AGENT_MANIFEST)
  assert.equal(result.toolRegistry, explicitRegistry)
  assert.equal(result.layeredRegistry, layeredCatalog.layeredRegistry)
  assert.deepEqual(result.pluginWarnings, ['custom-warning'])
  assert.equal(result.pluginCatalogInfo?.toolCount, 3)
})

test('resolveRuntimeCatalogInitialization schedules reload when only a plugin loader is configured', () => {
  const layeredCatalog = makeCatalog('layered')

  const result = resolveRuntimeCatalogInitialization({
    pluginCatalogLoader: () => makeCatalog('loaded'),
    loadCatalogSnapshot: () => layeredCatalog,
  })

  assert.equal(result.activeAgentManifest, DEFAULT_AGENT_MANIFEST)
  assert.equal(result.toolRegistry, DEFAULT_TOOL_REGISTRY)
  assert.equal(result.layeredRegistry, layeredCatalog.layeredRegistry)
  assert.equal(result.pluginCatalogInfo, undefined)
  assert.deepEqual(result.pluginWarnings, [])
  assert.equal(result.shouldReloadCatalog, true)
})

function makeCatalog(version: string, warnings: string[] = []): AgentPluginCatalog {
  const layeredRegistry: CatalogRegistry = {
    version,
    schemas: new Map(),
    tools: new Map(),
    skills: new Map(),
    packs: new Map(),
    configFiles: new Map(),
  }
  return {
    skillsDir: `/tmp/${version}/skills`,
    toolsDir: `/tmp/${version}/tools`,
    builtinSkillsDir: `/tmp/${version}/builtin-skills`,
    builtinToolsDir: `/tmp/${version}/builtin-tools`,
    packsDir: `/tmp/${version}/packs`,
    builtinPacksDir: `/tmp/${version}/builtin-packs`,
    configFilesDir: `/tmp/${version}/configFiles`,
    builtinConfigFilesDir: `/tmp/${version}/builtin-configFiles`,
    packs: [],
    configFiles: [],
    layeredSkills: [],
    layeredTools: [],
    toolGrants: [],
    manifest: DEFAULT_AGENT_MANIFEST,
    registry: new StaticToolRegistry([]),
    layeredRegistry,
    catalogIssues: [],
    resourcePaths: {
      packs: {},
      configFiles: {},
      skills: {},
      tools: {},
    },
    warnings,
  }
}
