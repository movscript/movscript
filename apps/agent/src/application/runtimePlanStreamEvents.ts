import {
  isTerminalPlanStatus,
} from '../state/subagentRunView.js'
import {
  toStreamRun,
} from '../state/runStreamView.js'
import type {
  AgentTaskGraphSnapshot,
  AgentTaskGraphStreamEvent,
  AgentRun,
  AgentInternalRunSignal,
  AgentTask,
} from '../state/types.js'

export function replayRuntimePlanStream(input: {
  taskGraphId: string
  getTaskGraphSnapshot: (taskGraphId: string) => AgentTaskGraphSnapshot
  listener: (event: AgentTaskGraphStreamEvent) => void
}): void {
  const snapshot = input.getTaskGraphSnapshot(input.taskGraphId)
  input.listener({ type: 'snapshot', snapshot })
  if (isTerminalPlanStatus(snapshot.taskGraph.status)) input.listener({ type: 'done', snapshot })
}

export function emitRuntimePlanRunStreamEvent(input: {
  event: AgentInternalRunSignal
  getRun: (runId: string) => AgentRun | undefined
  hasPlanSubscribers: (taskGraphId: string) => boolean
  getTaskGraphSnapshot: (taskGraphId: string) => AgentTaskGraphSnapshot
  emitPlanStreamEvent: (taskGraphId: string, event: AgentTaskGraphStreamEvent) => void
}): void {
  const run = input.event.type === 'run' || input.event.type === 'done'
    ? input.event.run
    : 'run' in input.event && input.event.run
      ? input.event.run
      : input.event.type === 'trace' || input.event.type === 'assistant_progress' || input.event.type === 'assistant_message' || input.event.type === 'thread_title'
        ? input.getRun(input.event.runId)
        : undefined
  if (!run?.taskGraphId) return
  const taskGraphId = run.taskGraphId
  if (!input.hasPlanSubscribers(taskGraphId)) return
  if (input.event.type === 'trace') {
    input.emitPlanStreamEvent(taskGraphId, {
      type: 'trace',
      taskGraphId,
      runId: input.event.runId,
      event: input.event.event,
      snapshot: input.getTaskGraphSnapshot(taskGraphId),
    })
    return
  }
  if (input.event.type === 'run' || input.event.type === 'done') {
    input.emitPlanStreamEvent(taskGraphId, {
      type: 'run',
      taskGraphId,
      run: toStreamRun(run),
      snapshot: input.getTaskGraphSnapshot(taskGraphId),
    })
  }
}

export function emitRuntimeTaskGraphTaskStreamEvent(input: {
  taskGraphId: string
  task: AgentTask
  hasPlanSubscribers: (taskGraphId: string) => boolean
  getTaskGraphSnapshot: (taskGraphId: string) => AgentTaskGraphSnapshot
  emitPlanStreamEvent: (taskGraphId: string, event: AgentTaskGraphStreamEvent) => void
}): void {
  if (!input.hasPlanSubscribers(input.taskGraphId)) return
  input.emitPlanStreamEvent(input.taskGraphId, {
    type: 'task',
    taskGraphId: input.taskGraphId,
    task: input.task,
    snapshot: input.getTaskGraphSnapshot(input.taskGraphId),
  })
}

export function emitRuntimePlanStreamEvent(input: {
  taskGraphId: string
  event: AgentTaskGraphStreamEvent
  emit: (taskGraphId: string, event: AgentTaskGraphStreamEvent) => boolean
  close: (taskGraphId: string) => void
}): void {
  if (!input.emit(input.taskGraphId, input.event)) return
  if (input.event.type === 'done' || isTerminalPlanStatus(input.event.snapshot.taskGraph.status)) {
    const snapshot = input.event.snapshot
    input.emit(input.taskGraphId, { type: 'done', snapshot })
    input.close(input.taskGraphId)
  }
}
