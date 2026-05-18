#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'

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
const releaseCommands = loadReleaseCommands()
const isWindows = process.platform === 'win32'
const pnpmCommand = 'pnpm'
const prepareDesktopSteps = [
  ['Build workspace packages', pnpmCommand, ['--filter', './packages/*', 'build']],
  ['Build admin app', pnpmCommand, ['--filter', 'movscript-admin', 'build']],
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

export function releaseWorkflowSteps(mode) {
  if (mode === 'check') {
    return [
      ['Verify script inventory', 'pnpm', ['run', 'verify:scripts']],
      ['Audit desktop ffmpeg matrix', 'node', ['scripts/release/release-workflow.mjs', 'audit-ffmpeg', '--all', '--all-archs']],
      ['Run automation script tests', 'pnpm', ['run', 'test:scripts']],
      ['Run workspace tests', 'pnpm', ['run', 'test']],
      ['Run workspace typecheck', 'pnpm', ['run', 'typecheck']],
    ]
  }
  if (mode === 'full') {
    return [
      ['Run release checks', 'node', ['scripts/release/release-workflow.mjs', 'check']],
      ['Build desktop package', 'node', ['scripts/release/release-workflow.mjs', 'package-desktop']],
      ['Build workspace packages', 'pnpm', ['--filter', './packages/*', 'build']],
      ['Build plugins', 'pnpm', ['--filter', './plugins/*', 'build']],
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
        node: options.node,
        pnpm: options.pnpm,
        preparePackage: options.preparePackage,
        root: options.root,
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
    steps = releaseWorkflowSteps(mode)
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

function loadReleaseCommands() {
  const surfacesPath = new URL('../script-surfaces.json', import.meta.url)
  const surfaces = JSON.parse(readFileSync(surfacesPath, 'utf8'))
  const commands = surfaces.releaseSubcommands
  if (!commands || typeof commands !== 'object' || Array.isArray(commands)) {
    throw new Error('scripts/script-surfaces.json releaseSubcommands must be an object')
  }
  return new Map(Object.entries(commands).map(([name, commandArgs]) => {
    if (!Array.isArray(commandArgs) || commandArgs.length === 0 || commandArgs.some((value) => typeof value !== 'string' || value.length === 0)) {
      throw new Error(`scripts/script-surfaces.json releaseSubcommands.${name} must be a non-empty string array`)
    }
    return [name, commandArgs]
  }))
}

export function frontendBuilderArgsForTarget(platform, arch, explicitArch = true) {
  if (platform === 'darwin') {
    return explicitArch ? ['--mac', `--${arch}`, '--publish', 'never'] : ['--mac', '--publish', 'never']
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
  if (!hasPlatformArg && !hasArchArg) {
    return {
      builderArgs: ['--publish', 'never'],
      targetArgs: [],
    }
  }

  const platform = parseDesktopPlatformArg(args, defaults.platform ?? process.platform, 'desktop package')
  const arch = parseDesktopArchArg(args, defaults.arch ?? process.arch, 'desktop package')
  const targetArgs = [`--platform=${platform}`]
  if (hasArchArg) targetArgs.push(`--arch=${arch}`)
  return {
    builderArgs: frontendBuilderArgsForTarget(platform, arch, hasArchArg),
    targetArgs,
  }
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
  const target = {
    platform: parseDesktopPlatformArg(plan.targetArgs, options.defaults?.platform ?? process.platform, 'desktop package'),
    currentPlatform: options.defaults?.platform ?? process.platform,
    currentArch: options.defaults?.arch ?? process.arch,
    arch: parseDesktopArchArg(plan.targetArgs, options.defaults?.arch ?? process.arch, 'desktop package'),
    exit,
  }
  log('[package-desktop] Prepare desktop package prerequisites')
  const prepared = preparePackage(options.root ?? repoRoot, target)
  if (prepared === false) return

  const steps = [
    ['Build frontend desktop bundle', pnpm, ['--filter', 'movscript-frontend', 'build']],
    ['Build frontend desktop artifact', pnpm, ['--filter', 'movscript-frontend', 'exec', 'electron-builder', ...plan.builderArgs]],
  ]

  for (const [label, command, commandArgs] of steps) {
    log(`[package-desktop] ${label}`)
    const result = spawn(command, commandArgs, { stdio: 'inherit' })
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
  verifyPackage(options.root ?? repoRoot, {
    ...target,
    log,
    logError,
  })
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
    ...prepareDesktopSteps.slice(0, 2),
    ['Build backend binary', pnpmCommand, ['--filter', 'movscript-backend', 'build'], { env: buildEnv }],
    ...prepareDesktopSteps.slice(2),
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
    ...(env.MOVSCRIPT_COLLECT_PLUGINS === '0' ? [] : [
      resolve(root, 'plugins/image-generator/dist'),
      resolve(root, 'plugins/video-generator/dist'),
    ]),
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
  return `usage: node scripts/release/release-workflow.mjs [check|full|${releaseSubcommands().join('|')}]`
}

if (isDirectRun(import.meta.url, process.argv)) {
  runReleaseWorkflowCli(process.argv.slice(2))
}
