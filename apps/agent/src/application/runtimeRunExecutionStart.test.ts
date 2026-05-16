import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentRun, AgentThread } from '../state/types.js'
import {
  applyRuntimeRunExecutionStart,
  type RuntimeRunExecutionStartTraceInput,
} from './runtimeRunExecutionStart.js'

const now = '2026-01-01T00:00:01.000Z'

test('applyRuntimeRunExecutionStart marks the run in progress, records setup trace, projects thread status, and emits snapshot', () => {
  const store = new InMemoryAgentStore()
  store.createThread(makeThread())
  const run = makeRun({ id: 'run_1', status: 'queued' })
  store.createRun(run)
  const traces: RuntimeRunExecutionStartTraceInput[] = []
  const snapshots: string[] = []

  const round = applyRuntimeRunExecutionStart({
    store,
    run,
    startedAt: now,
    recordTrace: (_run, trace) => traces.push(trace),
    emitRunSnapshot: (targetRun) => snapshots.push(`${targetRun.id}:${targetRun.status}`),
  })

  assert.equal(round.roundId, 'round_0')
  assert.equal(run.status, 'in_progress')
  assert.equal(run.startedAt, now)
  assert.equal(store.getThread('thread_1')?.status, 'running')
  assert.equal(store.getThread('thread_1')?.activeRunId, 'run_1')
  assert.equal(traces.length, 1)
  assert.equal(traces[0]?.kind, 'run')
  assert.equal(traces[0]?.title, 'Run started')
  assert.deepEqual(snapshots, ['run_1:in_progress'])
})

test('applyRuntimeRunExecutionStart emits worker task heartbeat trace when the run owns a task', () => {
  const store = new InMemoryAgentStore()
  store.createThread(makeThread())
  const run = makeRun({
    id: 'run_worker',
    status: 'queued',
    planId: 'plan_1',
    taskId: 'task_1',
  })
  store.createRun(run)
  const traces: RuntimeRunExecutionStartTraceInput[] = []

  applyRuntimeRunExecutionStart({
    store,
    run,
    startedAt: now,
    recordTrace: (_run, trace) => traces.push(trace),
    emitRunSnapshot: () => {},
  })

  assert.equal(traces.length, 2)
  assert.equal(traces[1]?.kind, 'task')
  assert.equal(traces[1]?.title, 'Task heartbeat')
  assert.deepEqual((traces[1]?.data as Record<string, unknown>), {
    eventType: 'heartbeat',
    planId: 'plan_1',
    taskId: 'task_1',
    runId: 'run_worker',
    runStatus: 'in_progress',
  })
})

function makeThread(overrides: Partial<AgentThread> = {}): AgentThread {
  return {
    id: 'thread_1',
    title: 'Thread',
    status: 'idle',
    messages: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'queued',
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    steps: [],
    ...overrides,
  }
}
