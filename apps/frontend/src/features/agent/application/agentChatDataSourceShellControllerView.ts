import type { AgentChatDataSourceShellProps } from '@/features/agent/application/agentChatDataSourceShellTypes'
import { buildAgentChatDataSourceShellView } from '@/features/agent/application/agentChatDataSourceShellView'
import type { useAgentChatDataSourceShellRuntimeSetup } from '@/features/agent/application/useAgentChatDataSourceShellRuntimeSetup'
import type { useAgentChatRunProfileSettings } from '@/features/agent/application/useAgentChatRunProfileSettings'
import type { useAgentChatServerRequests } from '@/features/agent/application/useAgentChatServerRequests'
import type { useAgentChatThreadTabs } from '@/features/agent/application/useAgentChatThreadTabs'
import type { useAgentChatThreadViewport } from '@/features/agent/application/useAgentChatThreadViewport'
import type { useAgentChatTurnControls } from '@/features/agent/application/useAgentChatTurnControls'
import type { useAgentChatShellPresentationState } from '@/features/agent/presentation/useAgentChatShellPresentationState'
import type { AgentChatCollaborationMode } from '@movscript/core/agent/chat'
import type { PublicModel } from '@/types'

type ControllerViewProps = Pick<
  AgentChatDataSourceShellProps,
  | 'emptyThreadLabel'
  | 'emptyThreadListLabel'
  | 'modelUnavailableMessage'
  | 'onCollaborationModeChange'
  | 'onGoalModeEnabledChange'
  | 'threadListLabel'
  | 'unavailableLabel'
> & {
  collaborationMode: AgentChatCollaborationMode
  composerPlaceholder: string
  goalModeEnabled: boolean
  hideComposerWorkspaceProjectSelector: boolean
  modelOptions: PublicModel[]
  surface: 'panel' | 'page'
}

export interface AgentChatDataSourceShellControllerViewInput {
  props: ControllerViewProps
  setup: ReturnType<typeof useAgentChatDataSourceShellRuntimeSetup>
  serverRequests: Pick<ReturnType<typeof useAgentChatServerRequests>, 'resolveServerRequest'>
  viewport: ReturnType<typeof useAgentChatThreadViewport>
  presentation: ReturnType<typeof useAgentChatShellPresentationState>
  runProfiles: ReturnType<typeof useAgentChatRunProfileSettings>
  turnControls: ReturnType<typeof useAgentChatTurnControls>
  tabs: ReturnType<typeof useAgentChatThreadTabs>
}

export function buildAgentChatDataSourceShellControllerView(input: AgentChatDataSourceShellControllerViewInput) {
  const { props, setup, serverRequests, viewport, presentation, runProfiles, turnControls, tabs } = input
  return buildAgentChatDataSourceShellView({
    activeThread: setup.activeThread,
    activeThreadId: setup.activeThreadId,
    activeThreadModelValue: presentation.activeThreadModelValue,
    activeTurn: setup.activeTurn,
    canLoadEarlierItems: viewport.canShowOlderThreadItems,
    canSend: turnControls.canSend,
    canStopActiveTurn: turnControls.canStopActiveTurn,
    collaborationMode: props.collaborationMode,
    composer: setup.composer,
    composerFileRef: setup.composerFileRef,
    composerInputRef: setup.composerInputRef,
    composerPlaceholder: props.composerPlaceholder,
    composerWorkspaceContextLocked: setup.composerWorkspaceContextLocked,
    createDraftConversation: setup.createDraftConversation,
    dataSource: setup.dataSource,
    deleteQueuedInput: turnControls.deleteQueuedInput,
    editQueuedInput: turnControls.editQueuedInput,
    cancelQueuedInputEdit: turnControls.cancelQueuedInputEdit,
    emptyThreadLabel: props.emptyThreadLabel,
    emptyThreadListLabel: props.emptyThreadListLabel,
    endpoint: setup.endpoint,
    error: setup.error,
    goalModeEnabled: props.goalModeEnabled,
    handleModelChange: presentation.handleModelChange,
    handleProfilePresetChange: runProfiles.handleProfilePresetChange,
    handleThreadScroll: viewport.handleThreadScroll,
    hasChatContent: presentation.hasChatContent,
    hideComposerWorkspaceProjectSelector: props.hideComposerWorkspaceProjectSelector,
    historyOpen: setup.historyOpen,
    historyThreads: tabs.closedHistoryThreads,
    loadMoreThreads: setup.loadMoreThreads,
    loading: setup.loading,
    modelOptions: props.modelOptions,
    modelUnavailableMessage: props.modelUnavailableMessage,
    onCollaborationModeChange: props.onCollaborationModeChange,
    onGoalModeEnabledChange: props.onGoalModeEnabledChange,
    openThread: setup.openThread,
    profilePresetId: setup.profilePresetId,
    queuedInputs: setup.queuedInputs,
    queuedInputsCollapsed: setup.queuedInputsCollapsed,
    recentCapabilityEvents: setup.recentCapabilityEvents,
    refreshThreadList: setup.refreshThreadList,
    reorderThreadTab: tabs.reorderThreadTab,
    resetDraftModeSettings: setup.resetDraftModeSettings,
    resolveServerRequest: serverRequests.resolveServerRequest,
    resolvedEmptyThreadLabel: setup.resolvedEmptyThreadLabel,
    resolvedHost: presentation.resolvedHost,
    scrollRef: viewport.scrollRef,
    sendMessage: turnControls.sendMessage,
    sending: setup.sending,
    setHistoryOpen: setup.setHistoryOpen,
    setQueuedInputsCollapsed: setup.setQueuedInputsCollapsed,
    shellClassName: presentation.shellClassName,
    showOlderThreadItems: viewport.showOlderThreadItems,
    steerQueuedInputNow: turnControls.steerQueuedInputNow,
    stopActiveTurn: turnControls.stopActiveTurn,
    stoppingTurn: setup.stoppingTurn,
    surface: props.surface,
    threadListLabel: props.threadListLabel,
    threadListLoadingMore: setup.threadListLoadingMore,
    threadListNextCursor: setup.threadListNextCursor,
    threadTabs: tabs.threadTabs,
    unavailableLabel: props.unavailableLabel,
    updateQueuedInputText: turnControls.updateQueuedInputText,
    visibleItems: viewport.visibleItems,
    visibleItemWindow: viewport.visibleItemWindow,
    visiblePendingServerRequests: setup.visiblePendingServerRequests,
    visibleStatusItems: setup.visibleStatusItems,
    closeThreadTab: tabs.closeThreadTab,
  })
}
