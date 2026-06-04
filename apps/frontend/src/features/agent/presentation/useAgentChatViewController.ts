import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { buildAgentChatInteractionControllerInput } from '@/features/agent/presentation/agentChatInteractionInputs'
import { buildAgentChatViewLayoutProps } from '@/features/agent/presentation/agentChatViewLayoutProps'
import { useAgentChatComposerState } from '@/features/agent/presentation/useAgentChatComposerState'
import { useAgentChatContextState } from '@/features/agent/presentation/useAgentChatContextState'
import { useAgentChatInteractionController } from '@/features/agent/presentation/useAgentChatInteractionController'
import { useAgentTimeline } from '@/features/agent/presentation/useAgentTimeline'
import { useAgentChatPresentationState } from '@/features/agent/presentation/useAgentChatPresentationState'
import { useAgentChatRuntimeState } from '@/features/agent/presentation/useAgentChatRuntimeState'
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
  onRestoreLocalThread: (threadId: string, sessionId?: string) => Promise<void>
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
  onRestoreLocalThread,
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
    localSessionId: store.localSessionId,
    localThreadId: store.localThreadId,
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
  const activeLocalRun = store.conversationRuntime?.run ?? null
  const runtime = useAgentChatRuntimeState({
    activeRunId: activeLocalRun?.id,
    conversationId: conv.id,
  })
  const composer = useAgentChatComposerState({
    userId,
    conversationId: conv.id,
    workspace: store.workspace,
    settings: store.settings,
    updateSettings: store.updateSettings,
    fileRef: runtime.fileRef,
    inputRef: runtime.inputRef,
  })

  const loading = store.conversationRuntime?.loading ?? false
  const buildingSendWorkspace = store.conversationRuntime?.building ?? false

  const context = useAgentChatContextState({
    agentContextConfig: store.agentContextConfig,
    composerAttachmentsCount: composer.composerAttachments.length,
    includeProjectContext: store.settings.includeProjectContext,
    currentProject: store.currentProject,
    localRuntimeEnabled: store.localRuntimeEnabled,
    localSessionId: store.localSessionId,
  })
  const presentation = useAgentChatPresentationState({
    activeRun: activeLocalRun,
    conversationId: conv.id,
    localRuntimeEnabled: store.localRuntimeEnabled,
    localAgentOnline: context.localAgentOnline,
    localSessionId: store.localSessionId,
    composerAttachments: composer.composerAttachments,
    input: composer.input,
    inputPlaceholder: t('agents.chat.inputPlaceholder'),
    loading,
    messages: effectiveConversation.transcriptMessages,
    pendingAssistantState: runtime.pendingAssistantState,
    pendingSendWorkspace: runtime.pendingSendWorkspace,
    runtimeApproving: store.conversationRuntime?.approving,
    runtimeBuilding: buildingSendWorkspace,
    runtimeStopping: store.conversationRuntime?.stopping,
    runtimeStopRequested: store.conversationRuntime?.stopRequested,
    streamingAssistantMessageId: runtime.streamingAssistantMessageId,
    streamingAssistantText: runtime.streamingAssistantText,
    submittedInteractionRuns: runtime.submittedInteractionRuns,
    timelineItems: timeline.timelineItems,
    uploading: composer.uploading,
    visibleActivityEvents: runtime.visibleActivityEvents,
  })
  const interaction = useAgentChatInteractionController(buildAgentChatInteractionControllerInput({
    activeLocalRun,
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
    runtime,
    store,
    userId,
  }))

  return buildAgentChatViewLayoutProps({
    activeLocalRun,
    composer,
    conv: effectiveConversation,
    conversations,
    archivedConversations,
    timelineItems: timeline.timelineItems,
    currentProject: store.currentProject,
    interaction,
    timelineLoading: timeline.initialLoading,
    planActionBusy: runtime.planActionBusy,
    planDispatchSettings: taskGraph.planDispatchSettings,
    presentation,
    runtime,
    onBack,
    onCloseConversation,
    onCloseConversations,
    onCollapse,
    onNewConversation,
    onRenameConversation,
    onReorderConversation,
    onRestoreArchivedConversation,
    onRestoreLocalThread,
    onSelectConversation,
    showCollapse,
    showConversationControls,
    updateWorkspace: composer.updateWorkspace,
    updateTaskGraphDispatchSettings: taskGraph.updateTaskGraphDispatchSettings,
  })
}
