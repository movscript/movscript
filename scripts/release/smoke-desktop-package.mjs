#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

import {
  isDirectRun,
  parseDesktopArchArg,
  parseDesktopPlatformArg,
} from './release-common.mjs'

const repoRoot = resolve(import.meta.dirname, '../..')
const defaultTimeoutMs = 90_000
const smokeOkMarker = 'MOVSCRIPT_DESKTOP_SMOKE_OK'

if (isDirectRun(import.meta.url)) {
  runSmokeDesktopPackageCli(repoRoot, process.env, process.argv.slice(2))
}

export function runSmokeDesktopPackageCli(root = repoRoot, env = process.env, args = [], options = {}) {
  const {
    exit = process.exit,
    log = console.log,
    logError = console.error,
    spawn = spawnSync,
  } = options

  try {
    const result = smokeDesktopPackage(root, {
      arch: parseDesktopArchArg(args, env.MOVSCRIPT_PACKAGE_ARCH || process.arch, 'desktop smoke'),
      env,
      existingHomeCurrent: argValue(args, '--existing-home-current') ?? env.MOVSCRIPT_DESKTOP_SMOKE_EXISTING_HOME_CURRENT,
      localRuntime: hasFlag(args, '--local-runtime') || env.MOVSCRIPT_DESKTOP_SMOKE_LOCAL_RUNTIME === '1',
      localRuntimeDataPlane: argValue(args, '--data-plane') ?? env.MOVSCRIPT_DESKTOP_SMOKE_DATA_PLANE ?? env.MOVSCRIPT_LOCAL_DAEMON_DATA_PLANE,
      platform: parseDesktopPlatformArg(args, env.MOVSCRIPT_PACKAGE_PLATFORM || process.platform, 'desktop smoke'),
      releaseDir: argValue(args, '--release-dir') ?? env.MOVSCRIPT_DESKTOP_RELEASE_DIR,
      spawn,
      timeoutMs: Number(argValue(args, '--timeout-ms') ?? env.MOVSCRIPT_DESKTOP_SMOKE_TIMEOUT_MS ?? defaultTimeoutMs),
    })
    if (result.skipped) {
      log(`Desktop package smoke skipped: ${result.reason}`)
      return
    }
    log(`Desktop package smoke passed: ${result.executable}`)
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    exit(1)
  }
}

export function smokeDesktopPackage(root = repoRoot, options = {}) {
  const {
    arch = process.arch,
    env = process.env,
    existingHomeCurrent = 'none',
    localRuntime = false,
    localRuntimeDataPlane = 'local',
    platform = process.platform,
    releaseDir = resolve(root, 'apps/desktop/release'),
    spawn = spawnSync,
    timeoutMs = defaultTimeoutMs,
  } = options

  if (platform !== process.platform || arch !== process.arch) {
    return {
      skipped: true,
      reason: `target ${platform} ${arch} cannot run on current host ${process.platform} ${process.arch}`,
    }
  }
  if (!existsSync(releaseDir)) {
    throw new Error(`Electron release directory does not exist: ${releaseDir}`)
  }

  const executable = findPackagedExecutable(releaseDir, platform)
  if (!executable) {
    throw new Error(`No packaged desktop executable found in ${releaseDir} for ${platform}`)
  }

  const providedUserDataDir = env.MOVSCRIPT_DESKTOP_USER_DATA_DIR?.trim() || env.MOVSCRIPT_DESKTOP_SMOKE_USER_DATA_DIR?.trim()
  const userDataDir = providedUserDataDir || mkdtempSync(join(tmpdir(), 'movscript-electron-user-data.'))
  const providedSmokeHome = env.MOVSCRIPT_DESKTOP_HOME?.trim() || env.MOVSCRIPT_HOME?.trim() || env.MOVSCRIPT_WORKSPACE_DIR?.trim()
  const smokeHome = providedSmokeHome || mkdtempSync(join(tmpdir(), 'movscript-smoke-home.'))
  const markerFile = `${userDataDir}.marker`
  const dataPlane = normalizeLocalRuntimeDataPlane(localRuntimeDataPlane)
  const existingHomeCurrentMode = normalizeExistingHomeCurrentMode(existingHomeCurrent)
  if (existingHomeCurrentMode !== 'none' && !localRuntime) {
    throw new Error('--existing-home-current requires --local-runtime so the smoke can verify daemon identity')
  }
  const smokeArgs = ['--movscript-desktop-smoke-test', `--user-data-dir=${userDataDir}`]
  const runner = desktopSmokeRunner(executable, platform, env, smokeArgs)
  const movscriptCLI = localRuntime ? findPackagedMovscriptCLI(releaseDir, platform) : ''
  if (localRuntime && !movscriptCLI) {
    throw new Error(`No packaged movscript daemon CLI found in ${releaseDir}`)
  }
  const stagedHomeCurrent = existingHomeCurrentMode === 'newer'
    ? stageExistingNewerHomeCurrent(smokeHome, packagedProviderPluginRoot(movscriptCLI))
    : existingHomeCurrentMode === 'older'
      ? stageExistingOlderHomeCurrent(smokeHome, packagedProviderPluginRoot(movscriptCLI))
      : undefined
  let result
  try {
    result = spawn(runner.command, runner.args, {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...env,
        ELECTRON_ENABLE_LOGGING: env.ELECTRON_ENABLE_LOGGING ?? '1',
        MOVSCRIPT_DESKTOP_APP_NAME: env.MOVSCRIPT_DESKTOP_APP_NAME?.trim() || 'Movscript Smoke',
        MOVSCRIPT_DESKTOP_DISTRIBUTION_PROFILE: env.MOVSCRIPT_DESKTOP_DISTRIBUTION_PROFILE?.trim() || 'custom',
        MOVSCRIPT_DESKTOP_HOME: env.MOVSCRIPT_DESKTOP_HOME?.trim() || env.MOVSCRIPT_HOME?.trim() || smokeHome,
        MOVSCRIPT_DESKTOP_USER_DATA_DIR: env.MOVSCRIPT_DESKTOP_USER_DATA_DIR?.trim() || userDataDir,
        MOVSCRIPT_HOME: env.MOVSCRIPT_HOME?.trim() || env.MOVSCRIPT_DESKTOP_HOME?.trim() || smokeHome,
        ...(localRuntime ? {
          MOVSCRIPT_DESKTOP_SMOKE_LOCAL_RUNTIME: '1',
          MOVSCRIPT_DESKTOP_SMOKE_DATA_PLANE: dataPlane,
          MOVSCRIPT_LOCAL_DAEMON_DATA_PLANE: dataPlane,
        } : {}),
        MOVSCRIPT_DESKTOP_SMOKE_MARKER_FILE: markerFile,
        MOVSCRIPT_DESKTOP_SMOKE_TEST: '1',
        MOVSCRIPT_DESKTOP_SMOKE_USER_DATA_DIR: userDataDir,
        MOVSCRIPT_WORKSPACE_DIR: env.MOVSCRIPT_WORKSPACE_DIR?.trim() || smokeHome,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
    })

    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
    const sawSmokeMarker = output.includes(smokeOkMarker) || waitForSmokeMarker(markerFile, platform === 'darwin' ? timeoutMs : 0)
    if ((result.error || result.status !== 0 || result.signal) && !sawSmokeMarker) {
      const timedOut = result.error?.code === 'ETIMEDOUT' || result.signal === 'SIGTERM'
      throw new Error([
        `Packaged desktop smoke failed: ${executable}`,
        timedOut ? `timed out after ${Math.round(timeoutMs / 1000)}s` : '',
        result.error?.message,
        `status=${result.status ?? 'none'} signal=${result.signal ?? 'none'}`,
        output.trim(),
      ].filter(Boolean).join('\n'))
    }
    if (!sawSmokeMarker) {
      throw new Error([
        `Packaged desktop smoke did not emit ${smokeOkMarker}: ${executable}`,
        output.trim(),
      ].filter(Boolean).join('\n'))
    }
    if (localRuntime) {
      assertPackagedLocalRuntimeReady(movscriptCLI, smokeHome, dataPlane, spawn, {
        existingHomeCurrentMode,
        stagedHomeCurrent,
      })
    }
  } finally {
    if (localRuntime && movscriptCLI) stopSmokeLocalRuntime(movscriptCLI, smokeHome, spawn)
    stopSmokeLocalBackend(smokeHome)
    if (!providedUserDataDir) rmSync(userDataDir, { recursive: true, force: true })
    if (!providedSmokeHome) rmSync(smokeHome, { recursive: true, force: true })
    rmSync(markerFile, { force: true })
  }

  return { executable, skipped: false }
}

function assertPackagedLocalRuntimeReady(movscriptCLI, smokeHome, dataPlane, spawn, options = {}) {
  const status = runPackagedDaemonCommand(movscriptCLI, smokeHome, ['daemon', 'status'], spawn)
  const homeCurrent = assertDesktopSmokeHomeCurrent(smokeHome)
  if (options.existingHomeCurrentMode === 'newer' && options.stagedHomeCurrent) {
    assertStagedHomeCurrentWasNotDowngraded(homeCurrent, options.stagedHomeCurrent)
  }
  if (options.existingHomeCurrentMode === 'older' && options.stagedHomeCurrent) {
    assertStagedHomeCurrentWasUpgraded(homeCurrent, options.stagedHomeCurrent)
  }
  assertRuntimeIdentityMatchesHomeCurrent(status, homeCurrent, 'daemon status')
  const services = new Set((Array.isArray(status.services) ? status.services : [])
    .filter((item) => item && typeof item === 'object' && item.ready === true)
    .map((item) => item.serviceName)
    .filter((serviceName) => typeof serviceName === 'string'))
  const requiredServices = [
    'movscript.local-node.control',
    ...(dataPlane === 'local' ? ['movscript.data.service'] : []),
    'movscript.project.service',
    'movscript.editing.service',
    'movscript.canvas.service',
    'movscript.local-surface.host',
    'movscript.media.pipeline',
  ]
  const missing = requiredServices.filter((serviceName) => !services.has(serviceName))
  if (missing.length > 0) {
    throw new Error(`Packaged desktop local runtime smoke missing ready services: ${missing.join(', ')}`)
  }
  if (dataPlane !== 'local' && services.has('movscript.data.service')) {
    throw new Error(`Packaged desktop ${dataPlane} data-plane smoke unexpectedly started local Data Service`)
  }
  if (status.dataPlane !== dataPlane) {
    throw new Error(`Packaged desktop local runtime smoke expected dataPlane=${dataPlane}, got ${status.dataPlane}`)
  }
  const descriptor = runPackagedDaemonCommand(movscriptCLI, smokeHome, ['runtime', 'descriptor', 'get'], spawn)
  assertRuntimeDescriptorMatchesHomeCurrent(descriptor, homeCurrent)
  assertDesktopSmokeCodexMarketplace(smokeHome, homeCurrent)
}

function assertDesktopSmokeCodexMarketplace(smokeHome, homeCurrent) {
  const marketplaceRoot = resolve(smokeHome, 'codex-marketplace')
  const pluginRoot = resolve(marketplaceRoot, 'plugins/movscript')
  const marketplacePath = resolve(marketplaceRoot, '.agents/plugins/marketplace.json')
  const codexPluginManifestPath = resolve(homeCurrent.currentRoot, '.codex-plugin/plugin.json')
  if (!existsSync(codexPluginManifestPath)) {
    throw new Error(`Packaged desktop smoke Home current is missing Codex plugin manifest: ${codexPluginManifestPath}`)
  }
  const codexPluginManifest = readJSONFile(codexPluginManifestPath)
  assertEqual(codexPluginManifest.name, 'movscript', 'Home current Codex plugin manifest name')

  mkdirSync(resolve(marketplaceRoot, 'plugins'), { recursive: true })
  mkdirSync(resolve(marketplaceRoot, '.agents/plugins'), { recursive: true })
  rmSync(pluginRoot, { recursive: true, force: true })
  symlinkSync(resolve(smokeHome, 'plugins/movscript/current'), pluginRoot, process.platform === 'win32' ? 'junction' : 'dir')
  rmSync(resolve(marketplaceRoot, 'marketplace.json'), { force: true })
  writeFileSync(marketplacePath, `${JSON.stringify({
    name: 'movscript-local',
    interface: {
      displayName: 'MovScript',
    },
    plugins: [{
      name: 'movscript',
      source: {
        source: 'local',
        path: './plugins/movscript',
      },
      policy: {
        installation: 'AVAILABLE',
        authentication: 'ON_USE',
      },
      category: 'Productivity',
    }],
  }, null, 2)}\n`, 'utf8')

  assertEqual(realpathSync(pluginRoot), homeCurrent.currentRoot, 'Codex marketplace plugin link target')
  const marketplace = readJSONFile(marketplacePath)
  assertEqual(marketplace.name, 'movscript-local', 'Codex marketplace name')
  assertEqual(marketplace.plugins?.[0]?.name, 'movscript', 'Codex marketplace plugin name')
  assertEqual(marketplace.plugins?.[0]?.source?.path, './plugins/movscript', 'Codex marketplace plugin path')
  assertEqual(marketplace.plugins?.[0]?.policy?.installation, 'AVAILABLE', 'Codex marketplace installation policy')
  if (existsSync(resolve(marketplaceRoot, 'marketplace.json'))) {
    throw new Error(`Packaged desktop smoke Codex marketplace wrote legacy root marketplace.json: ${marketplaceRoot}`)
  }
}

function stageExistingNewerHomeCurrent(smokeHome, providerPluginRoot) {
  return stageExistingHomeCurrent(smokeHome, providerPluginRoot, {
    version: '999.0.0',
    asset: 'preexisting-home-current-newer',
  })
}

function stageExistingOlderHomeCurrent(smokeHome, providerPluginRoot) {
  return stageExistingHomeCurrent(smokeHome, providerPluginRoot, {
    version: '0.0.1',
    asset: 'preexisting-home-current-older',
  })
}

function stageExistingHomeCurrent(smokeHome, providerPluginRoot, input) {
  if (!providerPluginRoot) throw new Error('Cannot stage an existing Home current without a packaged provider plugin root')
  const sourceManifest = readJSONFile(resolve(providerPluginRoot, 'manifest.runtime.json'))
  const version = input.version
  const bundleHash = typeof sourceManifest.bundleHash === 'string' && sourceManifest.bundleHash.trim()
    ? sourceManifest.bundleHash.trim()
    : 'smokeexistingcurrent'
  const pluginStore = resolve(smokeHome, 'plugins/movscript')
  const currentLink = resolve(pluginStore, 'current')
  const targetRoot = resolve(pluginStore, `${version}+${safeBundleHashPart(bundleHash)}`)
  rmSync(targetRoot, { recursive: true, force: true })
  mkdirSync(pluginStore, { recursive: true })
  cpSync(providerPluginRoot, targetRoot, { recursive: true })
  writeFileSync(resolve(targetRoot, 'manifest.runtime.json'), `${JSON.stringify({
    ...sourceManifest,
    version,
  }, null, 2)}\n`, 'utf8')
  switchPluginPointer(currentLink, targetRoot)
  writeFileSync(resolve(pluginStore, 'current.identity'), [
    'schema=movscript.agent-plugin-bundle.v1',
    `version=${version}`,
    `pluginRoot=${targetRoot}`,
    `currentLink=${currentLink}`,
    'previousRoot=',
    `installedAt=${new Date().toISOString()}`,
    'reason=agent-plugin-install',
    'release=desktop-smoke',
    `asset=${input.asset}`,
    'provider=agent-plugin',
    `bundleHash=${bundleHash}`,
    `apiVersion=${sourceManifest.apiVersion ?? ''}`,
    `minDaemonApiVersion=${sourceManifest.minDaemonApiVersion ?? ''}`,
    '',
  ].join('\n'), 'utf8')
  return {
    version,
    bundleHash,
    currentRoot: realpathSync(targetRoot),
  }
}

function assertStagedHomeCurrentWasNotDowngraded(homeCurrent, stagedHomeCurrent) {
  assertEqual(homeCurrent.identity.version, stagedHomeCurrent.version, 'preexisting newer Home current version')
  assertEqual(homeCurrent.identity.bundleHash, stagedHomeCurrent.bundleHash, 'preexisting newer Home current bundleHash')
  assertEqual(homeCurrent.currentRoot, stagedHomeCurrent.currentRoot, 'preexisting newer Home current root')
}

function assertStagedHomeCurrentWasUpgraded(homeCurrent, stagedHomeCurrent) {
  if (homeCurrent.identity.version === stagedHomeCurrent.version) {
    throw new Error(`Packaged desktop local runtime smoke kept older Home current version ${stagedHomeCurrent.version}`)
  }
  if (homeCurrent.currentRoot === stagedHomeCurrent.currentRoot) {
    throw new Error(`Packaged desktop local runtime smoke kept older Home current root: ${stagedHomeCurrent.currentRoot}`)
  }
  const previousRoot = homeCurrent.identity.previousRoot ? realpathSync(homeCurrent.identity.previousRoot) : ''
  assertEqual(previousRoot, stagedHomeCurrent.currentRoot, 'previous plugin root after older Home current upgrade')
}

function runPackagedDaemonCommand(movscriptCLI, smokeHome, args, spawn) {
  const result = spawn(movscriptCLI, args, {
    encoding: 'utf8',
    env: {
      ...process.env,
      MOVSCRIPT_HOME: smokeHome,
      MOVSCRIPT_WORKSPACE_DIR: smokeHome,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000,
  })
  if (result.error || result.status !== 0 || result.signal) {
    throw new Error([
      `Packaged movscript daemon command failed: ${movscriptCLI} ${args.join(' ')}`,
      result.error?.message,
      `status=${result.status ?? 'none'} signal=${result.signal ?? 'none'}`,
      String(result.stdout ?? '').trim(),
      String(result.stderr ?? '').trim(),
    ].filter(Boolean).join('\n'))
  }
  return unwrapCommandResult(JSON.parse(String(result.stdout ?? '{}')), args)
}

function unwrapCommandResult(payload, args) {
  if (payload?.schema !== 'movscript.command_result.v1') return payload
  if (payload.status && payload.status !== 'ok') {
    throw new Error(`Packaged movscript command returned ${payload.status}: ${args.join(' ')}\n${JSON.stringify(payload, null, 2)}`)
  }
  return payload.data
}

function assertDesktopSmokeHomeCurrent(smokeHome) {
  const pluginStore = resolve(smokeHome, 'plugins/movscript')
  const identityPath = resolve(pluginStore, 'current.identity')
  const currentLink = resolve(pluginStore, 'current')
  if (!existsSync(identityPath)) throw new Error(`Packaged desktop smoke did not write Home current.identity: ${identityPath}`)
  if (!existsSync(currentLink)) throw new Error(`Packaged desktop smoke did not create Home current plugin pointer: ${currentLink}`)

  const identity = readBundleIdentity(identityPath)
  const currentRoot = realpathSync(currentLink)
  const identityRoot = realpathSync(identity.pluginRoot)
  if (identityRoot !== currentRoot) {
    throw new Error(`Packaged desktop smoke Home current.identity pluginRoot does not target current: ${identity.pluginRoot} != ${currentRoot}`)
  }
  if (identity.currentLink !== currentLink) {
    throw new Error(`Packaged desktop smoke current.identity currentLink is ${identity.currentLink}, expected ${currentLink}`)
  }
  if (identity.provider !== 'desktop') {
    throw new Error(`Packaged desktop smoke current.identity provider is ${identity.provider}, expected desktop`)
  }
  if (identity.reason !== 'desktop-runtime-start' && identity.reason !== 'reuse-current') {
    throw new Error(`Packaged desktop smoke current.identity reason is ${identity.reason}, expected desktop-runtime-start or reuse-current`)
  }

  const manifestPath = resolve(currentRoot, 'manifest.runtime.json')
  if (!existsSync(manifestPath)) throw new Error(`Packaged desktop smoke Home current is missing manifest.runtime.json: ${manifestPath}`)
  const manifest = readJSONFile(manifestPath)
  assertEqual(manifest.schema, 'movscript.runtime-bundle.v1', 'Home current runtime manifest schema')
  assertEqual(manifest.version, identity.version, 'Home current identity version')
  assertEqual(manifest.apiVersion, identity.apiVersion, 'Home current identity API version')
  assertEqual(manifest.minDaemonApiVersion, identity.minDaemonApiVersion, 'Home current identity minimum daemon API version')
  assertEqual(manifest.bundleHash, identity.bundleHash, 'Home current identity bundle hash')
  if (typeof identity.bundleHash !== 'string' || !identity.bundleHash.trim()) {
    throw new Error(`Packaged desktop smoke current.identity did not include bundleHash: ${identityPath}`)
  }
  return { currentRoot, identity, manifest }
}

function assertRuntimeIdentityMatchesHomeCurrent(payload, homeCurrent, label) {
  assertEqual(payload.pluginVersion, homeCurrent.identity.version, `${label} pluginVersion`)
  assertEqual(payload.pluginRoot ? realpathSync(payload.pluginRoot) : payload.pluginRoot, homeCurrent.currentRoot, `${label} pluginRoot`)
  assertEqual(payload.apiVersion, homeCurrent.identity.apiVersion, `${label} apiVersion`)
  assertEqual(payload.minDaemonApiVersion, homeCurrent.identity.minDaemonApiVersion, `${label} minDaemonApiVersion`)
  assertEqual(payload.bundleHash, homeCurrent.identity.bundleHash, `${label} bundleHash`)
}

function assertRuntimeDescriptorMatchesHomeCurrent(descriptor, homeCurrent) {
  assertEqual(descriptor.schema, 'movscript.runtime-descriptor.v1', 'runtime descriptor schema')
  assertEqual(descriptor.runtime?.owner, 'movscript.local-node', 'runtime descriptor owner')
  assertEqual(descriptor.gateway?.canonicalPrefix, '/v1', 'runtime descriptor canonical prefix')
  assertRuntimeIdentityMatchesHomeCurrent(descriptor.runtime?.identity ?? {}, homeCurrent, 'runtime descriptor identity')
  assertEqual(descriptor.bundleHash, homeCurrent.identity.bundleHash, 'runtime descriptor bundleHash')
  if (descriptor.compatibility?.compatible !== true) {
    throw new Error(`Packaged desktop smoke runtime descriptor reported incompatible Home current: ${JSON.stringify(descriptor.compatibility)}`)
  }
}

function packagedProviderPluginRoot(movscriptCLI) {
  if (!movscriptCLI) return ''
  return resolve(movscriptCLI, '..', '..')
}

function switchPluginPointer(linkPath, targetPath) {
  rmSync(linkPath, { recursive: true, force: true })
  symlinkSync(targetPath, linkPath, process.platform === 'win32' ? 'junction' : 'dir')
}

function safeBundleHashPart(value) {
  const safe = String(value || '').replace(/[^A-Fa-f0-9]+/g, '').slice(0, 12)
  return safe || 'smokenewer'
}

function normalizeExistingHomeCurrentMode(value) {
  const raw = String(value || 'none').trim().toLowerCase()
  if (raw === '' || raw === 'none' || raw === '0' || raw === 'false') return 'none'
  if (raw === 'newer') return 'newer'
  if (raw === 'older') return 'older'
  throw new Error(`Unsupported --existing-home-current mode: ${value}. Expected "none", "newer", or "older".`)
}

function readBundleIdentity(path) {
  const fields = {}
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const index = line.indexOf('=')
    if (index <= 0) continue
    fields[line.slice(0, index)] = line.slice(index + 1)
  }
  for (const key of ['schema', 'version', 'pluginRoot', 'currentLink', 'installedAt', 'reason']) {
    if (!fields[key]) throw new Error(`Packaged desktop smoke current.identity is missing ${key}: ${path}`)
  }
  if (fields.schema !== 'movscript.agent-plugin-bundle.v1') {
    throw new Error(`Packaged desktop smoke current.identity schema is ${fields.schema}, expected movscript.agent-plugin-bundle.v1`)
  }
  return fields
}

function readJSONFile(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`Packaged desktop local runtime smoke ${label} mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

function stopSmokeLocalRuntime(movscriptCLI, smokeHome, spawn) {
  try {
    runPackagedDaemonCommand(movscriptCLI, smokeHome, ['daemon', 'stop', '--force'], spawn)
  } catch {
    // Smoke cleanup should not mask the original smoke failure.
  }
}

export function findPackagedExecutable(releaseDir, platform = process.platform) {
  const candidates = []
  walk(releaseDir, (path, info) => {
    if (!info.isFile()) return
    const normalized = path.replace(/\\/g, '/')
    const name = basename(path)
    if (platform === 'darwin') {
      if (normalized.endsWith('.app/Contents/MacOS/Movscript') || normalized.endsWith('.app/Contents/MacOS/movscript')) {
        candidates.push(path)
      }
      return
    }
    if (platform === 'win32') {
      if (normalized.includes('/win-unpacked/') && /^Movscript\.exe$/i.test(name)) candidates.push(path)
      return
    }
    if (platform === 'linux' && basename(dirname(path)).endsWith('-unpacked') && isExecutable(info)) {
      candidates.push(path)
    }
  })
  candidates.sort((left, right) => executableScore(left, platform) - executableScore(right, platform) || left.localeCompare(right))
  return candidates[0] ?? ''
}

export function findPackagedMovscriptCLI(releaseDir, platform = process.platform) {
  const candidates = []
  walk(releaseDir, (path, info) => {
    if (!info.isFile()) return
    const normalized = path.replace(/\\/g, '/')
    const name = basename(path)
    if (!normalized.includes('/provider-plugins/movscript/bin/')) return
    if (platform === 'win32') {
      if (/^movscript(\.cmd|\.exe)?$/i.test(name)) candidates.push(path)
      return
    }
    if (name === 'movscript' && isExecutable(info)) candidates.push(path)
  })
  candidates.sort((left, right) => left.localeCompare(right))
  return candidates[0] ?? ''
}

function linuxSmokeRunner(platform, env) {
  if (platform !== 'linux' || env.DISPLAY) return ''
  const runner = '/usr/bin/xvfb-run'
  return existsSync(runner) ? runner : ''
}

function desktopSmokeRunner(executable, platform, env, smokeArgs) {
  const args = linuxSmokeNoSandboxEnabled(platform, env) ? [...smokeArgs, '--no-sandbox'] : smokeArgs
  const linuxRunner = linuxSmokeRunner(platform, env)
  if (linuxRunner) return { command: linuxRunner, args: ['-a', executable, ...args] }
  // Validate that macOS smoke still targets an app bundle before running its binary directly.
  if (platform === 'darwin') darwinAppBundlePath(executable)
  return { command: executable, args }
}

function linuxSmokeNoSandboxEnabled(platform, env) {
  if (platform !== 'linux') return false
  const override = env.MOVSCRIPT_DESKTOP_SMOKE_NO_SANDBOX?.trim().toLowerCase()
  if (override === '0' || override === 'false' || override === 'no') return false
  if (override === '1' || override === 'true' || override === 'yes') return true
  return env.CI === 'true' || env.GITHUB_ACTIONS === 'true'
}

function darwinAppBundlePath(executable) {
  const normalized = executable.replace(/\\/g, '/')
  const marker = '.app/'
  const index = normalized.indexOf(marker)
  if (index < 0) throw new Error(`Packaged macOS executable is not inside an .app bundle: ${executable}`)
  return executable.slice(0, index + marker.length - 1)
}

function waitForSmokeMarker(markerFile, timeoutMs) {
  if (existsSync(markerFile)) return true
  const deadline = Date.now() + Math.max(0, timeoutMs)
  while (Date.now() < deadline) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100)
    if (existsSync(markerFile)) return true
  }
  return false
}

function stopSmokeLocalBackend(smokeHome) {
  const pid = readSmokeBackendPid(smokeHome)
  if (!pid) return
  terminatePid(pid, 'SIGTERM')
  waitForPidExit(pid, 2_000)
  terminatePid(pid, 'SIGKILL')
  waitForPidExit(pid, 1_000)
}

function readSmokeBackendPid(smokeHome) {
  try {
    const raw = readFileSync(join(smokeHome, 'backend/local-data/movscript-backend.pid'), 'utf8').trim()
    const pid = Number(raw)
    return Number.isInteger(pid) && pid > 0 ? pid : 0
  } catch {
    return 0
  }
}

function terminatePid(pid, signal) {
  try {
    process.kill(pid, signal)
  } catch {
    // The smoke process can exit on its own between the pid read and cleanup.
  }
}

function waitForPidExit(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!isPidRunning(pid)) return true
    sleep(100)
  }
  return !isPidRunning(pid)
}

function isPidRunning(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function executableScore(path, platform) {
  const normalized = path.replace(/\\/g, '/')
  if (platform === 'darwin' && normalized.includes('/mac-arm64/')) return 0
  if (platform === 'darwin' && normalized.includes('/mac/')) return 1
  if (platform === 'linux' && basename(dirname(path)).endsWith('-unpacked')) return 0
  if (platform === 'win32' && basename(dirname(path)) === 'win-unpacked') return 0
  return 5
}

function walk(root, visit) {
  const stack = [root]
  while (stack.length > 0) {
    const current = stack.pop()
    const info = statSync(current)
    visit(current, info)
    if (!info.isDirectory()) continue
    for (const entry of readdirSync(current)) {
      stack.push(resolve(current, entry))
    }
  }
}

function isExecutable(info) {
  return (info.mode & 0o111) !== 0
}

function argValue(args, name) {
  const equalPrefix = `${name}=`
  const equalValue = args.find((arg) => arg.startsWith(equalPrefix))
  if (equalValue) return equalValue.slice(equalPrefix.length)
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

function hasFlag(args, name) {
  return args.includes(name)
}

function normalizeLocalRuntimeDataPlane(value) {
  const raw = String(value || 'local').trim()
  return raw === 'cloud' || raw === 'external' ? raw : 'local'
}
