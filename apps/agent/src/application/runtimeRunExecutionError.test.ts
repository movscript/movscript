import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type {
  AgentMessage,
  AgentRun,
  AgentRunStep,
  AgentThread,
} from '../state/types.js'
import { createAbortError } from './runLifecycleControl.js'
import { applyRuntimeRunExecutionError } from './runtimeRunExecutionError.js'

test('applyRuntimeRunExecutionError delegates abort errors to cancellation finalizer', () => {
  const store = new InMemoryAgentStore()
  const run = makeRun()
  store.createRun(run)
  let cancelledRunId: string | undefined

  const result = applyRuntimeRunExecutionError({
    ...baseInput(store, run, createAbortError('stopped')),
    markRunCancelled: (targetRun) => {
      cancelledRunId = targetRun.id
      targetRun.status = 'cancelled'
      return targetRun
    },
  })

  assert.equal(result.status, 'cancelled')
  assert.equal(cancelledRunId, 'run_1')
})

test('applyRuntimeRunExecutionError delegates persisted cancelled runs to cancellation finalizer', () => {
  const store = new InMemoryAgentStore()
  const run = makeRun()
  store.createRun({ ...run, status: 'cancelled' })
  let cancelledRunStatus: AgentRun['status'] | undefined

  const result = applyRuntimeRunExecutionError({
    ...baseInput(store, run, new Error('late failure')),
    markRunCancelled: (targetRun) => {
      cancelledRunStatus = targetRun.status
      return targetRun
    },
  })

  assert.equal(result.status, 'cancelled')
  assert.equal(cancelledRunStatus, 'cancelled')
})

test('applyRuntimeRunExecutionError applies failure flow for non-cancel errors', () => {
  const store = new InMemoryAgentStore()
  const run = makeRun()
  const thread = makeThread()
  store.createThread(thread)
  store.createRun(run)
  const assistantMessages: AgentMessage[] = []
  const snapshots: string[] = []

  const result = applyRuntimeRunExecutionError({
    ...baseInput(store, run, new Error('model failed')),
    emitAssistantMessage: (_run, message) => assistantMessages.push(message),
    emitRunSnapshot: (targetRun, options) => snapshots.push(`${targetRun.status}:${options.done === true}`),
  })

  assert.equal(result.status, 'failed')
  assert.equal(result.error, 'model failed')
  assert.equal(assistantMessages[0]?.role, 'assistant')
  assert.equal(store.getThread('thread_1')?.messages.at(-1)?.runId, 'run_1')
  assert.deepEqual(snapshots, ['failed:true'])
})

function baseInput(
  store: InMemoryAgentStore,
  run: AgentRun,
  error: unknown,
): Parameters<typeof applyRuntimeRunExecutionError>[0] {
  return {
    store,
    run,
    error,
    messageId: 'msg_error',
    now: '2026-01-01T00:00:01.000Z',
    projectionNow: '2026-01-01T00:00:01.000Z',
    stepCompletedAt: '2026-01-01T00:00:01.000Z',
    markRunCancelled: (targetRun) => targetRun,
    recordTrace: () => {},
    createStep: (targetRun, type, round, toolName) => {
      const step: AgentRunStep = {
        id: `step_${targetRun.steps.length + 1}`,
        runId: targetRun.id,
        type,
        status: 'in_progress',
        createdAt: '2026-01-01T00:00:00.000Z',
        ...(round ? {
          roundId: round.roundId,
          roundIndex: round.roundIndex,
          roundLabel: round.roundLabel,
          roundSource: round.roundSource,
        } : {}),
        ...(toolName ? { toolName } : {}),
      }
      targetRun.steps.push(step)
      return step
    },
    emitAssistantMessage: () => {},
    emitRunSnapshot: () => {},
  }
}

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'in_progress',
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

function makeThread(overrides: Partial<AgentThread> = {}): AgentThread {
  return {
    id: 'thread_1',
    title: 'Thread',
    messages: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}
