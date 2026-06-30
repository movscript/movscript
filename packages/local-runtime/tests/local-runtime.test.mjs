import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  ensureLocalRuntimeDaemon,
  configuredDataServiceURLForLocalRuntimeDataPlane,
  localRuntimeMatchesRequestedDataServiceURL,
  localRuntimeMatchesRequestedDataPlane,
  localRuntimeServicesReady,
  parseLocalRuntimeDaemonIdleTimeout,
  probeLocalRuntimeDaemon,
  resolveLocalRuntimeDaemonDataPlane,
  stopLocalRuntimeDaemon,
} from '../dist/index.js'

test('local runtime daemon readiness does not require a local Data Service', () => {
  assert.equal(localRuntimeServicesReady({
    services: [
      'movscript.local-node.control',
      'movscript.local-node.gateway',
      'movscript.project.service',
      'movscript.editing.service',
      'movscript.canvas.service',
      'movscript.local-surface.host',
      'movscript.media.pipeline',
    ].map((serviceName) => ({ serviceName, ready: true })),
  }), true)
  assert.equal(localRuntimeServicesReady({
    dataPlane: 'cloud',
    services: [
      'movscript.local-node.control',
      'movscript.local-node.gateway',
      'movscript.project.service',
      'movscript.editing.service',
      'movscript.canvas.service',
      'movscript.local-surface.host',
      'movscript.media.pipeline',
    ].map((serviceName) => ({ serviceName, ready: true })),
  }), true)
  assert.equal(localRuntimeServicesReady({
    dataPlane: 'local',
    services: [
      'movscript.local-node.control',
      'movscript.local-node.gateway',
      'movscript.project.service',
      'movscript.editing.service',
      'movscript.canvas.service',
      'movscript.local-surface.host',
      'movscript.media.pipeline',
    ].map((serviceName) => ({ serviceName, ready: true })),
  }), false)
  assert.equal(localRuntimeServicesReady({
    dataPlane: 'local',
    services: [
      'movscript.local-node.control',
      'movscript.local-node.gateway',
      'movscript.data.service',
      'movscript.project.service',
      'movscript.editing.service',
      'movscript.canvas.service',
      'movscript.local-surface.host',
      'movscript.media.pipeline',
    ].map((serviceName) => ({ serviceName, ready: true })),
  }), true)
})

test('local runtime request matching includes requested data-plane', () => {
  assert.equal(localRuntimeMatchesRequestedDataPlane(
    { dataPlane: 'local' },
    { MOVSCRIPT_LOCAL_DAEMON_DATA_PLANE: 'local' },
  ), true)
  assert.equal(localRuntimeMatchesRequestedDataPlane(
    { dataPlane: 'local' },
    { MOVSCRIPT_LOCAL_DAEMON_DATA_PLANE: 'cloud' },
  ), false)
  assert.equal(localRuntimeMatchesRequestedDataPlane(
    { dataPlane: 'cloud' },
    {},
  ), true)
})

test('local runtime daemon runner helpers parse runtime ownership settings', () => {
  assert.equal(parseLocalRuntimeDaemonIdleTimeout(undefined), null)
  assert.equal(parseLocalRuntimeDaemonIdleTimeout('never'), null)
  assert.equal(parseLocalRuntimeDaemonIdleTimeout('2s'), 2000)
  assert.equal(parseLocalRuntimeDaemonIdleTimeout('1m'), 60_000)
  assert.throws(() => parseLocalRuntimeDaemonIdleTimeout('soon'), /invalid local daemon idle timeout/)

  assert.equal(resolveLocalRuntimeDaemonDataPlane({ MOVSCRIPT_LOCAL_DAEMON_DATA_PLANE: 'cloud' }), 'cloud')
  assert.equal(resolveLocalRuntimeDaemonDataPlane({ MOVSCRIPT_PLUGIN_MODE: 'cloud' }), 'cloud')
  assert.equal(resolveLocalRuntimeDaemonDataPlane({ MOVSCRIPT_DATA_SERVICE_URL: 'https://data.example.test' }), 'external')
  assert.equal(resolveLocalRuntimeDaemonDataPlane({ MOVSCRIPT_DATA_SERVICE_URL: 'http://127.0.0.1:8766' }), 'local')

  assert.equal(configuredDataServiceURLForLocalRuntimeDataPlane('local', { MOVSCRIPT_DATA_SERVICE_URL: 'https://data.example.test' }), undefined)
  assert.equal(configuredDataServiceURLForLocalRuntimeDataPlane('external', { MOVSCRIPT_DATA_SERVICE_URL: 'https://data.example.test' }), 'https://data.example.test')
})

test('local runtime request matching includes requested Data Service URL', () => {
  assert.equal(localRuntimeMatchesRequestedDataServiceURL(
    { dataServiceURL: 'https://api.example.com' },
    { MOVSCRIPT_DATA_SERVICE_URL: 'https://api.example.com/' },
  ), true)
  assert.equal(localRuntimeMatchesRequestedDataServiceURL(
    { dataServiceURL: 'https://api-a.example.com' },
    { MOVSCRIPT_DATA_SERVICE_URL: 'https://api-b.example.com' },
  ), false)
  assert.equal(localRuntimeMatchesRequestedDataServiceURL(
    {},
    {},
  ), true)
})

test('local runtime daemon probe reports app record startup errors before control endpoint exists', async () => {
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-local-runtime-home-'))
  try {
    writeAppRecord(homeDir, {
      status: 'error',
      ready: false,
      pid: 12345,
      metadata: {
        pluginVersion: 'test-version',
        pluginRoot: 'test-root',
        dataPlane: 'local',
        error: 'listen EADDRINUSE: address already in use 127.0.0.1:8766',
      },
    })

    const probe = await probeLocalRuntimeDaemon(homeDir)

    assert.equal(probe.available, false)
    assert.equal(probe.status, 'error')
    assert.equal(probe.pid, 12345)
    assert.equal(probe.pluginVersion, 'test-version')
    assert.equal(probe.pluginRoot, 'test-root')
    assert.equal(probe.dataPlane, 'local')
    assert.equal(probe.error, 'listen EADDRINUSE: address already in use 127.0.0.1:8766')
  } finally {
    rmSync(homeDir, { recursive: true, force: true })
  }
})

test('ensureLocalRuntimeDaemon serializes concurrent cold starts behind one daemon', async () => {
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-local-runtime-home-'))
  const entrypoint = join(homeDir, 'fake-local-daemon.mjs')
  writeFileSync(entrypoint, fakeDaemonSource(), 'utf8')

  try {
    const [first, second] = await Promise.all([
      ensureLocalRuntimeDaemon({
        homeDir,
        entrypoint,
        runArgs: [],
        identity: { pluginVersion: 'test-version', pluginRoot: 'test-root' },
        startupTimeoutMs: 5000,
        env: {
          MOVSCRIPT_FAKE_DAEMON_PLUGIN_VERSION: 'test-version',
          MOVSCRIPT_FAKE_DAEMON_PLUGIN_ROOT: 'test-root',
        },
      }),
      ensureLocalRuntimeDaemon({
        homeDir,
        entrypoint,
        runArgs: [],
        identity: { pluginVersion: 'test-version', pluginRoot: 'test-root' },
        startupTimeoutMs: 5000,
        env: {
          MOVSCRIPT_FAKE_DAEMON_PLUGIN_VERSION: 'test-version',
          MOVSCRIPT_FAKE_DAEMON_PLUGIN_ROOT: 'test-root',
        },
      }),
    ])

    const launcherPids = [first.launcherPid, second.launcherPid].filter((pid) => typeof pid === 'number')
    assert.equal(launcherPids.length, 1)
    assert.equal(first.endpoint, second.endpoint)
    assert.equal(new Set([first.pid, second.pid]).size, 1)
  } finally {
    await stopLocalRuntimeDaemon(homeDir, { force: true }).catch(() => undefined)
    rmSync(homeDir, { recursive: true, force: true })
  }
})

test('ensureLocalRuntimeDaemon reuses matching cloud Data Service URL and restarts when URL changes', async () => {
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-local-runtime-home-'))
  const entrypoint = join(homeDir, 'fake-local-daemon.mjs')
  writeFileSync(entrypoint, fakeDaemonSource(), 'utf8')

  try {
    const first = await ensureLocalRuntimeDaemon({
      homeDir,
      entrypoint,
      runArgs: [],
      identity: { pluginVersion: 'test-version', pluginRoot: 'test-root' },
      startupTimeoutMs: 5000,
      env: {
        MOVSCRIPT_FAKE_DAEMON_PLUGIN_VERSION: 'test-version',
        MOVSCRIPT_FAKE_DAEMON_PLUGIN_ROOT: 'test-root',
        MOVSCRIPT_LOCAL_DAEMON_DATA_PLANE: 'cloud',
        MOVSCRIPT_DATA_SERVICE_URL: 'https://api-a.example.com',
      },
    })

    const reused = await ensureLocalRuntimeDaemon({
      homeDir,
      entrypoint,
      runArgs: [],
      identity: { pluginVersion: 'test-version', pluginRoot: 'test-root' },
      startupTimeoutMs: 5000,
      env: {
        MOVSCRIPT_FAKE_DAEMON_PLUGIN_VERSION: 'test-version',
        MOVSCRIPT_FAKE_DAEMON_PLUGIN_ROOT: 'test-root',
        MOVSCRIPT_LOCAL_DAEMON_DATA_PLANE: 'cloud',
        MOVSCRIPT_DATA_SERVICE_URL: 'https://api-a.example.com/',
      },
    })

    assert.equal(reused.reused, true)
    assert.equal(reused.pid, first.pid)
    assert.equal(reused.dataServiceURL, 'https://api-a.example.com')

    const changed = await ensureLocalRuntimeDaemon({
      homeDir,
      entrypoint,
      runArgs: [],
      identity: { pluginVersion: 'test-version', pluginRoot: 'test-root' },
      startupTimeoutMs: 5000,
      env: {
        MOVSCRIPT_FAKE_DAEMON_PLUGIN_VERSION: 'test-version',
        MOVSCRIPT_FAKE_DAEMON_PLUGIN_ROOT: 'test-root',
        MOVSCRIPT_LOCAL_DAEMON_DATA_PLANE: 'cloud',
        MOVSCRIPT_DATA_SERVICE_URL: 'https://api-b.example.com',
      },
    })

    assert.equal(changed.reused, false)
    assert.notEqual(changed.pid, first.pid)
    assert.equal(changed.dataPlane, 'cloud')
    assert.equal(changed.dataServiceURL, 'https://api-b.example.com')
    assert.equal(hasReadyService(changed, 'movscript.data.service'), false)
  } finally {
    await stopLocalRuntimeDaemon(homeDir, { force: true }).catch(() => undefined)
    rmSync(homeDir, { recursive: true, force: true })
  }
})

test('ensureLocalRuntimeDaemon force restart replaces a healthy matching daemon', async () => {
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-local-runtime-home-'))
  const entrypoint = join(homeDir, 'fake-local-daemon.mjs')
  writeFileSync(entrypoint, fakeDaemonSource(), 'utf8')

  try {
    const first = await ensureLocalRuntimeDaemon({
      homeDir,
      entrypoint,
      runArgs: [],
      identity: { pluginVersion: 'test-version', pluginRoot: 'test-root' },
      startupTimeoutMs: 5000,
      env: {
        MOVSCRIPT_FAKE_DAEMON_PLUGIN_VERSION: 'test-version',
        MOVSCRIPT_FAKE_DAEMON_PLUGIN_ROOT: 'test-root',
        MOVSCRIPT_LOCAL_DAEMON_DATA_PLANE: 'local',
      },
    })

    const refreshed = await ensureLocalRuntimeDaemon({
      homeDir,
      entrypoint,
      runArgs: [],
      identity: { pluginVersion: 'test-version', pluginRoot: 'test-root' },
      forceRestart: true,
      startupTimeoutMs: 5000,
      stopTimeoutMs: 2000,
      env: {
        MOVSCRIPT_FAKE_DAEMON_PLUGIN_VERSION: 'test-version',
        MOVSCRIPT_FAKE_DAEMON_PLUGIN_ROOT: 'test-root',
        MOVSCRIPT_LOCAL_DAEMON_DATA_PLANE: 'local',
      },
    })

    assert.equal(first.reused, false)
    assert.equal(refreshed.reused, false)
    assert.notEqual(refreshed.pid, first.pid)
    assert.equal(refreshed.dataPlane, 'local')
  } finally {
    await stopLocalRuntimeDaemon(homeDir, { force: true }).catch(() => undefined)
    rmSync(homeDir, { recursive: true, force: true })
  }
})

test('ensureLocalRuntimeDaemon stops reachable daemon with incomplete services before starting replacement', async () => {
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-local-runtime-home-'))
  const entrypoint = join(homeDir, 'fake-local-daemon.mjs')
  writeFileSync(entrypoint, fakeDaemonSource(), 'utf8')

  let shutdownCalled = false
  let closed = false
  const server = createServer((request, response) => {
    response.setHeader('content-type', 'application/json')
    if (request.url === '/health') {
      response.end(JSON.stringify({ status: 'ok', pid: process.pid }))
      return
    }
    if (request.url === '/status') {
      response.end(JSON.stringify({
        status: 'starting',
        pid: process.pid,
        pluginVersion: 'test-version',
        pluginRoot: 'test-root',
        dataPlane: 'cloud',
        dataServiceURL: 'https://api.example.com',
        services: [
          {
            serviceName: 'movscript.local-node.control',
            ready: true,
            status: 'ready',
            pid: process.pid,
          },
          {
            serviceName: 'movscript.local-node.gateway',
            ready: true,
            status: 'ready',
            pid: process.pid,
          },
        ],
      }))
      return
    }
    if (request.url === '/shutdown') {
      shutdownCalled = true
      response.statusCode = 202
      response.end(JSON.stringify({ status: 'stopping', pid: process.pid }))
      setImmediate(() => server.close(() => {
        closed = true
      }))
      return
    }
    response.statusCode = 404
    response.end(JSON.stringify({ error: 'not_found' }))
  })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  writeEndpointRecord(homeDir, `http://127.0.0.1:${port}`, port, process.pid)

  try {
    const replacement = await ensureLocalRuntimeDaemon({
      homeDir,
      entrypoint,
      runArgs: [],
      identity: { pluginVersion: 'test-version', pluginRoot: 'test-root' },
      startupTimeoutMs: 5000,
      stopTimeoutMs: 2000,
      env: {
        MOVSCRIPT_FAKE_DAEMON_PLUGIN_VERSION: 'test-version',
        MOVSCRIPT_FAKE_DAEMON_PLUGIN_ROOT: 'test-root',
        MOVSCRIPT_LOCAL_DAEMON_DATA_PLANE: 'cloud',
        MOVSCRIPT_DATA_SERVICE_URL: 'https://api.example.com',
      },
    })

    assert.equal(shutdownCalled, true)
    assert.equal(closed, true)
    assert.equal(replacement.reused, false)
    assert.notEqual(replacement.pid, process.pid)
    assert.equal(replacement.dataPlane, 'cloud')
    assert.equal(replacement.dataServiceURL, 'https://api.example.com')
    assert.equal(hasReadyService(replacement, 'movscript.project.service'), true)
    assert.equal(hasReadyService(replacement, 'movscript.data.service'), false)
  } finally {
    await stopLocalRuntimeDaemon(homeDir, { force: true }).catch(() => undefined)
    if (server.listening) await new Promise((resolve) => server.close(resolve))
    rmSync(homeDir, { recursive: true, force: true })
  }
})

test('ensureLocalRuntimeDaemon restarts daemon when requested data-plane changes', async () => {
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-local-runtime-home-'))
  const entrypoint = join(homeDir, 'fake-local-daemon.mjs')
  writeFileSync(entrypoint, fakeDaemonSource(), 'utf8')

  try {
    const local = await ensureLocalRuntimeDaemon({
      homeDir,
      entrypoint,
      runArgs: [],
      identity: { pluginVersion: 'test-version', pluginRoot: 'test-root' },
      startupTimeoutMs: 5000,
      env: {
        MOVSCRIPT_FAKE_DAEMON_PLUGIN_VERSION: 'test-version',
        MOVSCRIPT_FAKE_DAEMON_PLUGIN_ROOT: 'test-root',
        MOVSCRIPT_LOCAL_DAEMON_DATA_PLANE: 'local',
      },
    })

    assert.equal(local.reused, false)
    assert.equal(local.dataPlane, 'local')
    assert.equal(hasReadyService(local, 'movscript.data.service'), true)

    const cloud = await ensureLocalRuntimeDaemon({
      homeDir,
      entrypoint,
      runArgs: [],
      identity: { pluginVersion: 'test-version', pluginRoot: 'test-root' },
      startupTimeoutMs: 5000,
      env: {
        MOVSCRIPT_FAKE_DAEMON_PLUGIN_VERSION: 'test-version',
        MOVSCRIPT_FAKE_DAEMON_PLUGIN_ROOT: 'test-root',
        MOVSCRIPT_LOCAL_DAEMON_DATA_PLANE: 'cloud',
      },
    })

    assert.equal(cloud.reused, false)
    assert.equal(cloud.dataPlane, 'cloud')
    assert.notEqual(cloud.pid, local.pid)
    assert.equal(hasReadyService(cloud, 'movscript.data.service'), false)
  } finally {
    await stopLocalRuntimeDaemon(homeDir, { force: true }).catch(() => undefined)
    rmSync(homeDir, { recursive: true, force: true })
  }
})

function hasReadyService(status, serviceName) {
  return Array.isArray(status.services)
    && status.services.some((service) => service?.serviceName === serviceName && service.ready === true)
}

function writeEndpointRecord(homeDir, url, port, pid) {
  mkdirSync(join(homeDir, 'runtime', 'endpoints'), { recursive: true })
  writeFileSync(join(homeDir, 'runtime', 'endpoints', 'movscript.local-node.control.json'), JSON.stringify({
    serviceName: 'movscript.local-node.control',
    status: 'ready',
    ready: true,
    protocol: 'http',
    url,
    port,
    pid,
  }), 'utf8')
}

function writeAppRecord(homeDir, record) {
  mkdirSync(join(homeDir, 'runtime', 'apps'), { recursive: true })
  writeFileSync(join(homeDir, 'runtime', 'apps', 'movscript.local-node.json'), JSON.stringify({
    applicationId: 'movscript.local-node',
    owner: 'agent-provider',
    profile: 'plugin-full-local',
    ...record,
  }), 'utf8')
}

function fakeDaemonSource() {
  return `
import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'

const homeDir = process.env.MOVSCRIPT_HOME
const pluginVersion = process.env.MOVSCRIPT_FAKE_DAEMON_PLUGIN_VERSION
const pluginRoot = process.env.MOVSCRIPT_FAKE_DAEMON_PLUGIN_ROOT
const dataPlane = process.env.MOVSCRIPT_LOCAL_DAEMON_DATA_PLANE || 'local'
const dataServiceURL = process.env.MOVSCRIPT_DATA_SERVICE_URL
const services = [
  'movscript.local-node.control',
  'movscript.local-node.gateway',
  ...(dataPlane === 'local' ? ['movscript.data.service'] : []),
  'movscript.project.service',
  'movscript.editing.service',
  'movscript.canvas.service',
  'movscript.local-surface.host',
  'movscript.media.pipeline',
].map((serviceName) => ({
  serviceName,
  ready: true,
  status: 'ready',
  pid: process.pid,
  endpoint: 'http://127.0.0.1:0',
}))

const server = createServer((request, response) => {
  response.setHeader('content-type', 'application/json')
  if (request.url === '/health') {
    response.end(JSON.stringify({ status: 'ok', pid: process.pid }))
    return
  }
  if (request.url === '/status') {
    response.end(JSON.stringify({
      status: 'ready',
      pid: process.pid,
      pluginVersion,
      pluginRoot,
      dataPlane,
      ...(dataServiceURL ? { dataServiceURL } : {}),
      services,
    }))
    return
  }
  if (request.url === '/touch') {
    response.end(JSON.stringify({ status: 'touched' }))
    return
  }
  if (request.url === '/shutdown') {
    response.statusCode = 202
    response.end(JSON.stringify({ status: 'stopping', pid: process.pid }))
    setImmediate(() => server.close(() => process.exit(0)))
    return
  }
  response.statusCode = 404
  response.end(JSON.stringify({ error: 'not_found' }))
})

server.listen(0, '127.0.0.1', () => {
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  const url = 'http://127.0.0.1:' + port
  mkdirSync(join(homeDir, 'runtime', 'endpoints'), { recursive: true })
  writeFileSync(join(homeDir, 'runtime', 'endpoints', 'movscript.local-node.control.json'), JSON.stringify({
    serviceName: 'movscript.local-node.control',
    status: 'ready',
    ready: true,
    protocol: 'http',
    url,
    port,
    pid: process.pid,
  }), 'utf8')
})
`
}
