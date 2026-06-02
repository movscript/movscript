import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../../../../state/store/core/store.js'
import type { AgentApprovalRequest, AgentRun } from '../../../../state/shared/types.js'
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
  assert.equal(store.getRuntimeInteraction('interaction_approval_1')?.originThreadId, 'thread_1')
  assert.equal(store.getRuntimeInteraction('interaction_approval_1')?.displayThreadId, 'thread_1')
  assert.deepEqual(store.getRuntimeInteraction('interaction_approval_1')?.displayAnchor, {
    threadId: 'thread_1',
    runId: 'run_1',
    placement: 'after',
    reason: 'run',
  })
})

test('materializeRuntimeApprovalInteractions projects worker interactions to the session interactive thread', () => {
  const store = new InMemoryAgentStore()
  store.createSession({
    id: 'session_1',
    rootThreadId: 'thread_root',
    interactiveThreadId: 'thread_root',
    activeThreadId: 'thread_worker',
    createdAt: '2026-05-21T00:00:00.000Z',
    updatedAt: '2026-05-21T00:00:00.000Z',
  })
  const run = makeRun({
    sessionId: 'session_1',
    threadId: 'thread_worker',
    input: {
      schema: 'movscript.agent.run-input.v1',
      userMessage: 'Start worker',
      sourceMessageId: 'msg_root_user',
      executionMode: 'worker',
      createdAt: '2026-05-21T00:00:00.000Z',
    },
  })

  materializeRuntimeApprovalInteractions({
    store,
    run,
    approvals: [approval('approval_1')],
    now: '2026-05-21T00:00:00.000Z',
  })

  const interaction = store.getRuntimeInteraction('interaction_approval_1')
  assert.equal(interaction?.sessionId, 'session_1')
  assert.equal(interaction?.originThreadId, 'thread_worker')
  assert.equal(interaction?.originRunId, 'run_1')
  assert.equal(interaction?.displayThreadId, 'thread_root')
  assert.deepEqual(interaction?.displayAnchor, {
    threadId: 'thread_root',
    runId: 'run_1',
    messageId: 'msg_root_user',
    placement: 'after',
    reason: 'run_source_message',
  })
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

test('approveRuntimeInteraction syncs sibling approval interactions already resolved on the run', () => {
  const store = new InMemoryAgentStore()
  const run = makeRun()
  materializeRuntimeApprovalInteractions({
    store,
    run,
    approvals: [approval('approval_1'), approval('approval_2')],
    now: '2026-05-21T00:00:00.000Z',
  })

  approveRuntimeInteraction({
    store,
    interactionId: 'interaction_approval_1',
    now: '2026-05-21T00:00:02.000Z',
    approveRun: (runId) => ({
      ...run,
      id: runId,
      status: 'queued',
      pendingApprovals: [
        { ...approval('approval_1'), status: 'approved', approvedAt: '2026-05-21T00:00:02.000Z' },
        { ...approval('approval_2'), status: 'approved', approvedAt: '2026-05-21T00:00:02.000Z' },
      ],
    }),
  })

  assert.deepEqual(store.listRuntimeInteractions({ runId: run.id }).map((interaction) => interaction.status), [
    'approved',
    'approved',
  ])
})

test('approveRuntimeInteraction is idempotent for already resolved interactions', () => {
  const store = new InMemoryAgentStore()
  const run = makeRun()
  store.createRun(run)
  materializeRuntimeApprovalInteractions({
    store,
    run,
    approvals: [approval('approval_1')],
    now: '2026-05-21T00:00:00.000Z',
  })
  store.updateRuntimeInteraction({
    ...store.getRuntimeInteraction('interaction_approval_1')!,
    status: 'approved',
    result: { runId: run.id, runStatus: 'queued' },
    resolvedAt: '2026-05-21T00:00:02.000Z',
    updatedAt: '2026-05-21T00:00:02.000Z',
  })
  let delegated = false

  const result = approveRuntimeInteraction({
    store,
    interactionId: 'interaction_approval_1',
    now: '2026-05-21T00:00:03.000Z',
    approveRun: () => {
      delegated = true
      return run
    },
  })

  assert.equal(delegated, false)
  assert.equal(result.interaction.status, 'approved')
  assert.equal(result.run.id, run.id)
})

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'requires_action',
    runtimeLimits: { approvalMode: 'interactive',
      maxToolCalls: 10,
      maxIterations: 5,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-05-21T00:00:00.000Z',
    updatedAt: '2026-05-21T00:00:00.000Z',
    steps: [],
    ...overrides,
  }
}

function approval(id: string): AgentApprovalRequest {
  return {
    id,
    runId: 'run_1',
    toolName: 'core_work_start',
    args: { kind: 'generation_job' },
    reason: 'needs review',
    risk: 'generate',
    permission: 'generation.create',
    status: 'pending',
    createdAt: '2026-05-21T00:00:00.000Z',
    updatedAt: '2026-05-21T00:00:00.000Z',
  }
}
