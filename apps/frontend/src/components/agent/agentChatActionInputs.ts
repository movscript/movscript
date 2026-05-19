import type {
  AgentChatActionBindingsInput,
  BuildAgentChatInteractionControllerInputOptions,
} from '@/components/agent/agentChatInteractionInputTypes'

export function buildAgentChatActionBindingsInput({
  activeLocalRun,
  buildingSendDraft,
  context,
  conv,
  loading,
  plan,
  presentation,
  runtime,
  store,
  userId,
}: BuildAgentChatInteractionControllerInputOptions): AgentChatActionBindingsInput {
  return {
    runResultActions: {
      conversationId: conv.id,
      userId,
      setConversationRun: store.setConversationRun,
      setSubmittedInteractionRuns: runtime.setSubmittedInteractionRuns,
      recordLiveTraceEvent: runtime.recordLiveTraceEvent,
      updateStreamingAssistantText: runtime.updateStreamingAssistantText,
      getStreamingAssistantMessageId: runtime.getStreamingAssistantMessageId,
      resetStreamingAssistant: runtime.resetStreamingAssistant,
      messageStore: {
        addMessage: store.messageStore.addMessage,
        upsertMessage: store.messageStore.upsertMessage,
      },
    },
    workflowActions: {
      conversationId: conv.id,
      userId,
      actionableRun: presentation.actionableLocalRun,
      approving: presentation.approvingLocalRun,
      setSubmittedInteractionRuns: runtime.setSubmittedInteractionRuns,
      setConversationRuntime: store.setConversationRuntime,
      setConversationRun: store.setConversationRun,
      messageStore: {
        addMessage: store.messageStore.addMessage,
      },
      liveEvents: () => runtime.liveTraceEventsRef.current,
      refreshAgentCatalogContext: context.refreshAgentCatalogContext,
    },
    planActions: {
      conversationId: conv.id,
      userId,
      run: activeLocalRun,
      snapshot: presentation.activePlanSnapshot,
      busy: runtime.planActionBusy,
      dispatchSettings: plan.planDispatchSettings,
      setBusy: runtime.setPlanActionBusy,
      setConversationRun: store.setConversationRun,
      messageStore: {
        addMessage: store.messageStore.addMessage,
      },
      refetchPlanSnapshot: () => presentation.refetchActivePlanSnapshot(),
    },
    stopAction: {
      conversationId: conv.id,
      userId,
      run: activeLocalRun,
      loading,
      building: buildingSendDraft,
      stopping: presentation.stoppingLocalRun,
      stopRequestedBeforeRun: presentation.stopRequestedBeforeRun,
      generationProgressState: presentation.generationProgressState,
      activeSendAbortControllerRef: runtime.activeSendAbortControllerRef,
      setPendingAssistantState: runtime.setPendingAssistantState,
      resetStreamingAssistant: runtime.resetStreamingAssistant,
      setConversationRun: store.setConversationRun,
      setConversationRuntime: store.setConversationRuntime,
      liveEvents: () => runtime.liveTraceEventsRef.current,
      messageStore: {
        addMessage: store.messageStore.addMessage,
      },
    },
  }
}
