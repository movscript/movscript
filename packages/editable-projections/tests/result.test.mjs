import assert from 'node:assert/strict'
import test from 'node:test'
import {
  InvalidEditableProjectionResultArtifactError,
  parseApplyResultJson,
  parseWorkspaceUpdateResultJson,
  serializeApplyResultJson,
  serializeWorkspaceUpdateResultJson,
  validateApplyResult,
  validateWorkspaceUpdateResult,
} from '../dist/index.js'

test('workspace update result JSON helpers round-trip a stable execution artifact', () => {
  const result = validateWorkspaceUpdateResult({
    backendRevision: 'rev-1',
    summary: {
      updated: 1,
      deleted: 0,
      noop: 0,
      blocked: 0,
      conflicts: 1,
    },
    operations: [{
      state: 'updated',
      path: 'data/notes/note_1.json',
      kind: 'writable_projection',
      schema: 'example.note.v1',
      entityType: 'note',
      entityId: 1,
      mode: 'overwrite',
      localHash: 'local-v1',
      baseHash: 'base-v1',
      backendHash: 'backend-v2',
      issues: [],
    }, {
      state: 'conflict',
      path: 'data/notes/note_2.json',
      kind: 'writable_projection',
      schema: 'example.note.v1',
      entityType: 'note',
      entityId: 2,
      mode: 'merge',
      issues: [],
      conflicts: [{
        path: '/title',
        base: 'Base',
        local: 'Local',
        remote: 'Remote',
        message: 'Both local and remote changed /title',
      }],
    }],
  })

  const serialized = serializeWorkspaceUpdateResultJson(result)

  assert.equal(serialized.endsWith('\n'), true)
  assert.deepEqual(parseWorkspaceUpdateResultJson(serialized), result)
})

test('apply result JSON helpers round-trip refresh results', () => {
  const result = validateApplyResult({
    appliedOperations: 1,
    appliedCommands: 2,
    refresh: {
      summary: {
        updated: 0,
        deleted: 1,
        noop: 0,
        blocked: 0,
        conflicts: 0,
      },
      operations: [{
        state: 'deleted',
        path: 'data/notes/note_1.json',
        kind: 'writable_projection',
        schema: 'example.note.v1',
        entityType: 'note',
        entityId: 1,
        mode: 'overwrite',
        issues: [],
      }],
    },
  })

  assert.deepEqual(parseApplyResultJson(serializeApplyResultJson(result)), result)
})

test('result artifact parsers throw stable framework errors for invalid JSON', () => {
  assert.throws(
    () => parseWorkspaceUpdateResultJson('{'),
    (error) => {
      assert.equal(error instanceof InvalidEditableProjectionResultArtifactError, true)
      assert.equal(error.code, 'invalid_result_artifact')
      assert.equal(error.issues[0].path, '/')
      assert.match(error.issues[0].message, /Invalid JSON/)
      return true
    },
  )

  assert.throws(
    () => parseApplyResultJson('{'),
    InvalidEditableProjectionResultArtifactError,
  )
})

test('workspace update result validator reports structured artifact issues', () => {
  assert.throws(
    () => validateWorkspaceUpdateResult({
      backendRevision: 1,
      summary: {
        updated: 99,
        deleted: 0,
        noop: 0,
        blocked: 0,
        conflicts: 0,
      },
      operations: [{
        state: 'unknown',
        path: '../note.json',
        kind: 'unknown',
        schema: '',
        entityType: '',
        entityId: true,
        mode: 'fast',
        localHash: 1,
        issues: [{ severity: 'info', message: '' }],
        conflicts: [{ path: 'title', message: '', base: () => undefined }],
      }],
    }),
    (error) => {
      assert.equal(error instanceof InvalidEditableProjectionResultArtifactError, true)
      assert.equal(error.code, 'invalid_result_artifact')
      assert.deepEqual(error.issues, [
        { path: '/backendRevision', message: 'backendRevision must be a string when present.' },
        { path: '/operations/0/state', message: 'state must be updated, deleted, noop, blocked, or conflict.' },
        { path: '/operations/0/path', message: 'path must not contain parent-directory segments.' },
        { path: '/operations/0/kind', message: 'kind must be writable_projection, generated_index, or materialized_view.' },
        { path: '/operations/0/schema', message: 'schema must be a non-empty string.' },
        { path: '/operations/0/entityType', message: 'entityType must be a non-empty string.' },
        { path: '/operations/0/entityId', message: 'entityId must be a string or number when present.' },
        { path: '/operations/0/mode', message: 'mode must be safe, overwrite, or merge.' },
        { path: '/operations/0/localHash', message: 'localHash must be a string when present.' },
        { path: '/operations/0/issues/0/message', message: 'message must be a non-empty string.' },
        { path: '/operations/0/issues/0/severity', message: 'severity must be error or warning.' },
        { path: '/operations/0/conflicts/0/path', message: 'path must be a JSON Pointer.' },
        { path: '/operations/0/conflicts/0/message', message: 'message must be a non-empty string.' },
        { path: '/operations/0/conflicts/0/base', message: 'value must be JSON-compatible.' },
        { path: '/summary/updated', message: 'updated must equal the operation count 0.' },
      ])
      return true
    },
  )
})

test('apply result validator prefixes refresh artifact issues', () => {
  assert.throws(
    () => validateApplyResult({
      appliedOperations: -1,
      appliedCommands: 0.5,
      refresh: {
        summary: {},
        operations: {},
      },
    }),
    (error) => {
      assert.equal(error instanceof InvalidEditableProjectionResultArtifactError, true)
      assert.deepEqual(error.issues.slice(0, 5), [
        { path: '/appliedOperations', message: 'appliedOperations must be a non-negative integer.' },
        { path: '/appliedCommands', message: 'appliedCommands must be a non-negative integer.' },
        { path: '/refresh/summary/updated', message: 'updated must be a non-negative integer.' },
        { path: '/refresh/summary/deleted', message: 'deleted must be a non-negative integer.' },
        { path: '/refresh/summary/noop', message: 'noop must be a non-negative integer.' },
      ])
      return true
    },
  )
})
