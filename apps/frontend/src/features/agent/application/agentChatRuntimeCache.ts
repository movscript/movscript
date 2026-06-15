import {
  agentChatPendingServerRequestEntryKey,
  agentChatPendingServerRequestMatchesResolvedEvent,
  dropAgentChatPendingServerRequests,
  upsertAgentChatPendingServerRequest,
  type AgentChatNotification,
  type AgentChatServerRequest,
  type AgentChatServerRequestResponse,
  type AgentChatThread,
  type AgentChatRuntimePendingServerRequest,
} from '@movscript/core/agent/chat'

export interface AgentChatSourceThreadListCacheSnapshot {
  loaded: boolean
  nextCursor: string | null
  threads: AgentChatThread[]
}

const persistentPendingServerRequests = new Map<string, AgentChatRuntimePendingServerRequest[]>()
const sourceThreadListCache = new Map<string, AgentChatSourceThreadListCacheSnapshot>()

export function storeAgentChatPersistentServerRequest(
  scopeKey: string,
  request: AgentChatServerRequest,
  resolve: (response: AgentChatServerRequestResponse | undefined) => void,
): (response: AgentChatServerRequestResponse | undefined) => void {
  const persistentResolve = (response: AgentChatServerRequestResponse | undefined) => {
    removeAgentChatPersistentServerRequest(scopeKey, request)
    resolve(response)
  }
  const current = persistentPendingServerRequests.get(scopeKey) ?? []
  persistentPendingServerRequests.set(
    scopeKey,
    upsertAgentChatPendingServerRequest(current, request, persistentResolve),
  )
  return persistentResolve
}

export function readAgentChatPersistentServerRequests(scopeKey: string): AgentChatRuntimePendingServerRequest[] {
  return persistentPendingServerRequests.get(scopeKey) ?? []
}

export function applyAgentChatPersistentServerRequestNotification(
  scopeKey: string,
  notification: AgentChatNotification,
): void {
  const event = notification.event
  if (event?.type === 'serverRequestResolved') {
    dropAgentChatPersistentServerRequests(scopeKey, (entry) => agentChatPendingServerRequestMatchesResolvedEvent(entry.request, event))
    return
  }
  if (event?.type === 'threadLifecycle') {
    if (event.action === 'unarchived') return
    dropAgentChatPersistentServerRequests(scopeKey, (entry) => entry.request.threadId === event.threadId)
    return
  }
  if (notification.method !== 'turn/completed') return
  const params = recordValue(notification.params)
  const threadId = stringValue(params?.threadId)
  const turn = recordValue(params?.turn)
  const turnId = stringValue(turn?.id)
  if (!threadId || !turnId) return
  dropAgentChatPersistentServerRequests(scopeKey, (entry) => {
    if (entry.request.threadId !== threadId) return false
    return !entry.request.turnId || entry.request.turnId === turnId
  })
}

export function readAgentChatSourceThreadListCache(threadScopeKey: string): AgentChatSourceThreadListCacheSnapshot {
  return sourceThreadListCache.get(threadScopeKey) ?? {
    loaded: false,
    nextCursor: null,
    threads: [],
  }
}

export function writeAgentChatSourceThreadListCache(
  threadScopeKey: string,
  snapshot: AgentChatSourceThreadListCacheSnapshot,
): void {
  sourceThreadListCache.set(threadScopeKey, snapshot)
}

function removeAgentChatPersistentServerRequest(scopeKey: string, request: AgentChatServerRequest): void {
  const current = persistentPendingServerRequests.get(scopeKey)
  if (!current) return
  const requestKey = agentChatPendingServerRequestEntryKey({ request })
  const next = current.filter((entry) => agentChatPendingServerRequestEntryKey(entry) !== requestKey)
  if (next.length === 0) persistentPendingServerRequests.delete(scopeKey)
  else persistentPendingServerRequests.set(scopeKey, next)
}

function dropAgentChatPersistentServerRequests(
  scopeKey: string,
  shouldDrop: (entry: AgentChatRuntimePendingServerRequest) => boolean,
): void {
  const current = persistentPendingServerRequests.get(scopeKey)
  if (!current) return
  const next = dropAgentChatPendingServerRequests(current, shouldDrop)
  if (next.length === 0) persistentPendingServerRequests.delete(scopeKey)
  else persistentPendingServerRequests.set(scopeKey, next)
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
