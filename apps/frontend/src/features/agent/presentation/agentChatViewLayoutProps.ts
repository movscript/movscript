import type { useAgentChatComposerState } from '@/features/agent/presentation/useAgentChatComposerState'
import type { useAgentChatInteractionController } from '@/features/agent/presentation/useAgentChatInteractionController'
import type { useAgentChatPresentationState } from '@/features/agent/presentation/useAgentChatPresentationState'
import type { useAgentChatProviderSessionState } from '@/features/agent/presentation/useAgentChatProviderSessionState'
import type { PlanDispatchSettings } from '@/features/agent/application/agentPlanActions'
import type { AgentRun, AgentTimelineItem } from '@/shared/infrastructure/providerSessionClient'
import type { Conversation } from '@/features/agent/state/agentStore'
import type { Project } from '@/types'
import { buildAgentChatThreadViewState } from '@/features/agent/presentation/agentChatThreadViewState'
import { conversationHasTranscriptMessages } from '@/features/agent/domain/agentConversationTranscript'

interface BuildAgentChatViewLayoutPropsInput {
  activeRun: AgentRun | null
  composer: ReturnType<typeof useAgentChatComposerState>
  conv: Conversation
  conversations: Conversation[]
  archivedConversations: Conversation[]
  timelineItems: AgentTimelineItem[]
  currentProject: Project | null
  interaction: ReturnType<typeof useAgentChatInteractionController>
  timelineLoading: boolean
  conversationEstablished: boolean
  planActionBusy: boolean
  planDispatchSettings: PlanDispatchSettings
  presentation: ReturnType<typeof useAgentChatPresentationState>
  providerSessionState: ReturnType<typeof useAgentChatProviderSessionState>
  onBack: () => void
  onCloseConversation: (id: string) => void
  onCloseConversations: (ids: string[]) => void
  onCollapse: () => void
  onNewConversation: () => void
  onRenameConversation: (id: string, title: string) => void
  onReorderConversation: (draggedId: string, targetId: string, position: 'before' | 'after') => void
  onRestoreArchivedConversation?: (id: string) => void
  onRestoreProviderThread: (threadId: string, sessionId?: string) => Promise<void>
  onSelectConversation: (id: string) => void
  showCollapse?: boolean
  showConversationControls?: boolean
  updateWorkspace: (patch: { input: string }) => void
  updateTaskGraphDispatchSettings: (settings: PlanDispatchSettings) => void
}

export function buildAgentChatViewLayoutProps({
  activeRun,
  composer,
  conv,
  conversations,
  archivedConversations,
  timelineItems,
  currentProject,
  interaction,
  timelineLoading,
  conversationEstablished,
  planActionBusy,
  planDispatchSettings,
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
  updateWorkspace,
  updateTaskGraphDispatchSettings,
}: BuildAgentChatViewLayoutPropsInput) {
  const threadViewState = buildAgentChatThreadViewState({
    activeRun: activeRun,
    conversationProjection: presentation.conversationProjection,
    hasTranscriptMessages: conversationHasTranscriptMessages(conv),
    timelineItems,
    timelineLoading,
  })

  return {
    debugPreview: {
      workspace: providerSessionState.pendingSendWorkspace,
      sending: presentation.loading,
      onCancel: () => providerSessionState.setPendingSendWorkspace(null),
      onConfirm: interaction.confirmPendingSendWorkspace,
    },
    contextDiagnosticDialog: {
      timelineItems,
    },
    header: {
      activeConversation: conv,
      conversations,
      onBack,
      onCloseConversation,
      onCloseConversations,
      onCollapse,
      onNewConversation,
      onRenameConversation,
      onReorderConversation,
      onSelectConversation,
      activeConversationProviderSessionStatusLight: providerSessionState.providerSessionStatusLight,
      showCollapse,
      showConversationControls,
    },
    providerSessionHistory: {
      archivedConversations,
      conversations,
      onRestoreArchivedConversation,
      onRestoreProviderThread,
    },
    thread: {
      activePlanSnapshot: presentation.activePlanSnapshot,
      approvingActiveRun: presentation.approvingActiveRun,
      bottomRef: presentation.bottomRef,
      conversationId: conv.id,
      conversationProjection: presentation.conversationProjection,
      conversationStarted: threadViewState.conversationStarted,
      currentPlan: threadViewState.currentPlan,
      generationProgressStates: presentation.generationProgressStates,
      showTimelineLoading: threadViewState.showTimelineLoading,
      planActionBusy,
      planDispatchSettings,
      projectId: currentProject?.ID,
      statusItems: threadViewState.statusItems,
      threadRef: presentation.threadRef,
      onAcceptPlanReview: interaction.acceptPlanTaskReview,
      onAnswerRunInput: interaction.answerRunInput,
      onApproveRun: interaction.approveRun,
      onCancelPlanTree: interaction.cancelActivePlanTree,
      onDispatchTaskGraph: interaction.dispatchActiveTaskGraph,
      onRejectRun: interaction.rejectRun,
      onRejectPlanReview: interaction.rejectPlanTaskReview,
      onRetaskGraph: interaction.replanActiveTaskGraph,
      onReworkPlanReview: interaction.reworkPlanTaskReview,
      onScroll: presentation.onThreadScroll,
      onUpdatePlanDispatchSettings: updateTaskGraphDispatchSettings,
    },
    composer: {
      answeringPendingInput: presentation.answeringPendingInput,
      activePendingInputTitle: presentation.activePendingInputRequest?.title,
      addMentionTrigger: composer.addMentionTrigger,
      buildingSendWorkspace: presentation.buildingSendWorkspace,
      canAnswerPendingInputWithText: presentation.canAnswerPendingInputWithText,
      canSend: presentation.canSend,
      canStopActiveRun: presentation.canStopActiveRun,
      composerAttachmentEntries: composer.composerAttachmentEntries,
      composerAttachmentsCount: composer.composerAttachments.length,
      composerInput: composer.input,
      composerPlaceholder: presentation.composerPlaceholder,
      debugBeforeSend: providerSessionState.debugBeforeSend,
      draggingFiles: composer.draggingFiles,
      fileRef: providerSessionState.fileRef,
      inputRef: providerSessionState.inputRef,
      loading: presentation.loading,
      mentionResults: composer.mentionResults,
      mentionRangeActive: !!composer.mentionRange,
      modelOptions: composer.textModels,
      modelValue: composer.modelId,
      collaborationMode: composer.collaborationMode,
      goalModeEnabled: composer.goalModeEnabled,
      pendingActiveRunInputQueue: presentation.pendingActiveRunInputQueue,
      stoppingActiveRun: presentation.stoppingActiveRun,
      uploading: composer.uploading,
      uploadedFileCount: composer.uploadedFileCount,
      uploadingFileNames: composer.uploadingFileNames,
      workspaceProjectOptions: composer.workspaceProjectOptions,
      workspaceProjectLocked: conversationEstablished,
      workspaceProjectValue: composer.workspaceProjectValue,
      workspaceProjectsLoading: composer.workspaceProjectsLoading,
      onAcceptMention: () => {
        if (composer.mentionRange && composer.mentionResults.length > 0) {
          composer.insertResourceMention(composer.mentionResults[0])
          return true
        }
        return false
      },
      onComposerDragEnter: composer.handleComposerDragEnter,
      onComposerDragLeave: composer.handleComposerDragLeave,
      onComposerDragOver: composer.handleComposerDragOver,
      onComposerDrop: composer.handleComposerDrop,
      onComposerPaste: composer.handleComposerPaste,
      onDebugBeforeSendChange: providerSessionState.setDebugBeforeSend,
      onInputChange: composer.updateInputDraft,
      onMentionEscape: () => composer.setMentionRange(null),
      onMentionSelect: composer.insertResourceMention,
      onMentionState: composer.updateMentionState,
      onModelChange: (modelId: number | null) => composer.updateSettings({ modelId }),
      onCollaborationModeChange: (collaborationMode: 'default' | 'plan') => composer.updateSettings({ collaborationMode }),
      onGoalModeEnabledChange: (goalModeEnabled: boolean) => composer.updateSettings({ goalModeEnabled }),
      onRemoveAttachment: composer.removeAttachment,
      onSend: interaction.send,
      onStopActiveRun: interaction.stopActiveRun,
      onUploadFiles: composer.uploadFiles,
      onWorkspaceProjectChange: composer.changeWorkspaceProject,
    },
  }
}
