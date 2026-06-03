import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../../../../state/store/core/store.js'
import type { AgentRun, AgentThread } from '../../../../state/shared/types.js'
import { updateRuntimePlan } from './runtimePlanTools.js'

test('updateRuntimePlan upserts current plan and appends immutable revisions', () => {
  const store = new InMemoryAgentStore()
  const thread = baseThread()
  store.createThread(thread)
  const run = baseRun(thread.id)
  store.createRun(run)

  const first = updateRuntimePlan({
    store,
    run,
    now: '2026-05-22T00:00:00.000Z',
    planId: 'plan_1',
    revisionId: 'plan_revision_1',
    request: {
      explanation: 'initial pass',
      tasks: [
        { step: 'Inspect state shape', status: 'completed' },
        { step: 'Wire update tool', status: 'in_progress' },
      ],
    },
  })

  const updated = updateRuntimePlan({
    store,
    run,
    now: '2026-05-22T00:01:00.000Z',
    revisionId: 'plan_revision_2',
    request: {
      tasks: [
        { step: 'Inspect state shape', status: 'completed' },
        { step: 'Wire update tool', status: 'completed' },
      ],
    },
  })

  const saved = store.getThread(thread.id)!
  assert.equal(first.plan.id, 'plan_1')
  assert.equal(updated.plan.id, 'plan_1')
  assert.equal(saved.currentPlan?.completedCount, 2)
  assert.equal(saved.planRevisions?.length, 2)
  assert.equal(saved.planRevisions?.[0].snapshot.items[1].status, 'in_progress')
  assert.equal(saved.planRevisions?.[1].snapshot.items[1].status, 'completed')
  assert.equal(saved.messages.length, 0)
  assert.equal(saved.updatedAt, '2026-05-22T00:01:00.000Z')
})

test('updateRuntimePlan rejects more than one in_progress item', () => {
  const store = new InMemoryAgentStore()
  const thread = baseThread()
  store.createThread(thread)
  const run = baseRun(thread.id)
  store.createRun(run)

  assert.throws(() => updateRuntimePlan({
    store,
    run,
    request: {
      tasks: [
        { step: 'One', status: 'in_progress' },
        { step: 'Two', status: 'in_progress' },
      ],
    },
  }), /at most one in_progress/)
})

test('updateRuntimePlan accepts user-facing plan task wording', () => {
  const store = new InMemoryAgentStore()
  const thread = baseThread()
  store.createThread(thread)
  const run = baseRun(thread.id)
  store.createRun(run)

  const result = updateRuntimePlan({
    store,
    run,
    request: {
      planId: 'plan1',
      tasks: [
        { name: '任务1', status: '未就绪' },
        { title: '任务2', status: 'not_ready' },
      ],
    },
  })

  assert.equal(result.plan.id, 'plan1')
  assert.deepEqual(result.plan.items, [
    { step: '任务1', status: 'pending' },
    { step: '任务2', status: 'pending' },
  ])
  assert.deepEqual(store.getThread(thread.id)?.currentPlan?.items, result.plan.items)
})

test('updateRuntimePlan returns unchanged for identical current plan snapshots', () => {
  const store = new InMemoryAgentStore()
  const thread = baseThread()
  store.createThread(thread)
  const run = baseRun(thread.id)
  store.createRun(run)

  updateRuntimePlan({
    store,
    run,
    now: '2026-05-22T00:00:00.000Z',
    planId: 'plan_1',
    revisionId: 'plan_revision_1',
    request: {
      tasks: [
        { step: 'Inspect state shape', status: 'completed' },
        { step: 'Wire update tool', status: 'in_progress' },
      ],
    },
  })

  const unchanged = updateRuntimePlan({
    store,
    run,
    now: '2026-05-22T00:01:00.000Z',
    revisionId: 'plan_revision_duplicate',
    request: {
      tasks: [
        { step: 'Inspect state shape', status: 'completed' },
        { step: 'Wire update tool', status: 'in_progress' },
      ],
    },
  })

  const saved = store.getThread(thread.id)!
  assert.equal(unchanged.status, 'unchanged')
  assert.equal(unchanged.revision, undefined)
  assert.equal(saved.planRevisions?.length, 1)
  assert.equal(saved.messages.length, 0)
  assert.equal(saved.updatedAt, '2026-05-22T00:00:00.000Z')
})

function baseThread(): AgentThread {
  return {
    id: 'thread_1',
    status: 'idle',
    archived: false,
    createdAt: '2026-05-22T00:00:00.000Z',
    updatedAt: '2026-05-22T00:00:00.000Z',
    messages: [],
  }
}

function baseRun(threadId: string): AgentRun {
  return {
    id: 'run_1',
    threadId,
    status: 'in_progress',
    runtimeLimits: { approvalMode: 'auto',
      maxToolCalls: 10,
      maxIterations: 10,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-05-22T00:00:00.000Z',
    updatedAt: '2026-05-22T00:00:00.000Z',
    steps: [],
  }
}
