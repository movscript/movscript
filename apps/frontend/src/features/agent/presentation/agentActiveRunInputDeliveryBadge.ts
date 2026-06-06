import { activeRunInputDisplayDeliveryStatus } from '@/features/agent/domain/agentActiveRunInputMessages'
import { providerSessionInputRef } from '@/features/agent/domain/providerSessionMessageRefs'
import type { ChatMessage } from '@/features/agent/state/agentStore'

export interface AgentActiveRunInputDeliveryBadge {
  status: NonNullable<NonNullable<ChatMessage['meta']>['providerSessionInput']>['deliveryStatus']
  label: string
  tone: 'danger' | 'neutral'
  title?: string
  icon: 'spinner' | 'error' | null
}

export function activeRunInputDeliveryBadge(message: Pick<ChatMessage, 'meta'>): AgentActiveRunInputDeliveryBadge | null {
  const status = activeRunInputDisplayDeliveryStatus(message)
  if (!status) return null
  const title = providerSessionInputRef(message)?.error
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
