import type { ClipboardEvent, DragEvent, RefObject, UIEventHandler } from 'react'
import type {
  AgentChatCollaborationMode,
  AgentChatRuntimePendingServerRequest,
  AgentChatServerRequest,
  AgentChatServerRequestResponse,
  AgentChatThread,
  AgentThreadGoalState,
} from '@movscript/core/agent/chat'
import type { AgentRunProfilePresetId } from '@/features/agent/domain/agentRunProfilePreset'
import type { PublicModel } from '@/types'

export function buildAgentChatShellComposerPanel<TComposer, TQueuedInputs>(input: {
  composer: TComposer
  fileRef: RefObject<HTMLInputElement | null>
  inputRef: RefObject<HTMLDivElement | null>
  placeholder: string
  workspaceContextLocked: boolean
  hideWorkspaceProjectSelector: boolean
  hasChatContent: boolean
  pendingServerRequests: AgentChatRuntimePendingServerRequest[]
  canSend: boolean
  sendDisabledReason?: string
  canStopActiveRun: boolean
  loading: boolean
  modelOptions: PublicModel[]
  modelValue: string | null | undefined
  collaborationMode: AgentChatCollaborationMode
  goalModeEnabled: boolean
  goalState: AgentThreadGoalState | null
  profilePresetId: AgentRunProfilePresetId
  stoppingActiveRun: boolean
  queuedInputHandlers: {
    onCollapseChange: (collapsed: boolean) => void
    onDelete: (id: string) => void
    onEdit: (id: string) => void
    onEditCancel: (id: string) => void
    onSteerNow: (id: string) => void
    onTextChange: (id: string, text: string) => void
  }
  queuedInputSteerEnabled: boolean
  queuedInputs: TQueuedInputs
  queuedInputsCollapsed: boolean
  onDrop: (event: DragEvent) => void
  onPaste: (event: ClipboardEvent) => void
  onCollaborationModeChange?: (mode: AgentChatCollaborationMode) => void
  onGoalModeEnabledChange?: (enabled: boolean) => void
  onModelChange: (modelId: string | null) => void
  onProfilePresetChange: (profilePresetId: AgentRunProfilePresetId) => void
  onResolveServerRequest: (request: AgentChatServerRequest, response: AgentChatServerRequestResponse | undefined) => void
  onSend: (profilePresetId?: AgentRunProfilePresetId) => void
  onStopActiveRun: () => void
}) {
  return { ...input }
}

export function buildAgentChatShellHistoryPanel(input: {
  open: boolean
  dataSourceLabel: string
  emptyThreadListLabel: string
  endpoint?: string
  hasMoreThreadPages: boolean
  historyThreads: AgentChatThread[]
  loading: boolean
  loadingMore: boolean
  threadListLabel: string
  onLoadMoreThreads: () => Promise<void>
  onLoadThreads: () => Promise<void>
  onOpenThread: (threadId: string) => Promise<void>
  onToggle: () => void
}) {
  return { ...input }
}

export function buildAgentChatShellThreadSurface<TConversationTab, TRecentEvent, TStatusItem, TVisibleItem>(input: {
  activeThreadId: string | null
  conversationTabs: TConversationTab[]
  emptyThreadLabel?: string
  error: string | null
  hasChatContent: boolean
  recentCapabilityEvents: TRecentEvent[]
  scrollRef: { current: HTMLDivElement | null }
  statusItems: TStatusItem[]
  hiddenItemCount: number
  canLoadEarlierItems: boolean
  visibleItems: TVisibleItem[]
  onCloseConversation: (threadId: string) => void
  onNewConversation: () => void
  onOpenConversation: (threadId: string) => void
  onReorderConversation: (draggedId: string, targetId: string, position: 'before' | 'after') => void
  onScroll: UIEventHandler<HTMLDivElement>
  onShowOlderItems: () => void
}) {
  const { activeThreadId, ...surface } = input
  return {
    activeConversationId: activeThreadId ?? '__draft__',
    ...surface,
  }
}
