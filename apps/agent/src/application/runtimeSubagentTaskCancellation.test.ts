import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentPlan, AgentRun, AgentTask, UpdatePlanTaskInput } from '../state/types.js'
import { applyPlanTaskUpdate } from '../state/planTaskUpdate.js'
import {
  applyRuntimeSubagentCancellationFlow,
  buildRuntimePendingSubagentTaskCancellationResult,
  buildRuntimeSubagentRunCancellationResult,
  cancelPendingRuntimeSubagentTask,
  resolveRuntimeSubagentCancellationTarget,
} from './runtimeSubagentTaskCancellation.js'

test('cancelPendingRuntimeSubagentTask cancels a pending task through the update boundary', () => {
  const store = new InMemoryAgentStore()
  store.createTask(makeTask({ metadata: { subagentName: 'Writer' }, progress: 0.25 }))
  const updates: UpdatePlanTaskInput[] = []

  const result = cancelPendingRuntimeSubagentTask({
    store,
    plannerRun: makeRun({ planId: 'plan_1' }),
    taskId: 'task_1',
    reason: 'No longer needed.',
    updateTask: (taskId, update) => {
      updates.push(update)
      const task = store.getTask(taskId)
      assert.ok(task)
      applyPlanTaskUpdate({
        task,
        update,
        now: '2026-01-01T00:00:01.000Z',
        planTasks: [task],
        getTask: (id) => store.getTask(id),
      })
      store.updateTask(task)
      return task
    },
  })

  assert.equal(result.status, 'cancelled')
  assert.equal(result.planId, 'plan_1')
  assert.equal(result.plannerRunId, 'run_planner')
  assert.equal((result.target.task as Record<string, unknown>).subagentName, 'Writer')
  assert.deepEqual(result.cancelledRunIds, [])
  assert.equal(updates[0]?.status, 'cancelled')
  assert.equal(store.getTask('task_1')?.status, 'cancelled')
})

test('cancelPendingRuntimeSubagentTask returns unchanged for non-cancellable unowned tasks', () => {
  const store = new InMemoryAgentStore()
  store.createTask(makeTask({ status: 'done' }))

  const result = cancelPendingRuntimeSubagentTask({
    store,
    plannerRun: makeRun({ planId: 'plan_1' }),
    taskId: 'task_1',
    updateTask: () => {
      throw new Error('updateTask should not be called')
    },
  })

  assert.equal(result.status, 'unchanged')
  assert.equal((result.target.task as Record<string, unknown>).status, 'done')
})

test('cancelPendingRuntimeSubagentTask validates planner plan and task ownership boundaries', () => {
  const store = new InMemoryAgentStore()
  store.createTask(makeTask({ id: 'task_1', planId: 'plan_1' }))
  store.createTask(makeTask({ id: 'task_2', planId: 'plan_2' }))
  store.createTask(makeTask({ id: 'task_3', ownerRunId: 'run_worker' }))

  assert.throws(() => cancelPendingRuntimeSubagentTask({
    store,
    plannerRun: makeRun(),
    taskId: 'task_1',
    updateTask: failUpdate,
  }), /requires the planner run to be attached/)

  assert.throws(() => cancelPendingRuntimeSubagentTask({
    store,
    plannerRun: makeRun({ planId: 'plan_1' }),
    taskId: 'task_2',
    updateTask: failUpdate,
  }), /task task_2 does not belong to plan plan_1/)

  assert.throws(() => cancelPendingRuntimeSubagentTask({
    store,
    plannerRun: makeRun({ planId: 'plan_1' }),
    taskId: 'task_3',
    updateTask: failUpdate,
  }), /task task_3 is already owned by run run_worker/)
})

test('buildRuntimePendingSubagentTaskCancellationResult attaches a subagent snapshot', () => {
  const store = new InMemoryAgentStore()
  const task = makeTask({ id: 'task_1', status: 'cancelled', metadata: { subagentName: 'Writer' } })
  store.createTask(task)

  const result = buildRuntimePendingSubagentTaskCancellationResult({
    result: {
      status: 'cancelled',
      planId: 'plan_1',
      plannerRunId: 'run_planner',
      target: { kind: 'task', task: task as unknown as Record<string, never> },
      cancelledRunIds: [],
    },
    getPlanSnapshot: () => ({
      plan: makePlan(),
      tasks: store.listTasks('plan_1'),
      runs: [],
    }),
  })

  assert.equal(result.status, 'cancelled')
  assert.deepEqual(result.cancelledRunIds, [])
  assert.equal((result.snapshot.summary as Record<string, unknown>).taskCount, 1)
})

test('resolveRuntimeSubagentCancellationTarget resolves pending task and worker run targets', () => {
  const store = new InMemoryAgentStore()
  store.createTask(makeTask({ id: 'task_pending', metadata: { subagentName: 'Ada' } }))
  store.createTask(makeTask({ id: 'task_owned', ownerRunId: 'run_worker', metadata: { subagentName: 'Turing' } }))
  store.createRun(makeRun({
    id: 'run_worker',
    role: 'worker',
    planId: 'plan_1',
    taskId: 'task_owned',
  }))

  assert.deepEqual(resolveRuntimeSubagentCancellationTarget({
    store,
    plannerRun: makeRun({ planId: 'plan_1' }),
    request: { subagentName: 'Ada' },
  }), {
    kind: 'pending_task',
    planId: 'plan_1',
    plannerRunId: 'run_planner',
    taskId: 'task_pending',
  })
  assert.deepEqual(resolveRuntimeSubagentCancellationTarget({
    store,
    plannerRun: makeRun({ planId: 'plan_1' }),
    request: { taskId: 'task_owned' },
  }), {
    kind: 'run',
    planId: 'plan_1',
    plannerRunId: 'run_planner',
    runId: 'run_worker',
  })
})

test('resolveRuntimeSubagentCancellationTarget rejects non-worker and cross-plan runs', () => {
  const store = new InMemoryAgentStore()
  store.createRun(makeRun({ id: 'run_planner_target', role: 'planner', planId: 'plan_1' }))
  store.createRun(makeRun({ id: 'run_other', role: 'worker', planId: 'plan_2' }))

  assert.throws(() => resolveRuntimeSubagentCancellationTarget({
    store,
    plannerRun: makeRun({ planId: 'plan_1' }),
    request: { runId: 'run_planner_target' },
  }), /can only cancel worker subagent runs/)
  assert.throws(() => resolveRuntimeSubagentCancellationTarget({
    store,
    plannerRun: makeRun({ planId: 'plan_1' }),
    request: { runId: 'run_other' },
  }), /run run_other does not belong to plan plan_1/)
})

test('buildRuntimeSubagentRunCancellationResult summarizes the cancelled worker and snapshot', () => {
  const store = new InMemoryAgentStore()
  store.createTask(makeTask({ id: 'task_1', metadata: { subagentName: 'Writer' } }))
  store.createRun(makeRun({
    id: 'run_worker',
    role: 'worker',
    planId: 'plan_1',
    taskId: 'task_1',
    status: 'cancelled',
  }))
  const plan = makePlan()

  const result = buildRuntimeSubagentRunCancellationResult({
    store,
    plannerRun: makeRun({ planId: 'plan_1' }),
    runId: 'run_worker',
    cancelledRunIds: ['run_worker'],
    getPlanSnapshot: () => ({
      plan,
      tasks: store.listTasks('plan_1'),
      runs: store.listRuns({ planId: 'plan_1' }),
    }),
  })

  assert.equal(result.status, 'cancelled')
  assert.equal((result.target.run as Record<string, unknown>).subagentName, 'Writer')
  assert.deepEqual(result.cancelledRunIds, ['run_worker'])
  assert.equal((result.snapshot.summary as Record<string, unknown>).taskCount, 1)
})

test('applyRuntimeSubagentCancellationFlow cancels pending task targets through update boundary', () => {
  const store = new InMemoryAgentStore()
  store.createTask(makeTask({ id: 'task_pending', metadata: { subagentName: 'Writer' } }))
  const calls: string[] = []

  const result = applyRuntimeSubagentCancellationFlow({
    store,
    plannerRun: makeRun({ planId: 'plan_1' }),
    request: { subagentName: 'Writer', reason: 'stop task' },
    updateTask: (taskId, update) => {
      calls.push(`update:${taskId}:${update.status}:${update.blockedReason}`)
      return applyTaskUpdate(store, taskId, update)
    },
    cancelSubtree: () => {
      throw new Error('cancelSubtree should not be called')
    },
    getPlanSnapshot: () => ({
      plan: makePlan(),
      tasks: store.listTasks('plan_1'),
      runs: [],
    }),
  }) as Record<string, unknown>

  assert.deepEqual(calls, ['update:task_pending:cancelled:stop task'])
  assert.equal(result.status, 'cancelled')
  assert.deepEqual(result.cancelledRunIds, [])
  assert.equal(((result.snapshot as Record<string, unknown>).summary as Record<string, unknown>).taskCount, 1)
})

test('applyRuntimeSubagentCancellationFlow cancels worker run targets through subtree boundary', () => {
  const store = new InMemoryAgentStore()
  store.createTask(makeTask({ id: 'task_owned', ownerRunId: 'run_worker', metadata: { subagentName: 'Turing' } }))
  store.createRun(makeRun({
    id: 'run_worker',
    role: 'worker',
    planId: 'plan_1',
    taskId: 'task_owned',
    status: 'cancelled',
  }))
  const calls: string[] = []

  const result = applyRuntimeSubagentCancellationFlow({
    store,
    plannerRun: makeRun({ planId: 'plan_1' }),
    request: { taskId: 'task_owned', reason: 'stop worker' },
    updateTask: () => {
      throw new Error('updateTask should not be called')
    },
    cancelSubtree: (runId, input) => {
      calls.push(`cancel:${runId}:${input?.reason}`)
      return { cancelledRunIds: [runId] }
    },
    getPlanSnapshot: () => ({
      plan: makePlan(),
      tasks: store.listTasks('plan_1'),
      runs: store.listRuns({ planId: 'plan_1' }),
    }),
  }) as Record<string, unknown>

  assert.deepEqual(calls, ['cancel:run_worker:stop worker'])
  assert.equal(result.status, 'cancelled')
  assert.deepEqual(result.cancelledRunIds, ['run_worker'])
  assert.equal(((result.target as Record<string, unknown>).run as Record<string, unknown>).subagentName, 'Turing')
})

function failUpdate(): AgentTask {
  throw new Error('updateTask should not be called')
}

function applyTaskUpdate(store: InMemoryAgentStore, taskId: string, update: UpdatePlanTaskInput): AgentTask {
  const task = store.getTask(taskId)
  assert.ok(task)
  applyPlanTaskUpdate({
    task,
    update,
    now: '2026-01-01T00:00:01.000Z',
    planTasks: store.listTasks(task.planId),
    getTask: (id) => store.getTask(id),
  })
  store.updateTask(task)
  return task
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
