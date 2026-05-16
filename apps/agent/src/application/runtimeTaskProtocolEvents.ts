import { taskStatusProtocolEvent } from '../state/taskProtocolEvent.js'
import type { AgentStore } from '../state/store.js'
import type {
  AgentRun,
  AgentTask,
  AgentTraceEvent,
  AgentTraceEventKind,
} from '../state/types.js'

export interface RuntimeTaskProtocolTraceInput {
  kind: AgentTraceEventKind
  title: string
  summary?: string
  status: AgentTraceEvent['status']
  data?: unknown
}

export function applyRuntimeTaskProtocolEvents(input: {
  store: Pick<AgentStore, 'getRun' | 'getPlan'>
  task: AgentTask
  previous?: AgentTask
  recordTrace: (run: AgentRun, trace: RuntimeTaskProtocolTraceInput) => void
}): AgentRun | undefined {
  const run = resolveRuntimeTaskProtocolRun({ store: input.store, task: input.task })
  if (!run) return undefined
  const baseData = {
    planId: input.task.planId,
    taskId: input.task.id,
    taskStatus: input.task.status,
    progress: input.task.progress,
    ...(input.task.ownerRunId ? { ownerRunId: input.task.ownerRunId } : {}),
    ...(input.task.blockedReason ? { blockedReason: input.task.blockedReason } : {}),
  }
  const emitTaskTrace = (
    eventType: string,
    title: string,
    status: AgentTraceEvent['status'],
    summary?: string,
    data?: Record<string, unknown>,
  ) => {
    input.recordTrace(run, {
      kind: 'task',
      title,
      ...(summary ? { summary } : {}),
      status,
      data: {
        ...baseData,
        eventType,
        ...(data ?? {}),
      },
    })
  }

  if (!input.previous) {
    emitTaskTrace('task_created', 'Task created', 'info', input.task.title)
    return run
  }
  if (input.previous.status !== input.task.status) {
    const event = taskStatusProtocolEvent(input.task)
    emitTaskTrace(event.eventType, event.title, event.status, input.task.blockedReason ?? input.task.title)
  }
  if (input.previous.progress !== input.task.progress) {
    emitTaskTrace('progress_update', 'Task progress updated', 'info', `${Math.round(input.task.progress * 100)}%`, {
      previousProgress: input.previous.progress,
    })
  }
  for (const artifact of input.task.artifacts) {
    if (input.previous.artifacts.some((item) => item.id === artifact.id)) continue
    emitTaskTrace('artifact_created', 'Task artifact created', 'completed', artifact.title ?? artifact.uri ?? artifact.type, {
      artifact,
    })
  }
  return run
}

export function resolveRuntimeTaskProtocolRun(input: {
  store: Pick<AgentStore, 'getRun' | 'getPlan'>
  task: AgentTask
}): AgentRun | undefined {
  if (input.task.ownerRunId) {
    const ownerRun = input.store.getRun(input.task.ownerRunId)
    if (ownerRun) return ownerRun
  }
  const plan = input.store.getPlan(input.task.planId)
  return plan?.rootRunId ? input.store.getRun(plan.rootRunId) : undefined
}
