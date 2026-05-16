import type { AgentDraftKind, AgentDraftStatus } from '../drafts/draftStore.js'
import { normalizeDraftKind, normalizeDraftStatus } from '../drafts/draftStore.js'

export { defaultRunPolicy, normalizeRunPolicyOverride } from '../state/runPolicy.js'
export { buildRunRound, type AgentRunRoundInfo } from '../state/runRound.js'
export { normalizeApprovedToolNames, normalizeStringArray, normalizeToolCall } from '../tools/toolCallInput.js'
export { normalizeBackendAPIBaseURL, normalizeBackendAuthToken } from '../application/runAuth.js'
export {
  formatInputAnswerMessage,
  getApprovedToolNames,
  mergePendingApprovals,
  mergePendingInputRequests,
} from '../state/runInteractionState.js'

export function normalizeDraftQuery(query: {
  projectId?: unknown
  kind?: unknown
  status?: unknown
  statuses?: unknown
  threadId?: unknown
  runId?: unknown
  sourceEntityType?: unknown
  sourceEntityId?: unknown
  pageKey?: unknown
  pageType?: unknown
  pageRoute?: unknown
  pageEntityType?: unknown
  pageEntityId?: unknown
  limit?: unknown
}): {
  projectId?: number
  kind?: AgentDraftKind
  status?: AgentDraftStatus
  statuses?: AgentDraftStatus[]
  threadId?: string
  runId?: string
  sourceEntityType?: string
  sourceEntityId?: number | string
  pageKey?: string
  pageType?: string
  pageRoute?: string
  pageEntityType?: string
  pageEntityId?: number | string
  limit?: number
} {
  const kind = normalizeOptionalDraftKind(query.kind)
  const status = normalizeDraftStatus(query.status)
  const statuses = normalizeDraftStatuses(query.statuses ?? query.status)
  return {
    ...(typeof query.projectId === 'number' && Number.isFinite(query.projectId) ? { projectId: query.projectId } : {}),
    ...(kind ? { kind } : {}),
    ...(status ? { status } : {}),
    ...(statuses.length > 0 ? { statuses } : {}),
    ...(typeof query.threadId === 'string' && query.threadId.trim() ? { threadId: query.threadId.trim() } : {}),
    ...(typeof query.runId === 'string' && query.runId.trim() ? { runId: query.runId.trim() } : {}),
    ...(typeof query.sourceEntityType === 'string' && query.sourceEntityType.trim() ? { sourceEntityType: query.sourceEntityType.trim() } : {}),
    ...(typeof query.sourceEntityId === 'number' || typeof query.sourceEntityId === 'string' ? { sourceEntityId: query.sourceEntityId } : {}),
    ...(typeof query.pageKey === 'string' && query.pageKey.trim() ? { pageKey: query.pageKey.trim() } : {}),
    ...(typeof query.pageType === 'string' && query.pageType.trim() ? { pageType: query.pageType.trim() } : {}),
    ...(typeof query.pageRoute === 'string' && query.pageRoute.trim() ? { pageRoute: query.pageRoute.trim() } : {}),
    ...(typeof query.pageEntityType === 'string' && query.pageEntityType.trim() ? { pageEntityType: query.pageEntityType.trim() } : {}),
    ...(typeof query.pageEntityId === 'number' || typeof query.pageEntityId === 'string' ? { pageEntityId: query.pageEntityId } : {}),
    ...(typeof query.limit === 'number' && Number.isFinite(query.limit) ? { limit: query.limit } : {}),
  }
}

function normalizeDraftStatuses(value: unknown): AgentDraftStatus[] {
  const raw = Array.isArray(value) ? value : []
  return Array.from(new Set(raw.flatMap((item) => {
    const status = normalizeDraftStatus(item)
    return status ? [status] : []
  })))
}

export function normalizeOptionalDraftKind(value: unknown): AgentDraftKind | undefined {
  const kind = normalizeDraftKind(value)
  return kind === value ? kind : undefined
}
