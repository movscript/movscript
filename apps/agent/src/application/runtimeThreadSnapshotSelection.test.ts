import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentRun, AgentThread } from '../state/types.js'
import { selectRuntimeSnapshotRunsForThread } from './runtimeThreadSnapshotSelection.js'

test('selectRuntimeSnapshotRunsForThread selects session runs visible on the thread', () => {
  const root = baseThread({ id: 'thread_root', sessionId: 'session_1' })
  const rootRun = baseRun({ id: 'run_root', threadId: root.id, sessionId: 'session_1' })
  const visibleWorker = baseRun({
    id: 'run_worker',
    threadId: 'thread_worker',
    sessionId: 'session_1',
    pendingInputRequests: [{ id: 'input_1', displayThreadId: root.id }] as AgentRun['pendingInputRequests'],
  })
  const hiddenWorker = baseRun({ id: 'run_hidden', threadId: 'thread_hidden', sessionId: 'session_1' })
  const queries: unknown[] = []

  const runs = selectRuntimeSnapshotRunsForThread({
    thread: root,
    store: {
      listRuns: (query) => {
        queries.push(query)
        return [rootRun, visibleWorker, hiddenWorker, visibleWorker]
      },
    },
  })

  assert.deepEqual(queries, [{ sessionId: 'session_1' }])
  assert.deepEqual(runs.map((run) => run.id), ['run_root', 'run_worker'])
})

test('selectRuntimeSnapshotRunsForThread falls back to thread-scoped run lookup without a session', () => {
  const thread = baseThread({ id: 'thread_direct', sessionId: undefined })
  const queries: unknown[] = []

  selectRuntimeSnapshotRunsForThread({
    thread,
    store: {
      listRuns: (query) => {
        queries.push(query)
        return []
      },
    },
  })

  assert.deepEqual(queries, [{ threadId: 'thread_direct' }])
})

function baseThread(overrides: Partial<AgentThread> = {}): AgentThread {
  return {
    id: 'thread_root',
    status: 'idle',
    archived: false,
    messages: [],
    createdAt: '2026-05-23T00:00:00.000Z',
    updatedAt: '2026-05-23T00:00:00.000Z',
    ...overrides,
  }
}

function baseRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_root',
    status: 'queued',
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
