import type { ClipboardEvent, DragEvent, RefObject, UIEventHandler } from 'react'
import type {
  AgentChatCollaborationMode,
  AgentChatDataSource,
  AgentChatRuntimePendingServerRequest,
  AgentChatServerRequest,
  AgentChatServerRequestResponse,
  AgentChatThread,
  AgentThreadGoalState,
} from '@movscript/core/agent/chat'

import type { AgentRunProfilePresetId } from '@/features/agent/domain/agentRunProfilePreset'
import type { PublicModel } from '@/types'

import {
  buildAgentChatShellComposerPanel,
  buildAgentChatShellHistoryPanel,
  buildAgentChatShellThreadSurface,
} from './agentChatShellViewModels'

type ComposerWithFileHandlers = {
  handleComposerDrop: (event: DragEvent) => unknown
  handleComposerPaste: (event: ClipboardEvent) => unknown
}

export type AgentChatDataSourceShellViewInput<
  TComposer extends ComposerWithFileHandlers,
  TQueuedInputs,
  TConversationTab,
  TRecentEvent,
  TStatusItem,
  TVisibleItem,
> = {
  activeThread: AgentChatThread | null | undefined
  activeThreadId: string | null
  activeThreadModelValue: string | null | undefined
  activeTurn: unknown
  canLoadEarlierItems: boolean
  canSend: boolean
  canStopActiveTurn: boolean
  collaborationMode: AgentChatCollaborationMode
  composer: TComposer
  composerFileRef: RefObject<HTMLInputElement | null>
  composerInputRef: RefObject<HTMLDivElement | null>
  composerPlaceholder: string
  composerWorkspaceContextLocked: boolean
  createDraftConversation: () => void
  dataSource: AgentChatDataSource | undefined
  deleteQueuedInput: (id: string) => void
  editQueuedInput: (id: string) => void
  cancelQueuedInputEdit: (id: string) => void
  emptyThreadLabel?: string
  emptyThreadListLabel: string
  endpoint?: string
  error: string | null
  goalModeEnabled: boolean
  handleModelChange: (modelId: string | null) => void
  handleProfilePresetChange: (profilePresetId: AgentRunProfilePresetId) => void
  handleThreadScroll: UIEventHandler<HTMLDivElement>
  hasChatContent: boolean
  hideComposerWorkspaceProjectSelector: boolean
  historyOpen: boolean
  historyThreads: AgentChatThread[]
  loadMoreThreads: () => Promise<void>
  loading: boolean
  modelOptions: PublicModel[]
  modelUnavailableMessage?: string
  onCollaborationModeChange?: (mode: AgentChatCollaborationMode) => void
  onGoalModeEnabledChange?: (enabled: boolean) => void
  openThread: (threadId: string) => Promise<void>
  profilePresetId: AgentRunProfilePresetId
  queuedInputs: TQueuedInputs
  queuedInputsCollapsed: boolean
  recentCapabilityEvents: TRecentEvent[]
  refreshThreadList: () => Promise<void>
  reorderThreadTab: (draggedId: string, targetId: string, position: 'before' | 'after') => void
  resetDraftModeSettings: () => void
  resolveServerRequest: (request: AgentChatServerRequest, response: AgentChatServerRequestResponse | undefined) => void
  resolvedEmptyThreadLabel?: string
  resolvedHost: 'dock-panel' | 'floating-panel' | 'immersive'
  scrollRef: { current: HTMLDivElement | null }
  sendMessage: (nextProfilePresetId?: AgentRunProfilePresetId) => unknown
  sending: boolean
  setHistoryOpen: (updater: (open: boolean) => boolean) => void
  setQueuedInputsCollapsed: (collapsed: boolean) => void
  shellClassName: string
  showOlderThreadItems: () => void
  steerQueuedInputNow: (id: string) => unknown
  stopActiveTurn: () => unknown
  stoppingTurn: boolean
  surface: 'panel' | 'page'
  threadListLabel: string
  threadListLoadingMore: boolean
  threadListNextCursor?: string | null
  threadTabs: TConversationTab[]
  unavailableLabel: string
  updateQueuedInputText: (id: string, text: string) => void
  visibleItems: TVisibleItem[]
  visibleItemWindow: { hiddenCount: number }
  visiblePendingServerRequests: AgentChatRuntimePendingServerRequest[]
  visibleStatusItems: TStatusItem[]
  closeThreadTab: (threadId: string) => Promise<void>
}

export function buildAgentChatDataSourceShellView<
  TComposer extends ComposerWithFileHandlers,
  TQueuedInputs,
  TConversationTab,
  TRecentEvent,
  TStatusItem,
  TVisibleItem,
>(input: AgentChatDataSourceShellViewInput<
  TComposer,
  TQueuedInputs,
  TConversationTab,
  TRecentEvent,
  TStatusItem,
  TVisibleItem
>) {
  const threadError = input.modelUnavailableMessage ?? input.error
  return {
    composerPanel: buildAgentChatShellComposerPanel({
      composer: input.composer,
      fileRef: input.composerFileRef,
      inputRef: input.composerInputRef,
      placeholder: input.composerPlaceholder,
      workspaceContextLocked: input.composerWorkspaceContextLocked,
      hideWorkspaceProjectSelector: input.hideComposerWorkspaceProjectSelector,
      hasChatContent: input.hasChatContent,
      pendingServerRequests: input.visiblePendingServerRequests,
      canSend: input.canSend,
      sendDisabledReason: input.modelUnavailableMessage,
      canStopActiveRun: input.canStopActiveTurn,
      loading: input.sending,
      modelOptions: input.modelOptions,
      modelValue: input.activeThreadModelValue,
      collaborationMode: input.collaborationMode,
      goalModeEnabled: input.goalModeEnabled,
      goalState: input.activeThread?.goal ?? null,
      profilePresetId: input.profilePresetId,
      stoppingActiveRun: input.stoppingTurn,
      queuedInputHandlers: {
        onCollapseChange: input.setQueuedInputsCollapsed,
        onDelete: input.deleteQueuedInput,
        onEdit: input.editQueuedInput,
        onEditCancel: input.cancelQueuedInputEdit,
        onSteerNow: (id: string) => void input.steerQueuedInputNow(id),
        onTextChange: input.updateQueuedInputText,
      },
      queuedInputSteerEnabled: Boolean(input.activeTurn && input.dataSource?.steerTurn),
      queuedInputs: input.queuedInputs,
      queuedInputsCollapsed: input.queuedInputsCollapsed,
      onDrop: (event: DragEvent) => void input.composer.handleComposerDrop(event),
      onPaste: (event: ClipboardEvent) => void input.composer.handleComposerPaste(event),
      onCollaborationModeChange: input.onCollaborationModeChange,
      onGoalModeEnabledChange: input.onGoalModeEnabledChange,
      onModelChange: input.handleModelChange,
      onProfilePresetChange: input.handleProfilePresetChange,
      onResolveServerRequest: input.resolveServerRequest,
      onSend: (nextProfilePresetId?: AgentRunProfilePresetId) => void input.sendMessage(nextProfilePresetId),
      onStopActiveRun: () => void input.stopActiveTurn(),
    }),
    dataSource: input.dataSource,
    error: input.error,
    historyPanel: buildAgentChatShellHistoryPanel({
      open: input.historyOpen,
      dataSourceLabel: input.dataSource?.label ?? '',
      emptyThreadListLabel: input.emptyThreadListLabel,
      endpoint: input.endpoint,
      hasMoreThreadPages: Boolean(input.threadListNextCursor),
      historyThreads: input.historyThreads,
      loading: input.loading,
      loadingMore: input.threadListLoadingMore,
      threadListLabel: input.threadListLabel,
      onLoadMoreThreads: input.loadMoreThreads,
      onLoadThreads: input.refreshThreadList,
      onOpenThread: input.openThread,
      onToggle: () => input.setHistoryOpen((open) => !open),
    }),
    resolvedHost: input.resolvedHost,
    shellClassName: input.shellClassName,
    surface: input.surface,
    threadSurface: buildAgentChatShellThreadSurface({
      activeThreadId: input.activeThreadId,
      conversationTabs: input.threadTabs,
      emptyThreadLabel: input.resolvedEmptyThreadLabel,
      error: threadError,
      hasChatContent: input.hasChatContent,
      recentCapabilityEvents: input.recentCapabilityEvents,
      scrollRef: input.scrollRef,
      statusItems: input.visibleStatusItems,
      hiddenItemCount: input.visibleItemWindow.hiddenCount,
      canLoadEarlierItems: input.canLoadEarlierItems,
      visibleItems: input.visibleItems,
      onCloseConversation: (threadId: string) => {
        void input.closeThreadTab(threadId)
      },
      onNewConversation: () => {
        input.resetDraftModeSettings()
        input.createDraftConversation()
      },
      onOpenConversation: (threadId: string) => {
        void input.openThread(threadId)
      },
      onReorderConversation: input.reorderThreadTab,
      onScroll: input.handleThreadScroll,
      onShowOlderItems: input.showOlderThreadItems,
    }),
    unavailableLabel: input.unavailableLabel,
  }
}
