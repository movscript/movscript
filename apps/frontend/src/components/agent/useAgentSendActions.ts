import { useCallback, useEffect } from 'react'
import type { MutableRefObject, RefObject } from 'react'
import { notifyAgentPanelRunSettled } from '@/lib/agentPanelBridge'
import { processExternalAgentTask } from '@/lib/agentExternalTaskProcessor'
import type { BuildAgentSendDraftOptions } from '@/components/agent/useAgentSendDraftBuilder'
import type { AgentAttachment } from '@/store/agentStore'
import type { AgentPageTaskState } from '@/store/agentSessionStore'
import type { AgentInputAnswer } from '@/lib/agentWorkflowInteraction'
import type { AgentSendDraft } from '@/lib/agentSendDraft'
import {
  beginAgentPerformanceOperation,
  finishAgentPerformanceOperation,
  markAgentPerformancePhase,
} from '@/store/agentPerformanceStore'

interface PendingInputRequestRef {
  id: string
}

export interface UseAgentSendActionsInput {
  input: string
  composerAttachments: AgentAttachment[]
  loading: boolean
  uploading: boolean
  buildingSendDraft: boolean
  answeringPendingInput: boolean
  activePendingInputRequest: PendingInputRequestRef | null | undefined
  canAnswerPendingInputWithText: boolean
  canSendActiveRunRuntimeInput: boolean
  modelId: number | null
  debugBeforeSend: boolean
  pendingSendDraft: AgentSendDraft | null
  externalTask?: AgentPageTaskState | null
  processedExternalTaskRequestIdRef: MutableRefObject<string | null>
  inputRef: RefObject<HTMLDivElement>
  onExternalDraftConsumed?: () => void
  updateDraft: (patch: { input?: string; attachments?: AgentAttachment[] }) => void
  setMentionRange: (range: null) => void
  answerActiveLocalRunInput: (requestId: string, answer: AgentInputAnswer) => Promise<unknown>
  sendActiveRunRuntimeInput: (input: { content: string; attachments: AgentAttachment[] }) => Promise<unknown>
  addAssistantMessage: (content: string) => void
  setConversationBuilding: (patch: { building: boolean; loading?: boolean; error?: string }) => void
  buildSendDraft: (options?: BuildAgentSendDraftOptions) => Promise<AgentSendDraft>
  commitSendDraft: (draft: AgentSendDraft) => Promise<unknown>
  setPendingSendDraft: (draft: AgentSendDraft | null) => void
  labels: {
    selectModelFirst: string
    busyError: string
    buildFailurePrefix: string
  }
}

export function useAgentSendActions({
  input,
  composerAttachments,
  loading,
  uploading,
  buildingSendDraft,
  answeringPendingInput,
  activePendingInputRequest,
  canAnswerPendingInputWithText,
  canSendActiveRunRuntimeInput,
  modelId,
  debugBeforeSend,
  pendingSendDraft,
  externalTask,
  processedExternalTaskRequestIdRef,
  inputRef,
  onExternalDraftConsumed,
  updateDraft,
  setMentionRange,
  answerActiveLocalRunInput,
  sendActiveRunRuntimeInput,
  addAssistantMessage,
  setConversationBuilding,
  buildSendDraft,
  commitSendDraft,
  setPendingSendDraft,
  labels,
}: UseAgentSendActionsInput) {
  useEffect(() => {
    void processExternalAgentTask({
      task: externalTask,
      processedRequestId: processedExternalTaskRequestIdRef.current,
    }, {
      busy: loading || uploading || buildingSendDraft,
      busyError: labels.busyError,
      buildFailurePrefix: labels.buildFailurePrefix,
      updateDraft,
      focusInput: () => window.setTimeout(() => inputRef.current?.focus(), 0),
      onExternalDraftConsumed,
      setProcessedRequestId: (requestId) => {
        processedExternalTaskRequestIdRef.current = requestId
      },
      addAssistantMessage,
      setConversationBuilding,
      buildSendDraft,
      commitSendDraft,
      notifyRunSettled: notifyAgentPanelRunSettled,
    })
  }, [
    externalTask,
    onExternalDraftConsumed,
    loading,
    uploading,
    buildingSendDraft,
    addAssistantMessage,
    buildSendDraft,
    commitSendDraft,
    inputRef,
    labels,
    processedExternalTaskRequestIdRef,
    setConversationBuilding,
    updateDraft,
  ])

  const send = useCallback(async () => {
    if ((!input.trim() && composerAttachments.length === 0) || uploading || buildingSendDraft) return
    if (answeringPendingInput && activePendingInputRequest) {
      const text = input.trim()
      if (!canAnswerPendingInputWithText || !text) return
      const operationId = beginAgentPerformanceOperation({
        kind: 'input_answer',
        meta: { inputLength: text.length },
      })
      markAgentPerformancePhase(operationId, 'click_send')
      updateDraft({ input: '' })
      setMentionRange(null)
      try {
        await answerActiveLocalRunInput(activePendingInputRequest.id, { text })
        finishAgentPerformanceOperation(operationId, 'success')
      } catch (error) {
        finishAgentPerformanceOperation(operationId, 'error', { error: error instanceof Error ? error.message : String(error) })
        throw error
      }
      return
    }
    if (canSendActiveRunRuntimeInput) {
      const content = input.trim()
      const attachments = composerAttachments
      const operationId = beginAgentPerformanceOperation({
        kind: 'runtime_input',
        meta: { inputLength: content.length, attachmentCount: attachments.length },
      })
      markAgentPerformancePhase(operationId, 'click_send')
      updateDraft({ input: '', attachments: [] })
      setMentionRange(null)
      try {
        await sendActiveRunRuntimeInput({ content, attachments })
        finishAgentPerformanceOperation(operationId, 'success')
      } catch (error) {
        finishAgentPerformanceOperation(operationId, 'error', { error: error instanceof Error ? error.message : String(error) })
        throw error
      }
      return
    }
    if (!modelId) {
      addAssistantMessage(labels.selectModelFirst)
      return
    }

    const operationId = beginAgentPerformanceOperation({
      kind: 'send',
      meta: { inputLength: input.trim().length, attachmentCount: composerAttachments.length, debugBeforeSend },
    })
    markAgentPerformancePhase(operationId, 'click_send')
    setConversationBuilding({ building: true, loading: false, error: undefined })
    try {
      markAgentPerformancePhase(operationId, 'build_draft_start')
      const draft = await buildSendDraft({ includeRuntimePreview: debugBeforeSend, performanceOperationId: operationId })
      markAgentPerformancePhase(operationId, 'build_draft_done', {
        details: { warningCount: draft.warnings.length, messageCount: draft.outbound.messages.length },
      })
      if (debugBeforeSend) {
        markAgentPerformancePhase(operationId, 'preview_ready')
        finishAgentPerformanceOperation(operationId, 'success')
        setPendingSendDraft(draft)
        return
      }
      await commitSendDraft(draft)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      finishAgentPerformanceOperation(operationId, 'error', { error: message })
      addAssistantMessage(`${labels.buildFailurePrefix}${message}`)
      setConversationBuilding({ building: false, error: message })
    } finally {
      setConversationBuilding({ building: false })
    }
  }, [
    input,
    composerAttachments,
    loading,
    uploading,
    buildingSendDraft,
    answeringPendingInput,
    activePendingInputRequest,
    canAnswerPendingInputWithText,
    canSendActiveRunRuntimeInput,
    updateDraft,
    setMentionRange,
    answerActiveLocalRunInput,
    sendActiveRunRuntimeInput,
    modelId,
    addAssistantMessage,
    labels,
    setConversationBuilding,
    buildSendDraft,
    debugBeforeSend,
    setPendingSendDraft,
    commitSendDraft,
  ])

  const confirmPendingSendDraft = useCallback(async () => {
    const draft = pendingSendDraft
    if (!draft || loading) return
    const operationId = beginAgentPerformanceOperation({
      kind: 'send_preview_confirm',
      meta: { draftId: draft.id, inputLength: draft.visibleUserContent.length },
    })
    markAgentPerformancePhase(operationId, 'commit_start')
    setPendingSendDraft(null)
    await commitSendDraft({ ...draft, performanceOperationId: operationId })
  }, [pendingSendDraft, loading, setPendingSendDraft, commitSendDraft])

  return {
    confirmPendingSendDraft,
    send,
  }
}
