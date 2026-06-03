import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../../../state/store/core/store.js'
import type { AgentRun } from '../../../state/shared/types.js'
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

test('createRuntimeWorkCoordinatorBridge records background work observations for UI streams', async () => {
  const store = new InMemoryAgentStore()
  const run = baseRun({ id: 'run_1', threadId: 'thread_1' })
  const traces: Array<{ title: string; status: string; toolName?: string; data?: unknown }> = []
  store.createThread({
    id: 'thread_1',
    title: 'Generation',
    status: 'idle',
    messages: [{ id: 'msg_1', threadId: 'thread_1', role: 'user', content: '生成一张图', createdAt: '2026-05-23T00:00:00.000Z' }],
    createdAt: '2026-05-23T00:00:00.000Z',
    updatedAt: '2026-05-23T00:00:00.000Z',
  })
  store.createRun(run)
  store.createRuntimeWork({
    id: 'work_1',
    threadId: 'thread_1',
    runId: 'run_1',
    kind: 'generation_job',
    mode: 'async',
    status: 'waiting',
    request: {
      tool: 'generation_image_generate',
      args: { prompt: 'image' },
      observeTool: 'generation_image_job_get',
    },
    continuationPolicy: { mode: 'any_completed' },
    externalHandle: { provider: 'movscript', type: 'generation_job', id: 42 },
    createdAt: '2026-05-23T00:00:00.000Z',
    updatedAt: '2026-05-23T00:00:00.000Z',
  })

  const bridge = createRuntimeWorkCoordinatorBridge({
    store,
    mcpClient: {
      initialize: async () => ({}),
      callTool: async (name) => {
        assert.equal(name, 'generation_image_job_get')
        return { data: { jobId: 42, status: 'finished', output_resource_id: 9001 } }
      },
    },
    scheduler: {
      dispatch: () => undefined,
      advanceThread: () => [],
    },
    createThread: () => {
      throw new Error('not expected')
    },
    createRun: () => {
      throw new Error('not expected')
    },
    cancelSubtree: () => ({ cancelledRunIds: [] }),
    recordTrace: (_run, trace) => {
      traces.push(trace)
    },
    now: () => '2026-05-23T00:00:00.000Z',
  })

  const observed = await bridge.threadOpened('thread_1')

  assert.equal(observed[0]?.status, 'completed')
  assert.equal(store.getRuntimeWork('work_1')?.status, 'completed')
  assert.equal(traces.length, 1)
  assert.equal(traces[0]?.title, 'Runtime work observed: generation_job')
  assert.equal(traces[0]?.status, 'completed')
  assert.equal(traces[0]?.toolName, 'core_work_wait')
  assert.match(JSON.stringify(traces[0]?.data), /runtimeWork/)
  assert.match(JSON.stringify(traces[0]?.data), /generation/)
})

function baseRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'completed',
    runtimeLimits: { approvalMode: 'interactive',
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
