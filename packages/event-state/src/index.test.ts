import assert from 'node:assert/strict'
import test from 'node:test'

import {
  runtimeAssistantProgressFromEvent,
  runtimeRunFromEvent,
  runtimeRunIdFromEvent,
  runtimeStateShouldRefresh,
  runtimeThreadTitleFromEvent,
  runtimeTraceFromEvent,
} from './index'
import {
  isAgentPromptExcludedAssistantMessage,
  isAgentPromptExcludedAssistantMetadata,
  isAgentTranscriptAssistantMessage,
  isAgentTranscriptExcludedAssistantMetadata,
  isAgentTranscriptExcludedAssistantMessage,
} from '@movscript/protocol'
import type {
  AgentMessage,
  AgentRuntimeEventV2,
  AgentRun,
  AgentThread,
  AgentTraceEvent,
} from '@movscript/protocol'

test('shared assistant metadata boundary classifies explicit prompt-excluded assistant messages as non-transcript', () => {
  assert.equal(isAgentTranscriptExcludedAssistantMetadata({ promptEligibility: 'exclude' }), true)
  assert.equal(isAgentPromptExcludedAssistantMetadata({ localRunActivity: { runId: 'run_1' } }), true)
  assert.equal(isAgentTranscriptExcludedAssistantMetadata({ localRunActivity: { runId: 'run_1' } }), false)
})

test('shared assistant metadata boundary keeps ordinary transcript metadata visible', () => {
  assert.equal(isAgentTranscriptExcludedAssistantMetadata(undefined), false)
  assert.equal(isAgentTranscriptExcludedAssistantMetadata(null), false)
  assert.equal(isAgentTranscriptExcludedAssistantMetadata([]), false)
  assert.equal(isAgentTranscriptExcludedAssistantMetadata({}), false)
  assert.equal(isAgentTranscriptExcludedAssistantMetadata({ promptEligibility: 'include' }), false)
  assert.equal(isAgentTranscriptExcludedAssistantMetadata({ kind: 'runtime_input', targetRunId: 'run_1' }), false)
  assert.equal(isAgentTranscriptExcludedAssistantMetadata({ runtimeStatus: null }), false)
  assert.equal(isAgentTranscriptExcludedAssistantMetadata({ localRunActivity: { runId: 'run_1' } }), false)
  assert.equal(isAgentPromptExcludedAssistantMetadata({ localRunActivity: { runId: 'run_1' } }), true)
})

test('shared assistant message boundary classifies runtime and chat messages consistently', () => {
  assert.equal(isAgentTranscriptExcludedAssistantMessage(message({
    role: 'assistant',
    metadata: { promptEligibility: 'exclude' },
  })), true)
  assert.equal(isAgentTranscriptAssistantMessage(message({
    role: 'assistant',
    metadata: { promptEligibility: 'exclude' },
  })), false)
  assert.equal(isAgentPromptExcludedAssistantMessage(message({
    role: 'assistant',
    metadata: { localRunActivity: { runId: 'run_1' } },
  })), true)
  assert.equal(isAgentTranscriptAssistantMessage(message({
    role: 'assistant',
    metadata: { localRunActivity: { runId: 'run_1' } },
  })), true)
})

test('runtime event helpers expose only current runtime event facts', () => {
  const runEvent = event({
    kind: 'run.upserted',
    causality: { threadId: 'thread_1', runId: 'run_1' },
    entity: { type: 'run', value: run({ id: 'run_1' }) },
  })
  const trace = traceEvent({ id: 'trace_1', runId: 'run_1' })
  const traceRuntimeEvent = event({
    kind: 'trace.upserted',
    causality: { threadId: 'thread_1', runId: 'run_1', traceId: trace.id },
    entity: { type: 'trace', value: trace },
  })
  const progressEvent = event({
    kind: 'assistant.progress',
    causality: { threadId: 'thread_1', runId: 'run_1', traceId: 'trace_stream' },
    assistantProgress: { runId: 'run_1', traceId: 'trace_stream', delta: 'Hi', accumulated: 'Hi', createdAt: '2026-05-23T00:00:02.000Z' },
  })
  const threadEvent = event({
    kind: 'thread.upserted',
    entity: { type: 'thread', value: thread({ title: '  Runtime thread  ' }) },
  })

  assert.equal(runtimeRunFromEvent(runEvent)?.id, 'run_1')
  assert.equal(runtimeRunIdFromEvent(progressEvent), 'run_1')
  assert.equal(runtimeTraceFromEvent(traceRuntimeEvent)?.id, 'trace_1')
  assert.equal(runtimeAssistantProgressFromEvent(progressEvent)?.accumulated, 'Hi')
  assert.equal(runtimeThreadTitleFromEvent(threadEvent), 'Runtime thread')
  assert.equal(runtimeStateShouldRefresh(progressEvent), true)
})

const scope = { type: 'thread', id: 'thread_1' } as const

function event(overrides: Partial<AgentRuntimeEventV2> & Pick<AgentRuntimeEventV2, 'kind'>): AgentRuntimeEventV2 {
  return {
    schema: 'movscript.agent.runtime-event.v2',
    protocolVersion: 'movscript.agent.protocol.v1',
    id: 'evt_1',
    scope,
    ordinal: 1,
    cursor: 'cursor_1',
    emittedAt: '2026-05-23T00:00:01.000Z',
    ...overrides,
  } as AgentRuntimeEventV2
}

function thread(overrides: Partial<AgentThread> = {}): AgentThread {
  return {
    id: 'thread_1',
    status: 'running',
    activeRunId: 'run_1',
    createdAt: '2026-05-23T00:00:00.000Z',
    updatedAt: '2026-05-23T00:00:00.000Z',
    messages: [],
    ...overrides,
  }
}

function message(overrides: Partial<AgentMessage> = {}): AgentMessage {
  return {
    id: 'msg_1',
    threadId: 'thread_1',
    role: 'user',
    content: 'Message',
    createdAt: '2026-05-23T00:00:01.000Z',
    ...overrides,
  }
}

function run(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'in_progress',
    role: 'planner',
    runtimeLimits: {
      approvalMode: 'interactive',
      maxToolCalls: 10,
      maxIterations: 10,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-05-23T00:00:01.000Z',
    updatedAt: '2026-05-23T00:00:01.000Z',
    steps: [],
    ...overrides,
  }
}

function traceEvent(overrides: Partial<AgentTraceEvent> = {}): AgentTraceEvent {
  return {
    id: 'trace_1',
    runId: 'run_1',
    kind: 'message',
    title: 'Assistant message',
    status: 'completed',
    createdAt: '2026-05-23T00:00:02.000Z',
    ...overrides,
  }
}
