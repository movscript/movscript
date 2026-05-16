import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentThread, CreateThreadInput } from '../state/types.js'
import { createRuntimeThread } from './runtimeThreadLifecycle.js'
import { prepareRuntimeToolRunThread } from './runtimeToolRunThread.js'

test('prepareRuntimeToolRunThread appends a tool-run user message to an existing thread', () => {
  const store = new InMemoryAgentStore()
  const thread = createThread(store, { title: 'Existing' })

  const result = prepareRuntimeToolRunThread({
    store,
    toolRunInput: {
      toolCall: { name: 'tool_a', args: { value: 1 } },
      threadId: thread.id,
      message: 'Run this tool',
      clientInput: {
        message: 'Client input wins',
        attachments: [],
      },
    },
    createThread: (input) => createThread(store, input),
  })

  assert.equal(result.thread.id, thread.id)
  assert.deepEqual(result.toolCall, { name: 'tool_a', args: { value: 1 } })
  assert.equal(result.userMessage.threadId, thread.id)
  assert.equal(result.userMessage.content, 'Client input wins')
  assert.equal(store.getThread(thread.id)?.messages.at(-1)?.id, result.userMessage.id)
  assert.equal(store.getThread(thread.id)?.metadata?.lastClientInput !== undefined, true)
})

test('prepareRuntimeToolRunThread creates a titled thread when threadId is absent', () => {
  const store = new InMemoryAgentStore()

  const result = prepareRuntimeToolRunThread({
    store,
    toolRunInput: { toolCall: { name: 'tool_a', arguments: {} } },
    createThread: (input) => createThread(store, input),
  })

  assert.equal(result.thread.title, 'Tool run: tool_a')
  assert.equal(result.userMessage.content, 'Run tool tool_a')
  assert.equal(store.getThread(result.thread.id)?.messages.length, 1)
})

test('prepareRuntimeToolRunThread rejects missing tool calls before creating thread state', () => {
  const store = new InMemoryAgentStore()

  assert.throws(() => prepareRuntimeToolRunThread({
    store,
    toolRunInput: {},
    createThread: (input) => createThread(store, input),
  }), /toolCall is required/)
  assert.equal(store.listThreads().length, 0)
})

function createThread(store: InMemoryAgentStore, input: CreateThreadInput = {}): AgentThread {
  return createRuntimeThread({
    store,
    threadId: `thread_${store.listThreads().length + 1}`,
    messageId: () => `msg_${Date.now()}`,
    now: () => '2026-01-01T00:00:00.000Z',
    threadInput: input,
  }).thread
}
