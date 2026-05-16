import {
  isTerminalPlanStatus,
} from '../state/subagentRunView.js'
import {
  toStreamRun,
} from '../state/runStreamView.js'
import type {
  AgentPlanSnapshot,
  AgentPlanStreamEvent,
  AgentRun,
  AgentRunStreamEvent,
  AgentTask,
} from '../state/types.js'

export function replayRuntimePlanStream(input: {
  planId: string
  getPlanSnapshot: (planId: string) => AgentPlanSnapshot
  listener: (event: AgentPlanStreamEvent) => void
}): void {
  const snapshot = input.getPlanSnapshot(input.planId)
  input.listener({ type: 'snapshot', snapshot })
  if (isTerminalPlanStatus(snapshot.plan.status)) input.listener({ type: 'done', snapshot })
}

export function emitRuntimePlanRunStreamEvent(input: {
  event: AgentRunStreamEvent
  getRun: (runId: string) => AgentRun | undefined
  hasPlanSubscribers: (planId: string) => boolean
  getPlanSnapshot: (planId: string) => AgentPlanSnapshot
  emitPlanStreamEvent: (planId: string, event: AgentPlanStreamEvent) => void
}): void {
  const run = input.event.type === 'run' || input.event.type === 'done'
    ? input.event.run
    : 'run' in input.event && input.event.run
      ? input.event.run
      : input.event.type === 'trace' || input.event.type === 'assistant_delta' || input.event.type === 'assistant_message' || input.event.type === 'thread_title'
        ? input.getRun(input.event.runId)
        : undefined
  if (!run?.planId) return
  const planId = run.planId
  if (!input.hasPlanSubscribers(planId)) return
  if (input.event.type === 'trace') {
    input.emitPlanStreamEvent(planId, {
      type: 'trace',
      planId,
      runId: input.event.runId,
      event: input.event.event,
      snapshot: input.getPlanSnapshot(planId),
    })
    return
  }
  if (input.event.type === 'run' || input.event.type === 'done') {
    input.emitPlanStreamEvent(planId, {
      type: 'run',
      planId,
      run: toStreamRun(run),
      snapshot: input.getPlanSnapshot(planId),
    })
  }
}

export function emitRuntimePlanTaskStreamEvent(input: {
  planId: string
  task: AgentTask
  hasPlanSubscribers: (planId: string) => boolean
  getPlanSnapshot: (planId: string) => AgentPlanSnapshot
  emitPlanStreamEvent: (planId: string, event: AgentPlanStreamEvent) => void
}): void {
  if (!input.hasPlanSubscribers(input.planId)) return
  input.emitPlanStreamEvent(input.planId, {
    type: 'task',
    planId: input.planId,
    task: input.task,
    snapshot: input.getPlanSnapshot(input.planId),
  })
}

export function emitRuntimePlanStreamEvent(input: {
  planId: string
  event: AgentPlanStreamEvent
  emit: (planId: string, event: AgentPlanStreamEvent) => boolean
  close: (planId: string) => void
}): void {
  if (!input.emit(input.planId, input.event)) return
  if (input.event.type === 'done' || isTerminalPlanStatus(input.event.snapshot.plan.status)) {
    const snapshot = input.event.snapshot
    input.emit(input.planId, { type: 'done', snapshot })
    input.close(input.planId)
  }
}
