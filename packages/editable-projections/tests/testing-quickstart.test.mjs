import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createJsonProjectionAdapter,
  createWritableProjectionUpdateTarget,
  MemoryBackendStore,
} from '../dist/index.js'
import {
  runEditableProjectionMemoryIntegrationContractGate,
} from '../dist/testing.js'

const schema = 'quickstart.note.v1'

test('testing harness quickstart runs a consuming application integration contract', async () => {
  const noteEntity = { id: 1, title: 'draft' }
  const noteProjection = { schema, id: 1, title: 'draft' }
  const noteUpdateTarget = createWritableProjectionUpdateTarget({
    adapter: noteAdapter,
    entity: noteEntity,
    entityId: noteEntity.id,
    path: `data/notes/note_${noteEntity.id}.json`,
    backendHash: 'note-v1',
  })

  const backendStore = new MemoryBackendStore([{
    entityType: 'note',
    entityId: noteEntity.id,
    hash: 'note-v1',
    value: noteEntity,
  }])

  const gate = await runEditableProjectionMemoryIntegrationContractGate({
    adapter: noteAdapter,
    entity: noteEntity,
    entityId: noteEntity.id,
    filePath: 'data/notes/note_1.json',
    validFile: json(noteProjection),
    invalidFile: json({ schema, id: 1, title: '' }),
    updateTarget: noteUpdateTarget,
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
          updateTargets: [
            createWritableProjectionUpdateTarget({
              adapter: noteAdapter,
              entity: updated,
              entityId: updated.id,
              path: commands[0].filePath,
              backendHash: 'note-v2',
            }),
          ],
        }
      },
    },
    editFile(current) {
      return current.replace('"draft"', '"ready"')
    },
  })

  assert.equal(gate.ok, true)
  assert.equal(gate.report.workflow.status.files[0].state, 'clean')
  assert.equal((await gate.harness.backendStore.getEntity({ entityType: 'note', entityId: 1 })).value.title, 'ready')
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
      filePath: input.filePath,
      ...(input.entity.entityId !== undefined ? { entityId: input.entity.entityId } : {}),
      ...(input.target !== undefined ? { target: input.target } : {}),
    }]
  },
})

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}
