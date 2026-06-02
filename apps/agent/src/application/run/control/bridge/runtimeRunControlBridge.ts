import type { AgentStore } from '../../../../state/store/core/store.js'
import type {
  AgentRun,
  AnswerRunInputRequestInput,
  ApproveRunInput,
  CancelRunInput,
  RejectRunInput,
} from '../../../../state/shared/types.js'
import type { RuntimeRunControllerRegistry } from '../../lifecycle/runLifecycleControl.js'
import { applyRuntimeRunCancellationRequest } from '../cancellation/core/runtimeRunCancellation.js'
import type { RuntimeRunExecutionSchedulerBridge } from '../../execution/scheduler/bridge/runtimeRunExecutionSchedulerBridge.js'
import {
  applyRuntimeRunApprovalRequest,
  applyRuntimeRunInputAnswerRequest,
  applyRuntimeRunRejectionRequest,
} from '../../interactions/run/runtimeRunInteraction.js'
import type { RuntimeRunStepBridge } from '../../steps/bridge/runtimeRunStepBridge.js'
import type { RuntimeStreamBridge } from '../../../stream/bridge/runtimeStreamBridge.js'
import type { RuntimeRunAuthRegistry } from '../../auth/runAuth.js'
import { isoNow, makeId } from '../../../../shared/runtime/runtimeIdentity.js'
import {
  markInterruptedRuntimeRunRecoveryCancelled,
  resumeInterruptedRuntimeRun,
  runtimeRecoveryActionFromInputAnswer,
} from '../../../thread/recovery/runtimeThreadRecovery.js'

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
      startRunExecution: (targetRunId) => input.runExecutionScheduler.startRunExecution(targetRunId),
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
        messageId: answerInputSourceMessageId(answerInput) ?? makeId('msg'),
        now: isoNow,
        recordTrace: (targetRun, trace) => input.streams.recordTraceEvent(targetRun, trace),
        emitRunSnapshot: (targetRun) => input.streams.emitRunSnapshot(targetRun),
        rememberRunAuth: (targetRunId, value) => input.runAuth.remember(targetRunId, value),
        startRunExecution: (targetRunId) => input.runExecutionScheduler.startRunExecution(targetRunId),
      })
    },
  }
}

function answerInputSourceMessageId(input: AnswerRunInputRequestInput): string | undefined {
  if (typeof input.sourceMessageId !== 'string') return undefined
  const id = input.sourceMessageId.trim()
  return id.length > 0 ? id : undefined
}
