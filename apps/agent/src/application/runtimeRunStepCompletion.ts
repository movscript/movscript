import { completeRunStep } from '../state/runTrace.js'
import type { AgentStore } from '../state/store.js'
import type { AgentRun, JSONValue } from '../state/types.js'
import { durationBetweenMs } from './runLifecycleControl.js'

export function completeRuntimeRunStep(input: {
  store: Pick<AgentStore, 'updateRun'>
  run: AgentRun
  stepId: string
  result?: JSONValue
  error?: string
  sandboxed?: boolean
  completedAt: string
  emitRunSnapshot: (run: AgentRun) => void
}): boolean {
  const step = input.run.steps.find((item) => item.id === input.stepId)
  if (!step) return false
  completeRunStep(step, {
    completedAt: input.completedAt,
    status: input.error ? 'failed' : 'completed',
    ...(input.result !== undefined ? { result: input.result } : {}),
    ...(input.error ? { error: input.error } : {}),
    ...(input.sandboxed ? { sandboxed: input.sandboxed } : {}),
    durationMs: durationBetweenMs(step.createdAt, input.completedAt),
  })
  input.run.updatedAt = input.completedAt
  input.store.updateRun(input.run)
  input.emitRunSnapshot(input.run)
  return true
}
