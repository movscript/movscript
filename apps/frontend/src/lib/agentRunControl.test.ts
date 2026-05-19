import assert from 'node:assert/strict'
import test from 'node:test'

import { createLocalAgentStopAbortError, isStoppableAgentRun, isTerminalAgentRun, stopLocalRunAction, type StopLocalRunActionDeps } from './agentRunControl'
import type { AgentRun, AgentThread } from './localAgentClient'
import type { ChatRunActivityEvent } from '@/store/agentStore'

test('run status helpers classify stoppable and terminal runs', () => {
  assert.equal(isStoppableAgentRun(makeRun({ status: 'queued' })), true)
  assert.equal(isStoppableAgentRun(makeRun({ status: 'completed' })), false)
  assert.equal(isTerminalAgentRun(makeRun({ status: 'completed_with_warnings' })), true)
  assert.equal(isTerminalAgentRun(makeRun({ status: 'requires_action' })), false)
})

test('createLocalAgentStopAbortError creates an abort-shaped error', () => {
  const error = createLocalAgentStopAbortError()
  assert.equal(error.name, 'AbortError')
  assert.equal(error.message, '用户停止了当前会话。')
})

test('stopLocalRunAction aborts active send, applies optimistic cancellation, then appends cancelled result', async () => {
  const calls: string[] = []
  const deps = depsFixture(calls)
  deps.now = () => new Date('2026-05-19T10:00:00.000Z')

  stopLocalRunAction({
    run: makeRun({ id: 'run_1', status: 'in_progress' }),
    loading: true,
    building: false,
    stopping: false,
    stopRequestedBeforeRun: false,
    deps,
  })
  await flushAsync()

  assert.deepEqual(calls, [
    'abort',
    'pending:null',
    'resetStreaming',
    'setRun:run_1:cancelled:false:false',
    'runtime:false:false:undefined',
    'cancelGeneration',
    'cancel:run_1:用户停止了当前会话。',
    'runtime:false:false:false',
    'setRun:run_1:cancelled:false:false',
    'getThread',
    'append:run_1:cancelled:1',
  ])
})

test('stopLocalRunAction clears transient loading when no cancellable run exists', () => {
  const calls: string[] = []
  stopLocalRunAction({
    run: null,
    loading: true,
    building: false,
    stopping: false,
    stopRequestedBeforeRun: false,
    deps: depsFixture(calls),
  })

  assert.deepEqual(calls, [
    'abort',
    'pending:null',
    'resetStreaming',
    'runtime:false:false:false',
  ])
})

test('stopLocalRunAction recovers latest run when cancel reports already finished', async () => {
  const calls: string[] = []
  const deps = depsFixture(calls)
  deps.cancelRun = async () => {
    throw new Error('run already finished')
  }
  deps.getRun = async () => {
    calls.push('getRun')
    return makeRun({ id: 'run_1', status: 'completed' })
  }

  stopLocalRunAction({
    run: makeRun({ id: 'run_1', status: 'in_progress' }),
    loading: true,
    building: false,
    stopping: false,
    stopRequestedBeforeRun: false,
    deps,
  })
  await flushAsync()

  assert.equal(calls.includes('getRun'), true)
  assert.equal(calls.includes('setRun:run_1:completed:false:false'), true)
})

function depsFixture(calls: string[]): StopLocalRunActionDeps {
  return {
    abortActiveSend: () => {
      calls.push('abort')
    },
    setPendingAssistantState: () => {
      calls.push('pending:null')
    },
    resetStreamingAssistant: () => {
      calls.push('resetStreaming')
    },
    setConversationRun: (run, patch) => {
      calls.push(`setRun:${run.id}:${run.status}:${patch.loading === true}:${patch.stopping === true}`)
    },
    setConversationRuntime: (patch) => {
      calls.push(`runtime:${patch.loading === true}:${patch.stopping === true}:${patch.building}`)
    },
    cancelGenerationJobIfActive: () => {
      calls.push('cancelGeneration')
    },
    cancelRun: async (runId, input) => {
      calls.push(`cancel:${runId}:${input.reason}`)
      return makeRun({ id: runId, status: 'cancelled' })
    },
    getRun: async (runId) => {
      calls.push('getRun')
      return makeRun({ id: runId, status: 'completed' })
    },
    getThread: async () => {
      calls.push('getThread')
      return makeThread()
    },
    appendAssistantRunResult: async (run, _thread, liveEvents) => {
      calls.push(`append:${run.id}:${run.status}:${liveEvents.length}`)
    },
    liveEvents: () => [{
      id: 'event_1',
      kind: 'runtime',
      title: 'Event',
      status: 'completed',
      createdAt: '2026-05-19T00:00:00.000Z',
    }] satisfies ChatRunActivityEvent[],
    addAssistantMessage: (message) => {
      calls.push(`assistant:${message.content}`)
    },
  }
}

async function flushAsync() {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise<void>((resolve) => setImmediate(resolve))
}

function makeThread(): AgentThread {
  return {
    id: 'thread_1',
    status: 'completed',
    createdAt: '2026-05-19T00:00:00.000Z',
    updatedAt: '2026-05-19T00:00:01.000Z',
    messages: [],
  }
}

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'completed',
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-05-19T00:00:00.000Z',
    updatedAt: '2026-05-19T00:00:00.000Z',
    steps: [],
    ...overrides,
  }
}
