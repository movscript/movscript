import type { MutableRefObject, SetStateAction } from 'react'
import type { AgentTaskArtifactRef } from '@/lib/agentArtifacts'
import { notifyAgentPanelRunSettled } from '@/lib/agentPanelBridge'
import { debugHttpRequestEvents, setActivityEventStatus, upsertActivityEvent } from '@/lib/agentSendActivity'
import { completeSendRunResult } from '@/lib/agentSendCompletion'
import { handleSendAbort, handleSendFailure } from '@/lib/agentSendError'
import { prepareSendRuntime } from '@/lib/agentSendRuntimeReadiness'
import { handleSendRunUpdate, handleSendStreamEvent, type AgentSendRunUpdateDeps } from '@/lib/agentSendStream'
import { createLocalAgentStopAbortError } from '@/lib/agentRunControl'
import { localAgentClient, type AgentRun, type AgentRunStreamEvent, type AgentThread } from '@/lib/localAgentClient'
import { syncRuntimeModelConfig } from '@/lib/runtimeChat'
import { fetchResourceById } from '@/lib/agentMessageViewModel'
import { stripAttachmentPreviewUrl } from '@/components/agent/useAgentComposerController'
import { useAgentStore, type AgentAttachment, type ChatMessage, type ChatRunActivityEvent } from '@/store/agentStore'
import { useAgentSessionStore, type AgentConversationRuntimeState, type AgentPageTaskState } from '@/store/agentSessionStore'
import type { AgentSendDraft } from '@/lib/agentSendDraft'
import type { AgentLivePendingAssistantState } from '@/lib/agentLiveRunActivity'
import type { AgentConversationMessageStore } from '@/lib/agentConversationMessageStore'

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
  messageStore: AgentConversationMessageStore
  setConversationRuntimeThreadId: (userId: string, conversationId: string, threadId: string) => void
  updateConversationTitle: (userId: string, conversationId: string, title: string) => void
  setLocalThreadId: (conversationId: string, threadId: string) => void
  setPageTaskRunning: (requestId: string | undefined, patch: { conversationId?: string; run?: AgentRun; threadId?: string; artifacts?: AgentTaskArtifactRef[] }) => void
  setConversationRun: (conversationId: string, run: AgentRun, patch?: ConversationRunPatch) => void
  setConversationRuntime: (conversationId: string, patch: ConversationRuntimePatch) => void
  setLiveTraceEvents: (action: ActivityEventsAction) => void
  setPendingHttpEvents: (action: ActivityEventsAction) => void
  setPendingAssistantState: (state: AgentLivePendingAssistantState | null | ((current: AgentLivePendingAssistantState | null) => AgentLivePendingAssistantState | null)) => void
  resetStreamingAssistant: () => void
  updateStreamingAssistantText: (runId: string, text: string, roundIndex?: number) => void
  getStreamingAssistantMessageId: () => string | null
  recordLiveTraceEvent: (event: AgentRunStreamEvent) => void
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
  if (!draft.model.id) {
    deps.messageStore.addMessage(deps.userId, deps.conversationId, { role: 'assistant', content: deps.labels.selectModelFirst })
    notifyAgentPanelRunSettled({
      requestId: draft.localRuntime?.requestId,
      status: 'error',
      error: deps.labels.selectModelFirst,
    })
    return
  }

  const messageAttachments = draft.attachments.map(stripAttachmentPreviewUrl)
  deps.revokeAttachmentPreviewUrls(useAgentStore.getState().getConversationDraft(deps.userId, deps.conversationId).attachments)
  deps.messageStore.clearConversationDraft(deps.userId, deps.conversationId)
  deps.setMentionRange(null)
  deps.setConversationRuntime(deps.conversationId, { loading: true, building: false, approving: false, stopping: false, stopRequested: false, error: undefined })
  deps.cancelRequestedRunIds.clear()
  const httpEvents = debugHttpRequestEvents(draft.httpRequests)
  deps.liveTraceEventsRef.current = httpEvents
  deps.setLiveTraceEvents(httpEvents)
  deps.setPendingHttpEvents(httpEvents)
  deps.setPendingAssistantState({ status: 'preparing_request' })
  const localUserMessageId = deps.messageStore.addMessage(deps.userId, deps.conversationId, {
    role: 'user',
    content: draft.visibleUserContent,
    attachments: messageAttachments,
    meta: {
      modelId: draft.model.id,
      agentName: deps.labels.localRuntime,
      permissionMode: draft.settings.permissionMode,
      contextLabels: draft.contextLabels,
    },
  })
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

  try {
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
        setPendingAssistantThinking: () => deps.setPendingAssistantState({ status: 'thinking' }),
        abortError: createLocalAgentStopAbortError,
      },
    })
    const runResult = await localAgentClient.runMessageStream({
      threadId: draft.localRuntime?.diagnosticCommand ? undefined : draft.localRuntime?.threadId,
      message: draft.localRuntime?.clientInput?.message ?? draft.visibleUserContent,
      clientInput: draft.localRuntime?.clientInput,
      ...(draft.localRuntime?.title ? { title: draft.localRuntime.title } : {}),
      projectId: draft.localRuntime?.projectId,
    }, {
      ...(draft.localRuntime?.agentManifest ? { agentManifest: draft.localRuntime.agentManifest } : {}),
      ...(draft.localRuntime?.runPolicy ? { runPolicy: draft.localRuntime.runPolicy } : {}),
      ...(draft.localRuntime?.timeoutMs ? { timeoutMs: draft.localRuntime.timeoutMs } : {}),
      pollMs: 120,
      signal: sendController.signal,
      onRunUpdate: (nextRun) => {
        if (sendController.signal.aborted) return
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
      onAssistantDelta: (event) => {
        if (sendController.signal.aborted) return
        deps.updateStreamingAssistantText(event.runId, event.accumulated)
      },
      onStreamEvent: (event) => {
        if (sendController.signal.aborted) return
        handleSendStreamEvent(event, {
          updateConversationTitle: (title) => deps.updateConversationTitle(deps.userId, deps.conversationId, title),
          updateActivityEvents,
          recordLiveTraceEvent: deps.recordLiveTraceEvent,
        })
      },
    })
    if (sendController.signal.aborted) throw sendController.signal.reason ?? createLocalAgentStopAbortError()
    await completeSendRunResult({
      draft,
      runResult,
      deps: {
        userId: deps.userId,
        conversationId: deps.conversationId,
        localUserMessageId,
        conversationMessages: deps.conversationMessages,
        liveEvents: () => deps.liveTraceEventsRef.current,
        setLiveEventsRef: (events) => {
          deps.liveTraceEventsRef.current = events
        },
        getRun: (runId) => localAgentClient.getRun(runId),
        setLocalThreadId: deps.setLocalThreadId,
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
  } catch (error) {
    if (deps.isLocalAgentAbortError(error) || sendController.signal.aborted) {
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
      assistantErrorContent: (errorMessage) => `本地 Agent 暂不可用。\n\n启动命令：\`pnpm --filter movscript-agent dev\`\n健康检查：\`${localAgentClient.baseURL}/health\`\n\n错误：${errorMessage}`,
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
