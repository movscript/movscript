import type { AgentWorkspaceKind, AgentWorkspaceStatus } from '../../../workspaces/store/workspaceStore.js'
import { normalizeWorkspaceKind, normalizeWorkspaceStatus } from '../../../workspaces/store/workspaceStore.js'
import { isValidAgentProjectId, isValidAgentReferenceId } from '../../runtime/runtimeContext.js'

export { defaultRuntimeLimits, normalizeRuntimeLimitsOverride } from '../../../state/run/core/limits/runtimeLimits.js'
export { buildRunRound, type AgentRunRoundInfo } from '../../../state/run/core/round/runRound.js'
export { normalizeApprovedToolNames, normalizeStringArray, normalizeToolCall } from '../../../tools/calls/input/toolCallInput.js'
export { normalizeBackendAPIBaseURL, normalizeBackendAuthToken } from '../../../application/run/auth/runAuth.js'
export {
  formatInputAnswerMessage,
  getApprovedToolNames,
  mergePendingApprovals,
  mergePendingInputRequests,
} from '../../../state/run/interaction/runInteractionState.js'

export function normalizeWorkspaceQuery(query: {
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
  current?: unknown
  limit?: unknown
}): {
  projectId?: number
  kind?: AgentWorkspaceKind
  status?: AgentWorkspaceStatus
  statuses?: AgentWorkspaceStatus[]
  threadId?: string
  runId?: string
  sourceEntityType?: string
  sourceEntityId?: number | string
  pageKey?: string
  pageType?: string
  pageRoute?: string
  pageEntityType?: string
  pageEntityId?: number | string
  current?: boolean
  limit?: number
} {
  const kind = normalizeOptionalWorkspaceKind(query.kind)
  const status = normalizeWorkspaceStatus(query.status)
  const statuses = normalizeWorkspaceStatuses(query.statuses ?? query.status)
  return {
    ...(isValidAgentProjectId(query.projectId) ? { projectId: query.projectId } : {}),
    ...(kind ? { kind } : {}),
    ...(status ? { status } : {}),
    ...(statuses.length > 0 ? { statuses } : {}),
    ...(typeof query.threadId === 'string' && query.threadId.trim() ? { threadId: query.threadId.trim() } : {}),
    ...(typeof query.runId === 'string' && query.runId.trim() ? { runId: query.runId.trim() } : {}),
    ...(typeof query.sourceEntityType === 'string' && query.sourceEntityType.trim() ? { sourceEntityType: query.sourceEntityType.trim() } : {}),
    ...(isValidAgentReferenceId(query.sourceEntityId) ? { sourceEntityId: query.sourceEntityId } : {}),
    ...(typeof query.pageKey === 'string' && query.pageKey.trim() ? { pageKey: query.pageKey.trim() } : {}),
    ...(typeof query.pageType === 'string' && query.pageType.trim() ? { pageType: query.pageType.trim() } : {}),
    ...(typeof query.pageRoute === 'string' && query.pageRoute.trim() ? { pageRoute: query.pageRoute.trim() } : {}),
    ...(typeof query.pageEntityType === 'string' && query.pageEntityType.trim() ? { pageEntityType: query.pageEntityType.trim() } : {}),
    ...(isValidAgentReferenceId(query.pageEntityId) ? { pageEntityId: query.pageEntityId } : {}),
    ...(typeof query.current === 'boolean' ? { current: query.current } : {}),
    ...(typeof query.limit === 'number' && Number.isFinite(query.limit) ? { limit: query.limit } : {}),
  }
}

function normalizeWorkspaceStatuses(value: unknown): AgentWorkspaceStatus[] {
  const raw = Array.isArray(value) ? value : []
  return Array.from(new Set(raw.flatMap((item) => {
    const status = normalizeWorkspaceStatus(item)
    return status ? [status] : []
  })))
}

export function normalizeOptionalWorkspaceKind(value: unknown): AgentWorkspaceKind | undefined {
  const kind = normalizeWorkspaceKind(value)
  return kind === value ? kind : undefined
}
