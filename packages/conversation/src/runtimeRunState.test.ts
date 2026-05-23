import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveRuntimeThreadRunState } from './index'
import type { AgentRun, RuntimeInteraction } from '@movscript/protocol'

test('resolveRuntimeThreadRunState merges ensured runs before selecting current run', () => {
  const listedRun = run({ id: 'run_listed' })
  const ensuredRun = run({ id: 'run_ensured', status: 'requires_action' })

  const result = resolveRuntimeThreadRunState({
    runs: [listedRun],
    ensureRuns: [ensuredRun],
    current: { activeRunIds: ['run_listed'] },
  })

  assert.deepEqual(result.runs.map((item) => item.id), ['run_listed', 'run_ensured'])
  assert.equal(result.currentRun?.id, 'run_listed')
})

test('resolveRuntimeThreadRunState prioritizes pending interactions as actionable current runs', () => {
  const completedRun = run({ id: 'run_completed', status: 'completed' })
  const pendingRun = run({
    id: 'run_pending',
    status: 'requires_action',
    updatedAt: '2026-05-19T00:00:05.000Z',
    pendingInputRequests: [{
      id: 'input_1',
      runId: 'run_pending',
      title: 'Confirm direction',
      question: 'Which direction?',
      inputType: 'choice',
      choices: [{ id: 'a', label: 'A' }],
      allowCustomAnswer: false,
      status: 'pending',
      createdAt: '2026-05-19T00:00:04.000Z',
      updatedAt: '2026-05-19T00:00:04.000Z',
    }],
  })

  const result = resolveRuntimeThreadRunState({
    runs: [completedRun, pendingRun],
    current: { activeRunIds: [completedRun.id] },
    interactions: [interaction({ id: 'interaction_input_1', runId: pendingRun.id, kind: 'input', status: 'pending' })],
  })

  assert.deepEqual(result.actionableRuns.map((item) => item.id), ['run_pending'])
  assert.equal(result.currentRun?.id, 'run_pending')
})

test('resolveRuntimeThreadRunState exposes approval and continuation interaction ids on runs', () => {
  const approvalRun = run({
    id: 'run_approval',
    status: 'requires_action',
    pendingApprovals: [{
      id: 'approval_1',
      runId: 'run_approval',
      toolName: 'files.edit',
      reason: 'Needs approval',
      status: 'pending',
      createdAt: NOW,
      updatedAt: NOW,
    }],
  })
  const completedRun = run({ id: 'run_completed', status: 'completed' })

  const result = resolveRuntimeThreadRunState({
    runs: [approvalRun, completedRun],
    interactions: [
      interaction({
        id: 'interaction_approval_1',
        runId: approvalRun.id,
        kind: 'approval',
        status: 'pending',
        payload: { approvalId: 'approval_1' },
        displayThreadId: 'thread_root',
        displayAnchor: {
          threadId: 'thread_root',
          runId: approvalRun.id,
          messageId: 'msg_root',
          placement: 'after',
          reason: 'run_source_message',
        },
      }),
      interaction({
        id: 'interaction_continuation_1',
        runId: completedRun.id,
        kind: 'selection',
        status: 'pending',
        payload: {
          type: 'runtime_continuation_resume',
          continuationId: 'continuation_1',
          workIds: ['work_1'],
          summary: '异步任务已完成，是否继续？',
        },
        displayThreadId: 'thread_root',
        displayAnchor: {
          threadId: 'thread_root',
          runId: completedRun.id,
          messageId: 'msg_completed',
          placement: 'after',
          reason: 'continuation_ready',
        },
      }),
    ],
  })

  assert.equal(result.runs[0]?.pendingApprovals?.[0]?.interactionId, 'interaction_approval_1')
  assert.equal(result.runs[0]?.pendingApprovals?.[0]?.displayThreadId, 'thread_root')
  assert.equal(result.runs[0]?.pendingApprovals?.[0]?.displayAnchor?.messageId, 'msg_root')
  assert.deepEqual(result.actionableRuns.map((item) => item.id), ['run_approval', 'run_completed'])
  const continuationApproval = result.runs[1]?.pendingApprovals?.[0]
  assert.equal(continuationApproval?.interactionId, 'interaction_continuation_1')
  assert.equal(continuationApproval?.displayThreadId, 'thread_root')
  assert.equal(continuationApproval?.displayAnchor?.messageId, 'msg_completed')
  assert.equal(continuationApproval?.toolName, 'runtime_continuation_resume')
  assert.deepEqual(continuationApproval?.args, {
    continuationId: 'continuation_1',
    workIds: ['work_1'],
  })
})

const NOW = '2026-05-19T00:00:00.000Z'

function run(overrides: Partial<AgentRun> & { id: string }): AgentRun {
  return {
    id: overrides.id,
    threadId: 'thread_1',
    status: overrides.status ?? 'completed',
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: NOW,
    updatedAt: NOW,
    steps: [],
    ...overrides,
  }
}

function interaction(overrides: Partial<RuntimeInteraction> & { id: string; runId: string; kind: RuntimeInteraction['kind']; status: RuntimeInteraction['status'] }): RuntimeInteraction {
  return {
    id: overrides.id,
    threadId: 'thread_1',
    runId: overrides.runId,
    kind: overrides.kind,
    status: overrides.status,
    payload: {},
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}
