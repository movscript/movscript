import assert from 'node:assert/strict'
import test from 'node:test'
import {
  InvalidEditableProjectionKitOptionsError,
  createJsonProjectionAdapter,
  createWritableProjectionUpdateTarget,
} from '../dist/index.js'
import {
  MemoryBackendStore,
  createEditableProjectionMemoryTestHarness,
  runEditableProjectionMemoryIntegrationContractGate,
} from '../dist/testing.js'

const schema = 'testing.harness.note.v1'

test('createEditableProjectionMemoryTestHarness wires backend, kit, workflow, and artifact stores', async () => {
  const executed = []
  const harness = createEditableProjectionMemoryTestHarness({
    adapters: [noteAdapter],
    backendEntities: [backendNote('note-v1', 'Original')],
    executor: {
      async execute(commands) {
        executed.push(...commands)
        harness.backendStore.setEntity(backendNote('note-v2', commands[0].target.title))
        return {
          updateTargets: [noteUpdateTarget(commands[0].target, 'note-v2')],
        }
      },
    },
  })

  assert.equal(harness.registry.get(schema), noteAdapter)
  assert.equal((await harness.backendStore.getEntity({ entityType: 'note', entityId: 1 })).hash, 'note-v1')

  await harness.workflow.update([
    noteUpdateTarget({ schema, id: 1, title: 'Original' }, 'note-v1'),
  ])
  await harness.fs.writeFile('data/notes/note_1.json', json({ schema, id: 1, title: 'Edited' }))
  const review = await harness.workflow.reviewAndSave('data/notes', 'note-1')
  const applied = await harness.workflow.loadAndApply('note-1')

  assert.equal(review.gate.ready, true)
  assert.equal(review.review.summary.update, 1)
  assert.equal(executed[0].type, 'note.update')
  assert.equal(applied.result.appliedCommands, 1)
  assert.equal(applied.result.refresh.summary.updated, 1)
  assert.match(await harness.fs.readFile('data/notes/note_1.json'), /"Edited"/)
})

test('createEditableProjectionMemoryTestHarness can seed a caller-provided memory backend', async () => {
  const backendStore = new MemoryBackendStore([backendNote('note-v1', 'Existing')])
  const harness = createEditableProjectionMemoryTestHarness({
    adapters: [noteAdapter],
    backendStore,
    backendEntities: [backendNote('note-v2', 'Seeded')],
  })

  assert.equal(harness.backendStore, backendStore)
  assert.equal((await backendStore.getEntity({ entityType: 'note', entityId: 1 })).hash, 'note-v2')
  assert.equal((await backendStore.getEntity({ entityType: 'note', entityId: 1 })).value.title, 'Seeded')
})

test('createEditableProjectionMemoryTestHarness keeps kit option validation', () => {
  assert.throws(
    () => createEditableProjectionMemoryTestHarness({
      adapters: [{}],
    }),
    (error) => {
      assert.equal(error instanceof InvalidEditableProjectionKitOptionsError, true)
      assert.equal(error.code, 'invalid_kit_options')
      assert.match(error.issues[0], /adapters\[0\]/)
      return true
    },
  )
})

test('runEditableProjectionMemoryIntegrationContractGate creates a harness and runs the integration gate', async () => {
  const backendStore = new MemoryBackendStore([backendNote('note-v1', 'Original')])
  const gate = await runEditableProjectionMemoryIntegrationContractGate({
    adapter: noteAdapter,
    entity: { id: 1, title: 'Original' },
    entityId: 1,
    filePath: 'data/notes/note_1.json',
    validFile: json({ schema, id: 1, title: 'Original' }),
    invalidFile: json({ schema, id: 1, title: '' }),
    updateTarget: noteUpdateTarget({ schema, id: 1, title: 'Original' }, 'note-v1'),
    backendStore,
    executor: {
      async execute(commands) {
        const updated = {
          id: commands[0].target.id,
          title: commands[0].target.title,
        }
        backendStore.setEntity({
          entityType: 'note',
          entityId: updated.id,
          hash: 'note-v2',
          value: updated,
        })
        return {
          updateTargets: [noteUpdateTarget({ schema, ...updated }, 'note-v2')],
        }
      },
    },
    editFile(current) {
      return current.replace('"Original"', '"Edited"')
    },
  })

  assert.equal(gate.ok, true)
  assert.equal(gate.report.ok, true)
  assert.equal(gate.report.workflow.status.files[0].state, 'clean')
  assert.match(gate.markdown, /Status: ok\./)
  assert.equal(JSON.parse(gate.json).ok, true)
  assert.equal(
    (await gate.harness.backendStore.getEntity({ entityType: 'note', entityId: 1 })).value.title,
    'Edited',
  )
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

function noteUpdateTarget(entity, backendHash) {
  return createWritableProjectionUpdateTarget({
    adapter: noteAdapter,
    entity,
    entityId: entity.id,
    path: `data/notes/note_${entity.id}.json`,
    backendHash,
  })
}

function backendNote(hash, title) {
  return {
    entityType: 'note',
    entityId: 1,
    hash,
    value: { id: 1, title },
  }
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}
