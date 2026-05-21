import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentApprovalRequest, AgentRun } from '../state/types.js'
import {
  approveRuntimeInteraction,
  materializeRuntimeApprovalInteractions,
} from './runtimeInteractions.js'

test('materializeRuntimeApprovalInteractions creates stable approval interactions once', () => {
  const store = new InMemoryAgentStore()
  const run = makeRun()
  const approvals = [approval('approval_1'), approval('approval_2')]

  const first = materializeRuntimeApprovalInteractions({
    store,
    run,
    approvals,
    now: '2026-05-21T00:00:00.000Z',
  })
  const second = materializeRuntimeApprovalInteractions({
    store,
    run,
    approvals,
    now: '2026-05-21T00:00:01.000Z',
  })

  assert.equal(first.length, 2)
  assert.equal(second.length, 0)
  assert.deepEqual(store.listRuntimeInteractions({ runId: run.id }).map((interaction) => interaction.id), [
    'interaction_approval_1',
    'interaction_approval_2',
  ])
})

test('approveRuntimeInteraction resolves one interaction and delegates selected approval id', () => {
  const store = new InMemoryAgentStore()
  const run = makeRun()
  materializeRuntimeApprovalInteractions({
    store,
    run,
    approvals: [approval('approval_1'), approval('approval_2')],
    now: '2026-05-21T00:00:00.000Z',
  })
  const approvedIds: string[] = []

  const result = approveRuntimeInteraction({
    store,
    interactionId: 'interaction_approval_1',
    now: '2026-05-21T00:00:02.000Z',
    approveRun: (runId, input) => {
      if (Array.isArray(input.approvalIds)) approvedIds.push(...input.approvalIds.filter((id): id is string => typeof id === 'string'))
      return { ...run, id: runId, status: 'queued' }
    },
  })

  assert.deepEqual(approvedIds, ['approval_1'])
  assert.equal(result.interaction.status, 'approved')
  assert.equal(store.getRuntimeInteraction('interaction_approval_1')?.status, 'approved')
  assert.equal(store.getRuntimeInteraction('interaction_approval_2')?.status, 'pending')
})

function makeRun(): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'requires_action',
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 10,
      maxIterations: 5,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-05-21T00:00:00.000Z',
    updatedAt: '2026-05-21T00:00:00.000Z',
    steps: [],
  }
}

function approval(id: string): AgentApprovalRequest {
  return {
    id,
    runId: 'run_1',
    toolName: 'runtime_operation_start',
    args: { kind: 'generation_job' },
    reason: 'needs review',
    risk: 'generate',
    permission: 'generation.create',
    status: 'pending',
    createdAt: '2026-05-21T00:00:00.000Z',
    updatedAt: '2026-05-21T00:00:00.000Z',
  }
}
