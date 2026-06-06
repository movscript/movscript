import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  MemoryBackendStore,
  createEditableProjectionKit,
  createJsonProjectionAdapter,
  createProjectionRegistry,
  createWritableProjectionUpdateTarget,
  InvalidEditableProjectionKitOptionsError,
  InvalidFormatOptionsError,
} from '../dist/index.js'
import {
  createNodeEditableProjectionKit,
} from '../dist/node.js'

const schema = 'example.note.v1'

test('createEditableProjectionKit wires adapters, memory workflow, review store, and executor defaults', async () => {
  const backendStore = new MemoryBackendStore([{
    entityType: 'note',
    entityId: 1,
    hash: 'note-v1',
    value: { id: 1, title: 'Original' },
  }])
  const executed = []
  const kit = createEditableProjectionKit({
    adapters: [noteAdapter],
    backendStore,
    executor: {
      async execute(commands) {
        executed.push(...commands)
        return {
          updateTargets: [noteUpdateTarget({
            schema,
            id: Number(commands[0].entityId),
            title: commands[0].target.title,
          }, 'note-v2')],
        }
      },
    },
  })
  const bundle = kit.createMemoryWorkflow()

  assert.equal(kit.registry.get(schema), noteAdapter)

  await bundle.workflow.update([noteUpdateTarget({ schema, id: 1, title: 'Original' }, 'note-v1')])
  await bundle.fs.writeFile('data/notes/note_1.json', `${JSON.stringify({ schema, id: 1, title: 'Edited' }, null, 2)}\n`)

  const saved = await bundle.workflow.reviewAndSave('data/notes', 'note-1')
  assert.equal(saved.gate.ready, true)
  assert.equal(saved.review.summary.update, 1)
  await bundle.updateTargetStore.save('note-refresh', [noteUpdateTarget({ schema, id: 1, title: 'Edited' }, 'note-v2')])
  assert.equal((await bundle.updateTargetStore.load('note-refresh'))[0].backendHash, 'note-v2')

  const applied = await bundle.workflow.loadAndApply('note-1')
  assert.equal(executed[0].type, 'note.update')
  assert.equal(applied.result.appliedCommands, 1)
  assert.equal(applied.result.refresh.summary.updated, 1)
  assert.match(await bundle.fs.readFile('data/notes/note_1.json'), /"Edited"/)
})

test('createNodeEditableProjectionKit builds a filesystem workflow from adapters', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'editable-projections-kit-'))
  try {
    const kit = createNodeEditableProjectionKit(root, {
      adapters: [noteAdapter],
      backendStore: new MemoryBackendStore(),
    })

    assert.equal(kit.registry.get(schema), noteAdapter)

    const status = await kit.workflow.status('.')
    assert.equal(status.status.files.length, 0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('kit factories reject ambiguous registry and adapter options', () => {
  const registry = createProjectionRegistry([noteAdapter])
  const backendStore = new MemoryBackendStore()

  assert.throws(
    () => createEditableProjectionKit({
      registry,
      adapters: [noteAdapter],
      backendStore,
    }),
    (error) => {
      assert.equal(error instanceof InvalidEditableProjectionKitOptionsError, true)
      assert.equal(error.code, 'invalid_kit_options')
      assert.equal(error.issues.length, 1)
      return true
    },
  )

  assert.throws(
    () => createNodeEditableProjectionKit('/tmp/editable-projections-kit-ambiguous', {
      registry,
      adapters: [noteAdapter],
      backendStore,
    }),
    (error) => {
      assert.equal(error instanceof InvalidEditableProjectionKitOptionsError, true)
      assert.equal(error.code, 'invalid_kit_options')
      return true
    },
  )
})

test('kit factories validate runtime dependency shapes', () => {
  const backendStore = new MemoryBackendStore()

  for (const { create, messages } of [
    {
      create: () => createEditableProjectionKit({
        adapters: [noteAdapter],
      }),
      messages: ['backendStore must be an object with a getEntity function.'],
    },
    {
      create: () => createEditableProjectionKit({
        adapters: [noteAdapter],
        backendStore,
        executor: {},
      }),
      messages: ['executor must be an object with an execute function when present.'],
    },
    {
      create: () => createEditableProjectionKit({
        registry: { get() {} },
        backendStore,
      }),
      messages: ['registry must be an object with get and getByEntityType functions when present.'],
    },
    {
      create: () => createNodeEditableProjectionKit('/tmp/editable-projections-kit-invalid', {
        adapters: {},
        backendStore,
      }),
      messages: ['adapters must be an array when present.'],
    },
    {
      create: () => createEditableProjectionKit(null),
      messages: ['kit options must be an object.'],
    },
    {
      create: () => createEditableProjectionKit({
        adapters: [{}],
        backendStore,
      }),
      messages: ['adapters[0] must be a projection adapter with schema, entityType, parseFile, validateFile, toProjection, and createCommands.'],
    },
  ]) {
    assert.throws(
      create,
      (error) => {
        assert.equal(error instanceof InvalidEditableProjectionKitOptionsError, true)
        assert.equal(error.code, 'invalid_kit_options')
        assert.deepEqual(error.issues, messages)
        return true
      },
    )
  }
})

test('createEditableProjectionKit validates format options before merging them', async () => {
  const backendStore = new MemoryBackendStore()

  assert.throws(
    () => createEditableProjectionKit({
      adapters: [noteAdapter],
      backendStore,
      format: 'compact',
    }),
    (error) => {
      assert.equal(error instanceof InvalidFormatOptionsError, true)
      assert.equal(error.code, 'invalid_format_options')
      assert.deepEqual(error.issues, [{
        path: '/',
        message: 'Format options must be an object.',
      }])
      return true
    },
  )

  const kit = createEditableProjectionKit({
    adapters: [noteAdapter],
    backendStore,
    format: { includeNoop: true },
  })

  assert.throws(
    () => kit.createMemoryWorkflow({
      format: {
        includeCommands: 'yes',
      },
    }),
    (error) => {
      assert.equal(error instanceof InvalidFormatOptionsError, true)
      assert.equal(error.code, 'invalid_format_options')
      assert.deepEqual(error.issues, [{
        path: '/includeCommands',
        message: 'includeCommands must be a boolean when present.',
      }])
      return true
    },
  )

  const bundle = kit.createMemoryWorkflow({
    format: { maxPatchOperations: 0 },
  })
  const status = await bundle.workflow.status('.')
  assert.match(status.markdown, /No local or remote changes/)
})

const noteAdapter = createJsonProjectionAdapter({
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
      ...(input.entity.entityId !== undefined ? { entityId: input.entity.entityId } : {}),
      ...(input.target !== undefined ? { target: input.target } : {}),
    }]
  },
})

function noteUpdateTarget(content, backendHash) {
  return createWritableProjectionUpdateTarget({
    adapter: noteAdapter,
    entity: content,
    entityId: content.id,
    path: `data/notes/note_${content.id}.json`,
    backendHash,
  })
}
