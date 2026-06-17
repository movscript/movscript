import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createBackendOutputCapture,
  formatBackendStartupFailure,
} from './backend/diagnostics'

test('backend output capture keeps the most recent output', () => {
  const capture = createBackendOutputCapture(13)

  capture.append('startup ok\n')
  capture.append('listen failed')

  assert.equal(capture.tail(), 'listen failed')
})

test('backend startup failure includes process diagnostics and recent output', () => {
  const message = formatBackendStartupFailure({
    error: new Error('Local backend process exited before it became ready'),
    exitInfo: { code: 1, signal: null },
    diagnostics: {
      binary: '/repo/apps/backend/bin/movscript-server',
      cwd: '/repo/apps/backend',
      dataDir: '/tmp/movscript-data',
      recentOutput: () => 'server error: listen tcp :8766: bind: address already in use',
    },
  })

  assert.match(message, /Local backend process exited before it became ready/)
  assert.match(message, /Exit: code=1 signal=null/)
  assert.match(message, /Binary: \/repo\/apps\/backend\/bin\/movscript-server/)
  assert.match(message, /CWD: \/repo\/apps\/backend/)
  assert.match(message, /Data dir: \/tmp\/movscript-data/)
  assert.match(message, /server error: listen tcp :8766/)
})
