import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentRun, AgentRunStep, AgentThread } from '../state/types.js'
import { createRuntimeRunCancellationBridge } from './runtimeRunCancellationBridge.js'

test('createRuntimeRunCancellationBridge marks runs cancelled without aborting controllers', () => {
  const store = new InMemoryAgentStore()
  store.createThread(makeThread({ status: 'running', activeRunId: 'run_1' }))
  store.createRun(makeRun({ id: 'run_1', status: 'in_progress' }))
  const events: string[] = []
  const bridge = createRuntimeRunCancellationBridge({
    store,
    messageId: () => 'msg_cancelled',
    now: () => '2026-01-01T00:00:01.000Z',
    recordTrace: (_run, trace) => events.push(`trace:${trace.title}:${trace.summary}`),
    createStep: (run, type) => {
      const step: AgentRunStep = {
        id: 'step_1',
        runId: run.id,
        type,
        status: 'in_progress',
        createdAt: '2026-01-01T00:00:01.000Z',
      }
      run.steps.push(step)
      return step
    },
    emitRunSnapshot: (run, options) => events.push(`snapshot:${run.status}:${options.done === true}`),
  })

  const run = bridge.markRunCancelled(store.getRun('run_1')!, 'stop')

  assert.equal(run.status, 'cancelled')
  assert.equal(run.assistantMessageId, 'msg_cancelled')
  assert.equal(store.getThread('thread_1')?.messages[0]?.id, 'msg_cancelled')
  assert.deepEqual(events, ['trace:Run cancelled:stop', 'snapshot:cancelled:true'])
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
