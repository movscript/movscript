import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentRun, AgentThread } from '../state/types.js'
import type { RuntimeRunExecutionSchedulerBridge } from './runtimeRunExecutionSchedulerBridge.js'
import { createRuntimeRecoveryBridge } from './runtimeRecoveryBridge.js'
import type { RuntimeStreamBridge, RuntimeTraceInput } from './runtimeStreamBridge.js'

test('createRuntimeRecoveryBridge wires startup reconciliation through runtime boundaries', () => {
  const store = new InMemoryAgentStore()
  store.createThread(makeThread('thread_queued'))
  store.createThread(makeThread('thread_interrupted'))
  store.createRun(makeRun({ id: 'run_queued', threadId: 'thread_queued', status: 'queued' }))
  store.createRun(makeRun({ id: 'run_interrupted', threadId: 'thread_interrupted', status: 'in_progress' }))
  const traces: Array<{ runId: string; trace: RuntimeTraceInput }> = []
  const snapshots: string[] = []
  const started: string[] = []

  const bridge = createRuntimeRecoveryBridge({
    store,
    streams: makeStreams({ traces, snapshots }),
    runExecutionScheduler: makeScheduler(started),
  })

  const report = bridge.reconcileRuntimeThreads()

  assert.deepEqual(report.rescheduledRunIds, ['run_queued'])
  assert.deepEqual(report.interruptedRunIds, ['run_interrupted'])
  assert.deepEqual(started, ['run_queued'])
  assert.deepEqual(snapshots, ['run_interrupted:requires_action:done'])
  assert.deepEqual(
    traces.map((item) => [item.runId, item.trace.data && (item.trace.data as Record<string, unknown>).eventType]),
    [
      ['run_queued', 'runtime.recovery.queued_rescheduled'],
      ['run_interrupted', 'runtime.recovery.interrupted'],
    ],
  )
})

test('createRuntimeRecoveryBridge wires explicit interrupted run resume through runtime boundaries', () => {
  const store = new InMemoryAgentStore()
  store.createThread(makeThread('thread_1'))
  store.createRun(makeRun({ id: 'run_1', threadId: 'thread_1', status: 'in_progress' }))
  const interruptedBridge = createRuntimeRecoveryBridge({
    store,
    streams: makeStreams({ traces: [], snapshots: [] }),
    runExecutionScheduler: makeScheduler([]),
  })
  interruptedBridge.reconcileRuntimeThreads()
  const traces: Array<{ runId: string; trace: RuntimeTraceInput }> = []
  const snapshots: string[] = []
  const started: string[] = []

  const bridge = createRuntimeRecoveryBridge({
    store,
    streams: makeStreams({ traces, snapshots }),
    runExecutionScheduler: makeScheduler(started),
  })

  const resumed = bridge.resumeInterruptedRun('run_1')

  assert.equal(resumed.status, 'queued')
  assert.equal(resumed.pendingInputRequests?.[0]?.status, 'answered')
  assert.deepEqual(started, ['run_1'])
  assert.deepEqual(snapshots, ['run_1:queued:open'])
  assert.equal((traces[0]?.trace.data as Record<string, unknown>)?.eventType, 'runtime.recovery.resumed')
})

function makeStreams(output: {
  traces: Array<{ runId: string; trace: RuntimeTraceInput }>
  snapshots: string[]
}): RuntimeStreamBridge {
  return {
    recordTraceEvent: (run, trace) => {
      output.traces.push({ runId: run.id, trace })
      return {
        id: `trace_${output.traces.length}`,
        runId: run.id,
        kind: trace.kind,
        title: trace.title,
        summary: trace.summary,
        status: trace.status,
        data: trace.data as never,
        createdAt: '2026-05-21T00:00:00.000Z',
      }
    },
    emitRunSnapshot: (run, options) => output.snapshots.push(`${run.id}:${run.status}:${options?.done ? 'done' : 'open'}`),
    subscribeRunStream: () => () => {},
    subscribeThreadStream: () => () => {},
    subscribePlanStream: () => () => {},
    emitVolatileTraceEvent: () => {},
    emitRunStreamEvent: () => {},
    emitAssistantMessage: () => {},
    emitPlanTaskEvent: () => {},
    emitPlanStreamEvent: () => {},
  }
}

function makeScheduler(started: string[]): RuntimeRunExecutionSchedulerBridge {
  return {
    startRunExecution: (runId) => started.push(runId),
  }
}

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
