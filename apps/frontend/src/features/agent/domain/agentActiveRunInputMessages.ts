import type { ChatMessage } from '@/features/agent/state/agentStore'
import { providerSessionInputRef, providerSessionMessageRef } from '@/features/agent/domain/providerSessionMessageRefs'

export interface AgentPendingActiveRunInputQueueItem {
  id: string
  runId?: string
  content: string
  timestamp: number
}

export function buildPendingActiveRunInputQueueItems(messages: ChatMessage[]): AgentPendingActiveRunInputQueueItem[] {
  return messages
    .filter(activeRunInputIsWaitingForDelivery)
    .map((message) => {
      const providerSessionInput = providerSessionInputRef(message)
      return {
        id: message.id,
        ...(providerSessionInput?.runId?.trim() ? { runId: providerSessionInput.runId.trim() } : {}),
        content: message.content,
        timestamp: message.timestamp,
      }
    })
}

export function activeRunInputDisplayDeliveryStatus(message: Pick<ChatMessage, 'meta'>): NonNullable<NonNullable<ChatMessage['meta']>['providerSessionInput']>['deliveryStatus'] | undefined {
  const providerSessionInput = providerSessionInputRef(message)
  if (!providerSessionInput) return undefined
  const providerSessionMessage = providerSessionMessageRef(message)
  if (
    providerSessionInput.deliveryStatus === 'pending'
    && (providerSessionInput.messageId?.trim() || providerSessionMessage?.messageId?.trim())
  ) {
    return 'accepted'
  }
  return providerSessionInput.deliveryStatus
}

export function activeRunInputIsWaitingForDelivery(message: ChatMessage): boolean {
  const providerSessionMessage = providerSessionMessageRef(message)
  return message.role === 'user'
    && activeRunInputDisplayDeliveryStatus(message) === 'pending'
    && !providerSessionMessage?.messageId
}
