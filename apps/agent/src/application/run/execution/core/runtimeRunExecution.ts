import type { AgentRuntimeContractResolver } from '../../../../contracts/runtime/runtimeContract.js'
import type { AgentWorkspaceStore } from '../../../../workspaces/store/workspaceStore.js'
import type { ReferenceManager } from '../../../../reference/manager/referenceManager.js'
import type { MemoryManager } from '../../../../memory/manager/memoryManager.js'
import type { AgentMemoryStore } from '../../../../memory/store/in-memory/memoryStore.js'
import type { MCPClient } from '../../../../adapters/mcp/client/mcpClient.js'
import type { AgentCatalogToolManager } from '../../../../orchestration/tools/execution/executor/toolExecutor.js'
import type { AgentStore } from '../../../../state/store/core/store.js'
import type { AgentCapabilitiesResponse, JSONValue } from '../../../../state/shared/types.js'
import type { WorkspaceApplyPort } from '../../../../ports/workspace/apply/workspaceApplyPort.js'
import type { WorkspaceApplyPreviewPort } from '../../../../ports/workspace/preview/workspaceApplyPreviewPort.js'
import type { WorkspaceWorkspaceSnapshotHydrationPort } from '../../../../ports/workspace/hydration/workspaceSnapshotHydrationPort.js'
import type { CoreResourceFilePort } from '../../../../ports/files/resourceFilePort.js'
import type { CoreImageProcessingPort } from '../../../../ports/media/imageProcessingPort.js'
import type { CoreVideoFrameExtractionPort } from '../../../../ports/media/videoFrameExtractionPort.js'
import type { RuntimeToolHandlerRegistry } from '../../../../ports/runtime/runtimeToolHandlerPort.js'
import type { ExternalToolGatewayPort } from '../../../../ports/tools/externalToolGatewayPort.js'
import type { AgentToolResultStore } from '../../../../state/store/tool-results/toolResultStore.js'
import { runBackendAuthMetadata, type RuntimeRunAuthRegistry } from '../../auth/runAuth.js'
import type { RuntimeCatalogSnapshotRegistry } from '../../../catalog/snapshot/core/runtimeCatalogSnapshot.js'
import { applyRuntimeRunAgentGraphResultHandling } from '../graph/result/runtimeRunAgentGraphResultHandling.js'
import { invokeRuntimeRunAgentGraph } from '../graph/invocation/runtimeRunAgentGraphInvocation.js'
import type { RuntimeRunCancellationBridge } from '../../control/cancellation/bridge/runtimeRunCancellationBridge.js'
import type { RuntimeRunCancellationGuard } from '../../control/guard/runtimeRunCancellationGuard.js'
import { resolveRuntimeRunContextPackage } from '../context/package/runtimeRunContextPackage.js'
import { applyRuntimeRunExecutionError } from '../errors/runtimeRunExecutionError.js'
import { loadRuntimeRunExecutionContext } from '../context/input/runtimeRunExecutionContext.js'
import { applyRuntimeRunExecutionMetadata } from '../setup/metadata/runtimeRunExecutionMetadata.js'
import { prepareRuntimeRunExecutionPreflight } from '../setup/preflight/runtimeRunExecutionPreflight.js'
import { applyRuntimeRunExecutionStart } from '../setup/start/runtimeRunExecutionStart.js'
import { applyRuntimeRunLocalCommandHandling } from '../localCommand/runtimeRunLocalCommandHandling.js'
import { resolveRuntimeRunSetup } from '../setup/resolution/runtimeRunSetupResolution.js'
import type { RuntimeRunStepBridge } from '../../steps/bridge/runtimeRunStepBridge.js'
import type { RuntimeStreamBridge } from '../../../stream/bridge/runtimeStreamBridge.js'
import type { RuntimePostRunRecordsBridge } from '../../../read/post-run/bridge/runtimePostRunRecordsBridge.js'
import { applyRuntimeThreadTitleRequest } from '../../../thread/title/runtimeThreadTitle.js'
import { isoNow, makeId } from '../../../../shared/runtime/runtimeIdentity.js'
import { prepareRuntimeVisionClientInput } from '../../input/vision/runtimeImageClientInput.js'
import { resolveRuntimeHistoricalVisionContext } from '../context/vision/runtimeHistoricalVisionContext.js'
import type { resolveRuntimeChatModelConfig } from '../../../../model/config/modelConfig.js'

export interface RuntimeRunExecutionDependencies {
  store: AgentStore
  catalogSnapshots: RuntimeCatalogSnapshotRegistry
  runAuth: RuntimeRunAuthRegistry
  runCancellationGuard: RuntimeRunCancellationGuard
  runCancellation: RuntimeRunCancellationBridge
  streams: RuntimeStreamBridge
  runSteps: RuntimeRunStepBridge
  postRunRecords: RuntimePostRunRecordsBridge
  mcpClient: Pick<MCPClient, 'initialize' | 'callTool' | 'listTools' | 'listResources'>
  workspaceStore: AgentWorkspaceStore
  externalToolGatewayPort: ExternalToolGatewayPort
  workspaceApplyPort: WorkspaceApplyPort
  workspaceApplyPreviewPort: WorkspaceApplyPreviewPort
  workspaceSnapshotHydrationPort: WorkspaceWorkspaceSnapshotHydrationPort
  resourceFilePort: CoreResourceFilePort
  imageProcessingPort?: CoreImageProcessingPort
  videoFrameExtractionPort: CoreVideoFrameExtractionPort
  memoryStore: AgentMemoryStore
  memoryManager: MemoryManager
  referenceManager: ReferenceManager
  contractResolver: AgentRuntimeContractResolver
  catalogManager: AgentCatalogToolManager
  toolResultStore?: AgentToolResultStore
  runtimeToolHandlers: RuntimeToolHandlerRegistry
  updateState?: AgentCapabilitiesResponse['updates']
  resolveModelConfig?: typeof resolveRuntimeChatModelConfig
}

export async function executeRuntimeRun(input: RuntimeRunExecutionDependencies & {
  runId: string
  signal?: AbortSignal
}): Promise<void> {
  const preflight = await prepareRuntimeRunExecutionPreflight({
    runId: input.runId,
    store: input.store,
    catalogSnapshots: input.catalogSnapshots,
    signal: input.signal,
    getAuth: (targetRunId) => input.runAuth.get(targetRunId),
    throwIfRunCancelled: (targetRunId, targetSignal) => input.runCancellationGuard.throwIfRunCancelled(targetRunId, targetSignal),
    ensureThreadTitle: async (thread, titleUser, auth, targetSignal, targetRunId) => {
      await applyRuntimeThreadTitleRequest({
        thread,
        userMessage: titleUser,
        authInput: auth,
        signal: targetSignal,
        now: () => isoNow(),
        getThread: (threadId) => input.store.getThread(threadId),
        updateThread: (targetThread) => input.store.updateThread(targetThread),
        ...(targetRunId ? { runId: targetRunId } : {}),
        emitRunStreamEvent: (targetRunId, event) => input.streams.emitRunStreamEvent(targetRunId, event),
        ...(input.resolveModelConfig ? { resolveModelConfig: input.resolveModelConfig } : {}),
      })
    },
  })
  if (preflight.skipped || !preflight.run || !preflight.catalogSnapshot) return
  const run = preflight.run
  let catalogSnapshot = preflight.catalogSnapshot

  const runStartedAt = Date.now()
  const setupRound = applyRuntimeRunExecutionStart({
    store: input.store,
    run,
    startedAt: isoNow(),
    projectionNow: isoNow(),
    recordTrace: (targetRun, trace) => input.streams.recordTraceEvent(targetRun, trace),
    emitRunSnapshot: (targetRun) => input.streams.emitRunSnapshot(targetRun),
  })

  try {
    input.runCancellationGuard.throwIfRunCancelled(run.id, input.signal)
    const executionContext = loadRuntimeRunExecutionContext({
      store: input.store,
      run,
      setupRound,
      recordTrace: (targetRun, trace) => input.streams.recordTraceEvent(targetRun, trace),
    })
    const {
      thread,
      userMessage: executionUserMessage,
      lastUser,
      command,
      clientInput: loadedClientInput,
    } = executionContext
    let clientInput = loadedClientInput
    if (clientInput) {
      const preparedVision = await prepareRuntimeVisionClientInput({
        run,
        clientInput,
        imageProcessingPort: input.imageProcessingPort,
        signal: input.signal,
      })
      clientInput = preparedVision.clientInput
      if (preparedVision.projections.length > 0 || preparedVision.warnings.length > 0) {
        input.streams.recordTraceEvent(run, {
          kind: 'context',
          title: 'Image attachments preprocessed',
          summary: `${preparedVision.projections.filter((item) => item.status === 'optimized').length} image attachment(s) prepared for model vision input.`,
          status: preparedVision.warnings.length > 0 ? 'info' : 'completed',
          round: setupRound,
          data: {
            eventType: 'context.image_attachments_preprocessed',
            projections: preparedVision.projections as unknown as JSONValue,
            warnings: preparedVision.warnings,
          },
        })
      }
    }
    const historicalVisionContext = await resolveRuntimeHistoricalVisionContext({
      run,
      thread,
      sourceMessageId: lastUser.id,
      ...(clientInput ? { currentClientInput: clientInput } : {}),
      ...(input.imageProcessingPort ? { imageProcessingPort: input.imageProcessingPort } : {}),
      signal: input.signal,
    })

    input.runCancellationGuard.throwIfRunCancelled(run.id, input.signal)
    const contextPackage = await resolveRuntimeRunContextPackage({
      store: input.store,
      run,
      thread,
      command,
      ...(clientInput ? { clientInput } : {}),
      userMessage: executionUserMessage,
      setupRound,
      timestampMs: Date.now,
      now: isoNow,
      mcpClient: input.mcpClient,
      memoryManager: input.memoryManager,
      signal: input.signal,
      recordTrace: (targetRun, trace) => input.streams.recordTraceEvent(targetRun, trace),
    })
    const {
      contextResult,
      contextError,
      contextStartedAt,
      contextDurationMs,
      context,
      focusTimings,
      memories,
      contextCompletedAt,
    } = contextPackage

    const setupResolution = await resolveRuntimeRunSetup({
      run,
      store: input.store,
      catalogSnapshot,
      contractResolver: input.contractResolver,
      mcpClient: input.mcpClient,
      contextResult,
      context,
      ...(contextError ? { contextError } : {}),
      contextDurationMs,
      contextStartedAt,
      contextCompletedAt,
      ...(focusTimings ? { focusTimings } : {}),
      memories,
      command,
      ...(clientInput ? { clientInput } : {}),
      userMessage: executionUserMessage,
      history: thread.messages,
      runRole: run.role,
      setupRound,
      authMetadata: runBackendAuthMetadata(input.runAuth.get(run.id)),
      updateState: input.updateState,
      timestampMs: Date.now,
      now: isoNow,
      recordTrace: (targetRun, trace) => input.streams.recordTraceEvent(targetRun, trace),
    })
    applyRuntimeRunExecutionMetadata({
      store: input.store,
      run,
      userRequest: executionUserMessage,
      ...(clientInput ? { clientInput } : {}),
    })
    input.runCancellationGuard.throwIfRunCancelled(run.id, input.signal)

    const localCommandHandled = await applyRuntimeRunLocalCommandHandling({
      store: input.store,
      run,
      thread,
      command,
      setup: setupResolution,
      memories,
      history: thread.messages,
      userMessage: executionUserMessage,
      memoryStore: input.memoryStore,
      contractResolver: input.contractResolver,
      catalogSnapshot,
      workspaceStore: input.workspaceStore,
      externalToolGatewayPort: input.externalToolGatewayPort,
      workspaceApplyPort: input.workspaceApplyPort,
      workspaceApplyPreviewPort: input.workspaceApplyPreviewPort,
      workspaceSnapshotHydrationPort: input.workspaceSnapshotHydrationPort,
      resourceFilePort: input.resourceFilePort,
      imageProcessingPort: input.imageProcessingPort,
      videoFrameExtractionPort: input.videoFrameExtractionPort,
      memoryManager: input.memoryManager,
      runtimeToolHandlers: input.runtimeToolHandlers,
      referenceManager: input.referenceManager,
      catalogManager: input.catalogManager,
      signal: input.signal,
      now: isoNow,
      timestampMs: Date.now,
      recordTrace: (targetRun, trace) => input.streams.recordTraceEvent(targetRun, trace),
      createStep: (targetRun, type, round, toolName) => input.runSteps.createStep(targetRun, type, round, toolName),
      emitAssistantMessage: (targetRun, message) => input.streams.emitAssistantMessage(targetRun, message),
      emitRunSnapshot: (targetRun, options) => input.streams.emitRunSnapshot(targetRun, options),
    })
    if (localCommandHandled) return

    const loopResult = await invokeRuntimeRunAgentGraph({
      run,
      executionContext,
      contextPackage,
      setup: setupResolution,
      catalogSnapshot,
      catalogSnapshots: input.catalogSnapshots,
      auth: input.runAuth.get(run.id),
      mcpClient: input.mcpClient,
      workspaceStore: input.workspaceStore,
      externalToolGatewayPort: input.externalToolGatewayPort,
      workspaceApplyPort: input.workspaceApplyPort,
      workspaceApplyPreviewPort: input.workspaceApplyPreviewPort,
      workspaceSnapshotHydrationPort: input.workspaceSnapshotHydrationPort,
      resourceFilePort: input.resourceFilePort,
      imageProcessingPort: input.imageProcessingPort,
      videoFrameExtractionPort: input.videoFrameExtractionPort,
      contractResolver: input.contractResolver,
      runtimeToolHandlers: input.runtimeToolHandlers,
      memoryManager: input.memoryManager,
      referenceManager: input.referenceManager,
      catalogManager: input.catalogManager,
      ...(input.toolResultStore ? { toolResultStore: input.toolResultStore } : {}),
      ...(clientInput ? { clientInput } : {}),
      ...(historicalVisionContext ? { historicalVisionContext } : {}),
      updateState: input.updateState,
      setupRound,
      runStartedAt,
      signal: input.signal,
      store: input.store,
      timestampMs: Date.now,
      now: isoNow,
      recordTrace: (targetRun, trace) => input.streams.recordTraceEvent(targetRun, trace),
      emitVolatileTrace: (targetRun, trace) => input.streams.emitVolatileTraceEvent(targetRun, trace),
      createStep: (targetRun, type, round, toolName, args) => input.runSteps.createStep(targetRun, type, round, toolName, args),
      emitRunSnapshot: (targetRun) => input.streams.emitRunSnapshot(targetRun),
      ...(input.resolveModelConfig ? { resolveModelConfig: input.resolveModelConfig } : {}),
    })
    catalogSnapshot = input.catalogSnapshots.getForRun(run.id)
    input.runCancellationGuard.throwIfRunCancelled(run.id, input.signal)

    applyRuntimeRunAgentGraphResultHandling({
      store: input.store,
      result: loopResult,
      run,
      thread,
      userMessage: executionUserMessage,
      postRunUserMessage: lastUser,
      memories,
      memoryStore: input.memoryStore,
      contextPackage,
      messageId: makeId('msg'),
      now: isoNow,
      markRunCancelled: (targetRun, reason) => input.runCancellation.markRunCancelled(targetRun, reason),
      recordTrace: (targetRun, trace) => input.streams.recordTraceEvent(targetRun, trace),
      createStep: (targetRun, type, round, toolName) => input.runSteps.createStep(targetRun, type, round, toolName),
      emitAssistantMessage: (targetRun, message) => input.streams.emitAssistantMessage(targetRun, message),
      emitRunSnapshot: (targetRun, options) => input.streams.emitRunSnapshot(targetRun, options),
      deferPostRunRecords: (targetRunId, deferInput) => input.postRunRecords.deferPostRunRecords(targetRunId, deferInput),
    })
    return
  } catch (error) {
    applyRuntimeRunExecutionError({
      store: input.store,
      run,
      error,
      messageId: makeId('msg'),
      now: isoNow(),
      projectionNow: isoNow(),
      stepCompletedAt: isoNow(),
      markRunCancelled: (targetRun) => input.runCancellation.markRunCancelled(targetRun),
      recordTrace: (targetRun, trace) => input.streams.recordTraceEvent(targetRun, trace),
      createStep: (targetRun, type, round, toolName) => input.runSteps.createStep(targetRun, type, round, toolName),
      emitAssistantMessage: (targetRun, message) => input.streams.emitAssistantMessage(targetRun, message),
      emitRunSnapshot: (targetRun, options) => input.streams.emitRunSnapshot(targetRun, options),
    })
  }
}
