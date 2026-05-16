import type { AgentStore } from '../state/store.js'
import type { AgentRun, AgentRunStep } from '../state/types.js'
import type { AgentRunRoundInfo } from '../state/runRound.js'
import {
  applyRuntimeRunCancellationFlow,
  type RuntimeRunCancellationTraceInput,
} from './runtimeRunCancellation.js'

export interface RuntimeRunCancellationBridge {
  markRunCancelled: (run: AgentRun, reason?: string) => AgentRun
}

export function createRuntimeRunCancellationBridge(input: {
  store: Pick<AgentStore, 'getRun' | 'getThread' | 'updateRun' | 'updateThread'>
  messageId: () => string
  now: () => string
  recordTrace: (run: AgentRun, trace: RuntimeRunCancellationTraceInput) => void
  createStep: (run: AgentRun, type: AgentRunStep['type'], round?: AgentRunRoundInfo, toolName?: string) => AgentRunStep
  emitRunSnapshot: (run: AgentRun, options: { done?: boolean }) => void
}): RuntimeRunCancellationBridge {
  return {
    markRunCancelled: (run, reason) => applyRuntimeRunCancellationFlow({
      store: input.store,
      runId: run.id,
      reason,
      messageId: input.messageId(),
      now: input.now(),
      projectionNow: input.now(),
      abortRun: () => {},
      recordTrace: input.recordTrace,
      createStep: input.createStep,
      emitRunSnapshot: input.emitRunSnapshot,
    }),
  }
}
