import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentPlan, AgentPlanSnapshot, AgentRun, AgentTask, UpdatePlanTaskInput } from '../state/types.js'
import {
  applyRuntimeSubagentSpawnFlow,
  applyRuntimeSubagentSpawnPreparation,
  buildRuntimeSubagentSpawnResult,
  prepareRuntimeSubagentSpawn,
} from './runtimeSubagentSpawn.js'

test('prepareRuntimeSubagentSpawn creates worker task targets with stable subagent names', () => {
  const store = new InMemoryAgentStore()
  store.createRun(makeRun())

  const result = prepareRuntimeSubagentSpawn({
    store,
    plannerRunId: 'run_planner',
    request: {
      tasks: [
        { id: 'task_created_a', title: 'Created A' },
        { id: 'task_created_b', title: 'Created B', subagentName: 'Curie' },
      ],
    },
    now: '2026-01-01T00:00:01.000Z',
  })

  assert.equal(result.planId, 'plan_1')
  assert.equal(result.plannerRunId, 'run_planner')
  assert.deepEqual(result.requestedTaskIds, ['task_created_a', 'task_created_b'])
  assert.deepEqual(Object.fromEntries(result.subagentNameByTaskId), {
    task_created_a: 'Agent 1',
    task_created_b: 'Curie',
  })
  assert.deepEqual(result.tasksToCreate.map((task) => task.metadata?.subagentName), ['Agent 1', 'Curie'])
  assert.equal(store.getTask('task_created_a'), undefined)
})

test('prepareRuntimeSubagentSpawn maps existing tasks and rejects duplicate names atomically', () => {
  const store = new InMemoryAgentStore()
  store.createRun(makeRun())
  store.createTask(makeTask({ id: 'task_existing_a' }))
  store.createTask(makeTask({ id: 'task_existing_b' }))

  assert.throws(() => prepareRuntimeSubagentSpawn({
    store,
    plannerRunId: 'run_planner',
    request: {
      taskIds: ['task_existing_a', 'task_existing_b'],
      subagentNames: ['Einstein', 'Einstein'],
    },
    now: '2026-01-01T00:00:01.000Z',
  }), /subagent name already exists/)

  const result = prepareRuntimeSubagentSpawn({
    store,
    plannerRunId: 'run_planner',
    request: {
      taskIds: ['task_existing_a', 'task_existing_b'],
      subagentNames: {
        task_existing_a: 'Einstein',
        task_existing_b: 'Hawking',
      },
    },
    now: '2026-01-01T00:00:01.000Z',
  })

  assert.deepEqual(Object.fromEntries(result.subagentNameByTaskId), {
    task_existing_a: 'Einstein',
    task_existing_b: 'Hawking',
  })
  assert.deepEqual(result.tasksToCreate, [])
})

test('prepareRuntimeSubagentSpawn validates planner plan and target plan boundaries', () => {
  const store = new InMemoryAgentStore()
  store.createRun(makeRun({ id: 'run_no_plan', planId: undefined }))
  store.createRun(makeRun())
  store.createTask(makeTask({ id: 'task_other_plan', planId: 'plan_2' }))

  assert.throws(() => prepareRuntimeSubagentSpawn({
    store,
    plannerRunId: 'run_no_plan',
    request: { taskId: 'task_other_plan' },
    now: '2026-01-01T00:00:01.000Z',
  }), /requires the planner run to be attached/)

  assert.throws(() => prepareRuntimeSubagentSpawn({
    store,
    plannerRunId: 'run_planner',
    request: {
      taskId: 'task_other_plan',
      tasks: [{ id: 'task_should_not_write', title: 'Should not write' }],
    },
    now: '2026-01-01T00:00:01.000Z',
  }), /task task_other_plan does not belong to plan plan_1/)

  assert.equal(store.getTask('task_should_not_write'), undefined)
})

test('prepareRuntimeSubagentSpawn validates the planner run lookup before task creation', () => {
  const store = new InMemoryAgentStore()
  store.createRun(makeRun({ id: 'run_worker', role: 'worker' }))

  assert.throws(() => prepareRuntimeSubagentSpawn({
    store,
    plannerRunId: 'missing',
    request: { tasks: [{ id: 'task_should_not_write', title: 'Should not write' }] },
    now: '2026-01-01T00:00:01.000Z',
  }), /run not found: missing/)

  assert.throws(() => prepareRuntimeSubagentSpawn({
    store,
    plannerRunId: 'run_worker',
    request: { tasks: [{ id: 'task_should_not_write', title: 'Should not write' }] },
    now: '2026-01-01T00:00:01.000Z',
  }), /run run_worker is not a planner run/)

  assert.equal(store.getTask('task_should_not_write'), undefined)
})

test('applyRuntimeSubagentSpawnPreparation creates tasks, writes names, and resets stale targets', () => {
  const store = new InMemoryAgentStore()
  store.createRun(makeRun())
  store.createTask(makeTask({ id: 'task_existing', metadata: {}, status: 'blocked', blockedReason: 'needs input' }))
  store.createTask(makeTask({ id: 'task_failed', status: 'failed', metadata: { subagentName: 'Feynman' } }))
  const spawn = prepareRuntimeSubagentSpawn({
    store,
    plannerRunId: 'run_planner',
    request: {
      tasks: [{ id: 'task_created', title: 'Created', subagentName: 'Curie' }],
      taskIds: ['task_existing', 'task_failed'],
      subagentNames: {
        task_existing: 'Einstein',
      },
    },
    now: '2026-01-01T00:00:01.000Z',
  })
  const calls: string[] = []

  const result = applyRuntimeSubagentSpawnPreparation({
    store,
    spawn,
    retryFailed: false,
    updateTask: (taskId, update) => {
      calls.push(`update:${taskId}:${String(update.status ?? 'metadata')}`)
      return applyTaskUpdate(store, taskId, update)
    },
    onTaskCreated: (task) => calls.push(`created:${task.id}`),
  })

  assert.deepEqual(result.createdTaskIds, ['task_created'])
  assert.deepEqual(calls, [
    'created:task_created',
    'update:task_existing:metadata',
    'update:task_existing:pending',
    'update:task_failed:pending',
  ])
  assert.equal(store.getTask('task_created')?.metadata?.subagentName, 'Curie')
  assert.equal(store.getTask('task_existing')?.status, 'pending')
  assert.equal(store.getTask('task_existing')?.metadata?.subagentName, 'Einstein')
  assert.equal(store.getTask('task_existing')?.metadata?.resetByPlannerRunId, 'run_planner')
  assert.equal(store.getTask('task_failed')?.status, 'pending')
  assert.equal(store.getTask('task_failed')?.metadata?.subagentName, 'Feynman')
})

test('applyRuntimeSubagentSpawnPreparation keeps failed targets when retryFailed is true', () => {
  const store = new InMemoryAgentStore()
  store.createRun(makeRun())
  store.createTask(makeTask({ id: 'task_failed', status: 'failed' }))
  const spawn = prepareRuntimeSubagentSpawn({
    store,
    plannerRunId: 'run_planner',
    request: { taskId: 'task_failed' },
    now: '2026-01-01T00:00:01.000Z',
  })

  applyRuntimeSubagentSpawnPreparation({
    store,
    spawn,
    retryFailed: true,
    updateTask: (taskId, update) => applyTaskUpdate(store, taskId, update),
  })

  assert.equal(store.getTask('task_failed')?.status, 'failed')
})

test('applyRuntimeSubagentSpawnFlow applies targets, dispatches requested tasks, and projects result', () => {
  const store = new InMemoryAgentStore()
  store.createRun(makeRun())
  const spawn = prepareRuntimeSubagentSpawn({
    store,
    plannerRunId: 'run_planner',
    request: {
      tasks: [{ id: 'task_created', title: 'Created', subagentName: 'Curie' }],
      maxWorkers: 2,
      maxTaskAttempts: 3,
      retryFailed: true,
      workerTimeoutMs: 5000,
    },
    now: '2026-01-01T00:00:01.000Z',
  })
  const worker = makeRun({
    id: 'run_worker',
    role: 'worker',
    taskId: 'task_created',
    parentRunId: 'run_planner',
    status: 'in_progress',
    metadata: { subagentName: 'Curie' },
  })
  const calls: string[] = []

  const result = applyRuntimeSubagentSpawnFlow({
    store,
    spawn,
    request: {
      maxWorkers: 2,
      maxTaskAttempts: 3,
      retryFailed: true,
      workerTimeoutMs: 5000,
    },
    updateTask: (taskId, update) => {
      calls.push(`update:${taskId}:${String(update.status ?? 'metadata')}`)
      return applyTaskUpdate(store, taskId, update)
    },
    dispatchPlan: (dispatchInput) => {
      calls.push(`dispatch:${dispatchInput.planId}:${dispatchInput.plannerRunId}:${String(dispatchInput.taskIds)}:${dispatchInput.maxWorkers}:${dispatchInput.maxTaskAttempts}:${dispatchInput.retryFailed}:${dispatchInput.workerTimeoutMs}`)
      return {
        plan: makePlan({ id: String(dispatchInput.planId) }),
        spawnedRuns: [worker],
        blockedTaskIds: [],
        retriedTaskIds: [],
        timedOutRunIds: [],
      }
    },
    getPlanSnapshot: (planId) => {
      calls.push(`snapshot:${planId}`)
      return makeSnapshot({ tasks: [store.getTask('task_created') ?? makeTask({ id: 'task_created' })], runs: [worker] })
    },
    onTaskCreated: (task) => calls.push(`created:${task.id}`),
  }) as Record<string, unknown>

  assert.deepEqual(calls, [
    'created:task_created',
    'dispatch:plan_1:run_planner:task_created:2:3:true:5000',
    'snapshot:plan_1',
  ])
  assert.equal(result.status, 'spawned')
  assert.deepEqual(result.createdTaskIds, ['task_created'])
  assert.equal(((result.spawnedRuns as Array<Record<string, unknown>>)[0])?.subagentName, 'Curie')
})

test('buildRuntimeSubagentSpawnResult projects spawned runs and snapshot view', () => {
  const task = makeTask({ id: 'task_1', metadata: { subagentName: 'Einstein' }, status: 'running' })
  const worker = makeRun({
    id: 'run_worker',
    role: 'worker',
    taskId: 'task_1',
    parentRunId: 'run_planner',
    status: 'in_progress',
    metadata: { subagentName: 'Einstein' },
  })

  const result = buildRuntimeSubagentSpawnResult({
    planId: 'plan_1',
    plannerRunId: 'run_planner',
    createdTaskIds: ['task_1'],
    dispatch: {
      spawnedRuns: [worker],
      blockedTaskIds: [],
      retriedTaskIds: ['task_retry'],
      timedOutRunIds: ['run_timeout'],
    },
    snapshot: makeSnapshot({ tasks: [task], runs: [worker] }),
  }) as Record<string, unknown>

  assert.equal(result.status, 'spawned')
  assert.equal(result.planId, 'plan_1')
  assert.equal(result.plannerRunId, 'run_planner')
  assert.deepEqual(result.createdTaskIds, ['task_1'])
  assert.deepEqual(result.retriedTaskIds, ['task_retry'])
  assert.deepEqual(result.timedOutRunIds, ['run_timeout'])
  assert.equal(((result.spawnedRuns as Array<Record<string, unknown>>)[0])?.subagentName, 'Einstein')
  assert.equal(((result.snapshot as Record<string, unknown>).summary as Record<string, unknown>).taskCount, 1)
})

test('buildRuntimeSubagentSpawnResult reports no runnable tasks without spawned workers', () => {
  const result = buildRuntimeSubagentSpawnResult({
    planId: 'plan_1',
    plannerRunId: 'run_planner',
    createdTaskIds: [],
    dispatch: {
      spawnedRuns: [],
      blockedTaskIds: ['task_blocked'],
      retriedTaskIds: [],
      timedOutRunIds: [],
    },
    snapshot: makeSnapshot({ tasks: [makeTask({ id: 'task_blocked', status: 'blocked' })], runs: [] }),
  }) as Record<string, unknown>

  assert.equal(result.status, 'no_runnable_tasks')
  assert.deepEqual(result.blockedTaskIds, ['task_blocked'])
  assert.deepEqual(result.spawnedRuns, [])
})

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_planner',
    threadId: 'thread_1',
    role: 'planner',
    planId: 'plan_1',
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

function makeSnapshot(overrides: Partial<AgentPlanSnapshot> = {}): AgentPlanSnapshot {
  return {
    plan: makePlan(),
    tasks: [],
    runs: [],
    ...overrides,
  }
}

function applyTaskUpdate(store: InMemoryAgentStore, taskId: string, update: UpdatePlanTaskInput): AgentTask {
  const task = store.getTask(taskId)
  assert.ok(task)
  const next: AgentTask = {
    ...task,
    metadata: task.metadata ? { ...task.metadata } : undefined,
  }
  if (typeof update.status === 'string') next.status = update.status as AgentTask['status']
  if (typeof update.progress === 'number') next.progress = update.progress
  if (update.metadata !== undefined) {
    assert.ok(update.metadata && typeof update.metadata === 'object' && !Array.isArray(update.metadata))
    next.metadata = update.metadata as AgentTask['metadata']
  }
  store.updateTask(next)
  return next
}

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 'task_1',
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
