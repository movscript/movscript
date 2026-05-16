import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveDesktopFFmpegPath, verifyDesktopFFmpeg } from './verify-desktop-package.mjs'

const repoRoot = resolve(import.meta.dirname, '../..')
const isWindows = process.platform === 'win32'
const pnpmCommand = 'pnpm'

const steps = [
  ['Build workspace packages', pnpmCommand, ['run', 'build:packages']],
  ['Build admin app', pnpmCommand, ['run', 'build:admin']],
  ['Copy admin assets into backend bundle', 'node', ['scripts/release/copy-admin-assets.mjs']],
]

if (isDirectRun()) {
  runPrepareDesktopPackageCli(repoRoot, process.argv.slice(2))
}

export function runPrepareDesktopPackageCli(root = repoRoot, args = [], options = {}) {
  const {
    currentPlatform = process.platform,
    currentArch = process.arch,
    exit = process.exit,
    logError = console.error,
    prepare = prepareDesktopPackage,
  } = options
  try {
    prepare(root, {
      platform: parseDesktopPlatform(args, currentPlatform),
      currentPlatform,
      currentArch,
      arch: parseDesktopArch(args, currentArch),
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    exit(1)
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
    runStep = run,
    exit = process.exit,
  } = options
  console.log('[prepare-desktop] Preparing desktop package prerequisites')
  console.log(`[prepare-desktop] Platform: ${platform} ${arch}`)
  console.log(`[prepare-desktop] Node: ${nodeVersion}`)
  console.log(`[prepare-desktop] Repository root: ${root}`)

  const ffmpegPath = resolveFFmpeg(root, platform, arch)
  const ffmpegError = verifyFFmpeg(ffmpegPath, root, undefined, undefined, { arch })
  if (ffmpegError) {
    const crossTarget = platform !== currentPlatform || arch !== currentArch
    const ffmpegBinary = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
    console.error('[prepare-desktop] Missing desktop ffmpeg prerequisite.')
    console.error(ffmpegError)
    console.error('[prepare-desktop] Stage a redistributable binary with:')
    console.error(`[prepare-desktop]   MOVSCRIPT_FFMPEG_BIN=/path/to/${ffmpegBinary} \\`)
    console.error('[prepare-desktop]   MOVSCRIPT_FFMPEG_SOURCE_URL=$ACTUAL_FFMPEG_RELEASE_URL \\')
    console.error('[prepare-desktop]   MOVSCRIPT_FFMPEG_LICENSE=LGPL-2.1-or-later \\')
    if (crossTarget) {
      console.error("[prepare-desktop]   MOVSCRIPT_FFMPEG_VERSION='ffmpeg version ...' \\")
    }
    console.error(`[prepare-desktop]   pnpm run release:stage-ffmpeg -- --platform=${platform} --arch=${arch}`)
    exit(1)
    return
  }

  const buildEnv = {
    ...process.env,
    GOOS: goosForDesktopPlatform(platform),
    GOARCH: goarchForDesktopArch(arch),
  }
  const targetSteps = [
    ...steps.slice(0, 2),
    ['Build backend binary', pnpmCommand, ['run', 'build:backend'], { env: buildEnv }],
    ...steps.slice(2),
  ]

  for (const [stepName, command, args, stepOptions = {}] of targetSteps) {
    runStep(stepName, command, args, { cwd: root, ...stepOptions })
  }

  console.log('[prepare-desktop] Desktop package prerequisites are ready')
}

export function run(stepName, command, args, options = {}) {
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

export function parseDesktopPlatform(args = [], currentPlatform = process.platform) {
  const platformArg = args.find((arg) => arg.startsWith('--platform='))
  if (!platformArg) return currentPlatform
  const platform = platformArg.slice('--platform='.length)
  if (!['darwin', 'linux', 'win32'].includes(platform)) {
    throw new Error(`Unsupported desktop package platform: ${platform}`)
  }
  return platform
}

export function parseDesktopArch(args = [], currentArch = process.arch) {
  const archArg = args.find((arg) => arg.startsWith('--arch='))
  if (!archArg) return currentArch
  const arch = archArg.slice('--arch='.length)
  if (!['x64', 'arm64'].includes(arch)) {
    throw new Error(`Unsupported desktop package arch: ${arch}`)
  }
  return arch
}

export function goosForDesktopPlatform(platform) {
  if (platform === 'win32') return 'windows'
  return platform
}

export function goarchForDesktopArch(arch) {
  if (arch === 'x64') return 'amd64'
  return arch
}

function isDirectRun() {
  return process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
}
