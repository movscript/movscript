import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { RuntimeWork } from '../runtimeWork/runtimeWork.js'
import { RuntimeScheduler } from './runtimeScheduler.js'
import type { AgentRun } from '../state/types.js'

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
  store.createRun(makeRun({
    id: 'run_1',
    status: 'completed',
    policy: {
      approvalMode: 'auto',
      sandboxMode: true,
      maxToolCalls: 12,
      maxIterations: 9,
      allowNetwork: false,
      allowFileBytes: false,
      workflow: { profile: 'deep', includeMemories: false, allowForcedToolCalls: true },
    },
    metadata: {
      approvedToolNames: ['core_work_start', 'candidate_asset_slot_attach'],
      clientInput: { currentProjectId: 101 },
    },
  }))
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
    getRunAuth: (runId) => runId === 'run_1'
      ? { backendAuthToken: 'token_1', backendAPIBaseURL: 'http://backend.local' }
      : {},
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
  assert.deepEqual(createdRunInputs[0], {
    threadId: 'thread_1',
    userMessage: '[Runtime work continuation]\nContinuation: continuation_work_1\nRuntime work completed. Continue the original task using these results. Do not rerun completed work unless the result is unusable.\n\n- work_1 (generation_job): {"assetId":"asset_1"}',
    parentRunId: 'run_1',
    policy: {
      approvalMode: 'auto',
      sandboxMode: true,
      maxToolCalls: 12,
      maxIterations: 9,
      allowNetwork: false,
      allowFileBytes: false,
      workflow: { profile: 'deep', includeMemories: false, allowForcedToolCalls: true },
    },
    sandboxMode: true,
    approvedToolNames: ['core_work_start', 'candidate_asset_slot_attach'],
    clientInput: { currentProjectId: 101 },
    backendAuthToken: 'token_1',
    backendAPIBaseURL: 'http://backend.local',
    metadata: {
      runtimeContinuationId: 'continuation_work_1',
      runtimeWorkIds: ['work_1'],
    },
  })
})

test('RuntimeScheduler approves continuation resume interactions by creating a new run', () => {
  const store = new InMemoryAgentStore()
  const now = '2026-05-21T00:00:00.000Z'
  store.createRun(makeRun())
  store.createRuntimeWork(makeWork({ status: 'completed', result: { assetId: 'asset_1' } }))
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
  store.createRuntimeInteraction({
    id: 'interaction_continuation_work_1_resume',
    threadId: 'thread_1',
    runId: 'run_1',
    workId: 'work_1',
    kind: 'selection',
    status: 'pending',
    payload: { type: 'runtime_continuation_resume', continuationId: 'continuation_work_1' },
    createdAt: now,
    updatedAt: now,
  })
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
    continueRun: (input) => ({
      id: 'run_continuation',
      threadId: String(input.threadId),
      parentRunId: typeof input.parentRunId === 'string' ? input.parentRunId : undefined,
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
    }),
  })

  const result = scheduler.approveInteraction('interaction_continuation_work_1_resume')

  assert.equal(result.run.id, 'run_continuation')
  assert.equal(result.run.parentRunId, 'run_1')
  assert.equal(result.interaction.status, 'approved')
  assert.equal(store.getRuntimeContinuation('continuation_work_1')?.status, 'consumed')
})

test('RuntimeScheduler returns resolved continuation interactions idempotently', () => {
  const store = new InMemoryAgentStore()
  const now = '2026-05-21T00:00:00.000Z'
  store.createRun(makeRun())
  store.createRun(makeRun({ id: 'run_continuation', parentRunId: 'run_1', status: 'queued' }))
  store.createRuntimeInteraction({
    id: 'interaction_continuation_work_1_resume',
    threadId: 'thread_1',
    runId: 'run_1',
    kind: 'selection',
    status: 'approved',
    payload: { type: 'runtime_continuation_resume', continuationId: 'continuation_work_1' },
    result: { runId: 'run_continuation', runStatus: 'queued', continuationId: 'continuation_work_1' },
    resolvedAt: now,
    createdAt: now,
    updatedAt: now,
  })
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
    continueRun: () => {
      throw new Error('resolved continuation must not create another run')
    },
  })

  const result = scheduler.approveInteraction('interaction_continuation_work_1_resume')

  assert.equal(result.interaction.status, 'approved')
  assert.equal(result.run.id, 'run_continuation')
})

test('RuntimeScheduler rejects continuation resume interactions by cancelling the continuation', () => {
  const store = new InMemoryAgentStore()
  const now = '2026-05-21T00:00:00.000Z'
  store.createRun(makeRun())
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
  store.createRuntimeInteraction({
    id: 'interaction_continuation_work_1_resume',
    threadId: 'thread_1',
    runId: 'run_1',
    kind: 'selection',
    status: 'pending',
    payload: { type: 'runtime_continuation_resume', continuationId: 'continuation_work_1' },
    createdAt: now,
    updatedAt: now,
  })
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
    continueRun: () => {
      throw new Error('rejecting a continuation must not create a run')
    },
  })

  const result = scheduler.rejectInteraction('interaction_continuation_work_1_resume')

  assert.equal(result.run.id, 'run_1')
  assert.equal(result.interaction.status, 'rejected')
  assert.equal(store.getRuntimeContinuation('continuation_work_1')?.status, 'cancelled')
})

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
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
    createdAt: '2026-05-21T00:00:00.000Z',
    updatedAt: '2026-05-21T00:00:00.000Z',
    steps: [],
    ...overrides,
  }
}

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
