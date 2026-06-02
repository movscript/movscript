import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../../../../state/store/core/store.js'
import type { AgentThread, AgentTaskGraph, AgentRun, AgentTask, CreateRunInput, CreateThreadInput, UpdateTaskGraphTaskInput } from '../../../../state/shared/types.js'
import {
  applyRuntimeTaskGraphDispatch,
  applyRuntimeTaskGraphDispatchDecision,
  applyRuntimeTaskGraphDispatchFlow,
  applyRuntimeTaskGraphDispatchRequest,
  buildRuntimeTaskGraphDispatchDecision,
  resolveRuntimeTaskGraphDispatchRequest,
} from './runtimePlanDispatch.js'

test('resolveRuntimeTaskGraphDispatchRequest normalizes controls and validates planner run boundaries', () => {
  const store = new InMemoryAgentStore()
  store.createTaskGraph(makeTaskGraph())
  store.createRun(makeRun({ id: 'run_planner', role: 'planner', taskGraphId: 'task_graph_1' }))
  store.createRun(makeRun({ id: 'run_worker', role: 'worker', taskGraphId: 'task_graph_1' }))
  store.createRun(makeRun({ id: 'run_other_planner', role: 'planner', taskGraphId: 'task_graph_2' }))

  const result = resolveRuntimeTaskGraphDispatchRequest({
    store,
    dispatchInput: {
      taskGraphId: ' task_graph_1 ',
      taskIds: ['task_a', 'task_a', 'task_b'],
      maxWorkers: 2,
      maxTaskAttempts: 3,
      retryFailed: true,
      workerTimeoutMs: 5000,
    },
  })

  assert.equal(result.taskGraph.id, 'task_graph_1')
  assert.equal(result.plannerRun.id, 'run_planner')
  assert.deepEqual(result.dispatch.requestedTaskIds, ['task_a', 'task_b'])
  assert.equal(result.dispatch.maxWorkers, 2)
  assert.equal(result.dispatch.maxTaskAttempts, 3)
  assert.equal(result.dispatch.retryFailed, true)
  assert.equal(result.dispatch.workerTimeoutMs, 5000)

  assert.throws(() => resolveRuntimeTaskGraphDispatchRequest({
    store,
    dispatchInput: { taskGraphId: 'task_graph_1', plannerRunId: 'run_worker' },
  }), /is not a planner run/)
  assert.throws(() => resolveRuntimeTaskGraphDispatchRequest({
    store,
    dispatchInput: { taskGraphId: 'task_graph_1', plannerRunId: 'run_other_planner' },
  }), /does not belong to taskGraph/)
})

test('buildRuntimeTaskGraphDispatchDecision validates requested tasks and prepares runnable names', () => {
  const store = new InMemoryAgentStore()
  const taskGraph = makeTaskGraph()
  store.createTaskGraph(taskGraph)
  store.createTask(makeTask({ id: 'task_a' }))
  store.createTask(makeTask({ id: 'task_b', deps: ['task_a'] }))
  store.createTask(makeTask({ id: 'task_named', metadata: { subagentName: 'Curie' } }))
  store.createTask(makeTask({ id: 'task_other', taskGraphId: 'task_graph_2' }))
  store.createRun(makeRun({ id: 'run_used_name', role: 'worker', taskGraphId: 'task_graph_1', metadata: { subagentName: 'Agent 1' } }))

  const result = buildRuntimeTaskGraphDispatchDecision({
    store,
    taskGraph,
    dispatch: {
      plannerRunId: 'run_planner',
      maxTaskAttempts: 1,
      retryFailed: false,
      requestedTaskIds: [],
      maxWorkers: 3,
    },
  })

  assert.deepEqual(result.decision.runnableTasks.map((task) => task.id), ['task_a', 'task_named'])
  assert.deepEqual(result.decision.blockedTasks.map((item) => item.task.id), ['task_b'])
  assert.deepEqual(Object.fromEntries(result.subagentNameByTaskId), {
    task_a: 'Agent 2',
    task_named: 'Curie',
  })

  assert.throws(() => buildRuntimeTaskGraphDispatchDecision({
    store,
    taskGraph,
    dispatch: {
      plannerRunId: 'run_planner',
      maxTaskAttempts: 1,
      retryFailed: false,
      requestedTaskIds: ['task_other'],
    },
  }), /task task_other does not belong to taskGraph task_graph_1/)
})

test('applyRuntimeTaskGraphDispatchDecision applies blocked tasks and worker ownership through callbacks', () => {
  const store = new InMemoryAgentStore()
  const taskGraph = makeTaskGraph()
  const plannerRun = makeRun({ id: 'run_planner', role: 'planner', taskGraphId: 'task_graph_1' })
  const readyTask = makeTask({ id: 'task_ready' })
  const blockedTask = makeTask({ id: 'task_blocked' })
  store.createTaskGraph(taskGraph)
  store.createRun(plannerRun)
  store.createTask(readyTask)
  store.createTask(blockedTask)

  const createdRunInputs: CreateRunInput[] = []
  const createdThreadInputs: CreateThreadInput[] = []
  const blockedEvents: string[] = []
  const dispatchedEvents: string[] = []

  const result = applyRuntimeTaskGraphDispatchDecision({
    store,
    taskGraph,
    plannerRun,
    dispatchInput: { taskGraphId: 'task_graph_1', plannerRunId: 'run_planner' },
    decision: {
      runnableTasks: [readyTask],
      blockedTasks: [{ task: blockedTask, blockedReason: 'Waiting for dependency task(s): task_ready' }],
    },
    subagentNameByTaskId: new Map([['task_ready', 'Einstein']]),
    now: '2026-01-01T00:00:01.000Z',
    updateTask: (taskId, update) => applyTaskUpdate(store, taskId, update),
    createThread: (input) => {
      createdThreadInputs.push(input)
      return makeThread({
        id: 'thread_worker',
        sessionId: typeof input.sessionId === 'string' ? input.sessionId : undefined,
        agentName: typeof input.agentName === 'string' ? input.agentName : undefined,
        agentRole: input.agentRole === 'root' || input.agentRole === 'planner' || input.agentRole === 'worker' ? input.agentRole : undefined,
        parentThreadId: typeof input.parentThreadId === 'string' ? input.parentThreadId : undefined,
        parentRunId: typeof input.parentRunId === 'string' ? input.parentRunId : undefined,
      })
    },
    createRun: (input) => {
      createdRunInputs.push(input)
      const run = makeRun({
        id: 'run_worker',
        threadId: String(input.threadId),
        role: 'worker',
        parentRunId: typeof input.parentRunId === 'string' ? input.parentRunId : undefined,
        taskGraphId: typeof input.taskGraphId === 'string' ? input.taskGraphId : undefined,
        taskId: typeof input.taskId === 'string' ? input.taskId : undefined,
        metadata: input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)
          ? input.metadata as AgentRun['metadata']
          : undefined,
      })
      store.createRun(run)
      return run
    },
    onTaskBlocked: (task) => blockedEvents.push(task.id),
    onTaskDispatched: (task, previousTask) => {
      dispatchedEvents.push(`${previousTask.status}->${task.status}:${task.id}`)
    },
  })

  assert.deepEqual(result.blockedTaskIds, ['task_blocked'])
  assert.deepEqual(result.spawnedRuns.map((run) => run.id), ['run_worker'])
  assert.deepEqual(blockedEvents, ['task_blocked'])
  assert.deepEqual(dispatchedEvents, ['pending->running:task_ready'])
  assert.equal(store.getTask('task_blocked')?.status, 'pending')
  assert.equal(store.getTask('task_blocked')?.blockedReason, 'Waiting for dependency task(s): task_ready')
  assert.equal(store.getTask('task_ready')?.ownerRunId, 'run_worker')
  assert.deepEqual(createdThreadInputs[0], {
    sessionId: 'session_1',
    title: 'Task',
    agentName: 'Einstein',
    agentRole: 'worker',
    parentThreadId: 'thread_1',
    parentRunId: 'run_planner',
    metadata: { subagentName: 'Einstein', taskGraphId: 'task_graph_1', taskId: 'task_ready' },
  })
  assert.equal(createdRunInputs[0]?.threadId, 'thread_worker')
  assert.deepEqual(createdRunInputs[0]?.metadata, { subagentName: 'Einstein', childThreadId: 'thread_worker' })
  assert.equal(createdRunInputs[0]?.taskId, 'task_ready')
})

test('applyRuntimeTaskGraphDispatch builds decision, applies dispatch, then recomputes result projection', () => {
  const store = new InMemoryAgentStore()
  const taskGraph = makeTaskGraph()
  const plannerRun = makeRun({ id: 'run_planner', role: 'planner', taskGraphId: 'task_graph_1' })
  store.createTaskGraph(taskGraph)
  store.createRun(plannerRun)
  store.createTask(makeTask({ id: 'task_ready' }))
  store.createTask(makeTask({ id: 'task_blocked', deps: ['task_ready'] }))
  const calls: string[] = []

  const result = applyRuntimeTaskGraphDispatch({
    store,
    taskGraph,
    dispatch: {
      plannerRunId: 'run_planner',
      maxTaskAttempts: 2,
      retryFailed: false,
      requestedTaskIds: [],
      maxWorkers: 2,
    },
    plannerRun,
    dispatchInput: { taskGraphId: 'task_graph_1', plannerRunId: 'run_planner' },
    retriedTaskIds: ['task_retry'],
    timedOutRunIds: ['run_timeout'],
    now: '2026-01-01T00:00:01.000Z',
    updateTask: (taskId, update) => applyTaskUpdate(store, taskId, update),
    createRun: (input) => {
      calls.push(`create:${input.taskId}`)
      const run = makeRun({
        id: 'run_worker',
        role: 'worker',
        parentRunId: typeof input.parentRunId === 'string' ? input.parentRunId : undefined,
        taskGraphId: typeof input.taskGraphId === 'string' ? input.taskGraphId : undefined,
        taskId: typeof input.taskId === 'string' ? input.taskId : undefined,
      })
      store.createRun(run)
      return run
    },
    recomputeTaskGraph: (taskGraphId) => calls.push(`recompute:${taskGraphId}`),
    onTaskBlocked: (task) => calls.push(`blocked:${task.id}`),
    onTaskDispatched: (task, previousTask) => calls.push(`dispatch:${previousTask.status}->${task.status}:${task.id}`),
  })

  assert.deepEqual(calls, [
    'blocked:task_blocked',
    'create:task_ready',
    'dispatch:pending->running:task_ready',
    'recompute:task_graph_1',
  ])
  assert.equal(result.taskGraph.id, 'task_graph_1')
  assert.deepEqual(result.spawnedRuns.map((run) => run.id), ['run_worker'])
  assert.deepEqual(result.blockedTaskIds, ['task_blocked'])
  assert.deepEqual(result.retriedTaskIds, ['task_retry'])
  assert.deepEqual(result.timedOutRunIds, ['run_timeout'])
})

test('applyRuntimeTaskGraphDispatchFlow applies timeouts and retry resets before dispatch', () => {
  const store = new InMemoryAgentStore()
  const taskGraph = makeTaskGraph()
  const plannerRun = makeRun({ id: 'run_planner', role: 'planner', taskGraphId: 'task_graph_1' })
  store.createTaskGraph(taskGraph)
  store.createRun(plannerRun)
  store.createTask(makeTask({ id: 'task_ready' }))
  store.createTask(makeTask({ id: 'task_retry', status: 'failed' }))
  store.createTask(makeTask({ id: 'task_timeout', status: 'running', ownerRunId: 'run_timeout' }))
  store.createRun(makeRun({
    id: 'run_timeout',
    role: 'worker',
    taskGraphId: 'task_graph_1',
    taskId: 'task_timeout',
    status: 'in_progress',
    startedAt: '2026-01-01T00:00:00.000Z',
  }))
  const calls: string[] = []

  const result = applyRuntimeTaskGraphDispatchFlow({
    store,
    taskGraph,
    dispatch: {
      plannerRunId: 'run_planner',
      maxTaskAttempts: 2,
      retryFailed: true,
      requestedTaskIds: [],
      maxWorkers: 3,
      workerTimeoutMs: 1000,
    },
    plannerRun,
    dispatchInput: { taskGraphId: 'task_graph_1', plannerRunId: 'run_planner', retryFailed: true },
    now: '2026-01-01T00:00:02.000Z',
    nowMs: new Date('2026-01-01T00:00:02.000Z').getTime(),
    updateTask: (taskId, update) => applyTaskUpdate(store, taskId, update),
    createRun: (input) => {
      calls.push(`create:${input.taskId}`)
      const run = makeRun({
        id: `run_${String(input.taskId)}`,
        role: 'worker',
        parentRunId: typeof input.parentRunId === 'string' ? input.parentRunId : undefined,
        taskGraphId: typeof input.taskGraphId === 'string' ? input.taskGraphId : undefined,
        taskId: typeof input.taskId === 'string' ? input.taskId : undefined,
      })
      store.createRun(run)
      return run
    },
    cancelRun: (runId, reason) => calls.push(`cancel:${runId}:${reason}`),
    syncTaskFromRun: (runId) => calls.push(`sync:${runId}`),
    recomputeTaskGraph: (taskGraphId) => calls.push(`recompute:${taskGraphId}`),
    onTaskTimedOut: (task) => calls.push(`timeout:${task.id}`),
    onTaskRetryReset: (task, previousTask) => calls.push(`retry:${previousTask.status}->${task.status}:${task.id}`),
    onTaskDispatched: (task, previousTask) => calls.push(`dispatch:${previousTask.status}->${task.status}:${task.id}`),
  })

  assert.deepEqual(calls, [
    'cancel:run_timeout:Worker run timed out after 1000ms.',
    'sync:run_timeout',
    'timeout:task_timeout',
    'retry:failed->pending:task_retry',
    'recompute:task_graph_1',
    'create:task_ready',
    'dispatch:pending->running:task_ready',
    'create:task_retry',
    'dispatch:pending->running:task_retry',
    'recompute:task_graph_1',
  ])
  assert.deepEqual(result.timedOutRunIds, ['run_timeout'])
  assert.deepEqual(result.retriedTaskIds, ['task_retry'])
  assert.deepEqual(result.spawnedRuns.map((run) => run.taskId), ['task_ready', 'task_retry'])
  assert.equal(store.getTask('task_timeout')?.metadata?.timedOutRunId, 'run_timeout')
})

test('applyRuntimeTaskGraphDispatchRequest resolves the request and applies the full dispatch flow', () => {
  const store = new InMemoryAgentStore()
  store.createTaskGraph(makeTaskGraph())
  store.createRun(makeRun({ id: 'run_planner', role: 'planner', taskGraphId: 'task_graph_1' }))
  store.createTask(makeTask({ id: 'task_ready' }))
  store.createTask(makeTask({ id: 'task_blocked', deps: ['task_ready'] }))
  const calls: string[] = []

  const result = applyRuntimeTaskGraphDispatchRequest({
    store,
    dispatchInput: { taskGraphId: 'task_graph_1', plannerRunId: 'run_planner', maxWorkers: 2 },
    now: '2026-01-01T00:00:01.000Z',
    nowMs: new Date('2026-01-01T00:00:01.000Z').getTime(),
    updateTask: (taskId, update) => applyTaskUpdate(store, taskId, update),
    createRun: (input) => {
      calls.push(`create:${input.taskId}`)
      const run = makeRun({
        id: 'run_worker',
        role: 'worker',
        parentRunId: typeof input.parentRunId === 'string' ? input.parentRunId : undefined,
        taskGraphId: typeof input.taskGraphId === 'string' ? input.taskGraphId : undefined,
        taskId: typeof input.taskId === 'string' ? input.taskId : undefined,
      })
      store.createRun(run)
      return run
    },
    cancelRun: (runId, reason) => calls.push(`cancel:${runId}:${reason}`),
    syncTaskFromRun: (runId) => calls.push(`sync:${runId}`),
    recomputeTaskGraph: (taskGraphId) => calls.push(`recompute:${taskGraphId}`),
    onTaskBlocked: (task) => calls.push(`blocked:${task.id}`),
    onTaskDispatched: (task, previousTask) => calls.push(`dispatch:${previousTask.status}->${task.status}:${task.id}`),
  })

  assert.deepEqual(calls, [
    'blocked:task_blocked',
    'create:task_ready',
    'dispatch:pending->running:task_ready',
    'recompute:task_graph_1',
  ])
  assert.deepEqual(result.spawnedRuns.map((run) => run.id), ['run_worker'])
  assert.deepEqual(result.blockedTaskIds, ['task_blocked'])
  assert.equal(store.getTask('task_ready')?.ownerRunId, 'run_worker')
})

function makeTaskGraph(overrides: Partial<AgentTaskGraph> = {}): AgentTaskGraph {
  return {
    id: 'task_graph_1',
    sessionId: 'session_1',
    threadId: 'thread_1',
    rootRunId: 'run_planner',
    title: 'TaskGraph',
    status: 'running',
    progress: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeThread(overrides: Partial<AgentThread> = {}): AgentThread {
  return {
    id: 'thread_1',
    sessionId: 'session_1',
    agentRole: 'root',
    archived: false,
    status: 'idle',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    messages: [],
    ...overrides,
  }
}

function applyTaskUpdate(store: InMemoryAgentStore, taskId: string, update: UpdateTaskGraphTaskInput): AgentTask {
  const task = store.getTask(taskId)
  assert.ok(task)
  const next: AgentTask = { ...task }
  if (update.metadata !== undefined) {
    assert.ok(update.metadata && typeof update.metadata === 'object' && !Array.isArray(update.metadata))
    next.metadata = update.metadata as AgentTask['metadata']
  }
  store.updateTask(next)
  return next
}

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_planner',
    threadId: 'thread_1',
    role: 'planner',
    status: 'in_progress',
    runtimeLimits: { approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    steps: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 'task_a',
    taskGraphId: 'task_graph_1',
    deps: [],
    title: 'Task',
    status: 'pending',
    progress: 0,
    artifacts: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}
