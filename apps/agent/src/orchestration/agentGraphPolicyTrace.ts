import { createHash } from 'node:crypto'
import { summarizeInputRequestsTrace } from '../domains/trace/interactionTrace.js'
import { summarizeToolCallTrace } from '../domains/trace/toolTrace.js'
import type { AgentInputRequest, ToolCall } from '../state/types.js'
import type { BlockedToolCall, ToolPolicyResult } from '../tools/toolPolicy.js'
import type { AgentGraphTraceInput } from './agentGraphTypes.js'

type PolicyTraceBase = Pick<AgentGraphTraceInput, 'roundIndex' | 'roundLabel' | 'roundSource'>

export function buildUserInputRequiredTrace(
  pendingInputRequests: AgentInputRequest[],
  trace: PolicyTraceBase,
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

export function buildPolicyDecisionTrace(
  policyResult: ToolPolicyResult,
  trace: PolicyTraceBase,
): AgentGraphTraceInput {
  return {
    kind: 'policy',
    title: `Turn ${trace.roundIndex}: policy result`,
    summary: `${policyResult.toolCalls.length} allowed, ${policyResult.blockedToolCalls.length} blocked`,
    status: hasApprovalBlocked(policyResult.blockedToolCalls) ? 'blocked' : 'completed',
    ...trace,
    data: {
      eventType: 'tool.call.policy_decision',
      allowed: policyResult.toolCalls.map((call) => call.name),
      blocked: policyResult.blockedToolCalls.map((blocked) => ({ name: blocked.call.name, reason: blocked.reason })),
      decision: hasApprovalBlocked(policyResult.blockedToolCalls)
        ? 'approval_required'
        : policyResult.blockedToolCalls.length > 0 ? 'deny' : 'allow',
    },
  }
}

export function buildApprovalRequestedTrace(
  approvalBlocked: BlockedToolCall[],
  trace: PolicyTraceBase,
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
  trace: PolicyTraceBase
}): AgentGraphTraceInput {
  return {
    kind: 'policy',
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
