import type { AgentApprovalRequest, ToolCall } from '../../../state/shared/types.js'
import type { AgentGraphTraceInput } from '../types/agentGraphTypes.js'

type ExecuteTraceBase = Pick<AgentGraphTraceInput, 'roundIndex' | 'roundLabel' | 'roundSource'>

export function buildConcurrentReadToolsTrace(
  requestedCalls: ToolCall[],
  trace: ExecuteTraceBase,
): AgentGraphTraceInput {
  return {
    kind: 'tool_call',
    title: 'Read tools executed concurrently',
    summary: `${requestedCalls.length} read tool call(s) completed in parallel.`,
    status: 'completed',
    ...trace,
    data: { toolNames: requestedCalls.map((call) => call.name) },
  }
}

export function buildApprovalStillPendingTrace(
  remainingApprovals: AgentApprovalRequest[],
  trace: Omit<ExecuteTraceBase, 'roundSource'> & { roundSource: 'approval' },
): AgentGraphTraceInput {
  return {
    kind: 'approval',
    title: 'Approval still pending',
    summary: remainingApprovals.map((approval) => approval.toolName).join(', '),
    status: 'blocked',
    ...trace,
    data: {
      eventType: 'approval.remaining',
      approvals: remainingApprovals.map((approval) => ({
        id: approval.id,
        toolName: approval.toolName,
        risk: approval.risk,
        permission: approval.permission,
      })),
    },
  }
}
