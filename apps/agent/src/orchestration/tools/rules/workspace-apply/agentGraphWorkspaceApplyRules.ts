import { findToolGrant, type AgentManifest } from '../../../../catalog/manifest/agentManifest.js'
import { isJSONRecord } from '../../../../shared/json/jsonValue.js'
import type { AgentApprovalRequest, AgentRun, JSONValue, ToolCall, ToolCallOutcome } from '../../../../state/shared/types.js'
import type { ToolRegistry } from '../../../../tools/registry/core/toolRegistry.js'

const DEFAULT_WORKSPACE_APPLY_KIND_ORDER: Record<string, number> = {
  project_standards_workspace: 5,
  setting_workspace: 10,
  asset_workspace: 20,
  production_workspace: 30,
  content_unit_workspace: 40,
}

export function buildDefaultWorkspaceApplyCalls(input: {
  outcomes: ToolCallOutcome[]
  registry: ToolRegistry
  manifest: AgentManifest
  userMessage?: string
  makeId: (prefix: string) => string
}): ToolCall[] {
  if (!input.registry.get('workspace_apply')) return []
  const grant = findToolGrant(input.manifest, 'workspace_apply')
  if (!grant || grant.mode === 'deny') return []
  if (!hasExplicitWorkspaceApplyIntent(input.userMessage)) return []
  const candidates = input.outcomes.flatMap((outcome, index) => {
    if (outcome.call.name !== 'workspace_open') return []
    const result = isJSONRecord(outcome.result) ? outcome.result : undefined
    if (!result || result.status !== 'created') return []
    const workspace = isJSONRecord(result.workspace) ? result.workspace : undefined
    const workspaceId = typeof result.workspaceId === 'string'
      ? result.workspaceId
      : typeof result.workspaceRef === 'string'
        ? result.workspaceRef
        : typeof workspace?.id === 'string'
          ? workspace.id
          : undefined
    const workspaceKind = typeof workspace?.kind === 'string' ? workspace.kind : undefined
    const rank = workspaceKind ? DEFAULT_WORKSPACE_APPLY_KIND_ORDER[workspaceKind] : undefined
    if (!workspaceId || rank === undefined) return []
    return [{ workspaceId, workspaceKind, rank, index }]
  })
  return candidates
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map((candidate): ToolCall => ({
      id: input.makeId('call'),
      name: 'workspace_apply',
      args: {
        workspaceId: candidate.workspaceId,
        ...(candidate.workspaceKind ? { workspaceKind: candidate.workspaceKind } : {}),
      },
    }))
}

export function remainingPendingApprovalsAfterForcedCalls(run: Pick<AgentRun, 'pendingApprovals'>, outcomes: ToolCallOutcome[]): AgentApprovalRequest[] {
  const executedApprovalIds = new Set(
    outcomes
      .map((outcome) => approvalIdFromForcedCall(outcome.call))
      .filter((approvalId): approvalId is string => Boolean(approvalId)),
  )
  if (executedApprovalIds.size === 0) return []
  return (run.pendingApprovals ?? []).filter((approval) => approval.status === 'pending' && !executedApprovalIds.has(approval.id))
}

export function buildWorkspaceApplyDefaultQueuedTraceData(defaultApplyCalls: ToolCall[]): Record<string, JSONValue> {
  return {
    eventType: 'workspace.apply.default_queued',
    order: defaultApplyCalls.map((call) => ({
      toolName: call.name,
      ...(call.args?.workspaceId !== undefined ? { workspaceId: call.args.workspaceId } : {}),
      ...(call.args?.workspaceKind !== undefined ? { workspaceKind: call.args.workspaceKind } : {}),
    })),
  }
}

function approvalIdFromForcedCall(call: ToolCall): string | undefined {
  if (typeof call.id !== 'string') return undefined
  return call.id.startsWith('call_approval_') ? call.id.slice('call_'.length) : undefined
}

function hasExplicitWorkspaceApplyIntent(message: string | undefined): boolean {
  const text = typeof message === 'string' ? message.trim().toLowerCase() : ''
  if (!text) return false
  return /\b(apply|apply\s+workspace|apply\s+workspace|commit\s+workspace|write\s+to\s+backend)\b/i.test(text)
    || /(应用|套用|正式写入|写入项目|写入正式|提交应用|批准应用|通过并应用|落库|生效)/.test(text)
}
