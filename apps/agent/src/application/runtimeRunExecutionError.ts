import type { AgentStore } from '../state/store.js'
import type {
  AgentMessage,
  AgentRun,
  AgentRunStep,
  AgentTraceEvent,
  AgentTraceEventKind,
} from '../state/types.js'
import type { AgentRunRoundInfo } from '../state/runRound.js'
import { isAbortError } from './runLifecycleControl.js'
import {
  applyRuntimeRunFailure,
} from './runtimeRunFailure.js'

export interface RuntimeRunExecutionErrorTraceInput {
  kind: AgentTraceEventKind
  title: string
  summary?: string
  status: AgentTraceEvent['status']
  round?: AgentRunRoundInfo
  stepId?: string
  data?: unknown
}

export function applyRuntimeRunExecutionError(input: {
  store: Pick<AgentStore, 'getRun' | 'getThread' | 'updateRun' | 'updateThread'>
  run: AgentRun
  error: unknown
  messageId: string
  now: string
  projectionNow: string
  stepCompletedAt: string
  markRunCancelled: (run: AgentRun) => AgentRun
  recordTrace: (run: AgentRun, trace: RuntimeRunExecutionErrorTraceInput) => void
  createStep: (run: AgentRun, type: AgentRunStep['type'], round?: AgentRunRoundInfo, toolName?: string) => AgentRunStep
  emitAssistantMessage: (run: AgentRun, message: AgentMessage) => void
  emitRunSnapshot: (run: AgentRun, options: { done?: boolean }) => void
}): AgentRun {
  const persistedRun = input.store.getRun(input.run.id)
  if (isAbortError(input.error) || persistedRun?.status === 'cancelled') {
    return input.markRunCancelled(persistedRun ?? input.run)
  }
  return applyRuntimeRunFailure({
    store: input.store,
    run: input.run,
    error: input.error,
    messageId: input.messageId,
    now: input.now,
    projectionNow: input.projectionNow,
    stepCompletedAt: input.stepCompletedAt,
    recordTrace: input.recordTrace,
    createStep: input.createStep,
    emitAssistantMessage: input.emitAssistantMessage,
    emitRunSnapshot: input.emitRunSnapshot,
  })
}
