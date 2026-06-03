import test from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryAgentStore } from '../../../../state/store/core/store.js'
import type { AgentPlanRevision, AgentRun, AgentThread } from '../../../../state/shared/types.js'
import { createRuntimePlanToolsBridge } from './runtimePlanToolsBridge.js'

test('createRuntimePlanToolsBridge updates plans without emitting assistant messages', () => {
  const store = new InMemoryAgentStore()
  const thread = baseThread()
  const run = baseRun(thread.id)
  store.createThread(thread)
  store.createRun(run)

  const bridge = createRuntimePlanToolsBridge({
    store,
    now: () => '2026-05-22T00:00:00.000Z',
  })

  const result = bridge.updatePlan(run, {
    tasks: [
      { step: 'Inspect state shape', status: 'completed' },
      { step: 'Wire bridge', status: 'in_progress' },
    ],
  }) as unknown as { status: string; revision?: AgentPlanRevision }

  assert.equal(result.status, 'updated')
  assert.equal(result.revision?.id.startsWith('plan_revision'), true)
  assert.equal(store.getThread(thread.id)?.currentPlan?.totalCount, 2)
  assert.equal(store.getThread(thread.id)?.messages.length, 0)
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
