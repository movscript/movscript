import { agentTimelineStatusFromRunStatus } from '@movscript/protocol'
import type { AgentTimelineItem, AgentMessage, AgentRun } from '@/shared/infrastructure/localAgentClient'

export const AGENT_TIMELINE_LOCAL_EVENT = 'movscript:agent-timeline-local'

export function notifyAgentTimelineAcceptedSource(message: AgentMessage, run: AgentRun): void {
  if (typeof window === 'undefined') return
  const item = timelineItemFromAcceptedSource(message, run)
  if (!item) return
  window.dispatchEvent(new CustomEvent<AgentTimelineItem>(AGENT_TIMELINE_LOCAL_EVENT, {
    detail: item,
  }))
}

export function timelineItemFromAcceptedSource(message: AgentMessage, run: AgentRun): AgentTimelineItem | undefined {
  if (message.role !== 'user') return undefined
  if (message.threadId !== run.threadId) return undefined
  const id = `message:${message.id}`
  const createdAt = message.createdAt
  const revision = Math.max(Date.parse(createdAt) || 0, Date.parse(run.updatedAt) || 0)
  return {
    id,
    ...(run.sessionId ? { sessionId: run.sessionId } : {}),
    threadId: message.threadId,
    origin: 'user',
    purpose: 'transcript',
    surface: 'message_stream',
    contentPromptEligibility: 'include',
    sortRank: 10,
    content: message.content,
    status: agentTimelineStatusFromRunStatus(run.status),
    createdAt,
    updatedAt: run.updatedAt || createdAt,
    revision,
    cursor: acceptedSourceTimelineCursor(createdAt, id),
    runtimeRefs: {
      ...(run.sessionId ? { sessionId: run.sessionId } : {}),
      threadId: message.threadId,
      messageId: message.id,
      runId: run.id,
    },
  }
}

export function acceptedSourceTimelineCursor(createdAt: string, id: string): string {
  return `${Date.parse(createdAt) || 0}:10:${encodeURIComponent(id)}`
}

export function isAcceptedSourceTimelineItem(item: AgentTimelineItem | undefined): item is AgentTimelineItem {
  if (!item) return false
  if (item.origin !== 'user' || item.purpose !== 'transcript' || item.surface !== 'message_stream') return false
  const messageId = item.runtimeRefs?.messageId
  const runId = item.runtimeRefs?.runId
  if (!messageId || !runId) return false
  return item.id === `message:${messageId}`
}
