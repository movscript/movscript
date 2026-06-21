import { useCallback } from 'react'
import type { AgentChatDataSourceShellProps } from '@/features/agent/application/agentChatDataSourceShellTypes'
import { useAgentChatDataSourceLoadEffect } from '@/features/agent/application/useAgentChatDataSourceLoadEffect'
import { useAgentChatConversationRegistry } from '@/features/agent/application/useAgentChatConversationRegistry'
import { useAgentChatDraftConversation } from '@/features/agent/application/useAgentChatDraftConversation'
import { useAgentChatRuntimeController } from '@/features/agent/application/useAgentChatRuntimeController'
import { useAgentChatShellCoreState } from '@/features/agent/application/useAgentChatShellCoreState'
import { useAgentChatThreadBootstrap } from '@/features/agent/application/useAgentChatThreadBootstrap'
import { useAgentChatThreadList } from '@/features/agent/application/useAgentChatThreadList'

type AgentChatDataSourceShellRuntimeSetupProps = Pick<
  AgentChatDataSourceShellProps,
  | 'userId'
  | 'loadDataSource'
  | 'dataSourceKey'
  | 'provider'
  | 'providerId'
  | 'providerInstanceId'
  | 'providerProtocol'
  | 'threadScopeKey'
  | 'conversationFocusScope'
  | 'readActiveThreadId'
  | 'emptyThreadLabel'
  | 'currentProject'
  | 'composerWorkspaceContextLocked'
  | 'resolveModelForRequest'
  | 'modelOptions'
  | 'selectedModelId'
  | 'collaborationMode'
  | 'goalModeEnabled'
  | 'onCollaborationModeChange'
  | 'onGoalModeEnabledChange'
>

export function useAgentChatDataSourceShellRuntimeSetup({
  userId,
  loadDataSource,
  dataSourceKey,
  provider,
  providerId,
  providerInstanceId,
  providerProtocol,
  threadScopeKey,
  conversationFocusScope,
  readActiveThreadId,
  emptyThreadLabel,
  currentProject = null,
  composerWorkspaceContextLocked: forceComposerWorkspaceContextLocked = false,
  resolveModelForRequest = () => ({}),
  modelOptions = [],
  selectedModelId,
  collaborationMode = 'default',
  goalModeEnabled = false,
  onCollaborationModeChange,
  onGoalModeEnabledChange,
}: AgentChatDataSourceShellRuntimeSetupProps) {
  const coreState = useAgentChatShellCoreState({
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
  const threadList = useAgentChatThreadList({
    dataSource: coreState.dataSource,
    setError: coreState.setError,
    setLoading: coreState.setLoading,
    threadScopeKey,
  })

  const runtimeController = useAgentChatRuntimeController({
    activeThreadIdRef: coreState.activeThreadIdRef,
    dispatchRuntime: coreState.dispatchRuntime,
    recentCapabilityEventSequenceRef: coreState.recentCapabilityEventSequenceRef,
    runtime: coreState.runtime,
    setActiveThreadIdRefValue: coreState.setActiveThreadIdRefValue,
  })

  useAgentChatDataSourceLoadEffect({
    activeThreadIdRef: coreState.activeThreadIdRef,
    dataSourceKey,
    dispatchRuntime: coreState.dispatchRuntime,
    loadDataSourceRef: coreState.loadDataSourceRef,
    readRestorableActiveThreadId: coreState.readRestorableActiveThreadId,
    recentCapabilityEventSequenceRef: coreState.recentCapabilityEventSequenceRef,
    resetThreadListFromCache: threadList.resetThreadListFromCache,
    setDataSource: coreState.setDataSource,
    setEndpoint: coreState.setEndpoint,
    setError: coreState.setError,
    setLoading: coreState.setLoading,
    setOptimisticUserItems: coreState.setOptimisticUserItems,
    setQueuedInputs: coreState.setQueuedInputs,
    setSending: coreState.setSending,
    setStoppingTurn: coreState.setStoppingTurn,
  })

  const conversationRegistry = useAgentChatConversationRegistry({
    dispatchRuntime: coreState.dispatchRuntime,
    provider,
    providerId,
    providerInstanceId,
    providerProtocol,
    readCurrentActiveThreadId: coreState.readCurrentActiveThreadId,
    focusScope: conversationFocusScope,
    setActiveThreadIdValue: runtimeController.setActiveThreadIdValue,
    threadScopeKey,
    userId,
  })

  const threadBootstrap = useAgentChatThreadBootstrap({
    clearUnavailableActiveThread: conversationRegistry.clearUnavailableActiveThread,
    clearUnavailableStoredThread: conversationRegistry.clearUnavailableStoredThread,
    closedThreadIds: conversationRegistry.closedThreadIds,
    dataSource: coreState.dataSource,
    dispatchRuntime: coreState.dispatchRuntime,
    fetchFirstThreadListPage: threadList.fetchFirstThreadListPage,
    markThreadOpen: conversationRegistry.markThreadOpen,
    readRestorableActiveThreadId: coreState.readRestorableActiveThreadId,
    registerThreadConversation: conversationRegistry.registerThreadConversation,
    runtimeRef: coreState.runtimeRef,
    setActiveThreadIdValue: runtimeController.setActiveThreadIdValue,
    setError: coreState.setError,
    setHistoryOpen: coreState.setHistoryOpen,
    setLoading: coreState.setLoading,
    upsertThreadReadResult: runtimeController.upsertThreadReadResult,
  })

  const createDraftConversation = useAgentChatDraftConversation({
    composerInputRef: coreState.composerInputRef,
    setActiveThreadIdValue: runtimeController.setActiveThreadIdValue,
    setDraftConversationId: coreState.setDraftConversationId,
    setError: coreState.setError,
    setHistoryOpen: coreState.setHistoryOpen,
    focusScope: conversationFocusScope,
    threadScopeKey,
    userId,
  })

  const requestThreadRead = useCallback((threadId: string) => {
    coreState.dispatchRuntime({ type: 'requestThreadRead', threadId })
  }, [coreState.dispatchRuntime])

  return {
    ...coreState,
    ...threadList,
    ...runtimeController,
    ...conversationRegistry,
    ...threadBootstrap,
    createDraftConversation,
    requestThreadRead,
    runtimeVisibleItems: runtimeController.visibleItems,
  }
}
