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
  conversationEstablished,
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
  const draftThreadControl = conversationEstablished
    ? undefined
    : {
        ...(composer.collaborationMode === 'plan' ? { collaborationMode: 'plan' as const } : {}),
        ...(composer.goalModeEnabled
          ? {
              goal: {
                objective: composer.getInput().trim() || 'MovScript agent goal',
                status: 'active' as const,
              },
            }
          : {}),
      }
  const threadControl = draftThreadControl && Object.keys(draftThreadControl).length > 0
    ? draftThreadControl
    : undefined

  return {
    workspaceBuilder: {
      input: composer.input,
      getInput: composer.getInput,
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
      setConversationProviderSessionTreeId: store.setConversationProviderSessionTreeId,
      updateConversationTitle: store.updateConversationTitle,
      setConversationProviderThreadBindingId: store.setConversationProviderThreadBindingId,
      setPageTaskRunning: store.setPageTaskRunning,
      setConversationRun: store.setConversationRun,
      updateConversationRuntimeState: store.updateConversationRuntimeState,
      setLiveTraceEvents: providerSessionState.setLiveTraceEvents,
      setPendingHttpEvents: providerSessionState.setPendingHttpEvents,
      setPendingAssistantState: providerSessionState.setPendingAssistantState,
      resetStreamingAssistant: providerSessionState.resetStreamingAssistant,
      updateStreamingAssistantText: providerSessionState.updateStreamingAssistantText,
      recordLiveTraceEvent: providerSessionState.recordLiveTraceEvent,
      revokeAttachmentPreviewUrls: composer.revokeAttachmentPreviewUrls,
      setMentionRange: composer.setMentionRange,
      refetchProviderSessionHealth: context.refetchProviderSessionHealth,
    },
    sendActions: {
      input: composer.input,
      getInput: composer.getInput,
      composerAttachments: composer.composerAttachments,
      loading: presentation.loading,
      uploading: composer.uploading,
      buildingSendWorkspace,
      answeringPendingInput: presentation.answeringPendingInput,
      activePendingInputRequest: presentation.activePendingInputRequest,
      canAnswerPendingInputWithText: presentation.canAnswerPendingInputWithText,
      canSendActiveRunInput: canSendActiveRunInput({
        run: activeRun ?? store.conversationRuntimeState?.run ?? null,
        sessionId: store.providerSessionId,
      }),
      modelId: composer.modelId,
      workspaceContext: composer.selectedWorkspaceContext,
      ...(threadControl ? { threadControl } : {}),
      debugBeforeSend: providerSessionState.debugBeforeSend,
      pendingSendWorkspace: providerSessionState.pendingSendWorkspace,
      externalTask,
      processedExternalTaskRequestIdRef: providerSessionState.processedExternalTaskRequestIdRef,
      inputRef: providerSessionState.inputRef,
      onExternalWorkspaceConsumed,
      updateWorkspace: composer.updateWorkspace,
      releaseAttachmentResources: composer.revokeAttachmentPreviewUrls,
      setMentionRange: composer.setMentionRange,
      setConversationBuilding: (patch) => store.updateConversationRuntimeState(conv.id, patch),
      sendActiveRunInput: async ({ content, attachments }) => {
        const run = activeRun ?? store.conversationRuntimeState?.run
        if (!run || !store.providerSessionId) throw new Error('active provider session run is not available')
        await sendActiveRunInput({
          content,
          attachments,
          deps: {
            conversationId: conv.id,
            sessionId: store.providerSessionId,
            run,
            setConversationRun: store.setConversationRun,
            updateConversationRuntimeState: store.updateConversationRuntimeState,
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
