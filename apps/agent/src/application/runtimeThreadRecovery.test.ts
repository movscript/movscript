import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentRun, AgentThread, AgentTraceEvent } from '../state/types.js'
import {
  reconcileRuntimeThreads,
  runtimeRecoveryActionFromInputAnswer,
  resumeInterruptedRuntimeRun,
  type RuntimeThreadRecoveryTraceInput,
} from './runtimeThreadRecovery.js'

test('reconcileRuntimeThreads reschedules queued runs and pauses interrupted in-progress runs', () => {
  const store = new InMemoryAgentStore()
  store.createThread(makeThread('thread_queued'))
  store.createThread(makeThread('thread_interrupted'))
  store.createThread(makeThread('thread_waiting'))
  store.createRun(makeRun({ id: 'run_queued', threadId: 'thread_queued', status: 'queued' }))
  store.createRun(makeRun({ id: 'run_interrupted', threadId: 'thread_interrupted', status: 'in_progress' }))
  store.createRun(makeRun({ id: 'run_waiting', threadId: 'thread_waiting', status: 'requires_action' }))
  const traces: Array<{ runId: string; trace: RuntimeThreadRecoveryTraceInput }> = []
  const snapshots: string[] = []
  const started: string[] = []

  const report = reconcileRuntimeThreads({
    store,
    now: '2026-05-21T00:00:00.000Z',
    recordTrace: (run, trace) => traces.push({ runId: run.id, trace }),
    emitRunSnapshot: (run) => snapshots.push(`${run.id}:${run.status}`),
    startRunExecution: (runId) => started.push(runId),
  })

  assert.deepEqual(report, {
    checkedRunCount: 3,
    rescheduledRunIds: ['run_queued'],
    interruptedRunIds: ['run_interrupted'],
    waitingRunIds: ['run_waiting'],
  })
  assert.deepEqual(started, ['run_queued'])
  assert.deepEqual(snapshots, ['run_interrupted:requires_action'])
  assert.equal(store.getRun('run_interrupted')?.status, 'requires_action')
  assert.equal(store.getRun('run_interrupted')?.blockedReason, 'Runtime restarted while this run was in progress.')
  assert.equal(store.getRun('run_interrupted')?.pendingInputRequests?.[0]?.id, 'input_runtime_recovery_run_interrupted')
  assert.equal(runtimeRecoveryActionFromInputAnswer(store.getRun('run_interrupted')!, {
    requestId: 'input_runtime_recovery_run_interrupted',
    choiceIds: ['resume'],
  }), 'resume')
  assert.equal(runtimeRecoveryActionFromInputAnswer(store.getRun('run_interrupted')!, {
    requestId: 'input_runtime_recovery_run_interrupted',
    choiceIds: ['cancel'],
  }), 'cancel')
  assert.equal(store.getThread('thread_interrupted')?.status, 'requires_action')
  assert.deepEqual(
    traces.map((item) => [item.runId, item.trace.data && (item.trace.data as Record<string, unknown>).eventType]),
    [
      ['run_queued', 'runtime.recovery.queued_rescheduled'],
      ['run_interrupted', 'runtime.recovery.interrupted'],
    ],
  )
})

test('resumeInterruptedRuntimeRun queues an explicitly recovered run', () => {
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
  const traces: RuntimeThreadRecoveryTraceInput[] = []
  const snapshots: string[] = []
  const started: string[] = []

  const resumed = resumeInterruptedRuntimeRun({
    store,
    runId: 'run_1',
    now: '2026-05-21T00:01:00.000Z',
    recordTrace: (_run, trace) => traces.push(trace),
    emitRunSnapshot: (run) => snapshots.push(`${run.id}:${run.status}`),
    startRunExecution: (runId) => started.push(runId),
  })

  assert.equal(resumed.status, 'queued')
  assert.equal(resumed.pendingInputRequests?.[0]?.status, 'answered')
  assert.deepEqual(resumed.pendingInputRequests?.[0]?.answer, { choiceIds: ['resume'] })
  assert.deepEqual((resumed.metadata?.recovery as Record<string, unknown>)?.state, 'resumed')
  assert.equal(store.getThread('thread_1')?.status, 'running')
  assert.deepEqual(snapshots, ['run_1:queued'])
  assert.deepEqual(started, ['run_1'])
  assert.equal((traces[0].data as Record<string, unknown>).eventType, 'runtime.recovery.resumed')
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
