import type { MutableRefObject, SetStateAction } from 'react'
import { notifyAgentTimelineAcceptedSource } from '@/features/agent/application/agentTimelineBridge'
import type { AgentTaskArtifactRef } from '@/features/agent/domain/agentArtifacts'
import { notifyAgentPanelRunSettled } from '@/features/agent/application/agentPanelBridge'
import { debugHttpRequestEvents, setActivityEventStatus, upsertActivityEvent } from '@/features/agent/application/agentSendActivity'
import { completeSendRunResult } from '@/features/agent/application/agentSendCompletion'
import { handleSendAbort, handleSendFailure } from '@/features/agent/application/agentSendError'
import { prepareSendProviderSession } from '@/features/agent/application/agentSendProviderSessionReadiness'
import { handleSendRunUpdate, handleSendProviderSessionEvent, type AgentSendRunUpdateDeps } from '@/features/agent/application/agentSendStream'
import { createProviderSessionStopAbortError } from '@/features/agent/domain/agentRunControl'
import { providerSessionClient, type AgentMessage, type AgentRun, type ProviderSessionEventV2, type AgentThread } from '@/shared/infrastructure/providerSessionClient'
import { syncProviderSessionModelConfig } from '@/shared/infrastructure/providerSessionChat'
import type { AgentAttachment, ChatRunActivityEvent } from '@/features/agent/state/agentStore'
import { useAgentSessionStore, type AgentConversationRuntimePatch, type AgentPageTaskState } from '@/features/agent/state/agentSessionStore'
import {
  finishAgentPerformanceOperation,
  markAgentPerformancePhase,
  performanceNow,
  recordAgentPerformanceLog,
  recordAgentPerformanceMetric,
} from '@/features/agent/state/agentPerformanceStore'
import type { AgentSendWorkspace } from '@/features/agent/application/agentSendWorkspace'
import type { AgentThinkingState } from '@/features/agent/domain/agentThinkingState'
import { providerSessionAssistantProgressFromEvent } from '@/shared/infrastructure/provider-session-client/providerSessionEventFacts'

type ActivityEventsAction = SetStateAction<ChatRunActivityEvent[]>

export interface CommitAgentSendWorkspaceDeps {
  userId: string
  conversationId: string
  providerSessionOnline: boolean
  mcpEndpoint?: string
  activeSendAbortControllerRef: MutableRefObject<AbortController | null>
  cancelRequestedRunIds: Set<string>
  liveTraceEventsRef: MutableRefObject<ChatRunActivityEvent[]>
  clearConversationWorkspace: (userId: string, conversationId: string) => void
  setConversationProviderSessionTreeId?: (conversationId: string, providerSessionTreeId: string) => void
  setConversationProviderThreadBindingId?: (conversationId: string, providerThreadId: string) => void
  updateConversationTitle: (userId: string, conversationId: string, title: string) => void
  setPageTaskRunning: (requestId: string | undefined, patch: { conversationId?: string; sessionId?: string; run?: AgentRun; thread?: AgentThread; threadId?: string; artifacts?: AgentTaskArtifactRef[] }) => void
  setConversationRun: (conversationId: string, run: AgentRun, patch?: AgentConversationRuntimePatch) => void
  updateConversationRuntimeState: (conversationId: string, patch: AgentConversationRuntimePatch) => void
  setLiveTraceEvents: (action: ActivityEventsAction) => void
  setPendingHttpEvents: (action: ActivityEventsAction) => void
  setPendingAssistantState: (state: AgentThinkingState | null | ((current: AgentThinkingState | null) => AgentThinkingState | null)) => void
  resetStreamingAssistant: (settledRunId?: string) => void
  updateStreamingAssistantText: (runId: string, text: string, roundIndex?: number) => void
  recordLiveTraceEvent: (event: ProviderSessionEventV2) => void
  revokeAttachmentPreviewUrls: (items: AgentAttachment[]) => void
  setMentionRange: (range: null) => void
  refetchProviderSessionHealth: () => Promise<unknown>
  isProviderSessionAbortError: (error: unknown) => boolean
  thinkingStateForRun: (run: AgentRun) => AgentThinkingState
  cancelGenerationJobIfActive: AgentSendRunUpdateDeps['cancelGenerationJobIfActive']
  toastError: (error: unknown) => void
  labels: {
    selectModelFirst: string
    providerSession: string
  }
}

export async function commitAgentSendWorkspace(workspace: AgentSendWorkspace, deps: CommitAgentSendWorkspaceDeps): Promise<void> {
  const providerSessionRunClient = workspace.providerSession?.sessionId?.trim()
    ? providerSessionClient.forSession({
        sessionId: workspace.providerSession.sessionId.trim(),
        ...(workspace.providerSession.workspaceDir?.trim() ? { workspaceDir: workspace.providerSession.workspaceDir.trim() } : {}),
      })
    : providerSessionClient
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
    providerSessionOnline: deps.providerSessionOnline,
    mcpEndpoint: deps.mcpEndpoint,
    attachmentCount: workspace.attachments.length,
    clientInputAttachmentCount: workspace.providerSession?.clientInput?.attachments?.length ?? 0,
    threadId: workspace.providerSession?.threadId,
    requestId: workspace.providerSession?.requestId,
    hasProviderManifest: Boolean(workspace.providerSession?.providerManifest),
    hasProviderSessionLimits: Boolean(workspace.providerSession?.providerSessionLimits),
    sessionId: workspace.providerSession?.sessionId,
  })
  if (!workspace.model.id) {
    deps.updateConversationRuntimeState(deps.conversationId, { error: deps.labels.selectModelFirst, loading: false, building: false })
    notifyAgentPanelRunSettled({
      requestId: workspace.providerSession?.requestId,
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
  deps.updateConversationRuntimeState(deps.conversationId, { loading: true, building: false, approving: false, stopping: false, stopRequested: false, error: undefined })
  markSendPhase('provider_session_loading_set')
  deps.cancelRequestedRunIds.clear()
  const httpEvents = debugHttpRequestEvents(workspace.httpRequests)
  deps.liveTraceEventsRef.current = httpEvents
  deps.setLiveTraceEvents(httpEvents)
  deps.setPendingHttpEvents(httpEvents)
  deps.setPendingAssistantState({ status: 'preparing_request' })
  const sourceMessageId = sourceMessageIdForWorkspace(workspace.id)
  markSendPhase('source_message_prepared', { sourceMessageId, attachmentCount: workspace.attachments.length })
  schedulePostCommitFrame(operationId)
  if (workspace.providerSession?.requestId) {
    deps.setPageTaskRunning(workspace.providerSession.requestId, {
      conversationId: deps.conversationId,
      ...(workspace.providerSession.sessionId ? { sessionId: workspace.providerSession.sessionId } : {}),
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
  let sawProviderSessionEvent = false
  let sawAssistantProgress = false

  try {
    markSendPhase('prepare_provider_session_start', {
      providerSessionOnline: deps.providerSessionOnline,
      providerSessionBaseURL: providerSessionRunClient.baseURL,
      mcpEndpoint: deps.mcpEndpoint,
    })
    await prepareSendProviderSession({
      workspace,
      providerSessionOnline: workspace.providerSession?.sessionId ? false : deps.providerSessionOnline,
      providerSessionBaseURL: providerSessionRunClient.baseURL,
      signal: sendController.signal,
      deps: {
        startActivityEvent,
        completeActivityEvent,
        markActivityEventStarted: (id) => updateActivityEvents((current) => setActivityEventStatus(current, id, 'started')),
        ensureRunning: () => providerSessionRunClient.ensureRunning(),
        refetchProviderSessionHealth: deps.refetchProviderSessionHealth,
        syncProviderSessionModelConfig: (modelId) => syncProviderSessionModelConfig(modelId, { client: providerSessionRunClient }),
        markPerformancePhase: markSendPhase,
        setPendingAssistantThinking: () => deps.setPendingAssistantState({ status: 'thinking' }),
        abortError: createProviderSessionStopAbortError,
      },
    })
    markSendPhase('prepare_provider_session_done')
    markSendPhase('request_start', {
      threadId: workspace.providerSession?.threadId,
      sourceMessageId,
      projectId: workspace.providerSession?.projectId,
      clientInputAttachmentCount: workspace.providerSession?.clientInput?.attachments?.length ?? 0,
      diagnosticCommand: Boolean(workspace.providerSession?.diagnosticCommand),
    })
    const runResult = await providerSessionRunClient.runMessageStream({
      threadId: workspace.providerSession?.threadId,
      message: workspace.providerSession?.clientInput?.message ?? workspace.visibleUserContent,
      sourceMessageId,
      clientInput: workspace.providerSession?.clientInput,
      ...(workspace.providerSession?.runProfile ? { runProfile: workspace.providerSession.runProfile } : {}),
      ...(workspace.providerSession?.threadControl ? { threadControl: workspace.providerSession.threadControl } : {}),
      ...(workspace.providerSession?.title ? { title: workspace.providerSession.title } : {}),
      projectId: workspace.providerSession?.projectId,
    }, {
      ...(workspace.providerSession?.providerManifest ? { providerManifest: workspace.providerSession.providerManifest } : {}),
      ...(workspace.providerSession?.providerSessionLimits ? { providerSessionLimits: workspace.providerSession.providerSessionLimits } : {}),
      ...(workspace.providerSession?.timeoutMs ? { timeoutMs: workspace.providerSession.timeoutMs } : {}),
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
          requestId: workspace.providerSession?.requestId,
          liveEvents: () => deps.liveTraceEventsRef.current,
          cancelledRunIds: deps.cancelRequestedRunIds,
          getConversationRuntimeState: () => useAgentSessionStore.getState().conversationRuntimeStates[deps.conversationId],
          setPendingAssistantState: deps.setPendingAssistantState,
          thinkingStateForRun: deps.thinkingStateForRun,
          setPageTaskRunning: (requestId, patch) => deps.setPageTaskRunning(requestId, patch),
          setConversationRun: (run, patch) => deps.setConversationRun(deps.conversationId, run, patch),
          updateConversationRuntimeState: (patch) => deps.updateConversationRuntimeState(deps.conversationId, patch),
          cancelGenerationJobIfActive: deps.cancelGenerationJobIfActive,
          cancelRun: (runId, input) => providerSessionRunClient.cancelRun(runId, input),
          getRun: (runId) => providerSessionRunClient.getRun(runId),
        })
      },
      onSourceMessage: (sourceMessage, run) => {
        if (sendController.signal.aborted) return
        bindAcceptedSourceProviderSessionScope({
          message: sourceMessage,
          run,
          deps,
        })
        notifyAgentTimelineAcceptedSource(sourceMessage, run)
        markSendPhase('source_message_accepted', { threadId: sourceMessage.threadId, runId: run.id, providerSessionMessageId: sourceMessage.id })
      },
      onProviderEvent: (event) => {
        if (sendController.signal.aborted) return
        if (!sawProviderSessionEvent) {
          sawProviderSessionEvent = true
          markSendPhase('first_provider_session_event')
        }
        const progress = providerSessionAssistantProgressFromEvent(event)
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
        handleSendProviderSessionEvent(event, {
          updateConversationTitle: (title) => deps.updateConversationTitle(deps.userId, deps.conversationId, title),
          updateActivityEvents,
          recordLiveTraceEvent: deps.recordLiveTraceEvent,
          onRunUpdate: (nextRun) => {
            handleSendRunUpdate(nextRun, {
              conversationId: deps.conversationId,
              requestId: workspace.providerSession?.requestId,
              liveEvents: () => deps.liveTraceEventsRef.current,
              cancelledRunIds: deps.cancelRequestedRunIds,
              getConversationRuntimeState: () => useAgentSessionStore.getState().conversationRuntimeStates[deps.conversationId],
              setPendingAssistantState: deps.setPendingAssistantState,
              thinkingStateForRun: deps.thinkingStateForRun,
              setPageTaskRunning: (requestId, patch) => deps.setPageTaskRunning(requestId, patch),
              setConversationRun: (run, patch) => deps.setConversationRun(deps.conversationId, run, patch),
              updateConversationRuntimeState: (patch) => deps.updateConversationRuntimeState(deps.conversationId, patch),
              cancelGenerationJobIfActive: deps.cancelGenerationJobIfActive,
              cancelRun: (runId, input) => providerSessionRunClient.cancelRun(runId, input),
              getRun: (runId) => providerSessionRunClient.getRun(runId),
            })
          },
        })
      },
    })
    markSendPhase('run_stream_done', { runId: runResult.run.id, status: runResult.run.status })
    if (sendController.signal.aborted) throw sendController.signal.reason ?? createProviderSessionStopAbortError()
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
        getRun: (runId) => providerSessionRunClient.getRun(runId),
        setConversationProviderSessionTreeId: deps.setConversationProviderSessionTreeId,
        setConversationProviderThreadBindingId: deps.setConversationProviderThreadBindingId,
        updateConversationTitle: deps.updateConversationTitle,
        setPageTaskRunning: deps.setPageTaskRunning,
        setConversationRun: deps.setConversationRun,
        setPendingHttpEvents: deps.setPendingHttpEvents,
        setPendingAssistantState: deps.setPendingAssistantState,
        setLiveTraceEvents: deps.setLiveTraceEvents,
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
      sawProviderSessionEvent,
      sawAssistantProgress,
    })
    if (deps.isProviderSessionAbortError(error) || sendController.signal.aborted) {
      finishAgentPerformanceOperation(operationId, 'cancelled', {
        error: error instanceof Error ? error.message : String(error),
      })
      handleSendAbort(error, {
        userId: deps.userId,
        conversationId: deps.conversationId,
        ...(workspace.providerSession?.requestId ? { requestId: workspace.providerSession.requestId } : {}),
        setPendingAssistantState: deps.setPendingAssistantState,
        setPendingHttpEvents: deps.setPendingHttpEvents,
        resetStreamingAssistant: deps.resetStreamingAssistant,
        updateConversationRuntimeState: deps.updateConversationRuntimeState,
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
        ...(workspace.providerSession?.requestId ? { requestId: workspace.providerSession.requestId } : {}),
        setPendingAssistantState: deps.setPendingAssistantState,
      setPendingHttpEvents: deps.setPendingHttpEvents,
      resetStreamingAssistant: deps.resetStreamingAssistant,
      updateConversationRuntimeState: deps.updateConversationRuntimeState,
      notifyRunSettled: notifyAgentPanelRunSettled,
      toastError: deps.toastError,
      assistantErrorContent: (errorMessage) => `当前提供方暂不可用。\n\n请确认所选提供方的 app-server 已启动并可连接。\n\n错误：${errorMessage}`,
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
    deps.updateConversationRuntimeState(deps.conversationId, { stopRequested: false, stopping: false, loading: false, building: false })
    markSendPhase('final_state_cleared', {
      streamProgressUpdateCount,
      latestStreamProgressChars,
    })
  }
}

type AcceptedSourceProviderSessionScopeDeps = Pick<
  CommitAgentSendWorkspaceDeps,
  | 'conversationId'
  | 'setConversationProviderSessionTreeId'
  | 'setConversationProviderThreadBindingId'
>

export function bindAcceptedSourceProviderSessionScope(input: {
  message: Pick<AgentMessage, 'threadId'>
  run: Pick<AgentRun, 'sessionId'>
  deps: AcceptedSourceProviderSessionScopeDeps
}): void {
  const threadId = input.message.threadId.trim()
  if (!threadId) return
  const sessionId = input.run.sessionId?.trim()
  if (sessionId) {
    input.deps.setConversationProviderSessionTreeId?.(input.deps.conversationId, sessionId)
  }
  input.deps.setConversationProviderThreadBindingId?.(input.deps.conversationId, threadId)
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
  if (stage === 'first_run_update' || stage === 'first_provider_session_event' || stage === 'first_assistant_progress' || stage === 'first_stream_text_visible') return 1_500
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
