import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertTaskCreateReferences,
  buildAndValidatePlanTasksToCreate,
} from './planTaskCreation.js'
import type { AgentTask } from './types.js'

test('buildAndValidatePlanTasksToCreate builds tasks and validates requested subagent names', () => {
  const requested: string[] = []
  const tasks = buildAndValidatePlanTasksToCreate({
    planId: 'plan_1',
    inputs: [{
      id: 'task_1',
      title: 'Task',
      metadata: { subagentName: 'Ada' },
    }],
    now: '2026-05-16T00:00:00.000Z',
    getTask: () => undefined,
    validateSubagentName: (taskId, name, requestedNames) => {
      requested.push(`${taskId}:${name}:${requestedNames.get(taskId)}`)
    },
  })
  assert.equal(tasks[0]?.id, 'task_1')
  assert.equal(tasks[0]?.title, 'Task')
  assert.deepEqual(requested, ['task_1:Ada:Ada'])
})

test('buildAndValidatePlanTasksToCreate ignores non-plain metadata subagent names', () => {
  class RuntimeMetadata {
    subagentName = 'Ada'
  }
  const requested: string[] = []

  buildAndValidatePlanTasksToCreate({
    planId: 'plan_1',
    inputs: [{
      id: 'task_1',
      title: 'Task',
      metadata: new RuntimeMetadata() as any,
    }],
    now: '2026-05-16T00:00:00.000Z',
    getTask: () => undefined,
    validateSubagentName: (taskId, name) => {
      requested.push(`${taskId}:${name}`)
    },
  })

  assert.deepEqual(requested, [])
})

test('buildAndValidatePlanTasksToCreate rejects existing and duplicate task ids', () => {
  assert.throws(() => buildAndValidatePlanTasksToCreate({
    planId: 'plan_1',
    inputs: [{ id: 'task_1', title: 'Task' }],
    now: 'now',
    getTask: () => task({ id: 'task_1' }),
  }), /task already exists: task_1/)
  assert.throws(() => buildAndValidatePlanTasksToCreate({
    planId: 'plan_1',
    inputs: [{ id: 'task_1', title: 'Task 1' }, { id: 'task_1', title: 'Task 2' }],
    now: 'now',
    getTask: () => undefined,
  }), /task already exists: task_1/)
})

test('assertTaskCreateReferences accepts references to newly created tasks and existing plan tasks', () => {
  const created = [
    task({ id: 'task_1', parentId: 'task_2', deps: ['task_existing'] }),
    task({ id: 'task_2' }),
  ]
  assert.doesNotThrow(() => assertTaskCreateReferences('plan_1', created, (taskId) => (
    taskId === 'task_existing' ? task({ id: 'task_existing' }) : undefined
  )))
})

test('assertTaskCreateReferences rejects self references and foreign references', () => {
  assert.throws(() => assertTaskCreateReferences('plan_1', [
    task({ id: 'task_1', parentId: 'task_1' }),
  ], () => undefined), /task task_1 cannot use itself as parent/)
  assert.throws(() => assertTaskCreateReferences('plan_1', [
    task({ id: 'task_1', deps: ['task_1'] }),
  ], () => undefined), /task task_1 cannot depend on itself/)
  assert.throws(() => assertTaskCreateReferences('plan_1', [
    task({ id: 'task_1', deps: ['task_other'] }),
  ], () => task({ id: 'task_other', planId: 'plan_2' })), /dependency task task_other does not belong to plan plan_1/)
  assert.throws(() => assertTaskCreateReferences('plan_1', [
    task({ id: 'task_1', deps: ['task_missing'] }),
  ], () => undefined), /task not found: task_missing/)
})

test('buildAndValidatePlanTasksToCreate rejects cycles across existing and new tasks', () => {
  assert.throws(() => buildAndValidatePlanTasksToCreate({
    planId: 'plan_1',
    existingTasks: [task({ id: 'task_existing', deps: ['task_new'] })],
    inputs: [{ id: 'task_new', title: 'New', deps: ['task_existing'] }],
    now: 'now',
    getTask: (taskId) => taskId === 'task_existing' ? task({ id: 'task_existing' }) : undefined,
  }), /task dependency cycle detected/)
})

function task(overrides: Partial<AgentTask> = {}): AgentTask {
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
