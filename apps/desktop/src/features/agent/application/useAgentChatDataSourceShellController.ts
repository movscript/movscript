import type { AgentChatDataSourceShellProps } from '@/features/agent/application/agentChatDataSourceShellTypes'
import { buildAgentChatDataSourceShellControllerView } from '@/features/agent/application/agentChatDataSourceShellControllerView'
import { useAgentChatDataSourceShellRuntimeSetup } from '@/features/agent/application/useAgentChatDataSourceShellRuntimeSetup'
import { useAgentChatEscapeKey } from '@/features/agent/application/useAgentChatEscapeKey'
import { useAgentChatPanelCommands } from '@/features/agent/application/useAgentChatPanelCommands'
import { useAgentChatRegistryActiveThreadEffect } from '@/features/agent/application/useAgentChatRegistryActiveThreadEffect'
import { useAgentChatRunProfileSettings } from '@/features/agent/application/useAgentChatRunProfileSettings'
import { useAgentChatServerRequests } from '@/features/agent/application/useAgentChatServerRequests'
import { useAgentChatThreadCreation } from '@/features/agent/application/useAgentChatThreadCreation'
import { useAgentChatThreadLifecycleEffects } from '@/features/agent/application/useAgentChatThreadLifecycleEffects'
import { useAgentChatThreadRuntimeEffects } from '@/features/agent/application/useAgentChatThreadRuntimeEffects'
import { useAgentChatThreadTabs } from '@/features/agent/application/useAgentChatThreadTabs'
import { useAgentChatThreadViewport } from '@/features/agent/application/useAgentChatThreadViewport'
import { useAgentChatTurnControls } from '@/features/agent/application/useAgentChatTurnControls'
import { useAgentChatShellPresentationState } from '@/features/agent/presentation/useAgentChatShellPresentationState'
import { agentChatRuntimeThreadCanReadTurns } from '@movscript/agent-chat'

export function useAgentChatDataSourceShellController({
  userId,
  loadDataSource,
  loadDataSourceForNewThread,
  dataSourceKey,
  provider,
  providerId,
  providerInstanceId,
  providerProtocol,
  threadScopeKey,
  conversationFocusScope,
  registryActiveThreadId,
  readActiveThreadId,
  openThreadEventName,
  providerLabel,
  threadListLabel,
  emptyThreadListLabel,
  emptyThreadLabel,
  unavailableLabel,
  composerPlaceholder,
  composerWorkspaceContextLocked: forceComposerWorkspaceContextLocked = false,
  resolveModelForRequest = () => ({}),
  modelOptions = [],
  modelUnavailableMessage,
  currentProject = null,
  hideComposerWorkspaceProjectSelector = false,
  selectedModelId,
  onSelectedModelChange,
  collaborationMode = 'default',
  goalModeEnabled = false,
  onCollaborationModeChange,
  onGoalModeEnabledChange,
  host,
  surface = 'panel',
  showThreadList = surface !== 'page',
  autoLoadThreads = true,
}: AgentChatDataSourceShellProps) {
  const setup = useAgentChatDataSourceShellRuntimeSetup({
    collaborationMode,
    composerWorkspaceContextLocked: forceComposerWorkspaceContextLocked,
    currentProject,
    conversationFocusScope,
    dataSourceKey,
    emptyThreadLabel,
    goalModeEnabled,
    loadDataSource,
    modelOptions,
    onCollaborationModeChange,
    onGoalModeEnabledChange,
    provider,
    providerId,
    providerInstanceId,
    providerProtocol,
    readActiveThreadId,
    resolveModelForRequest,
    selectedModelId,
    threadScopeKey,
    userId,
  })

  useAgentChatRegistryActiveThreadEffect({
    activeThreadId: setup.activeThreadId,
    activeThreadIdRef: setup.activeThreadIdRef,
    dataSource: setup.dataSource,
    openThread: setup.openThread,
    registryActiveThreadId,
    setActiveThreadIdValue: setup.setActiveThreadIdValue,
    setError: setup.setError,
  })

  const threadCreation = useAgentChatThreadCreation({
    collaborationMode,
    dataSource: setup.dataSource,
    endpoint: setup.endpoint,
    goalModeEnabled,
    loadDataSourceForNewThread,
    markThreadFailed: setup.markThreadFailed,
    markThreadReady: setup.markThreadReady,
    markThreadOpen: setup.markThreadOpen,
    profilePresetId: setup.profilePresetId,
    registerThreadConversation: setup.registerThreadConversation,
    requestThreadRead: setup.requestThreadRead,
    selectedModelSelectionForRequest: setup.selectedModelSelectionForRequest,
    setActiveThreadIdValue: setup.setActiveThreadIdValue,
    setDataSource: setup.setDataSource,
    setEndpoint: setup.setEndpoint,
    setError: setup.setError,
    setHistoryOpen: setup.setHistoryOpen,
    upsertThread: setup.upsertThread,
  })

  const serverRequests = useAgentChatServerRequests({
    activeThreadId: setup.activeThreadId,
    dataSource: setup.dataSource,
    dispatchRuntime: setup.dispatchRuntime,
    getActiveThreadId: setup.readActiveRuntimeThreadId,
    markThreadOpen: setup.markThreadOpen,
    nextRecentEventSequence: setup.nextRecentCapabilityEventSequence,
    setActiveThreadIdValue: setup.setActiveThreadIdValue,
    syncThreadConversationTitle: setup.syncThreadConversationTitle,
    threadScopeKey,
  })

  useAgentChatPanelCommands({
    activeThreadId: setup.activeThreadId,
    createDraftConversation: setup.createDraftConversation,
    dataSource: setup.dataSource,
    openThread: setup.openThread,
    openThreadEventName,
    resetDraftModeSettings: setup.resetDraftModeSettings,
    setError: setup.setError,
    sourceId: setup.shellInstanceIdRef.current,
    startWorkspaceTask: threadCreation.startWorkspaceTask,
  })

  useAgentChatThreadRuntimeEffects({
    closedThreadIds: setup.closedThreadIds,
    dataSource: setup.dataSource,
    dispatchRuntime: setup.dispatchRuntime,
    pendingThreadReadRequests: setup.pendingThreadReadRequests,
    pendingThreadResumeRequests: setup.pendingThreadResumeRequests,
    profilePresetId: setup.profilePresetId,
    runtimeRef: setup.runtimeRef,
    selectedModelSelectionForRequest: setup.selectedModelSelectionForRequest,
    setError: setup.setError,
    threads: setup.threads,
    upsertThreadReadResult: setup.upsertThreadReadResult,
  })

  const viewport = useAgentChatThreadViewport({
    activeThreadId: setup.activeThreadId,
    dispatchRuntime: setup.dispatchRuntime,
    optimisticVisibleItems: setup.optimisticUserItems,
    pendingUserItems: setup.pendingUserItems,
    realtimeAudioItems: setup.realtimeAudioItems,
    realtimeTranscriptItems: setup.realtimeTranscriptItems,
    runtimeVisibleItems: setup.visibleItems,
    streamingAgentItems: setup.streamingAgentItems,
    threadReadRequests: setup.threadReadRequests,
    threadReadStates: setup.threadReadStates,
    threads: setup.threads,
  })
  const threadError = modelUnavailableMessage ?? setup.error
  const presentation = useAgentChatShellPresentationState({
    activeThread: setup.activeThread,
    activeThreadId: setup.activeThreadId,
    error: threadError,
    host,
    modelOptions,
    onSelectedModelChange,
    recentCapabilityEvents: setup.recentCapabilityEvents,
    selectedModelId,
    sending: setup.sending,
    setProfilePresetId: setup.setProfilePresetId,
    setThreadModelOverrides: setup.setThreadModelOverrides,
    surface,
    threadModelOverrides: setup.threadModelOverrides,
    visibleItems: viewport.visibleItems,
    visiblePendingServerRequests: setup.visiblePendingServerRequests,
  })
  const activeThreadCanReadTurns = !setup.activeThreadId || agentChatRuntimeThreadCanReadTurns(setup.runtime, setup.activeThreadId)
  const runProfiles = useAgentChatRunProfileSettings({
    activeThreadId: setup.activeThreadId,
    activeTurn: setup.activeTurn,
    dataSource: setup.dataSource,
    dispatchRuntime: setup.dispatchRuntime,
    profilePresetId: setup.profilePresetId,
    runtimeRef: setup.runtimeRef,
    selectedModelSelectionForRequest: setup.selectedModelSelectionForRequest,
    setError: setup.setError,
    setProfilePresetId: setup.setProfilePresetId,
  })
  useAgentChatThreadLifecycleEffects({
    activeThread: setup.activeThread,
    activeThreadId: setup.activeThreadId,
    activeThreadCanReadTurns,
    autoLoadThreads,
    dataSource: setup.dataSource,
    dispatchRuntime: setup.dispatchRuntime,
    handleNotification: serverRequests.handleNotification,
    handleServerRequest: serverRequests.handleServerRequest,
    historyOpen: setup.historyOpen,
    loadThreads: setup.loadThreads,
    loadThreadsRef: setup.loadThreadsRef,
    loading: setup.loading,
    refreshThreadList: setup.refreshThreadList,
    restoreStoredThread: setup.restoreStoredThread,
    restoreStoredThreadRef: setup.restoreStoredThreadRef,
    showThreadList,
    sourceThreadListLoaded: setup.sourceThreadListLoaded,
    surface,
    threadScopeKey,
    visiblePendingServerRequests: setup.visiblePendingServerRequests,
  })
  const turnControls = useAgentChatTurnControls({
    activeThread: setup.activeThread,
    activeTurn: setup.activeTurn,
    collaborationMode,
    composer: setup.composer,
    composerConversationId: setup.composerConversationId,
    composerInputRef: setup.composerInputRef,
    composerPlaceholder,
    dataSource: setup.dataSource,
    dispatchRuntime: setup.dispatchRuntime,
    goalModeEnabled,
    profilePresetId: setup.profilePresetId,
    providerLabel,
    queuedInputs: setup.queuedInputs,
    runtimeRef: setup.runtimeRef,
    selectedModelSelectionForRequest: setup.selectedModelSelectionForRequest,
    sendDisabledReason: modelUnavailableMessage,
    sending: setup.sending,
    setError: setup.setError,
    setQueuedInputs: setup.setQueuedInputs,
    setQueuedInputsCollapsed: setup.setQueuedInputsCollapsed,
    setSending: setup.setSending,
    setOptimisticUserItems: setup.setOptimisticUserItems,
    setStoppingTurn: setup.setStoppingTurn,
    startThreadResult: threadCreation.startThreadResult,
    stoppingTurn: setup.stoppingTurn,
    syncThreadRunProfileSettingsForTurn: runProfiles.syncThreadRunProfileSettingsForTurn,
    threadScopeKey,
    upsertThread: setup.upsertThread,
    upsertThreadReadResult: setup.upsertThreadReadResult,
    markThreadFailed: setup.markThreadFailed,
    markThreadReady: setup.markThreadReady,
    userId,
  })

  useAgentChatEscapeKey({
    enabled: Boolean(setup.activeTurn && setup.dataSource?.interruptTurn && !setup.stoppingTurn),
    onEscape: () => {
      void turnControls.stopActiveTurn()
    },
  })

  const tabs = useAgentChatThreadTabs({
    activeThreadId: setup.activeThreadId,
    closedThreadIds: setup.closedThreadIds,
    conversations: setup.conversations,
    dataSource: setup.dataSource,
    dispatchRuntime: setup.dispatchRuntime,
    markThreadClosed: setup.markThreadClosed,
    markThreadOpen: setup.markThreadOpen,
    openThreadIds: setup.openThreadIds,
    projectId: currentProject?.ID,
    providerIdentity: setup.providerIdentity,
    readHistoryThread: setup.readHistoryThread,
    reorderOpenThreads: setup.reorderOpenThreads,
    setActiveThreadIdValue: setup.setActiveThreadIdValue,
    setError: setup.setError,
    sourceThreadList: setup.sourceThreadList,
    syncThreadConversationTitle: setup.syncThreadConversationTitle,
    threadOrderIndex: setup.threadOrderIndex,
    threads: setup.threads,
    upsertThread: setup.upsertThread,
    upsertThreadReadResult: setup.upsertThreadReadResult,
    userId,
  })

  return buildAgentChatDataSourceShellControllerView({
    props: {
      collaborationMode,
      composerPlaceholder,
      emptyThreadLabel,
      emptyThreadListLabel,
      goalModeEnabled,
      hideComposerWorkspaceProjectSelector,
      modelOptions,
      modelUnavailableMessage,
      onCollaborationModeChange,
      onGoalModeEnabledChange,
      surface,
      threadListLabel,
      unavailableLabel,
    },
    setup,
    serverRequests,
    viewport,
    presentation,
    runProfiles,
    turnControls,
    tabs,
  })
}
