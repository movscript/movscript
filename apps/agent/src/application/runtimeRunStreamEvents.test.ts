import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentMessage, AgentRun, AgentRunStreamEvent, AgentThread } from '../state/types.js'
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
  const events: AgentRunStreamEvent[] = []

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
  assert.deepEqual(events.map((event) => event.type), ['trace', 'assistant_delta', 'assistant_message'])
  assert.equal(events[1]?.type === 'assistant_delta' ? events[1].delta : undefined, 'd')
  assert.equal(events[2]?.type === 'assistant_message' ? events[2].message.id : undefined, assistant.id)
})

test('emitRuntimeVolatileTraceEvent emits transient tool traces and assistant deltas without persistence', () => {
  const run = makeRun()
  const events: AgentRunStreamEvent[] = []

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

  assert.deepEqual(events.map((event) => event.type), ['trace', 'assistant_delta'])
  assert.equal(events[0]?.type === 'trace' ? events[0].event.id : undefined, 'trace_live_tool_a')
  assert.equal(events[1]?.type === 'assistant_delta' ? events[1].accumulated : undefined, 'xy')
})

test('replayRuntimeRunStream replays snapshot, title, trace deltas, assistant message, and done', () => {
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
  const events: AgentRunStreamEvent[] = []

  replayRuntimeRunStream({ run, store, listener: (event) => events.push(event) })

  assert.deepEqual(events.map((event) => event.type), ['run', 'thread_title', 'trace', 'assistant_delta', 'assistant_message', 'done'])
  assert.equal(events[1]?.type === 'thread_title' ? events[1].title : undefined, 'Thread title')
  assert.equal(events[4]?.type === 'assistant_message' ? events[4].message.id : undefined, assistant.id)
})

test('emitRuntimeRunSnapshot and emitRuntimeAssistantMessage project stream events', () => {
  const run = makeRun()
  const assistant = makeMessage({ id: 'msg_assistant', role: 'assistant', content: 'done', runId: run.id })
  const events: AgentRunStreamEvent[] = []

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
