import assert from 'node:assert/strict'
import test from 'node:test'
import {
  InvalidWorkspaceStatusArtifactError,
  parseWorkspaceStatusJson,
  serializeWorkspaceStatusJson,
  validateWorkspaceStatus,
} from '../dist/index.js'

test('workspace status JSON helpers round-trip a stable diagnostic artifact', () => {
  const status = validateWorkspaceStatus({
    rootPath: '.',
    files: [
      {
        path: 'data/notes/note_2.json',
        state: 'modified',
        kind: 'writable_projection',
        schema: 'example.note.v1',
        entityType: 'note',
        entityId: 2,
        localHash: 'local-v2',
        baseHash: 'base-v1',
        backendHash: 'backend-v2',
        baseBackendHash: 'backend-v1',
      },
      {
        path: 'data/notes/note_1.json',
        state: 'clean',
      },
    ],
  })

  assert.deepEqual(status, {
    rootPath: '.',
    files: [
      {
        path: 'data/notes/note_1.json',
        state: 'clean',
      },
      {
        path: 'data/notes/note_2.json',
        state: 'modified',
        kind: 'writable_projection',
        schema: 'example.note.v1',
        entityType: 'note',
        entityId: 2,
        localHash: 'local-v2',
        baseHash: 'base-v1',
        backendHash: 'backend-v2',
        baseBackendHash: 'backend-v1',
      },
    ],
  })

  const serialized = serializeWorkspaceStatusJson(status)

  assert.equal(serialized.endsWith('\n'), true)
  assert.deepEqual(parseWorkspaceStatusJson(serialized), status)
})

test('workspace status parser throws stable framework errors for invalid JSON', () => {
  assert.throws(
    () => parseWorkspaceStatusJson('{'),
    (error) => {
      assert.equal(error instanceof InvalidWorkspaceStatusArtifactError, true)
      assert.equal(error.code, 'invalid_status_artifact')
      assert.equal(error.issues[0].path, '/')
      assert.match(error.issues[0].message, /Invalid JSON/)
      return true
    },
  )
})

test('workspace status validator reports structured shape and value issues', () => {
  assert.throws(
    () => validateWorkspaceStatus({
      rootPath: '/tmp/workspace',
      files: [
        {
          path: '../note.json',
          state: 'unknown',
          kind: 'unknown',
          schema: 1,
          entityId: true,
          localHash: 2,
        },
        {
          path: 'data/notes/note_1.json',
          state: 'clean',
        },
        {
          path: 'data/notes/note_1.json',
          state: 'modified',
        },
      ],
    }),
    (error) => {
      assert.equal(error instanceof InvalidWorkspaceStatusArtifactError, true)
      assert.equal(error.code, 'invalid_status_artifact')
      assert.deepEqual(error.issues, [
        { path: '/rootPath', message: 'rootPath must be relative.' },
        { path: '/files/0/path', message: 'path must not contain parent-directory segments.' },
        {
          path: '/files/0/state',
          message: 'state must be clean, modified, remote_modified, both_modified, deleted, remote_deleted, added, readonly_modified, untracked, or missing_adapter.',
        },
        { path: '/files/0/kind', message: 'kind must be writable_projection, generated_index, or materialized_view.' },
        { path: '/files/0/schema', message: 'schema must be a string when present.' },
        { path: '/files/0/entityId', message: 'entityId must be a string or number when present.' },
        { path: '/files/0/localHash', message: 'localHash must be a string when present.' },
        { path: '/files/2/path', message: 'path must be unique within a workspace status artifact.' },
      ])
      return true
    },
  )
})

test('workspace status validator rejects non-object and malformed files array', () => {
  assert.throws(
    () => validateWorkspaceStatus(null),
    (error) => {
      assert.equal(error instanceof InvalidWorkspaceStatusArtifactError, true)
      assert.deepEqual(error.issues, [{
        path: '/',
        message: 'Workspace status must be a JSON object.',
      }])
      return true
    },
  )

  assert.throws(
    () => validateWorkspaceStatus({
      rootPath: '.',
      files: {},
    }),
    (error) => {
      assert.equal(error instanceof InvalidWorkspaceStatusArtifactError, true)
      assert.deepEqual(error.issues, [{
        path: '/files',
        message: 'files must be an array.',
      }])
      return true
    },
  )
})
