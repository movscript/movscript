import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST } from '../catalog/agentManifest.js'
import type { AgentPluginCatalog } from '../catalog/loader.js'
import type { CatalogRegistry, SkillDefinition, ToolDefinition } from '../catalog/types.js'
import { StaticToolRegistry } from '../tools/toolRegistry.js'
import { applyRuntimeAgentCatalogReload, reloadRuntimeAgentCatalog } from './runtimeCatalogReload.js'

test('reloadRuntimeAgentCatalog reports unchanged when dynamic loading is unavailable', () => {
  const result = reloadRuntimeAgentCatalog({
    current: {
      catalogVersion: 'catalog-v1',
      skillCount: 2,
      toolCount: 3,
    },
  })

  assert.equal(result.status, 'unchanged')
  assert.deepEqual(result.response, {
    status: 'unchanged',
    reason: 'dynamic agent catalog loading is not configured',
    skillCount: 2,
    toolCount: 3,
  })
})

test('reloadRuntimeAgentCatalog rolls back blocking catalog issues with previous counts', () => {
  const result = reloadRuntimeAgentCatalog({
    current: {
      catalogVersion: 'catalog-v1',
      skillCount: 2,
      toolCount: 3,
    },
    load: () => makeCatalog({
      issues: [{
        level: 'error',
        code: 'catalog.invalid',
        message: 'Invalid catalog',
        resourceId: 'pack.a',
      }],
    }),
  })

  assert.equal(result.status, 'rolled_back')
  const response = result.response as Record<string, unknown>
  assert.equal(response.status, 'rolled_back')
  assert.equal(response.catalogVersion, 'catalog-v1')
  assert.equal(response.skillCount, 2)
  assert.equal(response.toolCount, 3)
})

test('reloadRuntimeAgentCatalog returns committed catalog state and public response on success', () => {
  const skill = makeSkill('skill_a')
  const tool = makeTool('tool_a')
  const catalog = makeCatalog({
    version: 'catalog-v2',
    skills: [skill],
    tools: [tool],
    warnings: ['warning-a'],
  })

  const result = reloadRuntimeAgentCatalog({
    current: {
      catalogVersion: 'catalog-v1',
      skillCount: 0,
      toolCount: 0,
    },
    load: () => catalog,
  })

  assert.equal(result.status, 'reloaded')
  assert.equal(result.catalog, catalog)
  assert.deepEqual(result.pluginCatalogInfo, {
    skillsDir: '/tmp/skills',
    toolsDir: '/tmp/tools',
    builtinSkillsDir: '/tmp/builtin-skills',
    builtinToolsDir: '/tmp/builtin-tools',
    skillCount: 1,
    toolCount: 1,
    metadata: {
      catalogVersion: 'catalog-v2',
      catalogIssueCount: 0,
    },
  })
  assert.deepEqual(result.response, {
    status: 'reloaded',
    eventType: 'catalog.reload',
    outcome: 'ok',
    catalogVersion: 'catalog-v2',
    stagingDir: '_staging',
    skillCount: 1,
    toolCount: 1,
    warnings: ['warning-a'],
    catalogIssueCount: 0,
  })
})

test('applyRuntimeAgentCatalogReload commits only successful reloads', () => {
  const catalog = makeCatalog({
    version: 'catalog-v2',
    skills: [makeSkill('skill_a')],
  })
  const commits: string[] = []

  const unchanged = applyRuntimeAgentCatalogReload({
    current: {
      catalogVersion: 'catalog-v1',
      skillCount: 0,
      toolCount: 0,
    },
    commit: () => commits.push('unchanged'),
  })
  assert.equal((unchanged as Record<string, unknown>).status, 'unchanged')

  const reloaded = applyRuntimeAgentCatalogReload({
    current: {
      catalogVersion: 'catalog-v1',
      skillCount: 0,
      toolCount: 0,
    },
    load: () => catalog,
    commit: (reload) => commits.push(`${reload.catalog.layeredRegistry.version}:${reload.pluginCatalogInfo.skillCount}`),
  })

  assert.equal((reloaded as Record<string, unknown>).status, 'reloaded')
  assert.deepEqual(commits, ['catalog-v2:1'])
})

function makeCatalog(input: {
  version?: string
  skills?: SkillDefinition[]
  tools?: ToolDefinition[]
  warnings?: string[]
  issues?: AgentPluginCatalog['catalogIssues']
} = {}): AgentPluginCatalog {
  const layeredRegistry: CatalogRegistry = {
    version: input.version ?? 'catalog-v1',
    schemas: new Map(),
    tools: new Map((input.tools ?? []).map((tool) => [tool.name, tool])),
    skills: new Map((input.skills ?? []).map((skill) => [skill.id, skill])),
    packs: new Map(),
    profiles: new Map(),
    knowledge: new Map(),
  }
  return {
    skillsDir: '/tmp/skills',
    toolsDir: '/tmp/tools',
    builtinSkillsDir: '/tmp/builtin-skills',
    builtinToolsDir: '/tmp/builtin-tools',
    packsDir: '/tmp/packs',
    builtinPacksDir: '/tmp/builtin-packs',
    profilesDir: '/tmp/profiles',
    builtinProfilesDir: '/tmp/builtin-profiles',
    packs: [],
    profiles: [],
    layeredSkills: input.skills ?? [],
    layeredTools: input.tools ?? [],
    knowledgeCollections: [],
    toolGrants: [],
    manifest: DEFAULT_AGENT_MANIFEST,
    registry: new StaticToolRegistry([]),
    layeredRegistry,
    catalogIssues: input.issues ?? [],
    resourcePaths: {
      packs: {},
      profiles: {},
      skills: {},
      tools: {},
    },
    warnings: input.warnings ?? [],
  }
}

function makeSkill(id: string): SkillDefinition {
  return {
    id,
    kind: 'persona',
    version: '1.0.0',
    name: id,
    description: `${id} description`,
    priority: 1,
    enabled: true,
    instructionTemplate: 'Use this skill.',
  }
}

function makeTool(name: string): ToolDefinition {
  return {
    name,
    description: `${name} description`,
    inputSchema: { type: 'object' },
    permission: 'tool.read',
    risk: 'read',
    projectScoped: false,
    defaults: {
      grant: 'allow',
      approval: 'never',
    },
    source: 'runtime',
  }
}
