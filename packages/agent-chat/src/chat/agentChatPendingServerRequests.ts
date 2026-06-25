import type {
  AgentChatNotificationEvent,
  AgentChatServerRequest,
  AgentChatServerRequestResponse,
} from './agentChatProtocol.js'

export type AgentChatPendingServerRequestResolver = (response: AgentChatServerRequestResponse | undefined) => void

export interface AgentChatPendingServerRequestQueueEntry {
  request: AgentChatServerRequest
  resolve: AgentChatPendingServerRequestResolver
}

export type AgentChatPendingServerRequestResolvableEntry = {
  request: AgentChatServerRequest
  resolve?: AgentChatPendingServerRequestResolver
}

export function upsertAgentChatPendingServerRequest(
  current: AgentChatPendingServerRequestQueueEntry[],
  request: AgentChatServerRequest,
  resolve: AgentChatPendingServerRequestResolver,
): AgentChatPendingServerRequestQueueEntry[] {
  const existing = current.filter((item) => agentChatServerRequestsShareResolutionKey(item.request, request))
  if (existing.length === 0) return [...current, { request, resolve }]
  return [
    ...current.filter((item) => !agentChatServerRequestsShareResolutionKey(item.request, request)),
    {
      request,
      resolve: (response) => {
        for (const item of existing) item.resolve(response)
        resolve(response)
      },
    },
  ]
}

export function removeAgentChatPendingServerRequests<TEntry extends AgentChatPendingServerRequestResolvableEntry>(
  current: TEntry[],
  shouldRemove: (entry: TEntry) => boolean,
): TEntry[] {
  const next: TEntry[] = []
  for (const entry of current) {
    if (!shouldRemove(entry)) {
      next.push(entry)
      continue
    }
    entry.resolve?.(undefined)
  }
  return next
}

export function dropAgentChatPendingServerRequests<TEntry extends AgentChatPendingServerRequestResolvableEntry>(
  current: TEntry[],
  shouldDrop: (entry: TEntry) => boolean,
): TEntry[] {
  return current.filter((entry) => !shouldDrop(entry))
}

export function resolveAgentChatPendingServerRequest<TEntry extends AgentChatPendingServerRequestResolvableEntry>(
  current: TEntry[],
  target: AgentChatServerRequest | string,
  response: AgentChatServerRequestResponse | undefined,
): TEntry[] {
  const next: TEntry[] = []
  for (const entry of current) {
    const matches = typeof target === 'string'
      ? agentChatServerRequestResolutionKeys(entry.request).includes(target)
      : agentChatServerRequestsShareResolutionKey(entry.request, target)
    if (!matches) {
      next.push(entry)
      continue
    }
    entry.resolve?.(response)
  }
  return next
}

export function agentChatThreadIdForServerRequest(
  activeThreadId: string | null,
  request: AgentChatServerRequest,
): string | null {
  return request.threadId && request.threadId !== activeThreadId ? request.threadId : null
}

export function visibleAgentChatPendingServerRequests<TEntry extends AgentChatPendingServerRequestResolvableEntry>(
  current: TEntry[],
  activeThreadId: string | null,
): TEntry[] {
  return current.filter((item) => !item.request.threadId || item.request.threadId === activeThreadId)
}

export function agentChatPendingServerRequestEntryKey(entry: AgentChatPendingServerRequestResolvableEntry): string {
  const request = entry.request
  return [
    request.threadId ?? '',
    request.turnId ?? '',
    request.method,
    request.id,
  ].join(':')
}

export function agentChatPendingServerRequestMatchesResolvedEvent(
  request: AgentChatServerRequest,
  event: AgentChatNotificationEvent,
): boolean {
  if (event.type !== 'serverRequestResolved') return false
  if (event.threadId && request.threadId && event.threadId !== request.threadId) return false
  return agentChatServerRequestResolutionKeys(request).includes(event.requestId)
    || agentChatServerRequestResolvedEventKeys(event).some((key) => agentChatServerRequestResolutionKeys(request).includes(key))
}

function agentChatServerRequestsShareResolutionKey(
  first: AgentChatServerRequest,
  second: AgentChatServerRequest,
): boolean {
  if (first.threadId && second.threadId && first.threadId !== second.threadId) return false
  if (first.turnId && second.turnId && first.turnId !== second.turnId) return false
  const firstKeys = agentChatServerRequestResolutionKeys(first)
  return agentChatServerRequestResolutionKeys(second).some((key) => firstKeys.includes(key))
}

function agentChatServerRequestResolutionKeys(request: AgentChatServerRequest): string[] {
  const params = isRecord(request.params) ? request.params : {}
  const raw = isRecord(request.raw) ? request.raw : {}
  return uniqueNonEmptyStrings([
    request.id,
    readString(params, 'interactionId'),
    readString(params, 'approvalId'),
    readString(params, 'requestId'),
    readString(params, 'inputId'),
    readString(params, 'id'),
    readString(raw, 'interactionId'),
    readString(raw, 'id'),
  ])
}

function agentChatServerRequestResolvedEventKeys(event: AgentChatNotificationEvent): string[] {
  if (event.type !== 'serverRequestResolved') return []
  const raw = isRecord(event.raw) ? event.raw : {}
  const entity = isRecord(raw.entity) ? raw.entity : {}
  const value = isRecord(entity.value) ? entity.value : {}
  const payload = isRecord(value.payload) ? value.payload : {}
  return uniqueNonEmptyStrings([
    event.requestId,
    readString(value, 'id'),
    readString(payload, 'approvalId'),
    readString(payload, 'requestId'),
    readString(payload, 'inputId'),
    readString(payload, 'id'),
  ])
}

function uniqueNonEmptyStrings(values: Array<string | undefined>): string[] {
  return values.filter((value, index, array): value is string => Boolean(value) && array.indexOf(value) === index)
}

function readString(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
