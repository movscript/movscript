import assert from 'node:assert/strict'
import test from 'node:test'
import { buildRuntimeThreadSnapshotV2 } from './runtimeThreadSnapshot.js'

test('buildRuntimeThreadSnapshotV2 projects runtime work state', () => {
  const snapshot = buildRuntimeThreadSnapshotV2({
    thread: {
      id: 'thread_1',
      messages: [],
      createdAt: '2026-05-22T00:00:00.000Z',
      updatedAt: '2026-05-22T00:00:00.000Z',
    },
    runs: [{
      id: 'run_1',
      threadId: 'thread_1',
      status: 'completed',
      policy: {
        approvalMode: 'interactive',
        maxToolCalls: 8,
        maxIterations: 8,
        allowNetwork: false,
        allowFileBytes: false,
      },
      steps: [],
      createdAt: '2026-05-22T00:00:00.000Z',
      updatedAt: '2026-05-22T00:00:01.000Z',
    }],
    works: [{
      id: 'work_1',
      threadId: 'thread_1',
      runId: 'run_1',
      kind: 'generation_job',
      mode: 'async',
      status: 'waiting',
      request: { prompt: 'image' },
      createdAt: '2026-05-22T00:00:02.000Z',
      updatedAt: '2026-05-22T00:00:03.000Z',
    }],
    interactions: [],
    continuations: [],
    wakeEvents: [{
      id: 'wake_1',
      threadId: 'thread_1',
      runId: 'run_1',
      workId: 'work_1',
      kind: 'work.observed',
      status: 'queued',
      payload: { workId: 'work_1' },
      dedupeKey: 'work.observed:work_1:completed:2026-05-22T00:00:04.000Z',
      createdAt: '2026-05-22T00:00:04.000Z',
      updatedAt: '2026-05-22T00:00:04.000Z',
    }],
  })

  assert.deepEqual(snapshot.current.runningWorkIds, ['work_1'])
  assert.deepEqual(snapshot.current.queuedWakeEventIds, ['wake_1'])
  assert.equal(snapshot.updatedAt, '2026-05-22T00:00:04.000Z')
  assert.equal(snapshot.works[0]?.id, 'work_1')
})
