import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST, type AgentManifest } from '../catalog/agentManifest.js'
import { buildLayeredCatalogRegistry, createEmptyCatalogRegistry } from '../catalog/registry.js'
import type { AgentCommandRuntime } from '../context/commandRouter.js'
import type { AgentRuntimeContract } from '../contracts/runtimeContract.js'
import { StaticToolRegistry } from '../tools/toolRegistry.js'
import type {
  AgentMessage,
  AgentPlan,
  AgentRun,
  AgentTask,
  AgentTraceEvent,
  MCPResource,
  MCPTool,
} from '../state/types.js'
import type { CapabilityMCPClient } from '../tools/capabilityResolver.js'
import { buildRuntimeCatalogSnapshot } from './runtimeCatalogSnapshot.js'
import {
  resolveRuntimeRunSetup,
  type RuntimeRunSetupResolutionTraceInput,
} from './runtimeRunSetupResolution.js'

const setupRound = { roundId: 'round_0', roundIndex: 0, roundLabel: 'Setup', roundSource: 'setup' as const }
const command: AgentCommandRuntime = {
  name: 'chat',
  payload: 'hello',
  contextProfile: 'minimal',
  outputMode: 'natural',
  requiredTools: [],
  systemContract: 'Chat.',
}

test('resolveRuntimeRunSetup resolves default manifest capabilities, metadata, contract, and traces', async () => {
  const defaultManifest: AgentManifest = {
    ...DEFAULT_AGENT_MANIFEST,
    id: 'default_manifest',
    name: 'Default Manifest',
    tools: [{ name: 'tool_a', mode: 'allow', approval: 'never' }],
  }
  const toolRegistry = new StaticToolRegistry([tool('tool_a')])
  const run = makeRun({ metadata: { manifestSource: 'default', initialUserMessageId: 'msg_1' } })
  const traces: RuntimeRunSetupResolutionTraceInput[] = []
  const contract: AgentRuntimeContract = {
    id: 'contract_default',
    matches: (manifest) => manifest.id === 'default_manifest',
  }

  const result = await resolveRuntimeRunSetup({
    run,
    store: emptyStore(),
    catalogSnapshot: buildRuntimeCatalogSnapshot({
      id: 'snapshot_1',
      defaultAgentManifest: defaultManifest,
      toolRegistry,
      layeredRegistry: createEmptyCatalogRegistry('catalog_v1'),
      pluginCatalogInfo: { skillsDir: '/skills', toolsDir: '/tools', skillCount: 0, toolCount: 1, metadata: { catalogVersion: 'catalog_v1' } },
      pluginWarnings: ['catalog warning'],
    }),
    contractResolver: { find: (manifest) => manifest && contract.matches(manifest) ? contract : undefined },
    mcpClient: new FakeCapabilityClient(),
    contextResult: {
      snapshot: {
        route: { pathname: '/production/7' },
        project: { id: 42, name: 'Project' },
        productionId: 7,
      },
    },
    context: { currentProjectId: 42, currentProductionId: 7 },
    contextError: 'focus offline',
    contextDurationMs: 15,
    contextStartedAt: 1000,
    contextCompletedAt: 1015,
    memories: [],
    command,
    userMessage: 'hello',
    history: [],
    runRole: 'planner',
    setupRound,
    authMetadata: { backendAuthToken: 'token_1' },
    timestampMs: monotonicClock(1100, 1112),
    now: () => '2026-01-01T00:00:01.112Z',
    recordTrace: (_run, trace) => traces.push(trace),
  })

  assert.equal(result.agentManifest.id, 'default_manifest')
  assert.equal(result.activeManifest.id, 'default_manifest')
  assert.equal(run.agentManifest?.id, 'default_manifest')
  assert.equal(result.runtimeContract?.id, 'contract_default')
  assert.equal(result.capabilityDurationMs, 12)
  assert.deepEqual(result.contextWarnings, ['Focus unavailable: focus offline'])
  assert.deepEqual(result.capabilities.warnings, ['catalog warning', 'Focus unavailable: focus offline'])
  assert.deepEqual(result.capabilities.resolvedTools.available.map((tool) => tool.name), ['tool_a'])
  assert.equal(run.metadata?.initialUserMessageId, 'msg_1')
  assert.equal(run.metadata?.backendAuthToken, 'token_1')
  assert.deepEqual(run.metadata?.visibleToolNames, ['tool_a'])
  assert.equal((run.metadata?.catalogSnapshot as any)?.id, 'snapshot_1')
  assert.equal((run.metadata?.catalogSnapshot as any)?.version, 'catalog_v1')
  assert.equal((run.metadata?.context as any)?.productionId, 7)
  assert.deepEqual(traces.map((trace) => trace.title), [
    'Runtime context resolved from fallback',
    'Agent manifest resolved',
    'Skills activated',
    'Tool catalog resolved',
    'Run context built',
  ])
  assert.equal(traces[0]?.status, 'blocked')
  assert.equal((traces[3]?.data as any)?.durationMs, 12)
  assert.equal((traces[4]?.data as any)?.warningCount, 4)
})

test('resolveRuntimeRunSetup applies layered default profile and stores profile limits', async () => {
  const layeredRegistry = buildLayeredCatalogRegistry({
    manifest: DEFAULT_AGENT_MANIFEST,
    tools: [],
    profiles: [{
      schema: 'movscript.agent.profile.v1',
      id: 'profile_layered',
      version: '1.0.0',
      name: 'Layered Profile',
      persona: null,
      enabledPacks: [],
      enabledPolicies: [],
      enabledWorkflows: [],
      toolGrants: [{ name: 'tool_layered', mode: 'allow', approval: 'never' }],
      limits: { maxActiveWorkflows: 2, maxKnowledgeCharsPerRun: 8000, maxKnowledgeChunksPerRun: 3 },
    }],
  })
  const run = makeRun({ metadata: { manifestSource: 'default' } })
  const traces: RuntimeRunSetupResolutionTraceInput[] = []

  const result = await resolveRuntimeRunSetup({
    run,
    store: emptyStore(),
    catalogSnapshot: buildRuntimeCatalogSnapshot({
      id: 'snapshot_layered',
      defaultAgentManifest: DEFAULT_AGENT_MANIFEST,
      toolRegistry: new StaticToolRegistry([tool('tool_layered')]),
      layeredRegistry,
    }),
    contractResolver: { find: () => undefined },
    mcpClient: new FakeCapabilityClient(),
    contextResult: { snapshot: { route: { pathname: '/agent' } } },
    context: {},
    contextDurationMs: 5,
    contextStartedAt: 1000,
    contextCompletedAt: 1005,
    memories: [],
    command,
    userMessage: 'hello',
    history: [],
    setupRound,
    timestampMs: monotonicClock(1100, 1100),
    now: () => '2026-01-01T00:00:01.100Z',
    recordTrace: (_run, trace) => traces.push(trace),
  })

  assert.equal(result.agentManifest.id, DEFAULT_AGENT_MANIFEST.id)
  assert.equal(result.activeManifest.id, 'profile_layered')
  assert.equal(run.agentManifest?.id, 'profile_layered')
  assert.equal(result.layers?.trace.profileId, 'profile_layered')
  assert.deepEqual(result.activeManifest.tools, [{ name: 'tool_layered', mode: 'allow', approval: 'never' }])
  assert.deepEqual(run.metadata?.limits, {
    maxActiveWorkflows: 2,
    maxKnowledgeCharsPerRun: 8000,
    maxKnowledgeChunksPerRun: 3,
  })
  assert.equal((traces[1]?.data as any)?.id, 'profile_layered')
  assert.equal((traces[4]?.data as any)?.profileId, 'profile_layered')
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

function tool(name: string) {
  return {
    name,
    description: name,
    permission: `tool.${name}`,
    risk: 'read' as const,
    source: 'runtime' as const,
    projectScoped: false,
    requiresApprovalByDefault: false,
  }
}

function emptyStore() {
  return {
    getPlan(_id: string): AgentPlan | undefined {
      return undefined
    },
    listTasks(_planId?: string): AgentTask[] {
      return []
    },
    listRuns(): AgentRun[] {
      return []
    },
  }
}

function monotonicClock(...values: number[]) {
  let index = 0
  return () => values[Math.min(index++, values.length - 1)] ?? 0
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
