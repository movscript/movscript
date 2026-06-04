import type { useAgentChatComposerState } from '@/features/agent/presentation/useAgentChatComposerState'
import type { useAgentChatInteractionController } from '@/features/agent/presentation/useAgentChatInteractionController'
import type { useAgentChatPresentationState } from '@/features/agent/presentation/useAgentChatPresentationState'
import type { useAgentChatRuntimeState } from '@/features/agent/presentation/useAgentChatRuntimeState'
import type { PlanDispatchSettings } from '@/features/agent/application/agentPlanActions'
import type { AgentRun, AgentTimelineItem } from '@/shared/infrastructure/localAgentClient'
import type { Conversation } from '@/features/agent/state/agentStore'
import type { Project } from '@/types'
import { buildAgentChatThreadViewState } from '@/features/agent/presentation/agentChatThreadViewState'
import { conversationHasTranscriptMessages } from '@/features/agent/domain/agentConversationTranscript'

interface BuildAgentChatViewLayoutPropsInput {
  activeLocalRun: AgentRun | null
  composer: ReturnType<typeof useAgentChatComposerState>
  conv: Conversation
  conversations: Conversation[]
  archivedConversations: Conversation[]
  timelineItems: AgentTimelineItem[]
  currentProject: Project | null
  interaction: ReturnType<typeof useAgentChatInteractionController>
  timelineLoading: boolean
  planActionBusy: boolean
  planDispatchSettings: PlanDispatchSettings
  presentation: ReturnType<typeof useAgentChatPresentationState>
  runtime: ReturnType<typeof useAgentChatRuntimeState>
  onBack: () => void
  onCloseConversation: (id: string) => void
  onCloseConversations: (ids: string[]) => void
  onCollapse: () => void
  onNewConversation: () => void
  onRenameConversation: (id: string, title: string) => void
  onReorderConversation: (draggedId: string, targetId: string, position: 'before' | 'after') => void
  onRestoreArchivedConversation?: (id: string) => void
  onRestoreLocalThread: (threadId: string, sessionId?: string) => Promise<void>
  onSelectConversation: (id: string) => void
  showCollapse?: boolean
  showConversationControls?: boolean
  updateWorkspace: (patch: { input: string }) => void
  updateTaskGraphDispatchSettings: (settings: PlanDispatchSettings) => void
}

export function buildAgentChatViewLayoutProps({
  activeLocalRun,
  composer,
  conv,
  conversations,
  archivedConversations,
  timelineItems,
  currentProject,
  interaction,
  timelineLoading,
  planActionBusy,
  planDispatchSettings,
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
  updateWorkspace,
  updateTaskGraphDispatchSettings,
}: BuildAgentChatViewLayoutPropsInput) {
  const threadViewState = buildAgentChatThreadViewState({
    activeRun: activeLocalRun,
    conversationProjection: presentation.conversationProjection,
    hasTranscriptMessages: conversationHasTranscriptMessages(conv),
    timelineItems,
    timelineLoading,
  })

  return {
    debugPreview: {
      workspace: runtime.pendingSendWorkspace,
      sending: presentation.loading,
      onCancel: () => runtime.setPendingSendWorkspace(null),
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
      activeConversationRuntimeStatusLight: runtime.runtimeStatusLight,
      showCollapse,
      showConversationControls,
    },
    runtimeHistory: {
      archivedConversations,
      conversations,
      onRestoreArchivedConversation,
      onRestoreLocalThread,
    },
    thread: {
      activePlanSnapshot: presentation.activePlanSnapshot,
      approvingLocalRun: presentation.approvingLocalRun,
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
      threadRef: presentation.threadRef,
      onAcceptPlanReview: interaction.acceptPlanTaskReview,
      onAnswerLocalRunInput: interaction.answerLocalRunInput,
      onApproveLocalRun: interaction.approveLocalRun,
      onCancelPlanTree: interaction.cancelActivePlanTree,
      onDispatchTaskGraph: interaction.dispatchActiveTaskGraph,
      onRejectLocalRun: interaction.rejectLocalRun,
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
      canStopLocalRun: presentation.canStopLocalRun,
      composerAttachmentEntries: composer.composerAttachmentEntries,
      composerAttachmentsCount: composer.composerAttachments.length,
      composerPlaceholder: presentation.composerPlaceholder,
      debugBeforeSend: runtime.debugBeforeSend,
      draggingFiles: composer.draggingFiles,
      fileRef: runtime.fileRef,
      inputRef: runtime.inputRef,
      loading: presentation.loading,
      mentionResults: composer.mentionResults,
      mentionRangeActive: !!composer.mentionRange,
      pendingRuntimeInputQueue: presentation.pendingRuntimeInputQueue,
      stoppingLocalRun: presentation.stoppingLocalRun,
      uploading: composer.uploading,
      uploadedFileCount: composer.uploadedFileCount,
      uploadingFileNames: composer.uploadingFileNames,
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
      onDebugBeforeSendChange: runtime.setDebugBeforeSend,
      onInputChange: (value: string) => updateWorkspace({ input: value }),
      onMentionEscape: () => composer.setMentionRange(null),
      onMentionSelect: composer.insertResourceMention,
      onMentionState: composer.updateMentionState,
      onRemoveAttachment: composer.removeAttachment,
      onSend: interaction.send,
      onStopLocalRun: interaction.stopActiveLocalRun,
      onUploadFiles: composer.uploadFiles,
    },
  }
}
