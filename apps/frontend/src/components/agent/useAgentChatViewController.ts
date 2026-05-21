import { useTranslation } from 'react-i18next'
import type { AgentChatViewLayoutProps } from '@/components/agent/AgentChatViewLayout'
import { buildAgentChatInteractionControllerInput } from '@/components/agent/agentChatInteractionInputs'
import { buildAgentChatViewLayoutProps } from '@/components/agent/agentChatViewLayoutProps'
import { useAgentChatComposerState } from '@/components/agent/useAgentChatComposerState'
import { useAgentChatContextState } from '@/components/agent/useAgentChatContextState'
import { useAgentChatInteractionController } from '@/components/agent/useAgentChatInteractionController'
import { useAgentChatPresentationState } from '@/components/agent/useAgentChatPresentationState'
import { useAgentChatRuntimeState } from '@/components/agent/useAgentChatRuntimeState'
import { useAgentChatStoreBindings } from '@/components/agent/useAgentChatStoreBindings'
import { useAgentPlanDispatchSettings } from '@/components/agent/useAgentPlanDispatchSettings'
import type { Conversation } from '@/store/agentStore'
import type { AgentPageTaskState } from '@/store/agentSessionStore'

export interface AgentChatViewControllerInput {
  conv: Conversation
  conversations: Conversation[]
  userId: string
  onBack: () => void
  onCollapse: () => void
  onSelectConversation: (id: string) => void
  onNewConversation: () => void
  onCloseConversation: (id: string) => void
  onCloseConversations: (ids: string[]) => void
  externalTask?: AgentPageTaskState | null
  pageToolRequestId?: string
  onExternalDraftConsumed?: () => void
  showCollapse?: boolean
  showConversationControls?: boolean
}

export function useAgentChatViewController({
  conv,
  conversations,
  userId,
  onBack,
  onCollapse,
  onSelectConversation,
  onNewConversation,
  onCloseConversation,
  onCloseConversations,
  externalTask,
  pageToolRequestId,
  onExternalDraftConsumed,
  showCollapse,
  showConversationControls,
}: AgentChatViewControllerInput): AgentChatViewLayoutProps {
  const { t } = useTranslation()
  const store = useAgentChatStoreBindings({
    conversation: conv,
    userId,
  })
  const runtime = useAgentChatRuntimeState({
    conversationId: conv.id,
  })
  const plan = useAgentPlanDispatchSettings({
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
    messages: conv.messages,
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
    conv,
    externalTask,
    loading,
    onExternalDraftConsumed,
    pageToolRequestId,
    plan,
    presentation,
    runtime,
    store,
    userId,
  }))

  return buildAgentChatViewLayoutProps({
    activeLocalRun,
    composer,
    conv,
    conversations,
    currentProject: store.currentProject,
    interaction,
    loading,
    planActionBusy: runtime.planActionBusy,
    planDispatchSettings: plan.planDispatchSettings,
    presentation,
    runtime,
    onBack,
    onCloseConversation,
    onCloseConversations,
    onCollapse,
    onNewConversation,
    onSelectConversation,
    showCollapse,
    showConversationControls,
    updateDraft: composer.updateDraft,
    updatePlanDispatchSettings: plan.updatePlanDispatchSettings,
  })
}
