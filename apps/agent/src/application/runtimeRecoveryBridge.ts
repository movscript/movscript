import type { AgentStore } from '../state/store.js'
import type { AgentRun } from '../state/types.js'
import {
  reconcileRuntimeThreads,
  resumeInterruptedRuntimeRun,
  type RuntimeThreadRecoveryReport,
  type RuntimeThreadRecoveryTraceInput,
} from './runtimeThreadRecovery.js'
import type { RuntimeRunExecutionSchedulerBridge } from './runtimeRunExecutionSchedulerBridge.js'
import type { RuntimeStreamBridge } from './runtimeStreamBridge.js'
import { isoNow } from './runtimeIdentity.js'

export interface RuntimeRecoveryBridge {
  reconcileRuntimeThreads: () => RuntimeThreadRecoveryReport
  resumeInterruptedRun: (runId: string) => AgentRun
}

export function createRuntimeRecoveryBridge(input: {
  store: AgentStore
  streams: RuntimeStreamBridge
  runExecutionScheduler: RuntimeRunExecutionSchedulerBridge
}): RuntimeRecoveryBridge {
  return {
    reconcileRuntimeThreads: () => reconcileRuntimeThreads({
      store: input.store,
      now: isoNow(),
      recordTrace: (run, trace) => input.streams.recordTraceEvent(run, trace as RuntimeThreadRecoveryTraceInput),
      emitRunSnapshot: (run, options) => input.streams.emitRunSnapshot(run, options),
      startRunExecution: (runId) => input.runExecutionScheduler.startRunExecution(runId),
    }),
    resumeInterruptedRun: (runId) => resumeInterruptedRuntimeRun({
      store: input.store,
      runId,
      now: isoNow(),
      recordTrace: (run, trace) => input.streams.recordTraceEvent(run, trace as RuntimeThreadRecoveryTraceInput),
      emitRunSnapshot: (run, options) => input.streams.emitRunSnapshot(run, options),
      startRunExecution: (targetRunId) => input.runExecutionScheduler.startRunExecution(targetRunId),
    }),
  }
}
