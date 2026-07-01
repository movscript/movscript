import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  activeAppRecords,
  activeEndpointRecords,
  cleanupStaleRuntimeRecords,
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

test('resolveMovScriptHomeDir uses LocalAppData MovScript Home on Windows', () => {
  assert.equal(
    resolveMovScriptHomeDir({
      env: { LOCALAPPDATA: 'C:\\Users\\example\\AppData\\Local' },
      platform: 'win32',
      userHomeDir: 'C:\\Users\\example',
    }),
    'C:\\Users\\example\\AppData\\Local\\MovScript\\Home',
  )
  assert.equal(
    resolveMovScriptHomeDir({
      env: {},
      platform: 'win32',
      userHomeDir: 'C:\\Users\\example',
    }),
    'C:\\Users\\example\\AppData\\Local\\MovScript\\Home',
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

test('cleanupStaleRuntimeRecords removes inactive and dead-pid runtime records only', () => {
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-runtime-contracts-cleanup-'))
  const liveAppPath = writeRuntimeAppRecord(homeDir, {
    applicationId: 'movscript.live',
    pid: process.pid,
  })
  const deadAppPath = writeRuntimeAppRecord(homeDir, {
    applicationId: 'movscript.dead',
    pid: 999999999,
  })
  const stoppedEndpointPath = writeRuntimeEndpointRecord(homeDir, {
    serviceName: 'movscript.stopped.gateway',
    baseURL: 'http://127.0.0.1:8766',
    status: 'stopped',
    ready: false,
  })
  const pidlessCloudEndpointPath = writeRuntimeEndpointRecord(homeDir, {
    serviceName: 'movscript.cloud-runtime.gateway',
    baseURL: 'https://api.example.com',
  })
  const deadServicePath = writeRuntimeServiceRecord(homeDir, {
    serviceName: 'movscript.dead.service',
    instanceId: 'local-1',
    pid: 999999999,
  })

  const cleanup = cleanupStaleRuntimeRecords(homeDir)

  assert.deepEqual(
    cleanup.removed.map((item) => [item.kind, item.reason]).sort(),
    [
      ['app', 'dead_pid'],
      ['endpoint', 'inactive'],
      ['service', 'dead_pid'],
    ],
  )
  assert.equal(existsSync(liveAppPath), true)
  assert.equal(existsSync(pidlessCloudEndpointPath), true)
  assert.equal(existsSync(deadAppPath), false)
  assert.equal(existsSync(stoppedEndpointPath), false)
  assert.equal(existsSync(deadServicePath), false)

  const snapshot = readRuntimeHomeSnapshot(homeDir)
  assert.equal(snapshot.apps.some((record) => record.applicationId === 'movscript.live'), true)
  assert.equal(snapshot.endpoints.some((record) => record.serviceName === 'movscript.cloud-runtime.gateway'), true)
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
