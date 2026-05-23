import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type {
  AgentTaskGraph,
  AgentTaskGraphSnapshot,
  AgentTaskGraphStreamEvent,
  AgentRun,
  AgentInternalRunSignal,
  AgentInternalThreadSignal,
  AgentTask,
} from '../state/types.js'
import { RuntimeEventSubscriberRegistry } from './runtimeEventSubscribers.js'
import { createRuntimeStreamBridge } from './runtimeStreamBridge.js'

test('createRuntimeStreamBridge records run traces and forwards trace events to taskGraph subscribers', () => {
  const store = new InMemoryAgentStore()
  const run = makeRun({ taskGraphId: 'task_graph_1' })
  store.createRun(run)
  const runEvents: AgentInternalRunSignal[] = []
  const planEvents: AgentTaskGraphStreamEvent[] = []
  const bridge = createBridge(store)

  bridge.subscribeRunStream(run, (event) => runEvents.push(event))
  bridge.subscribePlanStream('task_graph_1', (event) => planEvents.push(event))
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
  const threadEvents: AgentInternalThreadSignal[] = []
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

test('createRuntimeStreamBridge forwards displayed worker run events to the interactive thread subscriber', () => {
  const store = new InMemoryAgentStore()
  const run = makeRun({
    id: 'run_worker',
    threadId: 'thread_worker',
    role: 'worker',
    status: 'requires_action',
    pendingInputRequests: [{
      id: 'input_worker',
      runId: 'run_worker',
      displayThreadId: 'thread_root',
      displayAnchor: {
        threadId: 'thread_root',
        runId: 'run_worker',
        messageId: 'msg_root_user',
        placement: 'after',
        reason: 'run_source_message',
      },
      title: 'Confirm',
      question: 'Continue?',
      inputType: 'confirmation',
      choices: [{ id: 'yes', label: 'Yes' }],
      allowCustomAnswer: false,
      status: 'pending',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }],
  })
  store.createRun(run)
  const threadEvents: AgentInternalThreadSignal[] = []
  const bridge = createBridge(store)

  bridge.subscribeThreadStream('thread_root', (event) => threadEvents.push(event))
  bridge.emitRunSnapshot(run, { done: true })

  assert.deepEqual(threadEvents.map((event) => `${event.threadId}:${event.type}`), [
    'thread_root:run',
    'thread_root:done',
    'thread_root:run',
    'thread_root:done',
  ])
})

test('createRuntimeStreamBridge replays and forwards run stream events to session subscribers', () => {
  const store = new InMemoryAgentStore()
  const rootRun = makeRun({ id: 'run_root', sessionId: 'session_1', threadId: 'thread_root', status: 'completed' })
  const workerRun = makeRun({ id: 'run_worker', sessionId: 'session_1', threadId: 'thread_worker', role: 'worker', status: 'in_progress' })
  store.createRun(rootRun)
  store.createRun(workerRun)
  const sessionEvents: AgentInternalThreadSignal[] = []
  const bridge = createBridge(store)

  bridge.subscribeSessionStream('session_1', (event) => sessionEvents.push(event))
  bridge.emitRunSnapshot(workerRun, { done: true })

  assert.deepEqual(sessionEvents.map((event) => `${event.threadId}:${event.type}`), [
    'thread_root:run',
    'thread_root:done',
    'thread_worker:run',
    'thread_worker:run',
    'thread_worker:done',
  ])
})

test('createRuntimeStreamBridge closes run and taskGraph subscribers on terminal stream events', () => {
  const store = new InMemoryAgentStore()
  const run = makeRun({ taskGraphId: 'task_graph_1', status: 'completed' })
  store.createRun(run)
  const runEvents: AgentInternalRunSignal[] = []
  const planEvents: AgentTaskGraphStreamEvent[] = []
  const bridge = createBridge(store, { planStatus: 'done' })

  bridge.subscribeRunStream(run, (event) => runEvents.push(event))
  bridge.subscribePlanStream('task_graph_1', (event) => planEvents.push(event))
  bridge.emitRunSnapshot(run, { done: true })
  bridge.emitPlanTaskEvent('task_graph_1', makeTask({ status: 'done' }))

  assert.deepEqual(runEvents.map((event) => event.type), ['run', 'done', 'run', 'done'])
  assert.deepEqual(planEvents.map((event) => event.type), ['snapshot', 'done', 'run', 'done'])
})

function createBridge(store: InMemoryAgentStore, input: { planStatus?: AgentTaskGraph['status'] } = {}) {
  let traceId = 0
  return createRuntimeStreamBridge({
    store,
    runSubscribers: new RuntimeEventSubscriberRegistry<AgentInternalRunSignal>(),
    sessionSubscribers: new RuntimeEventSubscriberRegistry<AgentInternalThreadSignal>(),
    threadSubscribers: new RuntimeEventSubscriberRegistry<AgentInternalThreadSignal>(),
    planSubscribers: new RuntimeEventSubscriberRegistry<AgentTaskGraphStreamEvent>(),
    getTaskGraphSnapshot: () => snapshot({ status: input.planStatus ?? 'running' }),
    createTraceId: () => `trace_${++traceId}`,
    now: () => '2026-01-01T00:00:01.000Z',
  })
}

function snapshot(planOverrides: Partial<AgentTaskGraph> = {}): AgentTaskGraphSnapshot {
  const taskGraph = makeTaskGraph(planOverrides)
  const tasks = [makeTask()]
  return {
    taskGraph,
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

function makeTaskGraph(overrides: Partial<AgentTaskGraph> = {}): AgentTaskGraph {
  return {
    id: 'task_graph_1',
    threadId: 'thread_1',
    title: 'TaskGraph',
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
    taskGraphId: 'task_graph_1',
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
