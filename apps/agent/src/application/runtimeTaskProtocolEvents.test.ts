import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentPlan, AgentRun, AgentTask } from '../state/types.js'
import {
  applyRuntimeTaskProtocolEvents,
  type RuntimeTaskProtocolTraceInput,
} from './runtimeTaskProtocolEvents.js'

test('applyRuntimeTaskProtocolEvents records creation traces on the plan root run', () => {
  const store = new InMemoryAgentStore()
  store.createRun(makeRun({ id: 'run_root', role: 'planner' }))
  store.createPlan(makePlan({ rootRunId: 'run_root' }))
  const traces: RuntimeTaskProtocolTraceInput[] = []

  const run = applyRuntimeTaskProtocolEvents({
    store,
    task: makeTask({ id: 'task_1', title: 'Plan work' }),
    recordTrace: (_run, trace) => traces.push(trace),
  })

  assert.equal(run?.id, 'run_root')
  assert.equal(traces[0]?.title, 'Task created')
  assert.equal(traces[0]?.summary, 'Plan work')
  assert.equal((traces[0]?.data as any)?.eventType, 'task_created')
})

test('applyRuntimeTaskProtocolEvents records status progress and artifact changes on owner run', () => {
  const store = new InMemoryAgentStore()
  store.createRun(makeRun({ id: 'run_worker', role: 'worker' }))
  store.createPlan(makePlan({ rootRunId: 'run_root' }))
  const previous = makeTask({ status: 'running', progress: 0.25, artifacts: [] })
  const task = makeTask({
    status: 'done',
    progress: 1,
    ownerRunId: 'run_worker',
    artifacts: [{
      id: 'artifact_1',
      type: 'draft',
      title: 'Draft',
      uri: 'draft:1',
      createdAt: '2026-01-01T00:00:00.000Z',
    }],
  })
  const traces: RuntimeTaskProtocolTraceInput[] = []

  const run = applyRuntimeTaskProtocolEvents({
    store,
    task,
    previous,
    recordTrace: (_run, trace) => traces.push(trace),
  })

  assert.equal(run?.id, 'run_worker')
  assert.deepEqual(traces.map((trace) => trace.title), ['Task completed', 'Task progress updated', 'Task artifact created'])
  assert.equal((traces[0]?.data as any)?.eventType, 'task_completed')
  assert.equal((traces[1]?.data as any)?.previousProgress, 0.25)
  assert.equal((traces[2]?.data as any)?.artifact.id, 'artifact_1')
})

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    planId: 'plan_1',
    status: 'in_progress',
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

function makePlan(overrides: Partial<AgentPlan> = {}): AgentPlan {
  return {
    id: 'plan_1',
    threadId: 'thread_1',
    title: 'Plan',
    status: 'running',
    progress: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 'task_1',
    planId: 'plan_1',
    title: 'Task',
    status: 'pending',
    progress: 0,
    deps: [],
    artifacts: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}
