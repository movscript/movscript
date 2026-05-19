import assert from 'node:assert/strict'
import test from 'node:test'

import { handleSendRunUpdate, handleSendStreamEvent, type AgentSendRunUpdateDeps } from './agentSendStream'
import type { AgentLivePendingAssistantState } from './agentLiveRunActivity'
import type { AgentRun } from './localAgentClient'
import type { ChatRunActivityEvent } from '@/store/agentStore'

test('handleSendRunUpdate projects in-progress run into thinking, task, and conversation state', () => {
  const calls: string[] = []
  const deps = depsFixture(calls)

  handleSendRunUpdate(makeRun({ status: 'in_progress' }), deps)

  assert.deepEqual(calls, [
    'pending:thinking',
    'task:request_1:run_1:thread_1:0',
    'setRun:run_1:in_progress:true:false:undefined',
  ])
})

test('handleSendRunUpdate preserves preparing tool call while next state falls back to thinking', () => {
  const calls: string[] = []
  const deps = depsFixture(calls, { currentPending: { status: 'preparing_tool_call', toolName: 'tool_a' } })

  handleSendRunUpdate(makeRun({ status: 'queued' }), deps)

  assert.equal(calls[0], 'pending:preparing_tool_call')
})

test('handleSendRunUpdate clears pending assistant state for terminal runs and refreshes catalog context', () => {
  const calls: string[] = []
  const deps = depsFixture(calls)
  deps.runTouchesAgentCatalog = () => true

  handleSendRunUpdate(makeRun({ status: 'completed' }), deps)

  assert.equal(calls.includes('pending:null'), true)
  assert.equal(calls.includes('refreshCatalog'), true)
})

test('handleSendRunUpdate cancels a stoppable run when stop was requested', async () => {
  const calls: string[] = []
  const deps = depsFixture(calls, { stopRequested: true })

  handleSendRunUpdate(makeRun({ status: 'in_progress' }), deps)
  await flushAsync()

  assert.equal(calls.includes('cancelGeneration'), true)
  assert.equal(calls.includes('cancel:run_1:用户停止了当前会话。'), true)
  assert.equal(calls.includes('setRun:run_1:cancelled:true:true:false'), true)
  assert.equal(calls.includes('runtime:false:false:false'), true)
})

test('handleSendRunUpdate only sends one cancel request per run id', () => {
  const calls: string[] = []
  const cancelledRunIds = new Set<string>()
  const deps = depsFixture(calls, { stopRequested: true, cancelledRunIds })

  handleSendRunUpdate(makeRun({ status: 'in_progress' }), deps)
  handleSendRunUpdate(makeRun({ status: 'in_progress' }), deps)

  assert.equal(calls.filter((call) => call.startsWith('cancel:')).length, 1)
})

test('handleSendRunUpdate recovers latest run when cancel reports already finished', async () => {
  const calls: string[] = []
  const deps = depsFixture(calls, { stopRequested: true })
  deps.cancelRun = async () => {
    throw new Error('run already finished')
  }
  deps.getRun = async () => {
    calls.push('getRun')
    return makeRun({ status: 'completed' })
  }

  handleSendRunUpdate(makeRun({ status: 'in_progress' }), deps)
  await flushAsync()

  assert.equal(calls.includes('getRun'), true)
  assert.equal(calls.includes('setRun:run_1:completed:false:false:false'), true)
})

test('handleSendStreamEvent trims thread titles, completes started http events, and records the event', () => {
  const calls: string[] = []
  let events = [
    event({ id: 'http-request-local-create-thread', status: 'started' }),
    event({ id: 'agent-step-1', status: 'started' }),
  ]

  handleSendStreamEvent({ type: 'thread_title', runId: 'run_1', threadId: 'thread_1', title: '  New title  ', updatedAt: '2026-05-19T00:00:00.000Z' }, {
    updateConversationTitle: (title) => calls.push(`title:${title}`),
    updateActivityEvents: (updater) => { events = updater(events) },
    recordLiveTraceEvent: (streamEvent) => calls.push(`record:${streamEvent.type}`),
    now: () => new Date('2026-05-19T00:00:01.000Z'),
  })
  handleSendStreamEvent({ type: 'run', run: makeRun({ status: 'in_progress' }) }, {
    updateConversationTitle: (title) => calls.push(`title:${title}`),
    updateActivityEvents: (updater) => { events = updater(events) },
    recordLiveTraceEvent: (streamEvent) => calls.push(`record:${streamEvent.type}`),
    now: () => new Date('2026-05-19T00:00:01.000Z'),
  })

  assert.deepEqual(calls, ['title:New title', 'record:thread_title', 'record:run'])
  assert.equal(events[0]?.status, 'completed')
  assert.equal(events[0]?.completedAt, '2026-05-19T00:00:01.000Z')
  assert.equal(events[1]?.status, 'started')
})

function depsFixture(calls: string[], options: {
  stopRequested?: boolean
  currentPending?: AgentLivePendingAssistantState | null
  cancelledRunIds?: Set<string>
} = {}): AgentSendRunUpdateDeps {
  return {
    conversationId: 'conv_1',
    requestId: 'request_1',
    liveEvents: () => [] satisfies ChatRunActivityEvent[],
    cancelledRunIds: options.cancelledRunIds ?? new Set<string>(),
    getConversationRuntime: () => ({ stopRequested: options.stopRequested }),
    setPendingAssistantState: (value) => {
      const resolved = typeof value === 'function' ? value(options.currentPending ?? null) : value
      calls.push(`pending:${resolved?.status ?? 'null'}`)
    },
    thinkingStateForRun: () => ({ status: 'thinking' }),
    runTouchesAgentCatalog: () => false,
    refreshAgentCatalogContext: () => {
      calls.push('refreshCatalog')
    },
    setPageTaskRunning: (requestId, patch) => {
      calls.push(`task:${requestId}:${patch.run?.id}:${patch.threadId}:${patch.artifacts?.length ?? 0}`)
    },
    setConversationRun: (run, patch) => {
      calls.push(`setRun:${run.id}:${run.status}:${patch.loading === true}:${patch.stopping === true}:${patch.approving}`)
    },
    setConversationRuntime: (patch) => {
      calls.push(`runtime:${patch.loading === true}:${patch.stopping === true}:${patch.stopRequested}`)
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
    status: 'queued',
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

function event(overrides: Partial<ChatRunActivityEvent> = {}): ChatRunActivityEvent {
  return {
    id: 'event_1',
    kind: 'runtime',
    title: 'Event',
    status: 'info',
    createdAt: '2026-05-19T00:00:00.000Z',
    ...overrides,
  }
}
