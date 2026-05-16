import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentMemoryStore, memoryStorePath } from './memoryStore.js'

test('memoryStorePath returns file-backed store paths only', () => {
  assert.equal(memoryStorePath(new InMemoryAgentMemoryStore()), undefined)
  assert.equal(memoryStorePath(Object.assign(new InMemoryAgentMemoryStore(), {
    filePath: '/tmp/movscript-agent-memory.json',
  })), '/tmp/movscript-agent-memory.json')
  assert.equal(memoryStorePath(Object.assign(new InMemoryAgentMemoryStore(), {
    filePath: '   ',
  })), undefined)
})
