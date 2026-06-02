import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const serverSource = readFileSync(new URL('./server.ts', import.meta.url), 'utf8')

test('server.ts stays a composition root and delegates runtime protocol projection', () => {
  assert.ok(
    serverSource.split('\n').length <= 1350,
    'server.ts should stay under 1350 lines; route/protocol details belong in focused server modules',
  )

  for (const forbidden of [
    'function runtimeEventFromRunStream',
    'function runtimeEventFromThreadStream',
    'function runtimeEventFromSessionStream',
    'function runtimeEventFromPlanStream',
    'function threadRuntimeSnapshotV2',
    'function sessionRuntimeSnapshotV2',
    'function writeSSE',
    "url.pathname === '/model-config'",
    "url.pathname === '/model-config/test'",
    'model_config_save_start',
  ]) {
    assert.equal(
      serverSource.includes(forbidden),
      false,
      `server.ts should delegate runtime protocol detail instead of defining ${forbidden}`,
    )
  }

  assert.equal(serverSource.includes("from '../protocol/runtimeProtocol.js'"), true)
  assert.equal(serverSource.includes("from '../streams/runtimeStreams.js'"), true)
  assert.equal(serverSource.includes("from '../routes/modelConfigRoutes.js'"), true)
})
