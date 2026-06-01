import { findToolGrant, type AgentManifest } from '../catalog/agentManifest.js'
import { isJSONRecord } from '../jsonValue.js'
import type { AgentApprovalRequest, AgentRun, JSONValue, ToolCall, ToolCallOutcome } from '../state/types.js'
import type { ToolRegistry } from '../tools/toolRegistry.js'

const DEFAULT_DRAFT_APPLY_KIND_ORDER: Record<string, number> = {
  project_standards_proposal: 5,
  setting_proposal: 10,
  asset_proposal: 20,
  production_proposal: 30,
  content_unit_proposal: 40,
}

export function buildDefaultDraftApplyCalls(input: {
  outcomes: ToolCallOutcome[]
  registry: ToolRegistry
  manifest: AgentManifest
  userMessage?: string
  makeId: (prefix: string) => string
}): ToolCall[] {
  if (!input.registry.get('draft_apply')) return []
  const grant = findToolGrant(input.manifest, 'draft_apply')
  if (!grant || grant.mode === 'deny') return []
  if (!hasExplicitDraftApplyIntent(input.userMessage)) return []
  const candidates = input.outcomes.flatMap((outcome, index) => {
    if (outcome.call.name !== 'draft_create') return []
    const result = isJSONRecord(outcome.result) ? outcome.result : undefined
    if (!result || result.status !== 'created') return []
    const draft = isJSONRecord(result.draft) ? result.draft : undefined
    const draftId = typeof result.draftId === 'string'
      ? result.draftId
      : typeof result.draftRef === 'string'
        ? result.draftRef
        : typeof draft?.id === 'string'
          ? draft.id
          : undefined
    const draftKind = typeof draft?.kind === 'string' ? draft.kind : undefined
    const rank = draftKind ? DEFAULT_DRAFT_APPLY_KIND_ORDER[draftKind] : undefined
    if (!draftId || rank === undefined) return []
    return [{ draftId, draftKind, rank, index }]
  })
  return candidates
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map((candidate): ToolCall => ({
      id: input.makeId('call'),
      name: 'draft_apply',
      args: {
        draftId: candidate.draftId,
        ...(candidate.draftKind ? { draftKind: candidate.draftKind } : {}),
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

export function buildDraftApplyDefaultQueuedTraceData(defaultApplyCalls: ToolCall[]): Record<string, JSONValue> {
  return {
    eventType: 'draft.apply.default_queued',
    order: defaultApplyCalls.map((call) => ({
      toolName: call.name,
      ...(call.args?.draftId !== undefined ? { draftId: call.args.draftId } : {}),
      ...(call.args?.draftKind !== undefined ? { draftKind: call.args.draftKind } : {}),
    })),
  }
}

function approvalIdFromForcedCall(call: ToolCall): string | undefined {
  if (typeof call.id !== 'string') return undefined
  return call.id.startsWith('call_approval_') ? call.id.slice('call_'.length) : undefined
}

function hasExplicitDraftApplyIntent(message: string | undefined): boolean {
  const text = typeof message === 'string' ? message.trim().toLowerCase() : ''
  if (!text) return false
  return /\b(apply|apply\s+draft|apply\s+proposal|commit\s+draft|write\s+to\s+backend)\b/i.test(text)
    || /(应用|套用|正式写入|写入项目|写入正式|提交应用|批准应用|通过并应用|落库|生效)/.test(text)
}
