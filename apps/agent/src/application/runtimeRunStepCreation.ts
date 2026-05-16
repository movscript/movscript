import { appendRunStep } from '../state/runTrace.js'
import type { AgentRunRoundInfo } from '../state/runRound.js'
import type { AgentStore } from '../state/store.js'
import type { AgentRun, AgentRunStep } from '../state/types.js'

export function createRuntimeRunStep(input: {
  store: Pick<AgentStore, 'updateRun'>
  run: AgentRun
  stepId: string
  type: AgentRunStep['type']
  createdAt: string
  round?: AgentRunRoundInfo
  toolName?: string
  emitRunSnapshot: (run: AgentRun) => void
}): AgentRunStep {
  const step = appendRunStep({
    id: input.stepId,
    run: input.run,
    runId: input.run.id,
    type: input.type,
    createdAt: input.createdAt,
    ...(input.round ? { round: input.round } : {}),
    ...(input.toolName ? { toolName: input.toolName } : {}),
  })
  input.store.updateRun(input.run)
  input.emitRunSnapshot(input.run)
  return step
}

export function applyRuntimeRunStepCreationRequest(input: {
  store: Pick<AgentStore, 'updateRun'>
  run: AgentRun
  type: AgentRunStep['type']
  createStepId: () => string
  now: () => string
  round?: AgentRunRoundInfo
  toolName?: string
  emitRunSnapshot: (run: AgentRun) => void
}): AgentRunStep {
  return createRuntimeRunStep({
    store: input.store,
    run: input.run,
    stepId: input.createStepId(),
    type: input.type,
    createdAt: input.now(),
    ...(input.round ? { round: input.round } : {}),
    ...(input.toolName ? { toolName: input.toolName } : {}),
    emitRunSnapshot: input.emitRunSnapshot,
  })
}
