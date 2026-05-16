import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildRuntimeCreateDraftInput,
  buildRuntimeDraftBackendAuth,
  buildRuntimePatchDraftInput,
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

test('buildRuntimePatchDraftInput keeps patch payloads and normalizes draft id', () => {
  assert.deepEqual(buildRuntimePatchDraftInput({
    draftId: ' draft_1 ',
    ops: [{ op: 'replace', path: '/title', value: 'Updated' }],
    expectedUpdatedAt: '2026-05-16T00:00:00.000Z',
    metadata: { source: 'test' },
  }), {
    draftId: 'draft_1',
    patch: {
      ops: [{ op: 'replace', path: '/title', value: 'Updated' }],
      expectedUpdatedAt: '2026-05-16T00:00:00.000Z',
      metadata: { source: 'test' },
    },
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
})

test('requireRuntimeDraftId rejects missing ids with action-specific messages', () => {
  assert.equal(requireRuntimeDraftId(' draft_1 ', 'validate draft'), 'draft_1')
  assert.throws(() => requireRuntimeDraftId('', 'validate draft'), /validate draft requires draftId/)
})
