#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'

import { isDirectRun } from './release-common.mjs'

const repoRoot = resolve(import.meta.dirname, '../..')
const defaultTimeoutMs = 120_000

if (isDirectRun(import.meta.url)) {
  runSmokePluginPackageCli(repoRoot, process.env, process.argv.slice(2))
}

export function runSmokePluginPackageCli(root = repoRoot, env = process.env, args = [], options = {}) {
  const {
    exit = process.exit,
    log = console.log,
    logError = console.error,
    spawn = spawnSync,
  } = options

  if (args.includes('--help') || args.includes('-h')) {
    log(helpText())
    return
  }

  smokePluginPackage(root, {
    artifactPath: argValue(args, '--artifact') ?? env.MOVSCRIPT_PLUGIN_SMOKE_ARTIFACT,
    dataPlane: argValue(args, '--data-plane') ?? env.MOVSCRIPT_PLUGIN_SMOKE_DATA_PLANE ?? 'local',
    env,
    installFirst: !(args.includes('--no-install') || env.MOVSCRIPT_PLUGIN_SMOKE_INSTALL_FIRST === '0'),
    keepTemp: args.includes('--keep-temp') || env.MOVSCRIPT_PLUGIN_SMOKE_KEEP_TEMP === '1',
    log,
    previousArtifactPath: argValue(args, '--previous-artifact') ?? env.MOVSCRIPT_PLUGIN_SMOKE_PREVIOUS_ARTIFACT,
    spawn,
    timeoutMs: Number(argValue(args, '--timeout-ms') ?? env.MOVSCRIPT_PLUGIN_SMOKE_TIMEOUT_MS ?? defaultTimeoutMs),
  }).then((result) => {
    log(`Agent Plugin package smoke passed: ${result.artifactPath}`)
    log(`- install: ${result.installed ? 'temporary Home current bundle' : 'direct zip extraction'}`)
    log(`- gateway: ${result.gatewayBaseURL}`)
    log(`- rollback: ${result.rollbackExercised ? 'current/previous exercised' : 'not requested'}`)
    log(`- tools: ${result.toolCount}`)
  }).catch((error) => {
    logError(error instanceof Error ? error.message : String(error))
    exit(1)
  })
}

export async function smokePluginPackage(root = repoRoot, options = {}) {
  const {
    artifactPath = '',
    dataPlane = 'local',
    env = process.env,
    installFirst = true,
    keepTemp = false,
    log = console.log,
    previousArtifactPath = '',
    spawn = spawnSync,
    timeoutMs = defaultTimeoutMs,
  } = options
  const normalizedDataPlane = normalizeDataPlane(dataPlane)
  const artifact = resolvePluginArtifact(root, artifactPath)
  const artifactVersion = pluginVersionFromArtifact(artifact)
  const previousArtifact = previousArtifactPath ? resolvePluginArtifact(root, previousArtifactPath) : ''
  const previousArtifactVersion = previousArtifact ? pluginVersionFromArtifact(previousArtifact) : ''
  const tempRoot = mkdtempSync(join(tmpdir(), 'movscript-plugin-smoke.'))
  const extractDir = join(tempRoot, 'plugin')
  const homeDir = join(tempRoot, 'home')
  const projectDir = join(tempRoot, 'project')
  const gatewayPort = await reservePort()
  let pluginRoot = ''
  let cliRoot = ''
  let currentInstalledRoot = ''
  let previousInstalledRoot = ''
  let lastGatewayBaseURL = ''
  let lastToolCount = 0
  let rollbackExercised = false

  try {
    mkdirSync(homeDir, { recursive: true })
    mkdirSync(projectDir, { recursive: true })
    mkdirSync(join(projectDir, 'settings'), { recursive: true })
    mkdirSync(join(projectDir, 'content_units'), { recursive: true })
    writeFileSync(join(projectDir, 'project.json'), `${JSON.stringify({ title: 'Plugin Package Smoke' }, null, 2)}\n`, 'utf8')

    if (installFirst) {
      if (previousArtifact) {
        log(`[smoke-plugin] Installing previous ${basename(previousArtifact)} into temporary MovScript Home`)
        runInstaller(root, previousArtifact, homeDir, env, spawn)
        previousInstalledRoot = locateInstalledPluginRoot(homeDir, previousArtifactVersion)
        validateInstalledHomeCliShim(homeDir)
        validatePluginRoot(previousInstalledRoot, normalizedDataPlane)
      }
      log(`[smoke-plugin] Installing ${basename(artifact)} into temporary MovScript Home`)
      runInstaller(root, artifact, homeDir, env, spawn)
      pluginRoot = locateInstalledPluginRoot(homeDir, artifactVersion)
      currentInstalledRoot = realpathSync(pluginRoot)
      if (previousInstalledRoot) validateInstalledPreviousBundle(homeDir, previousInstalledRoot, previousArtifactVersion)
      validateInstalledHomeCliShim(homeDir)
      cliRoot = homeDir
    } else {
      if (previousArtifact) throw new Error('--previous-artifact requires the installer path; remove --no-install to smoke rollback')
      mkdirSync(extractDir, { recursive: true })
      unzipArtifact(artifact, extractDir, spawn)
      pluginRoot = locatePluginRoot(extractDir)
      cliRoot = pluginRoot
    }
    validatePluginRoot(pluginRoot, normalizedDataPlane)
    ensureExecutable(resolve(pluginRoot, 'bin/movscript'))
    ensureExecutable(resolve(pluginRoot, 'runtime/services/data-service/bin', process.platform === 'win32' ? 'movscript-server.exe' : 'movscript-server'))

    log(`[smoke-plugin] Starting daemon from ${installFirst ? 'installed Home CLI shim' : basename(artifact)} on gateway port ${gatewayPort}`)
    const commandEnv = {
      ...env,
      MOVSCRIPT_HOME: homeDir,
      MOVSCRIPT_WORKSPACE_DIR: projectDir,
      MOVSCRIPT_MCP_ENDPOINT: 'http://127.0.0.1:1/mcp',
      MOVSCRIPT_LOCAL_NODE_GATEWAY_PORT: String(gatewayPort),
      MOVSCRIPT_LOCAL_DAEMON_DATA_PLANE: normalizedDataPlane,
    }
    const currentSmoke = await startAndValidateDaemon({
      cliRoot,
      commandEnv,
      dataPlane: normalizedDataPlane,
      expectedVersion: artifactVersion,
      homeDir,
      spawn,
      timeoutMs,
    })
    lastGatewayBaseURL = currentSmoke.gatewayBaseURL
    lastToolCount = currentSmoke.toolCount

    if (previousArtifact) {
      runMovscript(cliRoot, ['daemon', 'stop', '--home', homeDir, '--force'], commandEnv, spawn, 30_000)
      log(`[smoke-plugin] Rolling Home current back to previous ${basename(previousArtifact)}`)
      runInstallerRollback(root, homeDir, env, spawn)
      pluginRoot = locateInstalledPluginRoot(homeDir, previousArtifactVersion, { expectedReason: 'rollback' })
      validateInstalledPreviousBundle(homeDir, currentInstalledRoot, artifactVersion)
      const rollbackSmoke = await startAndValidateDaemon({
        cliRoot,
        commandEnv,
        dataPlane: normalizedDataPlane,
        expectedVersion: previousArtifactVersion,
        homeDir,
        spawn,
        timeoutMs,
      })
      lastGatewayBaseURL = rollbackSmoke.gatewayBaseURL
      lastToolCount = rollbackSmoke.toolCount
      rollbackExercised = true
    }

    return {
      artifactPath: artifact,
      gatewayBaseURL: lastGatewayBaseURL,
      installed: installFirst,
      rollbackExercised,
      toolCount: lastToolCount,
    }
  } finally {
    if (cliRoot) {
      try {
        runMovscript(cliRoot, ['daemon', 'stop', '--home', homeDir, '--force'], {
          ...env,
          MOVSCRIPT_HOME: homeDir,
          MOVSCRIPT_WORKSPACE_DIR: projectDir,
        }, spawn, 30_000)
      } catch {
        // Cleanup should not hide the original smoke failure.
      }
    }
    if (!keepTemp) rmSync(tempRoot, { recursive: true, force: true })
    else log(`[smoke-plugin] Kept temporary smoke root: ${tempRoot}`)
  }
}

function resolvePluginArtifact(root, explicitPath) {
  if (explicitPath) {
    const resolved = resolve(root, explicitPath)
    if (!existsSync(resolved)) throw new Error(`Plugin smoke artifact does not exist: ${resolved}`)
    return resolved
  }
  const releaseDir = resolve(root, 'plugins/movscript/release')
  if (!existsSync(releaseDir)) throw new Error(`Plugin release directory does not exist: ${releaseDir}`)
  const candidates = readdirSync(releaseDir)
    .filter((name) => /^movscript-agent-plugin-.+\.zip$/.test(name))
    .map((name) => resolve(releaseDir, name))
    .filter((path) => statSync(path).isFile())
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs || basename(right).localeCompare(basename(left)))
  if (candidates.length === 0) throw new Error(`No movscript-agent-plugin-*.zip artifact found in ${releaseDir}`)
  return candidates[0]
}

function pluginVersionFromArtifact(artifact) {
  const name = basename(artifact)
  const match = name.match(/^movscript-agent-plugin-(.+)\.zip$/)
  if (!match) throw new Error(`Unable to infer plugin version from artifact name: ${name}`)
  return match[1]
}

function runInstaller(root, artifact, homeDir, env, spawn) {
  const installer = resolve(root, 'install-plugin.sh')
  if (!existsSync(installer)) throw new Error(`Plugin installer is missing: ${installer}`)
  const result = spawn('sh', [
    installer,
    '--home',
    homeDir,
    '--local-zip',
    artifact,
    '--provider',
    'codex',
    '--retain',
    '2',
  ], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...env,
      MOVSCRIPT_HOME: homeDir,
      MOVSCRIPT_NATIVE_PROVIDER_INSTALL: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 60_000,
  })
  if (result.error || result.status !== 0 || result.signal) {
    throw new Error([
      `Plugin installer smoke failed for ${artifact}`,
      result.error?.message,
      `status=${result.status ?? 'none'} signal=${result.signal ?? 'none'}`,
      String(result.stdout ?? '').trim(),
      String(result.stderr ?? '').trim(),
    ].filter(Boolean).join('\n'))
  }
}

function runInstallerRollback(root, homeDir, env, spawn) {
  const installer = resolve(root, 'install-plugin.sh')
  if (!existsSync(installer)) throw new Error(`Plugin installer is missing: ${installer}`)
  const result = spawn('sh', [
    installer,
    '--home',
    homeDir,
    '--provider',
    'codex',
    '--rollback',
  ], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...env,
      MOVSCRIPT_HOME: homeDir,
      MOVSCRIPT_NATIVE_PROVIDER_INSTALL: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 60_000,
  })
  if (result.error || result.status !== 0 || result.signal) {
    throw new Error([
      'Plugin installer rollback smoke failed',
      result.error?.message,
      `status=${result.status ?? 'none'} signal=${result.signal ?? 'none'}`,
      String(result.stdout ?? '').trim(),
      String(result.stderr ?? '').trim(),
    ].filter(Boolean).join('\n'))
  }
}

function unzipArtifact(artifact, extractDir, spawn) {
  const result = spawn('unzip', ['-q', artifact, '-d', extractDir], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.error || result.status !== 0 || result.signal) {
    throw new Error([
      `Unable to unzip plugin smoke artifact: ${artifact}`,
      result.error?.message,
      `status=${result.status ?? 'none'} signal=${result.signal ?? 'none'}`,
      String(result.stdout ?? '').trim(),
      String(result.stderr ?? '').trim(),
    ].filter(Boolean).join('\n'))
  }
}

function locateInstalledPluginRoot(homeDir, expectedVersion = '', options = {}) {
  const expectedReason = options.expectedReason ?? 'install'
  const pluginStore = resolve(homeDir, 'plugins/movscript')
  const pluginRoot = resolve(pluginStore, 'current')
  const identityPath = resolve(pluginStore, 'current.identity')
  const marketplacePath = resolve(homeDir, 'provider/codex/marketplace.json')
  const codexNativeMarketplacePath = resolve(homeDir, 'provider/codex/.agents/plugins/marketplace.json')
  const codexPluginLink = resolve(homeDir, 'provider/codex/plugins/movscript')
  if (!existsSync(pluginRoot)) throw new Error(`Plugin installer did not create current pointer: ${pluginRoot}`)
  if (!existsSync(identityPath)) throw new Error(`Plugin installer did not write current.identity: ${identityPath}`)
  if (!existsSync(marketplacePath)) throw new Error(`Plugin installer did not write Codex marketplace: ${marketplacePath}`)
  if (!existsSync(codexNativeMarketplacePath)) throw new Error(`Plugin installer did not write Codex native marketplace: ${codexNativeMarketplacePath}`)
  if (!existsSync(codexPluginLink)) throw new Error(`Plugin installer did not write Codex plugin link: ${codexPluginLink}`)
  const currentTarget = realpathSync(pluginRoot)
  const identity = readBundleIdentity(identityPath)
  assertEqual(identity.schema, 'movscript.agent-plugin-bundle.v1', 'installed bundle identity schema')
  if (expectedVersion) assertEqual(identity.version, expectedVersion, 'installed bundle identity version')
  assertEqual(resolve(identity.currentLink ?? ''), pluginRoot, 'installed bundle identity current link')
  assertEqual(realpathSync(identity.pluginRoot ?? ''), currentTarget, 'installed bundle identity plugin root')
  assertEqual(realpathSync(codexPluginLink), currentTarget, 'Codex marketplace plugin link target')
  if (typeof identity.bundleHash !== 'string' || !identity.bundleHash.trim()) {
    throw new Error(`Plugin installer wrote current.identity without bundleHash: ${identityPath}`)
  }
  if (identity.reason !== expectedReason) throw new Error(`Plugin installer wrote unexpected identity reason: ${identity.reason}`)
  return pluginRoot
}

function validateInstalledPreviousBundle(homeDir, expectedRoot, expectedVersion = '') {
  const previousLink = resolve(homeDir, 'plugins/movscript/previous')
  if (!existsSync(previousLink)) throw new Error(`Plugin installer did not retain previous pointer: ${previousLink}`)
  assertEqual(realpathSync(previousLink), realpathSync(expectedRoot), 'Home previous plugin link target')
  if (expectedVersion) {
    const previousManifest = readJSON(resolve(previousLink, 'manifest.runtime.json'))
    assertEqual(previousManifest.version, expectedVersion, 'Home previous runtime manifest version')
  }
}

function validateInstalledHomeCliShim(homeDir) {
  const shellEntrypoint = resolve(homeDir, 'bin/movscript')
  const nodeEntrypoint = resolve(homeDir, 'bin/movscript.mjs')
  if (!existsSync(shellEntrypoint)) throw new Error(`Plugin installer did not write Home CLI shell shim: ${shellEntrypoint}`)
  if (!existsSync(nodeEntrypoint)) throw new Error(`Plugin installer did not write Home CLI node shim: ${nodeEntrypoint}`)
  ensureExecutable(shellEntrypoint)
  const shim = readFileSync(nodeEntrypoint, 'utf8')
  if (!/plugins\/movscript\/current/.test(shim) || !/pathToFileURL\(pluginEntry\)/.test(shim)) {
    throw new Error(`Plugin installer wrote an invalid Home CLI shim: ${nodeEntrypoint}`)
  }
}

function locatePluginRoot(extractDir) {
  if (existsSync(resolve(extractDir, '.mcp.json'))) return extractDir
  const children = readdirSync(extractDir)
    .map((name) => resolve(extractDir, name))
    .filter((path) => statSync(path).isDirectory())
  const found = children.find((path) => existsSync(resolve(path, '.mcp.json')))
  if (!found) throw new Error(`Extracted plugin root does not contain .mcp.json: ${extractDir}`)
  return found
}

function readJSON(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function readBundleIdentity(path) {
  const fields = {}
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const index = line.indexOf('=')
    if (index <= 0) continue
    fields[line.slice(0, index)] = line.slice(index + 1)
  }
  return fields
}

function validatePluginRoot(pluginRoot, dataPlane) {
  const required = [
    '.mcp.json',
    '.agent-package/package.json',
    '.codex-plugin/plugin.json',
    '.provider-plugin/plugin.json',
    'bin/movscript',
    'bin/movscript.mjs',
    'manifest.runtime.json',
    'skills',
    'README.md',
    'runtime/services/local-surface-host/dist/index.html',
  ]
  if (dataPlane === 'local') {
    required.push(`runtime/services/data-service/bin/${process.platform === 'win32' ? 'movscript-server.exe' : 'movscript-server'}`)
  }
  const missing = required.filter((path) => !existsSync(resolve(pluginRoot, path)))
  if (missing.length > 0) {
    throw new Error(`Extracted plugin smoke artifact is missing required paths:\n${missing.map((path) => `- ${path}`).join('\n')}`)
  }
  const runtimeManifest = readJSON(resolve(pluginRoot, 'manifest.runtime.json'))
  assertEqual(runtimeManifest.schema, 'movscript.runtime-bundle.v1', 'runtime manifest schema')
  assertEqual(runtimeManifest.apiVersion, '1.0', 'runtime manifest API version')
  assertEqual(runtimeManifest.minDaemonApiVersion, '1.0', 'runtime manifest minimum daemon API version')
  assertEqual(runtimeManifest.bundleHashAlgorithm, 'sha256', 'runtime manifest hash algorithm')
  if (typeof runtimeManifest.bundleHash !== 'string' || !runtimeManifest.bundleHash.trim()) {
    throw new Error(`runtime manifest did not expose bundleHash: ${JSON.stringify(runtimeManifest)}`)
  }
  for (const capability of ['cli', 'mcp', 'daemon', 'project', 'timeline', 'canvas', 'resources', 'editing', 'media']) {
    assertEqual(runtimeManifest.capabilities?.[capability], true, `runtime manifest capability ${capability}`)
  }
}

function runMovscript(pluginRoot, args, env, spawn, timeoutMs) {
  const shellEntrypoint = resolve(pluginRoot, 'bin/movscript')
  const nodeEntrypoint = resolve(pluginRoot, 'bin/movscript.mjs')
  const command = process.platform === 'win32' ? process.execPath : shellEntrypoint
  const commandArgs = process.platform === 'win32' ? [nodeEntrypoint, ...args] : args
  const result = spawn(command, commandArgs, {
    cwd: pluginRoot,
    encoding: 'utf8',
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: timeoutMs,
    ...(process.platform === 'win32' ? { shell: true } : {}),
  })
  if (result.error || result.status !== 0 || result.signal) {
    const timedOut = result.error?.code === 'ETIMEDOUT' || result.signal === 'SIGTERM'
    throw new Error([
      `movscript command failed: ${args.join(' ')}`,
      timedOut ? `timed out after ${Math.round(timeoutMs / 1000)}s` : '',
      result.error?.message,
      `status=${result.status ?? 'none'} signal=${result.signal ?? 'none'}`,
      String(result.stdout ?? '').trim(),
      String(result.stderr ?? '').trim(),
    ].filter(Boolean).join('\n'))
  }
  return result
}

function parseCommandJSON(result, label) {
  const text = String(result.stdout ?? '').trim()
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error(`${label} did not return JSON: ${error instanceof Error ? error.message : String(error)}\n${text}`)
  }
}

function assertRequiredServices(status, dataPlane) {
  const services = new Set((Array.isArray(status.services) ? status.services : [])
    .filter((item) => item && typeof item === 'object' && item.ready === true)
    .map((item) => item.serviceName)
    .filter((serviceName) => typeof serviceName === 'string'))
  const required = [
    'movscript.local-node.control',
    'movscript.local-node.gateway',
    ...(dataPlane === 'local' ? ['movscript.data.service'] : []),
    'movscript.project.service',
    'movscript.editing.service',
    'movscript.canvas.service',
    'movscript.local-surface.host',
    'movscript.media.pipeline',
  ]
  const missing = required.filter((serviceName) => !services.has(serviceName))
  if (missing.length > 0) throw new Error(`Plugin package smoke missing ready services: ${missing.join(', ')}`)
}

async function startAndValidateDaemon({
  cliRoot,
  commandEnv,
  dataPlane,
  expectedVersion,
  homeDir,
  spawn,
  timeoutMs,
}) {
  const start = runMovscript(cliRoot, [
    'daemon',
    'start',
    '--home',
    homeDir,
    '--data-plane',
    dataPlane,
    '--idle-timeout',
    '2m',
    '--startup-timeout-ms',
    String(timeoutMs),
  ], commandEnv, spawn, timeoutMs + 10_000)
  const startPayload = parseCommandJSON(start, 'daemon start')
  assertEqual(startPayload.status, 'ready', 'daemon start status')
  assertEqual(startPayload.dataPlane, dataPlane, 'daemon data plane')

  const status = parseCommandJSON(
    runMovscript(cliRoot, ['daemon', 'status', '--home', homeDir], commandEnv, spawn, 30_000),
    'daemon status',
  )
  assertEqual(status.available, true, 'daemon status availability')
  assertEqual(status.dataPlane, dataPlane, 'daemon status data plane')
  assertRequiredServices(status, dataPlane)

  const gatewayBaseURL = gatewayURL(homeDir)
  const descriptor = await fetchJSON(`${gatewayBaseURL}/v1/runtime/descriptor`)
  assertEqual(descriptor.schema, 'movscript.runtime-descriptor.v1', 'runtime descriptor schema')
  assertEqual(descriptor.apiVersion, '1.0', 'runtime descriptor API version')
  assertEqual(descriptor.gateway?.canonicalPrefix, '/v1', 'runtime descriptor canonical prefix')
  assertEqual(descriptor.gateway?.mcpEndpoint, `${gatewayBaseURL}/v1/mcp`, 'runtime descriptor MCP endpoint')
  assertEqual(descriptor.runtime?.identity?.pluginVersion, expectedVersion, 'runtime descriptor plugin identity version')
  if (typeof descriptor.runtime?.identity?.pluginRoot !== 'string' || !descriptor.runtime.identity.pluginRoot.trim()) {
    throw new Error(`runtime descriptor did not expose pluginRoot identity: ${JSON.stringify(descriptor.runtime?.identity)}`)
  }
  if (typeof descriptor.bundleHash !== 'string' || !descriptor.bundleHash.trim()) {
    throw new Error(`runtime descriptor did not expose bundleHash: ${JSON.stringify(descriptor)}`)
  }
  assertEqual(descriptor.compatibility?.kind, 'same', 'runtime descriptor bundle compatibility kind')
  assertEqual(descriptor.compatibility?.compatible, true, 'runtime descriptor bundle compatibility result')

  const health = await fetchJSON(`${gatewayBaseURL}/v1/mcp/health`)
  assertEqual(health.status, 'ok', 'daemon MCP health')
  if (!Number.isFinite(Number(health.toolCount)) || Number(health.toolCount) <= 0) {
    throw new Error(`daemon MCP health returned invalid toolCount: ${JSON.stringify(health)}`)
  }

  const tools = await fetchJSON(`${gatewayBaseURL}/v1/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'tools', method: 'tools/list', params: {} }),
  })
  const toolNames = new Set((tools.result?.tools ?? []).map((tool) => tool?.name).filter(Boolean))
  for (const requiredTool of ['runtime_daemon_status', 'domain_inspect']) {
    if (!toolNames.has(requiredTool)) throw new Error(`daemon MCP tools/list is missing ${requiredTool}`)
  }
  return {
    gatewayBaseURL,
    toolCount: toolNames.size,
  }
}

function gatewayURL(homeDir) {
  const recordPath = join(homeDir, 'runtime', 'endpoints', 'movscript.local-node.gateway.json')
  if (!existsSync(recordPath)) throw new Error(`Daemon gateway endpoint record is missing: ${recordPath}`)
  const record = JSON.parse(readFileSync(recordPath, 'utf8'))
  const url = endpointURL(record)
  if (!url) throw new Error(`Daemon gateway endpoint record has no URL: ${recordPath}`)
  return url
}

function endpointURL(record) {
  if (typeof record?.url === 'string' && record.url.trim()) return record.url.trim().replace(/\/+$/, '')
  if (typeof record?.baseURL === 'string' && record.baseURL.trim()) return record.baseURL.trim().replace(/\/+$/, '')
  if (record?.port) return `http://127.0.0.1:${record.port}`
  return ''
}

async function fetchJSON(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(10_000),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}: ${text}`)
  try {
    return text ? JSON.parse(text) : {}
  } catch (error) {
    throw new Error(`Invalid JSON from ${url}: ${error instanceof Error ? error.message : String(error)}\n${text}`)
  }
}

async function reservePort() {
  const server = createServer()
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(0, '127.0.0.1', resolveListen)
  })
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  await new Promise((resolveClose) => server.close(resolveClose))
  if (!port) throw new Error('Unable to reserve a local daemon gateway port')
  return port
}

function ensureExecutable(path) {
  if (process.platform === 'win32' || !existsSync(path)) return
  chmodSync(path, statSync(path).mode | 0o755)
}

function normalizeDataPlane(value) {
  const normalized = String(value ?? '').trim().toLowerCase() || 'local'
  if (normalized === 'local' || normalized === 'cloud' || normalized === 'external') return normalized
  throw new Error(`Unsupported plugin smoke data plane: ${value}`)
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label} mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

function argValue(args, name) {
  const equalPrefix = `${name}=`
  const equalValue = args.find((arg) => arg.startsWith(equalPrefix))
  if (equalValue) return equalValue.slice(equalPrefix.length)
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

function helpText() {
  return [
    'Smoke test a packaged MovScript Agent Plugin zip.',
    '',
    'Usage:',
    '  node scripts/release/smoke-plugin-package.mjs [options]',
    '',
    'Options:',
    '  --artifact <zip>          Plugin zip to smoke. Defaults to plugins/movscript/release/movscript-agent-plugin-*.zip.',
    '  --data-plane <kind>       local, cloud, or external. Defaults to local.',
    '  --timeout-ms <ms>         Daemon startup timeout. Defaults to 120000.',
    '  --previous-artifact <zip> Previous plugin zip; enables current/previous rollback smoke.',
    '  --no-install              Skip install-plugin.sh and smoke the extracted zip directly.',
    '  --keep-temp               Keep extracted plugin, Home, and project directories.',
  ].join('\n')
}
