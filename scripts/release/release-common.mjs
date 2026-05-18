import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const desktopPlatforms = Object.freeze(['darwin', 'linux', 'win32'])
export const desktopArchs = Object.freeze(['x64', 'arm64'])
export const desktopReleaseTargets = Object.freeze([
  Object.freeze({ platform: 'darwin', arch: 'x64' }),
  Object.freeze({ platform: 'darwin', arch: 'arm64' }),
  Object.freeze({ platform: 'linux', arch: 'x64' }),
  Object.freeze({ platform: 'linux', arch: 'arm64' }),
  Object.freeze({ platform: 'win32', arch: 'x64' }),
])

export const ffmpegStaticReleaseTag = 'b6.1.1'
export const ffmpegStaticLicense = 'GPL-3.0-or-later'
export const ffmpegStaticBaseUrl = 'https://github.com/eugeneware/ffmpeg-static/releases/download'
export const ffmpegStaticDefaultVersion = 'ffmpeg version 6.1.1-static'
export const ffmpegVersionTimeoutMs = 30000

export const ffmpegMetadataFields = Object.freeze([
  'arch',
  'binary',
  'license',
  'source_basename',
  'source_url',
  'staged_at',
  'sha256',
  'size_bytes',
  'version',
])

export function assertDesktopPlatform(platform, label = 'desktop target') {
  if (!desktopPlatforms.includes(platform)) {
    throw new Error(`Unsupported ${label} platform: ${platform}`)
  }
}

export function assertDesktopArch(arch, label = 'desktop target') {
  if (!desktopArchs.includes(arch)) {
    throw new Error(`Unsupported ${label} arch: ${arch}`)
  }
}

export function parseDesktopPlatformArg(args = [], defaultPlatform = process.platform, label = 'desktop target') {
  const platformArg = args.find((arg) => arg.startsWith('--platform='))
  const platform = platformArg ? platformArg.slice('--platform='.length) : defaultPlatform
  assertDesktopPlatform(platform, label)
  return platform
}

export function hasDesktopPlatformArg(args = []) {
  return args.some((arg) => arg.startsWith('--platform='))
}

export function parseDesktopArchArg(args = [], defaultArch = process.arch, label = 'desktop target') {
  const archArg = args.find((arg) => arg.startsWith('--arch='))
  const arch = archArg ? archArg.slice('--arch='.length) : defaultArch
  assertDesktopArch(arch, label)
  return arch
}

export function hasDesktopArchArg(args = []) {
  return args.some((arg) => arg.startsWith('--arch='))
}

export function parseDesktopPlatformsArg(args = [], defaultPlatform = process.platform, label = 'desktop target') {
  if (args.includes('--all')) return desktopPlatforms
  return [parseDesktopPlatformArg(args, defaultPlatform, label)]
}

export function parseDesktopArchsArg(args = [], defaultArch = process.arch, label = 'desktop target') {
  if (args.includes('--all-archs') || args.includes('--matrix')) return desktopArchs
  return [parseDesktopArchArg(args, defaultArch, label)]
}

export function desktopFFmpegBinaryName(platform) {
  return platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
}

export function goosForDesktopPlatform(platform) {
  if (platform === 'win32') return 'windows'
  return platform
}

export function goarchForDesktopArch(arch) {
  if (arch === 'x64') return 'amd64'
  return arch
}

export function resolveDesktopFFmpegPath(root, platform = process.platform, arch = process.arch) {
  const binary = desktopFFmpegBinaryName(platform)
  return resolve(root, 'apps/frontend/vendor/ffmpeg', platform, arch, binary)
}

export function isDesktopReleaseTarget(platform, arch) {
  return desktopReleaseTargets.some((target) => target.platform === platform && target.arch === arch)
}

export function assertFFmpegStaticTarget(platform, arch) {
  assertDesktopPlatform(platform, 'ffmpeg-static')
  assertDesktopArch(arch, 'ffmpeg-static')
  if (!isDesktopReleaseTarget(platform, arch)) {
    throw new Error(`ffmpeg-static does not provide a default MovScript binary for ${platform} ${arch}`)
  }
}

export function ffmpegStaticAssetName(platform, arch) {
  assertFFmpegStaticTarget(platform, arch)
  return `ffmpeg-${platform}-${arch}.gz`
}

export function ffmpegStaticBinaryUrl(platform, arch, tag = ffmpegStaticReleaseTag) {
  return `${ffmpegStaticBaseUrl}/${tag}/${ffmpegStaticAssetName(platform, arch)}`
}

export function ffmpegStaticReadmeUrl(platform, arch, tag = ffmpegStaticReleaseTag) {
  assertFFmpegStaticTarget(platform, arch)
  return `${ffmpegStaticBaseUrl}/${tag}/${platform}-${arch}.README`
}

export function ffmpegStaticSourcePlan(platform, arch, tag = ffmpegStaticReleaseTag) {
  return {
    arch,
    binary: desktopFFmpegBinaryName(platform),
    license: ffmpegStaticLicense,
    platform,
    readmeUrl: ffmpegStaticReadmeUrl(platform, arch, tag),
    sourceUrl: ffmpegStaticBinaryUrl(platform, arch, tag),
    tag,
  }
}

export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

export function isDirectRun(moduleUrl, argv = process.argv) {
  return argv[1] && fileURLToPath(moduleUrl) === resolve(argv[1])
}

export function isHttpURL(value) {
  try {
    const url = new URL(String(value))
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function isPlaceholderURL(value) {
  try {
    const host = new URL(String(value)).hostname.toLowerCase()
    return host === 'example.com' || host === 'example.org' || host === 'example.net'
  } catch {
    return false
  }
}

export function isSPDXLike(value) {
  const text = String(value)
  if (!/^[A-Za-z0-9.+-]+(?:\s+(?:AND|OR|WITH)\s+[A-Za-z0-9.+-]+)*$/.test(text)) return false
  return /-\d/.test(text) || text === 'LicenseRef-proprietary'
}

export function isFFmpegVersionLine(value) {
  return /^ffmpeg\s+version\b/i.test(String(value).trim())
}

export function buildFFmpegMetadata({ target, source, version, sizeBytes, sha256 = sha256File(target), sourceUrl, license, arch, now = new Date() }) {
  validateFFmpegMetadataInput({ sourceUrl, license, arch })
  return {
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
}

export function validateFFmpegMetadataInput({ sourceUrl, license, arch }) {
  if (!sourceUrl || !license) {
    throw new Error('ffmpeg metadata requires sourceUrl and license')
  }
  if (!desktopArchs.includes(arch)) {
    throw new Error(`Unsupported ffmpeg metadata arch: ${arch}`)
  }
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

export function validateFFmpegMetadataRecord(metadata, metadataPath, expected = {}) {
  const missing = ffmpegMetadataFields.filter((field) => metadata?.[field] === undefined || metadata?.[field] === '')
  if (missing.length > 0) {
    return `Desktop package ffmpeg metadata is incomplete: ${metadataPath}\nMissing: ${missing.join(', ')}`
  }
  if (expected.binary && metadata.binary !== expected.binary) {
    return `Desktop package ffmpeg metadata binary mismatch: ${metadataPath}\nExpected ${expected.binary}, got ${metadata.binary}`
  }
  if (!desktopArchs.includes(metadata.arch)) {
    return `Desktop package ffmpeg metadata arch is invalid: ${metadataPath}`
  }
  if (expected.arch && metadata.arch !== expected.arch) {
    return `Desktop package ffmpeg metadata arch mismatch: ${metadataPath}\nExpected ${expected.arch}, got ${metadata.arch}`
  }
  if (!isFFmpegVersionLine(metadata.version)) {
    return `Desktop package ffmpeg metadata version is invalid: ${metadataPath}`
  }
  if (!isHttpURL(metadata.source_url) || isPlaceholderURL(metadata.source_url)) {
    return `Desktop package ffmpeg metadata source_url is invalid: ${metadataPath}`
  }
  if (!isSPDXLike(metadata.license)) {
    return `Desktop package ffmpeg metadata license is invalid: ${metadataPath}`
  }
  if (!/^[a-f0-9]{64}$/i.test(String(metadata.sha256))) {
    return `Desktop package ffmpeg metadata sha256 is invalid: ${metadataPath}`
  }
  if (!Number.isFinite(Number(metadata.size_bytes)) || Number(metadata.size_bytes) <= 0) {
    return `Desktop package ffmpeg metadata size_bytes is invalid: ${metadataPath}`
  }
  if (Number.isNaN(Date.parse(metadata.staged_at))) {
    return `Desktop package ffmpeg metadata staged_at is invalid: ${metadataPath}`
  }
  return ''
}

const requiredFFmpegFilters = Object.freeze([
  'adelay',
  'afade',
  'amix',
  'anullsrc',
  'asetpts',
  'atempo',
  'atrim',
  'color',
  'colorchannelmixer',
  'crop',
  'drawtext',
  'fade',
  'format',
  'overlay',
  'pad',
  'scale',
  'setpts',
  'setsar',
  'trim',
  'volume',
])

export function verifyDesktopPackage(root, options = {}) {
  const {
    platform = process.platform,
    arch = process.arch,
    currentPlatform = process.platform,
    currentArch = process.arch,
    log = console.log,
    logError = console.error,
    exit = process.exit,
    spawn = spawnSync,
  } = options
  const releaseDir = resolve(root, 'apps/frontend/release')
  const backendBinDir = resolve(root, 'apps/backend/bin')
  const agentDir = resolve(root, 'apps/frontend/movscript-agent')
  const ffmpegPath = resolveDesktopFFmpegPath(root, platform, arch)

  const requiredPaths = [
    resolve(backendBinDir, platform === 'win32' ? 'server.exe' : 'server'),
    resolve(backendBinDir, 'admin/index.html'),
    resolve(agentDir, 'dist/server.js'),
    resolve(agentDir, 'dist/server.bundle.js'),
    resolve(agentDir, 'package.json'),
    ffmpegPath,
  ]

  const missing = requiredPaths.filter((path) => !existsSync(path))
  if (missing.length > 0) {
    logError('Desktop package prerequisites are missing:')
    for (const path of missing) logError(`- ${path}`)
    exit(1)
    return false
  }

  const ffmpegError = verifyDesktopFFmpeg(ffmpegPath, root, spawn, ffmpegVersionTimeoutMs, {
    arch,
    runCheck: platform === currentPlatform && arch === currentArch,
  })
  if (ffmpegError) {
    logError(ffmpegError)
    exit(1)
    return false
  }

  if (!existsSync(releaseDir)) {
    logError(`Electron release directory does not exist: ${releaseDir}`)
    exit(1)
    return false
  }

  const artifacts = readdirSync(releaseDir)
    .filter((name) => !name.endsWith('.blockmap') && !name.endsWith('.yml') && !name.endsWith('.yaml'))
    .map((name) => resolve(releaseDir, name))
    .filter((path) => statSync(path).isFile())

  if (artifacts.length === 0) {
    logError(`No distributable artifacts found in ${releaseDir}`)
    exit(1)
    return false
  }

  const bundledFFmpegError = verifyBundledDesktopFFmpeg(releaseDir, platform, { sourcePath: ffmpegPath, arch })
  if (bundledFFmpegError) {
    logError(bundledFFmpegError)
    exit(1)
    return false
  }

  log('Desktop package verification passed.')
  for (const artifact of artifacts) {
    const { size } = statSync(artifact)
    log(`- ${artifact} (${Math.round(size / 1024 / 1024)} MB)`)
  }
  return true
}

export function verifyDesktopFFmpeg(path, cwd = process.cwd(), spawn = spawnSync, timeoutMs = ffmpegVersionTimeoutMs, expected = {}) {
  if (!existsSync(path)) {
    return `Desktop package ffmpeg prerequisite is missing: ${path}`
  }
  const metadataError = verifyDesktopFFmpegMetadata(path, expected)
  if (metadataError) return metadataError
  if (expected.runCheck === false) return ''
  const result = spawn(path, ['-version'], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: timeoutMs,
  })
  if (!result.error && result.status === 0) {
    const version = result.stdout?.split(/\r?\n/)[0]?.trim() || 'ffmpeg'
    const metadata = readDesktopFFmpegMetadata(path)
    if (metadata.version !== version) {
      return `Desktop package ffmpeg metadata version mismatch: ${resolve(dirname(path), 'METADATA.json')}\nExpected ${metadata.version}, got ${version}`
    }
    const filtersError = verifyDesktopFFmpegFilters(path, cwd, spawn, timeoutMs)
    if (filtersError) return filtersError
    return ''
  }
  const timedOut = result.error?.code === 'ETIMEDOUT' || result.signal === 'SIGTERM'
  const details = [
    `Desktop package ffmpeg prerequisite is not runnable: ${path}`,
    timedOut ? `ffmpeg -version timed out after ${Math.round(timeoutMs / 1000)}s` : '',
    result.error?.message,
    result.stderr?.trim(),
  ].filter(Boolean)
  return details.join('\n')
}

export function verifyDesktopFFmpegFilters(path, cwd = process.cwd(), spawn = spawnSync, timeoutMs = ffmpegVersionTimeoutMs, filters = requiredFFmpegFilters) {
  const result = spawn(path, ['-hide_banner', '-filters'], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: timeoutMs,
  })
  if (result.error || result.status !== 0) {
    const timedOut = result.error?.code === 'ETIMEDOUT' || result.signal === 'SIGTERM'
    return [
      `Desktop package ffmpeg filters are not inspectable: ${path}`,
      timedOut ? `ffmpeg -filters timed out after ${Math.round(timeoutMs / 1000)}s` : '',
      result.error?.message,
      result.stderr?.trim(),
    ].filter(Boolean).join('\n')
  }
  const available = new Set((result.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/).at(1))
    .filter(Boolean))
  const missing = filters.filter((filter) => !available.has(filter))
  if (missing.length > 0) {
    return [
      `Desktop package ffmpeg is missing required filters: ${missing.join(', ')}`,
      `Binary: ${path}`,
      'Use a redistributable full/static FFmpeg build that includes libfreetype/drawtext and standard overlay/audio filters.',
    ].join('\n')
  }
  return ''
}

export function verifyBundledDesktopFFmpeg(releaseDir, platform = process.platform, options = {}) {
  if (!existsSync(releaseDir)) {
    return `Electron release directory does not exist: ${releaseDir}`
  }
  const resourceDirs = findUnpackedResourceDirs(releaseDir, platform)
  if (resourceDirs.length === 0) {
    return `No unpacked Electron resources directory found for ${platform}: ${releaseDir}`
  }
  const binary = desktopFFmpegBinaryName(platform)
  const expected = resourceDirs.map((resourcesPath) => resolve(resourcesPath, 'ffmpeg', platform, options.arch || process.arch, binary))
  for (const bundledPath of expected) {
    if (!existsSync(bundledPath)) continue
    const metadataError = verifyDesktopFFmpegMetadata(bundledPath, { arch: options.arch })
    if (metadataError) {
      return `Bundled desktop ffmpeg metadata is invalid: ${bundledPath}\n${metadataError}`
    }
    if (options.sourcePath && sha256File(bundledPath) !== sha256File(options.sourcePath)) {
      return [
        `Bundled desktop ffmpeg does not match staged source for ${platform}.`,
        `Source: ${options.sourcePath}`,
        `Bundled: ${bundledPath}`,
      ].join('\n')
    }
    return ''
  }
  return [
    `Bundled desktop ffmpeg is missing from unpacked Electron resources for ${platform}.`,
    ...expected.map((path) => `- expected: ${path}`),
  ].join('\n')
}

export function findUnpackedResourceDirs(releaseDir, platform = process.platform) {
  if (!existsSync(releaseDir)) return []
  const result = []
  const stack = [releaseDir]
  while (stack.length > 0) {
    const current = stack.pop()
    const info = statSync(current)
    if (!info.isDirectory()) continue
    const normalized = current.replace(/\\/g, '/')
    if (platform === 'darwin' && normalized.endsWith('.app/Contents/Resources')) {
      result.push(current)
      continue
    }
    if (platform !== 'darwin' && basename(current) === 'resources' && isUnpackedResourceParent(platform, basename(dirname(current)))) {
      result.push(current)
      continue
    }
    for (const name of readdirSync(current)) {
      const child = resolve(current, name)
      if (statSync(child).isDirectory()) stack.push(child)
    }
  }
  return result.sort()
}

function isUnpackedResourceParent(platform, dirName) {
  const prefix = platform === 'win32' ? 'win' : 'linux'
  return dirName === `${prefix}-unpacked` || (dirName.startsWith(`${prefix}-`) && dirName.endsWith('-unpacked'))
}

export function verifyDesktopFFmpegMetadata(path, expected = {}) {
  const metadataPath = resolve(dirname(path), 'METADATA.json')
  const metadata = readDesktopFFmpegMetadata(path)
  if (metadata.error === 'missing') {
    return `Desktop package ffmpeg metadata is missing: ${metadataPath}`
  }
  if (metadata.error) {
    return `Desktop package ffmpeg metadata is invalid: ${metadataPath}\n${metadata.error}`
  }
  const metadataError = validateFFmpegMetadataRecord(metadata, metadataPath, { binary: basename(path), arch: expected.arch })
  if (metadataError) return metadataError
  const actualStat = statSync(path)
  if (basename(path) !== 'ffmpeg.exe' && (actualStat.mode & 0o111) === 0) {
    return `Desktop package ffmpeg binary is not executable: ${path}`
  }
  if (Number(metadata.size_bytes) !== actualStat.size) {
    return `Desktop package ffmpeg metadata size_bytes mismatch: ${metadataPath}\nExpected ${metadata.size_bytes}, got ${actualStat.size}`
  }
  const actualSha = sha256File(path)
  if (metadata.sha256 !== actualSha) {
    return `Desktop package ffmpeg metadata sha256 mismatch: ${metadataPath}\nExpected ${metadata.sha256}, got ${actualSha}`
  }
  return ''
}

export function readDesktopFFmpegMetadata(path) {
  const metadataPath = resolve(dirname(path), 'METADATA.json')
  if (!existsSync(metadataPath)) return { error: 'missing' }
  try {
    return JSON.parse(readFileSync(metadataPath, 'utf8'))
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}
