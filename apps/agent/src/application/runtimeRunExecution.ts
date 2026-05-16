import type { AgentRuntimeContractResolver } from '../contracts/runtimeContract.js'
import type { BackendApplyClient } from '../drafts/backendApplyClient.js'
import type { AgentDraftStore } from '../drafts/draftStore.js'
import type { KnowledgeManager } from '../knowledge/knowledgeManager.js'
import type { MemoryManager } from '../memory/memoryManager.js'
import type { AgentMemoryStore } from '../memory/memoryStore.js'
import type { MCPClient } from '../mcpClient.js'
import type { AgentCatalogToolManager } from '../orchestration/toolExecutor.js'
import type { AgentStore } from '../state/store.js'
import type { AgentCapabilitiesResponse } from '../state/types.js'
import { runBackendAuthMetadata, type RuntimeRunAuthRegistry } from './runAuth.js'
import type { RuntimeCatalogSnapshotRegistry } from './runtimeCatalogSnapshot.js'
import { applyRuntimeRunAgentGraphResultHandling } from './runtimeRunAgentGraphResultHandling.js'
import { invokeRuntimeRunAgentGraph } from './runtimeRunAgentGraphInvocation.js'
import type { RuntimeRunCancellationBridge } from './runtimeRunCancellationBridge.js'
import type { RuntimeRunCancellationGuard } from './runtimeRunCancellationGuard.js'
import { resolveRuntimeRunContextPackage } from './runtimeRunContextPackage.js'
import { applyRuntimeRunExecutionError } from './runtimeRunExecutionError.js'
import { loadRuntimeRunExecutionContext } from './runtimeRunExecutionContext.js'
import { applyRuntimeRunExecutionMetadata } from './runtimeRunExecutionMetadata.js'
import { prepareRuntimeRunExecutionPreflight } from './runtimeRunExecutionPreflight.js'
import { applyRuntimeRunExecutionStart } from './runtimeRunExecutionStart.js'
import { applyRuntimeRunLocalCommandHandling } from './runtimeRunLocalCommandHandling.js'
import { resolveRuntimeRunSetup } from './runtimeRunSetupResolution.js'
import type { RuntimeRunStepBridge } from './runtimeRunStepBridge.js'
import type { RuntimeStreamBridge } from './runtimeStreamBridge.js'
import type { RuntimePostRunRecordsBridge } from './runtimePostRunRecordsBridge.js'
import { applyRuntimeThreadTitleRequest } from './runtimeThreadTitle.js'
import { isoNow, makeId } from './runtimeIdentity.js'

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
  draftStore: AgentDraftStore
  backendApplyClient: BackendApplyClient
  memoryStore: AgentMemoryStore
  memoryManager: MemoryManager
  knowledgeManager: KnowledgeManager
  contractResolver: AgentRuntimeContractResolver
  catalogManager: AgentCatalogToolManager
  updateState?: AgentCapabilitiesResponse['updates']
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
        updateThread: (targetThread) => input.store.updateThread(targetThread),
        ...(targetRunId ? { runId: targetRunId } : {}),
        emitRunStreamEvent: (targetRunId, event) => input.streams.emitRunStreamEvent(targetRunId, event),
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
      clientInput,
    } = executionContext

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
      mcpClient: input.mcpClient,
      draftStore: input.draftStore,
      backendApplyClient: input.backendApplyClient,
      memoryManager: input.memoryManager,
      knowledgeManager: input.knowledgeManager,
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
      draftStore: input.draftStore,
      backendApplyClient: input.backendApplyClient,
      contractResolver: input.contractResolver,
      memoryManager: input.memoryManager,
      knowledgeManager: input.knowledgeManager,
      catalogManager: input.catalogManager,
      ...(clientInput ? { clientInput } : {}),
      updateState: input.updateState,
      setupRound,
      runStartedAt,
      signal: input.signal,
      store: input.store,
      timestampMs: Date.now,
      now: isoNow,
      recordTrace: (targetRun, trace) => input.streams.recordTraceEvent(targetRun, trace),
      emitVolatileTrace: (targetRun, trace) => input.streams.emitVolatileTraceEvent(targetRun, trace),
      createStep: (targetRun, type, round, toolName) => input.runSteps.createStep(targetRun, type, round, toolName),
      emitRunSnapshot: (targetRun) => input.streams.emitRunSnapshot(targetRun),
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
