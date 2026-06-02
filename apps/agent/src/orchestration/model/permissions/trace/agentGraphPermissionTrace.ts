import { createHash } from 'node:crypto'
import { summarizeInputRequestsTrace } from '../../../../trace/summaries/interaction/requests/interactionTrace.js'
import { summarizeToolCallTrace } from '../../../../trace/summaries/tool/call/toolTrace.js'
import type { AgentInputRequest, ToolCall } from '../../../../state/shared/types.js'
import type { BlockedToolCall, ToolPermissionResult } from '../../../../tools/permissions/evaluation/toolPermissions.js'
import type { AgentGraphTraceInput } from '../../../graph/types/agentGraphTypes.js'

type PermissionTraceBase = Pick<AgentGraphTraceInput, 'roundIndex' | 'roundLabel' | 'roundSource'>

export function buildUserInputRequiredTrace(
  pendingInputRequests: AgentInputRequest[],
  trace: PermissionTraceBase,
): AgentGraphTraceInput {
  return {
    kind: 'input',
    title: 'User input required',
    summary: `${pendingInputRequests.length} user input request(s) required.`,
    status: 'blocked',
    ...trace,
    data: {
      eventType: 'input.requested',
      inputRequestSummary: summarizeInputRequestsTrace(pendingInputRequests),
    },
  }
}

export function buildToolPermissionDecisionTrace(
  permissionResult: ToolPermissionResult,
  trace: PermissionTraceBase,
): AgentGraphTraceInput {
  return {
    kind: 'permission',
    title: `Turn ${trace.roundIndex}: tool permission result`,
    summary: `${permissionResult.toolCalls.length} allowed, ${permissionResult.blockedToolCalls.length} blocked`,
    status: hasApprovalBlocked(permissionResult.blockedToolCalls) ? 'blocked' : 'completed',
    ...trace,
    data: {
      eventType: 'tool.call.permission_decision',
      allowed: permissionResult.toolCalls.map((call) => call.name),
      blocked: permissionResult.blockedToolCalls.map((blocked) => ({ name: blocked.call.name, reason: blocked.reason })),
      decision: hasApprovalBlocked(permissionResult.blockedToolCalls)
        ? 'approval_required'
        : permissionResult.blockedToolCalls.length > 0 ? 'deny' : 'allow',
    },
  }
}

export function buildApprovalRequestedTrace(
  approvalBlocked: BlockedToolCall[],
  trace: PermissionTraceBase,
): AgentGraphTraceInput {
  return {
    kind: 'approval',
    title: 'Approval requested',
    summary: approvalBlocked.map((blocked) => blocked.call.name).join(', '),
    status: 'blocked',
    ...trace,
    data: {
      eventType: 'approval.requested',
      tools: approvalBlocked.map((blocked) => ({
        name: blocked.call.name,
        ...summarizeTextPayload('reason', blocked.message),
        risk: blocked.tool?.risk,
        permission: blocked.tool?.permission,
      })),
    },
  }
}

export function buildSkillActivationRepairTrace(input: {
  blockedToolCalls: BlockedToolCall[]
  repairCalls: ToolCall[]
  trace: PermissionTraceBase
}): AgentGraphTraceInput {
  return {
    kind: 'permission',
    title: `Turn ${input.trace.roundIndex}: skill activation repair`,
    summary: input.repairCalls.map((call) => call.name).join(', '),
    status: 'completed',
    ...input.trace,
    data: {
      eventType: 'tool.call.skill_activation_repair',
      blocked: input.blockedToolCalls.map((blocked) => ({ name: blocked.call.name, reason: blocked.reason })),
      repairCalls: input.repairCalls.map((call) => summarizeToolCallTrace({ call, args: call.args ?? {} })),
    },
  }
}

function summarizeTextPayload(prefix: string, value: string): Record<string, string | number> {
  return {
    [`${prefix}Hash`]: hashString(value),
    [`${prefix}Chars`]: value.length,
    [`${prefix}Mode`]: 'summary',
  }
}

function hashString(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function hasApprovalBlocked(blockedToolCalls: BlockedToolCall[]): boolean {
  return blockedToolCalls.some((blocked) => blocked.reason === 'approval_required')
}
