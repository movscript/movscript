import type { JSONValue } from '../types.js'
import type { AgentApprovalRequest, AgentRun, AgentRunPolicy, ToolCall } from '../types.js'
import type { AgentDraftKind, AgentDraftStatus } from '../store/draftStore.js'
import { normalizeDraftKind, normalizeDraftStatus } from '../store/draftStore.js'

export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)))
}

export function normalizeApprovedToolNames(value: unknown): string[] {
  return normalizeStringArray(value)
}

export function normalizeToolCall(value: unknown): ToolCall | undefined {
  if (!isRecord(value)) return undefined
  const name = typeof value.name === 'string' && value.name.trim() ? value.name.trim() : undefined
  if (!name) return undefined
  return { name, ...(isRecord(value.args) ? { args: value.args as Record<string, JSONValue> } : {}) }
}

export function normalizeBackendAuthToken(value: unknown): { backendAuthToken?: string } {
  return typeof value === 'string' && value.trim() ? { backendAuthToken: value.trim() } : {}
}

export function normalizeDraftQuery(query: {
  projectId?: unknown
  kind?: unknown
  status?: unknown
  sourceEntityType?: unknown
  sourceEntityId?: unknown
  limit?: unknown
}): {
  projectId?: number
  kind?: AgentDraftKind
  status?: AgentDraftStatus
  sourceEntityType?: string
  sourceEntityId?: number | string
  limit?: number
} {
  const kind = normalizeOptionalDraftKind(query.kind)
  const status = normalizeDraftStatus(query.status)
  return {
    ...(typeof query.projectId === 'number' && Number.isFinite(query.projectId) ? { projectId: query.projectId } : {}),
    ...(kind ? { kind } : {}),
    ...(status ? { status } : {}),
    ...(typeof query.sourceEntityType === 'string' && query.sourceEntityType.trim() ? { sourceEntityType: query.sourceEntityType.trim() } : {}),
    ...(typeof query.sourceEntityId === 'number' || typeof query.sourceEntityId === 'string' ? { sourceEntityId: query.sourceEntityId } : {}),
    ...(typeof query.limit === 'number' && Number.isFinite(query.limit) ? { limit: query.limit } : {}),
  }
}

export function normalizeOptionalDraftKind(value: unknown): AgentDraftKind | undefined {
  const kind = normalizeDraftKind(value)
  return kind === value ? kind : undefined
}

export function getApprovedToolNames(run: AgentRun): string[] {
  return normalizeApprovedToolNames(run.metadata?.approvedToolNames)
}

export function defaultRunPolicy(input: { approvalMode?: AgentRunPolicy['approvalMode']; sandboxMode?: boolean } = {}): AgentRunPolicy {
  return {
    approvalMode: input.approvalMode ?? 'interactive',
    ...(input.sandboxMode ? { sandboxMode: true } : {}),
    maxToolCalls: 20,
    maxIterations: 20,
    allowNetwork: false,
    allowFileBytes: false,
  }
}

export type AgentRunRoundInfo = {
  roundId: string
  roundIndex: number
  roundLabel: string
  roundSource: NonNullable<import('../types.js').AgentRunStep['roundSource']>
}

export function buildRunRound(roundIndex: number, roundLabel: string, roundSource: AgentRunRoundInfo['roundSource']): AgentRunRoundInfo {
  return { roundId: `round_${roundIndex}`, roundIndex, roundLabel, roundSource }
}

export function mergePendingApprovals(existing: AgentApprovalRequest[], next: AgentApprovalRequest[], updatedAt: string): AgentApprovalRequest[] {
  const byTool = new Map<string, AgentApprovalRequest>()
  for (const approval of existing) {
    if (approval.status === 'pending') byTool.set(approval.toolName, approval)
  }
  for (const approval of next) {
    const current = byTool.get(approval.toolName)
    byTool.set(approval.toolName, current ? { ...current, args: approval.args, reason: approval.reason, updatedAt } : approval)
  }
  return Array.from(byTool.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
