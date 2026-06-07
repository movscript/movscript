import { useCallback } from 'react'
import type { MutableRefObject } from 'react'
import { commitAgentSendWorkspace, type CommitAgentSendWorkspaceDeps } from '@/features/agent/application/agentSendCommit'
import type { AgentSendWorkspace } from '@/features/agent/application/agentSendWorkspace'
import { toastMCPError } from './mcpStatus'
import { providerSessionClient } from '@/shared/infrastructure/providerSessionClient'
import { getAgentThinkingState } from '@/features/agent/domain/agentThinkingState'
import { cancelGenerationJobIfActive } from '@/features/agent/presentation/useAgentRunStopAction'

export interface UseAgentCommitSendWorkspaceInput {
  userId: string
  conversationId: string
  providerSessionOnline: boolean
  mcpEndpoint?: string
  activeSendAbortControllerRef: CommitAgentSendWorkspaceDeps['activeSendAbortControllerRef']
  cancelRequestedRunIdsRef: MutableRefObject<Set<string>>
  liveTraceEventsRef: CommitAgentSendWorkspaceDeps['liveTraceEventsRef']
  clearConversationWorkspace: CommitAgentSendWorkspaceDeps['clearConversationWorkspace']
  setConversationSessionId?: CommitAgentSendWorkspaceDeps['setConversationSessionId']
  setConversationProviderSessionTreeId?: CommitAgentSendWorkspaceDeps['setConversationProviderSessionTreeId']
  setConversationProviderSessionId?: CommitAgentSendWorkspaceDeps['setConversationProviderSessionId']
  setConversationProviderThreadBindingId?: CommitAgentSendWorkspaceDeps['setConversationProviderThreadBindingId']
  setConversationProviderThreadId?: CommitAgentSendWorkspaceDeps['setConversationProviderThreadId']
  updateConversationTitle: CommitAgentSendWorkspaceDeps['updateConversationTitle']
  setProviderThreadId?: CommitAgentSendWorkspaceDeps['setProviderThreadId']
  setPageTaskRunning: CommitAgentSendWorkspaceDeps['setPageTaskRunning']
  setConversationRun: CommitAgentSendWorkspaceDeps['setConversationRun']
  updateConversationRuntimeState: CommitAgentSendWorkspaceDeps['updateConversationRuntimeState']
  setLiveTraceEvents: CommitAgentSendWorkspaceDeps['setLiveTraceEvents']
  setPendingHttpEvents: CommitAgentSendWorkspaceDeps['setPendingHttpEvents']
  setPendingAssistantState: CommitAgentSendWorkspaceDeps['setPendingAssistantState']
  resetStreamingAssistant: CommitAgentSendWorkspaceDeps['resetStreamingAssistant']
  updateStreamingAssistantText: CommitAgentSendWorkspaceDeps['updateStreamingAssistantText']
  recordLiveTraceEvent: CommitAgentSendWorkspaceDeps['recordLiveTraceEvent']
  revokeAttachmentPreviewUrls: CommitAgentSendWorkspaceDeps['revokeAttachmentPreviewUrls']
  setMentionRange: CommitAgentSendWorkspaceDeps['setMentionRange']
  refetchProviderSessionHealth: CommitAgentSendWorkspaceDeps['refetchProviderSessionHealth']
  runTouchesProviderCatalog: CommitAgentSendWorkspaceDeps['runTouchesProviderCatalog']
  refreshProviderCatalogContext: CommitAgentSendWorkspaceDeps['refreshProviderCatalogContext']
  labels: CommitAgentSendWorkspaceDeps['labels']
}

function isProviderSessionAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true
  if (!(error instanceof Error)) return false
  return error.name === 'AbortError'
    || /aborted|abort|用户停止了当前会话|Run was cancelled/i.test(error.message)
}

export function useAgentCommitSendWorkspace({
  userId,
  conversationId,
  providerSessionOnline,
  mcpEndpoint,
  activeSendAbortControllerRef,
  cancelRequestedRunIdsRef,
  liveTraceEventsRef,
  clearConversationWorkspace,
  setConversationSessionId,
  setConversationProviderSessionTreeId,
  setConversationProviderSessionId,
  setConversationProviderThreadBindingId,
  setConversationProviderThreadId,
  updateConversationTitle,
  setProviderThreadId,
  setPageTaskRunning,
  setConversationRun,
  updateConversationRuntimeState,
  setLiveTraceEvents,
  setPendingHttpEvents,
  setPendingAssistantState,
  resetStreamingAssistant,
  updateStreamingAssistantText,
  recordLiveTraceEvent,
  revokeAttachmentPreviewUrls,
  setMentionRange,
  refetchProviderSessionHealth,
  runTouchesProviderCatalog,
  refreshProviderCatalogContext,
  labels,
}: UseAgentCommitSendWorkspaceInput) {
  return useCallback(async (workspace: AgentSendWorkspace) => {
    await commitAgentSendWorkspace(workspace, {
      userId,
      conversationId,
      providerSessionOnline,
      ...(mcpEndpoint ? { mcpEndpoint } : {}),
      activeSendAbortControllerRef,
      cancelRequestedRunIds: cancelRequestedRunIdsRef.current,
      liveTraceEventsRef,
      clearConversationWorkspace,
      setConversationSessionId,
      setConversationProviderSessionTreeId,
      setConversationProviderSessionId,
      setConversationProviderThreadBindingId,
      setConversationProviderThreadId,
      updateConversationTitle,
      setProviderThreadId,
      setPageTaskRunning,
      setConversationRun,
      updateConversationRuntimeState,
      setLiveTraceEvents,
      setPendingHttpEvents,
      setPendingAssistantState,
      resetStreamingAssistant,
      updateStreamingAssistantText,
      recordLiveTraceEvent,
      revokeAttachmentPreviewUrls,
      setMentionRange,
      refetchProviderSessionHealth,
      isProviderSessionAbortError,
      thinkingStateForRun: (run) => getAgentThinkingState(run, []),
      runTouchesProviderCatalog,
      refreshProviderCatalogContext,
      cancelGenerationJobIfActive: (state) => {
        void cancelGenerationJobIfActive(state)
      },
      toastError: (error) => toastMCPError(error, mcpEndpoint ?? providerSessionClient.baseURL),
      labels,
    })
  }, [
    activeSendAbortControllerRef,
    cancelRequestedRunIdsRef,
    clearConversationWorkspace,
    conversationId,
    labels,
    liveTraceEventsRef,
    providerSessionOnline,
    mcpEndpoint,
    recordLiveTraceEvent,
    refetchProviderSessionHealth,
    refreshProviderCatalogContext,
    resetStreamingAssistant,
    revokeAttachmentPreviewUrls,
    runTouchesProviderCatalog,
    setConversationSessionId,
    setConversationProviderSessionTreeId,
    setConversationProviderSessionId,
    setConversationProviderThreadBindingId,
    setConversationRun,
    updateConversationRuntimeState,
    setConversationProviderThreadId,
    setLiveTraceEvents,
    setProviderThreadId,
    setMentionRange,
    setPageTaskRunning,
    setPendingAssistantState,
    setPendingHttpEvents,
    updateConversationTitle,
    updateStreamingAssistantText,
    userId,
  ])
}
