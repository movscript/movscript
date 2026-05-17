import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildAgentTask,
  normalizePlanTaskInputs,
  normalizePlanTaskUpdateInputs,
  normalizePositiveInteger,
  normalizeProgress,
  normalizeStringList,
  normalizeTaskArtifacts,
  normalizeTaskStatus,
  selectPlannerInlineTask,
  taskExecutionMaxTaskAttempts,
  taskExecutionOverrideMetadata,
  taskExecutionWorkerTimeoutMs,
} from './planTaskInput.js'
import type { AgentTask } from './types.js'

test('normalizes task status and progress', () => {
  assert.equal(normalizeTaskStatus('needs_review'), 'needs_review')
  assert.equal(normalizeTaskStatus('unknown'), undefined)
  assert.equal(normalizeProgress('-1'), 0)
  assert.equal(normalizeProgress(0.4), 0.4)
  assert.equal(normalizeProgress('2'), 1)
  assert.equal(normalizeProgress('abc'), undefined)
})

test('normalizes positive integer and string list inputs', () => {
  assert.equal(normalizePositiveInteger('3.8'), 3)
  assert.equal(normalizePositiveInteger(0), 1)
  assert.equal(normalizePositiveInteger('abc'), undefined)
  assert.deepEqual(normalizeStringList([' a ', '', 1, 'b']), ['a', 'b'])
})

test('normalizes create and update task arrays', () => {
  assert.deepEqual(normalizePlanTaskInputs([{ title: 'A' }, null, 'bad']), [{ title: 'A' }])
  assert.deepEqual(normalizePlanTaskUpdateInputs([{ id: 'task_1' }, 1]), [{ id: 'task_1' }])
  assert.deepEqual(normalizePlanTaskInputs({ title: 'A' }), [])
})

test('buildAgentTask trims fields and keeps json metadata plus execution overrides', () => {
  const task = buildAgentTask('plan_1', {
    id: ' task_1 ',
    parentId: ' parent_1 ',
    deps: [' dep_1 ', '', 'dep_2'],
    title: ' Task ',
    description: ' Description ',
    maxTaskAttempts: '2',
    workerTimeoutMs: 5000,
    metadata: {
      subagentName: 'Agent 1',
      bad: undefined,
    },
  }, '2026-05-16T00:00:00.000Z')
  assert.deepEqual(task, {
    id: 'task_1',
    planId: 'plan_1',
    parentId: 'parent_1',
    deps: ['dep_1', 'dep_2'],
    title: 'Task',
    description: 'Description',
    status: 'pending',
    progress: 0,
    artifacts: [],
    metadata: {
      maxTaskAttempts: 2,
      workerTimeoutMs: 5000,
    },
    createdAt: '2026-05-16T00:00:00.000Z',
    updatedAt: '2026-05-16T00:00:00.000Z',
  })
})

test('buildAgentTask rejects missing titles', () => {
  assert.throws(() => buildAgentTask('plan_1', {}, 'now'), /task title is required/)
})

test('buildAgentTask stores an independent metadata snapshot', () => {
  const metadata = {
    nested: { value: 'original' },
    list: [{ id: 'item_1' }],
  }
  const task = buildAgentTask('plan_1', {
    id: 'task_1',
    title: 'Task',
    metadata,
  }, '2026-05-16T00:00:00.000Z')

  metadata.nested.value = 'changed'
  metadata.list[0]!.id = 'changed'

  assert.deepEqual(task.metadata, {
    nested: { value: 'original' },
    list: [{ id: 'item_1' }],
  })
})

test('normalizes task execution metadata and defaults', () => {
  assert.deepEqual(taskExecutionOverrideMetadata({
    title: 'Task',
    maxTaskAttempts: '4',
    workerTimeoutMs: '900',
  }), {
    maxTaskAttempts: 4,
    workerTimeoutMs: 900,
  })
  const task = taskFixture({ metadata: { maxTaskAttempts: 3, workerTimeoutMs: 1000 } })
  assert.equal(taskExecutionMaxTaskAttempts(task, 1), 3)
  assert.equal(taskExecutionWorkerTimeoutMs(task, 500), 1000)
  assert.equal(taskExecutionWorkerTimeoutMs(undefined, 500), 500)
})

test('selectPlannerInlineTask only selects a single planner-owned simple task', () => {
  const task = taskFixture()
  assert.equal(selectPlannerInlineTask([task])?.id, task.id)
  assert.equal(selectPlannerInlineTask([{ ...task, deps: ['dep_1'] }]), undefined)
  assert.equal(selectPlannerInlineTask([{ ...task, metadata: { executionMode: 'worker' } }]), undefined)
  assert.equal(selectPlannerInlineTask([task, taskFixture({ id: 'task_2' })]), undefined)
})

test('normalizeTaskArtifacts trims valid artifacts and drops invalid metadata', () => {
  assert.deepEqual(normalizeTaskArtifacts([
    {
      id: ' artifact_1 ',
      type: ' file ',
      title: ' Report ',
      uri: ' file://report ',
      metadata: { sourceTaskId: 'task_1', bad: undefined },
      createdAt: ' custom ',
    },
    { title: 'missing type' },
  ], '2026-05-16T00:00:00.000Z'), [{
    id: 'artifact_1',
    type: 'file',
    title: 'Report',
    uri: 'file://report',
    createdAt: 'custom',
  }])
})

test('normalizeTaskArtifacts stores independent artifact metadata snapshots', () => {
  const metadata = {
    source: { taskId: 'task_1' },
    tags: ['draft'],
  }
  const artifacts = normalizeTaskArtifacts([{
    id: 'artifact_1',
    type: 'file',
    metadata,
  }], '2026-05-16T00:00:00.000Z')

  metadata.source.taskId = 'changed'
  metadata.tags[0] = 'changed'

  assert.deepEqual(artifacts[0]?.metadata, {
    source: { taskId: 'task_1' },
    tags: ['draft'],
  })
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
