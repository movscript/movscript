import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DuplicateProjectionAdapterError,
  createProjectionRegistry,
  defineProjectionAdapter,
} from '../dist/index.js'

test('ProjectionRegistry rejects duplicate schemas with a stable error', () => {
  const first = makeAdapter('example.note.v1', 'note')
  const second = makeAdapter('example.note.v1', 'note_copy')

  assert.throws(
    () => createProjectionRegistry([first, second]),
    (error) => {
      assert.equal(error instanceof DuplicateProjectionAdapterError, true)
      assert.equal(error.code, 'duplicate_adapter')
      assert.equal(error.schema, 'example.note.v1')
      return true
    },
  )
})

test('ProjectionRegistry allows registering the same adapter instance more than once', () => {
  const adapter = makeAdapter('example.note.v1', 'note')
  const registry = createProjectionRegistry([adapter, adapter])

  assert.equal(registry.get('example.note.v1'), adapter)
})

function makeAdapter(schema, entityType) {
  return defineProjectionAdapter({
    schema,
    entityType,
    parseFile(content) {
      return JSON.parse(content)
    },
    validateFile() {
      return { ok: true, issues: [] }
    },
    toProjection(entity) {
      return entity
    },
    createCommands() {
      return { commands: [] }
    },
  })
}
