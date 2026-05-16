import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { resolveDesktopFFmpegPath, verifyDesktopFFmpeg, verifyDesktopFFmpegMetadata } from './verify-desktop-package.mjs'

const repoRoot = resolve(import.meta.dirname, '../..')
const desktopPlatforms = ['darwin', 'linux', 'win32']
const desktopArchs = ['x64', 'arm64']

if (isDirectRun()) {
  runFFmpegAuditCli(repoRoot, process.argv.slice(2))
}

export function runFFmpegAuditCli(root = repoRoot, args = [], options = {}) {
  const {
    currentPlatform = process.platform,
    currentArch = process.arch,
    audit = auditDesktopFFmpeg,
    exit = process.exit,
    log = console.log,
    logError = console.error,
    print = printFFmpegAudit,
  } = options
  try {
    const result = audit(root, {
      platforms: parsePlatforms(args, currentPlatform),
      archs: parseDesktopArchs(args, currentArch),
      currentPlatform,
      currentArch,
    })
    print(result, log, logError)
    if (!result.ok) exit(1)
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    exit(1)
  }
}

export function auditDesktopFFmpeg(root = repoRoot, options = {}) {
  const {
    currentPlatform = process.platform,
    currentArch = process.arch,
    archs = [currentArch],
    platforms = [currentPlatform],
    resolveFFmpeg = resolveDesktopFFmpegPath,
    verifyRunnable = verifyDesktopFFmpeg,
    verifyMetadata = verifyDesktopFFmpegMetadata,
  } = options

  const entries = platforms.flatMap((platform) => archs.map((arch) => {
    const binaryPath = resolveFFmpeg(root, platform, arch)
    const errors = []
    let runnableChecked = false

    if (!existsSync(binaryPath)) {
      errors.push(`missing binary: ${binaryPath}`)
    } else {
      const metadataError = verifyMetadata(binaryPath, { arch })
      if (metadataError) errors.push(metadataError)
      if (!metadataError && platform === currentPlatform && arch === currentArch) {
        runnableChecked = true
        const runnableError = verifyRunnable(binaryPath, root, undefined, undefined, { arch })
        if (runnableError) errors.push(runnableError)
      }
    }

    return {
      platform,
      arch,
      binaryPath,
      runnableChecked,
      ok: errors.length === 0,
      errors,
    }
  }))

  return {
    ok: entries.every((entry) => entry.ok),
    entries,
  }
}

export function parsePlatforms(args = [], currentPlatform = process.platform) {
  if (args.includes('--all')) return desktopPlatforms
  const platformArg = args.find((arg) => arg.startsWith('--platform='))
  if (!platformArg) return [currentPlatform]
  const platform = platformArg.slice('--platform='.length)
  if (!desktopPlatforms.includes(platform)) {
    throw new Error(`Unsupported ffmpeg audit platform: ${platform}`)
  }
  return [platform]
}

export function parseDesktopArchs(args = [], currentArch = process.arch) {
  if (args.includes('--all-archs') || args.includes('--matrix')) return desktopArchs
  const arch = parseDesktopArch(args, currentArch)
  return [arch]
}

export function parseDesktopArch(args = [], currentArch = process.arch) {
  const archArg = args.find((arg) => arg.startsWith('--arch='))
  if (!archArg) return currentArch
  const arch = archArg.slice('--arch='.length)
  if (!['x64', 'arm64'].includes(arch)) {
    throw new Error(`Unsupported ffmpeg audit arch: ${arch}`)
  }
  return arch
}

export function printFFmpegAudit(result, log = console.log, logError = console.error) {
  for (const entry of result.entries) {
    const label = entry.ok ? 'OK' : 'FAIL'
    const write = entry.ok ? log : logError
    write(`${label} ${entry.platform} ${entry.arch ?? 'unknown'}: ${entry.binaryPath}`)
    if (entry.runnableChecked) write(`  runnable: checked with -version`)
    for (const error of entry.errors) {
      write(`  - ${error}`)
    }
  }
  if (result.ok) {
    log('ffmpeg desktop audit passed.')
  } else {
    logError('ffmpeg desktop audit failed.')
  }
}

function isDirectRun() {
  return process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
}
