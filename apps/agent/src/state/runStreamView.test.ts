import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST } from '../catalog/agentManifest.js'
import {
  assistantDeltaFromTraceEvent,
  assistantMessageForRun,
  assistantMessageFromTraceEvent,
  toProductRun,
  toStreamRun,
} from './runStreamView.js'
import type { AgentMessage, AgentRun, AgentThread } from './types.js'

test('toStreamRun returns a stream-safe run without trace event payloads', () => {
  const run = buildRun()

  const streamRun = toStreamRun(run)

  assert.equal(streamRun.streamPartial, true)
  assert.deepEqual(streamRun.traceEvents, [])
  assert.equal(streamRun.agentManifest, DEFAULT_AGENT_MANIFEST)
  assert.equal(streamRun.steps.length, 1)
  assert.equal(streamRun.steps[0]?.toolName, 'tool_a')
  assert.equal(streamRun.steps[0]?.errorData && typeof streamRun.steps[0].errorData === 'object' && !Array.isArray(streamRun.steps[0].errorData)
    ? streamRun.steps[0].errorData.code
    : undefined, 'bad_request')
  assert.equal(streamRun.steps[0]?.durationMs, 15)
})

test('toProductRun strips trace events while preserving run data', () => {
  const run = buildRun()

  const productRun = toProductRun(run)

  assert.notEqual(productRun, run)
  assert.equal(productRun.id, run.id)
  assert.deepEqual(productRun.traceEvents, [])
  assert.equal(productRun.steps, run.steps)
})

test('assistantDeltaFromTraceEvent returns stream content deltas only', () => {
  const delta = assistantDeltaFromTraceEvent({
    id: 'trace_1',
    runId: 'run_1',
    kind: 'model_call',
    title: 'Delta',
    status: 'info',
    roundIndex: 2,
    roundLabel: 'Model turn 2',
    data: {
      stream: {
        kind: 'content',
        delta: ' world',
        accumulated: 'hello world',
      },
    },
    createdAt: '2026-05-16T00:00:01.000Z',
  })

  assert.deepEqual(delta, {
    type: 'assistant_delta',
    delta: ' world',
    accumulated: 'hello world',
    roundIndex: 2,
    roundLabel: 'Model turn 2',
  })
  assert.equal(assistantDeltaFromTraceEvent({
    id: 'trace_2',
    runId: 'run_1',
    kind: 'model_call',
    title: 'No delta',
    status: 'info',
    data: { stream: { kind: 'tool_call', delta: 'ignored' } },
    createdAt: '2026-05-16T00:00:01.000Z',
  }), undefined)
})

test('assistant message lookup prefers explicit assistant id then falls back to latest run message', () => {
  const first = message('msg_1', 'assistant', 'first')
  const explicit = message('msg_2', 'assistant', 'explicit')
  const latest = message('msg_3', 'assistant', 'latest')
  const thread = buildThread([first, explicit, latest])
  const run = buildRun()

  assert.equal(assistantMessageFromTraceEvent(thread, {
    id: 'trace_1',
    runId: 'run_1',
    kind: 'assistant',
    title: 'Assistant message created',
    status: 'completed',
    data: { messageId: 'msg_2' },
    createdAt: '2026-05-16T00:00:01.000Z',
  }), explicit)

  assert.equal(assistantMessageForRun(thread, { ...run, assistantMessageId: 'msg_2' }), explicit)
  assert.equal(assistantMessageForRun(thread, { ...run, assistantMessageId: undefined }), latest)
  assert.equal(assistantMessageForRun(undefined, run), undefined)
})

function buildRun(): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'completed',
    role: 'planner',
    agentManifest: DEFAULT_AGENT_MANIFEST,
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 20,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-05-16T00:00:00.000Z',
    updatedAt: '2026-05-16T00:00:02.000Z',
    completedAt: '2026-05-16T00:00:02.000Z',
    assistantMessageId: 'msg_1',
    steps: [{
      id: 'step_1',
      runId: 'run_1',
      type: 'tool_call',
      status: 'failed',
      toolName: 'tool_a',
      error: 'failed',
      errorData: { code: 'bad_request' },
      durationMs: 15,
      createdAt: '2026-05-16T00:00:01.000Z',
      completedAt: '2026-05-16T00:00:02.000Z',
    }],
    traceEvents: [{
      id: 'trace_1',
      runId: 'run_1',
      kind: 'tool_call',
      title: 'Tool call',
      status: 'failed',
      createdAt: '2026-05-16T00:00:01.000Z',
    }],
  }
}

function buildThread(messages: AgentMessage[]): AgentThread {
  return {
    id: 'thread_1',
    title: 'Thread',
    messages,
    createdAt: '2026-05-16T00:00:00.000Z',
    updatedAt: '2026-05-16T00:00:02.000Z',
  }
}

function message(id: string, role: AgentMessage['role'], content: string): AgentMessage {
  return {
    id,
    threadId: 'thread_1',
    role,
    content,
    runId: 'run_1',
    createdAt: '2026-05-16T00:00:01.000Z',
  }
}
