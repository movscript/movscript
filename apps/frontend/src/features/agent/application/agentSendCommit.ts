import type { MutableRefObject, SetStateAction } from 'react'
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
import { fetchResourceById } from '@/features/agent/domain/agentMessageViewModel'
import { stripAttachmentPreviewUrl } from '@/features/agent/domain/agentAttachments'
import { useAgentStore, type AgentAttachment, type ChatMessage, type ChatMessageMeta, type ChatRunActivityEvent } from '@/features/agent/state/agentStore'
import { useAgentSessionStore, type AgentConversationRuntimeState, type AgentPageTaskState } from '@/features/agent/state/agentSessionStore'
import {
  captureAgentStorageSnapshot,
  finishAgentPerformanceOperation,
  markAgentPerformancePhase,
} from '@/features/agent/state/agentPerformanceStore'
import type { AgentSendDraft } from '@/features/agent/application/agentSendDraft'
import type { AgentLivePendingAssistantState } from '@/features/agent/presentation/agentLiveRunActivity'
import {
  appendAssistantConversationMessage,
  appendUserConversationMessage,
  type AgentConversationMessageStore,
} from '@movscript/conversation'
import { runtimeAssistantProgressFromEvent } from '@movscript/event-state'

type ActivityEventsAction = SetStateAction<ChatRunActivityEvent[]>
type ConversationRuntimePatch = Partial<Omit<AgentConversationRuntimeState, 'conversationId' | 'updatedAt'>>
type ConversationRunPatch = Partial<Omit<AgentConversationRuntimeState, 'conversationId' | 'run' | 'runId' | 'threadId' | 'status' | 'updatedAt'>>

export interface CommitAgentSendDraftDeps {
  userId: string
  conversationId: string
  conversationMessages: ChatMessage[]
  localAgentOnline: boolean
  mcpEndpoint?: string
  activeSendAbortControllerRef: MutableRefObject<AbortController | null>
  cancelRequestedRunIds: Set<string>
  liveTraceEventsRef: MutableRefObject<ChatRunActivityEvent[]>
  messageStore: AgentConversationMessageStore<ChatMessage, ChatMessageMeta>
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
  resetStreamingAssistant: () => void
  updateStreamingAssistantText: (runId: string, text: string, roundIndex?: number) => void
  getStreamingAssistantMessageId: () => string | null
  recordLiveTraceEvent: (event: AgentRuntimeEventV2) => void
  appendAssistantRunResult: (run: AgentRun, thread: AgentThread, liveEvents: ChatRunActivityEvent[]) => Promise<unknown>
  revokeAttachmentPreviewUrls: (items: AgentAttachment[]) => void
  setMentionRange: (range: null) => void
  assertMCPReady: () => Promise<unknown>
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

export async function commitAgentSendDraft(draft: AgentSendDraft, deps: CommitAgentSendDraftDeps): Promise<void> {
  const operationId = draft.performanceOperationId
  markAgentPerformancePhase(operationId, 'commit_start')
  if (!draft.model.id) {
    appendAssistantConversationMessage<ChatMessage, ChatMessageMeta>({
      content: deps.labels.selectModelFirst,
      deps: {
        userId: deps.userId,
        conversationId: deps.conversationId,
        messageStore: deps.messageStore,
      },
    })
    notifyAgentPanelRunSettled({
      requestId: draft.localRuntime?.requestId,
      status: 'error',
      error: deps.labels.selectModelFirst,
    })
    finishAgentPerformanceOperation(operationId, 'error', { error: deps.labels.selectModelFirst })
    return
  }

  const messageAttachments = draft.attachments.map(stripAttachmentPreviewUrl)
  deps.revokeAttachmentPreviewUrls(useAgentStore.getState().getConversationDraft(deps.userId, deps.conversationId).attachments)
  deps.messageStore.clearConversationDraft(deps.userId, deps.conversationId)
  markAgentPerformancePhase(operationId, 'clear_draft_done')
  deps.setMentionRange(null)
  deps.setConversationRuntime(deps.conversationId, { loading: true, building: false, approving: false, stopping: false, stopRequested: false, error: undefined })
  markAgentPerformancePhase(operationId, 'runtime_loading_set')
  deps.cancelRequestedRunIds.clear()
  const httpEvents = debugHttpRequestEvents(draft.httpRequests)
  deps.liveTraceEventsRef.current = httpEvents
  deps.setLiveTraceEvents(httpEvents)
  deps.setPendingHttpEvents(httpEvents)
  deps.setPendingAssistantState({ status: 'preparing_request' })
  const localUserMessageId = appendUserConversationMessage<ChatMessage, ChatMessageMeta>({
    content: draft.visibleUserContent,
    attachments: messageAttachments,
    meta: {
      modelId: draft.model.id,
      agentName: deps.labels.localRuntime,
      permissionMode: draft.settings.permissionMode,
      contextLabels: draft.contextLabels,
      runtimeInput: {
        status: 'pending',
      },
    },
    deps: {
      userId: deps.userId,
      conversationId: deps.conversationId,
      messageStore: deps.messageStore,
    },
  })
  markAgentPerformancePhase(operationId, 'user_message_appended', {
    details: { localUserMessageId, attachmentCount: messageAttachments.length },
  })
  schedulePostCommitFrame(operationId)
  if (draft.localRuntime?.requestId) {
    deps.setPageTaskRunning(draft.localRuntime.requestId, { conversationId: deps.conversationId })
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
    markAgentPerformancePhase(operationId, 'prepare_runtime_start')
    await prepareSendRuntime({
      draft,
      localAgentOnline: deps.localAgentOnline,
      localAgentBaseURL: localAgentClient.baseURL,
      ...(deps.mcpEndpoint ? { mcpEndpoint: deps.mcpEndpoint } : {}),
      signal: sendController.signal,
      deps: {
        startActivityEvent,
        completeActivityEvent,
        markActivityEventStarted: (id) => updateActivityEvents((current) => setActivityEventStatus(current, id, 'started')),
        ensureRunning: () => localAgentClient.ensureRunning(),
        refetchLocalAgentHealth: deps.refetchLocalAgentHealth,
        assertMCPReady: deps.assertMCPReady,
        syncRuntimeModelConfig,
        markPerformancePhase: (name, details) => markAgentPerformancePhase(operationId, name, details ? { details } : undefined),
        setPendingAssistantThinking: () => deps.setPendingAssistantState({ status: 'thinking' }),
        abortError: createLocalAgentStopAbortError,
      },
    })
    markAgentPerformancePhase(operationId, 'prepare_runtime_done')
    markAgentPerformancePhase(operationId, 'request_start')
    const runResult = await localAgentClient.runMessageStream({
      threadId: draft.localRuntime?.diagnosticCommand ? undefined : draft.localRuntime?.threadId,
      message: draft.localRuntime?.clientInput?.message ?? draft.visibleUserContent,
      sourceMessageId: localUserMessageId,
      clientInput: draft.localRuntime?.clientInput,
      ...(draft.localRuntime?.title ? { title: draft.localRuntime.title } : {}),
      projectId: draft.localRuntime?.projectId,
    }, {
      ...(draft.localRuntime?.agentManifest ? { agentManifest: draft.localRuntime.agentManifest } : {}),
      ...(draft.localRuntime?.runPolicy ? { runPolicy: draft.localRuntime.runPolicy } : {}),
      ...(draft.localRuntime?.timeoutMs ? { timeoutMs: draft.localRuntime.timeoutMs } : {}),
      pollMs: 120,
      signal: sendController.signal,
      onPhase: (name, details) => markAgentPerformancePhase(operationId, name, details ? { details } : undefined),
      onRunUpdate: (nextRun) => {
        if (sendController.signal.aborted) return
        if (!sawRunUpdate) {
          sawRunUpdate = true
          markAgentPerformancePhase(operationId, 'first_run_update', {
            details: { runId: nextRun.id, status: nextRun.status },
          })
        }
        handleSendRunUpdate(nextRun, {
          conversationId: deps.conversationId,
          requestId: draft.localRuntime?.requestId,
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
          cancelRun: (runId, input) => localAgentClient.cancelRun(runId, input),
          getRun: (runId) => localAgentClient.getRun(runId),
        })
      },
      onSourceMessage: (sourceMessage, run) => {
        if (sendController.signal.aborted) return
        markAgentPerformancePhase(operationId, 'source_message_accepted', {
          details: { threadId: sourceMessage.threadId, runId: run.id, runtimeMessageId: sourceMessage.id },
        })
        deps.messageStore.updateMessageMeta(deps.userId, deps.conversationId, localUserMessageId, {
          modelId: draft.model.id,
          agentName: deps.labels.localRuntime,
          permissionMode: draft.settings.permissionMode,
          contextLabels: draft.contextLabels,
          runtimeInput: {
            threadId: sourceMessage.threadId,
            runId: run.id,
            messageId: sourceMessage.id,
            status: 'accepted',
          },
          runtimeMessage: {
            threadId: sourceMessage.threadId,
            messageId: sourceMessage.id,
            runId: run.id,
          },
        })
      },
      onRuntimeEvent: (event) => {
        if (sendController.signal.aborted) return
        if (!sawRuntimeEvent) {
          sawRuntimeEvent = true
          markAgentPerformancePhase(operationId, 'first_runtime_event')
        }
        const progress = runtimeAssistantProgressFromEvent(event)
        if (progress) {
          if (!sawAssistantProgress) {
            sawAssistantProgress = true
            markAgentPerformancePhase(operationId, 'first_assistant_progress', {
              details: { runId: progress.runId, roundIndex: progress.roundIndex ?? 0 },
            })
          }
          deps.updateStreamingAssistantText(progress.runId, progress.accumulated, progress.roundIndex)
        }
        handleSendRuntimeEvent(event, {
          updateConversationTitle: (title) => deps.updateConversationTitle(deps.userId, deps.conversationId, title),
          updateActivityEvents,
          recordLiveTraceEvent: deps.recordLiveTraceEvent,
        })
      },
    })
    markAgentPerformancePhase(operationId, 'run_stream_done', {
      details: { runId: runResult.run.id, status: runResult.run.status },
    })
    if (sendController.signal.aborted) throw sendController.signal.reason ?? createLocalAgentStopAbortError()
    markAgentPerformancePhase(operationId, 'complete_result_start')
    await completeSendRunResult({
      draft,
      runResult,
      deps: {
        userId: deps.userId,
        conversationId: deps.conversationId,
        localUserMessageId,
        liveEvents: () => deps.liveTraceEventsRef.current,
        setLiveEventsRef: (events) => {
          deps.liveTraceEventsRef.current = events
        },
        getRun: (runId) => localAgentClient.getRun(runId),
        setLocalThreadId: deps.setLocalThreadId,
        setConversationSessionId: deps.setConversationSessionId,
        setConversationRuntimeSessionId: deps.setConversationRuntimeSessionId,
        setConversationRuntimeThreadId: deps.setConversationRuntimeThreadId,
        messageStore: {
          updateMessageMeta: deps.messageStore.updateMessageMeta,
          setConversationMessages: deps.messageStore.setConversationMessages,
        },
        updateConversationTitle: deps.updateConversationTitle,
        setPageTaskRunning: deps.setPageTaskRunning,
        setConversationRun: deps.setConversationRun,
        setPendingHttpEvents: deps.setPendingHttpEvents,
        setPendingAssistantState: deps.setPendingAssistantState,
        appendAssistantRunResult: deps.appendAssistantRunResult,
        getExistingMessages: () => useAgentStore.getState().getConversations(deps.userId).find((item) => item.id === deps.conversationId)?.messages ?? deps.conversationMessages,
        setLiveTraceEvents: deps.setLiveTraceEvents,
        fetchResourceById,
        runTouchesAgentCatalog: deps.runTouchesAgentCatalog,
        refreshAgentCatalogContext: deps.refreshAgentCatalogContext,
        notifyRunSettled: notifyAgentPanelRunSettled,
      },
    })
    markAgentPerformancePhase(operationId, 'complete_result_done')
    captureAgentStorageSnapshot()
    finishAgentPerformanceOperation(operationId, 'success', {
      runId: runResult.run.id,
      status: runResult.run.status,
    })
  } catch (error) {
    markUnacceptedUserMessageFailed({
      error,
      userId: deps.userId,
      conversationId: deps.conversationId,
      messageId: localUserMessageId,
      messageStore: deps.messageStore,
    })
    if (deps.isLocalAgentAbortError(error) || sendController.signal.aborted) {
      finishAgentPerformanceOperation(operationId, 'cancelled', {
        error: error instanceof Error ? error.message : String(error),
      })
      handleSendAbort(error, {
        userId: deps.userId,
        conversationId: deps.conversationId,
        ...(draft.localRuntime?.requestId ? { requestId: draft.localRuntime.requestId } : {}),
        streamingMessageId: deps.getStreamingAssistantMessageId,
        messageStore: {
          removeMessage: deps.messageStore.removeMessage,
        },
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
      ...(draft.localRuntime?.requestId ? { requestId: draft.localRuntime.requestId } : {}),
      streamingMessageId: deps.getStreamingAssistantMessageId,
      messageStore: {
        addMessage: deps.messageStore.addMessage,
        removeMessage: deps.messageStore.removeMessage,
      },
      setPendingAssistantState: deps.setPendingAssistantState,
      setPendingHttpEvents: deps.setPendingHttpEvents,
      resetStreamingAssistant: deps.resetStreamingAssistant,
      setConversationRuntime: deps.setConversationRuntime,
      notifyRunSettled: notifyAgentPanelRunSettled,
      toastError: deps.toastError,
      assistantErrorContent: (errorMessage) => `本地 Agent 暂不可用。\n\n启动命令：\`pnpm --filter @movscript/agent dev\`\n健康检查：\`${localAgentClient.baseURL}/health\`\n\n错误：${errorMessage}`,
    })
  } finally {
    if (deps.activeSendAbortControllerRef.current === sendController) {
      deps.activeSendAbortControllerRef.current = null
    }
    deps.cancelRequestedRunIds.clear()
    deps.setPendingAssistantState(null)
    deps.resetStreamingAssistant()
    deps.setConversationRuntime(deps.conversationId, { stopRequested: false, stopping: false, loading: false, building: false })
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

function markUnacceptedUserMessageFailed(input: {
  error: unknown
  userId: string
  conversationId: string
  messageId: string
  messageStore: Pick<AgentConversationMessageStore<ChatMessage, ChatMessageMeta>, 'updateMessageMeta'>
}): void {
  const conversation = useAgentStore.getState().getConversations(input.userId)
    .find((item) => item.id === input.conversationId)
  const message = conversation?.messages.find((item) => item.id === input.messageId)
  if (message?.meta?.runtimeInput?.status !== 'pending' || message.meta.runtimeMessage?.messageId) return
  input.messageStore.updateMessageMeta(input.userId, input.conversationId, input.messageId, {
    runtimeInput: {
      ...message.meta.runtimeInput,
      status: 'failed',
      error: input.error instanceof Error ? input.error.message : String(input.error),
    },
  })
}
