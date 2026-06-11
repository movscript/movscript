import { useCallback, useEffect } from 'react'
import type { MutableRefObject, RefObject } from 'react'
import { notifyAgentPanelRunSettled } from '@/features/agent/application/agentPanelBridge'
import { processExternalAgentTask } from '@/features/agent/application/agentExternalTaskProcessor'
import type { BuildAgentSendWorkspaceOptions } from '@/features/agent/presentation/useAgentSendWorkspaceBuilder'
import type { AgentAttachment } from '@/features/agent/state/agentStore'
import type { AgentPageTaskState } from '@/features/agent/state/agentSessionStore'
import type { AgentThreadControlState } from '@movscript/core/agent/chat'
import type { AgentInputAnswer } from '@/features/agent/domain/agentRunInteraction'
import {
  DEFAULT_AGENT_RUN_PROFILE_PRESET_ID,
  agentRunProfilePresetById,
  type AgentRunProfilePresetId,
} from '@/features/agent/domain/agentRunProfilePreset'
import type { AgentSendWorkspace } from '@/features/agent/application/agentSendWorkspace'
import {
  beginAgentPerformanceOperation,
  finishAgentPerformanceOperation,
  markAgentPerformancePhase,
  performanceNow,
  recordAgentPerformanceMetric,
} from '@/features/agent/state/agentPerformanceStore'

interface PendingInputRequestRef {
  id: string
}

export interface UseAgentSendActionsInput {
  input: string
  getInput?: () => string
  composerAttachments: AgentAttachment[]
  loading: boolean
  uploading: boolean
  buildingSendWorkspace: boolean
  answeringPendingInput: boolean
  activePendingInputRequest: PendingInputRequestRef | null | undefined
  canAnswerPendingInputWithText: boolean
  canSendActiveRunInput: boolean
  modelId: number | null
  threadControl?: Partial<AgentThreadControlState>
  debugBeforeSend: boolean
  pendingSendWorkspace: AgentSendWorkspace | null
  externalTask?: AgentPageTaskState | null
  processedExternalTaskRequestIdRef: MutableRefObject<string | null>
  inputRef: RefObject<HTMLDivElement>
  onExternalWorkspaceConsumed?: () => void
  updateWorkspace: (patch: { input?: string; attachments?: AgentAttachment[] }) => void
  releaseAttachmentResources?: (items: AgentAttachment[]) => void
  setMentionRange: (range: null) => void
  answerActiveRunInput: (requestId: string, answer: AgentInputAnswer) => Promise<unknown>
  sendActiveRunInput: (input: { content: string; attachments: AgentAttachment[] }) => Promise<unknown>
  setConversationBuilding: (patch: { building: boolean; loading?: boolean; error?: string }) => void
  buildSendWorkspace: (options?: BuildAgentSendWorkspaceOptions) => Promise<AgentSendWorkspace>
  commitSendWorkspace: (workspace: AgentSendWorkspace) => Promise<unknown>
  setPendingSendWorkspace: (workspace: AgentSendWorkspace | null) => void
  labels: {
    selectModelFirst: string
    busyError: string
    buildFailurePrefix: string
  }
}

export function useAgentSendActions({
  input,
  getInput,
  composerAttachments,
  loading,
  uploading,
  buildingSendWorkspace,
  answeringPendingInput,
  activePendingInputRequest,
  canAnswerPendingInputWithText,
  canSendActiveRunInput,
  modelId,
  threadControl,
  debugBeforeSend,
  pendingSendWorkspace,
  externalTask,
  processedExternalTaskRequestIdRef,
  inputRef,
  onExternalWorkspaceConsumed,
  updateWorkspace,
  releaseAttachmentResources,
  setMentionRange,
  answerActiveRunInput,
  sendActiveRunInput,
  setConversationBuilding,
  buildSendWorkspace,
  commitSendWorkspace,
  setPendingSendWorkspace,
  labels,
}: UseAgentSendActionsInput) {
  useEffect(() => {
    void processExternalAgentTask({
      task: externalTask,
      processedRequestId: processedExternalTaskRequestIdRef.current,
    }, {
      busy: loading || uploading || buildingSendWorkspace,
      busyError: labels.busyError,
      buildFailurePrefix: labels.buildFailurePrefix,
      updateWorkspace,
      focusInput: () => window.setTimeout(() => inputRef.current?.focus(), 0),
      onExternalWorkspaceConsumed,
      setProcessedRequestId: (requestId) => {
        processedExternalTaskRequestIdRef.current = requestId
      },
      setConversationBuilding,
      buildSendWorkspace,
      commitSendWorkspace,
      notifyRunSettled: notifyAgentPanelRunSettled,
    })
  }, [
    externalTask,
    onExternalWorkspaceConsumed,
    loading,
    uploading,
    buildingSendWorkspace,
    buildSendWorkspace,
    commitSendWorkspace,
    inputRef,
    labels,
    processedExternalTaskRequestIdRef,
    setConversationBuilding,
    updateWorkspace,
  ])

  const send = useCallback(async (profilePresetId: AgentRunProfilePresetId = DEFAULT_AGENT_RUN_PROFILE_PRESET_ID) => {
    const currentInput = getInput?.() ?? input
    if ((!currentInput.trim() && composerAttachments.length === 0) || uploading || buildingSendWorkspace) return
    if (answeringPendingInput && activePendingInputRequest) {
      const text = currentInput.trim()
      if (!canAnswerPendingInputWithText || !text) return
      const operationId = beginAgentPerformanceOperation({
        kind: 'input_answer',
        meta: { inputLength: text.length },
      })
      markAgentPerformancePhase(operationId, 'click_send')
      updateWorkspace({ input: '' })
      setMentionRange(null)
      try {
        await answerActiveRunInput(activePendingInputRequest.id, { text })
        finishAgentPerformanceOperation(operationId, 'success')
      } catch (error) {
        finishAgentPerformanceOperation(operationId, 'error', { error: error instanceof Error ? error.message : String(error) })
        throw error
      }
      return
    }
    if (canSendActiveRunInput) {
      const content = currentInput.trim()
      const attachments = composerAttachments
      const operationId = beginAgentPerformanceOperation({
        kind: 'active_run_input',
        meta: { inputLength: content.length, attachmentCount: attachments.length },
      })
      markAgentPerformancePhase(operationId, 'click_send')
      updateWorkspace({ input: '', attachments: [] })
      setMentionRange(null)
      try {
        await sendActiveRunInput({ content, attachments })
        finishAgentPerformanceOperation(operationId, 'success')
      } catch (error) {
        finishAgentPerformanceOperation(operationId, 'error', { error: error instanceof Error ? error.message : String(error) })
        throw error
      } finally {
        releaseAttachmentResources?.(attachments)
      }
      return
    }
    if (!modelId) {
      setConversationBuilding({ building: false, loading: false, error: labels.selectModelFirst })
      return
    }

    const operationId = beginAgentPerformanceOperation({
      kind: 'send',
      meta: { inputLength: currentInput.trim().length, attachmentCount: composerAttachments.length, debugBeforeSend },
    })
    const sendStartedMs = performanceNow()
    markAgentPerformancePhase(operationId, 'click_send')
    setConversationBuilding({ building: true, loading: false, error: undefined })
    markAgentPerformancePhase(operationId, 'pending_send_visible')
    recordSendEntryStageLatency('pending_send_visible', sendStartedMs)
    schedulePendingSendFrame(operationId, sendStartedMs)
    try {
      const resolvedThreadControl = threadControl?.goal
        ? {
            ...threadControl,
            goal: {
              ...threadControl.goal,
              objective: currentInput.trim() || threadControl.goal.objective,
            },
          }
        : threadControl
      markAgentPerformancePhase(operationId, 'build_workspace_start')
      const workspace = await buildSendWorkspace({
        includeProviderSessionPreview: debugBeforeSend,
        performanceOperationId: operationId,
        runProfile: agentRunProfilePresetById(profilePresetId),
        ...(resolvedThreadControl ? { threadControl: resolvedThreadControl } : {}),
      })
      markAgentPerformancePhase(operationId, 'build_workspace_done', {
        details: { warningCount: workspace.warnings.length, messageCount: workspace.outbound.messages.length },
      })
      if (debugBeforeSend) {
        markAgentPerformancePhase(operationId, 'preview_ready')
        finishAgentPerformanceOperation(operationId, 'success')
        setPendingSendWorkspace(workspace)
        return
      }
      await commitSendWorkspace(workspace)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      finishAgentPerformanceOperation(operationId, 'error', { error: message })
      setConversationBuilding({ building: false, error: `${labels.buildFailurePrefix}${message}` })
    } finally {
      setConversationBuilding({ building: false })
    }
  }, [
    input,
    getInput,
    composerAttachments,
    loading,
    uploading,
    buildingSendWorkspace,
    answeringPendingInput,
    activePendingInputRequest,
    canAnswerPendingInputWithText,
    canSendActiveRunInput,
    updateWorkspace,
    setMentionRange,
    answerActiveRunInput,
    sendActiveRunInput,
    modelId,
    threadControl,
    labels,
    setConversationBuilding,
    buildSendWorkspace,
    debugBeforeSend,
    releaseAttachmentResources,
    setPendingSendWorkspace,
    commitSendWorkspace,
  ])

  const confirmPendingSendWorkspace = useCallback(async () => {
    const workspace = pendingSendWorkspace
    if (!workspace || loading) return
    const operationId = beginAgentPerformanceOperation({
      kind: 'send_preview_confirm',
      meta: { workspaceId: workspace.id, inputLength: workspace.visibleUserContent.length },
    })
    markAgentPerformancePhase(operationId, 'commit_start')
    setPendingSendWorkspace(null)
    await commitSendWorkspace({ ...workspace, performanceOperationId: operationId })
  }, [pendingSendWorkspace, loading, setPendingSendWorkspace, commitSendWorkspace])

  return {
    confirmPendingSendWorkspace,
    send,
  }
}

function schedulePendingSendFrame(operationId: string, sendStartedMs: number): void {
  if (typeof requestAnimationFrame !== 'function') return
  requestAnimationFrame(() => {
    markAgentPerformancePhase(operationId, 'pending_send_frame')
    recordSendEntryStageLatency('pending_send_frame', sendStartedMs)
  })
}

function recordSendEntryStageLatency(stage: string, startedMs: number): void {
  recordAgentPerformanceMetric({
    name: 'frontend_agent_send_stage_latency_ms',
    value: Math.max(0, performanceNow() - startedMs),
    unit: 'ms',
    labels: {
      area: 'agent_frontend',
      component: 'agent_chat',
      kind: 'send',
      stage,
      status: 'running',
    },
  })
}
