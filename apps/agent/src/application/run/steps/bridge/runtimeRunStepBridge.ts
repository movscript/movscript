import type { AgentRunRoundInfo } from '../../../../state/run/core/round/runRound.js'
import type { AgentStore } from '../../../../state/store/core/store.js'
import type { AgentRun, AgentRunStep, JSONValue } from '../../../../state/shared/types.js'
import { applyRuntimeRunStepCreationRequest } from '../creation/runtimeRunStepCreation.js'

export interface RuntimeRunStepBridge {
  createStep: (
    run: AgentRun,
    type: AgentRunStep['type'],
    round?: AgentRunRoundInfo,
    toolName?: string,
    args?: Record<string, JSONValue>,
  ) => AgentRunStep
}

export function createRuntimeRunStepBridge(input: {
  store: Pick<AgentStore, 'updateRun'>
  createStepId: () => string
  now: () => string
  emitRunSnapshot: (run: AgentRun) => void
}): RuntimeRunStepBridge {
  return {
    createStep: (run, type, round, toolName, args) => applyRuntimeRunStepCreationRequest({
      store: input.store,
      run,
      type,
      createStepId: input.createStepId,
      now: input.now,
      ...(round ? { round } : {}),
      ...(toolName ? { toolName } : {}),
      ...(args ? { args } : {}),
      emitRunSnapshot: input.emitRunSnapshot,
    }),
  }
}
