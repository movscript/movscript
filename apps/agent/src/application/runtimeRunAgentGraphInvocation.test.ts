import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST } from '../catalog/agentManifest.js'
import { createEmptyCatalogRegistry } from '../catalog/registry.js'
import type { AgentCommandRuntime } from '../context/commandRouter.js'
import type { AgentRuntimeContractResolver } from '../contracts/runtimeContract.js'
import { BackendApplyClient } from '../drafts/backendApplyClient.js'
import { InMemoryAgentDraftStore } from '../drafts/draftStore.js'
import { KnowledgeManager } from '../knowledge/knowledgeManager.js'
import { MemoryManager } from '../memory/memoryManager.js'
import { InMemoryAgentMemoryStore } from '../memory/memoryStore.js'
import type { AgentGraphInput } from '../orchestration/agentGraph.js'
import type { AgentCatalogToolManager } from '../orchestration/toolExecutor.js'
import { InMemoryAgentStore } from '../state/store.js'
import { buildAgentUpdateState } from '../updates/updatePolicy.js'
import type {
  AgentCapabilitiesResponse,
  AgentDebugContextPanel,
  AgentMessage,
  AgentRun,
  AgentRunStep,
  AgentThread,
  JSONValue,
  MCPResource,
  MCPTool,
} from '../state/types.js'
import { StaticToolRegistry } from '../tools/toolRegistry.js'
import { buildRuntimeCatalogSnapshot, RuntimeCatalogSnapshotRegistry } from './runtimeCatalogSnapshot.js'
import type { RuntimeRunContextPackage } from './runtimeRunContextPackage.js'
import type { RuntimeRunExecutionContext } from './runtimeRunExecutionContext.js'
import { invokeRuntimeRunAgentGraph } from './runtimeRunAgentGraphInvocation.js'
import type { RuntimeRunSetupResolution } from './runtimeRunSetupResolution.js'

const setupRound = { roundId: 'round_0', roundIndex: 0, roundLabel: 'Setup', roundSource: 'setup' as const }
const command: AgentCommandRuntime = {
  name: 'chat',
  payload: 'hello',
  contextProfile: 'minimal',
  outputMode: 'natural',
  requiredTools: [],
  systemContract: 'Chat.',
}

test('invokeRuntimeRunAgentGraph maps run execution context into graph invocation input', async () => {
  const run = makeRun()
  const store = new InMemoryAgentStore()
  const thread = makeThread()
  const traces: Array<{ title: string; data?: unknown }> = []
  let captured: AgentGraphInput | undefined

  const result = await invokeRuntimeRunAgentGraph({
    ...baseInput(store, run, thread),
    runStartedAt: 1000,
    timestampMs: () => 1045,
    recordTrace: (_run, trace) => traces.push({ title: trace.title, data: trace.data }),
    invokeGraph: async (input) => {
      captured = input
      return { status: 'completed', finalContent: 'done', assistantContents: ['done'], toolOutcomes: [], warnings: [] }
    },
  })

  assert.equal(result.status, 'completed')
  assert.equal(traces[0]?.title, 'Pre-model setup complete')
  assert.equal((traces[0]?.data as any)?.durationMs, 45)
  assert.equal(captured?.run, run)
  assert.equal(captured?.threadMessages, thread.messages)
  assert.equal(captured?.manifest.id, 'manifest_active')
  assert.deepEqual(captured?.capabilities.available.map((tool) => tool.name), ['tool_a'])
  assert.equal(captured?.skills.length, 1)
  assert.equal(captured?.context, baseDebugContext)
  assert.deepEqual(captured?.memories.map((memory) => memory.id), ['memory_1'])
  assert.deepEqual(captured?.warnings, ['capability warning'])
  assert.equal(captured?.command, command)
  assert.equal(captured?.userMessage, 'hello from run')
  assert.equal(captured?.rootUserMessageId, 'msg_user')
  assert.equal(captured?.auth.backendAuthToken, 'token_1')
  assert.equal(captured?.policy, run.policy)
  assert.equal(captured?.registry.get('tool_a')?.name, 'tool_a')
})

function baseInput(
  store: InMemoryAgentStore,
  run: AgentRun,
  thread: AgentThread,
): Parameters<typeof invokeRuntimeRunAgentGraph>[0] {
  const memoryManager = new MemoryManager(new InMemoryAgentMemoryStore())
  const toolRegistry = new StaticToolRegistry([tool('tool_a')])
  return {
    run,
    executionContext: executionContext(thread),
    contextPackage: contextPackage(),
    setup: setupResolution(),
    catalogSnapshot: buildRuntimeCatalogSnapshot({
      id: 'snapshot_1',
      defaultAgentManifest: DEFAULT_AGENT_MANIFEST,
      toolRegistry,
      layeredRegistry: createEmptyCatalogRegistry('catalog_v1'),
    }),
    catalogSnapshots: new RuntimeCatalogSnapshotRegistry(buildRuntimeCatalogSnapshot({
      id: 'snapshot_current',
      defaultAgentManifest: DEFAULT_AGENT_MANIFEST,
      toolRegistry,
      layeredRegistry: createEmptyCatalogRegistry('catalog_v1'),
    })),
    auth: { backendAuthToken: 'token_1' },
    mcpClient: new FakeMCPClient(),
    draftStore: new InMemoryAgentDraftStore(),
    backendApplyClient: new BackendApplyClient(),
    contractResolver: emptyContractResolver(),
    memoryManager,
    knowledgeManager: new KnowledgeManager({ listCollections: () => [], search: () => [] } as any),
    catalogManager: emptyCatalogManager(),
    runStartedAt: 1000,
    setupRound,
    store,
    timestampMs: () => 1010,
    now: () => '2026-01-01T00:00:01.000Z',
    recordTrace: () => {},
    emitVolatileTrace: () => {},
    createStep: (targetRun, type, round, toolName) => {
      const step: AgentRunStep = {
        id: `step_${targetRun.steps.length + 1}`,
        runId: targetRun.id,
        type,
        status: 'in_progress',
        createdAt: '2026-01-01T00:00:00.000Z',
        ...(round ? {
          roundId: round.roundId,
          roundIndex: round.roundIndex,
          roundLabel: round.roundLabel,
          roundSource: round.roundSource,
        } : {}),
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

function executionContext(thread: AgentThread): RuntimeRunExecutionContext {
  return {
    thread,
    executionInput: {
      userMessage: 'hello from run',
      sourceMessageId: 'msg_user',
      sourceUser: thread.messages[0],
      baseUserMessage: 'hello from run',
      answeredInputCount: 0,
    },
    userMessage: 'hello from run',
    lastUser: thread.messages[0],
    command,
  }
}

const baseDebugContext: AgentDebugContextPanel = {
  route: { pathname: '/agent' },
  projects: [],
  project: undefined,
  selection: null,
  recentResources: [],
  attachments: [],
  memories: [],
  labels: [],
}

function contextPackage(): RuntimeRunContextPackage {
  return {
    contextResult: { currentProjectId: 7 },
    contextDurationMs: 11,
    contextStartedAt: 1001,
    context: { currentProjectId: 7 },
    focusTimings: { totalMs: 11 },
    memories: [{
      id: 'memory_1',
      projectId: 7,
      title: 'Memory One',
      kind: 'fact',
      content: 'Remember this',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }],
    memoryContext: { memories: [], memoryStartedAt: 1001, memoryLoadedAt: 1013, memoryDurationMs: 12 },
    memoryDurationMs: 12,
    contextCompletedAt: 1013,
  }
}

function setupResolution(): RuntimeRunSetupResolution {
  return {
    agentManifest: DEFAULT_AGENT_MANIFEST,
    activeManifest: { ...DEFAULT_AGENT_MANIFEST, id: 'manifest_active' },
    skills: [{
      id: 'skill_1',
      name: 'Skill One',
      description: 'Skill summary',
      enabled: true,
      instruction: 'Skill content',
      resolvedPriority: 10,
      activationReason: 'default',
      compiledInstruction: 'Skill content',
      warnings: [],
    }],
    capabilities: capabilities(),
    capabilityDurationMs: 13,
    debugContext: baseDebugContext,
    contextWarnings: [],
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
    warnings: ['capability warning'],
    updates: buildAgentUpdateState({
      runtimeVersion: 'test-runtime',
      manifestVersion: 'test-manifest',
    }),
  }
}

function makeRun(): AgentRun {
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
  }
}

function makeThread(): AgentThread {
  return {
    id: 'thread_1',
    title: 'Thread',
    messages: [message('msg_user', 'user', 'hello from run')],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function message(id: string, role: AgentMessage['role'], content: string): AgentMessage {
  return {
    id,
    threadId: 'thread_1',
    role,
    content,
    createdAt: '2026-01-01T00:00:00.000Z',
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
