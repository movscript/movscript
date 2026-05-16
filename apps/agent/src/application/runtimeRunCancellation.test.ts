import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentRun, AgentRunStep, AgentThread } from '../state/types.js'
import {
  applyRuntimeRunCancellationFlow,
  applyRuntimeRunCancellationRequest,
  applyRuntimeSubtreeCancellation,
  applyRuntimeSubtreeCancellationRequest,
  planRuntimeSubtreeCancellation,
  type RuntimeRunCancellationTraceInput,
} from './runtimeRunCancellation.js'

const now = '2026-01-01T00:00:01.000Z'

test('applyRuntimeRunCancellationFlow cancels an active run with trace, assistant message, thread projection, and done snapshot', () => {
  const store = new InMemoryAgentStore()
  store.createThread(makeThread({ status: 'running', activeRunId: 'run_1' }))
  store.createRun(makeRun({ id: 'run_1', status: 'requires_action' }))
  const traces: RuntimeRunCancellationTraceInput[] = []
  const events: string[] = []
  let completedStep: AgentRunStep | undefined

  const run = applyRuntimeRunCancellationFlow({
    store,
    runId: 'run_1',
    reason: ' stop ',
    messageId: 'msg_cancelled',
    now,
    abortRun: (targetRunId, error) => events.push(`abort:${targetRunId}:${error.message}`),
    recordTrace: (_run, trace) => traces.push(trace),
    createStep: (targetRun, type) => {
      const step: AgentRunStep = {
        id: 'step_1',
        runId: targetRun.id,
        type,
        status: 'in_progress',
        createdAt: now,
      }
      targetRun.steps.push(step)
      completedStep = step
      return step
    },
    emitRunSnapshot: (targetRun, options) => events.push(`snapshot:${targetRun.status}:${options.done === true}`),
  })

  const thread = store.getThread('thread_1')
  assert.equal(run.status, 'cancelled')
  assert.equal(run.cancelledAt, now)
  assert.deepEqual(run.warnings, ['stop'])
  assert.equal(run.assistantMessageId, 'msg_cancelled')
  assert.equal(thread?.messages[0]?.id, 'msg_cancelled')
  assert.match(thread?.messages[0]?.content ?? '', /已停止当前会话/)
  assert.equal(thread?.status, 'cancelled')
  assert.equal(thread?.activeRunId, undefined)
  assert.equal(completedStep?.status, 'completed')
  assert.deepEqual(completedStep?.result, { messageId: 'msg_cancelled', cancelled: true })
  assert.equal(traces[0]?.kind, 'run')
  assert.equal(traces[0]?.summary, 'stop')
  assert.deepEqual(events, ['abort:run_1:stop', 'snapshot:cancelled:true'])
})

test('applyRuntimeRunCancellationFlow returns terminal runs unchanged without side effects', () => {
  const store = new InMemoryAgentStore()
  store.createThread(makeThread())
  store.createRun(makeRun({ id: 'run_1', status: 'completed' }))
  const events: string[] = []

  const run = applyRuntimeRunCancellationFlow({
    store,
    runId: 'run_1',
    messageId: 'msg_cancelled',
    now,
    abortRun: () => events.push('abort'),
    recordTrace: () => events.push('trace'),
    createStep: () => {
      throw new Error('step should not be created')
    },
    emitRunSnapshot: () => events.push('snapshot'),
  })

  assert.equal(run.status, 'completed')
  assert.deepEqual(events, [])
  assert.equal(store.getThread('thread_1')?.messages.length, 0)
})

test('applyRuntimeRunCancellationRequest allocates cancellation timestamps and message id', () => {
  const store = new InMemoryAgentStore()
  store.createThread(makeThread({ status: 'running', activeRunId: 'run_1' }))
  store.createRun(makeRun({ id: 'run_1', status: 'in_progress' }))
  const events: string[] = []

  const run = applyRuntimeRunCancellationRequest({
    store,
    runId: 'run_1',
    cancelInput: { reason: ' stop ' },
    messageId: 'msg_cancelled',
    now: () => now,
    abortRun: (targetRunId, error) => events.push(`abort:${targetRunId}:${error.message}`),
    recordTrace: (_run, trace) => events.push(`trace:${trace.summary}`),
    createStep: (targetRun, type) => {
      const step: AgentRunStep = {
        id: 'step_1',
        runId: targetRun.id,
        type,
        status: 'in_progress',
        createdAt: now,
      }
      targetRun.steps.push(step)
      return step
    },
    emitRunSnapshot: (targetRun, options) => events.push(`snapshot:${targetRun.status}:${options.done === true}`),
  })

  assert.equal(run.status, 'cancelled')
  assert.equal(run.assistantMessageId, 'msg_cancelled')
  assert.equal(store.getThread('thread_1')?.messages[0]?.id, 'msg_cancelled')
  assert.deepEqual(events, ['abort:run_1:stop', 'trace:stop', 'snapshot:cancelled:true'])
})

test('planRuntimeSubtreeCancellation returns active subtree runs in leaf-first cancellation order', () => {
  const store = new InMemoryAgentStore()
  store.createRun(makeRun({ id: 'run_root', status: 'in_progress' }))
  store.createRun(makeRun({ id: 'run_child_a', parentRunId: 'run_root', status: 'queued' }))
  store.createRun(makeRun({ id: 'run_grandchild', parentRunId: 'run_child_a', status: 'completed' }))
  store.createRun(makeRun({ id: 'run_child_b', parentRunId: 'run_root', status: 'requires_action' }))

  const plan = planRuntimeSubtreeCancellation({
    store,
    runId: 'run_root',
    reason: ' stop now ',
  })

  assert.equal(plan.reason, 'stop now')
  assert.deepEqual(plan.runIds, ['run_child_b', 'run_child_a', 'run_root'])
})

test('planRuntimeSubtreeCancellation validates the root run and falls back to a default reason', () => {
  const store = new InMemoryAgentStore()
  store.createRun(makeRun({ id: 'run_root', status: 'cancelled' }))

  assert.deepEqual(planRuntimeSubtreeCancellation({ store, runId: 'run_root' }), {
    reason: 'Run subtree was cancelled.',
    runIds: [],
  })
  assert.throws(() => planRuntimeSubtreeCancellation({ store, runId: 'missing_run' }), /run not found: missing_run/)
})

test('applyRuntimeSubtreeCancellation cancels planned runs in order with the planned reason', () => {
  const calls: string[] = []
  const result = applyRuntimeSubtreeCancellation({
    plan: {
      reason: 'stop now',
      runIds: ['run_child', 'run_root'],
    },
    cancelRun: (runId, reason) => calls.push(`${runId}:${reason}`),
  })

  assert.deepEqual(result.cancelledRunIds, ['run_child', 'run_root'])
  assert.deepEqual(calls, ['run_child:stop now', 'run_root:stop now'])
})

test('applyRuntimeSubtreeCancellationRequest plans and applies subtree cancellation', () => {
  const store = new InMemoryAgentStore()
  store.createRun(makeRun({ id: 'run_root', status: 'in_progress' }))
  store.createRun(makeRun({ id: 'run_child', parentRunId: 'run_root', status: 'queued' }))
  const calls: string[] = []

  const result = applyRuntimeSubtreeCancellationRequest({
    store,
    runId: 'run_root',
    reason: ' stop subtree ',
    cancelRun: (runId, reason) => calls.push(`${runId}:${reason}`),
  })

  assert.deepEqual(result.cancelledRunIds, ['run_child', 'run_root'])
  assert.deepEqual(calls, ['run_child:stop subtree', 'run_root:stop subtree'])
})

function makeThread(overrides: Partial<AgentThread> = {}): AgentThread {
  return {
    id: 'thread_1',
    title: 'Thread',
    status: 'idle',
    messages: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'queued',
    role: 'planner',
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    steps: [],
    ...overrides,
  }
}
