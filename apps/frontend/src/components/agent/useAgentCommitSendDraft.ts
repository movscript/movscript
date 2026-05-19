import { useCallback } from 'react'
import type { MutableRefObject } from 'react'
import { commitAgentSendDraft, type CommitAgentSendDraftDeps } from '@/lib/agentSendCommit'
import type { AgentSendDraft } from '@/lib/agentSendDraft'
import { toastMCPError } from '@/lib/mcpStatus'
import { localAgentClient } from '@/lib/localAgentClient'
import { getThinkingBubbleState } from '@/components/agent/AgentChatBubbles'
import { cancelGenerationJobIfActive } from '@/components/agent/useAgentRunStopAction'

export interface UseAgentCommitSendDraftInput {
  userId: string
  conversationId: string
  conversationMessages: CommitAgentSendDraftDeps['conversationMessages']
  localAgentOnline: boolean
  mcpEndpoint?: string
  activeSendAbortControllerRef: CommitAgentSendDraftDeps['activeSendAbortControllerRef']
  cancelRequestedRunIdsRef: MutableRefObject<Set<string>>
  liveTraceEventsRef: CommitAgentSendDraftDeps['liveTraceEventsRef']
  messageStore: CommitAgentSendDraftDeps['messageStore']
  setConversationRuntimeThreadId: CommitAgentSendDraftDeps['setConversationRuntimeThreadId']
  updateConversationTitle: CommitAgentSendDraftDeps['updateConversationTitle']
  setLocalThreadId: CommitAgentSendDraftDeps['setLocalThreadId']
  setPageTaskRunning: CommitAgentSendDraftDeps['setPageTaskRunning']
  setConversationRun: CommitAgentSendDraftDeps['setConversationRun']
  setConversationRuntime: CommitAgentSendDraftDeps['setConversationRuntime']
  setLiveTraceEvents: CommitAgentSendDraftDeps['setLiveTraceEvents']
  setPendingHttpEvents: CommitAgentSendDraftDeps['setPendingHttpEvents']
  setPendingAssistantState: CommitAgentSendDraftDeps['setPendingAssistantState']
  resetStreamingAssistant: CommitAgentSendDraftDeps['resetStreamingAssistant']
  updateStreamingAssistantText: CommitAgentSendDraftDeps['updateStreamingAssistantText']
  getStreamingAssistantMessageId: CommitAgentSendDraftDeps['getStreamingAssistantMessageId']
  recordLiveTraceEvent: CommitAgentSendDraftDeps['recordLiveTraceEvent']
  appendAssistantRunResult: CommitAgentSendDraftDeps['appendAssistantRunResult']
  revokeAttachmentPreviewUrls: CommitAgentSendDraftDeps['revokeAttachmentPreviewUrls']
  setMentionRange: CommitAgentSendDraftDeps['setMentionRange']
  assertMCPReady: CommitAgentSendDraftDeps['assertMCPReady']
  refetchLocalAgentHealth: CommitAgentSendDraftDeps['refetchLocalAgentHealth']
  runTouchesAgentCatalog: CommitAgentSendDraftDeps['runTouchesAgentCatalog']
  refreshAgentCatalogContext: CommitAgentSendDraftDeps['refreshAgentCatalogContext']
  labels: CommitAgentSendDraftDeps['labels']
}

function isLocalAgentAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true
  if (!(error instanceof Error)) return false
  return error.name === 'AbortError'
    || /aborted|abort|用户停止了当前会话|Run was cancelled/i.test(error.message)
}

export function useAgentCommitSendDraft({
  userId,
  conversationId,
  conversationMessages,
  localAgentOnline,
  mcpEndpoint,
  activeSendAbortControllerRef,
  cancelRequestedRunIdsRef,
  liveTraceEventsRef,
  messageStore,
  setConversationRuntimeThreadId,
  updateConversationTitle,
  setLocalThreadId,
  setPageTaskRunning,
  setConversationRun,
  setConversationRuntime,
  setLiveTraceEvents,
  setPendingHttpEvents,
  setPendingAssistantState,
  resetStreamingAssistant,
  updateStreamingAssistantText,
  getStreamingAssistantMessageId,
  recordLiveTraceEvent,
  appendAssistantRunResult,
  revokeAttachmentPreviewUrls,
  setMentionRange,
  assertMCPReady,
  refetchLocalAgentHealth,
  runTouchesAgentCatalog,
  refreshAgentCatalogContext,
  labels,
}: UseAgentCommitSendDraftInput) {
  return useCallback(async (draft: AgentSendDraft) => {
    await commitAgentSendDraft(draft, {
      userId,
      conversationId,
      conversationMessages,
      localAgentOnline,
      ...(mcpEndpoint ? { mcpEndpoint } : {}),
      activeSendAbortControllerRef,
      cancelRequestedRunIds: cancelRequestedRunIdsRef.current,
      liveTraceEventsRef,
      messageStore,
      setConversationRuntimeThreadId,
      updateConversationTitle,
      setLocalThreadId,
      setPageTaskRunning,
      setConversationRun,
      setConversationRuntime,
      setLiveTraceEvents,
      setPendingHttpEvents,
      setPendingAssistantState,
      resetStreamingAssistant,
      updateStreamingAssistantText,
      getStreamingAssistantMessageId,
      recordLiveTraceEvent,
      appendAssistantRunResult,
      revokeAttachmentPreviewUrls,
      setMentionRange,
      assertMCPReady,
      refetchLocalAgentHealth,
      isLocalAgentAbortError,
      thinkingStateForRun: (run) => getThinkingBubbleState(run, []),
      runTouchesAgentCatalog,
      refreshAgentCatalogContext,
      cancelGenerationJobIfActive: (state) => {
        void cancelGenerationJobIfActive(state)
      },
      toastError: (error) => toastMCPError(error, mcpEndpoint ?? localAgentClient.baseURL),
      labels,
    })
  }, [
    activeSendAbortControllerRef,
    appendAssistantRunResult,
    assertMCPReady,
    cancelRequestedRunIdsRef,
    conversationId,
    conversationMessages,
    getStreamingAssistantMessageId,
    labels,
    liveTraceEventsRef,
    localAgentOnline,
    messageStore,
    mcpEndpoint,
    recordLiveTraceEvent,
    refetchLocalAgentHealth,
    refreshAgentCatalogContext,
    resetStreamingAssistant,
    revokeAttachmentPreviewUrls,
    runTouchesAgentCatalog,
    setConversationRun,
    setConversationRuntime,
    setConversationRuntimeThreadId,
    setLiveTraceEvents,
    setLocalThreadId,
    setMentionRange,
    setPageTaskRunning,
    setPendingAssistantState,
    setPendingHttpEvents,
    updateConversationTitle,
    updateStreamingAssistantText,
    userId,
  ])
}
