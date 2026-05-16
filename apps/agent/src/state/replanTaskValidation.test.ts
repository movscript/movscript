import assert from 'node:assert/strict'
import test from 'node:test'
import {
  normalizeAndValidateReplanTaskUpdates,
  normalizeReplanTaskInputsForPlan,
  normalizeReplanTaskUpdateInputs,
} from './replanTaskValidation.js'
import type { AgentTask } from './types.js'

test('normalizeReplanTaskInputsForPlan splits existing task updates from creates', () => {
  const existingTasks = [task({ id: 'task_existing' })]
  assert.deepEqual(normalizeReplanTaskInputsForPlan({
    planId: 'plan_1',
    tasks: [
      { id: ' task_existing ', title: 'Existing update' },
      { id: 'task_new', title: 'New task' },
      123,
    ],
    addTasks: [{ id: 'task_added', title: 'Added task' }],
    getTask: (taskId) => existingTasks.find((item) => item.id === taskId),
  }), {
    creates: [
      { id: 'task_added', title: 'Added task' },
      { id: 'task_new', title: 'New task' },
    ],
    updates: [
      { id: ' task_existing ', title: 'Existing update' },
    ],
  })
})

test('normalizeReplanTaskInputsForPlan rejects existing tasks from another plan', () => {
  assert.throws(() => normalizeReplanTaskInputsForPlan({
    planId: 'plan_1',
    tasks: [{ id: 'task_other', title: 'Other' }],
    getTask: () => task({ id: 'task_other', planId: 'plan_2' }),
  }), /task task_other does not belong to plan plan_1/)
})

test('normalizeReplanTaskUpdateInputs combines update aliases', () => {
  assert.deepEqual(normalizeReplanTaskUpdateInputs({
    updates: [{ id: 'task_1', title: 'A' }, 1],
    updateTasks: [{ id: 'task_2', title: 'B' }],
  }), [
    { id: 'task_1', title: 'A' },
    { id: 'task_2', title: 'B' },
  ])
})

test('normalizeAndValidateReplanTaskUpdates applies parent deps and metadata to validation copy', () => {
  const existingTasks = [
    task({ id: 'task_1' }),
    task({ id: 'task_2' }),
    task({ id: 'task_3' }),
  ]
  const result = normalizeAndValidateReplanTaskUpdates({
    planId: 'plan_1',
    existingTasks,
    tasksToCreate: [],
    updates: [{
      id: ' task_1 ',
      parentId: ' task_2 ',
      deps: [' task_3 '],
      metadata: { subagentName: 'Ada' },
    }],
    getTask: (taskId) => existingTasks.find((item) => item.id === taskId),
  })
  assert.deepEqual(result, [{
    taskId: 'task_1',
    update: {
      id: ' task_1 ',
      parentId: ' task_2 ',
      deps: [' task_3 '],
      metadata: { subagentName: 'Ada' },
    },
  }])
  assert.equal(existingTasks[0]?.parentId, undefined)
  assert.deepEqual(existingTasks[0]?.deps, [])
})

test('normalizeAndValidateReplanTaskUpdates validates owner runs via callback', () => {
  const existingTasks = [task({ id: 'task_1' })]
  const validated: string[] = []
  normalizeAndValidateReplanTaskUpdates({
    planId: 'plan_1',
    existingTasks,
    tasksToCreate: [],
    updates: [{ id: 'task_1', ownerRunId: ' run_1 ' }],
    getTask: (taskId) => existingTasks.find((item) => item.id === taskId),
    validateOwnerRun: (ownerRunId, targetTask) => {
      validated.push(`${ownerRunId}:${targetTask.id}`)
    },
  })
  assert.deepEqual(validated, ['run_1:task_1'])
})

test('normalizeAndValidateReplanTaskUpdates rejects missing ids and missing tasks', () => {
  assert.throws(() => normalizeAndValidateReplanTaskUpdates({
    planId: 'plan_1',
    existingTasks: [],
    tasksToCreate: [],
    updates: [{ title: 'No id' }],
    getTask: () => undefined,
  }), /task update id is required/)
  assert.throws(() => normalizeAndValidateReplanTaskUpdates({
    planId: 'plan_1',
    existingTasks: [],
    tasksToCreate: [],
    updates: [{ id: 'task_missing' }],
    getTask: () => undefined,
  }), /task not found: task_missing/)
})

test('normalizeAndValidateReplanTaskUpdates distinguishes references from another plan', () => {
  const existingTasks = [task({ id: 'task_1' })]
  assert.throws(() => normalizeAndValidateReplanTaskUpdates({
    planId: 'plan_1',
    existingTasks,
    tasksToCreate: [],
    updates: [{ id: 'task_1', deps: ['task_other'] }],
    getTask: (taskId) => taskId === 'task_other' ? task({ id: 'task_other', planId: 'plan_2' }) : undefined,
  }), /dependency task task_other does not belong to plan plan_1/)
})

test('normalizeAndValidateReplanTaskUpdates rejects self references and cycles', () => {
  const existingTasks = [
    task({ id: 'task_1' }),
    task({ id: 'task_2', deps: ['task_1'] }),
  ]
  assert.throws(() => normalizeAndValidateReplanTaskUpdates({
    planId: 'plan_1',
    existingTasks,
    tasksToCreate: [],
    updates: [{ id: 'task_1', deps: ['task_1'] }],
    getTask: (taskId) => existingTasks.find((item) => item.id === taskId),
  }), /task task_1 cannot depend on itself/)
  assert.throws(() => normalizeAndValidateReplanTaskUpdates({
    planId: 'plan_1',
    existingTasks,
    tasksToCreate: [],
    updates: [{ id: 'task_1', deps: ['task_2'] }],
    getTask: (taskId) => existingTasks.find((item) => item.id === taskId),
  }), /task dependency cycle detected/)
})

test('normalizeAndValidateReplanTaskUpdates runs task-name validation after updates', () => {
  const existingTasks = [task({ id: 'task_1' })]
  assert.throws(() => normalizeAndValidateReplanTaskUpdates({
    planId: 'plan_1',
    existingTasks,
    tasksToCreate: [],
    updates: [{ id: 'task_1', metadata: { subagentName: 'Ada' } }],
    getTask: (taskId) => existingTasks.find((item) => item.id === taskId),
    validateTaskNames: (tasksById) => {
      assert.equal(tasksById.get('task_1')?.metadata?.subagentName, 'Ada')
      throw new Error('duplicate name')
    },
  }), /duplicate name/)
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
