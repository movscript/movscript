import type { NormalizedClientInput } from '../context/normalizeClientInput.js'
import type { AgentRuntimeContractResolver } from '../contracts/runtimeContract.js'
import type { BackendApplyClient } from '../drafts/backendApplyClient.js'
import type { AgentDraftStore } from '../drafts/draftStore.js'
import type { KnowledgeManager } from '../knowledge/knowledgeManager.js'
import type { MemoryManager } from '../memory/memoryManager.js'
import type { MCPClient } from '../mcpClient.js'
import type { AgentGraphResult } from '../orchestration/agentGraph.js'
import type { AgentCatalogToolManager } from '../orchestration/toolExecutor.js'
import type { AgentRunRoundInfo } from '../state/runRound.js'
import type { AgentStore } from '../state/store.js'
import type {
  AgentMessage,
  AgentRun,
  AgentRunStep,
  AgentTraceEvent,
  AgentTraceEventKind,
} from '../state/types.js'
import type { RuntimeModelAuthContext } from '../model/modelConfig.js'
import type { AgentGraphInput } from '../orchestration/agentGraph.js'
import type { AgentRuntimeCatalogSnapshot, RuntimeCatalogSnapshotRegistry } from './runtimeCatalogSnapshot.js'
import type { RuntimeRunContextPackage } from './runtimeRunContextPackage.js'
import type { RuntimeRunExecutionContext } from './runtimeRunExecutionContext.js'
import type { RuntimeRunSetupResolution } from './runtimeRunSetupResolution.js'
import {
  invokeRuntimeAgentGraph,
  type RuntimeAgentGraphInvocationTraceInput,
} from './runtimeAgentGraphInvocation.js'
import type { resolveRuntimeChatModelConfig } from '../model/modelConfig.js'

export interface RuntimeRunAgentGraphInvocationTraceInput {
  kind: AgentTraceEventKind
  title: string
  summary?: string
  status: AgentTraceEvent['status']
  round?: AgentRunRoundInfo
  data?: unknown
}

export async function invokeRuntimeRunAgentGraph(input: {
  run: AgentRun
  executionContext: RuntimeRunExecutionContext
  contextPackage: RuntimeRunContextPackage
  setup: RuntimeRunSetupResolution
  catalogSnapshots: RuntimeCatalogSnapshotRegistry
  catalogSnapshot: AgentRuntimeCatalogSnapshot
  auth: RuntimeModelAuthContext
  mcpClient: Pick<MCPClient, 'initialize' | 'callTool' | 'listTools' | 'listResources'>
  draftStore: AgentDraftStore
  backendApplyClient: BackendApplyClient
  contractResolver: AgentRuntimeContractResolver
  memoryManager: MemoryManager
  knowledgeManager: KnowledgeManager
  catalogManager: AgentCatalogToolManager
  clientInput?: NormalizedClientInput
  runStartedAt: number
  setupRound: AgentRunRoundInfo
  updateState?: Parameters<typeof invokeRuntimeAgentGraph>[0]['updateState']
  signal?: AbortSignal
  store: Pick<AgentStore, 'getThread' | 'updateRun'>
  timestampMs: () => number
  now: () => string
  recordTrace: (run: AgentRun, trace: RuntimeRunAgentGraphInvocationTraceInput) => void
  emitVolatileTrace: Parameters<typeof invokeRuntimeAgentGraph>[0]['emitVolatileTrace']
  createStep: (run: AgentRun, type: AgentRunStep['type'], round?: AgentRunRoundInfo, toolName?: string) => AgentRunStep
  emitRunSnapshot: (run: AgentRun) => void
  invokeGraph?: (graphInput: AgentGraphInput) => Promise<AgentGraphResult>
  resolveModelConfig?: typeof resolveRuntimeChatModelConfig
}): Promise<AgentGraphResult> {
  const execution = input.executionContext
  const contextPackage = input.contextPackage
  const setup = input.setup
  return invokeRuntimeAgentGraph({
    run: input.run,
    threadMessages: execution.thread.messages,
    manifest: setup.activeManifest,
    capabilities: setup.capabilities,
    skills: setup.skills,
    ...(setup.layers ? { layers: setup.layers } : {}),
    context: setup.debugContext,
    memories: contextPackage.memories,
    warnings: [...setup.capabilities.warnings],
    command: execution.command,
    userMessage: execution.userMessage,
    ...(execution.executionInput.sourceMessageId ? { rootUserMessageId: execution.executionInput.sourceMessageId } : {}),
    auth: input.auth,
    policy: input.run.policy,
    mcpClient: input.mcpClient,
    draftStore: input.draftStore,
    backendApplyClient: input.backendApplyClient,
    registry: input.catalogSnapshot.toolRegistry,
    contractResolver: input.contractResolver,
    memoryManager: input.memoryManager,
    knowledgeManager: input.knowledgeManager,
    catalogManager: input.catalogManager,
    catalogSnapshots: input.catalogSnapshots,
    currentProjectId: contextPackage.context.currentProjectId,
    ...(input.clientInput ? { clientInput: input.clientInput } : {}),
    runRole: input.run.role,
    updateState: input.updateState,
    ...(setup.runtimeContract ? { runtimeContract: setup.runtimeContract } : {}),
    setupRound: input.setupRound,
    runStartedAt: input.runStartedAt,
    contextDurationMs: contextPackage.contextDurationMs,
    memoryDurationMs: contextPackage.memoryDurationMs,
    capabilityDurationMs: setup.capabilityDurationMs,
    ...(contextPackage.focusTimings ? { focusTimings: contextPackage.focusTimings } : {}),
    signal: input.signal,
    store: input.store,
    timestampMs: input.timestampMs,
    now: input.now,
    recordTrace: input.recordTrace as (run: AgentRun, trace: RuntimeAgentGraphInvocationTraceInput) => void,
    emitVolatileTrace: input.emitVolatileTrace,
    createStep: input.createStep,
    emitRunSnapshot: input.emitRunSnapshot,
    ...(input.invokeGraph ? { invokeGraph: input.invokeGraph } : {}),
    ...(input.resolveModelConfig ? { resolveModelConfig: input.resolveModelConfig } : {}),
  })
}
