import { useCallback } from 'react'
import type { MutableRefObject } from 'react'
import { commitAgentSendWorkspace, type CommitAgentSendWorkspaceDeps } from '@/features/agent/application/agentSendCommit'
import type { AgentSendWorkspace } from '@/features/agent/application/agentSendWorkspace'
import { toastMCPError } from './mcpStatus'
import { localAgentClient } from '@/shared/infrastructure/localAgentClient'
import { getThinkingBubbleState } from '@/features/agent/presentation/agentThinkingBubbleState'
import { cancelGenerationJobIfActive } from '@/features/agent/presentation/useAgentRunStopAction'

export interface UseAgentCommitSendWorkspaceInput {
  userId: string
  conversationId: string
  localAgentOnline: boolean
  mcpEndpoint?: string
  activeSendAbortControllerRef: CommitAgentSendWorkspaceDeps['activeSendAbortControllerRef']
  cancelRequestedRunIdsRef: MutableRefObject<Set<string>>
  liveTraceEventsRef: CommitAgentSendWorkspaceDeps['liveTraceEventsRef']
  clearConversationWorkspace: CommitAgentSendWorkspaceDeps['clearConversationWorkspace']
  setConversationSessionId: CommitAgentSendWorkspaceDeps['setConversationSessionId']
  setConversationRuntimeSessionId?: CommitAgentSendWorkspaceDeps['setConversationRuntimeSessionId']
  setConversationRuntimeThreadId: CommitAgentSendWorkspaceDeps['setConversationRuntimeThreadId']
  updateConversationTitle: CommitAgentSendWorkspaceDeps['updateConversationTitle']
  setLocalThreadId: CommitAgentSendWorkspaceDeps['setLocalThreadId']
  setPageTaskRunning: CommitAgentSendWorkspaceDeps['setPageTaskRunning']
  setConversationRun: CommitAgentSendWorkspaceDeps['setConversationRun']
  setConversationRuntime: CommitAgentSendWorkspaceDeps['setConversationRuntime']
  setLiveTraceEvents: CommitAgentSendWorkspaceDeps['setLiveTraceEvents']
  setPendingHttpEvents: CommitAgentSendWorkspaceDeps['setPendingHttpEvents']
  setPendingAssistantState: CommitAgentSendWorkspaceDeps['setPendingAssistantState']
  resetStreamingAssistant: CommitAgentSendWorkspaceDeps['resetStreamingAssistant']
  updateStreamingAssistantText: CommitAgentSendWorkspaceDeps['updateStreamingAssistantText']
  recordLiveTraceEvent: CommitAgentSendWorkspaceDeps['recordLiveTraceEvent']
  revokeAttachmentPreviewUrls: CommitAgentSendWorkspaceDeps['revokeAttachmentPreviewUrls']
  setMentionRange: CommitAgentSendWorkspaceDeps['setMentionRange']
  refetchLocalAgentHealth: CommitAgentSendWorkspaceDeps['refetchLocalAgentHealth']
  runTouchesAgentCatalog: CommitAgentSendWorkspaceDeps['runTouchesAgentCatalog']
  refreshAgentCatalogContext: CommitAgentSendWorkspaceDeps['refreshAgentCatalogContext']
  labels: CommitAgentSendWorkspaceDeps['labels']
}

function isLocalAgentAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true
  if (!(error instanceof Error)) return false
  return error.name === 'AbortError'
    || /aborted|abort|用户停止了当前会话|Run was cancelled/i.test(error.message)
}

export function useAgentCommitSendWorkspace({
  userId,
  conversationId,
  localAgentOnline,
  mcpEndpoint,
  activeSendAbortControllerRef,
  cancelRequestedRunIdsRef,
  liveTraceEventsRef,
  clearConversationWorkspace,
  setConversationSessionId,
  setConversationRuntimeSessionId,
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
  recordLiveTraceEvent,
  revokeAttachmentPreviewUrls,
  setMentionRange,
  refetchLocalAgentHealth,
  runTouchesAgentCatalog,
  refreshAgentCatalogContext,
  labels,
}: UseAgentCommitSendWorkspaceInput) {
  return useCallback(async (workspace: AgentSendWorkspace) => {
    await commitAgentSendWorkspace(workspace, {
      userId,
      conversationId,
      localAgentOnline,
      ...(mcpEndpoint ? { mcpEndpoint } : {}),
      activeSendAbortControllerRef,
      cancelRequestedRunIds: cancelRequestedRunIdsRef.current,
      liveTraceEventsRef,
      clearConversationWorkspace,
      setConversationSessionId,
      setConversationRuntimeSessionId,
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
      recordLiveTraceEvent,
      revokeAttachmentPreviewUrls,
      setMentionRange,
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
    cancelRequestedRunIdsRef,
    clearConversationWorkspace,
    conversationId,
    labels,
    liveTraceEventsRef,
    localAgentOnline,
    mcpEndpoint,
    recordLiveTraceEvent,
    refetchLocalAgentHealth,
    refreshAgentCatalogContext,
    resetStreamingAssistant,
    revokeAttachmentPreviewUrls,
    runTouchesAgentCatalog,
    setConversationSessionId,
    setConversationRuntimeSessionId,
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
