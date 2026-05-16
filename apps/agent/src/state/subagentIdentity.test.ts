import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildRequestedSubagentNameMap,
  DEFAULT_SUBAGENT_NAMES,
  nextSubagentName,
  normalizeSubagentNameAt,
  subagentNameConflicts,
  subagentNameFromRun,
  subagentNameFromTask,
} from './subagentIdentity.js'
import type { AgentRun, AgentTask } from './types.js'

test('buildRequestedSubagentNameMap handles single task and single name shorthand', () => {
  assert.deepEqual(Object.fromEntries(buildRequestedSubagentNameMap({
    subagentName: ' Ada ',
  }, ['task_1'])), {
    task_1: 'Ada',
  })
  assert.deepEqual(Object.fromEntries(buildRequestedSubagentNameMap({
    taskId: ' task_2 ',
    subagentName: ' Turing ',
  }, ['task_1', 'task_2'])), {
    task_2: 'Turing',
  })
})

test('buildRequestedSubagentNameMap supports object and ordered array mappings', () => {
  assert.deepEqual(Object.fromEntries(buildRequestedSubagentNameMap({
    subagentNames: {
      task_2: ' Grace ',
      task_3: '',
    },
  }, ['task_1', 'task_2', 'task_3'])), {
    task_2: 'Grace',
  })
  assert.deepEqual(Object.fromEntries(buildRequestedSubagentNameMap({
    subagentNames: [' Ada ', '', ' Grace '],
  }, ['task_1', 'task_2', 'task_3'])), {
    task_1: 'Ada',
    task_2: 'Grace',
  })
})

test('normalizeSubagentNameAt reads array values by index', () => {
  assert.equal(normalizeSubagentNameAt([' Ada ', ' Turing '], 1), 'Turing')
  assert.equal(normalizeSubagentNameAt([' Ada '], 2), undefined)
})

test('nextSubagentName returns the first unused neutral name and extends the sequence', () => {
  assert.equal(nextSubagentName(new Set()), 'Agent 1')
  assert.equal(nextSubagentName(new Set(['Agent 1', 'Agent 2'])), 'Agent 3')
  assert.equal(nextSubagentName(new Set(DEFAULT_SUBAGENT_NAMES)), 'Agent 11')
})

test('subagentNameFromTask and subagentNameFromRun trim metadata names', () => {
  assert.equal(subagentNameFromTask(task({ metadata: { subagentName: ' Ada ' } })), 'Ada')
  assert.equal(subagentNameFromTask(task({ metadata: { subagentName: '' } })), undefined)
  assert.equal(subagentNameFromRun(run({ metadata: { subagentName: ' Turing ' } })), 'Turing')
})

test('subagentNameConflicts returns sorted duplicate-name groups', () => {
  assert.deepEqual(subagentNameConflicts([
    task({ id: 'task_1', metadata: { subagentName: 'Turing' } }),
    task({ id: 'task_2', metadata: { subagentName: 'Ada' } }),
    task({ id: 'task_3', metadata: { subagentName: 'Turing' } }),
    task({ id: 'task_4', metadata: { subagentName: 'Ada' } }),
    task({ id: 'task_5' }),
  ]), [
    { subagentName: 'Ada', taskIds: ['task_2', 'task_4'] },
    { subagentName: 'Turing', taskIds: ['task_1', 'task_3'] },
  ])
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

function run(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'queued',
    policy: {
      approvalMode: 'auto',
      sandboxMode: false,
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-05-16T00:00:00.000Z',
    updatedAt: '2026-05-16T00:00:00.000Z',
    steps: [],
    ...overrides,
  }
}
