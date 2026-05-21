import test from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentRun, AgentThread } from '../state/types.js'
import { RuntimeRunControllerRegistry } from './runLifecycleControl.js'
import { createRuntimeRunControlBridge } from './runtimeRunControlBridge.js'
import { reconcileRuntimeThreads } from './runtimeThreadRecovery.js'

test('createRuntimeRunControlBridge binds approval rejection cancellation and answer requests', () => {
  const calls: string[] = []
  const run = { id: 'run_1' } as AgentRun
  const controllers = new RuntimeRunControllerRegistry()
  const controller = controllers.create('run_1')
  const bridge = createRuntimeRunControlBridge({
    store: { label: 'store', getRun: () => undefined } as never,
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

test('createRuntimeRunControlBridge routes runtime recovery resume through normal input answers', () => {
  const store = new InMemoryAgentStore()
  store.createThread(makeThread('thread_1'))
  store.createRun(makeRun({ id: 'run_1', threadId: 'thread_1', status: 'in_progress' }))
  reconcileRuntimeThreads({
    store,
    now: '2026-05-21T00:00:00.000Z',
    recordTrace: () => {},
    emitRunSnapshot: () => {},
    startRunExecution: () => {},
  })
  const traces: string[] = []
  const snapshots: string[] = []
  const started: string[] = []
  const bridge = createRuntimeRunControlBridge({
    store,
    controllers: new RuntimeRunControllerRegistry(),
    runAuth: { remember: () => assert.fail('runtime recovery resume should not persist generic answer auth') } as never,
    streams: {
      recordTraceEvent: (_run: AgentRun, trace: { data?: unknown }) => {
        traces.push(String((trace.data as Record<string, unknown> | undefined)?.eventType ?? 'unknown'))
      },
      emitRunSnapshot: (run: AgentRun) => snapshots.push(`${run.id}:${run.status}`),
    } as never,
    runSteps: { createStep: () => assert.fail('runtime recovery resume should not create a cancellation step') } as never,
    runExecutionScheduler: {
      startRunExecution: (runId: string) => started.push(runId),
    },
    answerRequest: () => assert.fail('runtime recovery resume should not use generic input answer handling'),
  })

  const result = bridge.answerRunInputRequest('run_1', {
    requestId: 'input_runtime_recovery_run_1',
    choiceIds: ['resume'],
  })

  assert.equal(result.status, 'queued')
  assert.deepEqual(started, ['run_1'])
  assert.deepEqual(snapshots, ['run_1:queued'])
  assert.deepEqual(traces, ['runtime.recovery.resumed'])
  assert.equal((store.getRun('run_1')?.metadata?.recovery as Record<string, unknown>)?.state, 'resumed')
})

test('createRuntimeRunControlBridge routes runtime recovery cancel through normal input answers', () => {
  const store = new InMemoryAgentStore()
  store.createThread(makeThread('thread_1'))
  store.createRun(makeRun({ id: 'run_1', threadId: 'thread_1', status: 'in_progress' }))
  reconcileRuntimeThreads({
    store,
    now: '2026-05-21T00:00:00.000Z',
    recordTrace: () => {},
    emitRunSnapshot: () => {},
    startRunExecution: () => {},
  })
  const traces: string[] = []
  const snapshots: string[] = []
  const bridge = createRuntimeRunControlBridge({
    store,
    controllers: new RuntimeRunControllerRegistry(),
    runAuth: { remember: () => assert.fail('runtime recovery cancel should not persist generic answer auth') } as never,
    streams: {
      recordTraceEvent: (_run: AgentRun, trace: { title: string }) => {
        traces.push(trace.title)
      },
      emitRunSnapshot: (run: AgentRun, options?: { done?: boolean }) => {
        snapshots.push(`${run.id}:${run.status}:${options?.done ? 'done' : 'open'}`)
      },
    } as never,
    runSteps: {
      createStep: (run: AgentRun, type: 'message' | 'tool_call') => ({
        id: 'step_1',
        runId: run.id,
        type,
        status: 'in_progress',
        createdAt: '2026-05-21T00:00:00.000Z',
      }),
    } as never,
    runExecutionScheduler: {
      startRunExecution: () => assert.fail('runtime recovery cancel should not start execution'),
    },
    answerRequest: () => assert.fail('runtime recovery cancel should not use generic input answer handling'),
  })

  const result = bridge.answerRunInputRequest('run_1', {
    requestId: 'input_runtime_recovery_run_1',
    choiceIds: ['cancel'],
  })

  assert.equal(result.status, 'cancelled')
  assert.equal((store.getRun('run_1')?.metadata?.recovery as Record<string, unknown>)?.state, 'cancelled')
  assert.equal(store.getRun('run_1')?.pendingInputRequests?.[0]?.status, 'cancelled')
  assert.deepEqual(traces, ['Run cancelled'])
  assert.deepEqual(snapshots, ['run_1:cancelled:done'])
})

function makeThread(id: string): AgentThread {
  return {
    id,
    status: 'idle',
    createdAt: '2026-05-21T00:00:00.000Z',
    updatedAt: '2026-05-21T00:00:00.000Z',
    messages: [],
  }
}

function makeRun(overrides: Partial<AgentRun>): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'queued',
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 20,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-05-21T00:00:00.000Z',
    updatedAt: '2026-05-21T00:00:00.000Z',
    steps: [],
    ...overrides,
  }
}
