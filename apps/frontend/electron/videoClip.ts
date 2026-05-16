import { spawn } from 'child_process'
import type { Readable } from 'stream'
import { existsSync, statSync } from 'fs'
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'fs/promises'
import { basename, extname, join, resolve } from 'path'
import { tmpdir } from 'os'

export interface VideoClipInput {
  sourcePath?: string
  sourceData?: ArrayBuffer | Uint8Array
  sourceName?: string
  startMs: number
  endMs: number
  outputName?: string
  mode?: 'fast' | 'accurate'
}

export interface VideoClipResult {
  ok: boolean
  outputPath?: string
  outputName?: string
  mode?: 'fast' | 'accurate'
  fallbackApplied?: boolean
  data?: Uint8Array
  size?: number
  mimeType?: string
  error?: string
  code?: string
}

export interface VideoClipStatus {
  available: boolean
  path?: string
  version?: string
  error?: string
  expectedBundledPath?: string
  platform?: NodeJS.Platform
  arch?: string
}

const MAX_CLIP_DURATION_MS = 10 * 60 * 1000
const MAX_CLIP_SOURCE_BYTES = 1024 * 1024 * 1024
const MAX_OUTPUT_BASENAME_LENGTH = 80
const OUTPUT_SUFFIX = '_clip'
const WINDOWS_RESERVED_BASENAME_PATTERN = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i
const FFMPEG_TIMEOUT_MS = 20 * 60 * 1000
const FFMPEG_STATUS_TIMEOUT_MS = 5000
const FFMPEG_STDERR_LIMIT = 64 * 1024

type FFmpegProcess = {
  stderr?: Readable
  kill: (signal?: NodeJS.Signals | number) => boolean
  on: (event: 'error' | 'exit', listener: (value: Error | number | null) => void) => FFmpegProcess
}
type FFmpegSpawn = (command: string, args: string[], options: { stdio: ['ignore', 'ignore', 'pipe'] }) => FFmpegProcess
type FFmpegVersionProcess = FFmpegProcess & { stdout?: Readable }
type FFmpegVersionSpawn = (
  command: string,
  args: string[],
  options: { stdio: ['ignore', 'pipe', 'pipe'] },
) => FFmpegVersionProcess
type FFmpegPathOptions = {
  platform?: NodeJS.Platform
  arch?: string
  resourcesPath?: string
  cwd?: string
}
type VideoClipStatusOptions = FFmpegPathOptions & {
  resolvePath?: () => string | undefined
  readVersion?: (ffmpeg: string) => Promise<string>
}

export class FFmpegTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`ffmpeg timed out after ${Math.round(timeoutMs / 1000)}s`)
    this.name = 'FFmpegTimeoutError'
  }
}

export async function getVideoClipStatus(options: VideoClipStatusOptions = {}): Promise<VideoClipStatus> {
  const platform = options.platform ?? process.platform
  const arch = options.arch ?? process.arch
  const expectedBundledPath = getExpectedBundledFFmpegPath(options)
  const ffmpeg = options.resolvePath ? options.resolvePath() : resolveFFmpegPath(options)
  if (!ffmpeg) {
    return {
      available: false,
      error: `ffmpeg is not available on this device. Expected bundled binary at ${expectedBundledPath}.`,
      expectedBundledPath,
      platform,
      arch,
    }
  }
  try {
    const readVersion = options.readVersion ?? readFFmpegVersion
    const version = await readVersion(ffmpeg)
    return { available: true, path: ffmpeg, version, expectedBundledPath, platform, arch }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to run ffmpeg.'
    const missingCommand = ffmpeg === ffmpegBinaryName(platform) && /\bENOENT\b/i.test(message)
    return {
      available: false,
      path: ffmpeg,
      error: missingCommand
        ? `ffmpeg is not available on this device. Expected bundled binary at ${expectedBundledPath}.`
        : message,
      expectedBundledPath,
      platform,
      arch,
    }
  }
}

export async function clipVideo(input: VideoClipInput): Promise<VideoClipResult> {
  const validation = validateClipInput(input)
  if (validation) return validation

  const status = await getVideoClipStatus()
  if (!status.available || !status.path) {
    return { ok: false, code: 'FFMPEG_NOT_FOUND', error: status.error || 'ffmpeg is not available on this device.' }
  }

  const workDir = await mkdtemp(join(tmpdir(), 'movscript-video-clip-')).catch(createFallbackWorkDir)
  const sourcePath = await prepareInputFile(input, workDir)
  const outputName = normalizeOutputName(input.outputName, input.sourceName ?? input.sourcePath ?? 'video.mp4', basename(sourcePath))
  const outputPath = join(workDir, outputName)
  const durationMs = input.endMs - input.startMs
  const requestedMode = input.mode === 'fast' ? 'fast' : 'accurate'

  try {
    const usedMode = await runClipWithFallback(status.path, { ...input, sourcePath, mode: requestedMode }, outputPath, durationMs)
    const info = await stat(outputPath)
    const data = await readFile(outputPath)
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined)
    return {
      ok: true,
      outputName,
      mode: usedMode,
      fallbackApplied: requestedMode === 'fast' && usedMode === 'accurate',
      data,
      size: info.size,
      mimeType: 'video/mp4',
    }
  } catch (error) {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined)
    return {
      ok: false,
      code: error instanceof FFmpegTimeoutError ? 'CLIP_TIMEOUT' : 'CLIP_FAILED',
      error: error instanceof Error ? error.message : 'Video clip failed.',
    }
  }
}

export function readFFmpegVersion(
  ffmpeg: string,
  options: {
    timeoutMs?: number
    spawnProcess?: FFmpegVersionSpawn
  } = {},
): Promise<string> {
  return new Promise((resolveRun, reject) => {
    const timeoutMs = options.timeoutMs ?? FFMPEG_STATUS_TIMEOUT_MS
    const spawnProcess: FFmpegVersionSpawn = options.spawnProcess ?? spawn
    const child = spawnProcess(ffmpeg, ['-version'], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let settled = false
    const timeout = timeoutMs > 0
      ? setTimeout(() => {
        if (settled) return
        settled = true
        child.kill('SIGKILL')
        reject(new FFmpegTimeoutError(timeoutMs))
      }, timeoutMs)
      : undefined
    const settle = (handler: () => void) => {
      if (settled) return
      settled = true
      if (timeout) clearTimeout(timeout)
      handler()
    }
    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', (error) => settle(() => reject(error instanceof Error ? error : new Error(String(error)))))
    child.on('exit', (code) => {
      settle(() => {
        if (code === 0) {
          resolveRun(stdout.split(/\r?\n/)[0]?.trim() || 'ffmpeg')
          return
        }
        reject(new Error(stderr.trim() || `ffmpeg -version exited with code ${code ?? 'unknown'}`))
      })
    })
  })
}

function validateClipInput(input: VideoClipInput): VideoClipResult | undefined {
  const sourcePath = input.sourcePath?.trim()
  const sourceData = input.sourceData
  if (!sourcePath && !sourceData) return { ok: false, code: 'SOURCE_REQUIRED', error: 'Source video is required.' }
  if (sourcePath) {
    if (!existsSync(sourcePath)) return { ok: false, code: 'SOURCE_NOT_FOUND', error: 'Source video file was not found.' }
    const sourceSize = statSync(sourcePath).size
    if (sourceSize <= 0) {
      return { ok: false, code: 'SOURCE_EMPTY', error: 'Source video is empty.' }
    }
    if (sourceSize > MAX_CLIP_SOURCE_BYTES) {
      return { ok: false, code: 'SOURCE_TOO_LARGE', error: 'Source video is too large.' }
    }
  }
  if (sourceData && sourceData.byteLength <= 0) {
    return { ok: false, code: 'SOURCE_EMPTY', error: 'Source video is empty.' }
  }
  if (sourceData && sourceData.byteLength > MAX_CLIP_SOURCE_BYTES) {
    return { ok: false, code: 'SOURCE_TOO_LARGE', error: 'Source video is too large.' }
  }
  if (!Number.isFinite(input.startMs) || !Number.isFinite(input.endMs)) {
    return { ok: false, code: 'INVALID_RANGE', error: 'Clip range is invalid.' }
  }
  if (input.startMs < 0 || input.endMs <= input.startMs) {
    return { ok: false, code: 'INVALID_RANGE', error: 'Clip end must be later than clip start.' }
  }
  if (input.endMs - input.startMs > MAX_CLIP_DURATION_MS) {
    return { ok: false, code: 'CLIP_TOO_LONG', error: 'Clip duration is too long.' }
  }
  return undefined
}

export function getExpectedBundledFFmpegPath(options: FFmpegPathOptions = {}): string {
  const platform = options.platform ?? process.platform
  const arch = options.arch ?? process.arch
  const binary = ffmpegBinaryName(platform)
  const resourcesPath = options.resourcesPath ?? process.resourcesPath
  if (resourcesPath) return join(resourcesPath, 'ffmpeg', platform, arch, binary)
  return resolve(options.cwd ?? process.cwd(), 'vendor/ffmpeg', platform, arch, binary)
}

function ffmpegBinaryName(platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
}

function resolveFFmpegPath(options: FFmpegPathOptions = {}): string | undefined {
  const envPath = process.env.FFMPEG_PATH?.trim() || process.env.MOVSCRIPT_FFMPEG_PATH?.trim()
  if (envPath && existsSync(envPath)) return envPath

  const platform = options.platform ?? process.platform
  const arch = options.arch ?? process.arch
  const resourcesPath = options.resourcesPath ?? process.resourcesPath
  const cwd = options.cwd ?? process.cwd()
  const binary = ffmpegBinaryName(platform)
  const candidates = [
    join(resourcesPath || '', 'ffmpeg', platform, arch, binary),
    join(resourcesPath || '', 'ffmpeg', platform, binary),
    join(resourcesPath || '', 'ffmpeg', binary),
    join(resourcesPath || '', 'bin', binary),
    resolve(cwd, 'vendor/ffmpeg', platform, arch, binary),
    resolve(cwd, 'vendor/ffmpeg', platform, binary),
    resolve(cwd, '../../apps/frontend/vendor/ffmpeg', platform, arch, binary),
    resolve(cwd, '../../apps/frontend/vendor/ffmpeg', platform, binary),
    binary,
  ]
  return candidates.find((candidate) => candidate === binary || existsSync(candidate))
}

export function buildFFmpegArgs(input: VideoClipInput & { sourcePath: string }, outputPath: string, durationMs: number): string[] {
  const start = seconds(input.startMs)
  const duration = seconds(durationMs)
  if (input.mode === 'fast') {
    return [
      '-y',
      '-hide_banner',
      '-loglevel', 'error',
      '-ss', start,
      '-i', input.sourcePath,
      '-t', duration,
      '-map', '0:v:0',
      '-map', '0:a?',
      '-c', 'copy',
      '-movflags', '+faststart',
      outputPath,
    ]
  }
  return [
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-i', input.sourcePath,
    '-ss', start,
    '-t', duration,
    '-map', '0:v:0',
    '-map', '0:a?',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'veryfast',
    '-movflags', '+faststart',
    '-c:a', 'aac',
    '-b:a', '128k',
    outputPath,
  ]
}

export async function runClipWithFallback(
  ffmpeg: string,
  input: VideoClipInput & { sourcePath: string; mode: 'fast' | 'accurate' },
  outputPath: string,
  durationMs: number,
  run = runFFmpeg,
): Promise<'fast' | 'accurate'> {
  try {
    await run(ffmpeg, buildFFmpegArgs(input, outputPath, durationMs))
    return input.mode
  } catch (error) {
    if (input.mode !== 'fast') throw error
    await run(ffmpeg, buildFFmpegArgs({ ...input, mode: 'accurate' }, outputPath, durationMs))
    return 'accurate'
  }
}

export function runFFmpeg(
  ffmpeg: string,
  args: string[],
  options: {
    timeoutMs?: number
    stderrLimit?: number
    spawnProcess?: FFmpegSpawn
  } = {},
): Promise<void> {
  return new Promise((resolveRun, reject) => {
    const timeoutMs = options.timeoutMs ?? FFMPEG_TIMEOUT_MS
    const stderrLimit = options.stderrLimit ?? FFMPEG_STDERR_LIMIT
    const spawnProcess: FFmpegSpawn = options.spawnProcess ?? spawn
    const child = spawnProcess(ffmpeg, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    let settled = false
    const timeout = timeoutMs > 0
      ? setTimeout(() => {
        if (settled) return
        settled = true
        child.kill('SIGKILL')
        reject(new FFmpegTimeoutError(timeoutMs))
      }, timeoutMs)
      : undefined
    const settle = (handler: () => void) => {
      if (settled) return
      settled = true
      if (timeout) clearTimeout(timeout)
      handler()
    }
    child.stderr?.on('data', (chunk) => {
      stderr = appendLimited(stderr, String(chunk), stderrLimit)
    })
    child.on('error', (error) => settle(() => reject(error instanceof Error ? error : new Error(String(error)))))
    child.on('exit', (code) => {
      settle(() => {
        if (code === 0) {
          resolveRun()
          return
        }
        reject(new Error(stderr.trim() || `ffmpeg exited with code ${code ?? 'unknown'}`))
      })
    })
  })
}

function appendLimited(current: string, chunk: string, limit: number): string {
  if (limit <= 0) return ''
  const next = current + chunk
  return next.length <= limit ? next : next.slice(next.length - limit)
}

async function createFallbackWorkDir(): Promise<string> {
  const dir = join(tmpdir(), `movscript-video-clip-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  await mkdir(dir, { recursive: true })
  return dir
}

async function prepareInputFile(input: VideoClipInput, workDir: string): Promise<string> {
  if (input.sourcePath) return input.sourcePath
  const inputName = normalizeInputName(input.sourceName)
  const inputPath = join(workDir, inputName)
  const data = input.sourceData instanceof Uint8Array
    ? input.sourceData
    : new Uint8Array(input.sourceData ?? new ArrayBuffer(0))
  await writeFile(inputPath, data)
  return inputPath
}

function normalizeInputName(value: string | undefined): string {
  const raw = value?.trim() || 'input.mp4'
  const cleaned = replaceUnsafeFilenameChars(raw)
  const ext = extname(cleaned)
  const base = sanitizeFileBase(ext ? cleaned.slice(0, -ext.length) : cleaned, 'input')
  return `${base}${ext || '.mp4'}`
}

export function normalizeOutputName(value: string | undefined, sourcePath: string, inputName?: string): string {
  const sourceBase = sanitizeFileBase(basename(sourcePath, extname(sourcePath)), 'video', MAX_OUTPUT_BASENAME_LENGTH - OUTPUT_SUFFIX.length)
  const raw = value?.trim() || `${sourceBase}${OUTPUT_SUFFIX}.mp4`
  const cleaned = replaceUnsafeFilenameChars(raw)
  const ext = extname(cleaned).toLowerCase()
  const base = sanitizeFileBase(ext ? cleaned.slice(0, -ext.length) : cleaned, `${sourceBase}${OUTPUT_SUFFIX}`)
  const normalized = `${base}.mp4`
  if (inputName && normalized.toLowerCase() === inputName.toLowerCase()) {
    const base = sanitizeFileBase(basename(normalized, extname(normalized)), 'video')
    return `${base}${OUTPUT_SUFFIX}.mp4`
  }
  return normalized
}

function replaceUnsafeFilenameChars(value: string): string {
  return value.replace(/[\u0000-\u001f<>:"|?*\\/]+/g, '_')
}

function sanitizeFileBase(value: string, fallback: string, limit = MAX_OUTPUT_BASENAME_LENGTH): string {
  const sanitized = value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^\.+$/, '')
    .replace(/^\.*/, '')
    .replace(/\.*$/, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, limit)
  const base = sanitized || fallback
  if (!WINDOWS_RESERVED_BASENAME_PATTERN.test(base)) return base
  return `${base.slice(0, Math.max(1, limit - 5))}_file`
}

function seconds(ms: number): string {
  return (Math.max(0, ms) / 1000).toFixed(3)
}
