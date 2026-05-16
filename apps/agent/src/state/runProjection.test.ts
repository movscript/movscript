import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isActiveRunStatus,
  projectRunOntoThread,
  projectRunStatusOntoThread,
  threadStatusFromRunStatus,
} from './runProjection.js'
import type { AgentRun, AgentThread } from './types.js'

const now = '2026-05-16T00:00:00.000Z'

test('threadStatusFromRunStatus maps run lifecycle to thread lifecycle', () => {
  assert.equal(threadStatusFromRunStatus('queued'), 'running')
  assert.equal(threadStatusFromRunStatus('in_progress'), 'running')
  assert.equal(threadStatusFromRunStatus('requires_action'), 'requires_action')
  assert.equal(threadStatusFromRunStatus('completed'), 'completed')
  assert.equal(threadStatusFromRunStatus('completed_with_warnings'), 'completed')
  assert.equal(threadStatusFromRunStatus('failed'), 'failed')
  assert.equal(threadStatusFromRunStatus('cancelled'), 'cancelled')
})

test('projectRunOntoThread sets active run only for active statuses', () => {
  const thread = buildThread()
  projectRunOntoThread(thread, buildRun('run_1', 'in_progress'))

  assert.equal(thread.lastRunId, 'run_1')
  assert.equal(thread.lastRunStatus, 'in_progress')
  assert.equal(thread.status, 'running')
  assert.equal(thread.activeRunId, 'run_1')

  projectRunOntoThread(thread, buildRun('run_1', 'completed'))
  assert.equal(thread.lastRunStatus, 'completed')
  assert.equal(thread.status, 'completed')
  assert.equal(thread.activeRunId, undefined)
})

test('projectRunStatusOntoThread preserves unrelated active run when updating another terminal run', () => {
  const thread = buildThread({ activeRunId: 'run_active' })
  projectRunStatusOntoThread({
    thread,
    status: 'failed',
    runId: 'run_old',
    now: '2026-05-16T00:00:01.000Z',
  })

  assert.equal(thread.lastRunId, 'run_old')
  assert.equal(thread.lastRunStatus, 'failed')
  assert.equal(thread.status, 'failed')
  assert.equal(thread.activeRunId, 'run_active')
  assert.equal(thread.updatedAt, '2026-05-16T00:00:01.000Z')
})

test('isActiveRunStatus treats requires_action as active for UI interaction state', () => {
  assert.equal(isActiveRunStatus('queued'), true)
  assert.equal(isActiveRunStatus('in_progress'), true)
  assert.equal(isActiveRunStatus('requires_action'), true)
  assert.equal(isActiveRunStatus('completed'), false)
})

function buildThread(input: Partial<AgentThread> = {}): AgentThread {
  return {
    id: 'thread_1',
    title: 'Thread',
    messages: [],
    createdAt: now,
    updatedAt: now,
    ...input,
  }
}

function buildRun(id: string, status: AgentRun['status']): AgentRun {
  return {
    id,
    threadId: 'thread_1',
    status,
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 20,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: now,
    updatedAt: now,
    steps: [],
  }
}
