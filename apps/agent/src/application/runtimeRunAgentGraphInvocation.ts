import type { NormalizedClientInput } from '../context/normalizeClientInput.js'
import type { AgentRuntimeContractResolver } from '../contracts/runtimeContract.js'
import type { AgentDraftStore } from '../drafts/draftStore.js'
import type { KnowledgeManager } from '../knowledge/knowledgeManager.js'
import type { MemoryManager } from '../memory/memoryManager.js'
import type { MCPClient } from '../mcpClient.js'
import type { AgentGraphResult } from '../orchestration/agentGraphResult.js'
import type { AgentGraphInput } from '../orchestration/agentGraphTypes.js'
import type { AgentCatalogToolManager } from '../orchestration/toolExecutor.js'
import type { AgentRunRoundInfo } from '../state/runRound.js'
import type { AgentStore } from '../state/store.js'
import type {
  AgentMessage,
  AgentRun,
  AgentRunStep,
  AgentTraceEvent,
  AgentTraceEventKind,
  JSONValue,
} from '../state/types.js'
import type { RuntimeModelAuthContext } from '../model/modelConfig.js'
import type { AgentRuntimeCatalogSnapshot, RuntimeCatalogSnapshotRegistry } from './runtimeCatalogSnapshot.js'
import type { RuntimeRunContextPackage } from './runtimeRunContextPackage.js'
import type { RuntimeRunExecutionContext } from './runtimeRunExecutionContext.js'
import type { RuntimeRunSetupResolution } from './runtimeRunSetupResolution.js'
import {
  invokeRuntimeAgentGraph,
  type RuntimeAgentGraphInvocationTraceInput,
} from './runtimeAgentGraphInvocation.js'
import type { resolveRuntimeChatModelConfig } from '../model/modelConfig.js'
import type { DraftApplyPort } from '../ports/draft/draftApplyPort.js'
import type { DraftApplyPreviewPort } from '../ports/draft/draftApplyPreviewPort.js'
import type { DraftProposalSnapshotHydrationPort } from '../ports/draft/proposalSnapshotHydrationPort.js'
import type { CoreResourceFilePort } from '../ports/core/resourceFilePort.js'
import type { CoreVideoFrameExtractionPort } from '../ports/core/videoFrameExtractionPort.js'
import type { MovscriptProjectStandardsPort } from '../ports/movscript/projectStandardsPort.js'
import type { RuntimeToolHandlerRegistry } from '../ports/runtime/runtimeToolHandlerPort.js'
import type { ExternalToolGatewayPort } from '../ports/tools/externalToolGatewayPort.js'
import type { AgentToolResultStore } from '../state/toolResultStore.js'

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
  externalToolGatewayPort: ExternalToolGatewayPort
  draftApplyPort: DraftApplyPort
  draftApplyPreviewPort: DraftApplyPreviewPort
  proposalSnapshotHydrationPort: DraftProposalSnapshotHydrationPort
  resourceFilePort: CoreResourceFilePort
  videoFrameExtractionPort: CoreVideoFrameExtractionPort
  projectStandardsPort: MovscriptProjectStandardsPort
  contractResolver: AgentRuntimeContractResolver
  runtimeToolHandlers: RuntimeToolHandlerRegistry
  memoryManager: MemoryManager
  knowledgeManager: KnowledgeManager
  catalogManager: AgentCatalogToolManager
  toolResultStore?: AgentToolResultStore
  clientInput?: NormalizedClientInput
  runStartedAt: number
  setupRound: AgentRunRoundInfo
  updateState?: Parameters<typeof invokeRuntimeAgentGraph>[0]['updateState']
  signal?: AbortSignal
  store: Pick<
    AgentStore,
    | 'getThread'
    | 'updateRun'
    | 'listRuns'
    | 'listRuntimeWorks'
    | 'listRuntimeInteractions'
    | 'listRuntimeContinuations'
  >
  timestampMs: () => number
  now: () => string
  recordTrace: (run: AgentRun, trace: RuntimeRunAgentGraphInvocationTraceInput) => void
  emitVolatileTrace: Parameters<typeof invokeRuntimeAgentGraph>[0]['emitVolatileTrace']
  createStep: (run: AgentRun, type: AgentRunStep['type'], round?: AgentRunRoundInfo, toolName?: string, args?: Record<string, JSONValue>) => AgentRunStep
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
    externalToolGatewayPort: input.externalToolGatewayPort,
    draftApplyPort: input.draftApplyPort,
    draftApplyPreviewPort: input.draftApplyPreviewPort,
    proposalSnapshotHydrationPort: input.proposalSnapshotHydrationPort,
    resourceFilePort: input.resourceFilePort,
    videoFrameExtractionPort: input.videoFrameExtractionPort,
    projectStandardsPort: input.projectStandardsPort,
    registry: input.catalogSnapshot.toolRegistry,
    runtimeToolHandlers: input.runtimeToolHandlers,
    contractResolver: input.contractResolver,
    memoryManager: input.memoryManager,
    knowledgeManager: input.knowledgeManager,
    catalogManager: input.catalogManager,
    ...(input.toolResultStore ? { toolResultStore: input.toolResultStore } : {}),
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
