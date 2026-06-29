import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { readRuntimeHomeSnapshot } from '@movscript/runtime-contracts'
import { stopLocalRuntimeDaemon } from '@movscript/local-runtime'
import {
  EDITING_SERVICE_NAME,
  MEDIA_PIPELINE_SERVICE_NAME,
} from '@movscript/editing'
import { PROJECT_SERVICE_NAME } from '@movscript/project'
import {
  desktopRuntimeApplicationManifest,
  desktopRuntimeLocalStartupPolicy,
  desktopRuntimeShellProgramManifest,
  desktopRuntimeStartupPolicy,
  resolveDesktopLocalRuntimeIdentity,
  resolveDesktopLocalRuntimeDaemonEntrypoint,
  resolveDesktopRuntimeRepoRoot,
  shutdownDesktopApplicationRuntime,
  startDesktopApplicationRuntime,
} from './desktopApplicationRuntime'

const DATA_SERVICE_NAME = 'movscript.data.service'
const CANVAS_SERVICE_NAME = 'movscript.canvas.service'
const LOCAL_NODE_APP_ID = 'movscript.local-node'
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

test('Desktop application runtime writes only Desktop shell ownership records by default', async () => {
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-desktop-runtime-home-'))
  try {
    await startDesktopApplicationRuntime({ homeDir })

    let snapshot = readRuntimeHomeSnapshot(homeDir)
    const appRecord = snapshot.apps.find((record) => record.applicationId === 'movscript.desktop')
    const shellRecord = snapshot.services.find((record) => record.serviceName === 'movscript.desktop.shell')

    assert.equal(appRecord?.status, 'ready')
    assert.equal(appRecord?.profile, 'desktop-bootstrap')
    assert.equal(shellRecord?.status, 'ready')
    assert.equal(shellRecord?.profile, 'desktop')
    assert.equal(shellRecord?.endpoint?.url, 'desktop://movscript')
    assert.equal(snapshot.services.find((record) => record.serviceName === PROJECT_SERVICE_NAME), undefined)
    assert.equal(snapshot.services.find((record) => record.serviceName === EDITING_SERVICE_NAME), undefined)
    assert.equal(snapshot.services.find((record) => record.serviceName === MEDIA_PIPELINE_SERVICE_NAME), undefined)

    await shutdownDesktopApplicationRuntime()
    snapshot = readRuntimeHomeSnapshot(homeDir)

    assert.equal(snapshot.apps.find((record) => record.applicationId === 'movscript.desktop')?.status, 'stopped')
    assert.equal(snapshot.services.find((record) => record.serviceName === 'movscript.desktop.shell')?.status, 'stopped')
  } finally {
    await shutdownDesktopApplicationRuntime()
    rmSync(homeDir, { recursive: true, force: true })
  }
})

test('Desktop local runtime attaches to daemon-owned local services', async () => {
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-desktop-local-runtime-home-'))
  const pluginRoot = join(homeDir, 'plugin')
  const entrypoint = join(pluginRoot, 'bin', 'fake-local-daemon.mjs')
  mkdirSync(dirname(entrypoint), { recursive: true })
  writeFileSync(join(pluginRoot, 'manifest.runtime.json'), JSON.stringify({ version: 'fake-test-version' }), 'utf8')
  writeFileSync(entrypoint, fakeDaemonSource({
    includeDataService: true,
    pluginVersion: 'fake-test-version',
    pluginRoot,
  }), 'utf8')
  try {
    await startDesktopApplicationRuntime({
      homeDir,
      scenario: desktopRuntimeLocalStartupPolicy,
      localRuntime: {
        enabled: true,
        dataPlane: 'local',
        entrypoint,
      },
    })

    let snapshot = readRuntimeHomeSnapshot(homeDir)
    const appRecord = snapshot.apps.find((record) => record.applicationId === 'movscript.desktop')
    const daemonAppRecord = snapshot.apps.find((record) => record.applicationId === LOCAL_NODE_APP_ID)

    assert.equal(appRecord?.status, 'ready')
    assert.equal(appRecord?.profile, 'desktop-local')
    assert.equal(daemonAppRecord?.status, 'ready')
    assert.equal(daemonAppRecord?.profile, 'local-daemon-test')
    for (const serviceName of [DATA_SERVICE_NAME, PROJECT_SERVICE_NAME, EDITING_SERVICE_NAME, CANVAS_SERVICE_NAME, MEDIA_PIPELINE_SERVICE_NAME]) {
      const record = snapshot.services.find((item) => item.serviceName === serviceName)
      assert.equal(record?.status, 'ready')
      assert.equal(record?.ready, true)
      assert.equal(record?.ownerApplicationId, LOCAL_NODE_APP_ID)
      assert.equal(record?.endpoint?.protocol, 'http')
    }

    await shutdownDesktopApplicationRuntime()
    snapshot = readRuntimeHomeSnapshot(homeDir)
    assert.equal(snapshot.services.find((record) => record.serviceName === PROJECT_SERVICE_NAME)?.status, 'ready')
  } finally {
    await shutdownDesktopApplicationRuntime()
    await stopLocalRuntimeDaemon(homeDir, { force: true }).catch(() => undefined)
    rmSync(homeDir, { recursive: true, force: true })
  }
})

test('Desktop cloud data runtime attaches to daemon without local Data Service', async () => {
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-desktop-cloud-data-runtime-home-'))
  const pluginRoot = join(homeDir, 'plugin')
  const entrypoint = join(pluginRoot, 'bin', 'fake-local-daemon.mjs')
  mkdirSync(dirname(entrypoint), { recursive: true })
  writeFileSync(join(pluginRoot, 'manifest.runtime.json'), JSON.stringify({ version: 'fake-test-version' }), 'utf8')
  writeFileSync(entrypoint, fakeDaemonSource({
    includeDataService: false,
    pluginVersion: 'fake-test-version',
    pluginRoot,
  }), 'utf8')
  try {
    await startDesktopApplicationRuntime({
      homeDir,
      scenario: desktopRuntimeLocalStartupPolicy,
      localRuntime: {
        enabled: true,
        dataPlane: 'cloud',
        dataServiceURL: 'https://api.example.com',
        entrypoint,
      },
    })

    const snapshot = readRuntimeHomeSnapshot(homeDir)
    assert.equal(snapshot.services.find((record) => record.serviceName === DATA_SERVICE_NAME), undefined)
    for (const serviceName of [PROJECT_SERVICE_NAME, EDITING_SERVICE_NAME, CANVAS_SERVICE_NAME, MEDIA_PIPELINE_SERVICE_NAME]) {
      const record = snapshot.services.find((item) => item.serviceName === serviceName)
      assert.equal(record?.status, 'ready')
      assert.equal(record?.ownerApplicationId, LOCAL_NODE_APP_ID)
    }
  } finally {
    await shutdownDesktopApplicationRuntime()
    await stopLocalRuntimeDaemon(homeDir, { force: true }).catch(() => undefined)
    rmSync(homeDir, { recursive: true, force: true })
  }
})

test('Desktop local runtime restarts daemon when installed plugin identity changes', async () => {
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-desktop-local-runtime-identity-home-'))
  const pluginRoot = join(homeDir, 'installed-plugin')
  const entrypoint = join(pluginRoot, 'bin', 'movscript.mjs')
  mkdirSync(dirname(entrypoint), { recursive: true })
  writeFileSync(join(pluginRoot, 'manifest.runtime.json'), JSON.stringify({ version: 'desktop-installed-version' }), 'utf8')
  writeFileSync(entrypoint, fakeDaemonSource({
    includeDataService: true,
    pluginVersion: 'desktop-installed-version',
    pluginVersionEnv: 'MOVSCRIPT_FAKE_DAEMON_PLUGIN_VERSION',
    pluginRoot,
    pluginRootEnv: 'MOVSCRIPT_FAKE_DAEMON_PLUGIN_ROOT',
  }), 'utf8')

  try {
    const old = await startFakeDesktopDaemon(homeDir, entrypoint, {
      MOVSCRIPT_FAKE_DAEMON_PLUGIN_VERSION: 'old-version',
      MOVSCRIPT_FAKE_DAEMON_PLUGIN_ROOT: '/tmp/old-plugin-root',
      MOVSCRIPT_LOCAL_DAEMON_DATA_PLANE: 'local',
    })
    const replacement = await startDesktopApplicationRuntime({
      homeDir,
      scenario: desktopRuntimeLocalStartupPolicy,
      localRuntime: {
        enabled: true,
        dataPlane: 'local',
        entrypoint,
      },
    })

    assert.equal(replacement, undefined)
    const snapshot = readRuntimeHomeSnapshot(homeDir)
    const daemonAppRecord = snapshot.apps.find((record) => record.applicationId === LOCAL_NODE_APP_ID && record.status === 'ready')
    assert.notEqual(daemonAppRecord?.pid, old.pid)
    const metadata = daemonAppRecord?.raw.metadata as Record<string, unknown> | undefined
    assert.equal(metadata?.pluginVersion, 'desktop-installed-version')
    assert.equal(metadata?.pluginRoot, pluginRoot)
  } finally {
    await shutdownDesktopApplicationRuntime()
    await stopLocalRuntimeDaemon(homeDir, { force: true }).catch(() => undefined)
    rmSync(homeDir, { recursive: true, force: true })
  }
})

test('Desktop local runtime force refreshes daemon on startup when requested', async () => {
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-desktop-local-runtime-refresh-home-'))
  const pluginRoot = join(homeDir, 'installed-plugin')
  const entrypoint = join(pluginRoot, 'bin', 'movscript.mjs')
  mkdirSync(dirname(entrypoint), { recursive: true })
  writeFileSync(join(pluginRoot, 'manifest.runtime.json'), JSON.stringify({ version: 'desktop-installed-version' }), 'utf8')
  writeFileSync(entrypoint, fakeDaemonSource({
    includeDataService: true,
    pluginVersion: 'desktop-installed-version',
    pluginVersionEnv: 'MOVSCRIPT_FAKE_DAEMON_PLUGIN_VERSION',
    pluginRoot,
    pluginRootEnv: 'MOVSCRIPT_FAKE_DAEMON_PLUGIN_ROOT',
  }), 'utf8')

  try {
    const old = await startFakeDesktopDaemon(homeDir, entrypoint, {
      MOVSCRIPT_FAKE_DAEMON_PLUGIN_VERSION: 'desktop-installed-version',
      MOVSCRIPT_FAKE_DAEMON_PLUGIN_ROOT: pluginRoot,
      MOVSCRIPT_LOCAL_DAEMON_DATA_PLANE: 'local',
    })
    await startDesktopApplicationRuntime({
      homeDir,
      scenario: desktopRuntimeLocalStartupPolicy,
      localRuntime: {
        enabled: true,
        dataPlane: 'local',
        entrypoint,
        forceRestart: true,
      },
    })

    const snapshot = readRuntimeHomeSnapshot(homeDir)
    const daemonAppRecord = snapshot.apps.find((record) => record.applicationId === LOCAL_NODE_APP_ID && record.status === 'ready')
    assert.notEqual(daemonAppRecord?.pid, old.pid)
    const metadata = daemonAppRecord?.raw.metadata as Record<string, unknown> | undefined
    assert.equal(metadata?.pluginVersion, 'desktop-installed-version')
    assert.equal(metadata?.pluginRoot, pluginRoot)
  } finally {
    await shutdownDesktopApplicationRuntime()
    await stopLocalRuntimeDaemon(homeDir, { force: true }).catch(() => undefined)
    rmSync(homeDir, { recursive: true, force: true })
  }
})

test('Desktop runtime trace identities match daemon-attached Desktop application manifests', () => {
  const desktopAppManifest = readFileSync(resolve(REPO_ROOT, 'apps/desktop/application.manifest.ts'), 'utf8')
  const desktopShellManifest = readFileSync(resolve(REPO_ROOT, 'apps/desktop/programs/desktop-shell.program.manifest.ts'), 'utf8')
  const desktopStartupManifest = readFileSync(resolve(REPO_ROOT, 'apps/desktop/startup.manifest.ts'), 'utf8')

  assert.equal(desktopRuntimeApplicationManifest.applicationId, 'movscript.desktop')
  assert.equal(desktopRuntimeApplicationManifest.owner, 'electron')
  assert.equal(desktopRuntimeShellProgramManifest.serviceName, 'movscript.desktop.shell')
  assert.equal(desktopRuntimeShellProgramManifest.kind, 'desktop-shell')
  assert.equal(desktopRuntimeStartupPolicy.scenarioId, 'desktop-bootstrap')
  assert.equal(desktopRuntimeLocalStartupPolicy.scenarioId, 'desktop-local')
  assert.equal(desktopRuntimeStartupPolicy.applicationId, 'movscript.desktop')

  assert.match(desktopAppManifest, /applicationId: 'movscript\.desktop'/)
  assert.match(desktopAppManifest, /owner: 'electron'/)
  assert.match(desktopShellManifest, /serviceName: 'movscript\.desktop\.shell'/)
  assert.match(desktopShellManifest, /kind: 'desktop-shell'/)
  assert.match(desktopStartupManifest, /scenarioId: 'desktop-bootstrap'/)
  assert.match(desktopStartupManifest, /scenarioId: 'desktop-local'/)
  assert.doesNotMatch(desktopStartupManifest, /serviceName: 'movscript\.project\.service'/)
  assert.doesNotMatch(desktopStartupManifest, /serviceName: 'movscript\.editing\.service'/)
  assert.doesNotMatch(desktopStartupManifest, /serviceName: 'movscript\.media\.pipeline'/)
})

test('Desktop runtime resolves repo root from bundled main output directory', () => {
  assert.equal(
    resolveDesktopRuntimeRepoRoot({
      dirname: resolve(REPO_ROOT, 'apps/desktop/out/main'),
      cwd: resolve(REPO_ROOT, 'apps/desktop'),
      env: {},
    }),
    REPO_ROOT,
  )
})

test('Desktop runtime resolves local daemon entrypoint from explicit environment', () => {
  assert.equal(
    resolveDesktopLocalRuntimeDaemonEntrypoint({
      env: { MOVSCRIPT_LOCAL_DAEMON_ENTRYPOINT: '/tmp/movscript.mjs' },
      repoRoot: REPO_ROOT,
    }),
    '/tmp/movscript.mjs',
  )
})

test('Desktop runtime resolves local daemon entrypoint from packaged provider plugin resources', () => {
  const resourcesPath = mkdtempSync(join(tmpdir(), 'movscript-desktop-provider-plugin-resources-'))
  try {
    const entrypoint = join(resourcesPath, 'provider-plugins/movscript/bin/movscript.mjs')
    mkdirSync(dirname(entrypoint), { recursive: true })
    writeFileSync(entrypoint, '#!/usr/bin/env node\n', 'utf8')

    assert.equal(
      resolveDesktopLocalRuntimeDaemonEntrypoint({
        env: {},
        repoRoot: join(resourcesPath, 'missing-repo'),
        resourcesPath,
      }),
      entrypoint,
    )
  } finally {
    rmSync(resourcesPath, { recursive: true, force: true })
  }
})

test('Desktop runtime identity resolves installed plugin version and root from entrypoint', () => {
  const pluginRoot = mkdtempSync(join(tmpdir(), 'movscript-desktop-plugin-identity-'))
  try {
    const entrypoint = join(pluginRoot, 'bin/movscript.mjs')
    mkdirSync(dirname(entrypoint), { recursive: true })
    writeFileSync(join(pluginRoot, 'manifest.runtime.json'), JSON.stringify({ version: '1.2.3' }), 'utf8')

    assert.deepEqual(resolveDesktopLocalRuntimeIdentity(entrypoint), {
      pluginVersion: '1.2.3',
      pluginRoot,
    })
  } finally {
    rmSync(pluginRoot, { recursive: true, force: true })
  }
})

async function startFakeDesktopDaemon(
  homeDir: string,
  entrypoint: string,
  env: NodeJS.ProcessEnv,
): Promise<{ pid: number }> {
  const { ensureLocalRuntimeDaemon } = await import('@movscript/local-runtime')
  const result = await ensureLocalRuntimeDaemon({
    homeDir,
    entrypoint,
    runArgs: [],
    env,
    identity: {
      pluginVersion: env.MOVSCRIPT_FAKE_DAEMON_PLUGIN_VERSION,
      pluginRoot: env.MOVSCRIPT_FAKE_DAEMON_PLUGIN_ROOT,
    },
    startupTimeoutMs: 5000,
  })
  assert.equal(typeof result.pid, 'number')
  return { pid: result.pid as number }
}

function fakeDaemonSource(input: {
  includeDataService: boolean
  pluginVersion?: string
  pluginVersionEnv?: string
  pluginRoot?: string
  pluginRootEnv?: string
}): string {
  const services = [
    'movscript.local-node.control',
    'movscript.local-node.gateway',
    ...(input.includeDataService ? [DATA_SERVICE_NAME] : []),
    PROJECT_SERVICE_NAME,
    EDITING_SERVICE_NAME,
    CANVAS_SERVICE_NAME,
    MEDIA_PIPELINE_SERVICE_NAME,
    'movscript.local-surface.host',
  ]
  return `
import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'

const homeDir = process.env.MOVSCRIPT_HOME
const dataPlane = process.env.MOVSCRIPT_LOCAL_DAEMON_DATA_PLANE || 'local'
const dataServiceURL = process.env.MOVSCRIPT_DATA_SERVICE_URL
const pluginVersion = ${input.pluginVersionEnv ? `(process.env.${input.pluginVersionEnv} ?? ${JSON.stringify(input.pluginVersion)})` : JSON.stringify(input.pluginVersion)}
const pluginRoot = ${input.pluginRootEnv ? `(process.env.${input.pluginRootEnv} ?? ${JSON.stringify(input.pluginRoot)})` : JSON.stringify(input.pluginRoot)}
const serviceNames = ${JSON.stringify(services)}

function writeRecord(path, value) {
  mkdirSync(join(homeDir, 'runtime', path.split('/').slice(0, -1).join('/')), { recursive: true })
  writeFileSync(join(homeDir, 'runtime', path), JSON.stringify(value), 'utf8')
}

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
      ...(pluginVersion ? { pluginVersion } : {}),
      ...(pluginRoot ? { pluginRoot } : {}),
      dataPlane,
      ...(dataServiceURL ? { dataServiceURL } : {}),
      services: serviceNames.map((serviceName) => ({
        serviceName,
        status: 'ready',
        ready: true,
        pid: process.pid,
        endpoint: 'http://127.0.0.1:1',
      })),
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
  const controlURL = 'http://127.0.0.1:' + port
  writeRecord('apps/movscript.local-node.json', {
    applicationId: 'movscript.local-node',
    owner: 'agent-provider',
    profile: 'local-daemon-test',
    pid: process.pid,
    status: 'ready',
    ready: true,
    metadata: {
      dataPlane,
      ...(dataServiceURL ? { dataServiceURL } : {}),
      ...(pluginVersion ? { pluginVersion } : {}),
      ...(pluginRoot ? { pluginRoot } : {}),
    },
  })
  for (const serviceName of serviceNames) {
    const url = serviceName === 'movscript.local-node.control' ? controlURL : 'http://127.0.0.1:1'
    const instanceId = serviceName + '-' + process.pid
    const record = {
      serviceName,
      instanceId,
      ownerApplicationId: 'movscript.local-node',
      profile: 'local',
      pid: process.pid,
      status: 'ready',
      ready: true,
      endpoint: {
        serviceName,
        instanceId,
        applicationId: 'movscript.local-node',
        protocol: 'http',
        url,
        port: serviceName === 'movscript.local-node.control' ? port : 1,
        pid: process.pid,
        status: 'ready',
        ready: true,
      },
    }
    writeRecord('services/' + serviceName + '/' + instanceId + '.json', record)
    writeRecord('endpoints/' + serviceName + '.json', record.endpoint)
  }
})
`
}
