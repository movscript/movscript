import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentPlan, AgentRun, AgentTask, CreateRunInput, UpdatePlanTaskInput } from '../state/types.js'
import {
  applyRuntimePlanDispatch,
  applyRuntimePlanDispatchDecision,
  applyRuntimePlanDispatchFlow,
  buildRuntimePlanDispatchDecision,
  resolveRuntimePlanDispatchRequest,
} from './runtimePlanDispatch.js'

test('resolveRuntimePlanDispatchRequest normalizes controls and validates planner run boundaries', () => {
  const store = new InMemoryAgentStore()
  store.createPlan(makePlan())
  store.createRun(makeRun({ id: 'run_planner', role: 'planner', planId: 'plan_1' }))
  store.createRun(makeRun({ id: 'run_worker', role: 'worker', planId: 'plan_1' }))
  store.createRun(makeRun({ id: 'run_other_planner', role: 'planner', planId: 'plan_2' }))

  const result = resolveRuntimePlanDispatchRequest({
    store,
    dispatchInput: {
      planId: ' plan_1 ',
      taskIds: ['task_a', 'task_a', 'task_b'],
      maxWorkers: 2,
      maxTaskAttempts: 3,
      retryFailed: true,
      workerTimeoutMs: 5000,
    },
  })

  assert.equal(result.plan.id, 'plan_1')
  assert.equal(result.plannerRun.id, 'run_planner')
  assert.deepEqual(result.dispatch.requestedTaskIds, ['task_a', 'task_b'])
  assert.equal(result.dispatch.maxWorkers, 2)
  assert.equal(result.dispatch.maxTaskAttempts, 3)
  assert.equal(result.dispatch.retryFailed, true)
  assert.equal(result.dispatch.workerTimeoutMs, 5000)

  assert.throws(() => resolveRuntimePlanDispatchRequest({
    store,
    dispatchInput: { planId: 'plan_1', plannerRunId: 'run_worker' },
  }), /is not a planner run/)
  assert.throws(() => resolveRuntimePlanDispatchRequest({
    store,
    dispatchInput: { planId: 'plan_1', plannerRunId: 'run_other_planner' },
  }), /does not belong to plan/)
})

test('buildRuntimePlanDispatchDecision validates requested tasks and prepares runnable names', () => {
  const store = new InMemoryAgentStore()
  const plan = makePlan()
  store.createPlan(plan)
  store.createTask(makeTask({ id: 'task_a' }))
  store.createTask(makeTask({ id: 'task_b', deps: ['task_a'] }))
  store.createTask(makeTask({ id: 'task_named', metadata: { subagentName: 'Curie' } }))
  store.createTask(makeTask({ id: 'task_other', planId: 'plan_2' }))
  store.createRun(makeRun({ id: 'run_used_name', role: 'worker', planId: 'plan_1', metadata: { subagentName: 'Agent 1' } }))

  const result = buildRuntimePlanDispatchDecision({
    store,
    plan,
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

  assert.throws(() => buildRuntimePlanDispatchDecision({
    store,
    plan,
    dispatch: {
      plannerRunId: 'run_planner',
      maxTaskAttempts: 1,
      retryFailed: false,
      requestedTaskIds: ['task_other'],
    },
  }), /task task_other does not belong to plan plan_1/)
})

test('applyRuntimePlanDispatchDecision applies blocked tasks and worker ownership through callbacks', () => {
  const store = new InMemoryAgentStore()
  const plan = makePlan()
  const plannerRun = makeRun({ id: 'run_planner', role: 'planner', planId: 'plan_1' })
  const readyTask = makeTask({ id: 'task_ready' })
  const blockedTask = makeTask({ id: 'task_blocked' })
  store.createPlan(plan)
  store.createRun(plannerRun)
  store.createTask(readyTask)
  store.createTask(blockedTask)

  const createdRunInputs: CreateRunInput[] = []
  const blockedEvents: string[] = []
  const dispatchedEvents: string[] = []

  const result = applyRuntimePlanDispatchDecision({
    store,
    plan,
    plannerRun,
    dispatchInput: { planId: 'plan_1', plannerRunId: 'run_planner' },
    decision: {
      runnableTasks: [readyTask],
      blockedTasks: [{ task: blockedTask, blockedReason: 'Waiting for dependency task(s): task_ready' }],
    },
    subagentNameByTaskId: new Map([['task_ready', 'Einstein']]),
    now: '2026-01-01T00:00:01.000Z',
    updateTask: (taskId, update) => applyTaskUpdate(store, taskId, update),
    createRun: (input) => {
      createdRunInputs.push(input)
      const run = makeRun({
        id: 'run_worker',
        role: 'worker',
        parentRunId: typeof input.parentRunId === 'string' ? input.parentRunId : undefined,
        planId: typeof input.planId === 'string' ? input.planId : undefined,
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
  assert.deepEqual(createdRunInputs[0]?.metadata, { subagentName: 'Einstein' })
  assert.equal(createdRunInputs[0]?.taskId, 'task_ready')
})

test('applyRuntimePlanDispatch builds decision, applies dispatch, then recomputes result projection', () => {
  const store = new InMemoryAgentStore()
  const plan = makePlan()
  const plannerRun = makeRun({ id: 'run_planner', role: 'planner', planId: 'plan_1' })
  store.createPlan(plan)
  store.createRun(plannerRun)
  store.createTask(makeTask({ id: 'task_ready' }))
  store.createTask(makeTask({ id: 'task_blocked', deps: ['task_ready'] }))
  const calls: string[] = []

  const result = applyRuntimePlanDispatch({
    store,
    plan,
    dispatch: {
      plannerRunId: 'run_planner',
      maxTaskAttempts: 2,
      retryFailed: false,
      requestedTaskIds: [],
      maxWorkers: 2,
    },
    plannerRun,
    dispatchInput: { planId: 'plan_1', plannerRunId: 'run_planner' },
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
        planId: typeof input.planId === 'string' ? input.planId : undefined,
        taskId: typeof input.taskId === 'string' ? input.taskId : undefined,
      })
      store.createRun(run)
      return run
    },
    recomputePlan: (planId) => calls.push(`recompute:${planId}`),
    onTaskBlocked: (task) => calls.push(`blocked:${task.id}`),
    onTaskDispatched: (task, previousTask) => calls.push(`dispatch:${previousTask.status}->${task.status}:${task.id}`),
  })

  assert.deepEqual(calls, [
    'blocked:task_blocked',
    'create:task_ready',
    'dispatch:pending->running:task_ready',
    'recompute:plan_1',
  ])
  assert.equal(result.plan.id, 'plan_1')
  assert.deepEqual(result.spawnedRuns.map((run) => run.id), ['run_worker'])
  assert.deepEqual(result.blockedTaskIds, ['task_blocked'])
  assert.deepEqual(result.retriedTaskIds, ['task_retry'])
  assert.deepEqual(result.timedOutRunIds, ['run_timeout'])
})

test('applyRuntimePlanDispatchFlow applies timeouts and retry resets before dispatch', () => {
  const store = new InMemoryAgentStore()
  const plan = makePlan()
  const plannerRun = makeRun({ id: 'run_planner', role: 'planner', planId: 'plan_1' })
  store.createPlan(plan)
  store.createRun(plannerRun)
  store.createTask(makeTask({ id: 'task_ready' }))
  store.createTask(makeTask({ id: 'task_retry', status: 'failed' }))
  store.createTask(makeTask({ id: 'task_timeout', status: 'running', ownerRunId: 'run_timeout' }))
  store.createRun(makeRun({
    id: 'run_timeout',
    role: 'worker',
    planId: 'plan_1',
    taskId: 'task_timeout',
    status: 'in_progress',
    startedAt: '2026-01-01T00:00:00.000Z',
  }))
  const calls: string[] = []

  const result = applyRuntimePlanDispatchFlow({
    store,
    plan,
    dispatch: {
      plannerRunId: 'run_planner',
      maxTaskAttempts: 2,
      retryFailed: true,
      requestedTaskIds: [],
      maxWorkers: 3,
      workerTimeoutMs: 1000,
    },
    plannerRun,
    dispatchInput: { planId: 'plan_1', plannerRunId: 'run_planner', retryFailed: true },
    now: '2026-01-01T00:00:02.000Z',
    nowMs: new Date('2026-01-01T00:00:02.000Z').getTime(),
    updateTask: (taskId, update) => applyTaskUpdate(store, taskId, update),
    createRun: (input) => {
      calls.push(`create:${input.taskId}`)
      const run = makeRun({
        id: `run_${String(input.taskId)}`,
        role: 'worker',
        parentRunId: typeof input.parentRunId === 'string' ? input.parentRunId : undefined,
        planId: typeof input.planId === 'string' ? input.planId : undefined,
        taskId: typeof input.taskId === 'string' ? input.taskId : undefined,
      })
      store.createRun(run)
      return run
    },
    cancelRun: (runId, reason) => calls.push(`cancel:${runId}:${reason}`),
    syncTaskFromRun: (runId) => calls.push(`sync:${runId}`),
    recomputePlan: (planId) => calls.push(`recompute:${planId}`),
    onTaskTimedOut: (task) => calls.push(`timeout:${task.id}`),
    onTaskRetryReset: (task, previousTask) => calls.push(`retry:${previousTask.status}->${task.status}:${task.id}`),
    onTaskDispatched: (task, previousTask) => calls.push(`dispatch:${previousTask.status}->${task.status}:${task.id}`),
  })

  assert.deepEqual(calls, [
    'cancel:run_timeout:Worker run timed out after 1000ms.',
    'sync:run_timeout',
    'timeout:task_timeout',
    'retry:failed->pending:task_retry',
    'recompute:plan_1',
    'create:task_ready',
    'dispatch:pending->running:task_ready',
    'create:task_retry',
    'dispatch:pending->running:task_retry',
    'recompute:plan_1',
  ])
  assert.deepEqual(result.timedOutRunIds, ['run_timeout'])
  assert.deepEqual(result.retriedTaskIds, ['task_retry'])
  assert.deepEqual(result.spawnedRuns.map((run) => run.taskId), ['task_ready', 'task_retry'])
  assert.equal(store.getTask('task_timeout')?.metadata?.timedOutRunId, 'run_timeout')
})

function makePlan(overrides: Partial<AgentPlan> = {}): AgentPlan {
  return {
    id: 'plan_1',
    threadId: 'thread_1',
    rootRunId: 'run_planner',
    title: 'Plan',
    status: 'running',
    progress: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function applyTaskUpdate(store: InMemoryAgentStore, taskId: string, update: UpdatePlanTaskInput): AgentTask {
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
    policy: {
      approvalMode: 'interactive',
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
    planId: 'plan_1',
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
