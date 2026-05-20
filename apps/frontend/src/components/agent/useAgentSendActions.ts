import { useCallback, useEffect } from 'react'
import type { MutableRefObject, RefObject } from 'react'
import { notifyAgentPanelRunSettled } from '@/lib/agentPanelBridge'
import { processExternalAgentTask } from '@/lib/agentExternalTaskProcessor'
import type { BuildAgentSendDraftOptions } from '@/components/agent/useAgentSendDraftBuilder'
import type { AgentAttachment } from '@/store/agentStore'
import type { AgentPageTaskState } from '@/store/agentSessionStore'
import type { AgentInputAnswer } from '@/lib/agentWorkflowInteraction'
import type { AgentSendDraft } from '@/lib/agentSendDraft'

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
    if (loading && !answeringPendingInput) {
      const text = input.trim()
      if (!text && composerAttachments.length === 0) return
      updateDraft({ input: '', attachments: [] })
      setMentionRange(null)
      await sendActiveRunRuntimeInput({ content: text, attachments: composerAttachments })
      return
    }
    if (answeringPendingInput && activePendingInputRequest) {
      const text = input.trim()
      if (!canAnswerPendingInputWithText || !text) return
      updateDraft({ input: '' })
      setMentionRange(null)
      await answerActiveLocalRunInput(activePendingInputRequest.id, { text })
      return
    }
    if (!modelId) {
      addAssistantMessage(labels.selectModelFirst)
      return
    }

    setConversationBuilding({ building: true, loading: false, error: undefined })
    try {
      const draft = await buildSendDraft({ includeRuntimePreview: debugBeforeSend })
      if (debugBeforeSend) {
        setPendingSendDraft(draft)
        return
      }
      await commitSendDraft(draft)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
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
    setPendingSendDraft(null)
    await commitSendDraft(draft)
  }, [pendingSendDraft, loading, setPendingSendDraft, commitSendDraft])

  return {
    confirmPendingSendDraft,
    send,
  }
}
