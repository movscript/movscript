import type { RuntimeModelChatMessage } from '../model/modelConfig.js'
import type { AgentApprovalRequest, AgentInputRequest, AgentRunStatus, ToolCall } from '../state/types.js'
import type { AgentGraphInput, AgentGraphTraceInput } from './agentGraphTypes.js'
import type { AgentGraphMakeId } from './agentGraphInputRequests.js'
import {
  buildApprovalRequestedTrace,
  buildPolicyDecisionTrace,
  buildSkillActivationRepairTrace,
  buildUserInputRequiredTrace,
} from './agentGraphPolicyTrace.js'
import { getLastAssistantContent } from './agentGraphResult.js'
import { preflightToolExecutionPipeline } from './toolExecutionPipeline.js'

type PolicyTraceBase = Pick<AgentGraphTraceInput, 'roundIndex' | 'roundLabel' | 'roundSource'>

export interface AgentGraphPolicyState {
  history: RuntimeModelChatMessage[]
  warnings: string[]
  toolCallCount: number
  requestedCalls: ToolCall[]
  modelContent?: string | null
}

export interface AgentGraphPolicyTurnResult {
  requestedCalls?: ToolCall[]
  warnings?: string[]
  finalContent?: string
  status?: AgentRunStatus
  pendingApprovals?: AgentApprovalRequest[]
  pendingInputRequests?: AgentInputRequest[]
}

export function runAgentGraphPolicyTurn(
  state: AgentGraphPolicyState,
  input: AgentGraphInput,
  options: {
    trace: PolicyTraceBase
    makeId: AgentGraphMakeId
  },
): AgentGraphPolicyTurnResult {
  const remaining = input.policy.maxToolCalls - state.toolCallCount
  if (remaining <= 0) {
    return {
      warnings: [`已达到工具调用上限 ${input.policy.maxToolCalls}`],
      status: 'completed',
      finalContent: state.modelContent ?? getLastAssistantContent(state.history),
    }
  }

  const preflight = preflightToolExecutionPipeline({
    requestedCalls: state.requestedCalls.slice(0, remaining),
    runId: input.run.id,
    makeId: options.makeId,
    options: {
      currentProjectId: input.context.project?.id,
      manifest: input.manifest,
      catalog: input.capabilities,
      registry: input.registry,
      approvedToolNames: input.approvedToolNames,
      approvalMode: input.policy.approvalMode,
      sandboxMode: input.policy.sandboxMode === true,
      runRole: input.run.role,
    },
    skillRepair: {
      capabilities: input.capabilities,
      skills: input.skills,
    },
  })

  if (preflight.kind === 'input_required') {
    const { pendingInputRequests } = preflight.pendingActions
    input.onTrace(buildUserInputRequiredTrace(pendingInputRequests, options.trace))
    return {
      pendingApprovals: [],
      status: 'requires_action',
      warnings: [],
      finalContent: state.modelContent ?? getLastAssistantContent(state.history),
      requestedCalls: [],
      pendingInputRequests,
    }
  }

  const policyResult = preflight.policy.policyResult
  input.onTrace(buildPolicyDecisionTrace(policyResult, options.trace))

  if (preflight.kind === 'approval_required') {
    const { pendingApprovals } = preflight.pendingActions
    input.onTrace(buildApprovalRequestedTrace(preflight.policy.approvalBlockedToolCalls, {
      ...options.trace,
      roundSource: 'approval',
    }))
    return {
      pendingApprovals,
      status: 'requires_action',
      warnings: policyResult.warnings,
    }
  }

  if (preflight.kind === 'repair') {
    input.onTrace(buildSkillActivationRepairTrace({
      blockedToolCalls: preflight.policy.blockedToolCalls,
      repairCalls: preflight.repairCalls,
      trace: {
        ...options.trace,
        roundSource: 'runtime_rule',
      },
    }))
    return {
      requestedCalls: preflight.repairCalls,
      warnings: preflight.warnings,
    }
  }

  if (preflight.policy.allowedCalls.length === 0) {
    return {
      status: 'completed',
      finalContent: state.modelContent ?? getLastAssistantContent(state.history) ?? (state.warnings.length > 0 ? state.warnings.join('\n') : ''),
      warnings: policyResult.warnings,
    }
  }

  return {
    requestedCalls: preflight.policy.allowedCalls,
    warnings: preflight.policy.warnings,
  }
}
