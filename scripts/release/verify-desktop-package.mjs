import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { assertDesktopArch, assertDesktopPlatform, desktopArchs, desktopFFmpegBinaryName } from './desktop-targets.mjs'

const repoRoot = resolve(import.meta.dirname, '../..')
const FFMPEG_VERSION_TIMEOUT_MS = 5000

if (isDirectRun()) {
  runVerifyDesktopPackageCli(repoRoot, process.argv.slice(2))
}

export function runVerifyDesktopPackageCli(root = repoRoot, args = [], options = {}) {
  const {
    exit = process.exit,
    logError = console.error,
    currentPlatform = process.platform,
    currentArch = process.arch,
    verifyPackage = verifyDesktopPackage,
  } = options
  try {
    verifyPackage(root, {
      platform: parseDesktopPlatform(args, currentPlatform),
      arch: parseDesktopArch(args, currentArch),
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    exit(1)
  }
}

export function verifyDesktopPackage(root = repoRoot, options = {}) {
  const { platform = process.platform, arch = process.arch } = options
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
    console.error('Desktop package prerequisites are missing:')
    for (const path of missing) console.error(`- ${path}`)
    process.exit(1)
  }

  const ffmpegError = verifyDesktopFFmpeg(ffmpegPath, root, spawnSync, FFMPEG_VERSION_TIMEOUT_MS, { arch })
  if (ffmpegError) {
    console.error(ffmpegError)
    process.exit(1)
  }

  if (!existsSync(releaseDir)) {
    console.error(`Electron release directory does not exist: ${releaseDir}`)
    process.exit(1)
  }

  const artifacts = readdirSync(releaseDir)
    .filter((name) => !name.endsWith('.blockmap') && !name.endsWith('.yml') && !name.endsWith('.yaml'))
    .map((name) => resolve(releaseDir, name))
    .filter((path) => statSync(path).isFile())

  if (artifacts.length === 0) {
    console.error(`No distributable artifacts found in ${releaseDir}`)
    process.exit(1)
  }

  const bundledFFmpegError = verifyBundledDesktopFFmpeg(releaseDir, platform, { sourcePath: ffmpegPath, arch })
  if (bundledFFmpegError) {
    console.error(bundledFFmpegError)
    process.exit(1)
  }

  console.log('Desktop package verification passed.')
  for (const artifact of artifacts) {
    const { size } = statSync(artifact)
    console.log(`- ${artifact} (${Math.round(size / 1024 / 1024)} MB)`)
  }
}

export function resolveDesktopFFmpegPath(root, platform = process.platform, arch = process.arch) {
  const binary = desktopFFmpegBinaryName(platform)
  return resolve(root, 'apps/frontend/vendor/ffmpeg', platform, arch, binary)
}

export function verifyDesktopFFmpeg(path, cwd = process.cwd(), spawn = spawnSync, timeoutMs = FFMPEG_VERSION_TIMEOUT_MS, expected = {}) {
  if (!existsSync(path)) {
    return `Desktop package ffmpeg prerequisite is missing: ${path}`
  }
  const metadataError = verifyDesktopFFmpegMetadata(path, expected)
  if (metadataError) return metadataError
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
    const unpackedDir = platform === 'win32' ? 'win-unpacked' : 'linux-unpacked'
    if (platform !== 'darwin' && basename(current) === 'resources' && basename(dirname(current)) === unpackedDir) {
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

export function verifyDesktopFFmpegMetadata(path, expected = {}) {
  const metadataPath = resolve(dirname(path), 'METADATA.json')
  const metadata = readDesktopFFmpegMetadata(path)
  if (metadata.error === 'missing') {
    return `Desktop package ffmpeg metadata is missing: ${metadataPath}`
  }
  if (metadata.error) {
    return `Desktop package ffmpeg metadata is invalid: ${metadataPath}\n${metadata.error}`
  }
  const requiredFields = ['arch', 'binary', 'license', 'source_basename', 'source_url', 'staged_at', 'sha256', 'size_bytes', 'version']
  const missing = requiredFields.filter((field) => metadata?.[field] === undefined || metadata?.[field] === '')
  if (missing.length > 0) {
    return `Desktop package ffmpeg metadata is incomplete: ${metadataPath}\nMissing: ${missing.join(', ')}`
  }
  if (metadata.binary !== basename(path)) {
    return `Desktop package ffmpeg metadata binary mismatch: ${metadataPath}\nExpected ${basename(path)}, got ${metadata.binary}`
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
  if (Number.isNaN(Date.parse(metadata.staged_at))) {
    return `Desktop package ffmpeg metadata staged_at is invalid: ${metadataPath}`
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

export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

export function parseDesktopPlatform(args = [], currentPlatform = process.platform) {
  const platformArg = args.find((arg) => arg.startsWith('--platform='))
  if (!platformArg) return currentPlatform
  const platform = platformArg.slice('--platform='.length)
  assertDesktopPlatform(platform, 'desktop package')
  return platform
}

export function parseDesktopArch(args = [], currentArch = process.arch) {
  const archArg = args.find((arg) => arg.startsWith('--arch='))
  if (!archArg) return currentArch
  const arch = archArg.slice('--arch='.length)
  assertDesktopArch(arch, 'desktop package')
  return arch
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

function isDirectRun() {
  return process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
}
