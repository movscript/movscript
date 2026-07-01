import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createBackendOutputCapture,
  formatBackendStartupFailure,
  readTextFileTail,
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
      binary: '/repo/services/data-service/bin/movscript-server',
      cwd: '/repo/services/data-service',
      dataDir: '/tmp/movscript-data',
      logPath: '/tmp/movscript-home/logs/local-backend.log',
      recentOutput: () => 'server error: listen tcp :8766: bind: address already in use',
    },
  })

  assert.match(message, /Local backend process exited before it became ready/)
  assert.match(message, /Exit: code=1 signal=null/)
  assert.match(message, /Binary: \/repo\/services\/data-service\/bin\/movscript-server/)
  assert.match(message, /CWD: \/repo\/services\/data-service/)
  assert.match(message, /Data dir: \/tmp\/movscript-data/)
  assert.match(message, /Log file: \/tmp\/movscript-home\/logs\/local-backend\.log/)
  assert.match(message, /server error: listen tcp :8766/)
})

test('text file tail reads only the end of a backend log', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-backend-log-'))
  const path = join(dir, 'local-backend.log')
  writeFileSync(path, 'first line\nsecond line\nlast line')

  assert.equal(readTextFileTail(path, 9), 'last line')
})
