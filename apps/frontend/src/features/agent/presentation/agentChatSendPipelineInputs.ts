import type {
  AgentChatSendPipelineInput,
  BuildAgentChatInteractionControllerInputOptions,
} from '@/features/agent/presentation/agentChatInteractionInputTypes'
import { sendActiveRunInput } from '@/features/agent/application/agentActiveRunInput'
import { isTerminalAgentRun } from '@/features/agent/domain/agentRunControl'

export function buildAgentChatSendPipelineInput({
  activeRun,
  buildingSendWorkspace,
  composer,
  context,
  conv,
  externalTask,
  onExternalWorkspaceConsumed,
  pageToolRequestId,
  presentation,
  providerSessionState,
  store,
  userId,
}: BuildAgentChatInteractionControllerInputOptions): AgentChatSendPipelineInput {
  return {
    workspaceBuilder: {
      input: composer.input,
      attachments: composer.attachments,
      composerAttachments: composer.composerAttachments,
      resourceAttachmentIndex: composer.resourceAttachmentIndex,
      settings: store.settings,
      currentProject: store.currentProject,
      systemPrompt: '',
      contextLabels: context.contextLabels,
      providerThreadId: store.providerThreadId,
      modelId: composer.modelId,
      activeModel: composer.activeModel,
      activeConversationManifest: context.activeConversationManifest,
      externalTask,
      pageToolRequestId,
      providerSessionId: store.providerSessionId,
      providerSessionOnline: context.providerSessionOnline,
      ...(context.providerSessionHealth?.mcpEndpoint ? { mcpEndpoint: context.providerSessionHealth.mcpEndpoint } : {}),
      refetchProviderSessionHealth: context.refetchProviderSessionHealth,
    },
    commitWorkspace: {
      userId,
      conversationId: conv.id,
      providerSessionOnline: context.providerSessionOnline,
      ...(context.providerSessionHealth?.mcpEndpoint ? { mcpEndpoint: context.providerSessionHealth.mcpEndpoint } : {}),
      activeSendAbortControllerRef: providerSessionState.activeSendAbortControllerRef,
      cancelRequestedRunIdsRef: providerSessionState.cancelRequestedRunIdsRef,
      liveTraceEventsRef: providerSessionState.liveTraceEventsRef,
      clearConversationWorkspace: store.clearConversationWorkspace,
      setConversationSessionId: store.setConversationSessionId,
      setConversationProviderThreadId: store.setConversationProviderThreadId,
      setConversationProviderSessionId: (targetUserId, conversationId, sessionId) => {
        store.setConversationProviderSessionId(targetUserId, conversationId, sessionId)
        store.setConversationSessionId(conversationId, sessionId)
      },
      updateConversationTitle: store.updateConversationTitle,
      setProviderThreadId: store.setProviderThreadId,
      setPageTaskRunning: store.setPageTaskRunning,
      setConversationRun: store.setConversationRun,
      setConversationProviderSessionState: store.setConversationProviderSessionState,
      setLiveTraceEvents: providerSessionState.setLiveTraceEvents,
      setPendingHttpEvents: providerSessionState.setPendingHttpEvents,
      setPendingAssistantState: providerSessionState.setPendingAssistantState,
      resetStreamingAssistant: providerSessionState.resetStreamingAssistant,
      updateStreamingAssistantText: providerSessionState.updateStreamingAssistantText,
      recordLiveTraceEvent: providerSessionState.recordLiveTraceEvent,
      revokeAttachmentPreviewUrls: composer.revokeAttachmentPreviewUrls,
      setMentionRange: composer.setMentionRange,
      refetchProviderSessionHealth: context.refetchProviderSessionHealth,
      refreshProviderCatalogContext: context.refreshProviderCatalogContext,
    },
    sendActions: {
      input: composer.input,
      composerAttachments: composer.composerAttachments,
      loading: presentation.loading,
      uploading: composer.uploading,
      buildingSendWorkspace,
      answeringPendingInput: presentation.answeringPendingInput,
      activePendingInputRequest: presentation.activePendingInputRequest,
      canAnswerPendingInputWithText: presentation.canAnswerPendingInputWithText,
      canSendActiveRunInput: canSendActiveRunInput({
        run: activeRun ?? store.conversationProviderSessionState?.run ?? null,
        sessionId: store.providerSessionId,
      }),
      modelId: composer.modelId,
      debugBeforeSend: providerSessionState.debugBeforeSend,
      pendingSendWorkspace: providerSessionState.pendingSendWorkspace,
      externalTask,
      processedExternalTaskRequestIdRef: providerSessionState.processedExternalTaskRequestIdRef,
      inputRef: providerSessionState.inputRef,
      onExternalWorkspaceConsumed,
      updateWorkspace: composer.updateWorkspace,
      setMentionRange: composer.setMentionRange,
      setConversationBuilding: (patch) => store.setConversationProviderSessionState(conv.id, patch),
      sendActiveRunInput: async ({ content, attachments }) => {
        const run = activeRun ?? store.conversationProviderSessionState?.run
        if (!run || !store.providerSessionId) throw new Error('active provider session run is not available')
        await sendActiveRunInput({
          content,
          attachments,
          deps: {
            conversationId: conv.id,
            sessionId: store.providerSessionId,
            run,
            setConversationRun: store.setConversationRun,
            setConversationProviderSessionState: store.setConversationProviderSessionState,
          },
        })
      },
      setPendingSendWorkspace: providerSessionState.setPendingSendWorkspace,
    },
  }
}

function canSendActiveRunInput(input: {
  run: NonNullable<BuildAgentChatInteractionControllerInputOptions['activeRun']> | null
  sessionId?: string
}): boolean {
  return !!input.run && !isTerminalAgentRun(input.run) && !!input.sessionId?.trim()
}
