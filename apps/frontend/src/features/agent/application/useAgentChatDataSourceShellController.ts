import { useCallback, useEffect, type ClipboardEvent, type DragEvent } from 'react'
import type { AgentChatDataSourceShellProps } from '@/features/agent/application/agentChatDataSourceShellTypes'
import type { AgentRunProfilePresetId } from '@/features/agent/domain/agentRunProfilePreset'
import {
  buildAgentChatShellComposerPanel,
  buildAgentChatShellHistoryPanel,
  buildAgentChatShellThreadSurface,
} from '@/features/agent/application/agentChatShellViewModels'
import { useAgentChatDataSourceLoadEffect } from '@/features/agent/application/useAgentChatDataSourceLoadEffect'
import { useAgentChatConversationRegistry } from '@/features/agent/application/useAgentChatConversationRegistry'
import { useAgentChatDraftConversation } from '@/features/agent/application/useAgentChatDraftConversation'
import { useAgentChatEscapeKey } from '@/features/agent/application/useAgentChatEscapeKey'
import { useAgentChatPanelCommands } from '@/features/agent/application/useAgentChatPanelCommands'
import { useAgentChatRuntimeController } from '@/features/agent/application/useAgentChatRuntimeController'
import { useAgentChatRunProfileSettings } from '@/features/agent/application/useAgentChatRunProfileSettings'
import { useAgentChatServerRequests } from '@/features/agent/application/useAgentChatServerRequests'
import { useAgentChatShellCoreState } from '@/features/agent/application/useAgentChatShellCoreState'
import { useAgentChatThreadBootstrap } from '@/features/agent/application/useAgentChatThreadBootstrap'
import { useAgentChatThreadCreation } from '@/features/agent/application/useAgentChatThreadCreation'
import { useAgentChatThreadLifecycleEffects } from '@/features/agent/application/useAgentChatThreadLifecycleEffects'
import { useAgentChatThreadList } from '@/features/agent/application/useAgentChatThreadList'
import { useAgentChatThreadRuntimeEffects } from '@/features/agent/application/useAgentChatThreadRuntimeEffects'
import { useAgentChatThreadTabs } from '@/features/agent/application/useAgentChatThreadTabs'
import { useAgentChatThreadViewport } from '@/features/agent/application/useAgentChatThreadViewport'
import { useAgentChatTurnControls } from '@/features/agent/application/useAgentChatTurnControls'
import { useAgentChatShellPresentationState } from '@/features/agent/presentation/useAgentChatShellPresentationState'
import { agentChatRuntimeThreadCanReadTurns } from '@movscript/core/agent/chat'

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
  const {
    activeThreadId,
    activeThreadIdRef,
    composer,
    composerConversationId,
    composerFileRef,
    composerInputRef,
    composerWorkspaceContextLocked,
    dataSource,
    dispatchRuntime,
    endpoint,
    error,
    historyOpen,
    loadDataSourceRef,
    loadThreadsRef,
    loading,
    pendingThreadReadRequests,
    pendingThreadResumeRequests,
    pendingUserItems,
    optimisticUserItems,
    profilePresetId,
    queuedInputs,
    queuedInputsCollapsed,
    readCurrentActiveThreadId,
    readRestorableActiveThreadId,
    realtimeAudioItems,
    realtimeTranscriptItems,
    recentCapabilityEventSequenceRef,
    recentCapabilityEvents,
    resetDraftModeSettings,
    resolvedEmptyThreadLabel,
    restoreStoredThreadRef,
    runtime,
    runtimeRef,
    selectedModelSelectionForRequest,
    sending,
    setActiveThreadIdRefValue,
    setDataSource,
    setDraftConversationId,
    setEndpoint,
    setError,
    setHistoryOpen,
    setLoading,
    setOptimisticUserItems,
    setProfilePresetId,
    setQueuedInputs,
    setQueuedInputsCollapsed,
    setSending,
    setStoppingTurn,
    setThreadModelOverrides,
    shellInstanceIdRef,
    stoppingTurn,
    streamingAgentItems,
    threadModelOverrides,
    threadReadRequests,
    threadReadStates,
    threads,
  } = useAgentChatShellCoreState({
    collaborationMode,
    composerWorkspaceContextLocked: forceComposerWorkspaceContextLocked,
    currentProject,
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
    conversationFocusScope,
    readActiveThreadId,
    resolveModelForRequest,
    selectedModelId,
    threadScopeKey,
    userId,
  })
  const {
    fetchFirstThreadListPage,
    loadMoreThreads,
    refreshThreadList,
    resetThreadListFromCache,
    sourceThreadList,
    sourceThreadListLoaded,
    threadListLoadingMore,
    threadListNextCursor,
  } = useAgentChatThreadList({
    dataSource,
    setError,
    setLoading,
    threadScopeKey,
  })

  const {
    activeThread,
    activeTurn,
    markThreadFailed,
    markThreadMaterializing,
    markThreadReady,
    nextRecentCapabilityEventSequence,
    readActiveRuntimeThreadId,
    setActiveThreadIdValue,
    upsertThread,
    upsertThreadReadResult,
    visibleItems: runtimeVisibleItems,
    visiblePendingServerRequests,
    visibleStatusItems,
  } = useAgentChatRuntimeController({
    activeThreadIdRef,
    dispatchRuntime,
    recentCapabilityEventSequenceRef,
    runtime,
    setActiveThreadIdRefValue,
  })

  useAgentChatDataSourceLoadEffect({
    activeThreadIdRef,
    dataSourceKey,
    dispatchRuntime,
    loadDataSourceRef,
    readRestorableActiveThreadId,
    recentCapabilityEventSequenceRef,
    resetThreadListFromCache,
    setDataSource,
    setEndpoint,
    setError,
    setLoading,
    setOptimisticUserItems,
    setQueuedInputs,
    setSending,
    setStoppingTurn,
  })

  const {
    clearUnavailableActiveThread,
    clearUnavailableStoredThread,
    closedThreadIds,
    conversations,
    markThreadClosed,
    markThreadOpen,
    openThreadIds,
    providerIdentity,
    registerThreadConversation,
    reorderOpenThreads,
    syncThreadConversationTitle,
    threadOrderIndex,
  } = useAgentChatConversationRegistry({
    dispatchRuntime,
    provider,
    providerId,
    providerInstanceId,
    providerProtocol,
    readCurrentActiveThreadId,
    focusScope: conversationFocusScope,
    setActiveThreadIdValue,
    threadScopeKey,
    userId,
  })

  const {
    loadThreads,
    openThread,
    readHistoryThread,
    restoreStoredThread,
  } = useAgentChatThreadBootstrap({
    clearUnavailableActiveThread,
    clearUnavailableStoredThread,
    closedThreadIds,
    dataSource,
    dispatchRuntime,
    fetchFirstThreadListPage,
    markThreadOpen,
    readRestorableActiveThreadId,
    registerThreadConversation,
    runtimeRef,
    setActiveThreadIdValue,
    setError,
    setHistoryOpen,
    setLoading,
    upsertThreadReadResult,
  })

  const createDraftConversation = useAgentChatDraftConversation({
    composerInputRef,
    setActiveThreadIdValue,
    setDraftConversationId,
    setError,
    setHistoryOpen,
    focusScope: conversationFocusScope,
    threadScopeKey,
    userId,
  })

  useEffect(() => {
    if (!dataSource) return
    if (registryActiveThreadId === activeThreadId) return
    if (registryActiveThreadId === activeThreadIdRef.current) return
    if (registryActiveThreadId) {
      void openThread(registryActiveThreadId)
      return
    }
    setActiveThreadIdValue(null)
    setError(null)
  }, [activeThreadId, dataSource, openThread, registryActiveThreadId, setActiveThreadIdValue, setError])

  const requestThreadRead = useCallback((threadId: string) => {
    dispatchRuntime({ type: 'requestThreadRead', threadId })
  }, [dispatchRuntime])

  const {
    startThreadResult,
    startWorkspaceTask,
  } = useAgentChatThreadCreation({
    collaborationMode,
    dataSource,
    endpoint,
    goalModeEnabled,
    loadDataSourceForNewThread,
    markThreadFailed,
    markThreadReady,
    markThreadOpen,
    profilePresetId,
    registerThreadConversation,
    requestThreadRead,
    selectedModelSelectionForRequest,
    setActiveThreadIdValue,
    setDataSource,
    setEndpoint,
    setError,
    setHistoryOpen,
    upsertThread,
  })

  const {
    handleNotification,
    handleServerRequest,
    resolveServerRequest,
  } = useAgentChatServerRequests({
    activeThreadId,
    dataSource,
    dispatchRuntime,
    getActiveThreadId: readActiveRuntimeThreadId,
    markThreadOpen,
    nextRecentEventSequence: nextRecentCapabilityEventSequence,
    setActiveThreadIdValue,
    syncThreadConversationTitle,
    threadScopeKey,
  })

  useAgentChatPanelCommands({
    activeThreadId,
    createDraftConversation,
    dataSource,
    openThread,
    openThreadEventName,
    resetDraftModeSettings,
    setError,
    sourceId: shellInstanceIdRef.current,
    startWorkspaceTask,
  })

  useAgentChatThreadRuntimeEffects({
    closedThreadIds,
    dataSource,
    dispatchRuntime,
    pendingThreadReadRequests,
    pendingThreadResumeRequests,
    profilePresetId,
    runtimeRef,
    selectedModelSelectionForRequest,
    setError,
    threads,
    upsertThreadReadResult,
  })

  const {
    canShowOlderThreadItems,
    handleThreadScroll,
    scrollRef,
    showOlderThreadItems,
    visibleItemWindow,
    visibleItems,
  } = useAgentChatThreadViewport({
    activeThreadId,
    dispatchRuntime,
    optimisticVisibleItems: optimisticUserItems,
    pendingUserItems,
    realtimeAudioItems,
    realtimeTranscriptItems,
    runtimeVisibleItems,
    streamingAgentItems,
    threadReadRequests,
    threadReadStates,
    threads,
  })
  const {
    activeThreadModelValue,
    handleModelChange,
    hasChatContent,
    resolvedHost,
    shellClassName,
  } = useAgentChatShellPresentationState({
    activeThread,
    activeThreadId,
    error,
    host,
    modelOptions,
    onSelectedModelChange,
    recentCapabilityEvents,
    selectedModelId,
    sending,
    setProfilePresetId,
    setThreadModelOverrides,
    surface,
    threadModelOverrides,
    visibleItems,
    visiblePendingServerRequests,
  })
  const activeThreadCanReadTurns = !activeThreadId || agentChatRuntimeThreadCanReadTurns(runtime, activeThreadId)
  const {
    handleProfilePresetChange,
    syncThreadRunProfileSettingsForTurn,
  } = useAgentChatRunProfileSettings({
    activeThreadId,
    activeTurn,
    dataSource,
    dispatchRuntime,
    profilePresetId,
    runtimeRef,
    selectedModelSelectionForRequest,
    setError,
    setProfilePresetId,
  })
  useAgentChatThreadLifecycleEffects({
    activeThread,
    activeThreadId,
    activeThreadCanReadTurns,
    autoLoadThreads,
    dataSource,
    dispatchRuntime,
    handleNotification,
    handleServerRequest,
    historyOpen,
    loadThreads,
    loadThreadsRef,
    loading,
    refreshThreadList,
    restoreStoredThread,
    restoreStoredThreadRef,
    showThreadList,
    sourceThreadListLoaded,
    surface,
    threadScopeKey,
    visiblePendingServerRequests,
  })
  const {
    canSend,
    canStopActiveTurn,
    cancelQueuedInputEdit,
    deleteQueuedInput,
    editQueuedInput,
    sendMessage,
    steerQueuedInputNow,
    stopActiveTurn,
    submitQueuedInputAsTurn,
    updateQueuedInputText,
  } = useAgentChatTurnControls({
    activeThread,
    activeTurn,
    collaborationMode,
    composer,
    composerConversationId,
    composerInputRef,
    composerPlaceholder,
    dataSource,
    dispatchRuntime,
    goalModeEnabled,
    profilePresetId,
    providerLabel,
    queuedInputs,
    runtimeRef,
    selectedModelSelectionForRequest,
    sending,
    setError,
    setQueuedInputs,
    setQueuedInputsCollapsed,
    setSending,
    setOptimisticUserItems,
    setStoppingTurn,
    startThreadResult,
    stoppingTurn,
    syncThreadRunProfileSettingsForTurn,
    threadScopeKey,
    upsertThread,
    upsertThreadReadResult,
    markThreadFailed,
    markThreadReady,
    userId,
  })

  useAgentChatEscapeKey({
    enabled: Boolean(activeTurn && dataSource?.interruptTurn && !stoppingTurn),
    onEscape: () => {
      void stopActiveTurn()
    },
  })

  const {
    closeThreadTab,
    closedHistoryThreads,
    reorderThreadTab,
    threadTabs,
  } = useAgentChatThreadTabs({
    activeThreadId,
    closedThreadIds,
    conversations,
    dataSource,
    dispatchRuntime,
    markThreadClosed,
    markThreadOpen,
    openThreadIds,
    projectId: currentProject?.ID,
    providerIdentity,
    readHistoryThread,
    reorderOpenThreads,
    setActiveThreadIdValue,
    setError,
    sourceThreadList,
    syncThreadConversationTitle,
    threadOrderIndex,
    threads,
    upsertThread,
    upsertThreadReadResult,
    userId,
  })

  return {
    composerPanel: buildAgentChatShellComposerPanel({
      composer,
      fileRef: composerFileRef,
      inputRef: composerInputRef,
      placeholder: composerPlaceholder,
      workspaceContextLocked: composerWorkspaceContextLocked,
      hideWorkspaceProjectSelector: hideComposerWorkspaceProjectSelector,
      hasChatContent,
      pendingServerRequests: visiblePendingServerRequests,
      canSend,
      canStopActiveRun: canStopActiveTurn,
      loading: sending,
      modelOptions,
      modelValue: activeThreadModelValue,
      collaborationMode,
      goalModeEnabled,
      goalState: activeThread?.goal ?? null,
      profilePresetId,
      stoppingActiveRun: stoppingTurn,
      queuedInputHandlers: {
        onCollapseChange: setQueuedInputsCollapsed,
        onDelete: deleteQueuedInput,
        onEdit: editQueuedInput,
        onEditCancel: cancelQueuedInputEdit,
        onSteerNow: (id: string) => void steerQueuedInputNow(id),
        onTextChange: updateQueuedInputText,
      },
      queuedInputSteerEnabled: Boolean(activeTurn && dataSource?.steerTurn),
      queuedInputs,
      queuedInputsCollapsed,
      onDrop: (event: DragEvent) => void composer.handleComposerDrop(event),
      onPaste: (event: ClipboardEvent) => void composer.handleComposerPaste(event),
      onCollaborationModeChange,
      onGoalModeEnabledChange,
      onModelChange: handleModelChange,
      onProfilePresetChange: handleProfilePresetChange,
      onResolveServerRequest: resolveServerRequest,
      onSend: (nextProfilePresetId?: AgentRunProfilePresetId) => void sendMessage(nextProfilePresetId),
      onStopActiveRun: () => void stopActiveTurn(),
    }),
    dataSource,
    error,
    historyPanel: buildAgentChatShellHistoryPanel({
      open: historyOpen,
      dataSourceLabel: dataSource?.label ?? '',
      emptyThreadListLabel,
      endpoint,
      hasMoreThreadPages: Boolean(threadListNextCursor),
      historyThreads: closedHistoryThreads,
      loading,
      loadingMore: threadListLoadingMore,
      threadListLabel,
      onLoadMoreThreads: loadMoreThreads,
      onLoadThreads: refreshThreadList,
      onOpenThread: openThread,
      onToggle: () => setHistoryOpen((open) => !open),
    }),
    resolvedHost,
    shellClassName,
    surface,
    threadSurface: buildAgentChatShellThreadSurface({
      activeThreadId,
      conversationTabs: threadTabs,
      emptyThreadLabel: resolvedEmptyThreadLabel,
      error,
      hasChatContent,
      recentCapabilityEvents,
      scrollRef,
      statusItems: visibleStatusItems,
      hiddenItemCount: visibleItemWindow.hiddenCount,
      canLoadEarlierItems: canShowOlderThreadItems,
      visibleItems,
      onCloseConversation: (threadId: string) => {
        void closeThreadTab(threadId)
      },
      onNewConversation: () => {
        resetDraftModeSettings()
        createDraftConversation()
      },
      onOpenConversation: (threadId: string) => {
        void openThread(threadId)
      },
      onReorderConversation: reorderThreadTab,
      onScroll: handleThreadScroll,
      onShowOlderItems: showOlderThreadItems,
    }),
    unavailableLabel,
  }
}
