import { createEventBus } from '@/shared/application/eventBus'
import type { AgentChatNotification, AgentChatProviderKind } from '@movscript/core/agent/chat'

export type CrossPageNotificationTransport = 'sdk-runtime-ipc' | 'electron-ipc' | 'backend-ws' | 'dom' | 'local'
export type CrossPageNotificationScopeKind = 'thread' | 'project' | 'workspace' | 'global'
export type CrossPageNotificationTopic = 'agent-chat' | 'mcp-status' | 'generation-job' | 'capability' | 'navigation'

export interface CrossPageNotificationScope {
  kind: CrossPageNotificationScopeKind
  id?: string
}

export interface CrossPageNotificationEnvelope<TPayload = unknown> {
  id: string
  topic: CrossPageNotificationTopic
  scope: CrossPageNotificationScope
  transport: CrossPageNotificationTransport
  source: string
  emittedAt: string
  payload: TPayload
  raw?: unknown
}

export interface AgentChatCrossPageNotificationPayload {
  provider?: AgentChatProviderKind
  notification: AgentChatNotification
}

export type CrossPageNotificationEvent =
  | CrossPageNotificationEnvelope<AgentChatCrossPageNotificationPayload>
  | CrossPageNotificationEnvelope

type CrossPageNotificationEventMap = {
  notification: CrossPageNotificationEvent
}

const crossPageNotificationBus = createEventBus<CrossPageNotificationEventMap>()
const recentNotificationIds = new Set<string>()
const recentNotificationIdOrder: string[] = []
const RECENT_NOTIFICATION_ID_LIMIT = 500
const CROSS_PAGE_NOTIFICATION_CHANNEL_NAME = 'movscript:cross-page-notifications:v1'
const crossPageNotificationInstanceId = `frontend-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`

interface CrossPageNotificationBroadcastChannel {
  postMessage(message: unknown): void
  close(): void
  onmessage: ((event: MessageEvent<unknown>) => void) | null
}

interface CrossPageNotificationBroadcastMessage {
  senderId: string
  event: CrossPageNotificationEvent
}

export function publishCrossPageNotification(event: CrossPageNotificationEvent): boolean {
  if (wasCrossPageNotificationSeen(event.id)) return false
  crossPageNotificationBus.publish('notification', event)
  return true
}

export function publishCrossPageNotificationFromUnknown(value: unknown): boolean {
  if (!isCrossPageNotificationEvent(value)) return false
  return publishCrossPageNotification(value)
}

export function subscribeCrossPageNotifications(
  handler: (event: CrossPageNotificationEvent) => void,
  filter?: (event: CrossPageNotificationEvent) => boolean,
): () => void {
  return crossPageNotificationBus.subscribe('notification', (event) => {
    if (filter && !filter(event)) return
    handler(event)
  })
}

export function attachCrossPageNotificationBroadcastBridge(input: {
  channelName?: string
  createChannel?: (name: string) => CrossPageNotificationBroadcastChannel
} = {}): () => void {
  const createChannel = input.createChannel ?? defaultBroadcastChannelFactory()
  if (!createChannel) return () => {}
  const channel = createChannel(input.channelName ?? CROSS_PAGE_NOTIFICATION_CHANNEL_NAME)
  const inboundEventIds = new Set<string>()
  channel.onmessage = (message) => {
    const event = crossPageNotificationEventFromBroadcastMessage(message.data)
    if (!event) return
    inboundEventIds.add(event.id)
    publishCrossPageNotification(event)
  }
  const unsubscribe = subscribeCrossPageNotifications((event) => {
    if (inboundEventIds.delete(event.id)) return
    channel.postMessage({
      senderId: crossPageNotificationInstanceId,
      event,
    } satisfies CrossPageNotificationBroadcastMessage)
  })
  return () => {
    unsubscribe()
    channel.onmessage = null
    channel.close()
  }
}

export function crossPageNotificationMatchesScope(
  event: CrossPageNotificationEvent,
  scope: CrossPageNotificationScope,
): boolean {
  if (scope.kind === 'global') return event.scope.kind === 'global'
  return event.scope.kind === scope.kind && event.scope.id === scope.id
}

export function agentChatNotificationFromCrossPageEvent(
  event: CrossPageNotificationEvent,
): AgentChatNotification | undefined {
  if (event.topic !== 'agent-chat' && event.topic !== 'mcp-status' && event.topic !== 'capability') return undefined
  const payload = event.payload as Partial<AgentChatCrossPageNotificationPayload> | undefined
  return payload?.notification
}

export function crossPageEventFromAgentChatNotification(input: {
  notification: AgentChatNotification
  provider?: AgentChatProviderKind
  transport: CrossPageNotificationTransport
  source: string
  emittedAt?: string
}): CrossPageNotificationEvent {
  const scope = scopeFromNotification(input.notification)
  return {
    id: stableCrossPageNotificationId({
      source: input.source,
      transport: input.transport,
      method: input.notification.method,
      scope,
      params: input.notification.params,
    }),
    topic: topicFromNotification(input.notification),
    scope,
    transport: input.transport,
    source: input.source,
    emittedAt: input.emittedAt ?? new Date().toISOString(),
    payload: {
      ...(input.provider ? { provider: input.provider } : {}),
      notification: input.notification,
    },
    raw: input.notification.raw ?? input.notification,
  }
}

export function resetCrossPageNotificationDedupeForTests(): void {
  recentNotificationIds.clear()
  recentNotificationIdOrder.length = 0
}

function wasCrossPageNotificationSeen(id: string): boolean {
  if (recentNotificationIds.has(id)) return true
  recentNotificationIds.add(id)
  recentNotificationIdOrder.push(id)
  while (recentNotificationIdOrder.length > RECENT_NOTIFICATION_ID_LIMIT) {
    const expired = recentNotificationIdOrder.shift()
    if (expired) recentNotificationIds.delete(expired)
  }
  return false
}

function defaultBroadcastChannelFactory(): ((name: string) => CrossPageNotificationBroadcastChannel) | undefined {
  if (typeof BroadcastChannel === 'undefined') return undefined
  return (name) => new BroadcastChannel(name)
}

function crossPageNotificationEventFromBroadcastMessage(message: unknown): CrossPageNotificationEvent | undefined {
  if (!message || typeof message !== 'object' || Array.isArray(message)) return undefined
  const record = message as Partial<CrossPageNotificationBroadcastMessage>
  if (record.senderId === crossPageNotificationInstanceId) return undefined
  return isCrossPageNotificationEvent(record.event) ? record.event : undefined
}

function isCrossPageNotificationEvent(value: unknown): value is CrossPageNotificationEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Partial<CrossPageNotificationEvent>
  return typeof record.id === 'string'
    && typeof record.topic === 'string'
    && Boolean(record.scope && typeof record.scope === 'object')
    && typeof record.transport === 'string'
    && typeof record.source === 'string'
    && typeof record.emittedAt === 'string'
}

function topicFromNotification(notification: AgentChatNotification): CrossPageNotificationTopic {
  if (notification.event?.type === 'mcpStatus' || notification.method.startsWith('mcpServer/')) return 'mcp-status'
  return 'agent-chat'
}

function scopeFromNotification(notification: AgentChatNotification): CrossPageNotificationScope {
  const threadId = threadIdFromNotification(notification)
  if (threadId) return { kind: 'thread', id: threadId }
  return { kind: 'global' }
}

function threadIdFromNotification(notification: AgentChatNotification): string | undefined {
  const eventThreadId = eventThreadIdFromNotification(notification.event)
  if (eventThreadId) return eventThreadId
  return threadIdFromParams(notification.params)
}

function eventThreadIdFromNotification(event: AgentChatNotification['event']): string | undefined {
  if (!event) return undefined
  if ('threadId' in event && typeof event.threadId === 'string' && event.threadId.trim()) return event.threadId.trim()
  return undefined
}

function threadIdFromParams(params: unknown): string | undefined {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return undefined
  const record = params as Record<string, unknown>
  const value = stringValue(record.threadId) ?? stringValue(record.thread_id)
  if (value) return value
  const thread = record.thread
  if (!thread || typeof thread !== 'object' || Array.isArray(thread)) return undefined
  return stringValue((thread as Record<string, unknown>).id)
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function stableCrossPageNotificationId(input: {
  source: string
  transport: CrossPageNotificationTransport
  method: string
  scope: CrossPageNotificationScope
  params?: unknown
}): string {
  const params = input.params && typeof input.params === 'object' && !Array.isArray(input.params)
    ? input.params as Record<string, unknown>
    : {}
  const explicitId = stringValue(params.notificationId)
    ?? stringValue(params.eventId)
    ?? stringValue(params.itemId)
    ?? stringValue(params.requestId)
    ?? stringValue(params.turnId)
  return [
    input.transport,
    input.source,
    input.method,
    input.scope.kind,
    input.scope.id ?? 'global',
    explicitId ?? stableJson(input.params),
  ].join(':')
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJsonValue(value))
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue)
  if (!value || typeof value !== 'object') return value
  return Object.keys(value as Record<string, unknown>).sort().reduce<Record<string, unknown>>((result, key) => {
    result[key] = sortJsonValue((value as Record<string, unknown>)[key])
    return result
  }, {})
}
