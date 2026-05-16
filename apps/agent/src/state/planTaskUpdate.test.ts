import assert from 'node:assert/strict'
import test from 'node:test'
import { applyPlanTaskUpdate } from './planTaskUpdate.js'
import type { AgentTask } from './types.js'

test('applyPlanTaskUpdate applies status timestamps scalar fields and artifacts', () => {
  const task = taskFixture({ status: 'pending', progress: 0 })
  const updated = applyPlanTaskUpdate({
    task,
    update: {
      status: 'running',
      title: ' Updated ',
      description: ' Description ',
      progress: '0.5',
      blockedReason: ' Blocked ',
      artifacts: [{ id: 'artifact_1', type: 'file', title: ' Report ' }],
    },
    now: '2026-05-16T01:00:00.000Z',
    planTasks: [task],
    getTask: (taskId) => taskId === task.id ? task : undefined,
  })
  assert.equal(updated.status, 'running')
  assert.equal(updated.startedAt, '2026-05-16T01:00:00.000Z')
  assert.equal(updated.title, 'Updated')
  assert.equal(updated.description, 'Description')
  assert.equal(updated.progress, 0.5)
  assert.equal(updated.blockedReason, 'Blocked')
  assert.equal(updated.updatedAt, '2026-05-16T01:00:00.000Z')
  assert.deepEqual(updated.artifacts, [{
    id: 'artifact_1',
    type: 'file',
    title: 'Report',
    createdAt: '2026-05-16T01:00:00.000Z',
  }])
})

test('applyPlanTaskUpdate clears optional text fields with empty strings', () => {
  const task = taskFixture({ description: 'Old', blockedReason: 'Old blocker' })
  applyPlanTaskUpdate({
    task,
    update: { description: ' ', blockedReason: ' ' },
    now: 'now',
    planTasks: [task],
    getTask: (taskId) => taskId === task.id ? task : undefined,
  })
  assert.equal(task.description, undefined)
  assert.equal(task.blockedReason, undefined)
})

test('applyPlanTaskUpdate validates parent and dependency references', () => {
  const task = taskFixture({ id: 'task_1' })
  const peer = taskFixture({ id: 'task_2' })
  applyPlanTaskUpdate({
    task,
    update: { parentId: ' task_2 ', deps: [' task_2 '] },
    now: 'now',
    planTasks: [task, peer],
    getTask: (taskId) => [task, peer].find((item) => item.id === taskId),
  })
  assert.equal(task.parentId, 'task_2')
  assert.deepEqual(task.deps, ['task_2'])
})

test('applyPlanTaskUpdate rejects missing foreign and self graph references', () => {
  const task = taskFixture({ id: 'task_1' })
  assert.throws(() => applyPlanTaskUpdate({
    task,
    update: { parentId: 'task_missing' },
    now: 'now',
    planTasks: [task],
    getTask: () => undefined,
  }), /task not found: task_missing/)
  assert.throws(() => applyPlanTaskUpdate({
    task,
    update: { parentId: 'task_other' },
    now: 'now',
    planTasks: [task],
    getTask: () => taskFixture({ id: 'task_other', planId: 'plan_2' }),
  }), /parent task task_other does not belong to plan plan_1/)
  assert.throws(() => applyPlanTaskUpdate({
    task,
    update: { deps: ['task_1'] },
    now: 'now',
    planTasks: [task],
    getTask: (taskId) => taskId === task.id ? task : undefined,
  }), /task task_1 cannot depend on itself/)
})

test('applyPlanTaskUpdate rejects dependency and parent cycles', () => {
  const task = taskFixture({ id: 'task_1' })
  const peer = taskFixture({ id: 'task_2', deps: ['task_1'], parentId: 'task_1' })
  assert.throws(() => applyPlanTaskUpdate({
    task,
    update: { deps: ['task_2'] },
    now: 'now',
    planTasks: [task, peer],
    getTask: (taskId) => [task, peer].find((item) => item.id === taskId),
  }), /task dependency cycle detected/)
  assert.throws(() => applyPlanTaskUpdate({
    task,
    update: { parentId: 'task_2' },
    now: 'now',
    planTasks: [task, peer],
    getTask: (taskId) => [task, peer].find((item) => item.id === taskId),
  }), /task parent cycle detected/)
})

test('applyPlanTaskUpdate validates owner runs and subagent metadata via callbacks', () => {
  const task = taskFixture({ id: 'task_1' })
  const calls: string[] = []
  applyPlanTaskUpdate({
    task,
    update: { ownerRunId: ' run_1 ', metadata: { subagentName: ' Ada ' } },
    now: 'now',
    planTasks: [task],
    getTask: (taskId) => taskId === task.id ? task : undefined,
    validateOwnerRun: (ownerRunId, targetTask) => calls.push(`owner:${ownerRunId}:${targetTask.id}`),
    validateSubagentName: (taskId, subagentName) => calls.push(`name:${taskId}:${subagentName}`),
  })
  assert.equal(task.ownerRunId, 'run_1')
  assert.deepEqual(task.metadata, { subagentName: ' Ada ' })
  assert.deepEqual(calls, ['owner:run_1:task_1', 'name:task_1:Ada'])
})

function taskFixture(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 'task_1',
    planId: 'plan_1',
    deps: [],
    title: 'Task',
    status: 'pending',
    progress: 0,
    artifacts: [],
    createdAt: '2026-05-16T00:00:00.000Z',
    updatedAt: '2026-05-16T00:00:00.000Z',
    ...overrides,
  }
}
