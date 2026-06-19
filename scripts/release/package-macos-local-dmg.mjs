#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

import { downloadAndStageFFmpegStatic } from './download-ffmpeg-static.mjs'
import {
  isDirectRun,
  parseDesktopArchArg,
  sha256File,
} from './release-common.mjs'
import { prepareDesktopPackage } from './release-workflow.mjs'
import { verifyPackageResources } from './verify-package-resources.mjs'

const repoRoot = resolve(import.meta.dirname, '../..')

if (isDirectRun(import.meta.url)) {
  runPackageMacOSLocalDMGCli(repoRoot, process.env, process.argv.slice(2))
}

export async function runPackageMacOSLocalDMGCli(root = repoRoot, env = process.env, args = [], options = {}) {
  const {
    currentArch = process.arch,
    currentPlatform = process.platform,
    exit = process.exit,
    log = console.log,
    logError = console.error,
  } = options

  try {
    const arch = parseDesktopArchArg(args, currentArch, 'local macOS DMG package')
    if (currentPlatform !== 'darwin') {
      throw new Error(`Local macOS DMG packaging must run on macOS, got ${currentPlatform}. Use the CI release workflow for cross-platform packages.`)
    }
    if (arch !== currentArch && !args.includes('--allow-cross-arch')) {
      throw new Error(`Local macOS DMG smoke testing requires the host arch (${currentArch}); got --arch=${arch}. Pass --allow-cross-arch only when you intentionally skip runnable confidence.`)
    }

    const skipFFmpegDownload = args.includes('--skip-ffmpeg-download')
    const skipSmoke = args.includes('--skip-smoke')
    const frontendRoot = resolve(root, 'apps/frontend')
    const releaseDir = resolve(frontendRoot, 'release')
    const appDir = macAppDirForArch(root, arch)

    log('[package-macos-local-dmg] Verify Electron package resource contract')
    const resourceResult = verifyPackageResources(root)
    log(`[package-macos-local-dmg] Package resources OK (${resourceResult.resources.length} resources)`)

    if (!skipFFmpegDownload) {
      log(`[package-macos-local-dmg] Download and stage ffmpeg-static for darwin ${arch}`)
      const ffmpegResult = await downloadAndStageFFmpegStatic(root, {
        platform: 'darwin',
        arch,
        version: env.MOVSCRIPT_FFMPEG_VERSION?.trim(),
        runCheck: arch === currentArch,
      })
      log(`[package-macos-local-dmg] Staged ffmpeg: ${ffmpegResult.target}`)
    }

    log('[package-macos-local-dmg] Prepare desktop package prerequisites')
    prepareDesktopPackage(root, {
      platform: 'darwin',
      currentPlatform,
      currentArch,
      arch,
      exit: (code = 1) => {
        throw new Error(`prepareDesktopPackage exited with code ${code}`)
      },
      runStep: (stepName, command, commandArgs, stepOptions = {}) => {
        runStep(stepName, command, commandArgs, { cwd: root, ...stepOptions })
      },
    })

    runStep('Build frontend desktop bundle', 'pnpm', ['--filter', '@movscript/desktop', 'build'], { cwd: root })

    rmSync(appDir, { recursive: true, force: true })
    runStep('Build unpacked macOS app', 'pnpm', [
      'exec',
      'electron-builder',
      '--mac',
      'dir',
      `--${arch}`,
      '--publish',
      'never',
      '-c.mac.identity=null',
      '-c.mac.notarize=false',
    ], { cwd: frontendRoot })

    runStep('Clear macOS extended attributes before signing', 'xattr', ['-cr', appDir], { cwd: root })
    await signMacOSAppForLocalTesting(root, appDir)
    runStep('Clear macOS extended attributes after signing', 'xattr', ['-cr', appDir], { cwd: root })
    replaceAppWithCleanCopy(appDir)
    runStep('Verify local app code signature', 'codesign', ['--verify', '--deep', '--strict', '--verbose=2', appDir], { cwd: root })

    if (!skipSmoke) {
      const smokeHome = mkdtempSync(join(tmpdir(), 'movscript-smoke-home.'))
      const smokeEnv = { ...env }
      delete smokeEnv.MOVSCRIPT_BACKEND_BIN
      smokeEnv.MOVSCRIPT_HOME = smokeHome
      smokeEnv.MOVSCRIPT_WORKSPACE_DIR = smokeHome
      smokeEnv.ELECTRON_ENABLE_LOGGING = smokeEnv.ELECTRON_ENABLE_LOGGING ?? '1'
      try {
        runStep('Smoke test local packaged app', 'node', [
          'scripts/release/smoke-desktop-package.mjs',
          '--platform=darwin',
          `--arch=${arch}`,
          `--release-dir=${releaseDir}`,
        ], { cwd: root, env: smokeEnv })
      } finally {
        rmSync(smokeHome, { recursive: true, force: true })
      }
    } else {
      log('[package-macos-local-dmg] Smoke test skipped by --skip-smoke')
    }

    removeDMGArtifacts(releaseDir)
    runStep('Build DMG from signed app', 'pnpm', [
      'exec',
      'electron-builder',
      '--mac',
      'dmg',
      `--${arch}`,
      '--publish',
      'never',
      '-c.mac.identity=null',
      '-c.mac.notarize=false',
      '--prepackaged',
      relativePrepackagedPath(arch),
    ], { cwd: frontendRoot })

    const dmgPath = latestDMG(releaseDir)
    runStep('Verify DMG checksum', 'hdiutil', ['verify', dmgPath], { cwd: root })
    verifyMountedDMG(root, dmgPath, log)

    log(`[package-macos-local-dmg] Done: ${dmgPath}`)
    return { appDir, dmgPath }
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    exit(1)
    return undefined
  }
}

export async function signMacOSAppForLocalTesting(root = repoRoot, appDir = macAppDirForArch(root, process.arch)) {
  const frontendRequire = createRequire(resolve(root, 'apps/frontend/package.json'))
  const { signAsync } = frontendRequire('@electron/osx-sign')
  await signAsync({
    app: appDir,
    identity: '-',
    identityValidation: false,
    preAutoEntitlements: false,
    preEmbedProvisioningProfile: false,
    strictVerify: false,
    ignore: (filePath) => isPackagedFFmpegResource(filePath),
    optionsForFile: () => ({
      entitlements: resolve(root, 'apps/frontend/build/entitlements.mac.plist'),
      hardenedRuntime: true,
      timestamp: 'none',
    }),
  })
}

function isPackagedFFmpegResource(filePath) {
  return filePath.replace(/\\/g, '/').includes('/Contents/Resources/ffmpeg/')
}

function replaceAppWithCleanCopy(appDir) {
  const parent = dirname(appDir)
  const cleanParent = `${parent}.clean-${process.pid}`
  const cleanApp = resolve(cleanParent, basename(appDir))
  rmSync(cleanParent, { recursive: true, force: true })
  try {
    runStep('Create clean macOS app copy', 'ditto', ['--noextattr', '--noacl', appDir, cleanApp], { cwd: parent })
    rmSync(appDir, { recursive: true, force: true })
    runStep('Install clean macOS app copy', 'mv', [cleanApp, appDir], { cwd: parent })
  } finally {
    rmSync(cleanParent, { recursive: true, force: true })
  }
}

function runStep(label, command, commandArgs, options = {}) {
  console.log(`[package-macos-local-dmg] ${label}`)
  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
    ...options,
  })
  if (result.error) throw result.error
  if (result.status !== 0 || result.signal) {
    throw new Error(`${label} failed: status=${result.status ?? 'none'} signal=${result.signal ?? 'none'}`)
  }
}

function removeDMGArtifacts(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile()) continue
    if (entry.name.endsWith('.dmg') || entry.name.endsWith('.dmg.blockmap')) {
      rmSync(resolve(directory, entry.name), { force: true })
    }
  }
}

function latestDMG(directory) {
  const dmgs = readdirSync(directory)
    .filter((name) => name.endsWith('.dmg'))
    .map((name) => resolve(directory, name))
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs)
  if (dmgs.length === 0) throw new Error(`No DMG was created in ${directory}`)
  return dmgs[0]
}

function verifyMountedDMG(root, dmgPath, log = console.log) {
  const iconPath = resolve(root, 'apps/frontend/build/icon.icns')
  const mountPoint = mkdtempSync(join(tmpdir(), 'movscript-dmg.'))
  let attached = false
  try {
    runStep('Attach DMG for mounted app verification', 'hdiutil', [
      'attach',
      '-nobrowse',
      '-readonly',
      '-mountpoint',
      mountPoint,
      dmgPath,
    ], { cwd: root })
    attached = true
    const mountedApp = resolve(mountPoint, 'Movscript.app')
    runStep('Verify mounted app code signature', 'codesign', [
      '--verify',
      '--deep',
      '--strict',
      '--verbose=2',
      mountedApp,
    ], { cwd: root })
    const mountedIcon = resolve(mountedApp, 'Contents/Resources/icon.icns')
    const expectedIconHash = sha256File(iconPath)
    const mountedIconHash = sha256File(mountedIcon)
    if (expectedIconHash !== mountedIconHash) {
      throw new Error(`Mounted app icon hash mismatch: expected ${expectedIconHash}, got ${mountedIconHash}`)
    }
    log(`[package-macos-local-dmg] Mounted app icon OK: ${basename(mountedIcon)}`)
  } finally {
    if (attached) spawnSync('hdiutil', ['detach', mountPoint], { stdio: 'ignore' })
    rmSync(mountPoint, { recursive: true, force: true })
  }
}

function macAppDirForArch(root, arch) {
  return resolve(root, 'apps/frontend/release', arch === 'arm64' ? 'mac-arm64/Movscript.app' : 'mac/Movscript.app')
}

function relativePrepackagedPath(arch) {
  return arch === 'arm64' ? 'release/mac-arm64' : 'release/mac'
}
