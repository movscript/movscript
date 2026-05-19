import type { ChatRunActivityEvent } from '@/store/agentStore'
import type { DebugHttpRequest } from './agentSendDraft'
import type { AgentThreadResolution } from './localAgentClient'

export function debugHttpRequestEvents(requests: DebugHttpRequest[], startedAt = new Date().toISOString()): ChatRunActivityEvent[] {
  return requests.map((request) => ({
    id: `http-request-${request.id}`,
    kind: 'model_call',
    title: `${request.method} ${request.label}`,
    summary: request.url,
    status: 'info',
    data: {
      httpRequest: {
        method: request.method,
        url: request.url,
        ...(request.headers ? { headers: request.headers } : {}),
        ...(request.body !== undefined ? { body: request.body } : {}),
        ...(request.note ? { note: request.note } : {}),
      },
    },
    createdAt: startedAt,
  }))
}

export function setActivityEventStatus(
  events: ChatRunActivityEvent[],
  id: string,
  status: ChatRunActivityEvent['status'],
  completedAt?: string,
): ChatRunActivityEvent[] {
  return events.map((item) => (
    item.id === id
      ? {
        ...item,
        status,
        ...(completedAt ? { completedAt } : {}),
      }
      : item
  ))
}

export function upsertActivityEvent(events: ChatRunActivityEvent[], item: ChatRunActivityEvent): ChatRunActivityEvent[] {
  const existingIndex = events.findIndex((candidate) => candidate.id === item.id)
  if (existingIndex >= 0) {
    return events.map((candidate, index) => index === existingIndex
      ? {
        ...candidate,
        ...item,
        data: item.data ?? candidate.data,
      }
      : candidate)
  }
  const setupItems = [...events.filter((candidate) => candidate.id.startsWith('local-runtime-')), item]
  const httpItems = events.filter((candidate) => candidate.id.startsWith('http-request-'))
  const runtimeItems = events.filter((candidate) => !candidate.id.startsWith('local-runtime-') && !candidate.id.startsWith('http-request-'))
  return [...setupItems, ...httpItems, ...runtimeItems]
}

export function threadResolutionActivityEvent(resolution: AgentThreadResolution | undefined, createdAt = new Date().toISOString()): ChatRunActivityEvent | null {
  if (!resolution) return null
  if (resolution.missingRequestedThread && resolution.requestedThreadId) {
    return {
      id: `local-thread-resolution-${resolution.threadId}`,
      kind: 'runtime',
      title: '本地线程不存在，已创建新线程',
      summary: `${resolution.requestedThreadId} -> ${resolution.threadId}`,
      status: 'info',
      data: {
        requestedThreadId: resolution.requestedThreadId,
        threadId: resolution.threadId,
        missingRequestedThread: true,
      },
      createdAt,
    }
  }
  if (resolution.reusedExistingThread && resolution.requestedThreadId) {
    return {
      id: `local-thread-resolution-${resolution.threadId}`,
      kind: 'runtime',
      title: '已延续本地线程',
      summary: resolution.threadId,
      status: 'completed',
      data: {
        requestedThreadId: resolution.requestedThreadId,
        threadId: resolution.threadId,
        reusedExistingThread: true,
      },
      createdAt,
    }
  }
  if (resolution.createdNewThread) {
    return {
      id: `local-thread-resolution-${resolution.threadId}`,
      kind: 'runtime',
      title: '已创建本地线程',
      summary: resolution.threadId,
      status: 'completed',
      data: {
        threadId: resolution.threadId,
        createdNewThread: true,
      },
      createdAt,
    }
  }
  return null
}
