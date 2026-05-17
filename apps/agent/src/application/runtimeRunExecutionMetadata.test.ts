import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentRun } from '../state/types.js'
import { applyRuntimeRunExecutionMetadata } from './runtimeRunExecutionMetadata.js'

test('applyRuntimeRunExecutionMetadata persists user request while preserving existing metadata', () => {
  const run = makeRun()
  run.metadata = {
    manifestSource: 'default',
    catalogSnapshotId: 'catalog_1',
  }
  const updated: AgentRun[] = []

  applyRuntimeRunExecutionMetadata({
    store: { updateRun: (targetRun) => updated.push({ ...targetRun, metadata: { ...targetRun.metadata } }) },
    run,
    userRequest: 'write a scene',
  })

  assert.deepEqual(run.metadata, {
    manifestSource: 'default',
    catalogSnapshotId: 'catalog_1',
    userRequest: 'write a scene',
  })
  assert.deepEqual(updated.map((item) => item.id), ['run_1'])
})

test('applyRuntimeRunExecutionMetadata stores normalized client input when available', () => {
  const run = makeRun()
  const clientInput = {
    visibleMessage: 'hello',
    attachments: [{ id: 'att_1', name: 'Original' }],
    uiSnapshot: {
      route: { pathname: '/agent' },
    },
  }

  applyRuntimeRunExecutionMetadata({
    store: { updateRun: () => {} },
    run,
    userRequest: 'hello',
    clientInput,
  })

  clientInput.attachments[0]!.name = 'Changed'

  assert.equal(run.metadata?.userRequest, 'hello')
  assert.deepEqual(run.metadata?.clientInput, {
    visibleMessage: 'hello',
    attachments: [{ id: 'att_1', name: 'Original' }],
    uiSnapshot: {
      route: { pathname: '/agent' },
    },
  })
})

function makeRun(): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'in_progress',
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
