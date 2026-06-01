import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentRun } from '../state/types.js'
import {
  runtimeRunDisplayThreadIds,
  runtimeRunDisplaysOnThread,
  uniqueRuntimeRunsById,
} from './runtimeRunVisibility.js'

test('runtime run visibility collects unique display thread ids from pending interactions', () => {
  const run = baseRun({
    pendingApprovals: [
      { id: 'approval_1', displayThreadId: 'thread_root', displayAnchor: { threadId: 'thread_root' } },
      { id: 'approval_2', displayAnchor: { threadId: 'thread_side' } },
    ] as AgentRun['pendingApprovals'],
    pendingInputRequests: [
      { id: 'input_1', displayThreadId: 'thread_root' },
    ] as AgentRun['pendingInputRequests'],
  })

  assert.deepEqual(runtimeRunDisplayThreadIds(run), ['thread_root', 'thread_side'])
  assert.equal(runtimeRunDisplaysOnThread(run, 'thread_root'), true)
  assert.equal(runtimeRunDisplaysOnThread(run, 'thread_other'), false)
})

test('uniqueRuntimeRunsById keeps the last run for duplicate ids', () => {
  const first = baseRun({ id: 'run_1', status: 'queued' })
  const second = baseRun({ id: 'run_1', status: 'completed' })

  assert.deepEqual(uniqueRuntimeRunsById([first, second]), [second])
})

function baseRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_worker',
    status: 'requires_action',
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 8,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    steps: [],
    createdAt: '2026-05-23T00:00:00.000Z',
    updatedAt: '2026-05-23T00:00:00.000Z',
    ...overrides,
  }
}
