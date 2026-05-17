import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentMemoryStore, matchesQuery, memoryStorePath } from './memoryStore.js'

test('memoryStorePath returns file-backed store paths only', () => {
  assert.equal(memoryStorePath(new InMemoryAgentMemoryStore()), undefined)
  assert.equal(memoryStorePath(Object.assign(new InMemoryAgentMemoryStore(), {
    filePath: '/tmp/movscript-agent-memory.json',
  })), '/tmp/movscript-agent-memory.json')
  assert.equal(memoryStorePath(Object.assign(new InMemoryAgentMemoryStore(), {
    filePath: '   ',
  })), undefined)
})

test('listMemories requires a positive safe integer project scope', () => {
  const store = new InMemoryAgentMemoryStore()
  const memory = store.createMemory({
    projectId: 42,
    title: 'Refactor note',
    kind: 'fact',
    content: 'Runtime memory is project scoped.',
  })

  assert.deepEqual(store.listMemories(), [])
  assert.deepEqual(store.listMemories({}), [])
  assert.deepEqual(store.listMemories({ projectId: 0 }), [])
  assert.deepEqual(store.listMemories({ projectId: 42.5 }), [])
  assert.deepEqual(store.listMemories({ projectId: Number.NaN }), [])
  assert.deepEqual(store.listMemories({ projectId: 43 }), [])
  assert.deepEqual(store.listMemories({ projectId: 42 }).map((item) => item.id), [memory.id])
})

test('createMemory rejects invalid project scopes', () => {
  const store = new InMemoryAgentMemoryStore()

  assert.throws(() => store.createMemory({
    projectId: 0,
    title: 'Invalid memory',
    kind: 'fact',
    content: 'This should not be stored.',
  }), /projectId must be a positive safe integer/)

  assert.throws(() => store.createMemory({
    projectId: 42.5,
    title: 'Invalid memory',
    kind: 'fact',
    content: 'This should not be stored.',
  }), /projectId must be a positive safe integer/)

  assert.throws(() => store.createMemory({
    projectId: Number.NaN,
    title: 'Invalid memory',
    kind: 'fact',
    content: 'This should not be stored.',
  }), /projectId must be a positive safe integer/)

  assert.throws(() => store.createMemory({
    projectId: Number.POSITIVE_INFINITY,
    title: 'Invalid memory',
    kind: 'fact',
    content: 'This should not be stored.',
  }), /projectId must be a positive safe integer/)
})

test('matchesQuery refuses unscoped memory queries', () => {
  const store = new InMemoryAgentMemoryStore()
  const memory = store.createMemory({
    projectId: 42,
    title: 'Decision',
    kind: 'decision',
    content: 'Keep memory reads scoped to a project.',
  })

  assert.equal(matchesQuery(memory), false)
  assert.equal(matchesQuery(memory, {}), false)
  assert.equal(matchesQuery(memory, { projectId: 0 }), false)
  assert.equal(matchesQuery(memory, { projectId: 42.5 }), false)
  assert.equal(matchesQuery(memory, { projectId: Number.NaN }), false)
  assert.equal(matchesQuery(memory, { projectId: 42, kind: 'decision' }), true)
})
