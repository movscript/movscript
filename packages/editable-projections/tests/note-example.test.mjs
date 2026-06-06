import assert from 'node:assert/strict'
import test from 'node:test'
import {
  noteProjectionAdapter,
  noteProjectionDeleteTarget,
  noteProjectionPath,
  noteProjectionSchema,
  noteProjectionUpdateTarget,
  runNoteProjectionExample,
  runNoteProjectionIntegrationContractExample,
  runNoteProjectionToolAdapterExample,
} from '../dist/index.js'

test('note projection example exposes generic helpers', () => {
  assert.equal(noteProjectionPath(7), 'data/notes/note_7.json')
  assert.equal(noteProjectionAdapter.schema, noteProjectionSchema)
  assert.deepEqual(noteProjectionUpdateTarget({
    id: 7,
    title: 'Draft',
    body: 'Body',
  }, {
    backendHash: 'note-v1',
  }), {
    path: 'data/notes/note_7.json',
    schema: noteProjectionSchema,
    kind: 'writable_projection',
    writable: true,
    entityType: 'note',
    entityId: 7,
    backendHash: 'note-v1',
    content: {
      schema: noteProjectionSchema,
      id: 7,
      title: 'Draft',
      body: 'Body',
    },
  })
  assert.deepEqual(noteProjectionDeleteTarget(7, { backendHash: 'note-deleted' }), {
    path: 'data/notes/note_7.json',
    schema: noteProjectionSchema,
    kind: 'writable_projection',
    writable: true,
    entityType: 'note',
    entityId: 7,
    backendHash: 'note-deleted',
    operation: 'delete',
  })
})

test('runNoteProjectionExample demonstrates update, review, apply, and clean refresh', async () => {
  const result = await runNoteProjectionExample()

  assert.equal(result.filePath, 'data/notes/note_1.json')
  assert.equal(result.update.result.summary.updated, 1)
  assert.equal(result.review.review.summary.update, 1)
  assert.equal(result.review.gate.ready, true)
  assert.equal(result.commands[0].type, 'note.update')
  assert.equal(result.commands[0].target.title, 'Ready note')
  assert.equal(result.apply.result.appliedCommands, 1)
  assert.equal(result.apply.result.refresh.summary.updated, 1)
  assert.equal(result.status.status.files[0].state, 'clean')
})

test('runNoteProjectionToolAdapterExample demonstrates host tool dispatch integration', async () => {
  const result = await runNoteProjectionToolAdapterExample()

  assert.equal(result.filePath, 'data/notes/note_1.json')
  assert.equal(result.toolNames.includes('editable_projection_update'), true)
  assert.equal(result.operationName, 'applyReview')
  assert.equal(result.update.ok, true)
  assert.equal(result.update.result.result.summary.updated, 1)
  assert.equal(result.review.ok, true)
  assert.equal(result.review.result.review.summary.update, 1)
  assert.equal(result.apply.ok, true)
  assert.equal(result.apply.result.result.appliedCommands, 1)
  assert.equal(result.status.ok, true)
  assert.equal(result.status.result.status.files[0].state, 'clean')
  assert.equal(result.commands[0].type, 'note.update')
})

test('runNoteProjectionIntegrationContractExample demonstrates consumer contract gating', async () => {
  const result = await runNoteProjectionIntegrationContractExample()

  assert.equal(result.filePath, 'data/notes/note_1.json')
  assert.equal(result.gate.ok, true)
  assert.equal(result.gate.report.ok, true)
  assert.equal(result.gate.report.adapter.ok, true)
  assert.equal(result.gate.report.workflow.ok, true)
  assert.equal(result.gate.report.workflow.status.files[0].state, 'clean')
  assert.equal(result.gate.markdown.includes('Status: ok.'), true)
  assert.equal(JSON.parse(result.gate.json).ok, true)
  assert.equal(result.commands[0].type, 'note.update')
  assert.equal(result.commands[0].target.title, 'Ready note')
})
