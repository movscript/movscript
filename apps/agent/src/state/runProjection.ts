import type { AgentRun, AgentThread } from './types.js'
import { isActiveRunStatus } from './runStatus.js'

export { isActiveRunStatus } from './runStatus.js'

export function threadStatusFromRunStatus(status: AgentRun['status']): AgentThread['status'] {
  if (status === 'queued' || status === 'in_progress') return 'running'
  if (status === 'requires_action') return 'requires_action'
  if (status === 'failed') return 'failed'
  if (status === 'cancelled') return 'cancelled'
  return 'completed'
}

export function projectRunOntoThread(thread: AgentThread, run: AgentRun): void {
  thread.lastRunId = run.id
  thread.lastRunStatus = run.status
  thread.status = threadStatusFromRunStatus(run.status)
  if (isActiveRunStatus(run.status)) thread.activeRunId = run.id
  else if (thread.activeRunId === run.id) delete thread.activeRunId
}

export function projectRunStatusOntoThread(input: {
  thread: AgentThread
  status: AgentRun['status']
  now: string
  runId?: string
}): void {
  const { thread, status, now, runId } = input
  if (runId) {
    thread.lastRunId = runId
    if (isActiveRunStatus(status)) thread.activeRunId = runId
    else if (thread.activeRunId === runId) delete thread.activeRunId
  }
  thread.lastRunStatus = status
  thread.status = threadStatusFromRunStatus(status)
  thread.updatedAt = now
}
