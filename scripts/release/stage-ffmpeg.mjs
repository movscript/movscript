import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, chmodSync, mkdirSync, readFileSync, realpathSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { assertDesktopArch, assertDesktopPlatform, desktopFFmpegBinaryName } from './desktop-targets.mjs'

const repoRoot = resolve(import.meta.dirname, '../..')
const FFMPEG_VERSION_TIMEOUT_MS = 30000

if (isDirectRun()) {
  runStageFFmpegCli(repoRoot, process.env, process.argv.slice(2))
}

export function runStageFFmpegCli(root = repoRoot, env = process.env, args = [], options = {}) {
  const {
    exit = process.exit,
    logError = console.error,
    log = console.log,
    stageBinary = stageFFmpegBinary,
    currentPlatform = process.platform,
    currentArch = process.arch,
    spawn = spawnSync,
  } = options
  try {
    const platform = parseDesktopPlatform(args, env.MOVSCRIPT_FFMPEG_PLATFORM || currentPlatform)
    const arch = parseDesktopArch(args, env.MOVSCRIPT_FFMPEG_ARCH || currentArch)
    if (args.includes('--inspect')) {
      inspectFFmpegSourceFromEnv(root, env, { exit, logError, log, platform, arch, currentPlatform, currentArch, spawn })
      return
    }
    stageFFmpegFromEnv(root, env, {
      exit,
      logError,
      log,
      platform,
      arch,
      currentPlatform,
      currentArch,
      stageBinary,
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    exit(1)
  }
}

export function inspectFFmpegSourceFromEnv(root = repoRoot, env = process.env, options = {}) {
  const {
    exit = process.exit,
    logError = console.error,
    log = console.log,
    platform = parseDesktopPlatform([], env.MOVSCRIPT_FFMPEG_PLATFORM?.trim() || process.platform),
    arch = parseDesktopArch([], env.MOVSCRIPT_FFMPEG_ARCH?.trim() || process.arch),
    currentPlatform = process.platform,
    currentArch = process.arch,
    spawn = spawnSync,
  } = options
  const source = env.MOVSCRIPT_FFMPEG_BIN?.trim() || env.FFMPEG_PATH?.trim()
  if (!source) {
    logError(`Set MOVSCRIPT_FFMPEG_BIN to an ffmpeg binary or extracted binary build directory before inspecting desktop ffmpeg for ${platform} ${arch}.`)
    exit(1)
    return
  }
  const expectedBinary = desktopFFmpegBinaryName(platform)
  try {
    const resolvedSource = resolveFFmpegSourceCandidate(source, expectedBinary)
    assertRedistributableSourcePath(source)
    assertRedistributableSourcePath(resolvedSource)
    log(`Resolved ffmpeg source for ${platform} ${arch}: ${resolvedSource}`)
    if (platform === currentPlatform && arch === currentArch) {
      const version = readFFmpegVersion(resolvedSource, root, spawn)
      if (version.error) {
        logError(version.error)
        exit(1)
        return
      }
      log(`ffmpeg -version: ${version.version}`)
    } else {
      log(`ffmpeg -version: skipped for non-current target ${platform} ${arch}`)
    }
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    exit(1)
  }
}

export function stageFFmpegFromEnv(root = repoRoot, env = process.env, options = {}) {
  const {
    exit = process.exit,
    logError = console.error,
    log = console.log,
    platform = parseDesktopPlatform([], env.MOVSCRIPT_FFMPEG_PLATFORM?.trim() || process.platform),
    arch = parseDesktopArch([], env.MOVSCRIPT_FFMPEG_ARCH?.trim() || process.arch),
    currentPlatform = process.platform,
    currentArch = process.arch,
    stageBinary = stageFFmpegBinary,
  } = options
  const source = env.MOVSCRIPT_FFMPEG_BIN?.trim() || env.FFMPEG_PATH?.trim()
  const sourceUrl = env.MOVSCRIPT_FFMPEG_SOURCE_URL?.trim()
  const license = env.MOVSCRIPT_FFMPEG_LICENSE?.trim()
  const version = env.MOVSCRIPT_FFMPEG_VERSION?.trim()
  if (!source) {
    logError(`Set MOVSCRIPT_FFMPEG_BIN to a redistributable ffmpeg binary before staging desktop ffmpeg for ${platform}.`)
    exit(1)
    return
  }
  if (!sourceUrl || !license) {
    logError(`Set MOVSCRIPT_FFMPEG_SOURCE_URL and MOVSCRIPT_FFMPEG_LICENSE before staging desktop ffmpeg for ${platform}.`)
    exit(1)
    return
  }
  const runnableOnCurrentMachine = platform === currentPlatform && arch === currentArch
  if (!runnableOnCurrentMachine && !isFFmpegVersionLine(version)) {
    logError(`Set MOVSCRIPT_FFMPEG_VERSION to the first \`ffmpeg -version\` line before staging desktop ffmpeg for ${platform} ${arch} from ${currentPlatform} ${currentArch}.`)
    exit(1)
    return
  }
  const target = resolveDesktopFFmpegPath(root, platform, arch)
  stageBinary(source, target, root, spawnSync, { sourceUrl, license, version, arch, runCheck: runnableOnCurrentMachine })
  log(`Staged ffmpeg for ${platform} ${arch}: ${target}`)
}

export function stageFFmpegBinary(source, target, cwd = process.cwd(), spawn = spawnSync, metadata = {}) {
  validateFFmpegMetadataInput(metadata)
  if (!existsSync(source)) {
    throw new Error(`ffmpeg source does not exist: ${source}`)
  }
  const resolvedSource = resolveFFmpegSourceCandidate(source, basename(target))
  assertRedistributableSourcePath(source)
  assertRedistributableSourcePath(resolvedSource)
  const runCheck = metadata.runCheck !== false
  let version = String(metadata.version || '').trim()
  if (!runCheck && !isFFmpegVersionLine(version)) {
    throw new Error('Set MOVSCRIPT_FFMPEG_VERSION to the first `ffmpeg -version` line when staging a binary for a platform that cannot be run on this machine.')
  }
  if (runCheck) {
    const sourceCheck = verifyRunnableFFmpeg(resolvedSource, cwd, spawn)
    if (sourceCheck) {
      throw new Error(sourceCheck)
    }
  }
  mkdirSync(dirname(target), { recursive: true })
  copyFileSync(resolvedSource, target)
  if (basename(target) !== 'ffmpeg.exe') chmodSync(target, 0o755)
  if (runCheck) {
    const targetVersion = readFFmpegVersion(target, cwd, spawn)
    const targetCheck = targetVersion.error
    if (targetCheck) {
      throw new Error(targetCheck)
    }
    version = targetVersion.version
  }
  writeFFmpegMetadata({
    target,
    source: resolvedSource,
    version,
    sizeBytes: statSync(target).size,
    sha256: sha256File(target),
    sourceUrl: metadata.sourceUrl,
    license: metadata.license,
    arch: metadata.arch,
  })
}

export function resolveFFmpegSourceCandidate(source, expectedBinary = 'ffmpeg') {
  const sourceInfo = statSync(source)
  if (sourceInfo.isFile()) return source
  if (!sourceInfo.isDirectory()) {
    throw new Error(`ffmpeg source is not a file or directory: ${source}`)
  }
  if (looksLikeFFmpegSourceTree(source)) {
    throw new Error(`ffmpeg source looks like source code, not a prebuilt binary: ${source}. Download or provide a static/binary build that contains ${expectedBinary}; the staging script does not compile FFmpeg from source.`)
  }
  const candidates = findFFmpegBinaryCandidates(source, expectedBinary)
  if (candidates.length === 0) {
    throw new Error(`No ${expectedBinary} binary found under ${source}. If this is an FFmpeg source archive, download a static/binary build instead; staging does not compile FFmpeg from source.`)
  }
  candidates.sort((left, right) => (
    ffmpegCandidateScore(source, left, expectedBinary) - ffmpegCandidateScore(source, right, expectedBinary) ||
    left.length - right.length ||
    left.localeCompare(right)
  ))
  return candidates[0]
}

function ffmpegCandidateScore(root, candidate, expectedBinary) {
  const relativePath = candidate.slice(root.length + 1).split(/[\\/]+/)
  const lowered = relativePath.map((part) => part.toLowerCase())
  if (lowered.length === 1 && lowered[0] === expectedBinary.toLowerCase()) return 0
  if (lowered.at(-2) === 'bin') return 1
  if (lowered.some((part) => ['example', 'examples', 'sample', 'samples', 'test', 'tests'].includes(part))) return 10
  return 5
}

function looksLikeFFmpegSourceTree(source) {
  return existsSync(join(source, 'configure')) &&
    (existsSync(join(source, 'libavcodec')) || existsSync(join(source, 'libavformat')))
}

function findFFmpegBinaryCandidates(root, expectedBinary) {
  const candidates = []
  const queue = [{ path: root, depth: 0 }]
  while (queue.length > 0 && candidates.length < 20) {
    const current = queue.shift()
    if (!current || current.depth > 5) continue
    for (const entry of readdirSync(current.path, { withFileTypes: true })) {
      const child = join(current.path, entry.name)
      if (entry.isFile() && entry.name === expectedBinary) {
        candidates.push(child)
      } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
        queue.push({ path: child, depth: current.depth + 1 })
      }
    }
  }
  return candidates
}

export function resolveDesktopFFmpegPath(root, platform = process.platform, arch = process.arch) {
  const binary = desktopFFmpegBinaryName(platform)
  return resolve(root, 'apps/frontend/vendor/ffmpeg', platform, arch, binary)
}

export function parseDesktopPlatform(args = [], defaultPlatform = process.platform) {
  const platformArg = args.find((arg) => arg.startsWith('--platform='))
  const platform = platformArg ? platformArg.slice('--platform='.length) : defaultPlatform
  assertDesktopPlatform(platform, 'ffmpeg staging')
  return platform
}

export function parseDesktopArch(args = [], defaultArch = process.arch) {
  const archArg = args.find((arg) => arg.startsWith('--arch='))
  const arch = archArg ? archArg.slice('--arch='.length) : defaultArch
  assertDesktopArch(arch, 'ffmpeg staging')
  return arch
}

export function verifyRunnableFFmpeg(path, cwd = process.cwd(), spawn = spawnSync) {
  return readFFmpegVersion(path, cwd, spawn).error
}

export function readFFmpegVersion(path, cwd = process.cwd(), spawn = spawnSync, timeoutMs = FFMPEG_VERSION_TIMEOUT_MS) {
  const result = spawn(path, ['-version'], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: timeoutMs,
  })
  if (!result.error && result.status === 0) {
    return { version: result.stdout?.split(/\r?\n/)[0]?.trim() || 'ffmpeg', error: '' }
  }
  const timedOut = result.error?.code === 'ETIMEDOUT' || result.signal === 'SIGTERM'
  return {
    version: '',
    error: [
      `ffmpeg is not runnable: ${path}`,
      timedOut ? `ffmpeg -version timed out after ${Math.round(timeoutMs / 1000)}s` : '',
      result.error?.message,
      result.stderr?.trim(),
    ].filter(Boolean).join('\n'),
  }
}

export function writeFFmpegMetadata({ target, source, version, sizeBytes, sha256 = sha256File(target), sourceUrl, license, arch, now = new Date() }) {
  validateFFmpegMetadataInput({ sourceUrl, license, arch })
  const metadataPath = resolve(dirname(target), 'METADATA.json')
  const metadata = {
    arch,
    binary: basename(target),
    license,
    source_basename: basename(source),
    source_url: sourceUrl,
    staged_at: now.toISOString(),
    sha256,
    size_bytes: sizeBytes,
    version,
  }
  writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8')
  return metadataPath
}

export function validateFFmpegMetadataInput({ sourceUrl, license, arch }) {
  if (!sourceUrl || !license) {
    throw new Error('ffmpeg metadata requires sourceUrl and license')
  }
  assertDesktopArch(arch, 'ffmpeg metadata')
  if (!isHttpURL(sourceUrl)) {
    throw new Error('ffmpeg metadata sourceUrl must be an http(s) URL')
  }
  if (isPlaceholderURL(sourceUrl)) {
    throw new Error('ffmpeg metadata sourceUrl must not use an example placeholder URL')
  }
  if (!isSPDXLike(license)) {
    throw new Error('ffmpeg metadata license must be an SPDX-style expression')
  }
}

export function assertRedistributableSourcePath(source) {
  const resolvedSource = normalizePathForPolicy(isWindowsAbsolutePath(source) ? source : resolve(source))
  const realSource = existsSync(source) ? normalizePathForPolicy(realpathSync(source)) : resolvedSource
  const blockedPrefixes = [
    '/opt/homebrew/',
    '/opt/local/',
    '/usr/local/cellar/',
    '/usr/local/bin/',
    '/usr/local/homebrew/',
    '/usr/bin/',
    '/usr/sbin/',
    '/bin/',
    '/sbin/',
    '/nix/store/',
    '/snap/bin/',
    '/var/lib/snapd/snap/bin/',
    '/usr/lib/',
    '/usr/libexec/',
    'c:/programdata/chocolatey/',
    'c:/program files/chocolatey/',
    'c:/program files/winget/',
  ]
  const blockedSegments = [
    '/.linuxbrew/',
    '/home/linuxbrew/.linuxbrew/',
    '/scoop/apps/ffmpeg/',
  ]
  const blocked = [...new Set([resolvedSource, realSource])].some((path) => (
    blockedPrefixes.some((prefix) => path.startsWith(prefix))
    || blockedSegments.some((segment) => path.includes(segment))
  ))
  if (blocked) {
    throw new Error([
      `Refusing to stage package-manager or system ffmpeg as a redistributable binary: ${source}`,
      'Use an explicitly redistributable release artifact and provide MOVSCRIPT_FFMPEG_SOURCE_URL plus MOVSCRIPT_FFMPEG_LICENSE.',
    ].join('\n'))
  }
}

export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function isHttpURL(value) {
  try {
    const url = new URL(String(value))
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function isPlaceholderURL(value) {
  try {
    const host = new URL(String(value)).hostname.toLowerCase()
    return host === 'example.com' || host === 'example.org' || host === 'example.net'
  } catch {
    return false
  }
}

function isSPDXLike(value) {
  const text = String(value)
  if (!/^[A-Za-z0-9.+-]+(?:\s+(?:AND|OR|WITH)\s+[A-Za-z0-9.+-]+)*$/.test(text)) return false
  return /-\d/.test(text) || text === 'LicenseRef-proprietary'
}

function isFFmpegVersionLine(value) {
  return /^ffmpeg\s+version\b/i.test(String(value).trim())
}

function normalizePathForPolicy(path) {
  return String(path).replace(/\\/g, '/').toLowerCase()
}

function isWindowsAbsolutePath(path) {
  return /^[a-z]:[\\/]/i.test(String(path))
}

function isDirectRun() {
  return process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
}
