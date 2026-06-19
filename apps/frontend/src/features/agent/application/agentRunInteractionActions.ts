import {
  optimisticApprovalRun,
  optimisticInputAnswerRun,
  upsertInteractionRunSnapshot,
  type AgentInputAnswer,
} from '@/features/agent/domain/agentRunInteraction'
import type { AgentRun, ProviderInteraction } from '@movscript/core/agent/protocol'
import {
  beginAgentPerformanceOperation,
  finishAgentPerformanceOperation,
  markAgentPerformancePhase,
} from '@/features/agent/state/agentPerformanceStore'

export type RunInteractionConversationProviderSessionPatch = {
  approving?: boolean
  loading?: boolean
  error?: string
}

export interface AgentRunApprovalDecisionInput {
  scope?: 'turn' | 'session'
  strictAutoReview?: boolean
  execPolicyAmendment?: unknown
  networkPolicyAmendment?: unknown
}

export interface AgentRunInteractionActionDeps {
  conversationId: string
  setSubmittedInteractionRuns: (updater: (current: AgentRun[]) => AgentRun[]) => void
  updateConversationRuntimeState: (patch: RunInteractionConversationProviderSessionPatch) => void
  setConversationRun: (run: AgentRun, patch: RunInteractionConversationProviderSessionPatch) => void
  streamFollowUpRun: (runId: string) => Promise<AgentRun>
}

export async function approveRunInteractionAction(input: {
  run: AgentRun
  approvalIds?: string[]
  approvalDecision?: AgentRunApprovalDecisionInput
  approveInteraction: (interactionId: string, decision?: AgentRunApprovalDecisionInput) => Promise<{ interaction: ProviderInteraction; run: AgentRun }>
  deps: AgentRunInteractionActionDeps
}): Promise<void> {
  const { run, approvalIds, approvalDecision, approveInteraction, deps } = input
  const operationId = beginAgentPerformanceOperation({
    kind: 'approval',
    conversationId: deps.conversationId,
    runId: run.id,
    meta: { approvalCount: selectedPendingApprovals(run, approvalIds).length },
  })
  deps.setSubmittedInteractionRuns((current) => upsertInteractionRunSnapshot(current, optimisticApprovalRun(run, approvalIds, 'approved')))
  markAgentPerformancePhase(operationId, 'optimistic_update')
  deps.updateConversationRuntimeState({ approving: true, loading: true, error: undefined })
  try {
    markAgentPerformancePhase(operationId, 'approval_request_start')
    const approvedRun = await resolveApprovalRun({
      run,
      approvalIds,
      approvalDecision,
      approveInteraction,
    })
    markAgentPerformancePhase(operationId, 'approval_request_done', {
      details: { runId: approvedRun.id, status: approvedRun.status },
    })
    deps.setSubmittedInteractionRuns((current) => upsertInteractionRunSnapshot(current, approvedRun))
    deps.setConversationRun(approvedRun, { approving: true, loading: true })
    markAgentPerformancePhase(operationId, 'followup_stream_start')
    const finalRun = await deps.streamFollowUpRun(approvedRun.id)
    markAgentPerformancePhase(operationId, 'followup_stream_done', {
      details: { runId: finalRun.id, status: finalRun.status },
    })
    deps.setSubmittedInteractionRuns((current) => upsertInteractionRunSnapshot(current, finalRun))
    finishAgentPerformanceOperation(operationId, 'success', { runId: finalRun.id, status: finalRun.status })
  } catch (error) {
    finishAgentPerformanceOperation(operationId, 'error', { error: error instanceof Error ? error.message : String(error) })
    deps.updateConversationRuntimeState({ approving: false, loading: false, error: `工具确认失败：${error instanceof Error ? error.message : String(error)}` })
  } finally {
    deps.updateConversationRuntimeState({ approving: false, loading: false })
  }
}

export async function rejectRunInteractionAction(input: {
  run: AgentRun
  approvalIds?: string[]
  rejectInteraction: (interactionId: string) => Promise<{ interaction: ProviderInteraction; run: AgentRun }>
  deps: AgentRunInteractionActionDeps
}): Promise<void> {
  const { run, approvalIds, rejectInteraction, deps } = input
  const operationId = beginAgentPerformanceOperation({
    kind: 'rejection',
    conversationId: deps.conversationId,
    runId: run.id,
    meta: { approvalCount: selectedPendingApprovals(run, approvalIds).length },
  })
  deps.setSubmittedInteractionRuns((current) => upsertInteractionRunSnapshot(current, optimisticApprovalRun(run, approvalIds, 'rejected')))
  markAgentPerformancePhase(operationId, 'optimistic_update')
  deps.updateConversationRuntimeState({ approving: true, loading: true, error: undefined })
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
    deps.setSubmittedInteractionRuns((current) => upsertInteractionRunSnapshot(current, rejectedRun))
    deps.setConversationRun(rejectedRun, { approving: true, loading: true })
    finishAgentPerformanceOperation(operationId, 'success', { runId: rejectedRun.id, status: rejectedRun.status })
  } catch (error) {
    finishAgentPerformanceOperation(operationId, 'error', { error: error instanceof Error ? error.message : String(error) })
    deps.updateConversationRuntimeState({ approving: false, loading: false, error: `工具拒绝失败：${error instanceof Error ? error.message : String(error)}` })
  } finally {
    deps.updateConversationRuntimeState({ approving: false, loading: false })
  }
}

async function resolveApprovalRun(input: {
  run: AgentRun
  approvalIds?: string[]
  approvalDecision?: AgentRunApprovalDecisionInput
  approveInteraction: (interactionId: string, decision?: AgentRunApprovalDecisionInput) => Promise<{ interaction: ProviderInteraction; run: AgentRun }>
}): Promise<AgentRun> {
  const approvals = selectedPendingApprovals(input.run, input.approvalIds)
  const interactionIds = approvals.map((approval) => approval.interactionId).filter((id): id is string => Boolean(id))
  if (interactionIds.length !== approvals.length || interactionIds.length === 0) {
    throw new Error('provider-session approval interaction is missing')
  }
  let latestRun = input.run
  for (const interactionId of interactionIds) {
    latestRun = (await input.approveInteraction(interactionId, input.approvalDecision)).run
  }
  return latestRun
}

async function resolveRejectionRun(input: {
  run: AgentRun
  approvalIds?: string[]
  rejectInteraction: (interactionId: string) => Promise<{ interaction: ProviderInteraction; run: AgentRun }>
}): Promise<AgentRun> {
  const approvals = selectedPendingApprovals(input.run, input.approvalIds)
  const interactionIds = approvals.map((approval) => approval.interactionId).filter((id): id is string => Boolean(id))
  if (interactionIds.length !== approvals.length || interactionIds.length === 0) {
    throw new Error('provider-session rejection interaction is missing')
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

export async function answerRunInteractionInputAction(input: {
  run: AgentRun
  requestId: string
  answer: AgentInputAnswer
  answerRunInput: (runId: string, input: { requestId: string; sourceMessageId?: string } & AgentInputAnswer) => Promise<AgentRun>
  deps: AgentRunInteractionActionDeps
}): Promise<void> {
  const { run, requestId, answer, answerRunInput, deps } = input
  deps.setSubmittedInteractionRuns((current) => upsertInteractionRunSnapshot(current, optimisticInputAnswerRun(run, requestId, answer)))
  deps.updateConversationRuntimeState({ approving: true, loading: true, error: undefined })
  try {
    const answeredRun = await answerRunInput(run.id, {
      requestId,
      ...answer,
    })
    deps.setSubmittedInteractionRuns((current) => upsertInteractionRunSnapshot(current, answeredRun))
    deps.setConversationRun(answeredRun, { approving: true, loading: true })
    const finalRun = await deps.streamFollowUpRun(answeredRun.id)
    deps.setSubmittedInteractionRuns((current) => upsertInteractionRunSnapshot(current, finalRun))
  } catch (error) {
    deps.updateConversationRuntimeState({ approving: false, loading: false, error: `补充信息提交失败：${error instanceof Error ? error.message : String(error)}` })
  } finally {
    deps.updateConversationRuntimeState({ approving: false, loading: false })
  }
}
