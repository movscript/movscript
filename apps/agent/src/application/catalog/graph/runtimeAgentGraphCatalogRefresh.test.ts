import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST, type AgentManifest } from '../../../catalog/manifest/agentManifest.js'
import { buildLayeredCatalogRegistry, createEmptyCatalogRegistry } from '../../../catalog/registry/core/registry.js'
import { StaticToolRegistry } from '../../../tools/registry/core/toolRegistry.js'
import type { AgentRun, MCPResource, MCPTool } from '../../../state/shared/types.js'
import type { CapabilityMCPClient } from '../../../tools/catalog/capabilities/capabilityResolver.js'
import { buildRuntimeCatalogSnapshot, RuntimeCatalogSnapshotRegistry } from '../snapshot/core/runtimeCatalogSnapshot.js'
import { refreshRuntimeAgentGraphCatalog } from './runtimeAgentGraphCatalogRefresh.js'

test('refreshRuntimeAgentGraphCatalog captures current snapshot and refreshes active manifest capabilities', async () => {
  const toolRegistry = new StaticToolRegistry([{
    name: 'tool_a',
    description: 'Tool A',
    permission: 'tool.a',
    risk: 'read',
    source: 'runtime',
    projectScoped: false,
    requiresApprovalByDefault: false,
  }])
  const refreshedManifest: AgentManifest = {
    ...DEFAULT_AGENT_MANIFEST,
    id: 'manifest_refreshed',
    name: 'Refreshed Manifest',
    tools: [{ name: 'tool_a', mode: 'allow', approval: 'never' }],
  }
  const catalogSnapshots = new RuntimeCatalogSnapshotRegistry(buildRuntimeCatalogSnapshot({
    id: 'snapshot_1',
    activeAgentManifest: refreshedManifest,
    toolRegistry,
    layeredRegistry: createEmptyCatalogRegistry('catalog_v1'),
    pluginWarnings: ['catalog warning'],
  }))
  const run = makeRun({ metadata: { manifestSource: 'default' } })

  const result = await refreshRuntimeAgentGraphCatalog({
    run,
    catalogSnapshots,
    mcpClient: new FakeCapabilityClient([{
      name: 'movscript_script_locate',
      description: 'Read project scripts',
      inputSchema: { type: 'object' },
    }]),
    currentProjectId: 42,
    userMessage: 'hello',
    debugContext: debugContext(),
    history: [],
    runRole: 'planner',
  })

  assert.equal(result.manifest.id, 'manifest_refreshed')
  assert.equal(run.agentManifest?.id, 'manifest_refreshed')
  assert.equal(result.registry, toolRegistry)
  assert.equal(result.capabilities.available.some((tool) => tool.name === 'tool_a'), true)
  assert.deepEqual(result.warnings, ['catalog warning'])
})

test('refreshRuntimeAgentGraphCatalog preserves explicit run manifest across catalog refresh', async () => {
  const explicitManifest: AgentManifest = {
    ...DEFAULT_AGENT_MANIFEST,
    id: 'explicit_manifest',
    tools: [],
  }
  const activeManifest: AgentManifest = {
    ...DEFAULT_AGENT_MANIFEST,
    id: 'default_manifest',
  }
  const catalogSnapshots = new RuntimeCatalogSnapshotRegistry(buildRuntimeCatalogSnapshot({
    id: 'snapshot_1',
    activeAgentManifest: activeManifest,
    toolRegistry: new StaticToolRegistry([]),
    layeredRegistry: createEmptyCatalogRegistry('catalog_v1'),
  }))
  const run = makeRun({ agentManifest: explicitManifest, metadata: { manifestSource: 'custom' } })

  const result = await refreshRuntimeAgentGraphCatalog({
    run,
    catalogSnapshots,
    mcpClient: new FakeCapabilityClient([{
      name: 'movscript_script_locate',
      description: 'Read project scripts',
      inputSchema: { type: 'object' },
    }]),
    userMessage: 'hello',
    debugContext: debugContext(),
    history: [],
  })

  assert.equal(result.manifest.id, 'explicit_manifest')
  assert.equal(run.agentManifest?.id, 'explicit_manifest')
})

test('refreshRuntimeAgentGraphCatalog resolves layered active config file when available', async () => {
  const layeredRegistry = buildLayeredCatalogRegistry({
    manifest: DEFAULT_AGENT_MANIFEST,
    tools: [],
    configFiles: [{
      schema: 'movscript.agent.config_file.v1',
      id: 'movscript.config_file.base',
      version: '1.0.0',
      name: 'Layered Config File',
      enabledPackIds: [],
      skillIds: [],
      toolGrants: [{ name: 'tool_layered', mode: 'allow', approval: 'never' }],
    }],
  })
  const toolRegistry = new StaticToolRegistry([{
    name: 'tool_layered',
    description: 'Layered tool',
    permission: 'tool.layered',
    risk: 'read',
    source: 'runtime',
    projectScoped: false,
    requiresApprovalByDefault: false,
  }])
  const catalogSnapshots = new RuntimeCatalogSnapshotRegistry(buildRuntimeCatalogSnapshot({
    id: 'snapshot_1',
    activeAgentManifest: DEFAULT_AGENT_MANIFEST,
    toolRegistry,
    layeredRegistry,
  }))
  const run = makeRun({ metadata: { manifestSource: 'default' } })

  const result = await refreshRuntimeAgentGraphCatalog({
    run,
    catalogSnapshots,
    mcpClient: new FakeCapabilityClient([{
      name: 'movscript_script_locate',
      description: 'Read project scripts',
      inputSchema: { type: 'object' },
    }]),
    userMessage: 'hello',
    debugContext: debugContext(),
    history: [],
  })

  assert.equal(result.manifest.id, 'movscript.config_file.base')
  assert.deepEqual(result.manifest.tools, [{ name: 'tool_layered', mode: 'allow', approval: 'never' }])
  assert.equal(result.skillDiscovery?.availableSkills.length, 0)
  assert.equal(result.capabilities.blocked.some((tool) => tool.name === 'tool_layered' && tool.unavailableReason === 'skill_scope'), true)
})

test('refreshRuntimeAgentGraphCatalog loads requested active skill state', async () => {
  const layeredRegistry = buildLayeredCatalogRegistry({
    manifest: DEFAULT_AGENT_MANIFEST,
    tools: [],
    layeredSkills: [{
      id: 'studio.action',
      version: '1.0.0',
      name: 'Action Director',
      description: 'Action direction guidance',
      priority: 80,
      enabled: true,
      instructionTemplate: 'Design readable action beats.',
      loadMode: 'on_demand',
    }],
    configFiles: [{
      schema: 'movscript.agent.config_file.v1',
      id: 'movscript.config_file.base',
      version: '1.0.0',
      name: 'Layered Config File',
      enabledPackIds: [],
      skillIds: [],
      toolGrants: [],
    }],
  })
  const catalogSnapshots = new RuntimeCatalogSnapshotRegistry(buildRuntimeCatalogSnapshot({
    id: 'snapshot_1',
    activeAgentManifest: DEFAULT_AGENT_MANIFEST,
    toolRegistry: new StaticToolRegistry([]),
    layeredRegistry,
  }))
  const run = makeRun({
    metadata: {
      manifestSource: 'default',
      skillState: {
        loadedSkillIds: ['studio.action'],
        unloadedSkillIds: [],
      },
    },
  })

  const result = await refreshRuntimeAgentGraphCatalog({
    run,
    catalogSnapshots,
    mcpClient: new FakeCapabilityClient(),
    userMessage: 'make the fight sharper',
    debugContext: debugContext(),
    history: [],
  })

  assert.deepEqual(result.skills.map((skill) => skill.id), ['studio.action'])
  assert.equal(result.skills[0]?.metadata?.loadMode, 'on_demand')
})

test('refreshRuntimeAgentGraphCatalog merges requested skill grants into explicit run manifest', async () => {
  const layeredRegistry = buildLayeredCatalogRegistry({
    manifest: {
      ...DEFAULT_AGENT_MANIFEST,
      tools: [
        { name: 'core_skill_update', mode: 'allow', approval: 'never' },
      ],
    },
    tools: [{
      name: 'movscript_script_locate',
      description: 'Read project scripts',
      permission: 'project.script.read',
      risk: 'read',
      source: 'mcp',
      projectScoped: true,
      requiresApprovalByDefault: false,
    }],
    layeredTools: [{
      name: 'movscript_script_locate',
      description: 'Read project scripts',
      inputSchema: { type: 'object' },
      permission: 'project.script.read',
      risk: 'read',
      projectScoped: true,
      defaults: { grant: 'allow', approval: 'never' },
      source: 'mcp',
    }],
    layeredSkills: [{
      id: 'movscript.script_reading',
      version: '1.0.0',
      name: 'Script Reading',
      description: 'Read project scripts',
      priority: 80,
      enabled: true,
      instructionTemplate: 'Read scripts.',
      loadMode: 'manual',
      triggers: [{ kind: 'keyword', any: ['剧本'] }],
      toolGrants: ['movscript_script_locate'],
    }],
    configFiles: [{
      schema: 'movscript.agent.config_file.v1',
      id: 'movscript.config_file.base',
      version: '1.0.0',
      name: 'Layered Config File',
      enabledPackIds: [],
      skillIds: ['movscript.script_reading'],
      toolGrants: [
        { name: 'core_skill_update', mode: 'allow', approval: 'never' },
      ],
    }],
  })
  const explicitManifest: AgentManifest = {
    schema: 'movscript.agent.current',
    id: 'explicit_manifest',
    version: '1.0.0',
    name: 'Explicit Manifest',
    tools: [
      { name: 'core_skill_update', mode: 'allow', approval: 'never' },
    ],
  }
  const catalogSnapshots = new RuntimeCatalogSnapshotRegistry(buildRuntimeCatalogSnapshot({
    id: 'snapshot_1',
    activeAgentManifest: DEFAULT_AGENT_MANIFEST,
    toolRegistry: new StaticToolRegistry([{
      name: 'movscript_script_locate',
      description: 'Read project scripts',
      permission: 'project.script.read',
      risk: 'read',
      source: 'mcp',
      projectScoped: true,
      requiresApprovalByDefault: false,
    }]),
    layeredRegistry,
  }))
  const run = makeRun({
    agentManifest: explicitManifest,
    metadata: {
      manifestSource: 'custom',
      skillState: {
        loadedSkillIds: ['movscript.script_reading'],
        unloadedSkillIds: [],
      },
    },
  })

  const result = await refreshRuntimeAgentGraphCatalog({
    run,
    catalogSnapshots,
    mcpClient: new FakeCapabilityClient([{
      name: 'movscript_script_locate',
      description: 'Read project scripts',
      inputSchema: { type: 'object' },
    }]),
    currentProjectId: 5,
    userMessage: '查看剧本',
    debugContext: debugContext(),
    history: [],
  })

  assert.equal(result.manifest.id, 'explicit_manifest')
  assert.deepEqual(result.skills.map((skill) => skill.id), ['movscript.script_reading'])
  assert.ok(result.manifest.tools.some((grant) => grant.name === 'core_skill_update'))
  assert.ok(result.manifest.tools.some((grant) => grant.name === 'movscript_script_locate'))
  assert.equal(
    result.capabilities.byName.movscript_script_locate?.available,
    true,
    JSON.stringify(result.capabilities.byName.movscript_script_locate),
  )
})

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'in_progress',
    runtimeLimits: { approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    steps: [],
    ...overrides,
  }
}

function debugContext() {
  return {
    route: { pathname: '/agent' },
    projects: [],
    selection: null,
    recentResources: [],
    attachments: [],
    memories: [],
    labels: [],
  }
}

class FakeCapabilityClient implements CapabilityMCPClient {
  constructor(private readonly tools: MCPTool[] = []) {}

  async initialize(): Promise<void> {}

  async listTools(): Promise<MCPTool[]> {
    return this.tools
  }

  async listResources(): Promise<MCPResource[]> {
    return []
  }
}
