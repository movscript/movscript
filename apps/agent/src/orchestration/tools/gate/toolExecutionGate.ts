import type { AgentManifest } from '../../../catalog/manifest/agentManifest.js'
import type { AgentApprovalRequest, AgentInputRequest, AgentRuntimeLimits, AgentRunRole, AgentToolCallOrigin, ResolvedToolCatalog, ToolCall } from '../../../state/shared/types.js'
import { applyToolPermissions, type BlockedToolCall, type ToolPermissionResult } from '../../../tools/permissions/evaluation/toolPermissions.js'
import type { ToolRegistry } from '../../../tools/registry/core/toolRegistry.js'
import { buildInputRequest, type AgentGraphMakeId } from '../../graph/input/agentGraphInputRequests.js'

export type ToolExecutionGateDecisionKind = 'input_required' | 'approval_required' | 'allow' | 'deny'

export interface ToolExecutionGateDecision {
  decision: ToolExecutionGateDecisionKind
  requestedCalls: ToolCall[]
  inputCalls: ToolCall[]
  allowedCalls: ToolCall[]
  blockedToolCalls: BlockedToolCall[]
  approvalBlockedToolCalls: BlockedToolCall[]
  warnings: string[]
  permissionResult: ToolPermissionResult
}

export interface ToolExecutionGateOptions {
  currentProjectId?: number
  manifest: AgentManifest
  catalog: ResolvedToolCatalog
  registry: ToolRegistry
  approvedToolNames?: string[]
  approvalMode: AgentRuntimeLimits['approvalMode']
  sandboxMode: boolean
  runRole?: AgentRunRole
}

export interface ToolExecutionGatePendingActions {
  pendingApprovals: AgentApprovalRequest[]
  pendingInputRequests: AgentInputRequest[]
}

const EMPTY_PERMISSION_RESULT: ToolPermissionResult = {
  toolCalls: [],
  warnings: [],
  blockedToolCalls: [],
}

export function evaluateToolExecutionGate(
  requestedCalls: ToolCall[],
  options: ToolExecutionGateOptions,
): ToolExecutionGateDecision {
  const inputCalls = requestedCalls.filter((call) => call.name === 'core_user_input_request')
  if (inputCalls.length > 0) {
    return {
      decision: 'input_required',
      requestedCalls,
      inputCalls,
      allowedCalls: [],
      blockedToolCalls: [],
      approvalBlockedToolCalls: [],
      warnings: [],
      permissionResult: EMPTY_PERMISSION_RESULT,
    }
  }

  const permissionResult = applyToolPermissions(requestedCalls, {
    currentProjectId: options.currentProjectId,
    manifest: options.manifest,
    catalog: options.catalog,
    registry: options.registry,
    approvedToolNames: options.approvedToolNames,
    approvalMode: options.approvalMode,
    sandboxMode: options.sandboxMode,
    runRole: options.runRole,
  })
  const approvalBlockedToolCalls = permissionResult.blockedToolCalls.filter((blocked) => blocked.reason === 'approval_required')
  return {
    decision: approvalBlockedToolCalls.length > 0
      ? 'approval_required'
      : permissionResult.toolCalls.length > 0 ? 'allow' : 'deny',
    requestedCalls,
    inputCalls: [],
    allowedCalls: permissionResult.toolCalls,
    blockedToolCalls: permissionResult.blockedToolCalls,
    approvalBlockedToolCalls,
    warnings: permissionResult.warnings,
    permissionResult,
  }
}

export function buildToolExecutionGatePendingActions(input: {
  decision: ToolExecutionGateDecision
  runId: string
  makeId: AgentGraphMakeId
  approvalOrigin?: AgentToolCallOrigin
}): ToolExecutionGatePendingActions {
  if (input.decision.decision === 'input_required') {
    return {
      pendingApprovals: [],
      pendingInputRequests: input.decision.inputCalls.map((call) => buildInputRequest(input.runId, call.args ?? {}, input.makeId)),
    }
  }
  if (input.decision.decision === 'approval_required') {
    return {
      pendingApprovals: buildPendingApprovalRequests({
        approvalBlocked: input.decision.approvalBlockedToolCalls,
        runId: input.runId,
        makeId: input.makeId,
        ...(input.approvalOrigin ? { origin: input.approvalOrigin } : {}),
      }),
      pendingInputRequests: [],
    }
  }
  return {
    pendingApprovals: [],
    pendingInputRequests: [],
  }
}

function buildPendingApprovalRequests(input: {
  approvalBlocked: BlockedToolCall[]
  runId: string
  makeId: AgentGraphMakeId
  origin?: AgentToolCallOrigin
}): AgentApprovalRequest[] {
  const now = new Date().toISOString()
  return input.approvalBlocked.map((blocked) => {
    const origin = toolCallOrigin(blocked.call, input.origin)
    return {
      id: input.makeId('approval'),
      runId: input.runId,
      toolName: blocked.call.name,
      ...(blocked.call.args ? { args: blocked.call.args } : {}),
      ...(origin ? { origin } : {}),
      reason: blocked.message,
      ...(blocked.tool?.risk ? { risk: blocked.tool.risk } : {}),
      ...(blocked.tool?.permission ? { permission: blocked.tool.permission } : {}),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    }
  })
}

function toolCallOrigin(call: ToolCall, origin: AgentToolCallOrigin | undefined): AgentToolCallOrigin | undefined {
  if (!origin && !call.id) return undefined
  return {
    ...(call.id ? { toolCallId: call.id } : {}),
    ...(origin?.roundId ? { roundId: origin.roundId } : {}),
    ...(origin?.roundIndex !== undefined ? { roundIndex: origin.roundIndex } : {}),
    ...(origin?.roundLabel ? { roundLabel: origin.roundLabel } : {}),
    ...(origin?.roundSource ? { roundSource: origin.roundSource } : {}),
  }
}
