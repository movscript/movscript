import type {
  AgentChatSendPipelineInput,
  BuildAgentChatInteractionControllerInputOptions,
} from '@/features/agent/presentation/agentChatInteractionInputTypes'
import { sendActiveRunRuntimeInput } from '@/features/agent/application/agentRuntimeInput'
import { isTerminalAgentRun } from '@/features/agent/domain/agentRunControl'

export function buildAgentChatSendPipelineInput({
  activeLocalRun,
  buildingSendWorkspace,
  composer,
  context,
  conv,
  externalTask,
  onExternalWorkspaceConsumed,
  pageToolRequestId,
  presentation,
  runtime,
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
      localThreadId: store.localThreadId,
      modelId: composer.modelId,
      activeModel: composer.activeModel,
      activeConversationManifest: context.activeConversationManifest,
      externalTask,
      pageToolRequestId,
      localRuntimeSessionId: store.localSessionId,
      localAgentOnline: context.localAgentOnline,
      ...(context.localAgentHealth?.mcpEndpoint ? { mcpEndpoint: context.localAgentHealth.mcpEndpoint } : {}),
      refetchLocalAgentHealth: context.refetchLocalAgentHealth,
    },
    commitWorkspace: {
      userId,
      conversationId: conv.id,
      localAgentOnline: context.localAgentOnline,
      ...(context.localAgentHealth?.mcpEndpoint ? { mcpEndpoint: context.localAgentHealth.mcpEndpoint } : {}),
      activeSendAbortControllerRef: runtime.activeSendAbortControllerRef,
      cancelRequestedRunIdsRef: runtime.cancelRequestedRunIdsRef,
      liveTraceEventsRef: runtime.liveTraceEventsRef,
      clearConversationWorkspace: store.clearConversationWorkspace,
      setConversationSessionId: store.setConversationSessionId,
      setConversationRuntimeThreadId: store.setConversationRuntimeThreadId,
      setConversationRuntimeSessionId: (targetUserId, conversationId, sessionId) => {
        store.setConversationRuntimeSessionId(targetUserId, conversationId, sessionId)
        store.setConversationSessionId(conversationId, sessionId)
      },
      updateConversationTitle: store.updateConversationTitle,
      setLocalThreadId: store.setLocalThreadId,
      setPageTaskRunning: store.setPageTaskRunning,
      setConversationRun: store.setConversationRun,
      setConversationRuntime: store.setConversationRuntime,
      setLiveTraceEvents: runtime.setLiveTraceEvents,
      setPendingHttpEvents: runtime.setPendingHttpEvents,
      setPendingAssistantState: runtime.setPendingAssistantState,
      resetStreamingAssistant: runtime.resetStreamingAssistant,
      updateStreamingAssistantText: runtime.updateStreamingAssistantText,
      recordLiveTraceEvent: runtime.recordLiveTraceEvent,
      revokeAttachmentPreviewUrls: composer.revokeAttachmentPreviewUrls,
      setMentionRange: composer.setMentionRange,
      refetchLocalAgentHealth: context.refetchLocalAgentHealth,
      refreshAgentCatalogContext: context.refreshAgentCatalogContext,
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
      canSendActiveRunRuntimeInput: canSendActiveRunRuntimeInput({
        run: activeLocalRun ?? store.conversationRuntime?.run ?? null,
        sessionId: store.localSessionId,
      }),
      modelId: composer.modelId,
      debugBeforeSend: runtime.debugBeforeSend,
      pendingSendWorkspace: runtime.pendingSendWorkspace,
      externalTask,
      processedExternalTaskRequestIdRef: runtime.processedExternalTaskRequestIdRef,
      inputRef: runtime.inputRef,
      onExternalWorkspaceConsumed,
      updateWorkspace: composer.updateWorkspace,
      setMentionRange: composer.setMentionRange,
      setConversationBuilding: (patch) => store.setConversationRuntime(conv.id, patch),
      sendActiveRunRuntimeInput: async ({ content, attachments }) => {
        const run = activeLocalRun ?? store.conversationRuntime?.run
        if (!run || !store.localSessionId) throw new Error('active runtime session run is not available')
        await sendActiveRunRuntimeInput({
          content,
          attachments,
          deps: {
            conversationId: conv.id,
            sessionId: store.localSessionId,
            run,
            setConversationRun: store.setConversationRun,
            setConversationRuntime: store.setConversationRuntime,
          },
        })
      },
      setPendingSendWorkspace: runtime.setPendingSendWorkspace,
    },
  }
}

function canSendActiveRunRuntimeInput(input: {
  run: NonNullable<BuildAgentChatInteractionControllerInputOptions['activeLocalRun']> | null
  sessionId?: string
}): boolean {
  return !!input.run && !isTerminalAgentRun(input.run) && !!input.sessionId?.trim()
}
