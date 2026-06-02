import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST } from '../../../../../catalog/manifest/agentManifest.js'
import { createEmptyCatalogRegistry } from '../../../../../catalog/registry/core/registry.js'
import type { AgentCommandRuntime } from '../../../../../context/command/commandRouter.js'
import type { AgentRuntimeContractResolver } from '../../../../../contracts/runtime/runtimeContract.js'
import { InMemoryAgentWorkspaceStore } from '../../../../../workspaces/store/workspaceStore.js'
import { ReferenceManager } from '../../../../../reference/manager/referenceManager.js'
import { MemoryManager } from '../../../../../memory/manager/memoryManager.js'
import { InMemoryAgentMemoryStore } from '../../../../../memory/store/in-memory/memoryStore.js'
import type { AgentGraphInput } from '../../../../../orchestration/graph/types/agentGraphTypes.js'
import type { AgentCatalogToolManager } from '../../../../../orchestration/tools/execution/executor/toolExecutor.js'
import { InMemoryAgentStore } from '../../../../../state/store/core/store.js'
import { buildAgentUpdateState } from '../../../../../updates/policy/updatePolicy.js'
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
} from '../../../../../state/shared/types.js'
import { StaticToolRegistry } from '../../../../../tools/registry/core/toolRegistry.js'
import { buildRuntimeCatalogSnapshot, RuntimeCatalogSnapshotRegistry } from '../../../../catalog/snapshot/core/runtimeCatalogSnapshot.js'
import type { RuntimeRunContextPackage } from '../../context/package/runtimeRunContextPackage.js'
import type { RuntimeRunExecutionContext } from '../../context/input/runtimeRunExecutionContext.js'
import { invokeRuntimeRunAgentGraph } from './runtimeRunAgentGraphInvocation.js'
import type { RuntimeRunSetupResolution } from '../../setup/resolution/runtimeRunSetupResolution.js'
import {
  createDefaultWorkspaceApplyPort,
  createDefaultWorkspaceApplyPreviewPort,
  createDefaultExternalToolGatewayPort,
  createDefaultWorkspaceSnapshotHydrationPort,
  createDefaultProjectStandardsPort,
  createDefaultResourceFilePort,
  createDefaultVideoFrameExtractionPort,
  createDefaultRuntimeToolHandlerRegistry,
} from '../../../../shared/tools/runtimeToolHandlers.js'

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
  assert.equal(captured?.runtimeLimits, run.runtimeLimits)
  assert.equal(captured?.registry.get('tool_a')?.name, 'tool_a')
})

function baseInput(
  store: InMemoryAgentStore,
  run: AgentRun,
  thread: AgentThread,
): Parameters<typeof invokeRuntimeRunAgentGraph>[0] {
  const memoryManager = new MemoryManager(new InMemoryAgentMemoryStore())
  const toolRegistry = new StaticToolRegistry([tool('tool_a')])
  const mcpClient = new FakeMCPClient()
  return {
    run,
    executionContext: executionContext(thread),
    contextPackage: contextPackage(),
    setup: setupResolution(),
    catalogSnapshot: buildRuntimeCatalogSnapshot({
      id: 'snapshot_1',
      activeAgentManifest: DEFAULT_AGENT_MANIFEST,
      toolRegistry,
      layeredRegistry: createEmptyCatalogRegistry('catalog_v1'),
    }),
    catalogSnapshots: new RuntimeCatalogSnapshotRegistry(buildRuntimeCatalogSnapshot({
      id: 'snapshot_current',
      activeAgentManifest: DEFAULT_AGENT_MANIFEST,
      toolRegistry,
      layeredRegistry: createEmptyCatalogRegistry('catalog_v1'),
    })),
    auth: { backendAuthToken: 'token_1' },
    mcpClient,
    workspaceStore: new InMemoryAgentWorkspaceStore(),
    externalToolGatewayPort: createDefaultExternalToolGatewayPort(mcpClient),
    workspaceApplyPort: defaultWorkspaceApplyPort,
    workspaceApplyPreviewPort: defaultWorkspaceApplyPreviewPort,
    workspaceSnapshotHydrationPort: createDefaultWorkspaceSnapshotHydrationPort(mcpClient),
    resourceFilePort: createDefaultResourceFilePort(mcpClient),
    videoFrameExtractionPort: createDefaultVideoFrameExtractionPort({ downloadResourceFile: async () => ({ performed: false, skippedReason: 'backend disabled in test' }) }),
    projectStandardsPort: createDefaultProjectStandardsPort(defaultProjectStandardsBackend),
    contractResolver: emptyContractResolver(),
    runtimeToolHandlers: defaultRuntimeToolHandlers,
    memoryManager,
    referenceManager: new ReferenceManager({ listLocalReferenceSets: () => [], search: () => [] } as any),
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
    runtimeLimits: { approvalMode: 'interactive',
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
