import type { AgentApprovalRequest, AgentRun, ToolCall, ToolCallOutcome } from '../../../../state/shared/types.js'

export function remainingPendingApprovalsAfterForcedCalls(run: Pick<AgentRun, 'pendingApprovals'>, outcomes: ToolCallOutcome[]): AgentApprovalRequest[] {
  const executedApprovalIds = new Set(
    outcomes
      .map((outcome) => approvalIdFromForcedCall(outcome.call))
      .filter((approvalId): approvalId is string => Boolean(approvalId)),
  )
  if (executedApprovalIds.size === 0) return []
  return (run.pendingApprovals ?? []).filter((approval) => approval.status === 'pending' && !executedApprovalIds.has(approval.id))
}

function approvalIdFromForcedCall(call: ToolCall): string | undefined {
  if (typeof call.id !== 'string') return undefined
  return call.id.startsWith('call_approval_') ? call.id.slice('call_'.length) : undefined
}
