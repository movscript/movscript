import assert from 'node:assert/strict'
import test from 'node:test'
import { buildPatchRequest } from './backendApplyClient.js'
import type { ApplyDraftReview } from './draftApply.js'

test('buildPatchRequest maps supported entity and field to backend PATCH payload', () => {
  const request = buildPatchRequest(review({
    entityType: 'shot',
    entityId: 7,
    field: 'description',
    proposedValue: 'New shot description',
  }))

  assert.equal(request.path, '/shots/7')
  assert.deepEqual(request.payload, { description: 'New shot description' })
})

test('buildPatchRequest rejects unsupported fields', () => {
  assert.throws(() => buildPatchRequest(review({
    entityType: 'shot',
    entityId: 7,
    field: 'project_id',
    proposedValue: 1,
  })), /cannot write field project_id/)
})

test('buildPatchRequest rejects unsupported entity types', () => {
  assert.throws(() => buildPatchRequest(review({
    entityType: 'asset',
    entityId: 7,
    field: 'description',
    proposedValue: 'Updated',
  })), /does not support target entity type/)
})

function review(input: {
  entityType: string
  entityId: number | string
  field: string
  proposedValue: string | number | boolean | null
}): ApplyDraftReview {
  return {
    draftId: 'draft_test',
    draftTitle: 'Draft',
    draftKind: 'note',
    target: {
      entityType: input.entityType,
      entityId: input.entityId,
      field: input.field,
    },
    currentValue: null,
    proposedValue: input.proposedValue,
    risk: 'write',
    sideEffect: 'test',
    requiresBackendApply: true,
  }
}
