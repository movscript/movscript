import {
  agentChatNotificationFromCrossPageEvent,
  type CrossPageNotificationEvent,
} from '@/shared/application/crossPageNotifications'
import type { AgentChatNotification, AgentChatRuntimeAction } from '@movscript/core/agent/chat'
import type { Dispatch, MutableRefObject } from 'react'

export interface AgentChatCrossPageNotificationProjectionInput {
  event: CrossPageNotificationEvent
  activeThreadId: string | null
  dispatchRuntime: Dispatch<AgentChatRuntimeAction>
  nextRecentEventSequence: () => number
  seenKeysRef: MutableRefObject<Set<string>>
}

const SEEN_PROJECTION_KEY_LIMIT = 500

export function projectAgentChatCrossPageNotification({
  event,
  activeThreadId,
  dispatchRuntime,
  nextRecentEventSequence,
  seenKeysRef,
}: AgentChatCrossPageNotificationProjectionInput): boolean {
  const notification = agentChatNotificationFromCrossPageEvent(event)
  if (!notification) return false
  if (!shouldProjectAgentChatCrossPageNotification(event, activeThreadId)) return false
  const key = agentChatNotificationProjectionKey(notification)
  if (seenKeysRef.current.has(key)) return false
  rememberProjectionKey(seenKeysRef.current, key)
  dispatchRuntime({
    type: 'applyNotification',
    notification,
    nowMs: Date.now(),
    recentEventSequence: nextRecentEventSequence(),
  })
  return true
}

export function markAgentChatNotificationProjected(
  seenKeysRef: MutableRefObject<Set<string>>,
  notification: AgentChatNotification,
): void {
  rememberProjectionKey(seenKeysRef.current, agentChatNotificationProjectionKey(notification))
}

export function shouldProjectAgentChatCrossPageNotification(
  event: CrossPageNotificationEvent,
  activeThreadId: string | null,
): boolean {
  if (event.scope.kind === 'global') return true
  if (event.scope.kind !== 'thread') return false
  return Boolean(activeThreadId && event.scope.id === activeThreadId)
}

export function agentChatNotificationProjectionKey(notification: AgentChatNotification): string {
  const params = notification.params && typeof notification.params === 'object' && !Array.isArray(notification.params)
    ? notification.params as Record<string, unknown>
    : {}
  const stableId = stringValue(params.notificationId)
    ?? stringValue(params.eventId)
    ?? stringValue(params.itemId)
    ?? stringValue(params.requestId)
    ?? stringValue(params.turnId)
    ?? stableJson(notification.params)
  return `${notification.method}:${stableId}`
}

function rememberProjectionKey(keys: Set<string>, key: string): void {
  if (keys.has(key)) return
  keys.add(key)
  if (keys.size <= SEEN_PROJECTION_KEY_LIMIT) return
  const first = keys.values().next().value
  if (first) keys.delete(first)
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
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
