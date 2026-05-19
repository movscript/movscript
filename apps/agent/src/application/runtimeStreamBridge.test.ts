import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type {
  AgentPlan,
  AgentPlanSnapshot,
  AgentPlanStreamEvent,
  AgentRun,
  AgentRunStreamEvent,
  AgentThreadStreamEvent,
  AgentTask,
} from '../state/types.js'
import { RuntimeEventSubscriberRegistry } from './runtimeEventSubscribers.js'
import { createRuntimeStreamBridge } from './runtimeStreamBridge.js'

test('createRuntimeStreamBridge records run traces and forwards trace events to plan subscribers', () => {
  const store = new InMemoryAgentStore()
  const run = makeRun({ planId: 'plan_1' })
  store.createRun(run)
  const runEvents: AgentRunStreamEvent[] = []
  const planEvents: AgentPlanStreamEvent[] = []
  const bridge = createBridge(store)

  bridge.subscribeRunStream(run, (event) => runEvents.push(event))
  bridge.subscribePlanStream('plan_1', (event) => planEvents.push(event))
  const trace = bridge.recordTraceEvent(run, {
    kind: 'task',
    title: 'Task updated',
    status: 'info',
  })

  assert.equal(trace.id, 'trace_1')
  assert.deepEqual(runEvents.map((event) => event.type), ['run', 'trace'])
  assert.deepEqual(planEvents.map((event) => event.type), ['snapshot', 'trace'])
})

test('createRuntimeStreamBridge replays and forwards run stream events to thread subscribers', () => {
  const store = new InMemoryAgentStore()
  const run = makeRun({ status: 'completed' })
  store.createRun(run)
  const threadEvents: AgentThreadStreamEvent[] = []
  const bridge = createBridge(store)

  bridge.subscribeThreadStream('thread_1', (event) => threadEvents.push(event))
  bridge.emitRunSnapshot(run, { done: true })

  assert.deepEqual(threadEvents.map((event) => `${event.threadId}:${event.type}`), [
    'thread_1:run',
    'thread_1:done',
    'thread_1:run',
    'thread_1:done',
  ])
})

test('createRuntimeStreamBridge closes run and plan subscribers on terminal stream events', () => {
  const store = new InMemoryAgentStore()
  const run = makeRun({ planId: 'plan_1', status: 'completed' })
  store.createRun(run)
  const runEvents: AgentRunStreamEvent[] = []
  const planEvents: AgentPlanStreamEvent[] = []
  const bridge = createBridge(store, { planStatus: 'done' })

  bridge.subscribeRunStream(run, (event) => runEvents.push(event))
  bridge.subscribePlanStream('plan_1', (event) => planEvents.push(event))
  bridge.emitRunSnapshot(run, { done: true })
  bridge.emitPlanTaskEvent('plan_1', makeTask({ status: 'done' }))

  assert.deepEqual(runEvents.map((event) => event.type), ['run', 'done', 'run', 'done'])
  assert.deepEqual(planEvents.map((event) => event.type), ['snapshot', 'done', 'run', 'done'])
})

function createBridge(store: InMemoryAgentStore, input: { planStatus?: AgentPlan['status'] } = {}) {
  let traceId = 0
  return createRuntimeStreamBridge({
    store,
    runSubscribers: new RuntimeEventSubscriberRegistry<AgentRunStreamEvent>(),
    threadSubscribers: new RuntimeEventSubscriberRegistry<AgentThreadStreamEvent>(),
    planSubscribers: new RuntimeEventSubscriberRegistry<AgentPlanStreamEvent>(),
    getPlanSnapshot: () => snapshot({ status: input.planStatus ?? 'running' }),
    createTraceId: () => `trace_${++traceId}`,
    now: () => '2026-01-01T00:00:01.000Z',
  })
}

function snapshot(planOverrides: Partial<AgentPlan> = {}): AgentPlanSnapshot {
  const plan = makePlan(planOverrides)
  const tasks = [makeTask()]
  return {
    plan,
    tasks,
    runs: [],
    summary: {
      taskCount: tasks.length,
      taskStatusCounts: {
        pending: 0,
        running: 0,
        blocked: 0,
        needs_review: 0,
        done: tasks.length,
        failed: 0,
        cancelled: 0,
      },
      workerCount: 0,
      activeWorkerCount: 0,
      artifactCount: 0,
      nameConflictCount: 0,
      blockedTaskIds: [],
      needsReviewTaskIds: [],
      failedTaskIds: [],
    },
  }
}

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
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
    progress: 0.5,
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
    status: 'done',
    progress: 1,
    deps: [],
    artifacts: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}
