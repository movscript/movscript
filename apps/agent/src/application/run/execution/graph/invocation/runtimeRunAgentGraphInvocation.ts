import type { NormalizedClientInput } from '../../../../../context/input/client/normalizeClientInput.js'
import type { AgentRuntimeContractResolver } from '../../../../../contracts/runtime/runtimeContract.js'
import type { MemoryManager } from '../../../../../memory/manager/memoryManager.js'
import type { MCPClient } from '../../../../../adapters/mcp/client/mcpClient.js'
import type { AgentGraphResult } from '../../../../../orchestration/graph/result/agentGraphResult.js'
import type { AgentGraphInput } from '../../../../../orchestration/graph/types/agentGraphTypes.js'
import type { AgentCatalogToolManager } from '../../../../../orchestration/tools/execution/executor/toolExecutor.js'
import type { AgentRunRoundInfo } from '../../../../../state/run/core/round/runRound.js'
import type { AgentStore } from '../../../../../state/store/core/store.js'
import type {
  AgentMessage,
  AgentRun,
  AgentRunStep,
  AgentTraceEvent,
  AgentTraceEventKind,
  JSONValue,
} from '../../../../../state/shared/types.js'
import type { RuntimeModelAuthContext } from '../../../../../model/config/modelConfig.js'
import type { AgentRuntimeCatalogSnapshot, RuntimeCatalogSnapshotRegistry } from '../../../../catalog/snapshot/core/runtimeCatalogSnapshot.js'
import type { RuntimeRunContextPackage } from '../../context/package/runtimeRunContextPackage.js'
import type { RuntimeRunExecutionContext } from '../../context/input/runtimeRunExecutionContext.js'
import type { RuntimeRunSetupResolution } from '../../setup/resolution/runtimeRunSetupResolution.js'
import type { RuntimeHistoricalVisionContext } from '../../../../../context/prompt/turn/runtimeHistoricalVisionTypes.js'
import {
  invokeRuntimeAgentGraph,
  type RuntimeAgentGraphInvocationTraceInput,
} from '../../../../graph/invocation/runtimeAgentGraphInvocation.js'
import type { resolveRuntimeChatModelConfig } from '../../../../../model/config/modelConfig.js'
import type { CoreResourceFilePort } from '../../../../../ports/files/resourceFilePort.js'
import type { CoreImageProcessingPort } from '../../../../../ports/media/imageProcessingPort.js'
import type { CoreVideoFrameExtractionPort } from '../../../../../ports/media/videoFrameExtractionPort.js'
import type { RuntimeToolHandlerRegistry } from '../../../../../ports/runtime/runtimeToolHandlerPort.js'
import type { ExternalToolGatewayPort } from '../../../../../ports/tools/externalToolGatewayPort.js'
import type { AgentToolResultStore } from '../../../../../state/store/tool-results/toolResultStore.js'

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
  externalToolGatewayPort: ExternalToolGatewayPort
  resourceFilePort: CoreResourceFilePort
  imageProcessingPort?: CoreImageProcessingPort
  videoFrameExtractionPort: CoreVideoFrameExtractionPort
  contractResolver: AgentRuntimeContractResolver
  runtimeToolHandlers: RuntimeToolHandlerRegistry
  memoryManager: MemoryManager
  catalogManager: AgentCatalogToolManager
  toolResultStore?: AgentToolResultStore
  clientInput?: NormalizedClientInput
  historicalVisionContext?: RuntimeHistoricalVisionContext
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
    runtimeLimits: input.run.runtimeLimits,
    mcpClient: input.mcpClient,
    externalToolGatewayPort: input.externalToolGatewayPort,
    resourceFilePort: input.resourceFilePort,
    imageProcessingPort: input.imageProcessingPort,
    videoFrameExtractionPort: input.videoFrameExtractionPort,
    registry: input.catalogSnapshot.toolRegistry,
    runtimeToolHandlers: input.runtimeToolHandlers,
    contractResolver: input.contractResolver,
    memoryManager: input.memoryManager,
    catalogManager: input.catalogManager,
    ...(input.toolResultStore ? { toolResultStore: input.toolResultStore } : {}),
    catalogSnapshots: input.catalogSnapshots,
    currentProjectId: contextPackage.context.currentProjectId,
    ...(input.clientInput ? { clientInput: input.clientInput } : {}),
    ...(input.historicalVisionContext ? { historicalVisionContext: input.historicalVisionContext } : {}),
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
