import { spawnSync } from 'node:child_process'
import { copyFileSync, createWriteStream, chmodSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { get as httpsGet } from 'node:https'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { createGunzip } from 'node:zlib'

import {
  desktopReleaseTargets,
  ffmpegStaticDefaultVersion,
  ffmpegStaticReleaseTag,
  ffmpegStaticSourcePlan,
  isDirectRun,
  isFFmpegVersionLine,
  parseDesktopArchArg,
  parseDesktopPlatformArg,
  resolveDesktopFFmpegPath,
  sha256File,
} from './release-common.mjs'
import { readFFmpegVersion, stageFFmpegBinary } from './stage-ffmpeg.mjs'

const repoRoot = resolve(import.meta.dirname, '../..')

if (isDirectRun(import.meta.url)) {
  runDownloadFFmpegStaticCli(repoRoot, process.env, process.argv.slice(2))
}

export async function runDownloadFFmpegStaticCli(root = repoRoot, env = process.env, args = [], options = {}) {
  const {
    currentPlatform = process.platform,
    currentArch = process.arch,
    exit = process.exit,
    log = console.log,
    logError = console.error,
    downloadAndStage = downloadAndStageFFmpegStatic,
  } = options
  try {
    const tag = parseFFmpegStaticTag(args, env.MOVSCRIPT_FFMPEG_STATIC_TAG || ffmpegStaticReleaseTag)
    if (args.includes('--matrix')) {
      for (const target of desktopReleaseTargets) {
        const runnableOnCurrentMachine = target.platform === currentPlatform && target.arch === currentArch
        const result = await downloadAndStage(root, {
          platform: target.platform,
          arch: target.arch,
          tag,
          version: env.MOVSCRIPT_FFMPEG_VERSION?.trim() || ffmpegStaticDefaultVersion,
          runCheck: runnableOnCurrentMachine,
        })
        log(`Downloaded ffmpeg-static ${result.tag} for ${target.platform} ${target.arch}: ${result.sourceUrl}`)
        log(`Staged ffmpeg for ${target.platform} ${target.arch}: ${result.target}`)
      }
      return
    }
    const platform = parseDesktopPlatformArg(args, env.MOVSCRIPT_FFMPEG_PLATFORM || currentPlatform, 'ffmpeg-static download')
    const arch = parseDesktopArchArg(args, env.MOVSCRIPT_FFMPEG_ARCH || currentArch, 'ffmpeg-static download')
    const version = env.MOVSCRIPT_FFMPEG_VERSION?.trim() || ffmpegStaticDefaultVersion
    const runnableOnCurrentMachine = platform === currentPlatform && arch === currentArch
    if (!isFFmpegVersionLine(version)) {
      logError(`Set MOVSCRIPT_FFMPEG_VERSION to the first \`ffmpeg -version\` line before downloading ffmpeg-static for ${platform} ${arch}.`)
      exit(1)
      return
    }
    const result = await downloadAndStage(root, { platform, arch, tag, version, runCheck: runnableOnCurrentMachine })
    log(`Downloaded ffmpeg-static ${result.tag} for ${platform} ${arch}: ${result.sourceUrl}`)
    log(`Staged ffmpeg for ${platform} ${arch}: ${result.target}`)
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    exit(1)
  }
}

export async function downloadAndStageFFmpegStatic(root = repoRoot, options = {}) {
  const {
    platform = process.platform,
    arch = process.arch,
    tag = ffmpegStaticReleaseTag,
    version = '',
    runCheck = true,
    download = downloadGzipFile,
    downloadAttempts = 4,
    stageBinary = stageFFmpegBinary,
  } = options
  const plan = ffmpegStaticSourcePlan(platform, arch, tag)
  const target = resolveDesktopFFmpegPath(root, platform, arch)
  const tempDir = mkdtempSync(join(tmpdir(), 'movscript-ffmpeg-static-'))
  const tempBinary = join(tempDir, plan.binary)
  const tempSource = join(tempDir, basename(new URL(plan.sourceUrl).pathname))
  try {
    await retryDownload(() => downloadSource(plan, tempSource, tempBinary, download), {
      attempts: downloadAttempts,
      label: plan.sourceUrl,
    })
    chmodSync(tempBinary, 0o755)
    prepareMacOSExecutableForLaunch(tempBinary)
    let stagedVersion = version
    if (runCheck) {
      const checked = readFFmpegVersion(tempBinary, root)
      if (checked.error) throw new Error(checked.error)
      stagedVersion = checked.version
    }
    stageBinary(tempBinary, target, root, undefined, {
      arch,
      license: plan.license,
      runCheck,
      sourceUrl: plan.sourceUrl,
      version: stagedVersion,
    })
    return { ...plan, target }
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

async function downloadSource(plan, tempSource, tempBinary, downloadGzip = downloadGzipFile) {
  if (plan.archive === 'tar.xz') {
    await downloadFile(plan.sourceUrl, tempSource)
    verifyDownloadedSource(plan, tempSource)
    extractTarXzFFmpeg(tempSource, tempBinary, plan)
    return
  }
  await downloadGzip(plan.sourceUrl, tempBinary)
  verifyDownloadedSource(plan, tempBinary)
}

function verifyDownloadedSource(plan, sourcePath) {
  if (!plan.sourceSha256) return
  const actual = sha256File(sourcePath)
  if (actual !== plan.sourceSha256) {
    throw new Error(`Downloaded ffmpeg source checksum mismatch for ${plan.sourceUrl}: expected ${plan.sourceSha256}, got ${actual}`)
  }
}

function extractTarXzFFmpeg(archivePath, tempBinary, plan) {
  if (!plan.memberPath) throw new Error(`ffmpeg tar.xz source plan is missing memberPath: ${plan.sourceUrl}`)
  const extractDir = join(dirname(tempBinary), 'extract')
  mkdirSync(extractDir, { recursive: true })
  const result = spawnSync('tar', ['-xf', archivePath, '-C', extractDir], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`Failed to extract ${basename(archivePath)}: ${result.stderr?.trim() || `tar exited with ${result.status}`}`)
  }
  copyFileSync(resolve(extractDir, plan.memberPath), tempBinary)
}

async function retryDownload(download, options = {}) {
  const {
    attempts = 4,
    delay = wait,
    label = 'download',
  } = options
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await download()
      return
    } catch (error) {
      lastError = error
      if (attempt >= attempts) break
      await delay(Math.min(1000 * 2 ** (attempt - 1), 8000))
    }
  }
  const message = lastError instanceof Error ? lastError.message : String(lastError)
  throw new Error(`Failed to download ${label} after ${attempts} attempts: ${message}`)
}

function wait(ms) {
  return new Promise((resolveWait) => setTimeout(resolveWait, ms))
}

function prepareMacOSExecutableForLaunch(path) {
  if (process.platform !== 'darwin') return
  spawnSync('xattr', ['-cr', path], { stdio: 'ignore' })
  spawnSync('codesign', ['--force', '--sign', '-', path], { stdio: 'ignore' })
}

export async function downloadGzipFile(url, destinationPath) {
  mkdirSync(dirname(destinationPath), { recursive: true })
  await pipeline(await getHTTPStream(url), createGunzip(), createWriteStream(destinationPath))
}

export async function downloadFile(url, destinationPath) {
  mkdirSync(dirname(destinationPath), { recursive: true })
  await pipeline(await getHTTPStream(url), createWriteStream(destinationPath))
}

export function parseFFmpegStaticTag(args = [], defaultTag = ffmpegStaticReleaseTag) {
  const tagArg = args.find((arg) => arg.startsWith('--tag='))
  const tag = (tagArg ? tagArg.slice('--tag='.length) : defaultTag).trim()
  if (!/^b\d+(?:\.\d+){1,3}(?:[-A-Za-z0-9.]+)?$/.test(tag)) {
    throw new Error(`Unsupported ffmpeg-static release tag: ${tag}`)
  }
  return tag
}

function getHTTPStream(url) {
  return new Promise((resolveStream, reject) => {
    httpsGet(url, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume()
        getHTTPStream(new URL(response.headers.location, url).href).then(resolveStream, reject)
        return
      }
      if (response.statusCode !== 200) {
        response.resume()
        reject(new Error(`Failed to download ${basename(new URL(url).pathname)}: HTTP ${response.statusCode}`))
        return
      }
      resolveStream(response)
    }).on('error', reject)
  })
}
