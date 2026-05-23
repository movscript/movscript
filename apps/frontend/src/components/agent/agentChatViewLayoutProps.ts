import type { AgentChatViewLayoutProps } from '@/components/agent/AgentChatViewLayout'
import type { useAgentChatComposerState } from '@/components/agent/useAgentChatComposerState'
import type { useAgentChatInteractionController } from '@/components/agent/useAgentChatInteractionController'
import type { useAgentChatPresentationState } from '@/components/agent/useAgentChatPresentationState'
import type { useAgentChatRuntimeState } from '@/components/agent/useAgentChatRuntimeState'
import { buildPendingRuntimeInputQueueItems } from '@/lib/agentConversationThreadItems'
import type { PlanDispatchSettings } from '@/lib/agentPlanActions'
import { runtimeStatusLightFromActiveRun } from '@/lib/agentRuntimeStatusLight'
import type { AgentRun } from '@/lib/localAgentClient'
import type { Conversation } from '@/store/agentStore'
import type { Project } from '@/types'

interface BuildAgentChatViewLayoutPropsInput {
  activeLocalRun: AgentRun | null
  composer: ReturnType<typeof useAgentChatComposerState>
  conv: Conversation
  conversations: Conversation[]
  currentProject: Project | null
  interaction: ReturnType<typeof useAgentChatInteractionController>
  loading: boolean
  planActionBusy: boolean
  planDispatchSettings: PlanDispatchSettings
  presentation: ReturnType<typeof useAgentChatPresentationState>
  runtime: ReturnType<typeof useAgentChatRuntimeState>
  onBack: () => void
  onCloseConversation: (id: string) => void
  onCloseConversations: (ids: string[]) => void
  onCollapse: () => void
  onNewConversation: () => void
  onReorderConversation: (draggedId: string, targetId: string, position: 'before' | 'after') => void
  onSelectConversation: (id: string) => void
  showCollapse?: boolean
  showConversationControls?: boolean
  updateDraft: (patch: { input: string }) => void
  updateTaskGraphDispatchSettings: (settings: PlanDispatchSettings) => void
}

export function buildAgentChatViewLayoutProps({
  activeLocalRun,
  composer,
  conv,
  conversations,
  currentProject,
  interaction,
  loading,
  planActionBusy,
  planDispatchSettings,
  presentation,
  runtime,
  onBack,
  onCloseConversation,
  onCloseConversations,
  onCollapse,
  onNewConversation,
  onReorderConversation,
  onSelectConversation,
  showCollapse,
  showConversationControls,
  updateDraft,
  updateTaskGraphDispatchSettings,
}: BuildAgentChatViewLayoutPropsInput): AgentChatViewLayoutProps {
  return {
    debugPreview: {
      draft: runtime.pendingSendDraft,
      sending: loading,
      onCancel: () => runtime.setPendingSendDraft(null),
      onConfirm: interaction.confirmPendingSendDraft,
    },
    header: {
      activeConversation: conv,
      conversations,
      onBack,
      onCloseConversation,
      onCloseConversations,
      onCollapse,
      onNewConversation,
      onReorderConversation,
      onSelectConversation,
      activeConversationRuntimeStatusLight: runtimeStatusLightFromActiveRun(activeLocalRun, runtime.runtimeStatusLight),
      showCollapse,
      showConversationControls,
    },
    thread: {
      activePlanSnapshot: presentation.activePlanSnapshot,
      activeRun: activeLocalRun,
      approvingLocalRun: presentation.approvingLocalRun,
      bottomRef: presentation.bottomRef,
      conversationBlocks: presentation.conversationPresentation.blocks,
      generationProgressStates: presentation.generationProgressStates,
      messages: conv.messages,
      planActionBusy,
      planDispatchSettings,
      projectId: currentProject?.ID,
      showLocalWorkflow: presentation.showLocalWorkflow,
      thinkingState: presentation.thinkingState,
      threadRef: presentation.threadRef,
      workflowAnswerEchoes: presentation.workflowAnswerEchoes,
      workflowRunsByResultMessageId: presentation.workflowRunsByResultMessageId,
      workflowRunsWithoutResultMessage: presentation.workflowRunsWithoutResultMessage,
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
      buildingSendDraft: presentation.buildingSendDraft,
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
      loading,
      mentionResults: composer.mentionResults,
      mentionRangeActive: !!composer.mentionRange,
      pendingRuntimeInputQueue: buildPendingRuntimeInputQueueItems(conv.messages),
      stoppingLocalRun: presentation.stoppingLocalRun,
      uploading: composer.uploading,
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
      onDebugBeforeSendChange: runtime.setDebugBeforeSend,
      onInputChange: (value) => updateDraft({ input: value }),
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
