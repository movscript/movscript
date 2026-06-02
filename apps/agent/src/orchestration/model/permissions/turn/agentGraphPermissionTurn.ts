import type { RuntimeModelChatMessage } from '../../../../model/config/modelConfig.js'
import type { AgentApprovalRequest, AgentInputRequest, AgentRunStatus, ToolCall } from '../../../../state/shared/types.js'
import type { AgentGraphInput, AgentGraphTraceInput } from '../../../graph/types/agentGraphTypes.js'
import type { AgentGraphMakeId } from '../../../graph/input/agentGraphInputRequests.js'
import {
  buildApprovalRequestedTrace,
  buildToolPermissionDecisionTrace,
  buildSkillActivationRepairTrace,
  buildUserInputRequiredTrace,
} from '../trace/agentGraphPermissionTrace.js'
import { getLastAssistantContent } from '../../../graph/result/agentGraphResult.js'
import { preflightToolExecutionPipeline } from '../../../tools/execution/pipeline/toolExecutionPipeline.js'

type PermissionTraceBase = Pick<AgentGraphTraceInput, 'roundIndex' | 'roundLabel' | 'roundSource'>

export interface AgentGraphPermissionState {
  history: RuntimeModelChatMessage[]
  warnings: string[]
  toolCallCount: number
  requestedCalls: ToolCall[]
  modelContent?: string | null
}

export interface AgentGraphPermissionTurnResult {
  requestedCalls?: ToolCall[]
  warnings?: string[]
  finalContent?: string
  status?: AgentRunStatus
  pendingApprovals?: AgentApprovalRequest[]
  pendingInputRequests?: AgentInputRequest[]
}

export function runAgentGraphPermissionTurn(
  state: AgentGraphPermissionState,
  input: AgentGraphInput,
  options: {
    trace: PermissionTraceBase
    makeId: AgentGraphMakeId
  },
): AgentGraphPermissionTurnResult {
  const remaining = input.runtimeLimits.maxToolCalls - state.toolCallCount
  if (remaining <= 0) {
    return {
      warnings: [`已达到工具调用上限 ${input.runtimeLimits.maxToolCalls}`],
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
      approvalMode: input.runtimeLimits.approvalMode,
      sandboxMode: input.runtimeLimits.sandboxMode === true,
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

  const permissionResult = preflight.permissions.permissionResult
  input.onTrace(buildToolPermissionDecisionTrace(permissionResult, options.trace))

  if (preflight.kind === 'approval_required') {
    const { pendingApprovals } = preflight.pendingActions
    input.onTrace(buildApprovalRequestedTrace(preflight.permissions.approvalBlockedToolCalls, {
      ...options.trace,
      roundSource: 'approval',
    }))
    return {
      pendingApprovals,
      status: 'requires_action',
      warnings: permissionResult.warnings,
    }
  }

  if (preflight.kind === 'repair') {
    input.onTrace(buildSkillActivationRepairTrace({
      blockedToolCalls: preflight.permissions.blockedToolCalls,
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

  if (preflight.permissions.allowedCalls.length === 0) {
    return {
      status: 'completed',
      finalContent: state.modelContent ?? getLastAssistantContent(state.history) ?? (state.warnings.length > 0 ? state.warnings.join('\n') : ''),
      warnings: permissionResult.warnings,
    }
  }

  return {
    requestedCalls: preflight.permissions.allowedCalls,
    warnings: preflight.permissions.warnings,
  }
}
