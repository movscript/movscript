import type { AgentChatViewLayoutProps } from '@/components/agent/AgentChatViewLayout'
import type { useAgentChatComposerState } from '@/components/agent/useAgentChatComposerState'
import type { useAgentChatInteractionController } from '@/components/agent/useAgentChatInteractionController'
import type { useAgentChatPresentationState } from '@/components/agent/useAgentChatPresentationState'
import type { useAgentChatRuntimeState } from '@/components/agent/useAgentChatRuntimeState'
import type { PlanDispatchSettings } from '@/lib/agentPlanActions'
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
  onSelectConversation: (id: string) => void
  showCollapse?: boolean
  showConversationControls?: boolean
  updateDraft: (patch: { input: string }) => void
  updatePlanDispatchSettings: (settings: PlanDispatchSettings) => void
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
  onSelectConversation,
  showCollapse,
  showConversationControls,
  updateDraft,
  updatePlanDispatchSettings,
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
      onSelectConversation,
      showCollapse,
      showConversationControls,
    },
    thread: {
      activePlanSnapshot: presentation.activePlanSnapshot,
      activeRun: activeLocalRun,
      approvingLocalRun: presentation.approvingLocalRun,
      bottomRef: presentation.bottomRef,
      conversationBlocks: presentation.conversationPresentation.blocks,
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
      onDispatchPlan: interaction.dispatchActivePlan,
      onDraftInput: (value) => updateDraft({ input: value }),
      onRejectLocalRun: interaction.rejectLocalRun,
      onRejectPlanReview: interaction.rejectPlanTaskReview,
      onReplan: interaction.replanActivePlan,
      onReworkPlanReview: interaction.reworkPlanTaskReview,
      onScroll: presentation.onThreadScroll,
      onUpdatePlanDispatchSettings: updatePlanDispatchSettings,
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
