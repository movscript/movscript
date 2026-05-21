import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { RuntimeOperation } from '../operations/runtimeOperation.js'
import { RuntimeScheduler } from './runtimeScheduler.js'

test('RuntimeScheduler creates and readies operation continuations', () => {
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
  const operation = makeOperation({ status: 'waiting' })
  store.createRuntimeOperation(operation)

  scheduler.dispatch({ type: 'operation.started', operation })

  const waiting = store.listRuntimeContinuations({ runId: 'run_1' })
  assert.equal(waiting.length, 1)
  assert.equal(waiting[0]?.status, 'waiting')
  assert.deepEqual(waiting[0]?.trigger, {
    type: 'operation_completed',
    operationIds: ['op_1'],
    mode: 'any',
  })

  const completed = makeOperation({ status: 'completed', result: { assetId: 'asset_1' } })
  store.updateRuntimeOperation(completed)
  scheduler.dispatch({ type: 'operation.observed', operation: completed })

  const ready = store.listRuntimeContinuations({ runId: 'run_1' })[0]
  assert.equal(ready?.status, 'ready')
  assert.deepEqual(ready?.nextInput?.operationResults, ['op_1'])
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
  const operation = makeOperation({ status: 'completed', result: { assetId: 'asset_1' } })
  store.createRuntimeOperation(operation)
  store.createRuntimeContinuation({
    id: 'continuation_op_1',
    threadId: 'thread_1',
    runId: 'run_1',
    status: 'ready',
    trigger: { type: 'operation_completed', operationIds: ['op_1'], mode: 'any' },
    nextInput: { operationResults: ['op_1'] },
    createdAt: now,
    updatedAt: now,
  })

  const runs = scheduler.advanceThread('thread_1')

  assert.equal(runs.length, 1)
  assert.equal(store.getRuntimeContinuation('continuation_op_1')?.status, 'consumed')
  assert.match(JSON.stringify(createdRunInputs[0]), /asset_1/)
})

function makeOperation(overrides: Partial<RuntimeOperation> = {}): RuntimeOperation {
  return {
    id: 'op_1',
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
