import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isLocalLaunchMode,
  normalizeAPIBaseURL,
  trimTrailingSlash,
} from './config'

test('app settings config keeps URL and launch mode normalization behind core helpers', () => {
  assert.equal(trimTrailingSlash('http://localhost:8765///'), 'http://localhost:8765')
  assert.equal(normalizeAPIBaseURL(' http://localhost:8765/api/v1/ '), 'http://localhost:8765')
  assert.equal(isLocalLaunchMode({ launchMode: 'local' }), true)
  assert.equal(isLocalLaunchMode({ launchMode: 'cloud' }), false)
})
