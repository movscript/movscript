import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MemoryBackendStore,
  MemoryManifestStore,
  MemorySnapshotStore,
  MemoryWorkspaceFileSystem,
  InvalidJsonProjectionError,
  InvalidProjectionCommandResultError,
  createEditableProjectionWorkspace,
  createJsonProjectionAdapter,
  createProjectionRegistry,
  parseJsonProjection,
  sha256,
} from '../dist/index.js'

const schema = 'example.note.v1'

test('createJsonProjectionAdapter parses, serializes, and validates schema', () => {
  const adapter = createJsonProjectionAdapter({
    schema,
    entityType: 'note',
    createCommands: () => [],
  })

  const value = adapter.parseFile('{"schema":"example.note.v1","title":"A"}', {
    filePath: 'notes/note_1.json',
  })

  assert.deepEqual(value, { schema, title: 'A' })
  assert.equal(adapter.serializeFile(value), `${JSON.stringify(value, null, 2)}\n`)
  assert.deepEqual(adapter.validateFile(value, { filePath: 'notes/note_1.json' }), {
    ok: true,
    issues: [],
  })
  assert.deepEqual(adapter.validateFile({ schema: 'wrong' }, { filePath: 'notes/note_1.json' }), {
    ok: false,
    issues: [{
      severity: 'error',
      path: '/schema',
      message: 'JSON projection schema must be example.note.v1.',
    }],
  })
})

test('parseJsonProjection reports invalid JSON with a stable error', () => {
  assert.throws(
    () => parseJsonProjection('{', 'data/notes/note_1.json'),
    (error) => {
      assert.equal(error instanceof InvalidJsonProjectionError, true)
      assert.equal(error.code, 'invalid_json_projection')
      assert.equal(error.projectionPath, 'data/notes/note_1.json')
      assert.match(error.causeMessage, /JSON/)
      return true
    },
  )
})

test('createJsonProjectionAdapter supports custom validation and command shorthand', () => {
  const adapter = createJsonProjectionAdapter({
    schema,
    entityType: 'note',
    validate(value) {
      return typeof value.title === 'string' && value.title.length > 0
        ? []
        : [{ severity: 'error', path: '/title', message: 'Title is required.' }]
    },
    createCommands(input) {
      return [{
        type: `note.${input.action}`,
        patch: input.patch,
        ...(input.entity.entityId !== undefined ? { entityId: input.entity.entityId } : {}),
      }]
    },
  })

  assert.deepEqual(adapter.validateFile({ schema, title: '' }, { filePath: 'notes/note_1.json' }), {
    ok: false,
    issues: [{ severity: 'error', path: '/title', message: 'Title is required.' }],
  })

  assert.deepEqual(adapter.createCommands({
    action: 'update',
    filePath: 'notes/note_1.json',
    entity: { entityType: 'note', entityId: 1 },
    patch: [{ op: 'replace', path: '/title', value: 'B' }],
  }).commands, [{
    type: 'note.update',
    entityId: 1,
    patch: [{ op: 'replace', path: '/title', value: 'B' }],
  }])
})

test('createJsonProjectionAdapter validates command result objects', () => {
  const adapter = createJsonProjectionAdapter({
    schema,
    entityType: 'note',
    createCommands() {
      return {
        warnings: [{ severity: 'notice', message: '' }],
      }
    },
  })

  assert.throws(
    () => adapter.createCommands({
      action: 'update',
      filePath: 'data/notes/note_1.json',
      entity: { entityType: 'note', entityId: 1 },
      patch: [],
    }),
    (error) => {
      assert.equal(error instanceof InvalidProjectionCommandResultError, true)
      assert.equal(error.code, 'invalid_command_result')
      assert.equal(error.adapterSchema, schema)
      assert.equal(error.filePath, 'data/notes/note_1.json')
      assert.deepEqual(error.issues.map((issue) => issue.path), [
        '/commands',
        '/warnings/0/message',
        '/warnings/0/severity',
      ])
      return true
    },
  )
})

test('createJsonProjectionAdapter turns invalid local JSON into a blocked review issue', async () => {
  const adapter = createJsonProjectionAdapter({
    schema,
    entityType: 'note',
    createCommands: () => [],
  })
  const base = json({ schema, title: 'A' })
  const workspace = createEditableProjectionWorkspace({
    fs: new MemoryWorkspaceFileSystem({
      'data/notes/note_1.json': '{',
    }),
    manifestStore: new MemoryManifestStore({
      version: 1,
      files: {
        'data/notes/note_1.json': {
          schema,
          kind: 'writable_projection',
          writable: true,
          entityType: 'note',
          entityId: 1,
          baseHash: sha256(base),
          baseBackendHash: 'note-v1',
        },
      },
    }),
    snapshotStore: new MemorySnapshotStore({
      'data/notes/note_1.json': base,
    }),
    backendStore: new MemoryBackendStore([{
      entityType: 'note',
      entityId: 1,
      hash: 'note-v1',
      value: { schema, title: 'A' },
    }]),
    registry: createProjectionRegistry([adapter]),
  })

  const review = await workspace.applyReview('data/notes')

  assert.equal(review.summary.blocked, 1)
  assert.equal(review.operations[0].state, 'blocked')
  assert.equal(
    review.operations[0].issues.some((issue) =>
      /Invalid JSON projection: data\/notes\/note_1\.json/.test(issue.message),
    ),
    true,
  )
})

test('createJsonProjectionAdapter works through workspace update, edit, and apply', async () => {
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
        patch: input.patch,
        ...(input.entity.entityId !== undefined ? { entityId: input.entity.entityId } : {}),
        ...(input.target !== undefined ? { target: input.target } : {}),
      }]
    },
  })
  const backendStore = new MemoryBackendStore([{
    entityType: 'note',
    entityId: 1,
    hash: 'note-v1',
    value: { id: 1, title: 'A' },
  }])
  const fs = new MemoryWorkspaceFileSystem()
  const workspace = createEditableProjectionWorkspace({
    fs,
    manifestStore: new MemoryManifestStore(),
    snapshotStore: new MemorySnapshotStore(),
    backendStore,
    registry: createProjectionRegistry([adapter]),
  })

  await workspace.update([{
    path: 'data/notes/note_1.json',
    schema,
    kind: 'writable_projection',
    writable: true,
    entityType: 'note',
    entityId: 1,
  }])
  const edited = JSON.parse(await fs.readFile('data/notes/note_1.json'))
  edited.title = 'B'
  await fs.writeFile('data/notes/note_1.json', `${JSON.stringify(edited, null, 2)}\n`)

  const review = await workspace.applyReview('data/notes')
  assert.equal(review.summary.update, 1)
  assert.deepEqual(review.operations[0].commands[0], {
    type: 'note.update',
    entityId: 1,
    target: { schema, id: 1, title: 'B' },
    patch: [{ op: 'replace', path: '/title', value: 'B' }],
  })
})

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}
