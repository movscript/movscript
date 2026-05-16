import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST, type AgentManifest } from '../catalog/agentManifest.js'
import { StaticToolRegistry } from '../tools/toolRegistry.js'
import { resolveRuntimeCapabilities } from './runtimeCapabilities.js'

test('resolveRuntimeCapabilities resolves the request manifest and forwards plugin warnings', async () => {
  const manifest: AgentManifest = {
    ...DEFAULT_AGENT_MANIFEST,
    id: 'agent.custom',
    tools: [{ name: 'planner_tool', mode: 'allow', approval: 'never' }],
  }
  const result = await resolveRuntimeCapabilities({
    mcpClient: mcpClient(),
    defaultAgentManifest: DEFAULT_AGENT_MANIFEST,
    toolRegistry: new StaticToolRegistry([{
      name: 'planner_tool',
      description: 'Planner tool',
      permission: 'planner.read',
      risk: 'read',
      source: 'runtime',
      projectScoped: false,
      requiresApprovalByDefault: false,
      allowedRunRoles: ['planner'],
    }]),
    pluginCatalogInfo: {
      skillsDir: '/tmp/skills',
      toolsDir: '/tmp/tools',
      skillCount: 1,
      toolCount: 1,
    },
    pluginWarnings: ['catalog warning'],
    request: {
      agentManifest: manifest,
      runRole: 'planner',
    },
  })

  assert.equal(result.defaultAgentManifest.id, 'agent.custom')
  assert.deepEqual(result.warnings, ['catalog warning'])
  assert.equal(result.pluginCatalog?.skillCount, 1)
  assert.equal(result.resolvedTools.byName.planner_tool?.available, true)
})

test('resolveRuntimeCapabilities preserves run role restrictions and includeResources behavior', async () => {
  let listResourcesCalled = false
  const client = mcpClient({
    listResources: async () => {
      listResourcesCalled = true
      return []
    },
  })
  const result = await resolveRuntimeCapabilities({
    mcpClient: client,
    defaultAgentManifest: {
      ...DEFAULT_AGENT_MANIFEST,
      tools: [{ name: 'planner_tool', mode: 'allow', approval: 'never' }],
    },
    toolRegistry: new StaticToolRegistry([{
      name: 'planner_tool',
      description: 'Planner tool',
      permission: 'planner.read',
      risk: 'read',
      source: 'runtime',
      projectScoped: false,
      requiresApprovalByDefault: false,
      allowedRunRoles: ['planner'],
    }]),
    request: {
      includeResources: false,
      runRole: 'worker',
    },
  })

  assert.equal(listResourcesCalled, false)
  assert.equal(result.mcp.resources.length, 0)
  assert.equal(result.resolvedTools.byName.planner_tool?.available, false)
  assert.equal(result.resolvedTools.byName.planner_tool?.unavailableReason, 'wrong_run_role')
})

function mcpClient(overrides: Partial<{
  initialize: () => Promise<unknown>
  listTools: () => Promise<[]>
  listResources: () => Promise<[]>
}> = {}) {
  return {
    initialize: overrides.initialize ?? (async () => undefined),
    listTools: overrides.listTools ?? (async () => []),
    listResources: overrides.listResources ?? (async () => []),
  }
}
