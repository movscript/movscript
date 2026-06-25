import type { AgentChatNotification } from '@movscript/agent-chat'

export interface AgentChatThreadTitleNotificationUpdate {
  threadId: string
  title: string
}

export function agentChatThreadTitleUpdateFromNotification(
  notification: AgentChatNotification,
): AgentChatThreadTitleNotificationUpdate | null {
  const params = recordValue(notification.params)
  if (!params) return null
  if (notification.method === 'thread/name/updated') return threadTitleUpdateFromParams(params)
  if (notification.method === 'thread/metadata/updated') {
    if (!Object.prototype.hasOwnProperty.call(params, 'threadName') && !Object.prototype.hasOwnProperty.call(params, 'name')) return null
    return threadTitleUpdateFromParams(params)
  }
  return null
}

function threadTitleUpdateFromParams(params: Record<string, unknown>): AgentChatThreadTitleNotificationUpdate | null {
  const threadId = stringValue(params.threadId)
  const title = stringValue(Object.prototype.hasOwnProperty.call(params, 'threadName') ? params.threadName : params.name)
  if (!threadId || !title) return null
  return { threadId, title }
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
