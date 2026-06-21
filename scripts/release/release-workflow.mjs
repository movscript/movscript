#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

import {
  desktopFFmpegBinaryName,
  goarchForDesktopArch,
  goosForDesktopPlatform,
  hasDesktopArchArg,
  hasDesktopPlatformArg,
  isDirectRun,
  parseDesktopArchArg,
  parseDesktopPlatformArg,
  resolveDesktopFFmpegPath,
  sha256File,
  verifyDesktopFFmpeg,
  verifyDesktopPackage,
} from './release-common.mjs'

const repoRoot = resolve(import.meta.dirname, '../..')
const releaseCommands = new Map([
  ['audit-ffmpeg', ['scripts/release/audit-ffmpeg.mjs']],
  ['bump-version', ['scripts/release/bump-version.mjs']],
  ['collect', ['builtin:collect']],
  ['download-ffmpeg-static', ['scripts/release/download-ffmpeg-static.mjs']],
  ['package-desktop', ['builtin:package-desktop']],
  ['smoke-desktop-package', ['scripts/release/smoke-desktop-package.mjs']],
  ['stage-ffmpeg', ['scripts/release/stage-ffmpeg.mjs']],
  ['verify-package-resources', ['scripts/release/verify-package-resources.mjs']],
  ['verify-release-readiness', ['scripts/release/verify-release-readiness.mjs']],
])
const isWindows = process.platform === 'win32'
const pnpmCommand = 'pnpm'
const signingModes = new Set(['signed', 'unsigned'])
const prepareDesktopSteps = [
  ['Build workspace packages', pnpmCommand, ['--workspace-concurrency=1', '--filter', './packages/*', 'build']],
  ['Build movcli', pnpmCommand, ['--filter', '@movscript/cli', 'build']],
  ['Build admin app', pnpmCommand, ['--filter', '@movscript/admin', 'build']],
  ['Build provider plugins', pnpmCommand, ['-r', '--filter', './plugins/*', '--if-present', 'build']],
  ['Copy admin assets into backend bundle', 'node', ['apps/backend/scripts/build.mjs', 'copy-admin-assets']],
]
const releaseAssetExtensions = new Set([
  '.dmg',
  '.zip',
  '.exe',
  '.msi',
  '.AppImage',
  '.deb',
  '.rpm',
  '.movpkg',
])

export function releaseWorkflowSteps(mode, args = []) {
  if (mode === 'check') {
    return [
      ['Verify release readiness', 'node', ['scripts/release/release-workflow.mjs', 'verify-release-readiness']],
      ['Build workspace packages', pnpmCommand, ['--workspace-concurrency=1', '--filter', './packages/*', 'build']],
      ['Run workspace typecheck', pnpmCommand, ['run', 'typecheck']],
      ['Run release script tests', 'node', ['scripts/run-node-tests.mjs', 'tests/scripts/release/*.test.mjs']],
      ['Run UI package quality gate', pnpmCommand, ['run', 'quality:ui']],
      ['Verify package resource contract', 'node', ['scripts/release/release-workflow.mjs', 'verify-package-resources']],
    ]
  }
  if (mode === 'full' || mode === 'dry-run') {
    const { packageArgs, targetArgs } = releaseDesktopTargetArgs(args)
    return [
      ['Run release checks', 'node', ['scripts/release/release-workflow.mjs', 'check']],
      ['Download ffmpeg-static release binary', 'node', ['scripts/release/release-workflow.mjs', 'download-ffmpeg-static', ...targetArgs]],
      ['Build desktop package', 'node', ['scripts/release/release-workflow.mjs', 'package-desktop', ...packageArgs]],
      ['Smoke test desktop package', 'node', ['scripts/release/release-workflow.mjs', 'smoke-desktop-package', ...targetArgs]],
      ['Collect release artifacts', 'node', ['scripts/release/release-workflow.mjs', 'collect']],
    ]
  }
  throw new Error(usage())
}

export function releaseSubcommands() {
  return [...releaseCommands.keys()]
}

export function runReleaseWorkflowCli(args = [], options = {}) {
  args = normalizePnpmArgs(args)
  const mode = args[0] ?? 'full'
  const spawn = options.spawn ?? spawnSync
  const log = options.log ?? console.log
  const logError = options.logError ?? console.error
  const exit = options.exit ?? process.exit
  const releaseCommand = releaseCommands.get(mode)
  if (releaseCommand) {
    const [scriptPath, ...defaultArgs] = releaseCommand
    if (scriptPath === 'builtin:package-desktop') {
      runDesktopPackageCli([...defaultArgs, ...args.slice(1)], {
        spawn,
        log,
        logError,
        exit,
        defaults: options.defaults,
        env: options.env,
        node: options.node,
        patchMacOSDMGBuilder: options.patchMacOSDMGBuilder,
        pnpm: options.pnpm,
        preparePackage: options.preparePackage,
        root: options.root,
        verifyMacOSDMG: options.verifyMacOSDMG,
        verifyPackage: options.verifyPackage,
      })
      return
    }
    if (scriptPath === 'builtin:collect') {
      runCollectArtifactsCli(options.root ?? repoRoot, options.env ?? process.env, {
        collect: options.collectArtifacts,
        exit,
        log,
        logError,
      })
      return
    }
    runStep(`Run release command ${mode}`, 'node', [scriptPath, ...defaultArgs, ...args.slice(1)], { spawn, log, logError, exit })
    return
  }

  let steps
  try {
    steps = releaseWorkflowSteps(mode, args.slice(1))
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    exit(2)
    return
  }

  for (const [label, command, commandArgs] of steps) {
    if (!runStep(label, command, commandArgs, { spawn, log, logError, exit })) return
  }
}

function normalizePnpmArgs(args) {
  return args[0] === '--' ? args.slice(1) : args
}

export function frontendBuilderArgsForTarget(platform, arch, explicitArch = true) {
  if (platform === 'darwin') {
    return explicitArch ? ['--mac', 'dmg', `--${arch}`, '--publish', 'never'] : ['--mac', 'dmg', '--publish', 'never']
  }
  if (platform === 'linux') return ['--linux', `--${arch}`, '--publish', 'never']
  if (platform === 'win32') {
    const targetArch = explicitArch && arch === 'arm64' ? '--arm64' : '--x64'
    return ['--win', targetArch, '--publish', 'never']
  }
  throw new Error(`Unsupported desktop package platform: ${platform}`)
}

export function desktopPackagePlan(args = [], defaults = {}) {
  const hasPlatformArg = hasDesktopPlatformArg(args)
  const hasArchArg = hasDesktopArchArg(args)
  const signingMode = parseDesktopSigningModeArg(args, defaults.signingMode)
  if (!hasPlatformArg && !hasArchArg) {
    const platform = defaults.platform ?? process.platform
    return {
      builderArgs: ['--publish', 'never', ...signingBuilderArgsForTarget(platform, signingMode)],
      signingMode,
      targetArgs: [],
    }
  }

  const platform = parseDesktopPlatformArg(args, defaults.platform ?? process.platform, 'desktop package')
  const arch = parseDesktopArchArg(args, defaults.arch ?? process.arch, 'desktop package')
  const targetArgs = [`--platform=${platform}`]
  if (hasArchArg) targetArgs.push(`--arch=${arch}`)
  return {
    builderArgs: [...frontendBuilderArgsForTarget(platform, arch, hasArchArg), ...signingBuilderArgsForTarget(platform, signingMode)],
    signingMode,
    targetArgs,
  }
}

export function parseDesktopSigningModeArg(args = [], defaultMode = process.env.MOVSCRIPT_RELEASE_SIGNING_MODE || 'unsigned') {
  const explicitMode = args.find((arg) => arg.startsWith('--signing-mode='))?.slice('--signing-mode='.length)
  const wantsUnsigned = args.includes('--unsigned')
  const wantsSigned = args.includes('--signed')
  if ([explicitMode, wantsUnsigned ? 'unsigned' : '', wantsSigned ? 'signed' : ''].filter(Boolean).length > 1) {
    throw new Error('Desktop package signing mode must be specified only once')
  }
  const mode = explicitMode || (wantsUnsigned ? 'unsigned' : '') || (wantsSigned ? 'signed' : '') || defaultMode || 'unsigned'
  if (!signingModes.has(mode)) {
    throw new Error(`Unsupported desktop package signing mode: ${mode}`)
  }
  return mode
}

function releaseDesktopTargetArgs(args = []) {
  const plan = desktopPackagePlan(args)
  return {
    packageArgs: [...plan.targetArgs, `--${plan.signingMode}`],
    targetArgs: plan.targetArgs,
  }
}

const unsignedMacOSBuilderArgs = Object.freeze(['-c.mac.identity=null', '-c.mac.notarize=false'])

function signingBuilderArgsForTarget(platform, signingMode) {
  return platform === 'darwin' && signingMode === 'unsigned' ? [...unsignedMacOSBuilderArgs] : []
}

export function runDesktopPackageCli(args = [], options = {}) {
  const pnpm = options.pnpm ?? 'pnpm'
  const spawn = options.spawn ?? spawnSync
  const log = options.log ?? console.log
  const logError = options.logError ?? console.error
  const exit = options.exit ?? process.exit
  let plan
  try {
    plan = desktopPackagePlan(args, options.defaults)
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    exit(1)
    return
  }

  const preparePackage = options.preparePackage ?? prepareDesktopPackage
  const verifyPackage = options.verifyPackage ?? verifyDesktopPackage
  const root = options.root ?? repoRoot
  const target = {
    platform: parseDesktopPlatformArg(plan.targetArgs, options.defaults?.platform ?? process.platform, 'desktop package'),
    currentPlatform: options.defaults?.platform ?? process.platform,
    currentArch: options.defaults?.arch ?? process.arch,
    arch: parseDesktopArchArg(plan.targetArgs, options.defaults?.arch ?? process.arch, 'desktop package'),
    exit,
    signingMode: plan.signingMode,
  }
  log('[package-desktop] Prepare desktop package prerequisites')
  const prepared = preparePackage(root, target)
  if (prepared === false) return

  if (target.platform === 'darwin') {
    try {
      const patchMacOSDMGBuilder = options.patchMacOSDMGBuilder ?? patchDmgBuilderAPFSAliasCompatibility
      patchMacOSDMGBuilder(root, log)
    } catch (error) {
      logError(error instanceof Error ? error.message : String(error))
      exit(1)
      return
    }
  }

  const packageEnv = desktopPackageEnv(options.env ?? process.env, plan.signingMode)
  const steps = [
    ['Build frontend desktop bundle', pnpm, ['--filter', '@movscript/desktop', 'build']],
    ['Build frontend desktop artifact', pnpm, ['--filter', '@movscript/desktop', 'exec', 'electron-builder', ...plan.builderArgs]],
  ]

  for (const [label, command, commandArgs] of steps) {
    log(`[package-desktop] ${label}`)
    const result = spawn(command, commandArgs, {
      stdio: 'inherit',
      env: label === 'Build frontend desktop artifact' ? packageEnv : options.env ?? process.env,
    })
    if (result.error) {
      logError(result.error.message)
      exit(1)
      return
    }
    if (result.status !== 0) {
      exit(result.status ?? 1)
      return
    }
  }

  log('[package-desktop] Verify desktop package')
  const verified = verifyPackage(root, {
    ...target,
    log,
    logError,
  })
  if (verified === false) return

  if (target.platform === 'darwin') {
    try {
      const verifyMacOSDMG = options.verifyMacOSDMG ?? verifyMacOSDMGArtifacts
      verifyMacOSDMG(root, { arch: target.arch, env: packageEnv, log, spawn })
    } catch (error) {
      logError(error instanceof Error ? error.message : String(error))
      exit(1)
    }
  }
}

export function prepareDesktopPackage(root = repoRoot, options = {}) {
  const {
    platform = process.platform,
    currentPlatform = process.platform,
    currentArch = process.arch,
    arch = process.arch,
    nodeVersion = process.version,
    verifyFFmpeg = verifyDesktopFFmpeg,
    resolveFFmpeg = resolveDesktopFFmpegPath,
    runStep = runPrepareStep,
    exit = process.exit,
  } = options
  console.log('[prepare-desktop] Preparing desktop package prerequisites')
  console.log(`[prepare-desktop] Platform: ${platform} ${arch}`)
  console.log(`[prepare-desktop] Node: ${nodeVersion}`)
  console.log(`[prepare-desktop] Repository root: ${root}`)

  const ffmpegPath = resolveFFmpeg(root, platform, arch)
  const runnableOnCurrentMachine = platform === currentPlatform && arch === currentArch
  const ffmpegError = verifyFFmpeg(ffmpegPath, root, undefined, undefined, { arch, runCheck: runnableOnCurrentMachine })
  if (ffmpegError) {
    const crossTarget = !runnableOnCurrentMachine
    const ffmpegBinary = desktopFFmpegBinaryName(platform)
    console.error('[prepare-desktop] Missing desktop ffmpeg prerequisite.')
    console.error(ffmpegError)
    console.error('[prepare-desktop] Stage a redistributable binary with:')
    console.error(`[prepare-desktop]   MOVSCRIPT_FFMPEG_BIN=/path/to/${ffmpegBinary} \\`)
    console.error('[prepare-desktop]   MOVSCRIPT_FFMPEG_SOURCE_URL=$ACTUAL_FFMPEG_RELEASE_URL \\')
    console.error('[prepare-desktop]   MOVSCRIPT_FFMPEG_LICENSE=LGPL-2.1-or-later \\')
    if (crossTarget) {
      console.error("[prepare-desktop]   MOVSCRIPT_FFMPEG_VERSION='ffmpeg version ...' \\")
    }
    console.error(`[prepare-desktop]   pnpm run release -- stage-ffmpeg --platform=${platform} --arch=${arch}`)
    exit(1)
    return false
  }

  const buildEnv = {
    ...process.env,
    GOOS: goosForDesktopPlatform(platform),
    GOARCH: goarchForDesktopArch(arch),
  }
  const targetSteps = [
    ...prepareDesktopSteps.slice(0, 4),
    ['Build backend binary', pnpmCommand, ['--filter', '@movscript/backend', 'build'], { env: buildEnv }],
    ...prepareDesktopSteps.slice(4),
  ]

  for (const [stepName, command, commandArgs, stepOptions = {}] of targetSteps) {
    runStep(stepName, command, commandArgs, { cwd: root, ...stepOptions })
  }

  console.log('[prepare-desktop] Desktop package prerequisites are ready')
  return true
}

export function runPrepareStep(stepName, command, args, options = {}) {
  const startedAt = Date.now()
  console.log(`[prepare-desktop] Starting: ${stepName}`)
  console.log(`[prepare-desktop] Command: ${command} ${args.join(' ')}`)

  const { cwd = repoRoot, ...spawnOptions } = options
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: process.env,
    shell: isWindows,
    ...spawnOptions,
  })

  const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1)

  if (result.error) {
    console.error(`[prepare-desktop] Failed to start: ${stepName}`)
    console.error(`[prepare-desktop] Error: ${result.error.message}`)
    console.error(`[prepare-desktop] Code: ${result.error.code ?? 'unknown'}`)
    process.exit(1)
  }

  if (result.status !== 0 || result.signal) {
    console.error(`[prepare-desktop] Failed: ${stepName}`)
    console.error(`[prepare-desktop] Exit status: ${result.status ?? 'none'}`)
    console.error(`[prepare-desktop] Signal: ${result.signal ?? 'none'}`)
    console.error(`[prepare-desktop] Elapsed: ${elapsedSeconds}s`)
    process.exit(result.status ?? 1)
  }

  console.log(`[prepare-desktop] Finished: ${stepName} (${elapsedSeconds}s)`)
}

export function runCollectArtifactsCli(root = repoRoot, env = process.env, options = {}) {
  const {
    collect = collectArtifacts,
    exit = process.exit,
    log = console.log,
    logError = console.error,
  } = options
  try {
    const result = collect(root, { env })
    log(`Collected ${result.copied.length} release artifact(s) in ${result.outputDir}`)
    for (const path of result.copied) log(`- ${path}`)
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    exit(1)
  }
}

export function collectArtifacts(root = repoRoot, options = {}) {
  const {
    env = process.env,
    outputDir = resolve(root, 'release-artifacts'),
    sources = defaultArtifactSources(root, env),
    artifactPrefix = normalizeArtifactPrefix(env.MOVSCRIPT_ARTIFACT_PREFIX?.trim() || ''),
  } = options

  rmSync(outputDir, { recursive: true, force: true })
  mkdirSync(outputDir, { recursive: true })

  const seen = new Map()
  const copied = []
  for (const source of sources) {
    if (!existsSync(source)) continue
    for (const name of readdirSync(source)) {
      if (!isReleaseAsset(name)) continue
      const from = resolve(source, name)
      if (!statSync(from).isFile()) continue
      const targetName = artifactPrefix ? `${artifactPrefix}-${basename(name)}` : basename(name)
      const previous = seen.get(targetName)
      if (previous) {
        throw new Error([
          `Duplicate release artifact name: ${targetName}`,
          `First: ${previous}`,
          `Second: ${from}`,
        ].join('\n'))
      }
      seen.set(targetName, from)
      const to = resolve(outputDir, targetName)
      copyFileSync(from, to)
      copied.push(to)
    }
  }

  if (copied.length === 0) {
    throw new Error('No release artifacts were collected.')
  }

  const lines = copied
    .sort()
    .map((path) => `${sha256(path)}  ${basename(path)}`)
  const checksumPath = resolve(outputDir, artifactPrefix ? `${artifactPrefix}-SHA256SUMS.txt` : 'SHA256SUMS.txt')
  writeFileSync(checksumPath, `${lines.join('\n')}\n`, 'utf8')

  return { copied, checksumPath, outputDir }
}

export function defaultArtifactSources(root = repoRoot, env = process.env) {
  return [
    resolve(root, 'apps/frontend/release'),
  ]
}

export function isReleaseAsset(name) {
  if (name.endsWith('.blockmap')) return false
  if ((name.endsWith('.yml') || name.endsWith('.yaml')) && name.startsWith('latest')) return true
  for (const ext of releaseAssetExtensions) {
    if (name.endsWith(ext)) return true
  }
  return false
}

export function normalizeArtifactPrefix(value) {
  if (!value) return ''
  if (!/^[A-Za-z0-9._-]+$/.test(value)) {
    throw new Error('MOVSCRIPT_ARTIFACT_PREFIX may only contain letters, numbers, dot, underscore, and dash')
  }
  if (value === '.' || value === '..' || value.includes('..')) {
    throw new Error('MOVSCRIPT_ARTIFACT_PREFIX must not contain path traversal segments')
  }
  return value
}

export function sha256(path) {
  return sha256File(path)
}

export function dmgBuilderEnv(env) {
  const nextEnv = { ...env }
  normalizeOptionalBuilderEnv(nextEnv, 'PYTHON_PATH')
  normalizeOptionalBuilderEnv(nextEnv, 'CSC_LINK')
  normalizeOptionalBuilderEnv(nextEnv, 'CSC_NAME')
  normalizeOptionalBuilderEnv(nextEnv, 'CSC_KEY_PASSWORD')
  normalizeOptionalBuilderEnv(nextEnv, 'CSC_INSTALLER_LINK')
  normalizeOptionalBuilderEnv(nextEnv, 'CSC_INSTALLER_KEY_PASSWORD')
  normalizeOptionalBuilderEnv(nextEnv, 'CSC_KEYCHAIN')
  normalizeOptionalBuilderEnv(nextEnv, 'APPLE_ID')
  normalizeOptionalBuilderEnv(nextEnv, 'APPLE_APP_SPECIFIC_PASSWORD')
  normalizeOptionalBuilderEnv(nextEnv, 'APPLE_TEAM_ID')
  normalizeOptionalBuilderEnv(nextEnv, 'APPLE_API_KEY')
  normalizeOptionalBuilderEnv(nextEnv, 'APPLE_API_KEY_ID')
  normalizeOptionalBuilderEnv(nextEnv, 'APPLE_API_ISSUER')
  normalizeOptionalBuilderEnv(nextEnv, 'APPLE_KEYCHAIN')
  normalizeOptionalBuilderEnv(nextEnv, 'APPLE_KEYCHAIN_PROFILE')
  return nextEnv
}

export function desktopPackageEnv(env = process.env, signingMode = parseDesktopSigningModeArg([])) {
  const nextEnv = dmgBuilderEnv(env)
  nextEnv.MOVSCRIPT_RELEASE_SIGNING_MODE = signingMode
  if (signingMode === 'unsigned') {
    for (const name of [
      'CSC_LINK',
      'CSC_NAME',
      'CSC_KEY_PASSWORD',
      'CSC_INSTALLER_LINK',
      'CSC_INSTALLER_KEY_PASSWORD',
      'CSC_KEYCHAIN',
      'APPLE_ID',
      'APPLE_APP_SPECIFIC_PASSWORD',
      'APPLE_TEAM_ID',
      'APPLE_API_KEY',
      'APPLE_API_KEY_ID',
      'APPLE_API_ISSUER',
      'APPLE_KEYCHAIN',
      'APPLE_KEYCHAIN_PROFILE',
    ]) {
      delete nextEnv[name]
    }
    nextEnv.CSC_IDENTITY_AUTO_DISCOVERY = 'false'
  }
  return nextEnv
}

function normalizeOptionalBuilderEnv(env, name) {
  const value = typeof env[name] === 'string' ? env[name].trim() : ''
  if (value) {
    env[name] = value
  } else {
    delete env[name]
  }
}

export function patchDmgBuilderAPFSAliasCompatibility(root = repoRoot, log = console.log) {
  const corePath = resolveDmgBuilderCorePath(root)
  const source = readFileSync(corePath, 'utf8')
  const original = [
    '    elif background_file:',
    '      alias = Alias.for_file(background_file)',
    '      background_bmk = Bookmark.for_file(background_file)',
    '',
    "      icvp['backgroundType'] = 2",
    "      icvp['backgroundImageAlias'] = biplist.Data(alias.to_bytes())",
  ].join('\n')
  const patched = [
    '    elif background_file:',
    '      background_bmk = Bookmark.for_file(background_file)',
    '',
    "      icvp['backgroundType'] = 2",
    '      try:',
    '        alias = Alias.for_file(background_file)',
    "        icvp['backgroundImageAlias'] = biplist.Data(alias.to_bytes())",
    '      except Exception:',
    '        pass',
  ].join('\n')
  if (source.includes(patched)) return
  if (!source.includes(original)) {
    throw new Error(`Unable to patch dmg-builder APFS alias compatibility: unexpected core.py at ${corePath}`)
  }
  writeFileSync(corePath, source.replace(original, patched), 'utf8')
  log(`[package-desktop] Patched dmg-builder APFS background alias compatibility: ${corePath}`)
}

export function verifyMacOSDMGArtifacts(root = repoRoot, options = {}) {
  const {
    env = process.env,
    log = console.log,
    spawn = spawnSync,
  } = options
  const releaseDir = resolve(root, 'apps/frontend/release')
  const dmgPath = latestDMG(releaseDir)
  runCheckedTool('Verify DMG checksum', 'hdiutil', ['verify', dmgPath], { cwd: root, log, spawn })
  verifyMountedDMG(root, dmgPath, { env, log, spawn })
}

function resolveDmgBuilderCorePath(root) {
  const frontendRequire = createRequire(resolve(root, 'apps/frontend/package.json'))
  const electronBuilderPackagePath = frontendRequire.resolve('electron-builder/package.json')
  const electronBuilderRequire = createRequire(electronBuilderPackagePath)
  const dmgBuilderPackagePath = electronBuilderRequire.resolve('dmg-builder/package.json')
  return resolve(dirname(dmgBuilderPackagePath), 'vendor/dmgbuild/core.py')
}

function latestDMG(directory) {
  const dmgs = readdirSync(directory)
    .filter((name) => name.endsWith('.dmg'))
    .map((name) => resolve(directory, name))
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs)
  if (dmgs.length === 0) throw new Error(`No DMG was created in ${directory}`)
  return dmgs[0]
}

function verifyMountedDMG(root, dmgPath, options = {}) {
  const {
    env = process.env,
    log = console.log,
    spawn = spawnSync,
  } = options
  const iconPath = resolve(root, 'apps/frontend/build/icon.icns')
  const mountPoint = mkdtempSync(join(tmpdir(), 'movscript-dmg.'))
  let attached = false
  try {
    runCheckedTool('Attach DMG for mounted app verification', 'hdiutil', [
      'attach',
      '-nobrowse',
      '-readonly',
      '-mountpoint',
      mountPoint,
      dmgPath,
    ], { cwd: root, log, spawn })
    attached = true
    const mountedApp = resolve(mountPoint, 'Movscript.app')
    const signatureResult = runCheckedTool('Verify mounted app code signature', 'codesign', [
      '--verify',
      '--deep',
      '--strict',
      '--verbose=2',
      mountedApp,
    ], { allowFailure: true, cwd: root, log, spawn })
    if (signatureResult.status !== 0 || signatureResult.signal || signatureResult.error) {
      if (macOSSigningRequired(env)) {
        throw new Error(`Verify mounted app code signature failed: status=${signatureResult.status ?? 'none'} signal=${signatureResult.signal ?? 'none'}`)
      }
      log('[package-desktop] Mounted app code signature verification skipped because release signing is not configured')
    }
    const mountedIcon = resolve(mountedApp, 'Contents/Resources/icon.icns')
    const expectedIconHash = sha256File(iconPath)
    const mountedIconHash = sha256File(mountedIcon)
    if (expectedIconHash !== mountedIconHash) {
      throw new Error(`Mounted app icon hash mismatch: expected ${expectedIconHash}, got ${mountedIconHash}`)
    }
    log(`[package-desktop] Mounted app icon OK: ${basename(mountedIcon)}`)
  } finally {
    if (attached) spawn('hdiutil', ['detach', mountPoint], { stdio: 'ignore' })
    rmSync(mountPoint, { recursive: true, force: true })
  }
}

function runCheckedTool(label, command, args, options = {}) {
  const {
    allowFailure = false,
    cwd = repoRoot,
    log = console.log,
    spawn = spawnSync,
  } = options
  log(`[package-desktop] ${label}`)
  const result = spawn(command, args, {
    cwd,
    stdio: 'inherit',
    shell: isWindows,
  })
  if (result.error && !allowFailure) throw result.error
  if (!allowFailure && (result.status !== 0 || result.signal)) {
    throw new Error(`${label} failed: status=${result.status ?? 'none'} signal=${result.signal ?? 'none'}`)
  }
  return result
}

function macOSSigningRequired(env) {
  if (env.MOVSCRIPT_RELEASE_SIGNING_MODE === 'unsigned') return false
  if (env.MOVSCRIPT_RELEASE_SIGNING_MODE === 'signed') return true
  return env.MOVSCRIPT_RELEASE_REQUIRE_SIGNING === '1' ||
    Boolean(env.CSC_LINK?.trim()) ||
    Boolean(env.CSC_NAME?.trim())
}

function runStep(label, command, commandArgs, { spawn, log, logError, exit }) {
  log(`[release-workflow] ${label}`)
  const result = spawn(command, commandArgs, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (result.error) {
    logError(result.error.message)
    exit(1)
    return false
  }
  if (result.status !== 0) {
    exit(result.status ?? 1)
    return false
  }
  return true
}

function usage() {
  return `usage: node scripts/release/release-workflow.mjs [check|full|dry-run|${releaseSubcommands().join('|')}]`
}

if (isDirectRun(import.meta.url, process.argv)) {
  runReleaseWorkflowCli(process.argv.slice(2))
}
