import { formatLocalAgentAssistantContent } from '@/features/agent/domain/localAgentResult'
import {
  formatInputAnswerForChat,
  optimisticApprovalRun,
  optimisticInputAnswerRun,
  upsertWorkflowRunSnapshot,
  type AgentInputAnswer,
} from '@/features/agent/domain/agentWorkflowInteraction'
import type { AgentConversationMessageStore, AssistantConversationMessageAppender } from '@movscript/conversation'
import type { AgentRun, AgentThread, RuntimeInteraction } from '@/shared/infrastructure/localAgentClient'
import type { ChatMessage, ChatMessageMeta, ChatRunActivityEvent } from '@/features/agent/state/agentStore'
import {
  beginAgentPerformanceOperation,
  finishAgentPerformanceOperation,
  markAgentPerformancePhase,
} from '@/features/agent/state/agentPerformanceStore'

export type WorkflowConversationRuntimePatch = {
  approving?: boolean
  loading?: boolean
  error?: string
}

export interface AgentWorkflowActionDeps {
  userId: string
  conversationId: string
  setSubmittedInteractionRuns: (updater: (current: AgentRun[]) => AgentRun[]) => void
  setConversationRuntime: (patch: WorkflowConversationRuntimePatch) => void
  setConversationRun: (run: AgentRun, patch: WorkflowConversationRuntimePatch) => void
  messageStore: Pick<AgentConversationMessageStore<ChatMessage, ChatMessageMeta>, 'addMessage' | 'updateMessageMeta'>
  addAssistantMessage: AssistantConversationMessageAppender<ChatMessage['meta']>
  getThread: (threadId: string) => Promise<AgentThread>
  streamFollowUpRun: (runId: string) => Promise<AgentRun>
  appendAssistantRunResult: (run: AgentRun, thread: AgentThread, liveEvents: ChatRunActivityEvent[]) => Promise<unknown>
  liveEvents: () => ChatRunActivityEvent[]
  runTouchesAgentCatalog: (run: AgentRun) => boolean
  refreshAgentCatalogContext: () => void
}

export async function approveWorkflowRunAction(input: {
  run: AgentRun
  approvalIds?: string[]
  approveInteraction: (interactionId: string) => Promise<{ interaction: RuntimeInteraction; run: AgentRun }>
  deps: AgentWorkflowActionDeps
}): Promise<void> {
  const { run, approvalIds, approveInteraction, deps } = input
  const operationId = beginAgentPerformanceOperation({
    kind: 'approval',
    conversationId: deps.conversationId,
    runId: run.id,
    meta: { approvalCount: selectedPendingApprovals(run, approvalIds).length },
  })
  deps.setSubmittedInteractionRuns((current) => upsertWorkflowRunSnapshot(current, optimisticApprovalRun(run, approvalIds, 'approved')))
  markAgentPerformancePhase(operationId, 'optimistic_update')
  deps.setConversationRuntime({ approving: true, loading: true, error: undefined })
  try {
    markAgentPerformancePhase(operationId, 'approval_request_start')
    const approvedRun = await resolveApprovalRun({
      run,
      approvalIds,
      approveInteraction,
    })
    markAgentPerformancePhase(operationId, 'approval_request_done', {
      details: { runId: approvedRun.id, status: approvedRun.status },
    })
    deps.setSubmittedInteractionRuns((current) => upsertWorkflowRunSnapshot(current, approvedRun))
    deps.setConversationRun(approvedRun, { approving: true, loading: true })
    markAgentPerformancePhase(operationId, 'followup_stream_start')
    const finalRun = await deps.streamFollowUpRun(approvedRun.id)
    markAgentPerformancePhase(operationId, 'followup_stream_done', {
      details: { runId: finalRun.id, status: finalRun.status },
    })
    deps.setSubmittedInteractionRuns((current) => upsertWorkflowRunSnapshot(current, finalRun))
    const thread = await deps.getThread(finalRun.threadId)
    markAgentPerformancePhase(operationId, 'final_thread_loaded', {
      details: { threadId: thread.id, messageCount: thread.messages.length },
    })
    if (finalRun.status !== 'requires_action') {
      await deps.appendAssistantRunResult(finalRun, thread, deps.liveEvents())
      markAgentPerformancePhase(operationId, 'assistant_result_appended')
    }
    if (deps.runTouchesAgentCatalog(finalRun)) deps.refreshAgentCatalogContext()
    finishAgentPerformanceOperation(operationId, 'success', { runId: finalRun.id, status: finalRun.status })
  } catch (error) {
    finishAgentPerformanceOperation(operationId, 'error', { error: error instanceof Error ? error.message : String(error) })
    deps.addAssistantMessage(`工具确认失败：${error instanceof Error ? error.message : String(error)}`)
  } finally {
    deps.setConversationRuntime({ approving: false, loading: false })
  }
}

export async function rejectWorkflowRunAction(input: {
  run: AgentRun
  approvalIds?: string[]
  rejectInteraction: (interactionId: string) => Promise<{ interaction: RuntimeInteraction; run: AgentRun }>
  deps: AgentWorkflowActionDeps
}): Promise<void> {
  const { run, approvalIds, rejectInteraction, deps } = input
  const operationId = beginAgentPerformanceOperation({
    kind: 'rejection',
    conversationId: deps.conversationId,
    runId: run.id,
    meta: { approvalCount: selectedPendingApprovals(run, approvalIds).length },
  })
  deps.setSubmittedInteractionRuns((current) => upsertWorkflowRunSnapshot(current, optimisticApprovalRun(run, approvalIds, 'rejected')))
  markAgentPerformancePhase(operationId, 'optimistic_update')
  deps.setConversationRuntime({ approving: true, loading: true, error: undefined })
  try {
    markAgentPerformancePhase(operationId, 'rejection_request_start')
    const rejectedRun = await resolveRejectionRun({
      run,
      approvalIds,
      rejectInteraction,
    })
    markAgentPerformancePhase(operationId, 'rejection_request_done', {
      details: { runId: rejectedRun.id, status: rejectedRun.status },
    })
    deps.setSubmittedInteractionRuns((current) => upsertWorkflowRunSnapshot(current, rejectedRun))
    deps.setConversationRun(rejectedRun, { approving: true, loading: true })
    const thread = await deps.getThread(rejectedRun.threadId)
    markAgentPerformancePhase(operationId, 'final_thread_loaded', {
      details: { threadId: thread.id, messageCount: thread.messages.length },
    })
    deps.addAssistantMessage(formatLocalAgentAssistantContent(rejectedRun, thread), { contextLabels: [`run ${rejectedRun.status}`] })
    markAgentPerformancePhase(operationId, 'assistant_result_appended')
    if (deps.runTouchesAgentCatalog(rejectedRun)) deps.refreshAgentCatalogContext()
    finishAgentPerformanceOperation(operationId, 'success', { runId: rejectedRun.id, status: rejectedRun.status })
  } catch (error) {
    finishAgentPerformanceOperation(operationId, 'error', { error: error instanceof Error ? error.message : String(error) })
    deps.addAssistantMessage(`工具拒绝失败：${error instanceof Error ? error.message : String(error)}`)
  } finally {
    deps.setConversationRuntime({ approving: false, loading: false })
  }
}

async function resolveApprovalRun(input: {
  run: AgentRun
  approvalIds?: string[]
  approveInteraction: (interactionId: string) => Promise<{ interaction: RuntimeInteraction; run: AgentRun }>
}): Promise<AgentRun> {
  const approvals = selectedPendingApprovals(input.run, input.approvalIds)
  const interactionIds = approvals.map((approval) => approval.interactionId).filter((id): id is string => Boolean(id))
  if (interactionIds.length !== approvals.length || interactionIds.length === 0) {
    throw new Error('runtime approval interaction is missing')
  }
  let latestRun = input.run
  for (const interactionId of interactionIds) {
    latestRun = (await input.approveInteraction(interactionId)).run
  }
  return latestRun
}

async function resolveRejectionRun(input: {
  run: AgentRun
  approvalIds?: string[]
  rejectInteraction: (interactionId: string) => Promise<{ interaction: RuntimeInteraction; run: AgentRun }>
}): Promise<AgentRun> {
  const approvals = selectedPendingApprovals(input.run, input.approvalIds)
  const interactionIds = approvals.map((approval) => approval.interactionId).filter((id): id is string => Boolean(id))
  if (interactionIds.length !== approvals.length || interactionIds.length === 0) {
    throw new Error('runtime rejection interaction is missing')
  }
  let latestRun = input.run
  for (const interactionId of interactionIds) {
    latestRun = (await input.rejectInteraction(interactionId)).run
  }
  return latestRun
}

function selectedPendingApprovals(run: AgentRun, approvalIds: string[] | undefined): NonNullable<AgentRun['pendingApprovals']> {
  const pending = (run.pendingApprovals ?? []).filter((approval) => approval.status === 'pending')
  if (!approvalIds?.length) return pending
  const selectedIds = new Set(approvalIds)
  return pending.filter((approval) => selectedIds.has(approval.id))
}

export async function answerWorkflowRunInputAction(input: {
  run: AgentRun
  requestId: string
  answer: AgentInputAnswer
  answerRunInput: (runId: string, input: { requestId: string; sourceMessageId?: string } & AgentInputAnswer) => Promise<AgentRun>
  deps: AgentWorkflowActionDeps
}): Promise<void> {
  const { run, requestId, answer, answerRunInput, deps } = input
  const pendingRequest = (run.pendingInputRequests ?? []).find((request) => request.id === requestId && request.status === 'pending')
  const localMessageId = pendingRequest
    ? deps.messageStore.addMessage(deps.userId, deps.conversationId, {
      role: 'user',
      content: formatInputAnswerForChat(pendingRequest, answer),
      meta: {
        runtimeInput: {
          threadId: run.threadId,
          runId: run.id,
          status: 'pending',
        },
      },
    })
    : undefined
  deps.setSubmittedInteractionRuns((current) => upsertWorkflowRunSnapshot(current, optimisticInputAnswerRun(run, requestId, answer)))
  deps.setConversationRuntime({ approving: true, loading: true, error: undefined })
  try {
    const answeredRun = await answerRunInput(run.id, {
      requestId,
      ...answer,
      ...(localMessageId ? { sourceMessageId: localMessageId } : {}),
    })
    if (localMessageId) {
      deps.messageStore.updateMessageMeta(deps.userId, deps.conversationId, localMessageId, {
        runtimeInput: {
          threadId: run.threadId,
          runId: answeredRun.id,
          messageId: localMessageId,
          status: 'accepted',
        },
        runtimeMessage: {
          threadId: run.threadId,
          runId: answeredRun.id,
          messageId: localMessageId,
        },
      })
    }
    deps.setSubmittedInteractionRuns((current) => upsertWorkflowRunSnapshot(current, answeredRun))
    deps.setConversationRun(answeredRun, { approving: true, loading: true })
    const finalRun = await deps.streamFollowUpRun(answeredRun.id)
    deps.setSubmittedInteractionRuns((current) => upsertWorkflowRunSnapshot(current, finalRun))
    const thread = await deps.getThread(finalRun.threadId)
    if (finalRun.status !== 'requires_action') {
      await deps.appendAssistantRunResult(finalRun, thread, deps.liveEvents())
    }
    if (deps.runTouchesAgentCatalog(finalRun)) deps.refreshAgentCatalogContext()
  } catch (error) {
    if (localMessageId) {
      deps.messageStore.updateMessageMeta(deps.userId, deps.conversationId, localMessageId, {
        runtimeInput: {
          threadId: run.threadId,
          runId: run.id,
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        },
      })
    }
    deps.addAssistantMessage(`补充信息提交失败：${error instanceof Error ? error.message : String(error)}`)
  } finally {
    deps.setConversationRuntime({ approving: false, loading: false })
  }
}
