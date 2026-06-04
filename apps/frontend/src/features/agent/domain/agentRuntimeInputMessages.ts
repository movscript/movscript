import type { ChatMessage } from '@/features/agent/state/agentStore'

export interface AgentPendingRuntimeInputQueueItem {
  id: string
  runId?: string
  content: string
  timestamp: number
}

export interface AgentRuntimeInputDeliveryBadge {
  status: NonNullable<NonNullable<ChatMessage['meta']>['runtimeInput']>['deliveryStatus']
  label: string
  tone: 'danger' | 'neutral'
  title?: string
  icon: 'spinner' | 'error' | null
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

export function runtimeInputDeliveryBadge(message: Pick<ChatMessage, 'meta'>): AgentRuntimeInputDeliveryBadge | null {
  const status = runtimeInputDisplayDeliveryStatus(message)
  if (!status) return null
  const title = message.meta?.runtimeInput?.error
  if (status === 'pending') {
    return {
      status,
      label: '正在同步到运行中对话',
      tone: 'neutral',
      ...(title ? { title } : {}),
      icon: 'spinner',
    }
  }
  if (status === 'accepted') {
    return {
      status,
      label: '已加入运行中对话',
      tone: 'neutral',
      ...(title ? { title } : {}),
      icon: null,
    }
  }
  if (status === 'consumed') {
    return {
      status,
      label: '已被模型读取',
      tone: 'neutral',
      ...(title ? { title } : {}),
      icon: null,
    }
  }
  return {
    status,
    label: '同步失败',
    tone: 'danger',
    ...(title ? { title } : {}),
    icon: 'error',
  }
}

export function runtimeInputIsWaitingForDelivery(message: ChatMessage): boolean {
  return message.role === 'user'
    && runtimeInputDisplayDeliveryStatus(message) === 'pending'
    && !message.meta?.runtimeMessage?.messageId
}
