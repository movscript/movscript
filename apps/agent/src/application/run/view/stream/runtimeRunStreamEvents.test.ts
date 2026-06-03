import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../../../../state/store/core/store.js'
import type { AgentMessage, AgentRun, AgentInternalRunSignal, AgentThread } from '../../../../state/shared/types.js'
import {
  emitRuntimeAssistantMessage,
  emitRuntimeRunSnapshot,
  emitRuntimeVolatileTraceEvent,
  recordRuntimeRunTraceEvent,
  replayRuntimeRunStream,
} from './runtimeRunStreamEvents.js'

test('recordRuntimeRunTraceEvent persists trace and emits derived assistant stream events', () => {
  const store = new InMemoryAgentStore()
  const run = makeRun()
  const assistant = makeMessage({ id: 'msg_assistant', role: 'assistant', content: 'done', runId: run.id })
  store.createThread(makeThread({ messages: [assistant] }))
  store.createRun(run)
  const events: AgentInternalRunSignal[] = []

  const trace = recordRuntimeRunTraceEvent({
    store,
    run,
    traceId: 'trace_1',
    now: '2026-01-01T00:00:01.000Z',
    trace: {
      kind: 'assistant',
      title: 'Assistant message',
      status: 'completed',
      data: { messageId: assistant.id, stream: { kind: 'content', delta: 'd', accumulated: 'done' } },
    },
    emitRunStreamEvent: (_runId, event) => events.push(event),
  })

  assert.equal(trace.id, 'trace_1')
  assert.equal(store.listRunTraceEvents(run.id).length, 1)
  assert.deepEqual(events.map((event) => event.type), ['trace', 'assistant_progress', 'assistant_message'])
  assert.equal(events[1]?.type === 'assistant_progress' ? events[1].delta : undefined, 'd')
  assert.equal(events[2]?.type === 'assistant_message' ? events[2].message.id : undefined, assistant.id)
})

test('emitRuntimeVolatileTraceEvent emits transient tool traces and assistant progress without persistence', () => {
  const run = makeRun()
  const events: AgentInternalRunSignal[] = []

  emitRuntimeVolatileTraceEvent({
    run,
    traceId: 'trace_fallback',
    now: '2026-01-01T00:00:02.000Z',
    trace: {
      kind: 'tool_call',
      title: 'Live tool',
      status: 'started',
      roundIndex: 2,
      roundLabel: 'Model',
      roundSource: 'model',
      volatileKey: 'tool_a',
      data: { stream: { kind: 'content', delta: 'x', accumulated: 'xy' } },
    },
    emitRunStreamEvent: (_runId, event) => events.push(event),
  })

  assert.deepEqual(events.map((event) => event.type), ['trace', 'assistant_progress'])
  assert.equal(events[0]?.type === 'trace' ? events[0].event.id : undefined, 'trace_live_tool_a')
  assert.equal(events[1]?.type === 'assistant_progress' ? events[1].accumulated : undefined, 'xy')
})

test('emitRuntimeVolatileTraceEvent emits transient reasoning traces without assistant content progress', () => {
  const run = makeRun()
  const events: AgentInternalRunSignal[] = []

  emitRuntimeVolatileTraceEvent({
    run,
    traceId: 'trace_fallback',
    now: '2026-01-01T00:00:02.000Z',
    trace: {
      kind: 'reasoning',
      title: 'Model reasoning delta',
      status: 'info',
      roundIndex: 2,
      roundLabel: 'Model',
      roundSource: 'model',
      volatileKey: 'model-reasoning-stream:2',
      data: { stream: { kind: 'reasoning', delta: 'Checking context', accumulated: 'Checking context' } },
    },
    emitRunStreamEvent: (_runId, event) => events.push(event),
  })

  assert.deepEqual(events.map((event) => event.type), ['trace'])
  assert.equal(events[0]?.type === 'trace' ? events[0].event.id : undefined, 'trace_live_model-reasoning-stream:2')
  const data = events[0]?.type === 'trace' ? events[0].event.data as Record<string, unknown> : undefined
  assert.match(JSON.stringify(data), /deltaHash/)
  assert.match(JSON.stringify(data), /accumulatedHash/)
  assert.doesNotMatch(JSON.stringify(data), /Checking context/)
})

test('replayRuntimeRunStream replays snapshot, title, trace progress, assistant message, and done', () => {
  const store = new InMemoryAgentStore()
  const run = { ...makeRun(), status: 'completed' as const, assistantMessageId: 'msg_assistant' }
  const assistant = makeMessage({ id: 'msg_assistant', role: 'assistant', content: 'complete', runId: run.id })
  store.createThread(makeThread({ title: 'Thread title', messages: [assistant] }))
  store.createRun(run)
  recordRuntimeRunTraceEvent({
    store,
    run,
    traceId: 'trace_1',
    now: '2026-01-01T00:00:01.000Z',
    trace: {
      kind: 'model_call',
      title: 'Streaming',
      status: 'info',
      data: { stream: { kind: 'content', delta: 'c', accumulated: 'complete' } },
    },
    emitRunStreamEvent: () => {},
  })
  const events: AgentInternalRunSignal[] = []

  replayRuntimeRunStream({ run, store, listener: (event) => events.push(event) })

  assert.deepEqual(events.map((event) => event.type), ['run', 'thread_title', 'runtime_status', 'trace', 'assistant_progress', 'assistant_message', 'done'])
  assert.equal(events[1]?.type === 'thread_title' ? events[1].title : undefined, 'Thread title')
  assert.equal(events[5]?.type === 'assistant_message' ? events[5].message.id : undefined, assistant.id)
})

test('replayRuntimeRunStream does not close the stream for requires_action', () => {
  const store = new InMemoryAgentStore()
  const run = { ...makeRun(), status: 'requires_action' as const }
  store.createThread(makeThread())
  store.createRun(run)
  const events: AgentInternalRunSignal[] = []

  replayRuntimeRunStream({ run, store, listener: (event) => events.push(event) })

  assert.deepEqual(events.map((event) => event.type), ['run', 'runtime_status'])
})

test('emitRuntimeRunSnapshot and emitRuntimeAssistantMessage project stream events', () => {
  const run = makeRun()
  const assistant = makeMessage({ id: 'msg_assistant', role: 'assistant', content: 'done', runId: run.id })
  const events: AgentInternalRunSignal[] = []

  emitRuntimeRunSnapshot({ run, done: true, emitRunStreamEvent: (_runId, event) => events.push(event) })
  emitRuntimeAssistantMessage({ run, message: assistant, emitRunStreamEvent: (_runId, event) => events.push(event) })

  assert.deepEqual(events.map((event) => event.type), ['run', 'done', 'assistant_message'])
  assert.equal(events[2]?.type === 'assistant_message' ? events[2].run.id : undefined, run.id)
})

function makeRun(): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'in_progress',
    runtimeLimits: { approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    steps: [],
  }
}

function makeThread(input: { title?: string; messages?: AgentMessage[] } = {}): AgentThread {
  return {
    id: 'thread_1',
    ...(input.title ? { title: input.title } : {}),
    status: 'running',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    messages: input.messages ?? [],
  }
}

function makeMessage(input: { id: string; role: AgentMessage['role']; content: string; runId?: string }): AgentMessage {
  return {
    id: input.id,
    threadId: 'thread_1',
    role: input.role,
    content: input.content,
    ...(input.runId ? { runId: input.runId } : {}),
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}
