import assert from 'node:assert/strict'
import test from 'node:test'

import { handleSendRunUpdate, handleSendRuntimeEvent, type AgentSendRunUpdateDeps } from '@/features/agent/application/agentSendStream'
import type { AgentThinkingState } from '@/features/agent/domain/agentThinkingState'
import type { AgentRun, AgentRuntimeEventV2 } from '@/shared/infrastructure/localAgentClient'
import type { ChatRunActivityEvent } from '@/features/agent/state/agentStore'

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

test('handleSendRunUpdate clears preparing tool call once matching tool step exists', () => {
  const calls: string[] = []
  const deps = depsFixture(calls, { currentPending: { status: 'preparing_tool_call', toolName: 'core_work_start' } })

  handleSendRunUpdate(makeRun({
    status: 'in_progress',
    steps: [{
      id: 'step_1',
      runId: 'run_1',
      type: 'tool_call',
      status: 'completed',
      toolName: 'core_work_start',
      createdAt: '2026-05-19T00:00:01.000Z',
      completedAt: '2026-05-19T00:00:02.000Z',
    }],
  }), deps)

  assert.equal(calls[0], 'pending:thinking')
})

test('handleSendRunUpdate clears preparing tool call when run waits for approval', () => {
  const calls: string[] = []
  const deps = depsFixture(calls, { currentPending: { status: 'preparing_tool_call', toolName: 'core_work_start' } })

  handleSendRunUpdate(makeRun({ status: 'requires_action' }), deps)

  assert.equal(calls[0], 'pending:null')
})

test('handleSendRunUpdate keeps pending interaction run focused while another run streams', () => {
  const calls: string[] = []
  const deps = depsFixture(calls, {
    currentRun: makeRun({
      id: 'run_waiting',
      status: 'requires_action',
      pendingInputRequests: [{
        id: 'input_1',
        runId: 'run_waiting',
        title: '选择目标',
        question: '继续吗？',
        inputType: 'choice',
        choices: [],
        allowCustomAnswer: false,
        status: 'pending',
        createdAt: '2026-05-19T00:00:00.000Z',
        updatedAt: '2026-05-19T00:00:00.000Z',
      }],
    }),
  })

  handleSendRunUpdate(makeRun({ id: 'run_streaming', status: 'in_progress' }), deps)

  assert.equal(calls.some((call) => call.startsWith('pending:')), false)
  assert.equal(calls.some((call) => call.startsWith('setRun:run_streaming')), false)
  assert.equal(calls.includes('task:request_1:run_streaming:thread_1:0'), true)
})

test('handleSendRunUpdate carries live reasoning text across run snapshots', () => {
  const calls: string[] = []
  const deps = depsFixture(calls, { currentPending: { status: 'thinking', reasoning: '正在检查上下文' } })
  deps.setPendingAssistantState = (value) => {
    const resolved = typeof value === 'function' ? value({ status: 'thinking', reasoning: '正在检查上下文' }) : value
    calls.push(`pending:${resolved?.status ?? 'null'}:${resolved?.reasoning ?? ''}`)
  }

  handleSendRunUpdate(makeRun({ status: 'in_progress' }), deps)

  assert.equal(calls[0], 'pending:thinking:正在检查上下文')
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

test('handleSendRuntimeEvent trims thread titles, completes started http events, and records the event', () => {
  const calls: string[] = []
  let events = [
    event({ id: 'http-request-local-session-message-run', status: 'started' }),
    event({ id: 'agent-step-1', status: 'started' }),
  ]

  handleSendRuntimeEvent(runtimeThreadEvent('  New title  '), {
    updateConversationTitle: (title) => calls.push(`title:${title}`),
    updateActivityEvents: (updater) => { events = updater(events) },
    recordLiveTraceEvent: (runtimeEvent) => calls.push(`record:${runtimeEvent.kind}`),
    now: () => new Date('2026-05-19T00:00:01.000Z'),
  })
  handleSendRuntimeEvent(runtimeRunEvent(makeRun({ status: 'in_progress' })), {
    updateConversationTitle: (title) => calls.push(`title:${title}`),
    updateActivityEvents: (updater) => { events = updater(events) },
    recordLiveTraceEvent: (runtimeEvent) => calls.push(`record:${runtimeEvent.kind}`),
    now: () => new Date('2026-05-19T00:00:01.000Z'),
  })

  assert.deepEqual(calls, ['title:New title', 'record:thread.upserted', 'record:run.upserted'])
  assert.equal(events[0]?.status, 'completed')
  assert.equal(events[0]?.completedAt, '2026-05-19T00:00:01.000Z')
  assert.equal(events[1]?.status, 'started')
})

test('handleSendRuntimeEvent forwards run upserts to the run update handler', () => {
  const calls: string[] = []
  let events = [event({ id: 'http-request-local-run-message', status: 'started' })]

  handleSendRuntimeEvent(runtimeRunEvent(makeRun({ id: 'run_streamed', status: 'requires_action' })), {
    updateConversationTitle: (title) => calls.push(`title:${title}`),
    updateActivityEvents: (updater) => { events = updater(events) },
    recordLiveTraceEvent: (runtimeEvent) => calls.push(`record:${runtimeEvent.kind}`),
    onRunUpdate: (run) => calls.push(`run:${run.id}:${run.status}`),
    now: () => new Date('2026-05-19T00:00:01.000Z'),
  })

  assert.deepEqual(calls, ['run:run_streamed:requires_action', 'record:run.upserted'])
  assert.equal(events[0]?.status, 'completed')
})

function depsFixture(calls: string[], options: {
  stopRequested?: boolean
  currentPending?: AgentThinkingState | null
  cancelledRunIds?: Set<string>
  currentRun?: AgentRun
} = {}): AgentSendRunUpdateDeps {
  return {
    conversationId: 'conv_1',
    requestId: 'request_1',
    liveEvents: () => [] satisfies ChatRunActivityEvent[],
    cancelledRunIds: options.cancelledRunIds ?? new Set<string>(),
    getConversationRuntime: () => ({ stopRequested: options.stopRequested, run: options.currentRun }),
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
    runtimeLimits: { approvalMode: 'interactive',
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

function runtimeThreadEvent(title: string): AgentRuntimeEventV2 {
  return {
    schema: 'movscript.agent.runtime-event.v2',
    protocolVersion: 'movscript.agent.protocol.v1',
    id: 'runtime-event:thread-title',
    scope: { type: 'thread', id: 'thread_1' },
    ordinal: 1,
    cursor: 'runtime-event:thread-title',
    emittedAt: '2026-05-19T00:00:00.000Z',
    kind: 'thread.upserted',
    causality: { threadId: 'thread_1' },
    entity: {
      type: 'thread',
      value: {
        id: 'thread_1',
        title,
        createdAt: '2026-05-19T00:00:00.000Z',
        updatedAt: '2026-05-19T00:00:00.000Z',
        messages: [],
      },
    },
  }
}

function runtimeRunEvent(run: AgentRun): AgentRuntimeEventV2 {
  return {
    schema: 'movscript.agent.runtime-event.v2',
    protocolVersion: 'movscript.agent.protocol.v1',
    id: 'runtime-event:run',
    scope: { type: 'thread', id: run.threadId },
    ordinal: 2,
    cursor: 'runtime-event:run',
    emittedAt: run.updatedAt,
    kind: 'run.upserted',
    causality: { threadId: run.threadId, runId: run.id },
    entity: { type: 'run', value: run },
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
