import type { AgentTask, AgentTraceEvent } from './types.js'

export interface AgentTaskProtocolEvent {
  eventType: string
  title: string
  status: AgentTraceEvent['status']
}

export function taskStatusProtocolEvent(task: AgentTask): AgentTaskProtocolEvent {
  const status = task.status
  if (status === 'running') return { eventType: 'task_started', title: 'Task started', status: 'started' }
  if (status === 'blocked') {
    const blockedKind = isRecord(task.metadata) && task.metadata.blockedKind === 'needs_input' ? 'needs_input' : 'blocked'
    return {
      eventType: blockedKind,
      title: blockedKind === 'needs_input' ? 'Task needs input' : 'Task blocked',
      status: 'blocked',
    }
  }
  if (status === 'needs_review') return { eventType: 'needs_review', title: 'Task needs review', status: 'blocked' }
  if (status === 'done') return { eventType: 'task_completed', title: 'Task completed', status: 'completed' }
  if (status === 'failed') return { eventType: 'task_failed', title: 'Task failed', status: 'failed' }
  if (status === 'cancelled') return { eventType: 'task_cancelled', title: 'Task cancelled', status: 'failed' }
  return { eventType: 'task_pending', title: 'Task pending', status: 'info' }
}

export function snapshotTaskForProtocolEvent(task: AgentTask): AgentTask {
  return {
    ...task,
    deps: [...task.deps],
    artifacts: [...task.artifacts],
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
