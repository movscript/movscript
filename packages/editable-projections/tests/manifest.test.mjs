import assert from 'node:assert/strict'
import test from 'node:test'
import {
  InvalidWorkspaceManifestError,
  parseWorkspaceManifestJson,
  validateWorkspaceManifest,
} from '../dist/index.js'

test('validateWorkspaceManifest accepts valid manifest files', () => {
  const manifest = validateWorkspaceManifest({
    version: 1,
    backendRevision: 'backend-v1',
    files: {
      'data/assets/asset_1.json': {
        schema: 'example.asset.v1',
        kind: 'writable_projection',
        writable: true,
        entityType: 'asset',
        entityId: 1,
        baseHash: 'base',
        baseBackendHash: 'backend-v1',
      },
    },
  })

  assert.equal(manifest.files['data/assets/asset_1.json'].entityType, 'asset')
})

test('validateWorkspaceManifest rejects invalid shape with stable issues', () => {
  assert.throws(
    () => validateWorkspaceManifest({
      version: 2,
      backendRevision: 1,
      files: {
        './data//asset.json': {
          schema: '',
          kind: 'editable',
          writable: 'yes',
          entityType: '',
          entityId: true,
          baseHash: 1,
        },
      },
    }, 'meta/manifest.json'),
    (error) => {
      assert.equal(error instanceof InvalidWorkspaceManifestError, true)
      assert.equal(error.code, 'invalid_manifest')
      assert.equal(error.manifestPath, 'meta/manifest.json')
      assert.deepEqual(error.issues.map((issue) => issue.path), [
        '/version',
        '/backendRevision',
        '/files/.~1data~1~1asset.json',
        '/files/.~1data~1~1asset.json/schema',
        '/files/.~1data~1~1asset.json/entityType',
        '/files/.~1data~1~1asset.json/kind',
        '/files/.~1data~1~1asset.json/writable',
        '/files/.~1data~1~1asset.json/entityId',
        '/files/.~1data~1~1asset.json/baseHash',
      ])
      return true
    },
  )
})

test('parseWorkspaceManifestJson reports invalid JSON as manifest error', () => {
  assert.throws(
    () => parseWorkspaceManifestJson('{', 'meta/manifest.json'),
    (error) => {
      assert.equal(error instanceof InvalidWorkspaceManifestError, true)
      assert.equal(error.code, 'invalid_manifest')
      assert.equal(error.issues[0].path, '/')
      assert.match(error.issues[0].message, /Invalid JSON/)
      return true
    },
  )
})

test('validateWorkspaceManifest rejects parent-directory file paths', () => {
  assert.throws(
    () => validateWorkspaceManifest({
      version: 1,
      files: {
        'data/../asset.json': {
          schema: 'example.asset.v1',
          kind: 'writable_projection',
          writable: true,
          entityType: 'asset',
        },
      },
    }),
    (error) => {
      assert.equal(error instanceof InvalidWorkspaceManifestError, true)
      assert.deepEqual(error.issues, [{
        path: '/files/data~1..~1asset.json',
        message: 'Manifest file path must not contain parent-directory segments.',
      }])
      return true
    },
  )
})

test('validateWorkspaceManifest rejects absolute file paths', () => {
  assert.throws(
    () => validateWorkspaceManifest({
      version: 1,
      files: {
        '/data/asset.json': {
          schema: 'example.asset.v1',
          kind: 'writable_projection',
          writable: true,
          entityType: 'asset',
        },
      },
    }),
    (error) => {
      assert.equal(error instanceof InvalidWorkspaceManifestError, true)
      assert.deepEqual(error.issues, [{
        path: '/files/~1data~1asset.json',
        message: 'Manifest file path must be relative.',
      }])
      return true
    },
  )
})
