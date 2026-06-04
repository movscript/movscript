import type { ChatMessage } from '@/features/agent/state/agentStore'

export interface AgentPendingRuntimeInputQueueItem {
  id: string
  runId?: string
  content: string
  timestamp: number
}

export function buildPendingRuntimeInputQueueItems(messages: ChatMessage[]): AgentPendingRuntimeInputQueueItem[] {
  return messages
    .filter(runtimeInputIsWaitingForDelivery)
    .map((message) => ({
      id: message.id,
      ...(message.meta?.runtimeInput?.runId?.trim() ? { runId: message.meta.runtimeInput.runId.trim() } : {}),
      content: message.content,
      timestamp: message.timestamp,
    }))
}

export function runtimeInputDisplayDeliveryStatus(message: Pick<ChatMessage, 'meta'>): NonNullable<NonNullable<ChatMessage['meta']>['runtimeInput']>['deliveryStatus'] | undefined {
  const runtimeInput = message.meta?.runtimeInput
  if (!runtimeInput) return undefined
  if (
    runtimeInput.deliveryStatus === 'pending'
    && (runtimeInput.messageId?.trim() || message.meta?.runtimeMessage?.messageId?.trim())
  ) {
    return 'accepted'
  }
  return runtimeInput.deliveryStatus
}

export function runtimeInputIsWaitingForDelivery(message: ChatMessage): boolean {
  return message.role === 'user'
    && runtimeInputDisplayDeliveryStatus(message) === 'pending'
    && !message.meta?.runtimeMessage?.messageId
}
