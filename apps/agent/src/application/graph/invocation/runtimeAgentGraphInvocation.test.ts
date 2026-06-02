import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST } from '../../../catalog/manifest/agentManifest.js'
import { createEmptyCatalogRegistry } from '../../../catalog/registry/core/registry.js'
import type { AgentCommandRuntime } from '../../../context/command/commandRouter.js'
import type { AgentRuntimeContract, AgentRuntimeContractResolver } from '../../../contracts/runtime/runtimeContract.js'
import { InMemoryAgentWorkspaceStore } from '../../../workspaces/store/workspaceStore.js'
import { ReferenceManager } from '../../../reference/manager/referenceManager.js'
import { MemoryManager } from '../../../memory/manager/memoryManager.js'
import { InMemoryAgentMemoryStore } from '../../../memory/store/in-memory/memoryStore.js'
import type { AgentGraphInput } from '../../../orchestration/graph/types/agentGraphTypes.js'
import type { AgentCatalogToolManager } from '../../../orchestration/tools/execution/executor/toolExecutor.js'
import { InMemoryAgentStore } from '../../../state/store/core/store.js'
import type {
  AgentCapabilitiesResponse,
  AgentMessage,
  AgentPlan,
  AgentRun,
  AgentRunStep,
  AgentTraceEvent,
  MCPResource,
  MCPTool,
  JSONValue,
} from '../../../state/shared/types.js'
import { StaticToolRegistry } from '../../../tools/registry/core/toolRegistry.js'
import { buildRuntimeCatalogSnapshot, RuntimeCatalogSnapshotRegistry } from '../../catalog/snapshot/core/runtimeCatalogSnapshot.js'
import {
  invokeRuntimeAgentGraph,
  type RuntimeAgentGraphInvocationTraceInput,
} from './runtimeAgentGraphInvocation.js'
import {
  createDefaultWorkspaceApplyPort,
  createDefaultWorkspaceApplyPreviewPort,
  createDefaultExternalToolGatewayPort,
  createDefaultWorkspaceSnapshotHydrationPort,
  createDefaultProjectStandardsPort,
  createDefaultResourceFilePort,
  createDefaultVideoFrameExtractionPort,
  createDefaultRuntimeToolHandlerRegistry,
} from '../../shared/tools/runtimeToolHandlers.js'

const defaultRuntimeToolHandlers = createDefaultRuntimeToolHandlerRegistry()
const defaultWorkspaceApplyBackend = {
  async applyReview(): Promise<any> {
    return { performed: false, skippedReason: 'backend disabled in test' }
  },
  async previewApplyReview(): Promise<any> {
    return { performed: false, skippedReason: 'backend disabled in test' }
  },
}
const defaultWorkspaceApplyPort = createDefaultWorkspaceApplyPort(defaultWorkspaceApplyBackend)
const defaultWorkspaceApplyPreviewPort = createDefaultWorkspaceApplyPreviewPort(defaultWorkspaceApplyBackend)
const defaultProjectStandardsBackend = {
  async getProject(): Promise<any> {
    return { performed: false, skippedReason: 'backend disabled in test' }
  },
}

const setupRound = { roundId: 'round_0', roundIndex: 0, roundLabel: 'Setup', roundSource: 'setup' as const }
const command: AgentCommandRuntime = {
  name: 'chat',
  payload: 'hello',
  contextMode: 'minimal',
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

test('invokeRuntimeAgentGraph injects approved pending approvals as forced tool calls', async () => {
  const run = makeRun({
    metadata: { approvedToolNames: ['tool_a'] },
    pendingApprovals: [{
      id: 'approval_1',
      runId: 'run_1',
      toolName: 'tool_a',
      args: { ok: true },
      reason: 'Needs write approval.',
      status: 'approved',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:01.000Z',
      approvedAt: '2026-01-01T00:00:01.000Z',
    }],
  })
  let captured: AgentGraphInput | undefined

  await invokeRuntimeAgentGraph({
    ...baseInvocationInput(run),
    invokeGraph: async (input) => {
      captured = input
      return {
        status: 'completed',
        finalContent: 'done',
        assistantContents: ['done'],
        toolOutcomes: [{ call: input.forcedToolCalls![0], result: { ok: true } }],
        warnings: [],
      }
    },
  })

  assert.deepEqual(captured?.forcedToolCalls, [{ id: 'call_approval_1', name: 'tool_a', args: { ok: true } }])
  assert.deepEqual(run.metadata?.forcedApprovalIds, ['approval_1'])
})

test('invokeRuntimeAgentGraph does not reinject approval tool calls already forced', async () => {
  const run = makeRun({
    metadata: { approvedToolNames: ['tool_a'], forcedApprovalIds: ['approval_1'] },
    pendingApprovals: [{
      id: 'approval_1',
      runId: 'run_1',
      toolName: 'tool_a',
      args: { ok: true },
      reason: 'Needs write approval.',
      status: 'approved',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:01.000Z',
      approvedAt: '2026-01-01T00:00:01.000Z',
    }],
  })
  let captured: AgentGraphInput | undefined

  await invokeRuntimeAgentGraph({
    ...baseInvocationInput(run),
    invokeGraph: async (input) => {
      captured = input
      return { status: 'completed', finalContent: 'done', assistantContents: ['done'], toolOutcomes: [], warnings: [] }
    },
  })

  assert.equal(captured?.forcedToolCalls, undefined)
})

test('invokeRuntimeAgentGraph includes current plan in runtime state', async () => {
  const run = makeRun()
  const currentPlan: AgentPlan = {
    schema: 'movscript.agent.plan.v1',
    id: 'plan_1',
    threadId: run.threadId,
    runId: 'run_previous',
    items: [
      { step: 'Inspect current state', status: 'completed' },
      { step: 'Update prompt options', status: 'in_progress' },
    ],
    completedCount: 1,
    totalCount: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:01:00.000Z',
  }
  let captured: AgentGraphInput | undefined

  await invokeRuntimeAgentGraph({
    ...baseInvocationInput(run, { currentPlan }),
    invokeGraph: async (input) => {
      captured = input
      return { status: 'completed', finalContent: 'done', assistantContents: ['done'], toolOutcomes: [], warnings: [] }
    },
  })

  const runtimeState = captured?.runtimeState as any
  assert.equal(runtimeState?.currentPlan?.id, 'plan_1')
  assert.deepEqual(runtimeState?.currentPlan?.items, currentPlan.items)
  assert.equal(runtimeState?.currentPlan?.completedCount, 1)
})

test('invokeRuntimeAgentGraph exposes catalog refresh callback with latest snapshot resolution', async () => {
  const run = makeRun({ metadata: { manifestSource: 'default' } })
  const refreshedRegistry = new StaticToolRegistry([tool('tool_grantreshed')])
  const catalogSnapshots = new RuntimeCatalogSnapshotRegistry(buildRuntimeCatalogSnapshot({
    id: 'snapshot_refreshed',
    activeAgentManifest: {
      ...DEFAULT_AGENT_MANIFEST,
      id: 'manifest_refreshed',
      tools: [{ name: 'tool_grantreshed', mode: 'allow', approval: 'never' }],
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
  assert.deepEqual(refreshResult?.capabilities.available.map((tool) => tool.name), ['tool_grantreshed'])
})

test('invokeRuntimeAgentGraph records consumed runtime input as message refs without content', async () => {
  const run = makeRun()
  const traces: RuntimeAgentGraphInvocationTraceInput[] = []
  const runtimeInput: AgentMessage = {
    id: 'msg_runtime_1',
    threadId: run.threadId,
    role: 'user',
    content: 'large late user content should not be copied into trace',
    createdAt: '2026-01-01T00:00:02.000Z',
    metadata: {
      kind: 'runtime_input',
      targetRunId: run.id,
      mode: 'soft',
      status: 'accepted',
    },
  }

  await invokeRuntimeAgentGraph({
    ...baseInvocationInput(run),
    recordTrace: (_run, trace) => traces.push(trace),
    invokeGraph: async (input) => {
      input.onRuntimeInputConsumed?.([runtimeInput], {
        roundIndex: 1,
        roundLabel: 'Model turn 1',
        roundSource: 'model',
      })
      return { status: 'completed', finalContent: 'done', assistantContents: ['done'], toolOutcomes: [], warnings: [] }
    },
  })

  const trace = traces.find((item) => item.title === 'Runtime input consumed')
  const data = trace?.data as { messageIds?: string[]; messages?: Array<Record<string, unknown>> } | undefined
  assert.deepEqual(data?.messageIds, ['msg_runtime_1'])
  assert.equal(data?.messages?.[0]?.id, 'msg_runtime_1')
  assert.equal(data?.messages?.[0]?.content, undefined)
  assert.equal(data?.messages?.[0]?.chars, runtimeInput.content.length)
  assert.match(String(data?.messages?.[0]?.contentHash), /^sha256:/)
  assert.equal(data?.messages?.[0]?.contentMode, 'summary')
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

function baseInvocationInput(run: AgentRun, options: { currentPlan?: AgentPlan } = {}): Parameters<typeof invokeRuntimeAgentGraph>[0] {
  const store = new InMemoryAgentStore()
  store.createThread({
    id: run.threadId,
    status: 'running',
    archived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: options.currentPlan?.updatedAt ?? '2026-01-01T00:00:00.000Z',
    ...(options.currentPlan ? { currentPlan: options.currentPlan } : {}),
    messages: [],
  })
  store.createRun(run)
  const memoryManager = new MemoryManager(new InMemoryAgentMemoryStore())
  const mcpClient = new FakeMCPClient()
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
    runtimeLimits: run.runtimeLimits,
    mcpClient,
    workspaceStore: new InMemoryAgentWorkspaceStore(),
    externalToolGatewayPort: createDefaultExternalToolGatewayPort(mcpClient),
    workspaceApplyPort: defaultWorkspaceApplyPort,
    workspaceApplyPreviewPort: defaultWorkspaceApplyPreviewPort,
    workspaceSnapshotHydrationPort: createDefaultWorkspaceSnapshotHydrationPort(mcpClient),
    resourceFilePort: createDefaultResourceFilePort(mcpClient),
    videoFrameExtractionPort: createDefaultVideoFrameExtractionPort({ downloadResourceFile: async () => ({ performed: false, skippedReason: 'backend disabled in test' }) }),
    projectStandardsPort: createDefaultProjectStandardsPort(defaultProjectStandardsBackend),
    registry: new StaticToolRegistry([tool('tool_a')]),
    runtimeToolHandlers: defaultRuntimeToolHandlers,
    contractResolver: emptyContractResolver(),
    memoryManager,
    referenceManager: new ReferenceManager({ listLocalReferenceSets: () => [], search: () => [] } as any),
    catalogManager: emptyCatalogManager(),
    catalogSnapshots: new RuntimeCatalogSnapshotRegistry(buildRuntimeCatalogSnapshot({
      id: 'snapshot_1',
      activeAgentManifest: DEFAULT_AGENT_MANIFEST,
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

function capabilities(): AgentCapabilitiesResponse {
  return {
    activeAgentManifest: DEFAULT_AGENT_MANIFEST,
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
    updateActiveSkills: () => ({}),
    updatePlan: () => ({}),
      startWork: () => ({}),
getWork: () => ({}),
listWork: () => ({}),
waitWork: () => ({}),
      cancelWork: () => ({}),
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
