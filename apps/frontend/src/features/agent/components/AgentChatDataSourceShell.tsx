import { useCallback, useMemo } from 'react'
import { AgentChatShellView } from '@/features/agent/components/AgentChatShellView'
import type { AgentChatDataSourceShellProps } from '@/features/agent/application/agentChatDataSourceShellTypes'
import { useAgentChatDataSourceLoadEffect } from '@/features/agent/application/useAgentChatDataSourceLoadEffect'
import { useAgentChatConversationRegistry } from '@/features/agent/application/useAgentChatConversationRegistry'
import { useAgentChatDraftConversation } from '@/features/agent/application/useAgentChatDraftConversation'
import { useAgentChatEscapeKey } from '@/features/agent/application/useAgentChatEscapeKey'
import { useAgentChatPanelCommands } from '@/features/agent/application/useAgentChatPanelCommands'
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
import { type AgentChatThread, type AgentChatThreadReadInput } from '@movscript/core/agent/chat'
import { selectAgentChatRuntimeView } from '@movscript/core/agent/chat'
import { positiveInteger } from '@/features/agent/presentation/agentChatDataSourceShellModel'
import { useAgentChatShellPresentationState } from '@/features/agent/presentation/useAgentChatShellPresentationState'
export function AgentChatDataSourceShell({
  userId,
  loadDataSource,
  loadDataSourceForNewThread,
  provider,
  providerId,
  providerInstanceId,
  providerProtocol,
  threadScopeKey,
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

  const setActiveThreadIdValue = useCallback((threadId: string | null) => {
    setActiveThreadIdRefValue(threadId)
    dispatchRuntime({ type: 'setActiveThreadId', threadId })
  }, [dispatchRuntime, setActiveThreadIdRefValue])
  const readActiveRuntimeThreadId = useCallback(() => activeThreadIdRef.current, [])
  const nextRecentCapabilityEventSequence = useCallback(() => ++recentCapabilityEventSequenceRef.current, [])

  useAgentChatDataSourceLoadEffect({
    activeThreadIdRef,
    dispatchRuntime,
    loadDataSourceRef,
    readRestorableActiveThreadId,
    recentCapabilityEventSequenceRef,
    resetThreadListFromCache,
    setDataSource,
    setEndpoint,
    setError,
    setLoading,
    setQueuedInputs,
    setSending,
    setStoppingTurn,
  })

  const upsertThread = useCallback((thread: AgentChatThread) => {
    dispatchRuntime({ type: 'upsertThread', thread })
  }, [])

  const upsertThreadReadResult = useCallback((thread: AgentChatThread, input: AgentChatThreadReadInput) => {
    dispatchRuntime({ type: 'upsertThreadReadResult', thread, input })
  }, [])

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
    threadOrderIndex,
  } = useAgentChatConversationRegistry({
    dispatchRuntime,
    provider,
    providerId,
    providerInstanceId,
    providerProtocol,
    readCurrentActiveThreadId,
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
    threadScopeKey,
    userId,
  })

  const {
    startThreadResult,
    startWorkspaceTask,
  } = useAgentChatThreadCreation({
    collaborationMode,
    dataSource,
    endpoint,
    goalModeEnabled,
    loadDataSourceForNewThread,
    markThreadOpen,
    profilePresetId,
    registerThreadConversation,
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
    selectedModelSelectionForRequest,
    setError,
    threads,
    upsertThreadReadResult,
  })

  const {
    activeThread,
    activeTurn,
    visibleItems: runtimeVisibleItems,
    visiblePendingServerRequests,
    visibleStatusItems,
  } = useMemo(() => selectAgentChatRuntimeView(runtime), [runtime])
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
    setProfilePresetId,
    setThreadModelOverrides,
    surface,
    threadModelOverrides,
    visibleItems,
    visiblePendingServerRequests,
  })
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
    setStoppingTurn,
    startThreadResult,
    stoppingTurn,
    syncThreadRunProfileSettingsForTurn,
    threadScopeKey,
    upsertThread,
    upsertThreadReadResult,
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
    projectId: positiveInteger(currentProject?.ID),
    providerIdentity,
    readHistoryThread,
    setActiveThreadIdValue,
    setError,
    sourceThreadList,
    threadOrderIndex,
    threads,
    upsertThread,
    upsertThreadReadResult,
    userId,
  })
  return (
    <AgentChatShellView
      activeThread={activeThread} activeThreadId={activeThreadId}
      activeThreadModelValue={activeThreadModelValue} canSend={canSend}
      canShowOlderThreadItems={canShowOlderThreadItems} canStopActiveTurn={canStopActiveTurn}
      closedHistoryThreads={closedHistoryThreads} collaborationMode={collaborationMode}
      composer={composer} composerFileRef={composerFileRef} composerInputRef={composerInputRef}
      composerPlaceholder={composerPlaceholder} composerWorkspaceContextLocked={composerWorkspaceContextLocked}
      dataSource={dataSource} emptyThreadListLabel={emptyThreadListLabel} endpoint={endpoint}
      error={error} goalModeEnabled={goalModeEnabled} handleModelChange={handleModelChange}
      handleProfilePresetChange={handleProfilePresetChange} hasChatContent={hasChatContent}
      hideComposerWorkspaceProjectSelector={hideComposerWorkspaceProjectSelector}
      historyOpen={historyOpen} loading={loading} modelOptions={modelOptions}
      profilePresetId={profilePresetId}
      queuedInputHandlers={{
        onCollapseChange: setQueuedInputsCollapsed,
        onDelete: deleteQueuedInput,
        onEdit: editQueuedInput,
        onEditCancel: cancelQueuedInputEdit,
        onSteerNow: (id) => void steerQueuedInputNow(id),
        onTextChange: updateQueuedInputText,
      }}
      queuedInputSteerEnabled={Boolean(activeTurn && dataSource?.steerTurn)}
      queuedInputs={queuedInputs} queuedInputsCollapsed={queuedInputsCollapsed}
      recentCapabilityEvents={recentCapabilityEvents} reorderThreadTab={reorderThreadTab}
      resolvedEmptyThreadLabel={resolvedEmptyThreadLabel} resolvedHost={resolvedHost}
      scrollRef={scrollRef} sending={sending} shellClassName={shellClassName}
      showOlderThreadItems={showOlderThreadItems} stoppingTurn={stoppingTurn} surface={surface}
      threadListLabel={threadListLabel} threadListLoadingMore={threadListLoadingMore}
      threadListNextCursor={threadListNextCursor} threadTabs={threadTabs} unavailableLabel={unavailableLabel}
      visibleItemWindow={visibleItemWindow} visibleItems={visibleItems}
      visiblePendingServerRequests={visiblePendingServerRequests} visibleStatusItems={visibleStatusItems}
      onCloseThreadTab={(threadId) => {
        void closeThreadTab(threadId)
      }}
      onCollaborationModeChange={onCollaborationModeChange}
      onComposerDrop={(event) => void composer.handleComposerDrop(event)}
      onComposerPaste={(event) => void composer.handleComposerPaste(event)}
      onGoalModeEnabledChange={onGoalModeEnabledChange}
      onLoadMoreThreads={loadMoreThreads}
      onLoadThreads={refreshThreadList}
      onNewConversation={() => {
        resetDraftModeSettings()
        createDraftConversation()
      }}
      onOpenThread={openThread}
      onResolveServerRequest={resolveServerRequest}
      onScroll={handleThreadScroll}
      onSend={(nextProfilePresetId) => void sendMessage(nextProfilePresetId)}
      onStopActiveTurn={() => void stopActiveTurn()}
      onToggleHistory={() => setHistoryOpen((open) => !open)}
    />
  )
}
