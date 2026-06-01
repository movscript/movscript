import type { AgentManifest } from '../catalog/agentManifest.js'
import type { AgentApprovalRequest, AgentInputRequest, AgentRunPolicy, AgentRunRole, ResolvedToolCatalog, ToolCall } from '../state/types.js'
import { applyToolPolicy, type BlockedToolCall, type ToolPolicyResult } from '../tools/toolPolicy.js'
import type { ToolRegistry } from '../tools/toolRegistry.js'
import { buildInputRequest, type AgentGraphMakeId } from './agentGraphInputRequests.js'

export type ToolExecutionGateDecisionKind = 'input_required' | 'approval_required' | 'allow' | 'deny'

export interface ToolExecutionGateDecision {
  decision: ToolExecutionGateDecisionKind
  requestedCalls: ToolCall[]
  inputCalls: ToolCall[]
  allowedCalls: ToolCall[]
  blockedToolCalls: BlockedToolCall[]
  approvalBlockedToolCalls: BlockedToolCall[]
  warnings: string[]
  policyResult: ToolPolicyResult
}

export interface ToolExecutionGateOptions {
  currentProjectId?: number
  manifest: AgentManifest
  catalog: ResolvedToolCatalog
  registry: ToolRegistry
  approvedToolNames?: string[]
  approvalMode: AgentRunPolicy['approvalMode']
  sandboxMode: boolean
  runRole?: AgentRunRole
}

export interface ToolExecutionGatePendingActions {
  pendingApprovals: AgentApprovalRequest[]
  pendingInputRequests: AgentInputRequest[]
}

const EMPTY_POLICY_RESULT: ToolPolicyResult = {
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
      policyResult: EMPTY_POLICY_RESULT,
    }
  }

  const policyResult = applyToolPolicy(requestedCalls, {
    currentProjectId: options.currentProjectId,
    manifest: options.manifest,
    catalog: options.catalog,
    registry: options.registry,
    approvedToolNames: options.approvedToolNames,
    approvalMode: options.approvalMode,
    sandboxMode: options.sandboxMode,
    runRole: options.runRole,
  })
  const approvalBlockedToolCalls = policyResult.blockedToolCalls.filter((blocked) => blocked.reason === 'approval_required')
  return {
    decision: approvalBlockedToolCalls.length > 0
      ? 'approval_required'
      : policyResult.toolCalls.length > 0 ? 'allow' : 'deny',
    requestedCalls,
    inputCalls: [],
    allowedCalls: policyResult.toolCalls,
    blockedToolCalls: policyResult.blockedToolCalls,
    approvalBlockedToolCalls,
    warnings: policyResult.warnings,
    policyResult,
  }
}

export function buildToolExecutionGatePendingActions(input: {
  decision: ToolExecutionGateDecision
  runId: string
  makeId: AgentGraphMakeId
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
}): AgentApprovalRequest[] {
  const now = new Date().toISOString()
  return input.approvalBlocked.map((blocked) => ({
    id: input.makeId('approval'),
    runId: input.runId,
    toolName: blocked.call.name,
    ...(blocked.call.args ? { args: blocked.call.args } : {}),
    reason: blocked.message,
    ...(blocked.tool?.risk ? { risk: blocked.tool.risk } : {}),
    ...(blocked.tool?.permission ? { permission: blocked.tool.permission } : {}),
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  }))
}
