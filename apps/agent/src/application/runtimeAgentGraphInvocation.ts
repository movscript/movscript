import type { NormalizedClientInput } from '../context/normalizeClientInput.js'
import type { AgentRuntimeContract } from '../contracts/runtimeContract.js'
import type { BackendApplyClient } from '../drafts/backendApplyClient.js'
import type { AgentDraftStore } from '../drafts/draftStore.js'
import type { KnowledgeManager } from '../knowledge/knowledgeManager.js'
import type { MemoryManager } from '../memory/memoryManager.js'
import type { MCPClient } from '../mcpClient.js'
import {
  runAgentGraph,
  type AgentGraphInput,
  type AgentGraphResult,
} from '../orchestration/agentGraph.js'
import type { AgentCatalogToolManager } from '../orchestration/toolExecutor.js'
import type { AgentRunRoundInfo } from '../state/runRound.js'
import {
  getApprovedToolNames,
} from '../state/runInteractionState.js'
import type {
  AgentCapabilitiesResponse,
  AgentDebugContextPanel,
  AgentMessage,
  AgentRun,
  AgentTraceEvent,
  AgentTraceEventKind,
  ToolCall,
} from '../state/types.js'
import { normalizeToolCall } from '../tools/toolCallInput.js'
import { resolveRuntimeChatModelConfig } from '../model/modelConfig.js'
import type { RuntimeCatalogSnapshotRegistry } from './runtimeCatalogSnapshot.js'
import { createRuntimeAgentGraphCallbacks } from './runtimeAgentGraphCallbacks.js'
import { refreshRuntimeAgentGraphCatalog } from './runtimeAgentGraphCatalogRefresh.js'
import type { AgentStore } from '../state/store.js'
import {
  cloneRuntimeInputMessagesForTrace,
  markRuntimeInputMessagesConsumed,
} from '../state/runtimeRunInputs.js'
import type { AgentRuntimeContractResolver } from '../contracts/runtimeContract.js'
import type { ToolRegistry } from '../tools/toolRegistry.js'
import type { AgentManifest } from '../catalog/agentManifest.js'
import type { AgentMemory } from '../memory/types.js'
import type { AgentCommandRuntime } from '../context/commandRouter.js'
import type { RuntimeLayerResolution } from '../skills/runtimeLayerResolver.js'
import type { RuntimeModelAuthContext } from '../model/modelConfig.js'

export interface RuntimeAgentGraphInvocationTraceInput {
  kind: AgentTraceEventKind
  title: string
  summary?: string
  status: AgentTraceEvent['status']
  round?: AgentRunRoundInfo
  data?: unknown
}

export async function invokeRuntimeAgentGraph(input: {
  run: AgentRun
  threadMessages: AgentMessage[]
  manifest: AgentManifest
  capabilities: AgentCapabilitiesResponse
  skills: AgentGraphInput['skills']
  layers?: RuntimeLayerResolution
  context: AgentDebugContextPanel
  memories: AgentMemory[]
  warnings: string[]
  command: AgentCommandRuntime
  userMessage: string
  rootUserMessageId?: string
  auth: RuntimeModelAuthContext
  policy: AgentRun['policy']
  mcpClient: Pick<MCPClient, 'initialize' | 'callTool' | 'listTools' | 'listResources'>
  draftStore: AgentDraftStore
  backendApplyClient: BackendApplyClient
  registry: ToolRegistry
  contractResolver: AgentRuntimeContractResolver
  memoryManager: MemoryManager
  knowledgeManager: KnowledgeManager
  catalogManager: AgentCatalogToolManager
  catalogSnapshots: RuntimeCatalogSnapshotRegistry
  currentProjectId?: number
  clientInput?: NormalizedClientInput
  runRole?: AgentRun['role']
  updateState?: AgentCapabilitiesResponse['updates']
  runtimeContract?: AgentRuntimeContract
  setupRound: AgentRunRoundInfo
  runStartedAt: number
  contextDurationMs: number
  memoryDurationMs: number
  capabilityDurationMs: number
  focusTimings?: unknown
  signal?: AbortSignal
  store: Pick<AgentStore, 'getThread' | 'updateRun'>
  timestampMs: () => number
  now: () => string
  recordTrace: (run: AgentRun, trace: RuntimeAgentGraphInvocationTraceInput) => void
  emitVolatileTrace: Parameters<typeof createRuntimeAgentGraphCallbacks>[0]['emitVolatileTrace']
  createStep: Parameters<typeof createRuntimeAgentGraphCallbacks>[0]['createStep']
  emitRunSnapshot: Parameters<typeof createRuntimeAgentGraphCallbacks>[0]['emitRunSnapshot']
  invokeGraph?: (graphInput: AgentGraphInput) => Promise<AgentGraphResult>
  resolveModelConfig?: typeof resolveRuntimeChatModelConfig
}): Promise<AgentGraphResult> {
  const setupCompletedAt = input.timestampMs()
  input.recordTrace(input.run, {
    kind: 'model_call',
    title: 'Pre-model setup complete',
    summary: `Context, memory, and tool setup finished in ${setupCompletedAt - input.runStartedAt}ms before the first model request.`,
    status: 'info',
    round: input.setupRound,
    data: {
      durationMs: setupCompletedAt - input.runStartedAt,
      contextMs: input.contextDurationMs,
      memoryMs: input.memoryDurationMs,
      capabilityMs: input.capabilityDurationMs,
      ...(input.focusTimings ? { focusTimings: input.focusTimings } : {}),
    },
  })

  const modelConfig = (input.resolveModelConfig ?? resolveRuntimeChatModelConfig)()
  if (!modelConfig) throw new Error('no model config found — configure a backend model config first')

  const graphCallbacks = createRuntimeAgentGraphCallbacks({
    store: input.store,
    run: input.run,
    now: input.now,
    recordTrace: input.recordTrace,
    emitVolatileTrace: input.emitVolatileTrace,
    createStep: input.createStep,
    emitRunSnapshot: input.emitRunSnapshot,
  })

  const result = await (input.invokeGraph ?? runAgentGraph)({
    run: input.run,
    threadMessages: input.threadMessages,
    manifest: input.manifest,
    capabilities: input.capabilities.resolvedTools,
    skills: input.skills,
    ...(input.layers?.skillDiscovery ? { skillDiscovery: input.layers.skillDiscovery } : {}),
    context: input.context,
    memories: input.memories,
    warnings: [...input.warnings],
    command: input.command,
    userMessage: input.userMessage,
    ...(input.rootUserMessageId ? { rootUserMessageId: input.rootUserMessageId } : {}),
    config: modelConfig,
    auth: input.auth,
    policy: input.policy,
    mcpClient: input.mcpClient,
    draftStore: input.draftStore,
    backendApplyClient: input.backendApplyClient,
    registry: input.registry,
    contractResolver: input.contractResolver,
    memoryManager: input.memoryManager,
    knowledgeManager: input.knowledgeManager,
    catalogManager: input.catalogManager,
    onCatalogRefresh: async () => refreshGraphCatalog(input),
    signal: input.signal,
    ...(input.runtimeContract?.commandOverride
      ? { command: input.runtimeContract.commandOverride({ userMessage: input.userMessage, manifest: input.manifest }) }
      : {}),
    ...(input.run.metadata?.forcedToolCall ? { forcedToolCalls: [normalizeToolCall(input.run.metadata.forcedToolCall) as ToolCall] } : {}),
    ...(getApprovedToolNames(input.run).length > 0 ? { approvedToolNames: getApprovedToolNames(input.run) } : {}),
    getThreadMessages: () => input.store.getThread(input.run.threadId)?.messages ?? input.threadMessages,
    onRuntimeInputConsumed: (messages, trace) => {
      markRuntimeInputMessagesConsumed(input.run, messages)
      input.store.updateRun(input.run)
      input.recordTrace(input.run, {
        kind: 'message',
        title: 'Runtime input consumed',
        summary: `${messages.length} running user message(s) added to the next model turn.`,
        status: 'completed',
        round: {
          roundId: `round_${trace.roundIndex}`,
          roundIndex: trace.roundIndex,
          roundLabel: trace.roundLabel,
          roundSource: trace.roundSource,
        },
        data: {
          messageIds: messages.map((message) => message.id),
          messages: cloneRuntimeInputMessagesForTrace(messages),
        },
      })
    },
    ...graphCallbacks,
  })
  return result
}

async function refreshGraphCatalog(input: {
  run: AgentRun
  catalogSnapshots: RuntimeCatalogSnapshotRegistry
  mcpClient: Pick<MCPClient, 'initialize' | 'callTool' | 'listTools' | 'listResources'>
  currentProjectId?: number
  userMessage: string
  context: AgentDebugContextPanel
  clientInput?: NormalizedClientInput
  threadMessages: AgentMessage[]
  runRole?: AgentRun['role']
  updateState?: AgentCapabilitiesResponse['updates']
}) {
  const refreshed = await refreshRuntimeAgentGraphCatalog({
    run: input.run,
    catalogSnapshots: input.catalogSnapshots,
    mcpClient: input.mcpClient,
    currentProjectId: input.currentProjectId,
    userMessage: input.userMessage,
    debugContext: input.context,
    ...(input.clientInput ? { clientInput: input.clientInput } : {}),
    history: input.threadMessages,
    runRole: input.runRole,
    updateState: input.updateState,
  })
  return {
    manifest: refreshed.manifest,
    capabilities: refreshed.capabilities,
    skills: refreshed.skills,
    ...(refreshed.skillDiscovery ? { skillDiscovery: refreshed.skillDiscovery } : {}),
    registry: refreshed.registry,
    warnings: refreshed.warnings,
  }
}
