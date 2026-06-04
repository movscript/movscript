import { runtimeInputDisplayDeliveryStatus } from '@/features/agent/domain/agentRuntimeInputMessages'
import type { ChatMessage } from '@/features/agent/state/agentStore'

export interface AgentRuntimeInputDeliveryBadge {
  status: NonNullable<NonNullable<ChatMessage['meta']>['runtimeInput']>['deliveryStatus']
  label: string
  tone: 'danger' | 'neutral'
  title?: string
  icon: 'spinner' | 'error' | null
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
