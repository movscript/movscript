import type { MutableRefObject, SetStateAction } from 'react'
import { notifyAgentTimelineAcceptedSource } from '@/features/agent/application/agentTimelineBridge'
import type { AgentTaskArtifactRef } from '@/features/agent/domain/agentArtifacts'
import { notifyAgentPanelRunSettled } from '@/features/agent/application/agentPanelBridge'
import { debugHttpRequestEvents, setActivityEventStatus, upsertActivityEvent } from '@/features/agent/application/agentSendActivity'
import { completeSendRunResult } from '@/features/agent/application/agentSendCompletion'
import { handleSendAbort, handleSendFailure } from '@/features/agent/application/agentSendError'
import { prepareSendRuntime } from '@/features/agent/application/agentSendRuntimeReadiness'
import { handleSendRunUpdate, handleSendRuntimeEvent, type AgentSendRunUpdateDeps } from '@/features/agent/application/agentSendStream'
import { createLocalAgentStopAbortError } from '@/features/agent/domain/agentRunControl'
import { localAgentClient, type AgentRun, type AgentRuntimeEventV2, type AgentThread } from '@/shared/infrastructure/localAgentClient'
import { syncRuntimeModelConfig } from '@/shared/infrastructure/runtimeChat'
import type { AgentAttachment, ChatRunActivityEvent } from '@/features/agent/state/agentStore'
import { useAgentSessionStore, type AgentConversationRuntimeState, type AgentPageTaskState } from '@/features/agent/state/agentSessionStore'
import {
  finishAgentPerformanceOperation,
  markAgentPerformancePhase,
  performanceNow,
  recordAgentPerformanceLog,
  recordAgentPerformanceMetric,
} from '@/features/agent/state/agentPerformanceStore'
import type { AgentSendWorkspace } from '@/features/agent/application/agentSendWorkspace'
import type { AgentLivePendingAssistantState } from '@/features/agent/presentation/agentLiveRunActivity'
import { runtimeAssistantProgressFromEvent } from '@movscript/event-state'

type ActivityEventsAction = SetStateAction<ChatRunActivityEvent[]>
type ConversationRuntimePatch = Partial<Omit<AgentConversationRuntimeState, 'conversationId' | 'updatedAt'>>
type ConversationRunPatch = Partial<Omit<AgentConversationRuntimeState, 'conversationId' | 'run' | 'runId' | 'threadId' | 'status' | 'updatedAt'>>

export interface CommitAgentSendWorkspaceDeps {
  userId: string
  conversationId: string
  localAgentOnline: boolean
  mcpEndpoint?: string
  activeSendAbortControllerRef: MutableRefObject<AbortController | null>
  cancelRequestedRunIds: Set<string>
  liveTraceEventsRef: MutableRefObject<ChatRunActivityEvent[]>
  clearConversationWorkspace: (userId: string, conversationId: string) => void
  setConversationSessionId?: (conversationId: string, sessionId: string) => void
  setConversationRuntimeSessionId?: (userId: string, conversationId: string, sessionId: string) => void
  setConversationRuntimeThreadId: (userId: string, conversationId: string, threadId: string) => void
  updateConversationTitle: (userId: string, conversationId: string, title: string) => void
  setLocalThreadId: (conversationId: string, threadId: string) => void
  setPageTaskRunning: (requestId: string | undefined, patch: { conversationId?: string; sessionId?: string; run?: AgentRun; thread?: AgentThread; threadId?: string; artifacts?: AgentTaskArtifactRef[] }) => void
  setConversationRun: (conversationId: string, run: AgentRun, patch?: ConversationRunPatch) => void
  setConversationRuntime: (conversationId: string, patch: ConversationRuntimePatch) => void
  setLiveTraceEvents: (action: ActivityEventsAction) => void
  setPendingHttpEvents: (action: ActivityEventsAction) => void
  setPendingAssistantState: (state: AgentLivePendingAssistantState | null | ((current: AgentLivePendingAssistantState | null) => AgentLivePendingAssistantState | null)) => void
  resetStreamingAssistant: (settledRunId?: string) => void
  updateStreamingAssistantText: (runId: string, text: string, roundIndex?: number) => void
  recordLiveTraceEvent: (event: AgentRuntimeEventV2) => void
  revokeAttachmentPreviewUrls: (items: AgentAttachment[]) => void
  setMentionRange: (range: null) => void
  refetchLocalAgentHealth: () => Promise<unknown>
  isLocalAgentAbortError: (error: unknown) => boolean
  thinkingStateForRun: (run: AgentRun) => AgentLivePendingAssistantState
  runTouchesAgentCatalog: (run: AgentRun) => boolean
  refreshAgentCatalogContext: () => void
  cancelGenerationJobIfActive: AgentSendRunUpdateDeps['cancelGenerationJobIfActive']
  toastError: (error: unknown) => void
  labels: {
    selectModelFirst: string
    localRuntime: string
  }
}

export async function commitAgentSendWorkspace(workspace: AgentSendWorkspace, deps: CommitAgentSendWorkspaceDeps): Promise<void> {
  const runtimeClient = workspace.localRuntime?.sessionId?.trim()
    ? localAgentClient.forSession({
        sessionId: workspace.localRuntime.sessionId.trim(),
        ...(workspace.localRuntime.workspaceDir?.trim() ? { workspaceDir: workspace.localRuntime.workspaceDir.trim() } : {}),
      })
    : localAgentClient
  const operationId = workspace.performanceOperationId
  const commitStartedMs = performanceNow()
  let streamProgressUpdateCount = 0
  let latestStreamProgressChars = 0
  const markSendPhase = (name: string, details?: Record<string, unknown>) => {
    markAgentPerformancePhase(operationId, name, details ? { details } : undefined)
    recordSendStageLatency(name, commitStartedMs)
    logAgentSendPhase(operationId, name, details)
  }
  markSendPhase('commit_start', {
    conversationId: deps.conversationId,
    workspaceId: workspace.id,
    route: workspace.route,
    localAgentOnline: deps.localAgentOnline,
    mcpEndpoint: deps.mcpEndpoint,
    attachmentCount: workspace.attachments.length,
    clientInputAttachmentCount: workspace.localRuntime?.clientInput?.attachments?.length ?? 0,
    threadId: workspace.localRuntime?.threadId,
    requestId: workspace.localRuntime?.requestId,
    hasAgentManifest: Boolean(workspace.localRuntime?.agentManifest),
    hasRuntimeLimits: Boolean(workspace.localRuntime?.runtimeLimits),
    sessionId: workspace.localRuntime?.sessionId,
  })
  if (!workspace.model.id) {
    deps.setConversationRuntime(deps.conversationId, { error: deps.labels.selectModelFirst, loading: false, building: false })
    notifyAgentPanelRunSettled({
      requestId: workspace.localRuntime?.requestId,
      status: 'error',
      error: deps.labels.selectModelFirst,
    })
    finishAgentPerformanceOperation(operationId, 'error', { error: deps.labels.selectModelFirst })
    return
  }

  deps.revokeAttachmentPreviewUrls(useAgentSessionStore.getState().getConversationWorkspace(deps.userId, deps.conversationId).attachments)
  deps.clearConversationWorkspace(deps.userId, deps.conversationId)
  markSendPhase('clear_workspace_done')
  deps.setMentionRange(null)
  deps.setConversationRuntime(deps.conversationId, { loading: true, building: false, approving: false, stopping: false, stopRequested: false, error: undefined })
  markSendPhase('runtime_loading_set')
  deps.cancelRequestedRunIds.clear()
  const httpEvents = debugHttpRequestEvents(workspace.httpRequests)
  deps.liveTraceEventsRef.current = httpEvents
  deps.setLiveTraceEvents(httpEvents)
  deps.setPendingHttpEvents(httpEvents)
  deps.setPendingAssistantState({ status: 'preparing_request' })
  const sourceMessageId = sourceMessageIdForWorkspace(workspace.id)
  markSendPhase('source_message_prepared', { sourceMessageId, attachmentCount: workspace.attachments.length })
  schedulePostCommitFrame(operationId)
  if (workspace.localRuntime?.requestId) {
    deps.setPageTaskRunning(workspace.localRuntime.requestId, {
      conversationId: deps.conversationId,
      ...(workspace.localRuntime.sessionId ? { sessionId: workspace.localRuntime.sessionId } : {}),
    })
  }
  deps.resetStreamingAssistant()
  const sendController = new AbortController()
  deps.activeSendAbortControllerRef.current = sendController
  const updateActivityEvents = (updater: (events: ChatRunActivityEvent[]) => ChatRunActivityEvent[]) => {
    deps.setPendingHttpEvents((current) => updater(current))
    deps.setLiveTraceEvents((current) => {
      const next = updater(current)
      deps.liveTraceEventsRef.current = next
      return next
    })
  }
  const startActivityEvent = (event: Omit<ChatRunActivityEvent, 'createdAt' | 'status'>) => {
    updateActivityEvents((current) => upsertActivityEvent(current, {
      ...event,
      status: 'started',
      createdAt: new Date().toISOString(),
    }))
  }
  const completeActivityEvent = (id: string, status: ChatRunActivityEvent['status'] = 'completed') => {
    updateActivityEvents((current) => setActivityEventStatus(current, id, status, new Date().toISOString()))
  }
  let sawRunUpdate = false
  let sawRuntimeEvent = false
  let sawAssistantProgress = false

  try {
    markSendPhase('prepare_runtime_start', {
      localAgentOnline: deps.localAgentOnline,
      localAgentBaseURL: runtimeClient.baseURL,
      mcpEndpoint: deps.mcpEndpoint,
    })
    await prepareSendRuntime({
      workspace,
      localAgentOnline: workspace.localRuntime?.sessionId ? false : deps.localAgentOnline,
      localAgentBaseURL: runtimeClient.baseURL,
      signal: sendController.signal,
      deps: {
        startActivityEvent,
        completeActivityEvent,
        markActivityEventStarted: (id) => updateActivityEvents((current) => setActivityEventStatus(current, id, 'started')),
        ensureRunning: () => runtimeClient.ensureRunning(),
        refetchLocalAgentHealth: deps.refetchLocalAgentHealth,
        syncRuntimeModelConfig: (modelId) => syncRuntimeModelConfig(modelId, { client: runtimeClient }),
        markPerformancePhase: markSendPhase,
        setPendingAssistantThinking: () => deps.setPendingAssistantState({ status: 'thinking' }),
        abortError: createLocalAgentStopAbortError,
      },
    })
    markSendPhase('prepare_runtime_done')
    markSendPhase('request_start', {
      threadId: workspace.localRuntime?.threadId,
      sourceMessageId,
      projectId: workspace.localRuntime?.projectId,
      clientInputAttachmentCount: workspace.localRuntime?.clientInput?.attachments?.length ?? 0,
      diagnosticCommand: Boolean(workspace.localRuntime?.diagnosticCommand),
    })
    const runResult = await runtimeClient.runMessageStream({
      threadId: workspace.localRuntime?.threadId,
      message: workspace.localRuntime?.clientInput?.message ?? workspace.visibleUserContent,
      sourceMessageId,
      clientInput: workspace.localRuntime?.clientInput,
      ...(workspace.localRuntime?.title ? { title: workspace.localRuntime.title } : {}),
      projectId: workspace.localRuntime?.projectId,
    }, {
      ...(workspace.localRuntime?.agentManifest ? { agentManifest: workspace.localRuntime.agentManifest } : {}),
      ...(workspace.localRuntime?.runtimeLimits ? { runtimeLimits: workspace.localRuntime.runtimeLimits } : {}),
      ...(workspace.localRuntime?.timeoutMs ? { timeoutMs: workspace.localRuntime.timeoutMs } : {}),
      pollMs: 120,
      signal: sendController.signal,
      onPhase: markSendPhase,
      onRunUpdate: (nextRun) => {
        if (sendController.signal.aborted) return
        if (!sawRunUpdate) {
          sawRunUpdate = true
          markSendPhase('first_run_update', { runId: nextRun.id, status: nextRun.status })
        }
        handleSendRunUpdate(nextRun, {
          conversationId: deps.conversationId,
          requestId: workspace.localRuntime?.requestId,
          liveEvents: () => deps.liveTraceEventsRef.current,
          cancelledRunIds: deps.cancelRequestedRunIds,
          getConversationRuntime: () => useAgentSessionStore.getState().conversationRuntimes[deps.conversationId],
          setPendingAssistantState: deps.setPendingAssistantState,
          thinkingStateForRun: deps.thinkingStateForRun,
          runTouchesAgentCatalog: deps.runTouchesAgentCatalog,
          refreshAgentCatalogContext: deps.refreshAgentCatalogContext,
          setPageTaskRunning: (requestId, patch) => deps.setPageTaskRunning(requestId, patch),
          setConversationRun: (run, patch) => deps.setConversationRun(deps.conversationId, run, patch),
          setConversationRuntime: (patch) => deps.setConversationRuntime(deps.conversationId, patch),
          cancelGenerationJobIfActive: deps.cancelGenerationJobIfActive,
          cancelRun: (runId, input) => runtimeClient.cancelRun(runId, input),
          getRun: (runId) => runtimeClient.getRun(runId),
        })
      },
      onSourceMessage: (sourceMessage, run) => {
        if (sendController.signal.aborted) return
        notifyAgentTimelineAcceptedSource(sourceMessage, run)
        markSendPhase('source_message_accepted', { threadId: sourceMessage.threadId, runId: run.id, runtimeMessageId: sourceMessage.id })
      },
      onRuntimeEvent: (event) => {
        if (sendController.signal.aborted) return
        if (!sawRuntimeEvent) {
          sawRuntimeEvent = true
          markSendPhase('first_runtime_event')
        }
        const progress = runtimeAssistantProgressFromEvent(event)
        if (progress) {
          if (!sawAssistantProgress) {
            sawAssistantProgress = true
            markSendPhase('first_assistant_progress', { runId: progress.runId, roundIndex: progress.roundIndex ?? 0, chars: progress.accumulated.length })
            scheduleFirstStreamingTextFrame(operationId, commitStartedMs)
          }
          streamProgressUpdateCount += 1
          latestStreamProgressChars = Math.max(latestStreamProgressChars, progress.accumulated.length)
          if (streamProgressUpdateCount === 10 || streamProgressUpdateCount % 50 === 0) {
            markSendPhase('stream_progress_sample', {
              updates: streamProgressUpdateCount,
              chars: latestStreamProgressChars,
            })
          }
          deps.updateStreamingAssistantText(progress.runId, progress.accumulated, progress.roundIndex)
        }
        handleSendRuntimeEvent(event, {
          updateConversationTitle: (title) => deps.updateConversationTitle(deps.userId, deps.conversationId, title),
          updateActivityEvents,
          recordLiveTraceEvent: deps.recordLiveTraceEvent,
          onRunUpdate: (nextRun) => {
            handleSendRunUpdate(nextRun, {
              conversationId: deps.conversationId,
              requestId: workspace.localRuntime?.requestId,
              liveEvents: () => deps.liveTraceEventsRef.current,
              cancelledRunIds: deps.cancelRequestedRunIds,
              getConversationRuntime: () => useAgentSessionStore.getState().conversationRuntimes[deps.conversationId],
              setPendingAssistantState: deps.setPendingAssistantState,
              thinkingStateForRun: deps.thinkingStateForRun,
              runTouchesAgentCatalog: deps.runTouchesAgentCatalog,
              refreshAgentCatalogContext: deps.refreshAgentCatalogContext,
              setPageTaskRunning: (requestId, patch) => deps.setPageTaskRunning(requestId, patch),
              setConversationRun: (run, patch) => deps.setConversationRun(deps.conversationId, run, patch),
              setConversationRuntime: (patch) => deps.setConversationRuntime(deps.conversationId, patch),
              cancelGenerationJobIfActive: deps.cancelGenerationJobIfActive,
              cancelRun: (runId, input) => runtimeClient.cancelRun(runId, input),
              getRun: (runId) => runtimeClient.getRun(runId),
            })
          },
        })
      },
    })
    markSendPhase('run_stream_done', { runId: runResult.run.id, status: runResult.run.status })
    if (sendController.signal.aborted) throw sendController.signal.reason ?? createLocalAgentStopAbortError()
    markSendPhase('complete_result_start')
    await completeSendRunResult({
      workspace,
      runResult,
      deps: {
        userId: deps.userId,
        conversationId: deps.conversationId,
        liveEvents: () => deps.liveTraceEventsRef.current,
        setLiveEventsRef: (events) => {
          deps.liveTraceEventsRef.current = events
        },
        getRun: (runId) => runtimeClient.getRun(runId),
        setLocalThreadId: deps.setLocalThreadId,
        setConversationSessionId: deps.setConversationSessionId,
        setConversationRuntimeSessionId: deps.setConversationRuntimeSessionId,
        setConversationRuntimeThreadId: deps.setConversationRuntimeThreadId,
        updateConversationTitle: deps.updateConversationTitle,
        setPageTaskRunning: deps.setPageTaskRunning,
        setConversationRun: deps.setConversationRun,
        setPendingHttpEvents: deps.setPendingHttpEvents,
        setPendingAssistantState: deps.setPendingAssistantState,
        setLiveTraceEvents: deps.setLiveTraceEvents,
        runTouchesAgentCatalog: deps.runTouchesAgentCatalog,
        refreshAgentCatalogContext: deps.refreshAgentCatalogContext,
        notifyRunSettled: notifyAgentPanelRunSettled,
      },
    })
    markSendPhase('complete_result_done')
    deps.resetStreamingAssistant(runResult.run.id)
    markSendPhase('streaming_assistant_reset', {
      runId: runResult.run.id,
      streamProgressUpdateCount,
      latestStreamProgressChars,
    })
    finishAgentPerformanceOperation(operationId, 'success', {
      runId: runResult.run.id,
      status: runResult.run.status,
      streamProgressUpdateCount,
      latestStreamProgressChars,
    })
  } catch (error) {
    logAgentSendPhase(operationId, 'error', {
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : undefined,
      aborted: sendController.signal.aborted,
      sawRunUpdate,
      sawRuntimeEvent,
      sawAssistantProgress,
    })
    if (deps.isLocalAgentAbortError(error) || sendController.signal.aborted) {
      finishAgentPerformanceOperation(operationId, 'cancelled', {
        error: error instanceof Error ? error.message : String(error),
      })
      handleSendAbort(error, {
        userId: deps.userId,
        conversationId: deps.conversationId,
        ...(workspace.localRuntime?.requestId ? { requestId: workspace.localRuntime.requestId } : {}),
        setPendingAssistantState: deps.setPendingAssistantState,
        setPendingHttpEvents: deps.setPendingHttpEvents,
        resetStreamingAssistant: deps.resetStreamingAssistant,
        setConversationRuntime: deps.setConversationRuntime,
        notifyRunSettled: notifyAgentPanelRunSettled,
      })
      return
    }
    finishAgentPerformanceOperation(operationId, 'error', {
      error: error instanceof Error ? error.message : String(error),
    })
    handleSendFailure(error, {
        userId: deps.userId,
        conversationId: deps.conversationId,
        ...(workspace.localRuntime?.requestId ? { requestId: workspace.localRuntime.requestId } : {}),
        setPendingAssistantState: deps.setPendingAssistantState,
      setPendingHttpEvents: deps.setPendingHttpEvents,
      resetStreamingAssistant: deps.resetStreamingAssistant,
      setConversationRuntime: deps.setConversationRuntime,
      notifyRunSettled: notifyAgentPanelRunSettled,
      toastError: deps.toastError,
      assistantErrorContent: (errorMessage) => `本地 Agent 暂不可用。\n\n启动命令：\`pnpm --filter @movscript/agent dev\`\n存活检查：\`${runtimeClient.baseURL}/livez\`\n兼容检查：\`${runtimeClient.baseURL}/runtime/compat\`\n\n错误：${errorMessage}`,
    })
  } finally {
    logAgentSendPhase(operationId, 'finally', {
      activeControllerCleared: deps.activeSendAbortControllerRef.current === sendController,
      cancelledRunCount: deps.cancelRequestedRunIds.size,
    })
    if (deps.activeSendAbortControllerRef.current === sendController) {
      deps.activeSendAbortControllerRef.current = null
    }
    deps.cancelRequestedRunIds.clear()
    deps.setPendingAssistantState(null)
    deps.setConversationRuntime(deps.conversationId, { stopRequested: false, stopping: false, loading: false, building: false })
    markSendPhase('final_state_cleared', {
      streamProgressUpdateCount,
      latestStreamProgressChars,
    })
  }
}

function schedulePostCommitFrame(operationId: string | undefined): void {
  if (!operationId || typeof requestAnimationFrame !== 'function') return
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      markAgentPerformancePhase(operationId, 'post_commit_frame')
    })
  })
}

function scheduleFirstStreamingTextFrame(operationId: string | undefined, commitStartedMs: number): void {
  if (!operationId || typeof requestAnimationFrame !== 'function') return
  requestAnimationFrame(() => {
    markAgentPerformancePhase(operationId, 'first_stream_text_visible')
    recordSendStageLatency('first_stream_text_visible', commitStartedMs)
  })
}

function recordSendStageLatency(stage: string, startedMs: number): void {
  const value = Math.max(0, performanceNow() - startedMs)
  recordAgentPerformanceMetric({
    name: 'frontend_agent_send_stage_latency_ms',
    value,
    unit: 'ms',
    labels: {
      area: 'agent_frontend',
      component: 'agent_chat',
      kind: 'send',
      stage,
      status: 'running',
    },
  })
  if (value < slowSendStageThresholdMs(stage)) return
  recordAgentPerformanceLog({
    level: 'warning',
    message: `Agent send stage slow: ${stage} ${Math.round(value)}ms`,
    details: {
      telemetryArea: 'agent_frontend',
      telemetryKind: 'slow_send_stage',
      stage,
      durationMs: value,
    },
  })
}

function slowSendStageThresholdMs(stage: string): number {
  if (stage === 'source_message_prepared' || stage === 'post_commit_frame') return 300
  if (stage === 'first_run_update' || stage === 'first_runtime_event' || stage === 'first_assistant_progress' || stage === 'first_stream_text_visible') return 1_500
  if (stage === 'streaming_assistant_reset' || stage === 'final_state_cleared') return 500
  return Number.POSITIVE_INFINITY
}

function sourceMessageIdForWorkspace(workspaceId: string): string {
  return `client-source:${workspaceId}`
}

function logAgentSendPhase(operationId: string | undefined, phase: string, details?: Record<string, unknown>): void {
  const payload = details ? ` details=${safeJSONStringify(compactLogDetails(details))}` : ''
  console.info(`[agent:send] phase=${phase}${operationId ? ` operationId=${operationId}` : ''}${payload}`)
}

function compactLogDetails(details: Record<string, unknown>): Record<string, unknown> {
  const compacted: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(details)) {
    if (value === undefined) continue
    compacted[key] = compactLogValue(value)
  }
  return compacted
}

function compactLogValue(value: unknown): unknown {
  if (typeof value === 'string') return value.length > 500 ? `${value.slice(0, 500)}...` : value
  if (typeof value !== 'object' || value === null) return value
  if (Array.isArray(value)) return value.slice(0, 20).map(compactLogValue)
  const output: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    if (/dataUrl|base64|content|message/i.test(key)) {
      output[key] = typeof child === 'string' ? `[omitted:${child.length}]` : '[omitted]'
      continue
    }
    output[key] = compactLogValue(child)
  }
  return output
}

function safeJSONStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch (error) {
    return JSON.stringify({ error: error instanceof Error ? error.message : String(error) })
  }
}
