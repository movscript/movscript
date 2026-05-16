import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type {
  AgentRun,
  AgentThread,
} from '../state/types.js'
import {
  loadRuntimeRunExecutionContext,
  type RuntimeRunExecutionContextTraceInput,
} from './runtimeRunExecutionContext.js'

const setupRound = { roundId: 'round_0', roundIndex: 0, roundLabel: 'Setup', roundSource: 'setup' as const }

test('loadRuntimeRunExecutionContext uses frozen run input, records trace, and preserves client input', () => {
  const store = new InMemoryAgentStore()
  const thread = makeThread({
    messages: [
      message('msg_1', 'thread_1', 'user', 'older message'),
      message('msg_2', 'thread_1', 'user', 'newer message'),
    ],
    metadata: {
      lastClientInput: {
        message: 'client input',
        attachments: [{ id: 'att_1', name: 'Attachment', type: 'file' }],
      },
      threadContextSummary: {
        schema: 'movscript.thread-context-summary.v1',
        threadId: 'thread_1',
        updatedAt: '2026-01-01T00:00:00.000Z',
        entries: [],
      },
    },
  })
  const run = makeRun({
    input: runInput({
      userMessage: 'frozen run message',
      sourceMessageId: 'msg_1',
    }),
  })
  const traces: RuntimeRunExecutionContextTraceInput[] = []
  store.createThread(thread)
  store.createRun(run)

  const result = loadRuntimeRunExecutionContext({
    store,
    run,
    setupRound,
    recordTrace: (_run, trace) => traces.push(trace),
  })

  assert.equal(result.thread.id, 'thread_1')
  assert.equal(result.userMessage, 'frozen run message')
  assert.equal(result.executionInput.sourceMessageId, 'msg_1')
  assert.equal(result.lastUser.id, 'msg_1')
  assert.equal(result.lastUser.content, 'frozen run message')
  assert.equal(result.command.name, 'chat')
  assert.equal(result.clientInput?.attachments.length, 1)
  assert.equal(traces[0]?.title, 'User message loaded')
  assert.equal(traces[0]?.summary, 'frozen run message')
  assert.deepEqual(traces[0]?.data, {
    messageId: 'msg_1',
    runInputFrozen: true,
    hasClientInput: true,
    attachmentCount: 1,
  })
  assert.equal((run.metadata?.threadContextSummary as any)?.schema, 'movscript.thread-context-summary.v1')
  assert.equal(store.getRun('run_1')?.metadata?.threadContextSummary !== undefined, true)
})

test('loadRuntimeRunExecutionContext falls back to latest legacy thread user', () => {
  const store = new InMemoryAgentStore()
  const thread = makeThread({
    messages: [
      message('msg_1', 'thread_1', 'user', 'first'),
      message('msg_2', 'thread_1', 'assistant', 'assistant'),
      message('msg_3', 'thread_1', 'user', '/context'),
    ],
  })
  const run = makeRun()
  const traces: RuntimeRunExecutionContextTraceInput[] = []
  store.createThread(thread)
  store.createRun(run)

  const result = loadRuntimeRunExecutionContext({
    store,
    run,
    setupRound,
    recordTrace: (_run, trace) => traces.push(trace),
  })

  assert.equal(result.userMessage, '/context')
  assert.equal(result.executionInput.sourceMessageId, 'msg_3')
  assert.equal(result.command.name, 'context')
  assert.equal(result.clientInput, undefined)
  assert.deepEqual(traces[0]?.data, {
    messageId: 'msg_3',
    runInputFrozen: false,
    hasClientInput: false,
    attachmentCount: 0,
  })
})

test('loadRuntimeRunExecutionContext creates a synthetic user message for source-less run input', () => {
  const store = new InMemoryAgentStore()
  const thread = makeThread({ messages: [] })
  const run = makeRun({ input: runInput({ userMessage: 'source-less input' }) })
  const traces: RuntimeRunExecutionContextTraceInput[] = []
  store.createThread(thread)
  store.createRun(run)

  const result = loadRuntimeRunExecutionContext({
    store,
    run,
    setupRound,
    recordTrace: (_run, trace) => traces.push(trace),
  })

  assert.equal(result.userMessage, 'source-less input')
  assert.equal(result.executionInput.sourceMessageId, undefined)
  assert.equal(result.lastUser.role, 'user')
  assert.equal(result.lastUser.threadId, 'thread_1')
  assert.equal(result.lastUser.content, 'source-less input')
  assert.equal((traces[0]?.data as any)?.messageId, result.lastUser.id)
})

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

function runInput(overrides: Partial<NonNullable<AgentRun['input']>>): NonNullable<AgentRun['input']> {
  return {
    schema: 'movscript.agent.run-input.v1',
    userMessage: '',
    executionMode: 'chat',
    createdAt: '2026-01-01T00:00:00.000Z',
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

function message(
  id: string,
  threadId: string,
  role: 'user' | 'assistant',
  content: string,
) {
  return {
    id,
    threadId,
    role,
    content,
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}
