import type {
  AgentChatSendPipelineInput,
  BuildAgentChatInteractionControllerInputOptions,
} from '@/features/agent/presentation/agentChatInteractionInputTypes'
import { sendActiveRunRuntimeInput } from '@/features/agent/application/agentRuntimeInput'
import { isTerminalAgentRun } from '@/features/agent/domain/agentRunControl'
import { appendAssistantConversationMessage } from '@movscript/conversation'
import type { ChatMessage, ChatMessageMeta } from '@/features/agent/state/agentStore'

export function buildAgentChatSendPipelineInput({
  activeLocalRun,
  buildingSendDraft,
  composer,
  context,
  conv,
  externalTask,
  loading,
  onExternalDraftConsumed,
  pageToolRequestId,
  presentation,
  runtime,
  store,
  userId,
}: BuildAgentChatInteractionControllerInputOptions): AgentChatSendPipelineInput {
  return {
    draftBuilder: {
      input: composer.input,
      attachments: composer.attachments,
      composerAttachments: composer.composerAttachments,
      resourceAttachmentIndex: composer.resourceAttachmentIndex,
      settings: store.settings,
      currentProject: store.currentProject,
      systemPrompt: '',
      contextLabels: context.contextLabels,
      conversationMessages: conv.messages,
      localThreadId: store.localThreadId,
      modelId: composer.modelId,
      activeModel: composer.activeModel,
      activeConversationManifest: context.activeConversationManifest,
      externalTask,
      pageToolRequestId,
      localAgentOnline: context.localAgentOnline,
      ...(context.localAgentHealth?.mcpEndpoint ? { mcpEndpoint: context.localAgentHealth.mcpEndpoint } : {}),
      refetchLocalAgentHealth: context.refetchLocalAgentHealth,
    },
    commitDraft: {
      userId,
      conversationId: conv.id,
      conversationMessages: conv.messages,
      localAgentOnline: context.localAgentOnline,
      ...(context.localAgentHealth?.mcpEndpoint ? { mcpEndpoint: context.localAgentHealth.mcpEndpoint } : {}),
      activeSendAbortControllerRef: runtime.activeSendAbortControllerRef,
      cancelRequestedRunIdsRef: runtime.cancelRequestedRunIdsRef,
      liveTraceEventsRef: runtime.liveTraceEventsRef,
      messageStore: {
        addMessage: store.messageStore.addMessage,
        upsertMessage: store.messageStore.upsertMessage,
        removeMessage: store.messageStore.removeMessage,
        updateMessageMeta: store.messageStore.updateMessageMeta,
        setConversationMessages: store.messageStore.setConversationMessages,
        clearConversationDraft: store.messageStore.clearConversationDraft,
      },
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
      getStreamingAssistantMessageId: runtime.getStreamingAssistantMessageId,
      recordLiveTraceEvent: runtime.recordLiveTraceEvent,
      revokeAttachmentPreviewUrls: composer.revokeAttachmentPreviewUrls,
      setMentionRange: composer.setMentionRange,
      refetchLocalAgentHealth: context.refetchLocalAgentHealth,
      refreshAgentCatalogContext: context.refreshAgentCatalogContext,
    },
    runtimeThreadHydration: {
      userId,
      conversationId: conv.id,
      conversationMessages: conv.messages,
      localSessionId: store.localSessionId,
      localThreadId: store.localThreadId,
      loading,
      building: buildingSendDraft,
      runtimeLoading: store.conversationRuntime?.loading,
      runtimeBuilding: store.conversationRuntime?.building,
      setLocalThreadId: store.setLocalThreadId,
      setConversationSessionId: store.setConversationSessionId,
      setConversationRuntimeSessionId: (targetUserId, conversationId, sessionId) => {
        store.setConversationRuntimeSessionId(targetUserId, conversationId, sessionId)
        store.setConversationSessionId(conversationId, sessionId)
      },
      setConversationRuntimeThreadId: store.setConversationRuntimeThreadId,
      setConversationRun: store.setConversationRun,
      setSubmittedInteractionRuns: runtime.setSubmittedInteractionRuns,
      setRuntimeStatusLight: runtime.setRuntimeStatusLight,
      updateConversationTitle: store.updateConversationTitle,
      messageStore: {
        setConversationMessages: store.messageStore.setConversationMessages,
      },
    },
    sendActions: {
      input: composer.input,
      composerAttachments: composer.composerAttachments,
      loading: presentation.loading,
      uploading: composer.uploading,
      buildingSendDraft,
      answeringPendingInput: presentation.answeringPendingInput,
      activePendingInputRequest: presentation.activePendingInputRequest,
      canAnswerPendingInputWithText: presentation.canAnswerPendingInputWithText,
      canSendActiveRunRuntimeInput: canSendActiveRunRuntimeInput({
        run: activeLocalRun ?? store.conversationRuntime?.run ?? null,
        threadId: store.localThreadId ?? store.conversationRuntime?.threadId ?? activeLocalRun?.threadId,
      }),
      modelId: composer.modelId,
      debugBeforeSend: runtime.debugBeforeSend,
      pendingSendDraft: runtime.pendingSendDraft,
      externalTask,
      processedExternalTaskRequestIdRef: runtime.processedExternalTaskRequestIdRef,
      inputRef: runtime.inputRef,
      onExternalDraftConsumed,
      updateDraft: composer.updateDraft,
      setMentionRange: composer.setMentionRange,
      addAssistantMessage: (content) => appendAssistantConversationMessage<ChatMessage, ChatMessageMeta>({
        content,
        deps: {
          userId,
          conversationId: conv.id,
          messageStore: store.messageStore,
        },
      }),
      setConversationBuilding: (patch) => store.setConversationRuntime(conv.id, patch),
      sendActiveRunRuntimeInput: async ({ content, attachments }) => {
        const run = activeLocalRun ?? store.conversationRuntime?.run
        const threadId = store.localThreadId ?? store.conversationRuntime?.threadId ?? run?.threadId
        if (!run || !threadId) throw new Error('active runtime run is not available')
        await sendActiveRunRuntimeInput({
          content,
          attachments,
          deps: {
            userId,
            conversationId: conv.id,
            threadId,
            run,
            messageStore: {
              addMessage: store.messageStore.addMessage,
              updateMessageMeta: store.messageStore.updateMessageMeta,
            },
            setConversationRun: store.setConversationRun,
            setConversationRuntime: store.setConversationRuntime,
          },
        })
      },
      setPendingSendDraft: runtime.setPendingSendDraft,
    },
  }
}

function canSendActiveRunRuntimeInput(input: {
  run: NonNullable<BuildAgentChatInteractionControllerInputOptions['activeLocalRun']> | null
  threadId?: string
}): boolean {
  return !!input.run && !isTerminalAgentRun(input.run) && !!input.threadId?.trim()
}
