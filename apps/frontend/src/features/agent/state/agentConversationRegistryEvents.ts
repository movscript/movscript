import { createEventBus } from '@/shared/application/eventBus'
import type { PersistedAgentSessionStore } from '@/features/agent/state/agentSessionStoreTypes'

export type AgentConversationRegistryEventKind =
  | 'conversation-upserted'
  | 'conversation-open-changed'
  | 'conversation-removed'
  | 'active-conversation-changed'
  | 'conversation-deck-order-changed'
  | 'conversation-title-changed'
  | 'provider-session-conversation-created'

export interface AgentConversationRegistryEvent {
  id: string
  kind: AgentConversationRegistryEventKind
  userId?: string
  conversationId?: string | null
  conversationIds?: string[]
  providerThreadId?: string
  open?: boolean
  title?: string
  activeConversationId?: string | null
  timestamp: number
  sourceId: string
  delivery?: 'local' | 'cross-window'
  snapshot?: PersistedAgentSessionStore
}

type AgentConversationRegistryEventMap = {
  changed: AgentConversationRegistryEvent
}

const agentConversationRegistryEventBus = createEventBus<AgentConversationRegistryEventMap>()
const AGENT_CONVERSATION_REGISTRY_CHANNEL_NAME = 'movscript:agent-conversation-registry:v1'
const agentConversationRegistrySourceId = `agent-registry-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`
const recentAgentConversationRegistryEventIds = new Set<string>()
const recentAgentConversationRegistryEventIdOrder: string[] = []
const RECENT_AGENT_CONVERSATION_REGISTRY_EVENT_ID_LIMIT = 500

interface AgentConversationRegistryBroadcastChannel {
  postMessage(message: unknown): void
  close(): void
  onmessage: ((event: MessageEvent<unknown>) => void) | null
}

interface AgentConversationRegistryBroadcastMessage {
  sourceId: string
  event: AgentConversationRegistryEvent
}

export function publishAgentConversationRegistryEvent(
  event: Omit<AgentConversationRegistryEvent, 'id' | 'sourceId' | 'timestamp'> & {
    id?: string
    sourceId?: string
    timestamp?: number
  },
): void {
  publishNormalizedAgentConversationRegistryEvent(normalizeAgentConversationRegistryEvent(event))
}

export function subscribeAgentConversationRegistryEvents(
  handler: (event: AgentConversationRegistryEvent) => void,
): () => void {
  return agentConversationRegistryEventBus.subscribe('changed', handler)
}

export function attachAgentConversationRegistryBroadcastBridge(input: {
  channelName?: string
  createChannel?: (name: string) => AgentConversationRegistryBroadcastChannel
} = {}): () => void {
  const createChannel = input.createChannel ?? defaultBroadcastChannelFactory()
  if (!createChannel) return () => {}
  const channel = createChannel(input.channelName ?? AGENT_CONVERSATION_REGISTRY_CHANNEL_NAME)
  channel.onmessage = (message) => {
    const event = agentConversationRegistryEventFromBroadcastMessage(message.data)
    if (!event) return
    publishNormalizedAgentConversationRegistryEvent({
      ...event,
      delivery: 'cross-window',
    })
  }
  const unsubscribe = subscribeAgentConversationRegistryEvents((event) => {
    if (event.delivery === 'cross-window') return
    channel.postMessage({
      sourceId: agentConversationRegistrySourceId,
      event,
    } satisfies AgentConversationRegistryBroadcastMessage)
  })
  return () => {
    unsubscribe()
    channel.onmessage = null
    channel.close()
  }
}

function normalizeAgentConversationRegistryEvent(
  event: Omit<AgentConversationRegistryEvent, 'id' | 'sourceId' | 'timestamp'> & {
    id?: string
    sourceId?: string
    timestamp?: number
  },
): AgentConversationRegistryEvent {
  const timestamp = event.timestamp ?? Date.now()
  return {
    ...event,
    id: event.id ?? `agent-registry:${event.kind}:${event.conversationId ?? event.conversationIds?.join(',') ?? 'global'}:${timestamp}:${Math.random().toString(36).slice(2)}`,
    sourceId: event.sourceId ?? agentConversationRegistrySourceId,
    timestamp,
    delivery: event.delivery ?? 'local',
  }
}

function publishNormalizedAgentConversationRegistryEvent(event: AgentConversationRegistryEvent): void {
  if (wasAgentConversationRegistryEventSeen(event.id)) return
  agentConversationRegistryEventBus.publish('changed', event)
}

function agentConversationRegistryEventFromBroadcastMessage(message: unknown): AgentConversationRegistryEvent | undefined {
  if (!message || typeof message !== 'object' || Array.isArray(message)) return undefined
  const record = message as Partial<AgentConversationRegistryBroadcastMessage>
  if (record.sourceId === agentConversationRegistrySourceId) return undefined
  return isAgentConversationRegistryEvent(record.event) ? record.event : undefined
}

function isAgentConversationRegistryEvent(value: unknown): value is AgentConversationRegistryEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Partial<AgentConversationRegistryEvent>
  return typeof record.id === 'string'
    && typeof record.kind === 'string'
    && typeof record.sourceId === 'string'
    && typeof record.timestamp === 'number'
}

function defaultBroadcastChannelFactory(): ((name: string) => AgentConversationRegistryBroadcastChannel) | undefined {
  if (typeof BroadcastChannel === 'undefined') return undefined
  return (name) => new BroadcastChannel(name)
}

function wasAgentConversationRegistryEventSeen(id: string): boolean {
  if (recentAgentConversationRegistryEventIds.has(id)) return true
  recentAgentConversationRegistryEventIds.add(id)
  recentAgentConversationRegistryEventIdOrder.push(id)
  while (recentAgentConversationRegistryEventIdOrder.length > RECENT_AGENT_CONVERSATION_REGISTRY_EVENT_ID_LIMIT) {
    const expired = recentAgentConversationRegistryEventIdOrder.shift()
    if (expired) recentAgentConversationRegistryEventIds.delete(expired)
  }
  return false
}
