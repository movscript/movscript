import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../../../state/store/core/store.js'
import type { AgentRun } from '../../../state/shared/types.js'
import type { RuntimeWork } from '../../../runtime-work/core/runtimeWork.js'
import { RuntimeScheduler } from '../scheduler/runtimeScheduler.js'
import { RuntimeWakeCoordinator } from './runtimeWakeCoordinator.js'

test('RuntimeWakeCoordinator routes settled subagent runs through runtime work continuation wakeup', async () => {
  const store = new InMemoryAgentStore()
  const now = '2026-05-21T00:00:00.000Z'
  const createdRunInputs: unknown[] = []
  store.createRun(makeRun({ id: 'run_parent', threadId: 'thread_parent', status: 'completed' }))
  store.createRun(makeRun({ id: 'run_child', threadId: 'thread_child', parentRunId: 'run_parent', status: 'completed' }))
  const work = makeWork({
    id: 'work_subagent',
    threadId: 'thread_parent',
    runId: 'run_parent',
    kind: 'subagent_run',
    status: 'running',
    externalHandle: { provider: 'movscript-agent', type: 'agent_run', id: 'run_child' },
    continuationPolicy: { mode: 'any_completed' },
  })
  store.createRuntimeWork(work)
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
      return makeRun({ id: 'run_continuation', threadId: String(input.threadId), parentRunId: String(input.parentRunId), status: 'queued' })
    },
  })
  const wake = new RuntimeWakeCoordinator({
    store,
    scheduler,
    observeWork: async (targetWork) => {
      const observed = { ...targetWork, status: 'completed' as const, result: { runId: 'run_child', status: 'completed' }, completedAt: now, updatedAt: now }
      store.updateRuntimeWork(observed)
      return observed
    },
  })
  wake.workStarted(work)

  const result = await wake.runSettled('run_child')

  assert.equal(result.observedWorks[0]?.status, 'completed')
  assert.deepEqual(store.listRuntimeWakeEvents().map((event) => event.status), [
    'consumed',
    'consumed',
    'consumed',
  ])
  assert.equal(store.getRuntimeContinuation('continuation_work_subagent')?.status, 'consumed')
  assert.equal(createdRunInputs.length, 1)
  assert.deepEqual(createdRunInputs[0], {
    threadId: 'thread_parent',
    userMessage: '[Runtime work continuation]\nContinuation: continuation_work_subagent\nRuntime work completed. Continue the original task using these results. Do not rerun completed work unless the result is unusable.\n\n- work_subagent (subagent_run): {"runId":"run_child","status":"completed"}',
    parentRunId: 'run_parent',
    runtimeLimits: { approvalMode: 'interactive',
      maxToolCalls: 8,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    metadata: {
      runtimeContinuationId: 'continuation_work_subagent',
      runtimeWorkIds: ['work_subagent'],
    },
  })
})

test('RuntimeWakeCoordinator re-evaluates completed generation work when a thread is opened', async () => {
  const store = new InMemoryAgentStore()
  const now = '2026-05-21T00:00:00.000Z'
  const createdRunInputs: unknown[] = []
  store.createRun(makeRun({ id: 'run_1', threadId: 'thread_1', status: 'completed' }))
  const work = makeWork({
    id: 'work_generation',
    threadId: 'thread_1',
    runId: 'run_1',
    kind: 'generation_job',
    status: 'waiting',
    externalHandle: { provider: 'movscript', type: 'generation_job', id: 42 },
    continuationPolicy: { mode: 'any_completed' },
  })
  store.createRuntimeWork(work)
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
      return makeRun({ id: 'run_continuation', threadId: String(input.threadId), parentRunId: String(input.parentRunId), status: 'queued' })
    },
  })
  const wake = new RuntimeWakeCoordinator({
    store,
    scheduler,
    observeWork: async (targetWork) => {
      const observed = { ...targetWork, status: 'completed' as const, result: { assetId: 'asset_1' }, completedAt: now, updatedAt: now }
      store.updateRuntimeWork(observed)
      return observed
    },
  })
  wake.workStarted(work)

  await wake.threadOpened('thread_1')

  assert.deepEqual(store.listRuntimeWakeEvents({ threadId: 'thread_1' }).map((event) => event.status), [
    'consumed',
    'consumed',
    'consumed',
  ])
  assert.equal(store.getRuntimeContinuation('continuation_work_generation')?.status, 'consumed')
  assert.equal(createdRunInputs.length, 1)
})

test('RuntimeWakeCoordinator keeps polling unfinished work observed when a thread is opened', async () => {
  const store = new InMemoryAgentStore()
  const now = '2026-05-21T00:00:00.000Z'
  const createdRunInputs: unknown[] = []
  let observeCount = 0
  store.createRun(makeRun({ id: 'run_1', threadId: 'thread_1', status: 'completed' }))
  const work = makeWork({
    id: 'work_generation',
    threadId: 'thread_1',
    runId: 'run_1',
    kind: 'generation_job',
    status: 'waiting',
    externalHandle: { provider: 'movscript', type: 'generation_job', id: 42 },
    continuationPolicy: { mode: 'any_completed' },
  })
  work.pollIntervalMs = 50
  store.createRuntimeWork(work)
  store.createRuntimeContinuation({
    id: 'continuation_work_generation',
    threadId: 'thread_1',
    runId: 'run_1',
    status: 'waiting',
    trigger: { type: 'work_completed', workIds: ['work_generation'], mode: 'any' },
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
    continueRun: (input) => {
      createdRunInputs.push(input)
      return makeRun({ id: 'run_continuation', threadId: String(input.threadId), parentRunId: String(input.parentRunId), status: 'queued' })
    },
  })
  const wake = new RuntimeWakeCoordinator({
    store,
    scheduler,
    observeWork: async (targetWork) => {
      observeCount += 1
      const observed = observeCount === 1
        ? { ...targetWork, status: 'waiting' as const, updatedAt: now }
        : { ...targetWork, status: 'completed' as const, result: { assetId: 'asset_1' }, completedAt: now, updatedAt: now }
      store.updateRuntimeWork(observed)
      return observed
    },
    now: () => now,
  })

  const opened = await wake.threadOpened('thread_1')
  await waitFor(() => createdRunInputs.length === 1)

  assert.equal(opened[0]?.status, 'waiting')
  assert.equal(observeCount, 2)
  assert.equal(store.getRuntimeWork('work_generation')?.status, 'completed')
  assert.equal(store.getRuntimeContinuation('continuation_work_generation')?.status, 'consumed')
})

test('RuntimeWakeCoordinator requeues processing wake events during startup drain', async () => {
  const store = new InMemoryAgentStore()
  const now = '2026-05-21T00:00:00.000Z'
  store.createRun(makeRun({ id: 'run_1', threadId: 'thread_1', status: 'completed' }))
  const work = makeWork({
    id: 'work_generation',
    threadId: 'thread_1',
    runId: 'run_1',
    kind: 'generation_job',
    status: 'completed',
    externalHandle: { provider: 'movscript', type: 'generation_job', id: 42 },
  })
  store.createRuntimeWork(work)
  store.createRuntimeContinuation({
    id: 'continuation_work_generation',
    threadId: 'thread_1',
    runId: 'run_1',
    status: 'waiting',
    trigger: { type: 'work_completed', workIds: ['work_generation'], mode: 'any' },
    createdAt: now,
    updatedAt: now,
  })
  store.createRuntimeWakeEvent({
    id: 'wake_stale',
    threadId: 'thread_1',
    runId: 'run_1',
    workId: 'work_generation',
    kind: 'work.observed',
    status: 'processing',
    payload: {
      workId: 'work_generation',
      threadId: 'thread_1',
      runId: 'run_1',
      kind: 'generation_job',
      status: 'completed',
      updatedAt: now,
    },
    dedupeKey: 'work.observed:work_generation:completed:2026-05-21T00:00:00.000Z',
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
    continueRun: (input) => makeRun({ id: 'run_continuation', threadId: String(input.threadId), parentRunId: String(input.parentRunId), status: 'queued' }),
  })
  const wake = new RuntimeWakeCoordinator({ store, scheduler })

  await wake.drainQueued()

  assert.equal(store.getRuntimeWakeEvent('wake_stale')?.status, 'consumed')
  assert.equal(store.getRuntimeContinuation('continuation_work_generation')?.status, 'consumed')
})

test('RuntimeWakeCoordinator appends wake history when a consumed signal recurs', async () => {
  const store = new InMemoryAgentStore()
  const now = '2026-05-21T00:00:00.000Z'
  store.createRun(makeRun({ id: 'run_1', threadId: 'thread_1', status: 'completed' }))
  const work = makeWork({
    id: 'work_generation',
    threadId: 'thread_1',
    runId: 'run_1',
    kind: 'generation_job',
    status: 'completed',
    externalHandle: { provider: 'movscript', type: 'generation_job', id: 42 },
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
    continueRun: (input) => makeRun({ id: 'run_continuation', threadId: String(input.threadId), parentRunId: String(input.parentRunId), status: 'queued' }),
  })
  const wake = new RuntimeWakeCoordinator({ store, scheduler, now: () => now })

  wake.workObserved(work)
  await wake.drainQueued()
  wake.workObserved(work)
  await wake.drainQueued()

  const events = store.listRuntimeWakeEvents({ threadId: 'thread_1' })
  assert.equal(events.length, 2)
  assert.notEqual(events[0]?.id, events[1]?.id)
  assert.deepEqual(events.map((event) => event.status), ['consumed', 'consumed'])
})

test('RuntimeWakeCoordinator observes async work from the wake queue and advances on completion', async () => {
  const store = new InMemoryAgentStore()
  const now = '2026-05-21T00:00:00.000Z'
  const createdRunInputs: unknown[] = []
  store.createRun(makeRun({ id: 'run_1', threadId: 'thread_1', status: 'completed' }))
  const work = makeWork({
    id: 'work_generation',
    threadId: 'thread_1',
    runId: 'run_1',
    kind: 'generation_job',
    status: 'waiting',
    externalHandle: { provider: 'movscript', type: 'generation_job', id: 42 },
    continuationPolicy: { mode: 'any_completed' },
  })
  work.pollIntervalMs = 250
  store.createRuntimeWork(work)
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
      return makeRun({ id: 'run_continuation', threadId: String(input.threadId), parentRunId: String(input.parentRunId), status: 'queued' })
    },
  })
  const wake = new RuntimeWakeCoordinator({
    store,
    scheduler,
    observeWork: async (targetWork) => {
      const observed = { ...targetWork, status: 'completed' as const, result: { assetId: 'asset_1' }, completedAt: now, updatedAt: now }
      store.updateRuntimeWork(observed)
      return observed
    },
    now: () => now,
  })

  wake.workStarted(work)
  await wake.runSettled('run_1')
  await waitFor(() => createdRunInputs.length === 1)

  assert.equal(store.getRuntimeContinuation('continuation_work_generation')?.status, 'consumed')
  assert.deepEqual(store.listRuntimeWakeEvents({ threadId: 'thread_1' }).map((event) => event.status), [
    'consumed',
    'consumed',
    'consumed',
  ])
})

function makeRun(input: {
  id: string
  threadId: string
  status: AgentRun['status']
  parentRunId?: string
}): AgentRun {
  return {
    id: input.id,
    threadId: input.threadId,
    ...(input.parentRunId ? { parentRunId: input.parentRunId } : {}),
    status: input.status,
    runtimeLimits: { approvalMode: 'interactive',
      maxToolCalls: 8,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-05-21T00:00:00.000Z',
    updatedAt: '2026-05-21T00:00:00.000Z',
    steps: [],
  }
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 1_000
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  assert.equal(predicate(), true)
}

function makeWork(input: {
  id: string
  threadId: string
  runId: string
  kind: RuntimeWork['kind']
  status: RuntimeWork['status']
  externalHandle?: RuntimeWork['externalHandle']
  continuationPolicy?: RuntimeWork['continuationPolicy']
}): RuntimeWork {
  return {
    id: input.id,
    threadId: input.threadId,
    runId: input.runId,
    kind: input.kind,
    mode: 'async',
    status: input.status,
    request: {},
    ...(input.externalHandle ? { externalHandle: input.externalHandle } : {}),
    ...(input.continuationPolicy ? { continuationPolicy: input.continuationPolicy } : {}),
    createdAt: '2026-05-21T00:00:00.000Z',
    updatedAt: '2026-05-21T00:00:00.000Z',
  }
}
