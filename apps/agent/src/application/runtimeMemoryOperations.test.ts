import assert from 'node:assert/strict'
import test from 'node:test'
import { MemoryManager } from '../memory/memoryManager.js'
import { InMemoryAgentMemoryStore } from '../memory/memoryStore.js'
import {
  createRuntimeMemory,
  deleteRuntimeMemory,
  getRuntimeMemory,
  listRuntimeMemories,
  listRuntimeMemorySummaries,
} from './runtimeMemoryOperations.js'

test('runtime memory operations preserve project scoping and manager summaries', () => {
  const memoryStore = new InMemoryAgentMemoryStore()
  const memoryManager = new MemoryManager(memoryStore)
  const local = createRuntimeMemory({
    memoryManager,
    memoryInput: {
      projectId: 42,
      title: 'Local preference',
      kind: 'preference',
      content: 'prefer quiet plans',
    },
  })
  const other = createRuntimeMemory({
    memoryManager,
    memoryInput: {
      projectId: 7,
      title: 'Other preference',
      kind: 'preference',
      content: 'other project',
    },
  })

  assert.deepEqual(listRuntimeMemories({
    memoryStore,
    query: { projectId: 42 },
  }).map((memory) => memory.id), [local.id])
  assert.equal(getRuntimeMemory({ memoryManager, projectId: 42, id: local.id })?.id, local.id)
  assert.equal(getRuntimeMemory({ memoryManager, projectId: 42, id: other.id }), undefined)
  assert.deepEqual(listRuntimeMemorySummaries({
    memoryManager,
    query: { projectId: 42 },
  }).map((memory) => memory.id), [local.id])
  assert.equal(deleteRuntimeMemory({ memoryManager, projectId: 42, id: local.id }), true)
  assert.equal(getRuntimeMemory({ memoryManager, projectId: 42, id: local.id }), undefined)
  assert.equal(getRuntimeMemory({ memoryManager, projectId: 7, id: other.id })?.id, other.id)
})

test('runtime memory delete is scoped and returns false for missing project matches', () => {
  const memoryStore = new InMemoryAgentMemoryStore()
  const memoryManager = new MemoryManager(memoryStore)
  const memory = createRuntimeMemory({
    memoryManager,
    memoryInput: {
      projectId: 42,
      title: 'Fact',
      kind: 'fact',
      content: 'Project scoped fact',
    },
  })

  assert.equal(deleteRuntimeMemory({ memoryManager, projectId: 7, id: memory.id }), false)
  assert.equal(getRuntimeMemory({ memoryManager, projectId: 42, id: memory.id })?.id, memory.id)
})

test('runtime memory operations reject invalid project scopes at the facade boundary', () => {
  const memoryStore = new InMemoryAgentMemoryStore()
  const memoryManager = new MemoryManager(memoryStore)
  const memory = createRuntimeMemory({
    memoryManager,
    memoryInput: {
      projectId: 42,
      title: 'Fact',
      kind: 'fact',
      content: 'Project scoped fact',
    },
  })

  for (const projectId of [0, 42.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(getRuntimeMemory({ memoryManager, projectId, id: memory.id }), undefined)
    assert.equal(deleteRuntimeMemory({ memoryManager, projectId, id: memory.id }), false)
  }
  assert.equal(getRuntimeMemory({ memoryManager, projectId: 42, id: memory.id })?.id, memory.id)
})
