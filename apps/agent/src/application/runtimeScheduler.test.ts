import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { RuntimeWork } from '../runtimeWork/runtimeWork.js'
import { RuntimeScheduler } from './runtimeScheduler.js'

test('RuntimeScheduler creates and readies work continuations', () => {
  const store = new InMemoryAgentStore()
  const now = '2026-05-21T00:00:00.000Z'
  const scheduler = new RuntimeScheduler({
    store,
    now: () => now,
    runControl: {
      approveRun: () => {
        throw new Error('approval is not part of this scenario')
      },
      rejectRun: () => {
        throw new Error('rejection is not part of this scenario')
      },
    },
  })
  const work = makeWork({ status: 'waiting' })
  store.createRuntimeWork(work)

  scheduler.dispatch({ type: 'work.started', work })

  const waiting = store.listRuntimeContinuations({ runId: 'run_1' })
  assert.equal(waiting.length, 1)
  assert.equal(waiting[0]?.status, 'waiting')
  assert.deepEqual(waiting[0]?.trigger, {
    type: 'work_completed',
    workIds: ['work_1'],
    mode: 'any',
  })

  const completed = makeWork({ status: 'completed', result: { assetId: 'asset_1' } })
  store.updateRuntimeWork(completed)
  scheduler.dispatch({ type: 'work.observed', work: completed })

  const ready = store.listRuntimeContinuations({ runId: 'run_1' })[0]
  assert.equal(ready?.status, 'ready')
  assert.deepEqual(ready?.nextInput?.workResults, ['work_1'])
})

test('RuntimeScheduler advances ready continuations when thread is unblocked', () => {
  const store = new InMemoryAgentStore()
  const now = '2026-05-21T00:00:00.000Z'
  const createdRunInputs: unknown[] = []
  const scheduler = new RuntimeScheduler({
    store,
    now: () => now,
    runControl: {
      approveRun: () => {
        throw new Error('approval is not part of this scenario')
      },
      rejectRun: () => {
        throw new Error('rejection is not part of this scenario')
      },
    },
    continueRun: (input) => {
      createdRunInputs.push(input)
      return {
        id: 'run_continuation',
        threadId: 'thread_1',
        status: 'queued',
        policy: {
          approvalMode: 'interactive',
          maxToolCalls: 8,
          maxIterations: 8,
          allowNetwork: false,
          allowFileBytes: false,
        },
        createdAt: now,
        updatedAt: now,
        steps: [],
      }
    },
  })
  const work = makeWork({ status: 'completed', result: { assetId: 'asset_1' } })
  store.createRuntimeWork(work)
  store.createRuntimeContinuation({
    id: 'continuation_work_1',
    threadId: 'thread_1',
    runId: 'run_1',
    status: 'ready',
    trigger: { type: 'work_completed', workIds: ['work_1'], mode: 'any' },
    nextInput: { workResults: ['work_1'] },
    createdAt: now,
    updatedAt: now,
  })

  const runs = scheduler.advanceThread('thread_1')

  assert.equal(runs.length, 1)
  assert.equal(store.getRuntimeContinuation('continuation_work_1')?.status, 'consumed')
  assert.match(JSON.stringify(createdRunInputs[0]), /asset_1/)
})

function makeWork(overrides: Partial<RuntimeWork> = {}): RuntimeWork {
  return {
    id: 'work_1',
    threadId: 'thread_1',
    runId: 'run_1',
    kind: 'generation_job',
    mode: 'async',
    status: 'waiting',
    request: { prompt: 'image' },
    continuationPolicy: { mode: 'any_completed' },
    createdAt: '2026-05-21T00:00:00.000Z',
    updatedAt: '2026-05-21T00:00:00.000Z',
    ...overrides,
  }
}
