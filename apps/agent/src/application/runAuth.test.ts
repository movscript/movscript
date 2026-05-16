import assert from 'node:assert/strict'
import test from 'node:test'
import {
  mergeRunBackendAuth,
  mergeNormalizedRunBackendAuth,
  normalizeBackendAPIBaseURL,
  normalizeBackendAuthToken,
  normalizeRunBackendAuth,
  runBackendAuthMetadata,
  RuntimeRunAuthRegistry,
} from './runAuth.js'

test('normalizeBackendAuthToken trims non-empty tokens', () => {
  assert.deepEqual(normalizeBackendAuthToken(' token '), { backendAuthToken: 'token' })
  assert.deepEqual(normalizeBackendAuthToken(' '), {})
  assert.deepEqual(normalizeBackendAuthToken(123), {})
})

test('normalizeBackendAPIBaseURL trims trailing slashes', () => {
  assert.deepEqual(normalizeBackendAPIBaseURL(' https://api.example.com/// '), {
    backendAPIBaseURL: 'https://api.example.com',
  })
  assert.deepEqual(normalizeBackendAPIBaseURL(''), {})
})

test('normalizeRunBackendAuth accepts record input and bare token fallback', () => {
  assert.deepEqual(normalizeRunBackendAuth({
    backendAuthToken: ' token ',
    backendAPIBaseURL: 'http://backend///',
  }), {
    backendAuthToken: 'token',
    backendAPIBaseURL: 'http://backend',
  })
  assert.deepEqual(normalizeRunBackendAuth(' token '), { backendAuthToken: 'token' })
})

test('mergeRunBackendAuth preserves existing values unless next value is present', () => {
  assert.deepEqual(mergeRunBackendAuth(
    { backendAuthToken: 'old-token', backendAPIBaseURL: 'http://old' },
    { backendAuthToken: 'new-token' },
  ), {
    backendAuthToken: 'new-token',
    backendAPIBaseURL: 'http://old',
  })
})

test('mergeNormalizedRunBackendAuth normalizes raw input and omits empty auth', () => {
  assert.deepEqual(mergeNormalizedRunBackendAuth(undefined, {}), undefined)
  assert.deepEqual(mergeNormalizedRunBackendAuth(
    { backendAuthToken: 'old-token', backendAPIBaseURL: 'http://old' },
    { backendAPIBaseURL: 'http://new///' },
  ), {
    backendAuthToken: 'old-token',
    backendAPIBaseURL: 'http://new',
  })
})

test('runBackendAuthMetadata returns a serializable metadata dictionary', () => {
  assert.deepEqual(runBackendAuthMetadata({
    backendAuthToken: 'token',
    backendAPIBaseURL: 'http://backend',
  }), {
    backendAuthToken: 'token',
    backendAPIBaseURL: 'http://backend',
  })
  assert.deepEqual(runBackendAuthMetadata({}), {})
})

test('RuntimeRunAuthRegistry merges normalized auth per run and returns empty auth for unknown runs', () => {
  const registry = new RuntimeRunAuthRegistry()

  registry.remember('run_1', { backendAuthToken: ' token ' })
  registry.remember('run_1', { backendAPIBaseURL: 'http://backend///' })

  assert.deepEqual(registry.get('run_1'), {
    backendAuthToken: 'token',
    backendAPIBaseURL: 'http://backend',
  })
  assert.deepEqual(registry.get('run_2'), {})
})
