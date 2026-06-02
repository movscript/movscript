import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { buildAgentChatInteractionControllerInput } from '@/features/agent/presentation/agentChatInteractionInputs'
import { buildAgentChatViewLayoutProps } from '@/features/agent/presentation/agentChatViewLayoutProps'
import { useAgentChatComposerState } from '@/features/agent/presentation/useAgentChatComposerState'
import { useAgentChatContextState } from '@/features/agent/presentation/useAgentChatContextState'
import { useAgentChatInteractionController } from '@/features/agent/presentation/useAgentChatInteractionController'
import { useAgentChatPresentationState } from '@/features/agent/presentation/useAgentChatPresentationState'
import { useAgentChatRuntimeState } from '@/features/agent/presentation/useAgentChatRuntimeState'
import { useAgentChatStoreBindings } from '@/features/agent/presentation/useAgentChatStoreBindings'
import { useAgentPlanDispatchSettings } from '@/features/agent/presentation/useAgentPlanDispatchSettings'
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
  onCloseConversation: (id: string) => void
  onCloseConversations: (ids: string[]) => void
  onReorderConversation: (draggedId: string, targetId: string, position: 'before' | 'after') => void
  onRestoreArchivedConversation?: (id: string) => void
  onRestoreLocalThread: (threadId: string) => Promise<void>
  externalTask?: AgentPageTaskState | null
  pageToolRequestId?: string
  onExternalDraftConsumed?: () => void
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
  onCloseConversation,
  onCloseConversations,
  onReorderConversation,
  onRestoreArchivedConversation,
  onRestoreLocalThread,
  externalTask,
  pageToolRequestId,
  onExternalDraftConsumed,
  showCollapse,
  showConversationControls,
}: AgentChatViewControllerInput) {
  const { t } = useTranslation()
  const store = useAgentChatStoreBindings({
    conversation: conv,
    userId,
  })
  const effectiveConversation = useMemo(() => {
    if (!store.runtimeThreadProjectionMessages) return conv
    return { ...conv, messages: store.runtimeThreadProjectionMessages }
  }, [conv, store.runtimeThreadProjectionMessages])
  const runtime = useAgentChatRuntimeState({
    conversationId: conv.id,
  })
  const taskGraph = useAgentPlanDispatchSettings({
    settings: store.settings,
    updateSettings: store.updateSettings,
  })
  const composer = useAgentChatComposerState({
    userId,
    conversationId: conv.id,
    draft: store.draft,
    settings: store.settings,
    updateSettings: store.updateSettings,
    fileRef: runtime.fileRef,
    inputRef: runtime.inputRef,
  })

  const activeLocalRun = store.conversationRuntime?.run ?? null
  const loading = store.conversationRuntime?.loading ?? false
  const buildingSendDraft = store.conversationRuntime?.building ?? false

  const context = useAgentChatContextState({
    agentContextConfig: store.agentContextConfig,
    composerAttachmentsCount: composer.composerAttachments.length,
    includeProjectContext: store.settings.includeProjectContext,
    currentProject: store.currentProject,
    localRuntimeEnabled: store.localRuntimeEnabled,
  })
  const presentation = useAgentChatPresentationState({
    activeRun: activeLocalRun,
    conversationId: conv.id,
    localRuntimeEnabled: store.localRuntimeEnabled,
    localAgentOnline: context.localAgentOnline,
    composerAttachments: composer.composerAttachments,
    input: composer.input,
    inputPlaceholder: t('agents.chat.inputPlaceholder'),
    loading,
    messages: effectiveConversation.messages,
    pendingAssistantState: runtime.pendingAssistantState,
    pendingSendDraft: runtime.pendingSendDraft,
    runtimeApproving: store.conversationRuntime?.approving,
    runtimeBuilding: buildingSendDraft,
    runtimeStopping: store.conversationRuntime?.stopping,
    runtimeStopRequested: store.conversationRuntime?.stopRequested,
    streamingAssistantMessageId: runtime.streamingAssistantMessageId,
    streamingAssistantText: runtime.streamingAssistantText,
    submittedInteractionRuns: runtime.submittedInteractionRuns,
    uploading: composer.uploading,
    visibleActivityEvents: runtime.visibleActivityEvents,
  })
  const interaction = useAgentChatInteractionController(buildAgentChatInteractionControllerInput({
    activeLocalRun,
    buildingSendDraft,
    composer,
    context,
    conv: effectiveConversation,
    externalTask,
    loading,
    onExternalDraftConsumed,
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
    currentProject: store.currentProject,
    interaction,
    planActionBusy: runtime.planActionBusy,
    planDispatchSettings: taskGraph.planDispatchSettings,
    presentation,
    runtime,
    onBack,
    onCloseConversation,
    onCloseConversations,
    onCollapse,
    onNewConversation,
    onReorderConversation,
    onRestoreArchivedConversation,
    onRestoreLocalThread,
    onSelectConversation,
    showCollapse,
    showConversationControls,
    updateDraft: composer.updateDraft,
    updateTaskGraphDispatchSettings: taskGraph.updateTaskGraphDispatchSettings,
  })
}
