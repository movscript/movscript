import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  activeAppRecords,
  activeEndpointRecords,
  readRuntimeHomeSnapshot,
  resolveMovScriptHomeDir,
  writeRuntimeAppRecord,
  writeRuntimeEndpointRecord,
  writeRuntimeServiceRecord,
} from '../dist/index.js'

test('resolveMovScriptHomeDir prefers MOVSCRIPT_HOME and otherwise uses user home .movscript', () => {
  assert.equal(
    resolveMovScriptHomeDir({ env: { MOVSCRIPT_HOME: '/tmp/movscript-home' }, userHomeDir: '/Users/example' }),
    '/tmp/movscript-home',
  )
  assert.equal(
    resolveMovScriptHomeDir({ env: {}, userHomeDir: '/Users/example' }),
    '/Users/example/.movscript',
  )
})

test('readRuntimeHomeSnapshot reads active app and endpoint records', () => {
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-runtime-contracts-'))
  mkdirSync(join(homeDir, 'runtime', 'apps'), { recursive: true })
  mkdirSync(join(homeDir, 'runtime', 'endpoints'), { recursive: true })
  writeFileSync(join(homeDir, 'runtime', 'apps', 'movscript.desktop.json'), JSON.stringify({
    applicationId: 'movscript.desktop',
    status: 'ready',
    endpoint: {
      url: 'http://127.0.0.1:18765/mcp',
    },
  }), 'utf8')
  writeFileSync(join(homeDir, 'runtime', 'endpoints', 'movscript.data.service.json'), JSON.stringify({
    serviceName: 'movscript.data.service',
    status: 'ready',
    baseURL: 'http://127.0.0.1:8765',
  }), 'utf8')

  const snapshot = readRuntimeHomeSnapshot(homeDir)

  assert.equal(activeAppRecords(snapshot).at(0)?.applicationId, 'movscript.desktop')
  assert.equal(activeEndpointRecords(snapshot).at(0)?.serviceName, 'movscript.data.service')
})

test('active records ignore dead pids', () => {
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-runtime-contracts-'))
  mkdirSync(join(homeDir, 'runtime', 'apps'), { recursive: true })
  writeFileSync(join(homeDir, 'runtime', 'apps', 'stale.json'), JSON.stringify({
    applicationId: 'stale',
    status: 'ready',
    pid: 999999999,
  }), 'utf8')

  const snapshot = readRuntimeHomeSnapshot(homeDir)

  assert.equal(snapshot.apps.length, 1)
  assert.equal(activeAppRecords(snapshot).length, 0)
})

test('runtime record writers persist app service and endpoint records under MovScript Home', () => {
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-runtime-contracts-'))
  const appPath = writeRuntimeAppRecord(homeDir, {
    applicationId: 'movscript.agent-plugin',
    owner: 'agent-provider',
    profile: 'plugin-full-local',
    endpoint: { url: 'stdio://movscript' },
  })
  const servicePath = writeRuntimeServiceRecord(homeDir, {
    serviceName: 'movscript.data.service',
    instanceId: 'local-1',
    ownerApplicationId: 'movscript.agent-plugin',
    profile: 'local',
    endpoint: { baseURL: 'http://127.0.0.1:8765' },
  })
  const endpointPath = writeRuntimeEndpointRecord(homeDir, {
    serviceName: 'movscript.project.service',
    baseURL: 'http://127.0.0.1:8766',
  })

  const snapshot = readRuntimeHomeSnapshot(homeDir)

  assert.match(appPath, /runtime\/apps\/movscript\.agent-plugin\.json$/)
  assert.match(servicePath, /runtime\/services\/movscript\.data\.service\/local-1\.json$/)
  assert.match(endpointPath, /runtime\/endpoints\/movscript\.project\.service\.json$/)
  assert.equal(snapshot.apps[0].applicationId, 'movscript.agent-plugin')
  assert.equal(snapshot.apps[0].endpoint.url, 'stdio://movscript')
  assert.equal(snapshot.services[0].serviceName, 'movscript.data.service')
  assert.equal(snapshot.services[0].endpoint.baseURL, 'http://127.0.0.1:8765')
  assert.equal(snapshot.endpoints[0].serviceName, 'movscript.project.service')
})
