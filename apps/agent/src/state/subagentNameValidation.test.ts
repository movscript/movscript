import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertSubagentNamesUniqueForTaskMap,
  assertUniqueSubagentNameForTask,
  collectSubagentNames,
  requireTaskBySubagentName,
  resolveSubagentNameInput,
} from './subagentNameValidation.js'
import type { AgentRun, AgentTask } from './types.js'

test('collectSubagentNames merges task and run subagent names', () => {
  assert.deepEqual(collectSubagentNames([
    makeTask('task_1', 'Writer'),
  ], [
    makeRun('run_1', 'Reviewer'),
  ]), new Set(['Writer', 'Reviewer']))
})

test('requireTaskBySubagentName resolves exact task matches', () => {
  const task = makeTask('task_1', 'Writer')

  assert.equal(requireTaskBySubagentName('plan_1', [task], 'Writer'), task)
  assert.throws(() => requireTaskBySubagentName('plan_1', [], 'Writer'), /subagent not found by name/)
  assert.throws(() => requireTaskBySubagentName('plan_1', [task, makeTask('task_2', 'Writer')], 'Writer'), /ambiguous/)
})

test('resolveSubagentNameInput maps subagent names to task and owner run ids', () => {
  const task = { ...makeTask('task_1', 'Writer'), ownerRunId: 'run_1' }

  assert.deepEqual(resolveSubagentNameInput({
    planId: 'plan_1',
    rawInput: { subagentName: ' Writer ', timeoutMs: 1000 },
    tasks: [task],
  }), {
    subagentName: ' Writer ',
    timeoutMs: 1000,
    taskId: 'task_1',
    runId: 'run_1',
  })

  const rawInput = { taskId: 'task_existing' }
  assert.equal(resolveSubagentNameInput({ planId: 'plan_1', rawInput, tasks: [task] }), rawInput)
})

test('assertUniqueSubagentNameForTask rejects requested task duplicates and persisted run duplicates', () => {
  assert.throws(() => assertUniqueSubagentNameForTask({
    planId: 'plan_1',
    taskId: 'task_1',
    subagentName: 'Writer',
    requestedNames: new Map([['task_2', 'Writer']]),
    tasks: [],
    runs: [],
  }), /subagent name already exists/)

  assert.throws(() => assertUniqueSubagentNameForTask({
    planId: 'plan_1',
    taskId: 'task_1',
    subagentName: 'Writer',
    requestedNames: new Map(),
    tasks: [],
    runs: [makeRun('run_1', 'Writer', 'task_2')],
  }), /subagent name already exists/)
})

test('assertSubagentNamesUniqueForTaskMap rejects duplicate task and run names', () => {
  assert.throws(() => assertSubagentNamesUniqueForTaskMap({
    planId: 'plan_1',
    tasksById: new Map([
      ['task_1', makeTask('task_1', 'Writer')],
      ['task_2', makeTask('task_2', 'Writer')],
    ]),
    runs: [],
  }), /subagent name already exists/)

  assert.throws(() => assertSubagentNamesUniqueForTaskMap({
    planId: 'plan_1',
    tasksById: new Map([['task_1', makeTask('task_1', 'Writer')]]),
    runs: [makeRun('run_1', 'Writer', 'task_2')],
  }), /subagent name already exists/)
})

function makeTask(id: string, subagentName?: string): AgentTask {
  return {
    id,
    planId: 'plan_1',
    deps: [],
    title: id,
    status: 'pending',
    progress: 0,
    artifacts: [],
    ...(subagentName ? { metadata: { subagentName } } : {}),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function makeRun(id: string, subagentName?: string, taskId?: string): AgentRun {
  return {
    id,
    threadId: 'thread_1',
    status: 'in_progress',
    role: 'worker',
    planId: 'plan_1',
    ...(taskId ? { taskId } : {}),
    ...(subagentName ? { metadata: { subagentName } } : {}),
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    steps: [],
  }
}
