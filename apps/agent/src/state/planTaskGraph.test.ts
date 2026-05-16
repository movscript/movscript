import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertTaskDependencyGraphAcyclic,
  assertTaskParentGraphAcyclic,
  cloneTaskForValidation,
} from './planTaskGraph.js'
import type { AgentTask } from './types.js'

test('cloneTaskForValidation copies mutable arrays and metadata', () => {
  const task = taskFixture({
    deps: ['task_2'],
    artifacts: [{
      id: 'artifact_1',
      type: 'file',
      metadata: { sourceTaskId: 'task_1' },
      createdAt: '2026-05-16T00:00:00.000Z',
    }],
    metadata: { subagentName: 'Ada' },
  })
  const clone = cloneTaskForValidation(task)
  assert.deepEqual(clone, task)
  assert.notEqual(clone.deps, task.deps)
  assert.notEqual(clone.artifacts, task.artifacts)
  assert.notEqual(clone.metadata, task.metadata)
})

test('assertTaskDependencyGraphAcyclic accepts acyclic dependencies and overrides', () => {
  assert.doesNotThrow(() => assertTaskDependencyGraphAcyclic([
    taskFixture({ id: 'task_1', deps: ['task_2'] }),
    taskFixture({ id: 'task_2', deps: [] }),
  ]))
  assert.doesNotThrow(() => assertTaskDependencyGraphAcyclic([
    taskFixture({ id: 'task_1', deps: ['external_task'] }),
  ], new Map([['task_2', ['task_1']]])))
})

test('assertTaskDependencyGraphAcyclic reports dependency cycles with path', () => {
  assert.throws(() => assertTaskDependencyGraphAcyclic([
    taskFixture({ id: 'task_1', deps: ['task_2'] }),
    taskFixture({ id: 'task_2', deps: ['task_3'] }),
    taskFixture({ id: 'task_3', deps: ['task_1'] }),
  ]), /task dependency cycle detected: task_1 -> task_2 -> task_3 -> task_1/)
})

test('assertTaskParentGraphAcyclic accepts acyclic parent hierarchy and overrides', () => {
  assert.doesNotThrow(() => assertTaskParentGraphAcyclic([
    taskFixture({ id: 'task_1', parentId: 'task_2' }),
    taskFixture({ id: 'task_2' }),
  ]))
  assert.doesNotThrow(() => assertTaskParentGraphAcyclic([
    taskFixture({ id: 'task_1', parentId: 'external_task' }),
  ], new Map([['task_2', 'task_1']])))
})

test('assertTaskParentGraphAcyclic reports parent cycles with path', () => {
  assert.throws(() => assertTaskParentGraphAcyclic([
    taskFixture({ id: 'task_1', parentId: 'task_2' }),
    taskFixture({ id: 'task_2', parentId: 'task_3' }),
    taskFixture({ id: 'task_3', parentId: 'task_1' }),
  ]), /task parent cycle detected: task_1 -> task_2 -> task_3 -> task_1/)
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
