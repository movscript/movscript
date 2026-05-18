import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST, type AgentManifest } from '../catalog/agentManifest.js'
import { buildLayeredCatalogRegistry, createEmptyCatalogRegistry } from '../catalog/registry.js'
import { StaticToolRegistry } from '../tools/toolRegistry.js'
import type { AgentRun, MCPResource, MCPTool } from '../state/types.js'
import type { CapabilityMCPClient } from '../tools/capabilityResolver.js'
import { buildRuntimeCatalogSnapshot, RuntimeCatalogSnapshotRegistry } from './runtimeCatalogSnapshot.js'
import { refreshRuntimeAgentGraphCatalog } from './runtimeAgentGraphCatalogRefresh.js'

test('refreshRuntimeAgentGraphCatalog captures current snapshot and refreshes default manifest capabilities', async () => {
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
    defaultAgentManifest: refreshedManifest,
    toolRegistry,
    layeredRegistry: createEmptyCatalogRegistry('catalog_v1'),
    pluginWarnings: ['catalog warning'],
  }))
  const run = makeRun({ metadata: { manifestSource: 'default' } })

  const result = await refreshRuntimeAgentGraphCatalog({
    run,
    catalogSnapshots,
    mcpClient: new FakeCapabilityClient(),
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
  const defaultManifest: AgentManifest = {
    ...DEFAULT_AGENT_MANIFEST,
    id: 'default_manifest',
  }
  const catalogSnapshots = new RuntimeCatalogSnapshotRegistry(buildRuntimeCatalogSnapshot({
    id: 'snapshot_1',
    defaultAgentManifest: defaultManifest,
    toolRegistry: new StaticToolRegistry([]),
    layeredRegistry: createEmptyCatalogRegistry('catalog_v1'),
  }))
  const run = makeRun({ agentManifest: explicitManifest, metadata: { manifestSource: 'custom' } })

  const result = await refreshRuntimeAgentGraphCatalog({
    run,
    catalogSnapshots,
    mcpClient: new FakeCapabilityClient(),
    userMessage: 'hello',
    debugContext: debugContext(),
    history: [],
  })

  assert.equal(result.manifest.id, 'explicit_manifest')
  assert.equal(run.agentManifest?.id, 'explicit_manifest')
})

test('refreshRuntimeAgentGraphCatalog resolves layered default profile when available', async () => {
  const layeredRegistry = buildLayeredCatalogRegistry({
    manifest: DEFAULT_AGENT_MANIFEST,
    tools: [],
    profiles: [{
      schema: 'movscript.agent.profile.v1',
      id: 'movscript.profile.default',
      version: '1.0.0',
      name: 'Layered Profile',
      persona: null,
      enabledPacks: [],
      enabledPolicies: [],
      enabledWorkflows: [],
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
    defaultAgentManifest: DEFAULT_AGENT_MANIFEST,
    toolRegistry,
    layeredRegistry,
  }))
  const run = makeRun({ metadata: { manifestSource: 'default' } })

  const result = await refreshRuntimeAgentGraphCatalog({
    run,
    catalogSnapshots,
    mcpClient: new FakeCapabilityClient(),
    userMessage: 'hello',
    debugContext: debugContext(),
    history: [],
  })

  assert.equal(result.manifest.id, 'movscript.profile.default')
  assert.deepEqual(result.manifest.tools, [{ name: 'tool_layered', mode: 'allow', approval: 'never' }])
  assert.equal(result.skillDiscovery?.availableSkills.length, 0)
  assert.equal(result.capabilities.blocked.some((tool) => tool.name === 'tool_layered' && tool.unavailableReason === 'workflow_scope'), true)
})

test('refreshRuntimeAgentGraphCatalog loads requested active skill state', async () => {
  const layeredRegistry = buildLayeredCatalogRegistry({
    manifest: DEFAULT_AGENT_MANIFEST,
    tools: [],
    layeredSkills: [{
      id: 'studio.expertise.action',
      kind: 'expertise',
      version: '1.0.0',
      name: 'Action Director',
      description: 'Action direction expertise',
      priority: 80,
      enabled: true,
      instructionTemplate: 'Design readable action beats.',
      loadMode: 'on_demand',
    }],
    profiles: [{
      schema: 'movscript.agent.profile.v1',
      id: 'movscript.profile.default',
      version: '1.0.0',
      name: 'Layered Profile',
      persona: null,
      enabledPacks: [],
      enabledPolicies: [],
      enabledWorkflows: [],
      toolGrants: [],
    }],
  })
  const catalogSnapshots = new RuntimeCatalogSnapshotRegistry(buildRuntimeCatalogSnapshot({
    id: 'snapshot_1',
    defaultAgentManifest: DEFAULT_AGENT_MANIFEST,
    toolRegistry: new StaticToolRegistry([]),
    layeredRegistry,
  }))
  const run = makeRun({
    metadata: {
      manifestSource: 'default',
      skillState: {
        loadedSkillIds: ['studio.expertise.action'],
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

  assert.deepEqual(result.skills.map((skill) => skill.id), ['studio.expertise.action'])
  assert.equal(result.skills[0]?.metadata?.loadMode, 'on_demand')
})

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'in_progress',
    policy: {
      approvalMode: 'interactive',
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
  async initialize(): Promise<void> {}

  async listTools(): Promise<MCPTool[]> {
    return []
  }

  async listResources(): Promise<MCPResource[]> {
    return []
  }
}
