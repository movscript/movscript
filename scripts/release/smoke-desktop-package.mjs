#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs'
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
    platform = process.platform,
    releaseDir = resolve(root, 'apps/frontend/release'),
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
  const markerFile = `${userDataDir}.marker`
  const smokeArgs = ['--movscript-desktop-smoke-test', `--user-data-dir=${userDataDir}`]
  const runner = desktopSmokeRunner(executable, platform, env, smokeArgs)
  let result
  try {
    result = spawn(runner.command, runner.args, {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...env,
        ELECTRON_ENABLE_LOGGING: env.ELECTRON_ENABLE_LOGGING ?? '1',
        MOVSCRIPT_DESKTOP_SMOKE_MARKER_FILE: markerFile,
        MOVSCRIPT_DESKTOP_SMOKE_TEST: '1',
        MOVSCRIPT_DESKTOP_SMOKE_USER_DATA_DIR: userDataDir,
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
  } finally {
    if (!providedUserDataDir) rmSync(userDataDir, { recursive: true, force: true })
    rmSync(markerFile, { force: true })
  }

  return { executable, skipped: false }
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
