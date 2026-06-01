import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentRun } from '../state/types.js'
import { createRuntimeWorkCoordinatorBridge } from './runtimeWorkCoordinatorBridge.js'

test('createRuntimeWorkCoordinatorBridge composes works and delegates wake lifecycle events', async () => {
  const store = new InMemoryAgentStore()
  const run = baseRun({ id: 'run_1', threadId: 'thread_1' })
  const advancedThreads: string[] = []
  store.createRun(run)

  const bridge = createRuntimeWorkCoordinatorBridge({
    store,
    mcpClient: {
      initialize: async () => ({}),
      callTool: async () => ({ content: [] }),
    },
    scheduler: {
      dispatch: () => undefined,
      advanceThread: (threadId) => {
        advancedThreads.push(threadId)
        return [run]
      },
    },
    createThread: () => {
      throw new Error('not expected')
    },
    createRun: () => {
      throw new Error('not expected')
    },
    cancelSubtree: () => ({ cancelledRunIds: [] }),
    recordTrace: () => undefined,
    now: () => '2026-05-23T00:00:00.000Z',
  })

  assert.equal(typeof bridge.works.startWork, 'function')
  assert.deepEqual(await bridge.threadOpened('thread_1'), [])
  const settled = await bridge.runSettled(run.id)

  assert.deepEqual(advancedThreads, ['thread_1'])
  assert.deepEqual(settled.advancedRuns.map((item) => item.id), [run.id])
  assert.deepEqual(store.listRuntimeWakeEvents().map((event) => event.status), ['consumed', 'consumed'])
})

function baseRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
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
    createdAt: '2026-05-23T00:00:00.000Z',
    updatedAt: '2026-05-23T00:00:00.000Z',
    ...overrides,
  }
}
