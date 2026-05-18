import test from 'node:test'
import assert from 'node:assert/strict'
import type { AgentManifest } from '../catalog/agentManifest.js'
import type { ToolRegistry } from '../tools/toolRegistry.js'
import { createRuntimeCatalogOperationsBridge } from './runtimeCatalogOperationsBridge.js'

test('createRuntimeCatalogOperationsBridge wires capabilities, catalog reads, and reload commits', async () => {
  const calls: string[] = []
  const manifest = { id: 'manifest' } as unknown as AgentManifest
  const toolRegistry = { list: () => [{ name: 'tool' }] } as unknown as ToolRegistry
  const layeredRegistry = {
    skills: new Map([['skill', { id: 'skill' }]]),
    profiles: new Map([['profile', { id: 'profile' }]]),
    tools: new Map(),
  } as never
  let state = {
    defaultAgentManifest: manifest,
    toolRegistry,
    layeredRegistry,
    pluginWarnings: ['warning'],
  }
  const bridge = createRuntimeCatalogOperationsBridge({
    mcpClient: { label: 'mcp' } as never,
    catalogSnapshots: {
      replaceCurrent: () => calls.push('replaceCurrent'),
      getForRun: () => ({ defaultAgentManifest: manifest }),
    } as never,
    catalogSnapshotBridge: {
      createSnapshot: () => {
        calls.push('snapshot')
        return { id: 'snapshot' } as never
      },
    } as never,
    getState: () => state,
    commitReload: (next) => {
      calls.push(`commit:${next.pluginWarnings.join(',')}`)
      state = next as typeof state
    },
    capabilitiesResolver: async (input) => {
      calls.push(`capabilities:${input.pluginWarnings?.join(',')}:${input.request?.runRole ?? 'none'}`)
      return { resolvedTools: [], warnings: [] } as never
    },
    reloadRequest: (input) => {
      calls.push(`reload:${input.current.skillCount}:${input.current.toolCount}`)
      input.commit({
        status: 'reloaded',
        catalog: {
          manifest,
          registry: toolRegistry,
          layeredRegistry,
          warnings: ['after'],
        },
        pluginCatalogInfo: { skillCount: 1, toolCount: 1, metadata: { catalogVersion: 'v2' } },
        response: { status: 'reloaded' },
      } as never)
      return { status: 'reloaded' }
    },
  })

  await bridge.getCapabilities({ runRole: 'planner' })
  assert.deepEqual(bridge.listRegisteredTools(), [{ name: 'tool' }])
  assert.deepEqual(bridge.listSkillCatalog().map((skill) => skill.id), ['skill'])
  assert.deepEqual(bridge.listProfileCatalog().map((profile) => profile.id), ['profile'])
  assert.equal(bridge.getDefaultAgentManifest(), manifest)
  assert.deepEqual(bridge.reloadAgentCatalog(), { status: 'reloaded' })
  assert.deepEqual(calls, [
    'capabilities:warning:planner',
    'reload:1:0',
    'commit:after',
    'snapshot',
    'replaceCurrent',
  ])
})
