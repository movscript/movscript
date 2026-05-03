import assert from 'node:assert/strict'
import test from 'node:test'
import { buildPatchRequest } from './backendApplyClient.js'
import type { ApplyDraftReview } from './draftApply.js'

test('buildPatchRequest maps supported entity and field to backend PATCH payload', () => {
  const request = buildPatchRequest(review({
    projectId: 42,
    entityType: 'content_unit',
    entityId: 7,
    field: 'description',
    proposedValue: 'New content-unit description',
  }))

  assert.equal(request.path, '/projects/42/entities/content-units/7')
  assert.deepEqual(request.payload, { description: 'New content-unit description' })
})

test('buildPatchRequest rejects unsupported fields', () => {
  assert.throws(() => buildPatchRequest(review({
    projectId: 42,
    entityType: 'content_unit',
    entityId: 7,
    field: 'project_id',
    proposedValue: 1,
  })), /cannot write field project_id/)
})

test('buildPatchRequest rejects unsupported entity types', () => {
  assert.throws(() => buildPatchRequest(review({
    entityType: 'legacy_entity',
    entityId: 7,
    field: 'description',
    proposedValue: 'Updated',
  })), /does not support target entity type/)
})

function review(input: {
  projectId?: number | string
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
      ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
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
