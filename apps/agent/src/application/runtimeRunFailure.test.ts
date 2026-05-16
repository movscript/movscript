import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentMessage, AgentRun, AgentRunStep, AgentThread } from '../state/types.js'
import {
  applyRuntimeRunFailure,
  type RuntimeRunFailureTraceInput,
} from './runtimeRunFailure.js'

const now = '2026-01-01T00:00:01.000Z'

test('applyRuntimeRunFailure records failed run state, error trace, assistant message, step, thread projection, and done snapshot', () => {
  const store = new InMemoryAgentStore()
  store.createThread(makeThread({ status: 'running', activeRunId: 'run_1' }))
  const run = makeRun({ status: 'in_progress' })
  store.createRun(run)
  const traces: RuntimeRunFailureTraceInput[] = []
  const snapshots: string[] = []
  const assistantMessages: AgentMessage[] = []
  let completedStep: AgentRunStep | undefined

  const result = applyRuntimeRunFailure({
    store,
    run,
    error: new Error('boom'),
    messageId: 'msg_failed',
    now,
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
    emitAssistantMessage: (_run, message) => assistantMessages.push(message),
    emitRunSnapshot: (targetRun, options) => snapshots.push(`${targetRun.status}:${options.done === true}`),
  })

  const thread = store.getThread('thread_1')
  assert.equal(result.status, 'failed')
  assert.equal(result.error, 'boom')
  assert.equal(result.failedAt, now)
  assert.equal(result.assistantMessageId, 'msg_failed')
  assert.equal(traces[0]?.kind, 'error')
  assert.equal(traces[0]?.title, 'Run failed')
  assert.deepEqual(traces[0]?.data, { error: 'boom' })
  assert.equal(thread?.status, 'failed')
  assert.equal(thread?.activeRunId, undefined)
  assert.equal(thread?.messages[0]?.id, 'msg_failed')
  assert.match(thread?.messages[0]?.content ?? '', /运行失败：boom/)
  assert.equal(completedStep?.status, 'completed')
  assert.deepEqual(completedStep?.result, { messageId: 'msg_failed' })
  assert.deepEqual(assistantMessages.map((message) => message.id), ['msg_failed'])
  assert.deepEqual(snapshots, ['failed:true'])
})

test('applyRuntimeRunFailure persists failed run and emits final snapshot even when the thread is missing', () => {
  const store = new InMemoryAgentStore()
  const run = makeRun({ status: 'in_progress' })
  store.createRun(run)
  const snapshots: string[] = []

  const result = applyRuntimeRunFailure({
    store,
    run,
    error: 'plain failure',
    messageId: 'msg_failed',
    now,
    recordTrace: () => {},
    createStep: () => {
      throw new Error('step should not be created without a thread')
    },
    emitAssistantMessage: () => {
      throw new Error('assistant message should not be emitted without a thread')
    },
    emitRunSnapshot: (targetRun, options) => snapshots.push(`${targetRun.status}:${options.done === true}`),
  })

  assert.equal(result.status, 'failed')
  assert.equal(store.getRun('run_1')?.error, 'plain failure')
  assert.deepEqual(snapshots, ['failed:true'])
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
