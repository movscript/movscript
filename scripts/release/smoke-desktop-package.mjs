#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
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

  const providedUserDataDir = env.MOVSCRIPT_DESKTOP_SMOKE_USER_DATA_DIR?.trim()
  const userDataDir = providedUserDataDir || mkdtempSync(join(tmpdir(), 'movscript-electron-user-data.'))
  const providedSmokeHome = env.MOVSCRIPT_HOME?.trim() || env.MOVSCRIPT_WORKSPACE_DIR?.trim()
  const smokeHome = providedSmokeHome || mkdtempSync(join(tmpdir(), 'movscript-smoke-home.'))
  const markerFile = `${userDataDir}.marker`
  const dataPlane = normalizeLocalRuntimeDataPlane(localRuntimeDataPlane)
  const smokeArgs = ['--movscript-desktop-smoke-test', `--user-data-dir=${userDataDir}`]
  const runner = desktopSmokeRunner(executable, platform, env, smokeArgs)
  const movscriptCLI = localRuntime ? findPackagedMovscriptCLI(releaseDir, platform) : ''
  if (localRuntime && !movscriptCLI) {
    throw new Error(`No packaged movscript daemon CLI found in ${releaseDir}`)
  }
  let result
  try {
    result = spawn(runner.command, runner.args, {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...env,
        ELECTRON_ENABLE_LOGGING: env.ELECTRON_ENABLE_LOGGING ?? '1',
        MOVSCRIPT_HOME: env.MOVSCRIPT_HOME?.trim() || smokeHome,
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
      assertPackagedLocalRuntimeReady(movscriptCLI, smokeHome, dataPlane, spawn)
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

function assertPackagedLocalRuntimeReady(movscriptCLI, smokeHome, dataPlane, spawn) {
  const status = runPackagedDaemonCommand(movscriptCLI, smokeHome, ['daemon', 'status'], spawn)
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
  return JSON.parse(String(result.stdout ?? '{}'))
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
    if (normalized.includes('/linux') && normalized.includes('-unpacked/') && /^movscript$/i.test(name) && isExecutable(info)) {
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
  const linuxRunner = linuxSmokeRunner(platform, env)
  if (linuxRunner) return { command: linuxRunner, args: ['-a', executable, ...smokeArgs] }
  if (platform === 'darwin') {
    return {
      command: '/usr/bin/open',
      args: ['-W', '-n', darwinAppBundlePath(executable), '--args', ...smokeArgs],
    }
  }
  return { command: executable, args: smokeArgs }
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
