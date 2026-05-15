import assert from 'node:assert/strict'
import test from 'node:test'
import { createEmptyCatalogRegistry } from './registry.js'
import { reloadCatalogCandidate, resolveCatalogStagingDir } from './reloader.js'
import { DEFAULT_AGENT_MANIFEST } from './agentManifest.js'
import { StaticToolRegistry } from '../tools/toolRegistry.js'
import type { AgentPluginCatalog } from './loader.js'

test('reloadCatalogCandidate commits a lint-clean candidate with staging metadata', () => {
  const catalog = testCatalog({ version: 'catalog-v2', tools: ['studio_echo'] })
  const result = reloadCatalogCandidate({
    load: () => catalog,
    previous: { catalogVersion: 'catalog-v1', skillCount: 1, toolCount: 1 },
    stateRootDir: '/tmp/movscript-agent',
  })

  assert.equal(result.status, 'reloaded')
  assert.equal(result.outcome, 'ok')
  assert.equal(result.catalogVersion, 'catalog-v2')
  assert.equal(result.stagingDir, '/tmp/movscript-agent/_staging')
  assert.equal(result.skillCount, 0)
  assert.equal(result.toolCount, 0)
})

test('reloadCatalogCandidate rolls back lint-blocked candidates and preserves previous counts', () => {
  const catalog = {
    ...testCatalog({ version: 'catalog-bad', tools: [] }),
    catalogIssues: [{ level: 'error' as const, code: 'pack.tool.missing', message: 'missing tool' }],
  }
  const result = reloadCatalogCandidate({
    load: () => catalog,
    previous: { catalogVersion: 'catalog-v1', skillCount: 3, toolCount: 4 },
  })

  assert.equal(result.status, 'rolled_back')
  assert.equal(result.outcome, 'rolled_back')
  assert.equal(result.reason, 'catalog.lint.fail')
  assert.equal(result.catalogVersion, 'catalog-v1')
  assert.equal(result.skillCount, 3)
  assert.equal(result.toolCount, 4)
  assert.equal(result.lintErrors.length, 1)
})

test('reloadCatalogCandidate rolls back loader exceptions', () => {
  const result = reloadCatalogCandidate({
    load: () => {
      throw new Error('candidate parse failed')
    },
    previous: { catalogVersion: null, skillCount: 0, toolCount: 0 },
  })

  assert.equal(result.status, 'rolled_back')
  assert.equal(result.reason, 'catalog.load.fail')
  assert.match(result.lintErrors[0]?.message ?? '', /candidate parse failed/)
})

test('resolveCatalogStagingDir is deterministic', () => {
  assert.equal(resolveCatalogStagingDir('/tmp/state'), '/tmp/state/_staging')
  assert.equal(resolveCatalogStagingDir(), '_staging')
})

function testCatalog(input: { version: string; tools: string[] }): AgentPluginCatalog {
  const registry = createEmptyCatalogRegistry(input.version)
  const toolRegistry = new StaticToolRegistry(input.tools.map((name) => ({
    name,
    description: 'Echo.',
    permission: 'project.read',
    risk: 'read' as const,
    source: 'runtime' as const,
    projectScoped: false,
    requiresApprovalByDefault: false,
  })))
  return {
    skillsDir: '',
    toolsDir: '',
    builtinSkillsDir: '',
    builtinToolsDir: '',
    packsDir: '',
    builtinPacksDir: '',
    profilesDir: '',
    builtinProfilesDir: '',
    packs: [],
    profiles: [],
    layeredSkills: [],
    layeredTools: [],
    knowledgeCollections: [],
    toolGrants: [],
    manifest: DEFAULT_AGENT_MANIFEST,
    registry: toolRegistry,
    layeredRegistry: registry,
    catalogIssues: [],
    resourcePaths: {
      packs: {},
      profiles: {},
      skills: {},
      tools: {},
    },
    warnings: [],
  }
}
