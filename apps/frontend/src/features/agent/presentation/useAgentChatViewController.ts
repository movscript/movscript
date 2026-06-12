import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { buildAgentChatInteractionControllerInput } from '@/features/agent/presentation/agentChatInteractionInputs'
import { buildAgentChatViewLayoutProps } from '@/features/agent/presentation/agentChatViewLayoutProps'
import { useAgentChatComposerState } from '@/features/agent/presentation/useAgentChatComposerState'
import { useAgentChatContextState } from '@/features/agent/presentation/useAgentChatContextState'
import { useAgentChatInteractionController } from '@/features/agent/presentation/useAgentChatInteractionController'
import { useAgentTimeline } from '@/features/agent/presentation/useAgentTimeline'
import { useAgentChatPresentationState } from '@/features/agent/presentation/useAgentChatPresentationState'
import { useAgentChatProviderSessionState } from '@/features/agent/presentation/useAgentChatProviderSessionState'
import { useAgentChatStoreBindings } from '@/features/agent/presentation/useAgentChatStoreBindings'
import { useAgentPlanDispatchSettings } from '@/features/agent/presentation/useAgentPlanDispatchSettings'
import { conversationWithTimelineTranscript } from '@/features/agent/domain/agentConversationTranscript'
import type { Conversation } from '@/features/agent/state/agentStore'
import type { AgentPageTaskState } from '@/features/agent/state/agentSessionStore'

export interface AgentChatViewControllerInput {
  conv: Conversation
  conversations: Conversation[]
  archivedConversations?: Conversation[]
  userId: string
  onBack: () => void
  onCollapse: () => void
  onSelectConversation: (id: string) => void
  onNewConversation: () => void
  onRenameConversation: (id: string, title: string) => void
  onCloseConversation: (id: string) => void
  onCloseConversations: (ids: string[]) => void
  onReorderConversation: (draggedId: string, targetId: string, position: 'before' | 'after') => void
  onRestoreArchivedConversation?: (id: string) => void
  onRestoreProviderThread: (threadId: string, sessionId?: string) => Promise<void>
  externalTask?: AgentPageTaskState | null
  pageToolRequestId?: string
  onExternalWorkspaceConsumed?: () => void
  showCollapse?: boolean
  showConversationControls?: boolean
}

export function useAgentChatViewController({
  conv,
  conversations,
  archivedConversations = [],
  userId,
  onBack,
  onCollapse,
  onSelectConversation,
  onNewConversation,
  onRenameConversation,
  onCloseConversation,
  onCloseConversations,
  onReorderConversation,
  onRestoreArchivedConversation,
  onRestoreProviderThread,
  externalTask,
  pageToolRequestId,
  onExternalWorkspaceConsumed,
  showCollapse,
  showConversationControls,
}: AgentChatViewControllerInput) {
  const { t } = useTranslation()
  const store = useAgentChatStoreBindings({
    conversation: conv,
    userId,
  })
  const timeline = useAgentTimeline({
    providerSessionId: store.providerSessionId,
    providerThreadId: store.providerThreadId,
    requireThread: true,
  })
  const effectiveConversation = useMemo(
    () => conversationWithTimelineTranscript(conv, timeline.transcriptMessages),
    [conv, timeline.transcriptMessages],
  )
  const taskGraph = useAgentPlanDispatchSettings({
    settings: store.settings,
    updateSettings: store.updateSettings,
  })
  const activeRun = store.conversationRuntimeState?.run ?? null
  const providerSessionState = useAgentChatProviderSessionState({
    activeRunId: activeRun?.id,
    conversationId: conv.id,
  })
  const conversationEstablished = Boolean(store.providerThreadId || effectiveConversation.transcriptMessages.length > 0)
  const composer = useAgentChatComposerState({
    userId,
    conversationId: conv.id,
    workspace: store.workspace,
    settings: store.settings,
    updateSettings: store.updateSettings,
    fileRef: providerSessionState.fileRef,
    inputRef: providerSessionState.inputRef,
    workspaceContextLocked: conversationEstablished,
  })

  const loading = store.conversationRuntimeState?.loading ?? false
  const buildingSendWorkspace = store.conversationRuntimeState?.building ?? false

  const context = useAgentChatContextState({
    agentContextConfig: store.agentContextConfig,
    composerAttachmentsCount: composer.composerAttachments.length,
    includeProjectContext: store.settings.includeProjectContext,
    currentProject: store.currentProject,
    providerSessionEnabled: store.providerSessionEnabled,
    providerSessionId: store.providerSessionId,
  })
  const presentation = useAgentChatPresentationState({
    activeRun: activeRun,
    conversationId: conv.id,
    providerSessionEnabled: store.providerSessionEnabled,
    providerSessionOnline: context.providerSessionOnline,
    providerSessionId: store.providerSessionId,
    composerAttachments: composer.composerAttachments,
    input: composer.input,
    inputPlaceholder: t('agents.chat.inputPlaceholder'),
    loading,
    messages: effectiveConversation.transcriptMessages,
    pendingAssistantState: providerSessionState.pendingAssistantState,
    pendingSendWorkspace: providerSessionState.pendingSendWorkspace,
    providerSessionApproving: store.conversationRuntimeState?.approving,
    providerSessionBuilding: buildingSendWorkspace,
    providerSessionStopping: store.conversationRuntimeState?.stopping,
    providerSessionStopRequested: store.conversationRuntimeState?.stopRequested,
    streamingAssistantMessageId: providerSessionState.streamingAssistantMessageId,
    streamingAssistantText: providerSessionState.streamingAssistantText,
    submittedInteractionRuns: providerSessionState.submittedInteractionRuns,
    timelineItems: timeline.timelineItems,
    uploading: composer.uploading,
    visibleActivityEvents: providerSessionState.visibleActivityEvents,
  })
  const interaction = useAgentChatInteractionController(buildAgentChatInteractionControllerInput({
    activeRun,
    buildingSendWorkspace,
    composer,
    context,
    conv: effectiveConversation,
    externalTask,
    loading,
    onExternalWorkspaceConsumed,
    pageToolRequestId,
    taskGraph,
    presentation,
    providerSessionState,
    store,
    userId,
  }))

  return buildAgentChatViewLayoutProps({
    activeRun,
    composer,
    conv: effectiveConversation,
    conversations,
    archivedConversations,
    timelineItems: timeline.timelineItems,
    currentProject: store.currentProject,
    interaction,
    timelineLoading: timeline.initialLoading,
    conversationEstablished,
    planActionBusy: providerSessionState.planActionBusy,
    planDispatchSettings: taskGraph.planDispatchSettings,
    presentation,
    providerSessionState,
    onBack,
    onCloseConversation,
    onCloseConversations,
    onCollapse,
    onNewConversation,
    onRenameConversation,
    onReorderConversation,
    onRestoreArchivedConversation,
    onRestoreProviderThread,
    onSelectConversation,
    showCollapse,
    showConversationControls,
    updateWorkspace: composer.updateWorkspace,
    updateTaskGraphDispatchSettings: taskGraph.updateTaskGraphDispatchSettings,
  })
}
