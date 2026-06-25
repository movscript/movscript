import assert from 'node:assert/strict'
import test from 'node:test'

import { createProviderSessionStopAbortError, isStoppableAgentRun, isTerminalAgentRun, stopProviderSessionRunAction, type StopProviderSessionRunActionDeps } from '@/features/agent/domain/agentRunControl'
import type { AgentRun } from '@movscript/agent-protocol'

test('run status helpers classify stoppable and terminal runs', () => {
  assert.equal(isStoppableAgentRun(makeRun({ status: 'queued' })), true)
  assert.equal(isStoppableAgentRun(makeRun({ status: 'completed' })), false)
  assert.equal(isTerminalAgentRun(makeRun({ status: 'completed_with_warnings' })), true)
  assert.equal(isTerminalAgentRun(makeRun({ status: 'requires_action' })), false)
})

test('createProviderSessionStopAbortError creates an abort-shaped error', () => {
  const error = createProviderSessionStopAbortError()
  assert.equal(error.name, 'AbortError')
  assert.equal(error.message, '用户停止了当前会话。')
})

test('stopProviderSessionRunAction aborts active send and applies optimistic cancellation', async () => {
  const calls: string[] = []
  const deps = depsFixture(calls)
  deps.now = () => new Date('2026-05-19T10:00:00.000Z')

  stopProviderSessionRunAction({
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
  ])
})

test('stopProviderSessionRunAction clears transient loading when no cancellable run exists', () => {
  const calls: string[] = []
  stopProviderSessionRunAction({
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

test('stopProviderSessionRunAction recovers latest run when cancel reports already finished', async () => {
  const calls: string[] = []
  const deps = depsFixture(calls)
  deps.cancelRun = async () => {
    throw new Error('run already finished')
  }
  deps.getRun = async () => {
    calls.push('getRun')
    return makeRun({ id: 'run_1', status: 'completed' })
  }

  stopProviderSessionRunAction({
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

function depsFixture(calls: string[]): StopProviderSessionRunActionDeps {
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
    updateConversationRuntimeState: (patch) => {
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
  }
}

async function flushAsync() {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise<void>((resolve) => setImmediate(resolve))
}

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'completed',
    providerSessionLimits: { approvalMode: 'interactive',
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
