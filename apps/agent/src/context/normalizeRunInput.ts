import type { JSONValue } from '../state/types.js'
import type { AgentApprovalRequest, AgentInputRequest, AgentRun, AgentRunPolicy, AgentWorkflowConfig, ToolCall } from '../state/types.js'
import type { AgentDraftKind, AgentDraftStatus } from '../drafts/draftStore.js'
import { normalizeDraftKind, normalizeDraftStatus } from '../drafts/draftStore.js'

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

export function normalizeBackendAPIBaseURL(value: unknown): { backendAPIBaseURL?: string } {
  return typeof value === 'string' && value.trim() ? { backendAPIBaseURL: value.trim().replace(/\/+$/, '') } : {}
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

export function defaultRunPolicy(input: { approvalMode?: AgentRunPolicy['approvalMode']; sandboxMode?: boolean; workflow?: AgentWorkflowConfig } = {}): AgentRunPolicy {
  return {
    approvalMode: input.approvalMode ?? 'interactive',
    ...(input.sandboxMode ? { sandboxMode: true } : {}),
    maxToolCalls: 20,
    maxIterations: 20,
    allowNetwork: false,
    allowFileBytes: false,
    workflow: input.workflow ?? { profile: 'standard', includeMemories: true, allowForcedToolCalls: true },
  }
}

export type AgentRunRoundInfo = {
  roundId: string
  roundIndex: number
  roundLabel: string
  roundSource: NonNullable<import('../state/types.js').AgentRunStep['roundSource']>
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

export function mergePendingInputRequests(existing: AgentInputRequest[], next: AgentInputRequest[], updatedAt: string): AgentInputRequest[] {
  const pending = existing.filter((request) => request.status === 'pending')
  const resolved = existing.filter((request) => request.status !== 'pending')
  const merged = [...pending]
  for (const request of next) {
    const currentIndex = merged.findIndex((item) => item.title === request.title && item.question === request.question)
    if (currentIndex >= 0) {
      merged[currentIndex] = { ...merged[currentIndex], summary: request.summary, choices: request.choices, updatedAt }
    } else {
      merged.push(request)
    }
  }
  return [...resolved, ...merged].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export function formatInputAnswerMessage(request: AgentInputRequest, choiceIds: string[], text?: string): string {
  const choicesById = new Map(request.choices.map((choice) => [choice.id, choice]))
  const selected = choiceIds
    .map((choiceId) => choicesById.get(choiceId))
    .filter((choice): choice is AgentInputRequest['choices'][number] => Boolean(choice))
  const lines = [
    '[用户补充信息]',
    `标题：${request.title}`,
    request.summary ? `简介：${request.summary}` : undefined,
    `问题：${request.question}`,
  ].filter((line): line is string => Boolean(line))
  if (selected.length > 0) {
    lines.push('选择：')
    for (const choice of selected) {
      lines.push(`- ${choice.label}${choice.description ? `：${choice.description}` : ''}`)
    }
  }
  if (text) lines.push(`输入：${text}`)
  return lines.join('\n')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
