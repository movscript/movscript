import type { AgentFeedMessage, AgentMessage, AgentRun } from '@/shared/infrastructure/localAgentClient'

export const AGENT_MESSAGE_FEED_LOCAL_EVENT = 'movscript:agent-message-feed-local'

export function notifyAgentMessageFeedAcceptedSource(message: AgentMessage, run: AgentRun): void {
  if (typeof window === 'undefined') return
  const feedMessage = feedMessageFromAcceptedSource(message, run)
  if (!feedMessage) return
  window.dispatchEvent(new CustomEvent<AgentFeedMessage>(AGENT_MESSAGE_FEED_LOCAL_EVENT, {
    detail: feedMessage,
  }))
}

export function feedMessageFromAcceptedSource(message: AgentMessage, run: AgentRun): AgentFeedMessage | undefined {
  if (message.role !== 'user') return undefined
  if (message.threadId !== run.threadId) return undefined
  const id = `message:${message.id}`
  const createdAt = message.createdAt
  const revision = Math.max(Date.parse(createdAt) || 0, Date.parse(run.updatedAt) || 0)
  return {
    id,
    ...(run.sessionId ? { sessionId: run.sessionId } : {}),
    threadId: message.threadId,
    role: 'user',
    kind: 'text',
    content: message.content,
    status: feedStatusFromRun(run),
    createdAt,
    updatedAt: run.updatedAt || createdAt,
    revision,
    cursor: acceptedSourceFeedCursor(createdAt, id),
    runtimeRefs: {
      ...(run.sessionId ? { sessionId: run.sessionId } : {}),
      threadId: message.threadId,
      messageId: message.id,
      runId: run.id,
    },
  }
}

export function acceptedSourceFeedCursor(createdAt: string, id: string): string {
  return `${Date.parse(createdAt) || 0}:10:${encodeURIComponent(id)}`
}

export function isAcceptedSourceFeedMessage(message: AgentFeedMessage | undefined): message is AgentFeedMessage {
  if (!message) return false
  if (message.role !== 'user' || message.kind !== 'text') return false
  const messageId = message.runtimeRefs?.messageId
  const runId = message.runtimeRefs?.runId
  if (!messageId || !runId) return false
  return message.id === `message:${messageId}`
}

function feedStatusFromRun(run: AgentRun): AgentFeedMessage['status'] {
  if (run.status === 'queued') return 'pending'
  if (run.status === 'in_progress') return 'streaming'
  if (run.status === 'failed') return 'failed'
  if (run.status === 'cancelled') return 'cancelled'
  if (run.status === 'requires_action') return 'requires_action'
  return 'completed'
}
