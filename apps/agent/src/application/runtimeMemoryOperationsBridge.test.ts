import test from 'node:test'
import assert from 'node:assert/strict'
import { MemoryManager } from '../memory/memoryManager.js'
import { InMemoryAgentMemoryStore } from '../memory/memoryStore.js'
import { createRuntimeMemoryOperationsBridge } from './runtimeMemoryOperationsBridge.js'

test('createRuntimeMemoryOperationsBridge wires memory store and manager operations', () => {
  const memoryStore = new InMemoryAgentMemoryStore()
  const memoryManager = new MemoryManager(memoryStore)
  const bridge = createRuntimeMemoryOperationsBridge({ memoryStore, memoryManager })

  const memory = bridge.createMemory({
    projectId: 42,
    title: 'Local preference',
    kind: 'preference',
    content: 'Use concise summaries',
  })

  assert.equal(bridge.getMemory(42, memory.id)?.id, memory.id)
  assert.equal(bridge.listMemories({ projectId: 42 }).length, 1)
  assert.equal(bridge.listMemorySummaries({ projectId: 42 }).length, 1)
  assert.equal(bridge.deleteMemory(42, memory.id), true)
  assert.equal(bridge.getMemory(42, memory.id), undefined)
})
