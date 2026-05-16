import type { AgentRunRoundInfo } from '../state/runRound.js'
import type { AgentStore } from '../state/store.js'
import type { AgentRun, AgentRunStep } from '../state/types.js'
import { applyRuntimeRunStepCreationRequest } from './runtimeRunStepCreation.js'

export interface RuntimeRunStepBridge {
  createStep: (
    run: AgentRun,
    type: AgentRunStep['type'],
    round?: AgentRunRoundInfo,
    toolName?: string,
  ) => AgentRunStep
}

export function createRuntimeRunStepBridge(input: {
  store: Pick<AgentStore, 'updateRun'>
  createStepId: () => string
  now: () => string
  emitRunSnapshot: (run: AgentRun) => void
}): RuntimeRunStepBridge {
  return {
    createStep: (run, type, round, toolName) => applyRuntimeRunStepCreationRequest({
      store: input.store,
      run,
      type,
      createStepId: input.createStepId,
      now: input.now,
      ...(round ? { round } : {}),
      ...(toolName ? { toolName } : {}),
      emitRunSnapshot: input.emitRunSnapshot,
    }),
  }
}
