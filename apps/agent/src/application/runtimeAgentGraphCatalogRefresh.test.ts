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
    mcpClient: new FakeCapabilityClient([{
      name: 'movscript_read_project_scripts',
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
    mcpClient: new FakeCapabilityClient([{
      name: 'movscript_read_project_scripts',
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
    mcpClient: new FakeCapabilityClient([{
      name: 'movscript_read_project_scripts',
      description: 'Read project scripts',
      inputSchema: { type: 'object' },
    }]),
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

test('refreshRuntimeAgentGraphCatalog merges requested skill grants into explicit run manifest', async () => {
  const layeredRegistry = buildLayeredCatalogRegistry({
    manifest: {
      ...DEFAULT_AGENT_MANIFEST,
      tools: [
        { name: 'movscript_update_active_skills', mode: 'allow', approval: 'never' },
      ],
    },
    tools: [{
      name: 'movscript_read_project_scripts',
      description: 'Read project scripts',
      permission: 'project.script.read',
      risk: 'read',
      source: 'mcp',
      projectScoped: true,
      requiresApprovalByDefault: false,
    }],
    layeredTools: [{
      name: 'movscript_read_project_scripts',
      description: 'Read project scripts',
      inputSchema: { type: 'object' },
      permission: 'project.script.read',
      risk: 'read',
      projectScoped: true,
      defaults: { grant: 'allow', approval: 'never' },
      source: 'mcp',
    }],
    layeredSkills: [{
      id: 'movscript.workflow.script-reading',
      kind: 'workflow',
      version: '1.0.0',
      name: 'Script Reading',
      description: 'Read project scripts',
      priority: 80,
      enabled: true,
      instructionTemplate: 'Read scripts.',
      loadMode: 'manual',
      triggers: [{ kind: 'keyword', any: ['剧本'] }],
      toolRefs: ['tool://movscript_read_project_scripts'],
    }],
    profiles: [{
      schema: 'movscript.agent.profile.v1',
      id: 'movscript.profile.default',
      version: '1.0.0',
      name: 'Layered Profile',
      persona: null,
      enabledPacks: [],
      enabledPolicies: [],
      enabledWorkflows: ['movscript.workflow.script-reading'],
      toolGrants: [
        { name: 'movscript_update_active_skills', mode: 'allow', approval: 'never' },
      ],
    }],
  })
  const explicitManifest: AgentManifest = {
    schema: 'movscript.agent.current',
    id: 'explicit_manifest',
    version: '1.0.0',
    name: 'Explicit Manifest',
    tools: [
      { name: 'movscript_update_active_skills', mode: 'allow', approval: 'never' },
    ],
  }
  const catalogSnapshots = new RuntimeCatalogSnapshotRegistry(buildRuntimeCatalogSnapshot({
    id: 'snapshot_1',
    defaultAgentManifest: DEFAULT_AGENT_MANIFEST,
    toolRegistry: new StaticToolRegistry([{
      name: 'movscript_read_project_scripts',
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
        loadedSkillIds: ['movscript.workflow.script-reading'],
        unloadedSkillIds: [],
      },
    },
  })

  const result = await refreshRuntimeAgentGraphCatalog({
    run,
    catalogSnapshots,
    mcpClient: new FakeCapabilityClient([{
      name: 'movscript_read_project_scripts',
      description: 'Read project scripts',
      inputSchema: { type: 'object' },
    }]),
    currentProjectId: 5,
    userMessage: '查看剧本',
    debugContext: debugContext(),
    history: [],
  })

  assert.equal(result.manifest.id, 'explicit_manifest')
  assert.deepEqual(result.skills.map((skill) => skill.id), ['movscript.workflow.script-reading'])
  assert.ok(result.manifest.tools.some((grant) => grant.name === 'movscript_update_active_skills'))
  assert.ok(result.manifest.tools.some((grant) => grant.name === 'movscript_read_project_scripts'))
  assert.equal(
    result.capabilities.byName.movscript_read_project_scripts?.available,
    true,
    JSON.stringify(result.capabilities.byName.movscript_read_project_scripts),
  )
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
  constructor(private readonly tools: MCPTool[] = []) {}

  async initialize(): Promise<void> {}

  async listTools(): Promise<MCPTool[]> {
    return this.tools
  }

  async listResources(): Promise<MCPResource[]> {
    return []
  }
}
