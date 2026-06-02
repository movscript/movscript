import type { AgentApprovalRequest, ToolCall } from '../../../state/shared/types.js'
import type { AgentGraphTraceInput } from '../types/agentGraphTypes.js'
import { buildWorkspaceApplyDefaultQueuedTraceData } from '../../tools/rules/workspace-apply/agentGraphWorkspaceApplyRules.js'

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

export function buildDefaultWorkspaceApplyQueuedTrace(
  defaultApplyCalls: ToolCall[],
  trace: Omit<ExecuteTraceBase, 'roundSource'> & { roundSource: 'runtime_rule' },
): AgentGraphTraceInput {
  return {
    kind: 'permission',
    title: 'Default workspace apply queued',
    summary: defaultApplyCalls.map((call) => String(call.args?.workspaceId ?? call.args?.workspace_id ?? call.name)).join(', '),
    status: 'info',
    ...trace,
    data: buildWorkspaceApplyDefaultQueuedTraceData(defaultApplyCalls),
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
