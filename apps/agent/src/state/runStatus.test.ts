import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST } from '../catalog/agentManifest.js'
import type { AgentRun } from './types.js'
import {
  applyRunCancellation,
  applyRunCompletion,
  applyRunExecutionStart,
  applyRunFailure,
  DEFAULT_RUN_CANCEL_REASON,
  isActiveRunStatus,
  isFinishedOrCancelledRunStatus,
  isFinishedRunStatus,
} from './runStatus.js'

test('isActiveRunStatus treats queued in-progress and requires-action runs as active', () => {
  assert.equal(isActiveRunStatus('queued'), true)
  assert.equal(isActiveRunStatus('in_progress'), true)
  assert.equal(isActiveRunStatus('requires_action'), true)
  assert.equal(isActiveRunStatus('completed'), false)
})

test('finished run status excludes cancellation and pending interaction states', () => {
  assert.equal(isFinishedRunStatus('completed'), true)
  assert.equal(isFinishedRunStatus('completed_with_warnings'), true)
  assert.equal(isFinishedRunStatus('failed'), true)
  assert.equal(isFinishedRunStatus('cancelled'), false)
  assert.equal(isFinishedRunStatus('requires_action'), false)
})

test('finished-or-cancelled run status includes cancellation', () => {
  assert.equal(isFinishedOrCancelledRunStatus('cancelled'), true)
  assert.equal(isFinishedOrCancelledRunStatus('completed'), true)
  assert.equal(isFinishedOrCancelledRunStatus('queued'), false)
})

test('applyRunExecutionStart marks a run in progress and records start time', () => {
  const run = buildRun({ status: 'queued' })

  applyRunExecutionStart(run, '2026-05-16T00:00:01.000Z')

  assert.equal(run.status, 'in_progress')
  assert.equal(run.startedAt, '2026-05-16T00:00:01.000Z')
  assert.equal(run.updatedAt, '2026-05-16T00:00:01.000Z')
})

test('applyRunCancellation marks run cancelled and resolves pending interactions', () => {
  const run = buildRun({
    pendingApprovals: [{
      id: 'approval_1',
      runId: 'run_1',
      toolName: 'write_file',
      args: {},
      reason: 'needs approval',
      status: 'pending',
      createdAt: '2026-05-16T00:00:00.000Z',
      updatedAt: '2026-05-16T00:00:00.000Z',
    }],
    pendingInputRequests: [{
      id: 'input_1',
      runId: 'run_1',
      title: 'Need input',
      question: 'Continue?',
      inputType: 'confirmation',
      choices: [],
      allowCustomAnswer: false,
      status: 'pending',
      createdAt: '2026-05-16T00:00:00.000Z',
      updatedAt: '2026-05-16T00:00:00.000Z',
    }],
  })

  applyRunCancellation(run, '2026-05-16T00:00:01.000Z', 'stopped')

  assert.equal(run.status, 'cancelled')
  assert.equal(run.cancelledAt, '2026-05-16T00:00:01.000Z')
  assert.equal(run.completedAt, '2026-05-16T00:00:01.000Z')
  assert.equal(run.updatedAt, '2026-05-16T00:00:01.000Z')
  assert.deepEqual(run.warnings, ['stopped'])
  assert.equal(run.pendingApprovals?.[0]?.status, 'rejected')
  assert.equal(run.pendingApprovals?.[0]?.rejectedAt, '2026-05-16T00:00:01.000Z')
  assert.equal(run.pendingInputRequests?.[0]?.status, 'cancelled')
})

test('applyRunCancellation uses the default user-facing reason once', () => {
  const run = buildRun({ warnings: [DEFAULT_RUN_CANCEL_REASON] })

  applyRunCancellation(run, '2026-05-16T00:00:01.000Z')

  assert.equal(run.status, 'cancelled')
  assert.deepEqual(run.warnings, [DEFAULT_RUN_CANCEL_REASON])
})

test('applyRunCompletion records assistant message, metadata, and warning status', () => {
  const run = buildRun({ metadata: { existing: true } })

  applyRunCompletion(run, {
    now: '2026-05-16T00:00:01.000Z',
    assistantMessageId: 'msg_1',
    warnings: ['careful'],
    metadataPatch: { memoryIds: ['mem_1'] },
  })

  assert.equal(run.status, 'completed_with_warnings')
  assert.equal(run.assistantMessageId, 'msg_1')
  assert.deepEqual(run.warnings, ['careful'])
  assert.equal(run.completedAt, '2026-05-16T00:00:01.000Z')
  assert.equal(run.updatedAt, '2026-05-16T00:00:01.000Z')
  assert.deepEqual(run.metadata, { existing: true, memoryIds: ['mem_1'] })
})

test('applyRunCompletion stores an independent metadata patch snapshot', () => {
  const run = buildRun({ metadata: { existing: { value: 'stable' } } })
  const metadataPatch = {
    nested: { value: 'original' },
    list: [{ id: 'item_1' }],
  }

  applyRunCompletion(run, {
    now: '2026-05-16T00:00:01.000Z',
    assistantMessageId: 'msg_1',
    metadataPatch,
  })

  metadataPatch.nested.value = 'changed'
  metadataPatch.list[0]!.id = 'changed'

  assert.deepEqual(run.metadata, {
    existing: { value: 'stable' },
    nested: { value: 'original' },
    list: [{ id: 'item_1' }],
  })
})

test('applyRunFailure records terminal failure fields', () => {
  const run = buildRun()

  applyRunFailure(run, '2026-05-16T00:00:01.000Z', 'boom')

  assert.equal(run.status, 'failed')
  assert.equal(run.error, 'boom')
  assert.equal(run.failedAt, '2026-05-16T00:00:01.000Z')
  assert.equal(run.updatedAt, '2026-05-16T00:00:01.000Z')
})

function buildRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'requires_action',
    agentManifest: DEFAULT_AGENT_MANIFEST,
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 20,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-05-16T00:00:00.000Z',
    updatedAt: '2026-05-16T00:00:00.000Z',
    steps: [],
    traceEvents: [],
    ...overrides,
  }
}
