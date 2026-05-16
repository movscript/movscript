import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST } from '../catalog/agentManifest.js'
import { createEmptyCatalogRegistry } from '../catalog/registry.js'
import type { AgentCommandRuntime } from '../context/commandRouter.js'
import type { AgentRuntimeContract, AgentRuntimeContractResolver } from '../contracts/runtimeContract.js'
import { InMemoryAgentDraftStore } from '../drafts/draftStore.js'
import { KnowledgeManager } from '../knowledge/knowledgeManager.js'
import { MemoryManager } from '../memory/memoryManager.js'
import { InMemoryAgentMemoryStore } from '../memory/memoryStore.js'
import type { AgentGraphInput } from '../orchestration/agentGraph.js'
import type { AgentCatalogToolManager } from '../orchestration/toolExecutor.js'
import { InMemoryAgentStore } from '../state/store.js'
import type {
  AgentCapabilitiesResponse,
  AgentRun,
  AgentRunStep,
  AgentTraceEvent,
  MCPResource,
  MCPTool,
  JSONValue,
} from '../state/types.js'
import { StaticToolRegistry } from '../tools/toolRegistry.js'
import { buildRuntimeCatalogSnapshot, RuntimeCatalogSnapshotRegistry } from './runtimeCatalogSnapshot.js'
import {
  invokeRuntimeAgentGraph,
  type RuntimeAgentGraphInvocationTraceInput,
} from './runtimeAgentGraphInvocation.js'

const setupRound = { roundId: 'round_0', roundIndex: 0, roundLabel: 'Setup', roundSource: 'setup' as const }
const command: AgentCommandRuntime = {
  name: 'chat',
  payload: 'hello',
  contextProfile: 'minimal',
  outputMode: 'natural',
  requiredTools: [],
  systemContract: 'Chat.',
}

test('invokeRuntimeAgentGraph records setup trace and passes normalized graph inputs', async () => {
  const run = makeRun({
    metadata: {
      forcedToolCall: { name: 'tool_a', args: { ok: true } },
      approvedToolNames: ['tool_a', 'tool_b'],
    },
  })
  const traces: RuntimeAgentGraphInvocationTraceInput[] = []
  let captured: AgentGraphInput | undefined
  const runtimeContract: AgentRuntimeContract = {
    id: 'contract_1',
    matches: () => true,
    commandOverride: () => ({ ...command, payload: 'override' }),
  }

  const result = await invokeRuntimeAgentGraph({
    ...baseInvocationInput(run),
    runtimeContract,
    rootUserMessageId: 'msg_root',
    runStartedAt: 1000,
    contextDurationMs: 11,
    memoryDurationMs: 12,
    capabilityDurationMs: 13,
    focusTimings: { totalMs: 11 },
    timestampMs: () => 1042,
    recordTrace: (_run, trace) => traces.push(trace),
    invokeGraph: async (input) => {
      captured = input
      return { status: 'completed', finalContent: 'done', assistantContents: ['done'], toolOutcomes: [], warnings: [] }
    },
  })

  assert.equal(result.status, 'completed')
  assert.equal(traces[0]?.title, 'Pre-model setup complete')
  assert.equal((traces[0]?.data as any)?.durationMs, 42)
  assert.equal((traces[0]?.data as any)?.contextMs, 11)
  assert.equal(captured?.run, run)
  assert.equal(captured?.manifest.id, DEFAULT_AGENT_MANIFEST.id)
  assert.deepEqual(captured?.capabilities.available.map((tool) => tool.name), ['tool_a'])
  assert.equal(captured?.command?.payload, 'override')
  assert.equal(captured?.rootUserMessageId, 'msg_root')
  assert.deepEqual(captured?.forcedToolCalls?.[0], { name: 'tool_a', args: { ok: true } })
  assert.deepEqual(captured?.approvedToolNames, ['tool_a', 'tool_b'])
  assert.equal(captured?.config.modelConfigId, 1)
})

test('invokeRuntimeAgentGraph exposes catalog refresh callback with latest snapshot resolution', async () => {
  const run = makeRun({ metadata: { manifestSource: 'default' } })
  const refreshedRegistry = new StaticToolRegistry([tool('tool_refreshed')])
  const catalogSnapshots = new RuntimeCatalogSnapshotRegistry(buildRuntimeCatalogSnapshot({
    id: 'snapshot_refreshed',
    defaultAgentManifest: {
      ...DEFAULT_AGENT_MANIFEST,
      id: 'manifest_refreshed',
      tools: [{ name: 'tool_refreshed', mode: 'allow', approval: 'never' }],
    },
    toolRegistry: refreshedRegistry,
    layeredRegistry: createEmptyCatalogRegistry('catalog_v1'),
  }))
  let refreshResult: Awaited<ReturnType<NonNullable<AgentGraphInput['onCatalogRefresh']>>> | undefined

  await invokeRuntimeAgentGraph({
    ...baseInvocationInput(run),
    catalogSnapshots,
    invokeGraph: async (input) => {
      refreshResult = await input.onCatalogRefresh?.()
      return { status: 'completed', finalContent: 'done', assistantContents: ['done'], toolOutcomes: [], warnings: [] }
    },
  })

  assert.equal(refreshResult?.manifest.id, 'manifest_refreshed')
  assert.equal(run.agentManifest?.id, 'manifest_refreshed')
  assert.equal(refreshResult?.registry, refreshedRegistry)
  assert.deepEqual(refreshResult?.capabilities.available.map((tool) => tool.name), ['tool_refreshed'])
})

test('invokeRuntimeAgentGraph fails before graph execution when model config is missing', async () => {
  await assert.rejects(
    () => invokeRuntimeAgentGraph({
      ...baseInvocationInput(makeRun()),
      resolveModelConfig: () => undefined,
      invokeGraph: async () => {
        throw new Error('graph should not run')
      },
    }),
    /no model config found/,
  )
})

function baseInvocationInput(run: AgentRun): Parameters<typeof invokeRuntimeAgentGraph>[0] {
  const store = new InMemoryAgentStore()
  store.createRun(run)
  const memoryManager = new MemoryManager(new InMemoryAgentMemoryStore())
  return {
    run,
    threadMessages: [],
    manifest: DEFAULT_AGENT_MANIFEST,
    capabilities: capabilities(),
    skills: [],
    context: debugContext(),
    memories: [],
    warnings: ['warning_1'],
    command,
    userMessage: 'hello',
    auth: {},
    policy: run.policy,
    mcpClient: new FakeMCPClient(),
    draftStore: new InMemoryAgentDraftStore(),
    backendApplyClient: { applyDraft: async () => ({ ok: true }) } as any,
    registry: new StaticToolRegistry([tool('tool_a')]),
    contractResolver: emptyContractResolver(),
    memoryManager,
    knowledgeManager: new KnowledgeManager({ listCollections: () => [], search: () => [] } as any),
    catalogManager: emptyCatalogManager(),
    catalogSnapshots: new RuntimeCatalogSnapshotRegistry(buildRuntimeCatalogSnapshot({
      id: 'snapshot_1',
      defaultAgentManifest: DEFAULT_AGENT_MANIFEST,
      toolRegistry: new StaticToolRegistry([tool('tool_a')]),
      layeredRegistry: createEmptyCatalogRegistry('catalog_v1'),
    })),
    setupRound,
    runStartedAt: 1000,
    contextDurationMs: 1,
    memoryDurationMs: 2,
    capabilityDurationMs: 3,
    store,
    timestampMs: () => 1010,
    now: () => '2026-01-01T00:00:01.000Z',
    recordTrace: () => {},
    emitVolatileTrace: () => {},
    createStep: (targetRun, type, round, toolName) => {
      const step: AgentRunStep = {
        id: 'step_1',
        runId: targetRun.id,
        type,
        status: 'in_progress',
        createdAt: '2026-01-01T00:00:00.000Z',
        roundId: round.roundId,
        roundIndex: round.roundIndex,
        roundLabel: round.roundLabel,
        roundSource: round.roundSource,
        ...(toolName ? { toolName } : {}),
      }
      targetRun.steps.push(step)
      return step
    },
    emitRunSnapshot: () => {},
    resolveModelConfig: () => ({
      provider: 'backend-model-config',
      modelConfigId: 1,
      model: 'model_config:1',
      useForChat: true,
      useForPlanner: true,
      updatedAt: '2026-01-01T00:00:00.000Z',
    }),
  }
}

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

function capabilities(): AgentCapabilitiesResponse {
  return {
    defaultAgentManifest: DEFAULT_AGENT_MANIFEST,
    mcp: { connected: true, resources: [], tools: [] },
    registry: [],
    resolvedTools: {
      discovered: [],
      available: [{
        name: 'tool_a',
        description: 'Tool A',
        source: 'runtime',
        registered: true,
        granted: true,
        permission: 'tool.a',
        approval: 'never',
        available: true,
        requiresApproval: false,
      }],
      blocked: [],
      byName: {},
    },
    warnings: [],
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

function emptyContractResolver(): AgentRuntimeContractResolver {
  return {
    find: () => undefined,
    requiresConfiguredModel: () => false,
  }
}

function emptyCatalogManager(): AgentCatalogToolManager {
  return {
    inspectAgentCatalog: () => ({}),
    reloadAgentCatalog: () => ({}),
    createAgentPlan: () => ({}),
    getAgentPlan: () => ({}),
    replanAgentPlan: () => ({}),
    spawnSubagent: () => ({}),
    listSubagents: () => ({}),
    waitSubagent: () => ({}),
    cancelSubagent: () => ({}),
  }
}

class FakeMCPClient {
  async initialize(): Promise<JSONValue> {
    return {}
  }

  async callTool(): Promise<JSONValue> {
    return {}
  }

  async listTools(): Promise<MCPTool[]> {
    return []
  }

  async listResources(): Promise<MCPResource[]> {
    return []
  }
}
