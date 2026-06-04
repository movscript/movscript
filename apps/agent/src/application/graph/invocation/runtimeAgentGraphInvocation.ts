import type { NormalizedClientInput } from '../../../context/input/client/normalizeClientInput.js'
import type { AgentRuntimeContract } from '../../../contracts/runtime/runtimeContract.js'
import type { MemoryManager } from '../../../memory/manager/memoryManager.js'
import type { MCPClient } from '../../../adapters/mcp/client/mcpClient.js'
import { runAgentGraph } from '../../../orchestration/graph/runner/agentGraph.js'
import type { AgentGraphResult } from '../../../orchestration/graph/result/agentGraphResult.js'
import type { AgentGraphInput } from '../../../orchestration/graph/types/agentGraphTypes.js'
import type { AgentCatalogToolManager } from '../../../orchestration/tools/execution/executor/toolExecutor.js'
import type { AgentRunRoundInfo } from '../../../state/run/core/round/runRound.js'
import {
  getApprovedToolNames,
} from '../../../state/run/interaction/runInteractionState.js'
import type {
  AgentCapabilitiesResponse,
  AgentDebugContextPanel,
  AgentMessage,
  AgentPlan,
  AgentRun,
  AgentTraceEvent,
  AgentTraceEventKind,
  ToolCall,
  JSONValue,
} from '../../../state/shared/types.js'
import { normalizeToolCall } from '../../../tools/calls/input/toolCallInput.js'
import { resolveRuntimeChatModelConfig } from '../../../model/config/modelConfig.js'
import type { RuntimeCatalogSnapshotRegistry } from '../../catalog/snapshot/core/runtimeCatalogSnapshot.js'
import { createRuntimeAgentGraphCallbacks } from '../callbacks/runtimeAgentGraphCallbacks.js'
import { refreshRuntimeAgentGraphCatalog } from '../../catalog/graph/runtimeAgentGraphCatalogRefresh.js'
import type { AgentStore } from '../../../state/store/core/store.js'
import {
  markRuntimeInputMessagesConsumed,
} from '../../../state/run/input/runtime/runtimeRunInputs.js'
import { summarizeRuntimeInputMessagesTrace } from '../../../trace/summaries/interaction/messages/messageTrace.js'
import type { AgentRuntimeContractResolver } from '../../../contracts/runtime/runtimeContract.js'
import type { ToolRegistry } from '../../../tools/registry/core/toolRegistry.js'
import type { AgentManifest } from '../../../catalog/manifest/agentManifest.js'
import type { AgentMemory } from '../../../memory/shared/types.js'
import type { AgentCommandRuntime } from '../../../context/command/commandRouter.js'
import type { RuntimeLayerResolution } from '../../../skills/resolution/layers/runtimeLayerResolver.js'
import type { RuntimeModelAuthContext } from '../../../model/config/modelConfig.js'
import type { CoreResourceFilePort } from '../../../ports/files/resourceFilePort.js'
import type { CoreImageProcessingPort } from '../../../ports/media/imageProcessingPort.js'
import type { CoreVideoFrameExtractionPort } from '../../../ports/media/videoFrameExtractionPort.js'
import type { RuntimeToolHandlerRegistry } from '../../../ports/runtime/runtimeToolHandlerPort.js'
import type { ExternalToolGatewayPort } from '../../../ports/tools/externalToolGatewayPort.js'
import type { AgentToolResultStore } from '../../../state/store/tool-results/toolResultStore.js'
import type { RuntimeHistoricalVisionContext } from '../../../context/prompt/turn/runtimeHistoricalVisionTypes.js'

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
  runtimeLimits: AgentRun['runtimeLimits']
  mcpClient: Pick<MCPClient, 'initialize' | 'callTool' | 'listTools' | 'listResources'>
  externalToolGatewayPort: ExternalToolGatewayPort
  resourceFilePort: CoreResourceFilePort
  imageProcessingPort?: CoreImageProcessingPort
  videoFrameExtractionPort: CoreVideoFrameExtractionPort
  registry: ToolRegistry
  runtimeToolHandlers: RuntimeToolHandlerRegistry
  contractResolver: AgentRuntimeContractResolver
  memoryManager: MemoryManager
  catalogManager: AgentCatalogToolManager
  toolResultStore?: AgentToolResultStore
  catalogSnapshots: RuntimeCatalogSnapshotRegistry
  currentProjectId?: number
  clientInput?: NormalizedClientInput
  historicalVisionContext?: RuntimeHistoricalVisionContext
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
  const approvalForcedToolCalls = buildApprovedApprovalToolCalls(input.run)
  const forcedToolCalls = [
    ...(input.run.metadata?.forcedToolCall ? [normalizeToolCall(input.run.metadata.forcedToolCall) as ToolCall] : []),
    ...approvalForcedToolCalls.toolCalls,
  ]

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
    ...(input.clientInput ? { clientInput: input.clientInput } : {}),
    ...(input.historicalVisionContext ? { historicalVisionContext: input.historicalVisionContext } : {}),
    ...(input.rootUserMessageId ? { rootUserMessageId: input.rootUserMessageId } : {}),
    runtimeState: buildThreadRuntimeStateForPrompt(input),
    config: modelConfig,
    auth: input.auth,
    runtimeLimits: input.runtimeLimits,
    externalToolGatewayPort: input.externalToolGatewayPort,
    resourceFilePort: input.resourceFilePort,
    imageProcessingPort: input.imageProcessingPort,
    videoFrameExtractionPort: input.videoFrameExtractionPort,
    registry: input.registry,
    runtimeToolHandlers: input.runtimeToolHandlers,
    contractResolver: input.contractResolver,
    memoryManager: input.memoryManager,
    catalogManager: input.catalogManager,
    ...(input.toolResultStore ? { toolResultStore: input.toolResultStore } : {}),
    onCatalogRefresh: async () => refreshGraphCatalog(input),
    signal: input.signal,
    ...(input.runtimeContract?.commandOverride
      ? { command: input.runtimeContract.commandOverride({ userMessage: input.userMessage, manifest: input.manifest }) }
      : {}),
    ...(forcedToolCalls.length > 0 ? { forcedToolCalls } : {}),
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
          messages: summarizeRuntimeInputMessagesTrace(messages),
        },
      })
    },
    ...graphCallbacks,
  })
  markExecutedApprovalToolCalls(input, result, approvalForcedToolCalls.approvalIds)
  return result
}

function buildThreadRuntimeStateForPrompt(input: {
  run: AgentRun
  store: Pick<
    AgentStore,
    | 'getThread'
    | 'listRuns'
    | 'listRuntimeWorks'
    | 'listRuntimeInteractions'
    | 'listRuntimeContinuations'
  >
}): JSONValue {
  const thread = input.store.getThread(input.run.threadId)
  const runs = input.store.listRuns({ threadId: input.run.threadId })
  const works = input.store.listRuntimeWorks({ threadId: input.run.threadId })
  const interactions = input.store.listRuntimeInteractions({ threadId: input.run.threadId })
  const continuations = input.store.listRuntimeContinuations({ threadId: input.run.threadId })
  return {
    schema: 'movscript.thread-runtime-state.v1',
    currentRunId: input.run.id,
    currentRunStatus: input.run.status,
    activeRunIds: runs
      .filter((run) => run.status === 'queued' || run.status === 'in_progress' || run.status === 'requires_action')
      .map((run) => run.id),
    ...(thread?.currentPlan ? { currentPlan: runtimePlanSnapshot(thread.currentPlan) } : {}),
    works: works.map((work) => ({
      id: work.id,
      kind: work.kind,
      status: work.status,
      runId: work.runId,
      ...(work.externalHandle ? { externalHandle: work.externalHandle } : {}),
      createdAt: work.createdAt,
      updatedAt: work.updatedAt,
      ...(work.completedAt ? { completedAt: work.completedAt } : {}),
    })),
    pendingInteractions: interactions
      .filter((interaction) => interaction.status === 'pending')
      .map((interaction) => ({
        id: interaction.id,
        kind: interaction.kind,
        runId: interaction.runId,
        ...(interaction.workId ? { workId: interaction.workId } : {}),
        createdAt: interaction.createdAt,
      })),
    continuations: continuations
      .filter((continuation) => continuation.status === 'waiting' || continuation.status === 'ready')
      .map((continuation) => ({
        id: continuation.id,
        status: continuation.status,
        runId: continuation.runId,
        trigger: continuation.trigger,
        nextInput: continuation.nextInput,
        updatedAt: continuation.updatedAt,
      })),
  } as unknown as JSONValue
}

function runtimePlanSnapshot(plan: AgentPlan): JSONValue {
  return {
    id: plan.id,
    runId: plan.runId,
    updatedAt: plan.updatedAt,
    completedCount: plan.completedCount,
    totalCount: plan.totalCount,
    items: plan.items.map((item) => ({
      step: item.step,
      status: item.status,
    })),
  } as unknown as JSONValue
}

function buildApprovedApprovalToolCalls(run: AgentRun): { toolCalls: ToolCall[]; approvalIds: string[] } {
  const forcedApprovalIds = new Set(normalizeStringArray(run.metadata?.forcedApprovalIds))
  const toolCalls: ToolCall[] = []
  const approvalIds: string[] = []
  for (const approval of run.pendingApprovals ?? []) {
    if (approval.status !== 'approved' || forcedApprovalIds.has(approval.id)) continue
    toolCalls.push({
      id: `call_${approval.id}`,
      name: approval.toolName,
      args: approval.args ?? {},
      ...(approval.origin ? { origin: approval.origin } : {}),
    })
    approvalIds.push(approval.id)
  }
  return { toolCalls, approvalIds }
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)))
}

function markExecutedApprovalToolCalls(
  input: { run: AgentRun; store: Pick<AgentStore, 'updateRun'> },
  result: AgentGraphResult,
  approvalIds: string[],
): void {
  if (approvalIds.length === 0 || !('toolOutcomes' in result)) return
  const executedCallIds = new Set(result.toolOutcomes.map((outcome) => outcome.call.id).filter(Boolean))
  const executedApprovalIds = approvalIds.filter((approvalId) => executedCallIds.has(`call_${approvalId}`))
  if (executedApprovalIds.length === 0) return
  input.run.metadata = {
    ...(input.run.metadata ?? {}),
    forcedApprovalIds: Array.from(new Set([
      ...normalizeStringArray(input.run.metadata?.forcedApprovalIds),
      ...executedApprovalIds,
    ])),
  }
  input.store.updateRun(input.run)
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
