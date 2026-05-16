import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildPendingSubagentTaskCancellationUpdate,
  isPendingSubagentTaskCancellable,
  subagentTaskTarget,
} from './subagentTaskCancellation.js'
import type { AgentTask } from './types.js'

test('isPendingSubagentTaskCancellable accepts only pre-worker task states', () => {
  assert.equal(isPendingSubagentTaskCancellable(task({ status: 'pending' })), true)
  assert.equal(isPendingSubagentTaskCancellable(task({ status: 'blocked' })), true)
  assert.equal(isPendingSubagentTaskCancellable(task({ status: 'needs_review' })), true)
  assert.equal(isPendingSubagentTaskCancellable(task({ status: 'running' })), false)
  assert.equal(isPendingSubagentTaskCancellable(task({ status: 'done' })), false)
})

test('buildPendingSubagentTaskCancellationUpdate returns cancellation fields', () => {
  assert.deepEqual(buildPendingSubagentTaskCancellationUpdate({
    task: task({ progress: 0.4 }),
    plannerRunId: 'run_planner',
    reason: 'No longer needed.',
  }), {
    status: 'cancelled',
    progress: 0.4,
    blockedReason: 'No longer needed.',
    metadata: {
      cancelledByPlannerRunId: 'run_planner',
    },
  })
})

test('buildPendingSubagentTaskCancellationUpdate skips non-cancellable tasks', () => {
  assert.equal(buildPendingSubagentTaskCancellationUpdate({
    task: task({ status: 'running' }),
    plannerRunId: 'run_planner',
  }), undefined)
})

test('subagentTaskTarget includes human-readable subagent name', () => {
  assert.equal(subagentTaskTarget(task({ metadata: { subagentName: 'Writer' } })).subagentName, 'Writer')
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
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}
