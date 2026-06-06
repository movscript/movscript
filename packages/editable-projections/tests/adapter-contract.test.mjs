import assert from 'node:assert/strict'
import test from 'node:test'
import {
  InvalidProjectionAdapterContractError,
  assertProjectionAdapterContract,
  createJsonProjectionAdapter,
  validateProjectionAdapterContractOptions,
  verifyProjectionAdapterContract,
} from '../dist/index.js'

const schema = 'contract.note.v1'

test('verifyProjectionAdapterContract accepts a well-formed adapter', () => {
  const adapter = createJsonProjectionAdapter({
    schema,
    entityType: 'note',
    toProjection(entity) {
      return {
        schema,
        id: entity.id,
        title: entity.title,
      }
    },
    validate(value) {
      return typeof value.title === 'string' && value.title.length > 0
        ? []
        : [{ severity: 'error', path: '/title', message: 'Title is required.' }]
    },
    createCommands(input) {
      return [{
        type: `note.${input.action}`,
        entityId: input.entity.entityId,
        target: input.target,
      }]
    },
  })

  const report = assertProjectionAdapterContract({
    adapter,
    entity: { id: 1, title: 'Draft' },
    entityId: 1,
    filePath: 'data/notes/note_1.json',
    validFile: json({ schema, id: 1, title: 'Draft' }),
    invalidFile: json({ schema, id: 1, title: '' }),
  })

  assert.equal(report.ok, true)
  assert.deepEqual(report.issues, [])
})

test('verifyProjectionAdapterContract reports adapter contract violations', () => {
  const adapter = createJsonProjectionAdapter({
    schema,
    entityType: 'note',
    toProjection(entity) {
      return {
        schema,
        id: entity.id,
      }
    },
    createCommands() {
      return {
        warnings: [{ severity: 'notice', message: '' }],
      }
    },
  })

  const report = verifyProjectionAdapterContract({
    adapter,
    entity: { id: 1, title: 'Draft' },
    entityId: 1,
    filePath: 'data/notes/note_1.json',
    validFile: json({ schema, id: 1, title: 'Draft' }),
    invalidFile: json({ schema, id: 1, title: '' }),
  })

  assert.equal(report.ok, false)
  assert.deepEqual(report.issues.map((issue) => issue.path), [
    '/commands',
    '/commands/warnings/0/message',
    '/commands/warnings/0/severity',
    '/invalidFile',
  ])
})

test('verifyProjectionAdapterContract validates runtime option shapes', () => {
  const nullReport = verifyProjectionAdapterContract(null)
  assert.equal(nullReport.ok, false)
  assert.equal(nullReport.adapterSchema, '<unknown>')
  assert.deepEqual(nullReport.issues, [{
    path: '/',
    message: 'adapter contract options must be an object.',
  }])

  const shapeReport = verifyProjectionAdapterContract({
    adapter: {
      schema: '',
      entityType: '',
      serializeFile: 'serialize',
    },
    validFile: {},
    invalidFile: 1,
    filePath: false,
    entityId: {},
    commandInput: [],
  })
  assert.equal(shapeReport.ok, false)
  assert.equal(shapeReport.adapterSchema, '<unknown>')
  assert.deepEqual(shapeReport.issues, [
    { path: '/adapter/schema', message: 'adapter.schema must be a non-empty string.' },
    { path: '/adapter/entityType', message: 'adapter.entityType must be a non-empty string.' },
    { path: '/adapter/parseFile', message: 'adapter.parseFile must be a function.' },
    { path: '/adapter/serializeFile', message: 'adapter.serializeFile must be a function when present.' },
    { path: '/adapter/validateFile', message: 'adapter.validateFile must be a function.' },
    { path: '/adapter/toProjection', message: 'adapter.toProjection must be a function.' },
    { path: '/adapter/createCommands', message: 'adapter.createCommands must be a function.' },
    { path: '/validFile', message: 'validFile must be a string.' },
    { path: '/invalidFile', message: 'invalidFile must be a string when present.' },
    { path: '/filePath', message: 'filePath must be a string when present.' },
    { path: '/entityId', message: 'entityId must be a string or number when present.' },
    { path: '/commandInput', message: 'commandInput must be an object when present.' },
  ])
})

test('validateProjectionAdapterContractOptions accepts a well-formed sample shape', () => {
  const adapter = createJsonProjectionAdapter({
    schema,
    entityType: 'note',
    toProjection(entity) {
      return {
        schema,
        id: entity.id,
        title: entity.title,
      }
    },
    createCommands() {
      return []
    },
  })

  assert.deepEqual(validateProjectionAdapterContractOptions({
    adapter,
    entity: { id: 1, title: 'Draft' },
    validFile: json({ schema, id: 1, title: 'Draft' }),
  }), [])
})

test('assertProjectionAdapterContract throws a stable framework error', () => {
  const adapter = createJsonProjectionAdapter({
    schema,
    entityType: 'note',
    toProjection() {
      throw new Error('unsupported entity')
    },
    createCommands() {
      return []
    },
  })

  assert.throws(
    () => assertProjectionAdapterContract({
      adapter,
      entity: { id: 1, title: 'Draft' },
      validFile: json({ schema, id: 1, title: 'Draft' }),
    }),
    (error) => {
      assert.equal(error instanceof InvalidProjectionAdapterContractError, true)
      assert.equal(error.code, 'invalid_adapter_contract')
      assert.equal(error.adapterSchema, schema)
      assert.deepEqual(error.issues, [{
        path: '/entity/toProjection',
        message: 'toProjection must not throw for the sample entity: unsupported entity',
      }])
      return true
    },
  )
})

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}
