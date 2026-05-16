import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentPlan, AgentRun, AgentTask, UpdatePlanTaskInput } from '../state/types.js'
import {
  applyRuntimeReplanTaskChanges,
  finalizeRuntimeReplan,
  prepareRuntimeReplan,
} from './runtimeReplanPreparation.js'

test('prepareRuntimeReplan resolves planner boundary and separates task creates from updates', () => {
  const store = new InMemoryAgentStore()
  store.createPlan(makePlan())
  store.createRun(makeRun({ id: 'run_planner', role: 'planner', planId: 'plan_1' }))
  store.createTask(makeTask({ id: 'task_existing', title: 'Existing' }))

  const result = prepareRuntimeReplan({
    store,
    runId: 'run_planner',
    replanInput: {
      tasks: [
        { id: 'task_existing', title: 'Updated existing' },
        { id: 'task_created', title: 'Created task', metadata: { subagentName: 'Curie' } },
      ],
      updates: [
        { id: 'task_existing', metadata: { subagentName: 'Ada' } },
      ],
    },
    now: '2026-01-01T00:00:01.000Z',
  })

  assert.equal(result.plan.id, 'plan_1')
  assert.equal(result.plannerRunId, 'run_planner')
  assert.deepEqual(result.tasksToCreate.map((task) => task.id), ['task_created'])
  assert.equal(result.tasksToCreate[0]?.metadata?.subagentName, 'Curie')
  assert.deepEqual(result.updatesToApply.map((item) => item.taskId), ['task_existing', 'task_existing'])
  assert.equal(store.getTask('task_created'), undefined)
})

test('prepareRuntimeReplan validates run, owner, graph, and subagent-name boundaries atomically', () => {
  const store = new InMemoryAgentStore()
  store.createPlan(makePlan())
  store.createPlan(makePlan({ id: 'plan_2', rootRunId: 'run_other_planner' }))
  store.createRun(makeRun({ id: 'run_planner', role: 'planner', planId: 'plan_1' }))
  store.createRun(makeRun({ id: 'run_worker', role: 'worker', planId: 'plan_1' }))
  store.createRun(makeRun({ id: 'run_other_planner', role: 'planner', planId: 'plan_2' }))
  store.createTask(makeTask({ id: 'task_a', metadata: { subagentName: 'Ada' } }))
  store.createTask(makeTask({ id: 'task_b' }))
  store.createTask(makeTask({ id: 'task_other', planId: 'plan_2' }))

  assert.throws(() => prepareRuntimeReplan({
    store,
    runId: 'run_worker',
    replanInput: { plannerRunId: 'run_other_planner' },
    now: '2026-01-01T00:00:01.000Z',
  }), /cannot replan plan/)

  assert.throws(() => prepareRuntimeReplan({
    store,
    runId: 'run_planner',
    replanInput: { updates: [{ id: 'task_b', ownerRunId: 'run_other_planner' }] },
    now: '2026-01-01T00:00:01.000Z',
  }), /does not belong to plan/)

  assert.throws(() => prepareRuntimeReplan({
    store,
    runId: 'run_planner',
    replanInput: { updates: [{ id: 'task_b', metadata: { subagentName: 'Ada' } }] },
    now: '2026-01-01T00:00:01.000Z',
  }), /subagent name already exists/)

  assert.throws(() => prepareRuntimeReplan({
    store,
    runId: 'run_planner',
    replanInput: { updates: [{ id: 'task_b', deps: ['task_other'] }] },
    now: '2026-01-01T00:00:01.000Z',
  }), /dependency task task_other does not belong to plan plan_1/)
})

test('applyRuntimeReplanTaskChanges creates tasks, applies updates, and deduplicates updated ids', () => {
  const store = new InMemoryAgentStore()
  store.createTask(makeTask({ id: 'task_existing', title: 'Existing' }))
  const createdEvents: string[] = []
  const updateCalls: Array<{ taskId: string; update: UpdatePlanTaskInput }> = []

  const result = applyRuntimeReplanTaskChanges({
    store,
    tasksToCreate: [makeTask({ id: 'task_created', title: 'Created' })],
    updatesToApply: [
      { taskId: 'task_existing', update: { title: 'Updated once' } },
      { taskId: 'task_existing', update: { metadata: { subagentName: 'Ada' } } },
    ],
    updateTask: (taskId, update) => {
      updateCalls.push({ taskId, update })
      return applyTaskUpdate(store, taskId, update)
    },
    onTaskCreated: (task) => createdEvents.push(task.id),
  })

  assert.deepEqual(result.createdTaskIds, ['task_created'])
  assert.deepEqual(result.updatedTaskIds, ['task_existing'])
  assert.deepEqual(createdEvents, ['task_created'])
  assert.deepEqual(updateCalls.map((call) => call.taskId), ['task_existing', 'task_existing'])
  assert.equal(store.getTask('task_created')?.title, 'Created')
  assert.equal(store.getTask('task_existing')?.title, 'Updated once')
  assert.deepEqual(store.getTask('task_existing')?.metadata, { subagentName: 'Ada' })
})

test('finalizeRuntimeReplan recomputes before optional dispatch and result projection', () => {
  const store = new InMemoryAgentStore()
  store.createPlan(makePlan({ id: 'plan_1', status: 'running' }))
  const calls: string[] = []

  const result = finalizeRuntimeReplan({
    store,
    planId: 'plan_1',
    plannerRunId: 'run_planner',
    replanInput: { maxWorkers: 2 },
    appliedTasks: {
      createdTaskIds: ['task_created'],
      updatedTaskIds: ['task_existing'],
    },
    resetTaskIds: ['task_reset'],
    recomputePlan: (planId) => calls.push(`recompute:${planId}`),
    dispatchPlan: (dispatchInput) => {
      calls.push(`dispatch:${dispatchInput.planId}:${dispatchInput.plannerRunId}:${dispatchInput.maxWorkers}`)
      return {
        plan: makePlan({ id: String(dispatchInput.planId) }),
        spawnedRuns: [],
        blockedTaskIds: ['task_blocked'],
        retriedTaskIds: [],
        timedOutRunIds: [],
      }
    },
  })

  assert.deepEqual(calls, ['recompute:plan_1', 'dispatch:plan_1:run_planner:2'])
  assert.equal(result.plan.id, 'plan_1')
  assert.deepEqual(result.createdTaskIds, ['task_created'])
  assert.deepEqual(result.updatedTaskIds, ['task_existing'])
  assert.deepEqual(result.resetTaskIds, ['task_reset'])
  assert.deepEqual(result.dispatch?.blockedTaskIds, ['task_blocked'])
})

test('finalizeRuntimeReplan can skip dispatch', () => {
  const store = new InMemoryAgentStore()
  store.createPlan(makePlan({ id: 'plan_1' }))
  const calls: string[] = []

  const result = finalizeRuntimeReplan({
    store,
    planId: 'plan_1',
    plannerRunId: 'run_planner',
    replanInput: { dispatch: false },
    appliedTasks: { createdTaskIds: [], updatedTaskIds: [] },
    resetTaskIds: [],
    recomputePlan: (planId) => calls.push(`recompute:${planId}`),
    dispatchPlan: () => {
      throw new Error('dispatch should not be called')
    },
  })

  assert.deepEqual(calls, ['recompute:plan_1'])
  assert.equal(result.dispatch, undefined)
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
  if (typeof update.title === 'string') next.title = update.title
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
