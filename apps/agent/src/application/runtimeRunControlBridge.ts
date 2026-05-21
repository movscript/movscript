import type { AgentStore } from '../state/store.js'
import type {
  AgentRun,
  AnswerRunInputRequestInput,
  ApproveRunInput,
  CancelRunInput,
  RejectRunInput,
} from '../state/types.js'
import type { RuntimeRunControllerRegistry } from './runLifecycleControl.js'
import { applyRuntimeRunCancellationRequest } from './runtimeRunCancellation.js'
import type { RuntimeRunExecutionSchedulerBridge } from './runtimeRunExecutionSchedulerBridge.js'
import {
  applyRuntimeRunApprovalRequest,
  applyRuntimeRunInputAnswerRequest,
  applyRuntimeRunRejectionRequest,
} from './runtimeRunInteraction.js'
import type { RuntimeRunStepBridge } from './runtimeRunStepBridge.js'
import type { RuntimeStreamBridge } from './runtimeStreamBridge.js'
import type { RuntimeRunAuthRegistry } from './runAuth.js'
import { isoNow, makeId } from './runtimeIdentity.js'
import {
  markInterruptedRuntimeRunRecoveryCancelled,
  resumeInterruptedRuntimeRun,
  runtimeRecoveryActionFromInputAnswer,
} from './runtimeThreadRecovery.js'

export interface RuntimeRunControlBridge {
  approveRun: (runId: string, input?: ApproveRunInput) => AgentRun
  rejectRun: (runId: string, input?: RejectRunInput) => AgentRun
  cancelRun: (runId: string, input?: CancelRunInput) => AgentRun
  answerRunInputRequest: (runId: string, input?: AnswerRunInputRequestInput) => AgentRun
}

export function createRuntimeRunControlBridge(input: {
  store: AgentStore
  controllers: RuntimeRunControllerRegistry
  runAuth: RuntimeRunAuthRegistry
  streams: RuntimeStreamBridge
  runSteps: RuntimeRunStepBridge
  runExecutionScheduler: RuntimeRunExecutionSchedulerBridge
  approveRequest?: typeof applyRuntimeRunApprovalRequest
  rejectRequest?: typeof applyRuntimeRunRejectionRequest
  cancelRequest?: typeof applyRuntimeRunCancellationRequest
  answerRequest?: typeof applyRuntimeRunInputAnswerRequest
}): RuntimeRunControlBridge {
  const approveRequest = input.approveRequest ?? applyRuntimeRunApprovalRequest
  const rejectRequest = input.rejectRequest ?? applyRuntimeRunRejectionRequest
  const cancelRequest = input.cancelRequest ?? applyRuntimeRunCancellationRequest
  const answerRequest = input.answerRequest ?? applyRuntimeRunInputAnswerRequest

  return {
    approveRun: (runId, approvalInput = {}) => approveRequest({
      store: input.store,
      runId,
      approvalInput,
      now: isoNow,
      recordTrace: (targetRun, trace) => input.streams.recordTraceEvent(targetRun, trace),
      emitRunSnapshot: (targetRun) => input.streams.emitRunSnapshot(targetRun),
      rememberRunAuth: (targetRunId, value) => input.runAuth.remember(targetRunId, value),
      startRunExecution: (targetRunId) => input.runExecutionScheduler.startRunExecution(targetRunId),
    }),
    rejectRun: (runId, rejectionInput = {}) => rejectRequest({
      store: input.store,
      runId,
      rejectionInput,
      messageId: makeId('msg'),
      now: isoNow,
      recordTrace: (targetRun, trace) => input.streams.recordTraceEvent(targetRun, trace),
      createStep: (targetRun, type, round, toolName) => input.runSteps.createStep(targetRun, type, round, toolName),
      emitRunSnapshot: (targetRun, options) => input.streams.emitRunSnapshot(targetRun, options),
    }),
    cancelRun: (runId, cancelInput = {}) => {
      const controller = input.controllers.get(runId)
      return cancelRequest({
        store: input.store,
        runId,
        cancelInput,
        messageId: makeId('msg'),
        now: isoNow,
        abortRun: (_targetRunId, error) => controller?.abort(error),
        recordTrace: (targetRun, trace) => input.streams.recordTraceEvent(targetRun, trace),
        createStep: (targetRun, type, round, toolName) => input.runSteps.createStep(targetRun, type, round, toolName),
        emitRunSnapshot: (targetRun, options) => input.streams.emitRunSnapshot(targetRun, options),
      })
    },
    answerRunInputRequest: (runId, answerInput = {}) => {
      const currentRun = input.store.getRun(runId)
      const recoveryAction = currentRun ? runtimeRecoveryActionFromInputAnswer(currentRun, answerInput) : undefined
      if (recoveryAction === 'resume') {
        return resumeInterruptedRuntimeRun({
          store: input.store,
          runId,
          now: isoNow(),
          recordTrace: (targetRun, trace) => input.streams.recordTraceEvent(targetRun, trace),
          emitRunSnapshot: (targetRun) => input.streams.emitRunSnapshot(targetRun),
          startRunExecution: (targetRunId) => input.runExecutionScheduler.startRunExecution(targetRunId),
        })
      }
      if (recoveryAction === 'cancel') {
        const controller = input.controllers.get(runId)
        if (currentRun) {
          markInterruptedRuntimeRunRecoveryCancelled(currentRun, isoNow())
          input.store.updateRun(currentRun)
        }
        return cancelRequest({
          store: input.store,
          runId,
          cancelInput: { reason: 'Runtime recovery cancelled by user.' },
          messageId: makeId('msg'),
          now: isoNow,
          abortRun: (_targetRunId, error) => controller?.abort(error),
          recordTrace: (targetRun, trace) => input.streams.recordTraceEvent(targetRun, trace),
          createStep: (targetRun, type, round, toolName) => input.runSteps.createStep(targetRun, type, round, toolName),
          emitRunSnapshot: (targetRun, options) => input.streams.emitRunSnapshot(targetRun, options),
        })
      }
      return answerRequest({
        store: input.store,
        runId,
        answerInput,
        messageId: makeId('msg'),
        now: isoNow,
        recordTrace: (targetRun, trace) => input.streams.recordTraceEvent(targetRun, trace),
        emitRunSnapshot: (targetRun) => input.streams.emitRunSnapshot(targetRun),
        rememberRunAuth: (targetRunId, value) => input.runAuth.remember(targetRunId, value),
        startRunExecution: (targetRunId) => input.runExecutionScheduler.startRunExecution(targetRunId),
      })
    },
  }
}
