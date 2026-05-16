import test from 'node:test'
import assert from 'node:assert/strict'
import type { AgentRun } from '../state/types.js'
import { RuntimeRunControllerRegistry } from './runLifecycleControl.js'
import { createRuntimeRunControlBridge } from './runtimeRunControlBridge.js'

test('createRuntimeRunControlBridge binds approval rejection cancellation and answer requests', () => {
  const calls: string[] = []
  const run = { id: 'run_1' } as AgentRun
  const controllers = new RuntimeRunControllerRegistry()
  const controller = controllers.create('run_1')
  const bridge = createRuntimeRunControlBridge({
    store: { label: 'store' } as never,
    controllers,
    runAuth: { remember: (runId: string) => calls.push(`auth:${runId}`) } as never,
    streams: {
      recordTraceEvent: () => calls.push('trace'),
      emitRunSnapshot: () => calls.push('snapshot'),
    } as never,
    runSteps: {
      createStep: () => {
        calls.push('step')
        return { id: 'step_1' }
      },
    } as never,
    runExecutionScheduler: {
      startRunExecution: (runId: string) => calls.push(`start:${runId}`),
    },
    approveRequest: (input) => {
      input.recordTrace(run, { kind: 'approval', title: 'approved', status: 'completed' })
      input.emitRunSnapshot(run)
      input.rememberRunAuth(input.runId, input.approvalInput)
      input.startRunExecution(input.runId)
      calls.push(`approve:${input.runId}:${typeof input.now()}`)
      return run
    },
    rejectRequest: (input) => {
      input.recordTrace(run, { kind: 'approval', title: 'rejected', status: 'blocked' })
      input.createStep(run, 'message')
      input.emitRunSnapshot(run, { done: true })
      calls.push(`reject:${input.runId}:${input.messageId.startsWith('msg_')}`)
      return run
    },
    cancelRequest: (input) => {
      input.abortRun(input.runId, new Error('cancelled'))
      input.recordTrace(run, { kind: 'run', title: 'cancelled', status: 'completed' })
      input.createStep(run, 'message')
      input.emitRunSnapshot(run, { done: true })
      calls.push(`cancel:${input.runId}:${input.messageId.startsWith('msg_')}`)
      return run
    },
    answerRequest: (input) => {
      input.recordTrace(run, { kind: 'input', title: 'answered', status: 'completed' })
      input.emitRunSnapshot(run)
      input.rememberRunAuth(input.runId, input.answerInput)
      input.startRunExecution(input.runId)
      calls.push(`answer:${input.runId}:${input.messageId.startsWith('msg_')}`)
      return run
    },
  })

  assert.equal(bridge.approveRun('run_1', { approvalIds: ['approval_1'] }), run)
  assert.equal(bridge.rejectRun('run_1', { approvalIds: ['approval_1'] }), run)
  assert.equal(bridge.cancelRun('run_1', { reason: 'stop' }), run)
  assert.equal(bridge.answerRunInputRequest('run_1', { requestId: 'input_1', text: 'ok' }), run)

  assert.equal(controller.signal.aborted, true)
  assert.deepEqual(calls, [
    'trace',
    'snapshot',
    'auth:run_1',
    'start:run_1',
    'approve:run_1:string',
    'trace',
    'step',
    'snapshot',
    'reject:run_1:true',
    'trace',
    'step',
    'snapshot',
    'cancel:run_1:true',
    'trace',
    'snapshot',
    'auth:run_1',
    'start:run_1',
    'answer:run_1:true',
  ])
})
