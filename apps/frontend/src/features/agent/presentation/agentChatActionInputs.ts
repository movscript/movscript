import type {
  AgentChatActionBindingsInput,
  BuildAgentChatInteractionControllerInputOptions,
} from '@/features/agent/presentation/agentChatInteractionInputTypes'

export function buildAgentChatActionBindingsInput({
  activeLocalRun,
  buildingSendWorkspace,
  context,
  conv,
  loading,
  taskGraph,
  presentation,
  runtime,
  store,
}: BuildAgentChatInteractionControllerInputOptions): AgentChatActionBindingsInput {
  return {
    runResultActions: {
      conversationId: conv.id,
      setConversationRun: store.setConversationRun,
      setSubmittedInteractionRuns: runtime.setSubmittedInteractionRuns,
      recordLiveTraceEvent: runtime.recordLiveTraceEvent,
      updateStreamingAssistantText: runtime.updateStreamingAssistantText,
    },
    runInteractionActions: {
      conversationId: conv.id,
      actionableRun: presentation.actionableLocalRun,
      interactionRuns: presentation.interactionRuns,
      approving: presentation.approvingLocalRun,
      setSubmittedInteractionRuns: runtime.setSubmittedInteractionRuns,
      setConversationRuntime: store.setConversationRuntime,
      setConversationRun: store.setConversationRun,
      refreshAgentCatalogContext: context.refreshAgentCatalogContext,
    },
    planActions: {
      conversationId: conv.id,
      run: activeLocalRun,
      snapshot: presentation.activePlanSnapshot,
      busy: runtime.planActionBusy,
      dispatchSettings: taskGraph.planDispatchSettings,
      setBusy: runtime.setPlanActionBusy,
      setConversationRun: store.setConversationRun,
      setConversationRuntime: store.setConversationRuntime,
      refetchPlanSnapshot: () => presentation.refetchActivePlanSnapshot(),
    },
    stopAction: {
      conversationId: conv.id,
      run: activeLocalRun,
      loading,
      building: buildingSendWorkspace,
      stopping: presentation.stoppingLocalRun,
      stopRequestedBeforeRun: presentation.stopRequestedBeforeRun,
      generationProgressState: presentation.generationProgressState,
      activeSendAbortControllerRef: runtime.activeSendAbortControllerRef,
      setPendingAssistantState: runtime.setPendingAssistantState,
      resetStreamingAssistant: runtime.resetStreamingAssistant,
      setConversationRun: store.setConversationRun,
      setConversationRuntime: store.setConversationRuntime,
    },
  }
}
