import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getAPIBaseURL,
  getAPIV1BaseURL,
  getRuntimeConfigSnapshot,
  isLocalLaunchMode,
  normalizeAPIBaseURL,
  setRuntimeConfigSnapshot,
  trimTrailingSlash,
} from './config'

test('app settings config keeps URL and launch mode normalization behind core helpers', () => {
  assert.equal(trimTrailingSlash('http://localhost:8765///'), 'http://localhost:8765')
  assert.equal(normalizeAPIBaseURL(' http://localhost:8765/api/v1/ '), 'http://localhost:8765')
  assert.equal(isLocalLaunchMode({ launchMode: 'local' }), true)
  assert.equal(isLocalLaunchMode({ launchMode: 'cloud' }), false)
})

test('runtime config snapshot is the preferred API base URL source', () => {
  setRuntimeConfigSnapshot({
    movScriptHomeDir: '/tmp/movscript-home',
    apiBaseURL: 'http://localhost:8766/',
    apiV1BaseURL: 'http://localhost:8766/api/v1',
    localAPIBaseURL: 'http://localhost:8766',
    workspaceDir: '/tmp/movscript-home',
    backendStatus: { state: 'ready', baseURL: 'http://localhost:8766/' },
  })

  assert.equal(getRuntimeConfigSnapshot()?.apiBaseURL, 'http://localhost:8766')
  assert.equal(getRuntimeConfigSnapshot()?.movScriptHomeDir, '/tmp/movscript-home')
  assert.equal(getAPIBaseURL(), 'http://localhost:8766')
  assert.equal(getAPIV1BaseURL(), 'http://localhost:8766/api/v1')

  setRuntimeConfigSnapshot(null)
})
