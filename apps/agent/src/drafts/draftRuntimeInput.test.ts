import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildRuntimeCreateDraftInput,
  buildRuntimeDraftBackendAuth,
  buildRuntimeUpdateDraftInput,
  requireRuntimeDraftId,
} from './draftRuntimeInput.js'

test('buildRuntimeCreateDraftInput normalizes project id and runtime draft source', () => {
  assert.deepEqual(buildRuntimeCreateDraftInput({
    projectId: 42,
    kind: 'note',
    title: 'Draft',
    content: 'Content',
    source: { runId: 'run_1', ignored: 'value' },
    target: { entityType: 'script' },
    metadata: { userKey: 'value' },
  }), {
    projectId: 42,
    kind: 'note',
    title: 'Draft',
    content: 'Content',
    source: { runId: 'run_1' },
    target: { entityType: 'script' },
    metadata: { userKey: 'value' },
  })
})

test('buildRuntimeCreateDraftInput ignores invalid project ids', () => {
  for (const projectId of [0, 42.5, Number.NaN, Number.POSITIVE_INFINITY, '42']) {
    assert.equal(buildRuntimeCreateDraftInput({
      projectId,
      title: 'Draft',
      content: 'Content',
    }).projectId, undefined)
  }
})

test('buildRuntimeUpdateDraftInput filters update fields to store-safe values', () => {
  assert.deepEqual(buildRuntimeUpdateDraftInput({
    draftId: ' draft_1 ',
    status: 'applied',
    title: 'Updated',
    content: 'Body',
    target: { field: 'content' },
    metadata: { source: 'test' },
  }), {
    draftId: 'draft_1',
    update: {
      status: 'applied',
      title: 'Updated',
      content: 'Body',
      target: { field: 'content' },
      metadata: { source: 'test' },
    },
  })
  assert.deepEqual(buildRuntimeUpdateDraftInput({
    draftId: 'draft_1',
    status: 'unknown',
    target: { invalid: undefined },
  }), {
    draftId: 'draft_1',
    update: {},
  })
})

test('buildRuntimeDraftBackendAuth preserves backend auth strings and conditionally includes user id', () => {
  assert.deepEqual(buildRuntimeDraftBackendAuth({
    appliedByUserId: 7,
    backendAuthToken: ' token ',
    backendAPIBaseURL: ' http://backend ',
  }, { includeAppliedByUserId: true }), {
    userId: 7,
    backendAuthToken: ' token ',
    backendAPIBaseURL: ' http://backend ',
  })
  assert.deepEqual(buildRuntimeDraftBackendAuth({
    appliedByUserId: 7,
    backendAuthToken: ' token ',
    backendAPIBaseURL: ' http://backend ',
  }), {
    backendAuthToken: ' token ',
    backendAPIBaseURL: ' http://backend ',
  })
  assert.deepEqual(buildRuntimeDraftBackendAuth({
    appliedByUserId: { id: 7 },
    backendAuthToken: 123,
    backendAPIBaseURL: false,
  }, { includeAppliedByUserId: true }), {})
  for (const appliedByUserId of [0, 7.5, Number.NaN, Number.POSITIVE_INFINITY, '']) {
    assert.deepEqual(buildRuntimeDraftBackendAuth({
      appliedByUserId,
    }, { includeAppliedByUserId: true }), {})
  }
})

test('requireRuntimeDraftId rejects missing ids with action-specific messages', () => {
  assert.equal(requireRuntimeDraftId(' draft_1 ', 'validate draft'), 'draft_1')
  assert.throws(() => requireRuntimeDraftId('', 'validate draft'), /validate draft requires draftId/)
})
