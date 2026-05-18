import assert from 'node:assert/strict'
import test from 'node:test'
import { MemoryManager } from './memoryManager.js'
import { InMemoryAgentMemoryStore } from './memoryStore.js'
import type { AgentMessage, AgentRun } from '../state/types.js'

test('memory manager only writes explicit memory preferences, not draft side effects', () => {
  class DraftResult {
    id = 'draft_1'
    title = 'Prototype draft'
  }

  const manager = new MemoryManager(new InMemoryAgentMemoryStore())
  const memories = manager.extractAndWriteMemories({
    run: makeRun(),
    userMessage: { ...makeUserMessage(), content: 'create a draft' },
    projectId: 42,
    toolResults: [{
      call: { name: 'movscript_create_draft', args: { kind: 'note' } },
      result: new DraftResult() as never,
    }],
    warnings: [],
  })

  assert.deepEqual(memories, [])
})

test('memory manager writes explicit preference memories', () => {
  const manager = new MemoryManager(new InMemoryAgentMemoryStore())
  const memories = manager.extractAndWriteMemories({
    run: makeRun(),
    userMessage: { ...makeUserMessage(), content: '以后默认中文回答' },
    projectId: 42,
    toolResults: [],
    warnings: [],
  })

  assert.equal(memories.length, 1)
  assert.equal(memories[0]?.kind, 'preference')
  assert.equal(memories[0]?.title, '偏好：以后默认中文回答')
  assert.equal(memories[0]?.content, '以后默认中文回答')
})

test('memory manager ignores invalid project scopes', () => {
  const store = new InMemoryAgentMemoryStore()
  const manager = new MemoryManager(store)
  const memory = manager.createMemory({
    projectId: 42,
    title: 'Scoped fact',
    kind: 'fact',
    content: 'Only visible in the matching project.',
  })

  assert.deepEqual(manager.loadRelevantMemories({ projectId: 0, query: 'Scoped' }), [])
  assert.deepEqual(manager.searchMemories({ projectId: 42.5, query: 'Scoped' }), [])
  assert.deepEqual(manager.loadRelevantMemories({ projectId: Number.NaN, query: 'Scoped' }), [])
  assert.deepEqual(manager.searchMemories({ projectId: Number.POSITIVE_INFINITY, query: 'Scoped' }), [])
  assert.deepEqual(manager.listMemorySummaries({ projectId: Number.NaN }), [])
  assert.equal(manager.getMemory({ projectId: Number.NaN, id: memory.id }), undefined)
  assert.equal(manager.deleteMemory({ projectId: Number.NaN, id: memory.id }), false)
  assert.equal(manager.getMemory({ projectId: 42, id: memory.id })?.id, memory.id)
  assert.deepEqual(manager.extractAndWriteMemories({
    run: makeRun(),
    userMessage: { ...makeUserMessage(), content: '以后默认中文回答' },
    projectId: Number.NaN,
    toolResults: [],
    warnings: ['remember this warning'],
  }), [])
})

function makeRun(): AgentRun {
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
    createdAt: '2026-05-16T00:00:00.000Z',
    updatedAt: '2026-05-16T00:00:00.000Z',
    steps: [],
  }
}

function makeUserMessage(): AgentMessage {
  return {
    id: 'msg_1',
    threadId: 'thread_1',
    role: 'user',
    content: 'create a draft',
    createdAt: '2026-05-16T00:00:00.000Z',
  }
}
