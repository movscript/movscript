import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  desktopArchs,
  desktopPlatforms,
  ffmpegStaticBinaryUrl,
  isDirectRun,
  isDesktopReleaseTarget,
  parseDesktopArchArg,
  parseDesktopArchsArg,
  parseDesktopPlatformsArg,
  resolveDesktopFFmpegPath,
  verifyDesktopFFmpeg,
  verifyDesktopFFmpegMetadata,
} from './release-common.mjs'

const repoRoot = resolve(import.meta.dirname, '../..')

if (isDirectRun(import.meta.url)) {
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
      platforms: parseDesktopPlatformsArg(args, currentPlatform, 'ffmpeg audit'),
      archs: parseDesktopArchsArg(args, currentArch, 'ffmpeg audit'),
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

  const includeOnlyDefaultReleaseTargets = platforms.length > 1 && archs.length > 1
  const entries = platforms.flatMap((platform) =>
    archs
      .filter((arch) => !includeOnlyDefaultReleaseTargets || isDesktopReleaseTarget(platform, arch))
      .map((arch) => {
        const binaryPath = resolveFFmpeg(root, platform, arch)
        const errors = []
        let runnableChecked = false
        const stagingCommand = buildFFmpegStagingCommand(platform, arch, {
          currentPlatform,
          currentArch,
        })

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
          stagingCommand,
        }
      }),
  )

  return {
    ok: entries.every((entry) => entry.ok),
    entries,
  }
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
    if (!entry.ok && entry.stagingCommand) {
      write(`  stage with: ${entry.stagingCommand}`)
    }
  }
  if (result.ok) {
    log('ffmpeg desktop audit passed.')
  } else {
    logError('ffmpeg desktop audit failed.')
  }
}

export function buildFFmpegStagingCommand(platform, arch, options = {}) {
  void options
  ffmpegStaticBinaryUrl(platform, arch)
  return `pnpm run release -- download-ffmpeg-static --platform=${platform} --arch=${arch}`
}
