import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ResourceFileDownloadAuthContext, ResourceFileDownloadPort, ResourceFileDownloadResult } from '../../ports/files/resourceDownloadPort.js'

export type VideoFrameExtractionMode = 'overview' | 'timestamps' | 'range' | 'burst'
export type VideoFrameOutputLayout = 'individual' | 'contact_sheet' | 'both'

export interface VideoFrameExtractionRequest {
  resourceId: number
  count: number
  timestampsSec?: number[]
  mode?: VideoFrameExtractionMode
  startSec?: number
  endSec?: number
  centerSec?: number
  windowSec?: number
  fps?: number
  intervalSec?: number
  maxFrames?: number
  outputLayout?: VideoFrameOutputLayout
  maxWidth: number
  imageFormat: 'jpeg' | 'png'
  resourceFileDownloader: ResourceFileDownloadPort
  auth?: ResourceFileDownloadAuthContext
  signal?: AbortSignal
}

export interface VideoFrameSourceMetadata {
  durationSec?: number
  width?: number
  height?: number
  fps?: number
}

export interface VideoFrameSamplingPlan {
  mode: VideoFrameExtractionMode
  timestampsSec: number[]
  requestedFrameCount: number
  returnedFrameCount: number
  maxFrames: number
  startSec?: number
  endSec?: number
  centerSec?: number
  windowSec?: number
  fps?: number
  intervalSec?: number
  warnings: string[]
}

export interface ExtractedVideoFrame {
  index: number
  timestampSec: number
  mimeType: 'image/jpeg' | 'image/png'
  sizeBytes: number
  dataUrl: string
}

export interface VideoFrameExtraction {
  status: 'extracted'
  resourceId: number
  frameCount: number
  frames: ExtractedVideoFrame[]
  download: ResourceFileDownloadResult
  durationSec?: number
  video?: VideoFrameSourceMetadata
  sampling: VideoFrameSamplingPlan
  outputLayout: VideoFrameOutputLayout
  warnings?: string[]
}

const DEFAULT_OVERVIEW_COUNT = 4
const DEFAULT_MAX_FRAMES = 8
const ABSOLUTE_MAX_FRAMES = 16
const DEFAULT_MAX_WIDTH = 768
const MAX_FPS = 6
const DEFAULT_RANGE_FPS = 2
const DEFAULT_BURST_WINDOW_SEC = 2

export async function extractVideoFramesFromBackendResource(input: VideoFrameExtractionRequest): Promise<VideoFrameExtraction> {
  const dir = await mkdtemp(join(tmpdir(), 'movscript-video-frames-'))
  const inputPath = join(dir, `resource-${input.resourceId}.video`)
  try {
    const download = await input.resourceFileDownloader.downloadResourceFile(input.resourceId, inputPath, input.auth, { signal: input.signal })
    if (!download.performed) {
      throw new Error(download.skippedReason ?? 'backend resource download was not performed')
    }

    const video = await probeVideoMetadata(inputPath, input.signal)
    const durationSec = video.durationSec
    const sampling = buildFrameSamplingPlan(input, video)
    const timestamps = sampling.timestampsSec
    const frames: ExtractedVideoFrame[] = []
    const mimeType = input.imageFormat === 'png' ? 'image/png' as const : 'image/jpeg' as const
    const extension = input.imageFormat === 'png' ? 'png' : 'jpg'
    for (let index = 0; index < timestamps.length; index += 1) {
      const timestamp = timestamps[index] ?? 0
      const outputPath = join(dir, `frame-${String(index + 1).padStart(3, '0')}.${extension}`)
      await runCommand('ffmpeg', [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-ss',
        timestamp.toFixed(3),
        '-i',
        inputPath,
        '-frames:v',
        '1',
        '-vf',
        `scale=${input.maxWidth}:-2:force_original_aspect_ratio=decrease`,
        ...(input.imageFormat === 'jpeg' ? ['-q:v', '3'] : []),
        outputPath,
      ], input.signal)
      const bytes = await readFile(outputPath)
      const fileStat = await stat(outputPath)
      frames.push({
        index: index + 1,
        timestampSec: timestamp,
        mimeType,
        sizeBytes: fileStat.size,
        dataUrl: `data:${mimeType};base64,${bytes.toString('base64')}`,
      })
    }

    return {
      status: 'extracted',
      resourceId: input.resourceId,
      frameCount: frames.length,
      frames,
      download,
      video,
      sampling: {
        ...sampling,
        returnedFrameCount: frames.length,
      },
      outputLayout: input.outputLayout ?? 'individual',
      ...(durationSec !== undefined ? { durationSec } : {}),
      ...(sampling.warnings.length > 0 ? { warnings: sampling.warnings } : {}),
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function probeVideoMetadata(path: string, signal?: AbortSignal): Promise<VideoFrameSourceMetadata> {
  const result = await runCommand('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration:stream=width,height,avg_frame_rate,r_frame_rate',
    '-of',
    'json',
    path,
  ], signal)
  const parsed = JSON.parse(result.stdout) as {
    format?: { duration?: string }
    streams?: Array<{ width?: number; height?: number; avg_frame_rate?: string; r_frame_rate?: string }>
  }
  const stream = parsed.streams?.find(item => typeof item.width === 'number' && typeof item.height === 'number') ?? parsed.streams?.[0]
  const durationSec = positiveNumber(Number(parsed.format?.duration))
  return {
    ...(durationSec !== undefined ? { durationSec } : {}),
    ...(positiveInteger(stream?.width) !== undefined ? { width: positiveInteger(stream?.width) } : {}),
    ...(positiveInteger(stream?.height) !== undefined ? { height: positiveInteger(stream?.height) } : {}),
    ...(parseFrameRate(stream?.avg_frame_rate) ?? parseFrameRate(stream?.r_frame_rate) ? { fps: parseFrameRate(stream?.avg_frame_rate) ?? parseFrameRate(stream?.r_frame_rate) } : {}),
  }
}

export function buildFrameSamplingPlan(input: {
  count?: number
  timestampsSec?: number[]
  mode?: VideoFrameExtractionMode
  startSec?: number
  endSec?: number
  centerSec?: number
  windowSec?: number
  fps?: number
  intervalSec?: number
  maxFrames?: number
}, video: VideoFrameSourceMetadata = {}): VideoFrameSamplingPlan {
  const warnings: string[] = []
  const maxFrames = clampInteger(input.maxFrames ?? DEFAULT_MAX_FRAMES, 1, ABSOLUTE_MAX_FRAMES)
  const mode = resolveMode(input)
  const durationSec = video.durationSec
  let timestampsSec: number[] = []
  const requested = requestedFrameCount(input, mode, durationSec)

  if (mode === 'timestamps') {
    timestampsSec = normalizeExplicitTimestamps(input.timestampsSec, maxFrames, durationSec, warnings)
  } else if (mode === 'range') {
    const range = normalizeRange(input.startSec, input.endSec, durationSec, warnings)
    timestampsSec = timestampsForRange(range.startSec, range.endSec, input, maxFrames, warnings)
    return {
      mode,
      timestampsSec,
      requestedFrameCount: requested,
      returnedFrameCount: timestampsSec.length,
      maxFrames,
      startSec: range.startSec,
      endSec: range.endSec,
      ...(samplingFps(input) !== undefined ? { fps: samplingFps(input) } : {}),
      ...(samplingIntervalSec(input) !== undefined ? { intervalSec: samplingIntervalSec(input) } : {}),
      warnings,
    }
  } else if (mode === 'burst') {
    const burst = normalizeBurst(input.centerSec, input.windowSec, durationSec, warnings)
    timestampsSec = timestampsForRange(burst.startSec, burst.endSec, input, maxFrames, warnings)
    return {
      mode,
      timestampsSec,
      requestedFrameCount: requested,
      returnedFrameCount: timestampsSec.length,
      maxFrames,
      startSec: burst.startSec,
      endSec: burst.endSec,
      centerSec: burst.centerSec,
      windowSec: burst.windowSec,
      ...(samplingFps(input) !== undefined ? { fps: samplingFps(input) } : {}),
      ...(samplingIntervalSec(input) !== undefined ? { intervalSec: samplingIntervalSec(input) } : {}),
      warnings,
    }
  } else {
    timestampsSec = overviewTimestamps(input.count ?? DEFAULT_OVERVIEW_COUNT, maxFrames, durationSec)
  }

  if (timestampsSec.length === 0) timestampsSec = durationSec && durationSec > 0 ? [roundTime(durationSec / 2)] : [0]
  return {
    mode,
    timestampsSec,
    requestedFrameCount: requested,
    returnedFrameCount: timestampsSec.length,
    maxFrames,
    warnings,
  }
}

function resolveMode(input: { mode?: VideoFrameExtractionMode; timestampsSec?: number[]; startSec?: number; endSec?: number; centerSec?: number }): VideoFrameExtractionMode {
  if (input.mode) return input.mode
  if (input.timestampsSec && input.timestampsSec.length > 0) return 'timestamps'
  if (input.centerSec !== undefined) return 'burst'
  if (input.startSec !== undefined || input.endSec !== undefined) return 'range'
  return 'overview'
}

function requestedFrameCount(input: { count?: number; timestampsSec?: number[]; maxFrames?: number; startSec?: number; endSec?: number; centerSec?: number; windowSec?: number; fps?: number; intervalSec?: number }, mode: VideoFrameExtractionMode, durationSec: number | undefined): number {
  if (mode === 'timestamps') return input.timestampsSec?.length ?? 0
  if (mode === 'range' || mode === 'burst') {
    const startSec = mode === 'burst'
      ? Math.max(0, (input.centerSec ?? 0) - (input.windowSec ?? DEFAULT_BURST_WINDOW_SEC) / 2)
      : input.startSec ?? 0
    const endSec = mode === 'burst'
      ? (input.centerSec ?? 0) + (input.windowSec ?? DEFAULT_BURST_WINDOW_SEC) / 2
      : input.endSec ?? durationSec ?? startSec
    const interval = samplingIntervalSec(input) ?? (1 / (samplingFps(input) ?? DEFAULT_RANGE_FPS))
    return Math.max(1, Math.floor(Math.max(0, endSec - startSec) / interval) + 1)
  }
  return input.count ?? DEFAULT_OVERVIEW_COUNT
}

function normalizeExplicitTimestamps(timestampsSec: number[] | undefined, maxFrames: number, durationSec: number | undefined, warnings: string[]): number[] {
  const explicit = (timestampsSec ?? [])
    .filter((value) => Number.isFinite(value) && value >= 0)
    .map(value => clampToDuration(value, durationSec))
    .map(roundTime)
  if (explicit.length > maxFrames) {
    warnings.push(`Requested ${explicit.length} timestamps; returned the first ${maxFrames} due to max_frames.`)
  }
  return uniqueSorted(explicit).slice(0, maxFrames)
}

function overviewTimestamps(count: number, maxFrames: number, durationSec: number | undefined): number[] {
  const frameCount = clampInteger(count, 1, maxFrames)
  if (!durationSec || durationSec <= 0) return [0]
  if (frameCount <= 1) return [roundTime(durationSec / 2)]
  const margin = Math.min(1, Math.max(0.1, durationSec * 0.08))
  const start = Math.min(durationSec, margin)
  const end = Math.max(start, durationSec - margin)
  const step = frameCount === 1 ? 0 : (end - start) / (frameCount - 1)
  return uniqueSorted(Array.from({ length: frameCount }, (_, index) => roundTime(start + step * index)))
}

function normalizeRange(start: number | undefined, end: number | undefined, durationSec: number | undefined, warnings: string[]): { startSec: number; endSec: number } {
  const normalizedStart = clampToDuration(Math.max(0, start ?? 0), durationSec)
  const fallbackEnd = durationSec ?? normalizedStart
  let normalizedEnd = clampToDuration(Math.max(0, end ?? fallbackEnd), durationSec)
  if (normalizedEnd < normalizedStart) {
    warnings.push('end_sec was before start_sec; the range was normalized to a single timestamp.')
    normalizedEnd = normalizedStart
  }
  return { startSec: roundTime(normalizedStart), endSec: roundTime(normalizedEnd) }
}

function normalizeBurst(center: number | undefined, windowSec: number | undefined, durationSec: number | undefined, warnings: string[]): { startSec: number; endSec: number; centerSec: number; windowSec: number } {
  const normalizedWindow = Math.max(0, windowSec ?? DEFAULT_BURST_WINDOW_SEC)
  const normalizedCenter = clampToDuration(Math.max(0, center ?? 0), durationSec)
  const startSec = clampToDuration(Math.max(0, normalizedCenter - normalizedWindow / 2), durationSec)
  let endSec = clampToDuration(normalizedCenter + normalizedWindow / 2, durationSec)
  if (endSec < startSec) {
    warnings.push('burst window could not be applied; the range was normalized to a single timestamp.')
    endSec = startSec
  }
  return { startSec: roundTime(startSec), endSec: roundTime(endSec), centerSec: roundTime(normalizedCenter), windowSec: roundTime(normalizedWindow) }
}

function timestampsForRange(startSec: number, endSec: number, input: { fps?: number; intervalSec?: number }, maxFrames: number, warnings: string[]): number[] {
  const interval = samplingIntervalSec(input) ?? (1 / (samplingFps(input) ?? DEFAULT_RANGE_FPS))
  const timestamps: number[] = []
  for (let timestamp = startSec; timestamp <= endSec + 0.0001; timestamp += interval) {
    timestamps.push(roundTime(timestamp))
  }
  if (timestamps.length === 0) timestamps.push(roundTime(startSec))
  if (timestamps.length > maxFrames) {
    warnings.push(`Requested ${timestamps.length} frames for the time range; downsampled to ${maxFrames} due to max_frames.`)
    return downsample(timestamps, maxFrames)
  }
  return uniqueSorted(timestamps)
}

function samplingFps(input: { fps?: number }): number | undefined {
  const fps = positiveNumber(input.fps)
  return fps === undefined ? undefined : Math.min(fps, MAX_FPS)
}

function samplingIntervalSec(input: { intervalSec?: number }): number | undefined {
  return positiveNumber(input.intervalSec)
}

function downsample(values: number[], maxItems: number): number[] {
  if (values.length <= maxItems) return uniqueSorted(values)
  if (maxItems <= 1) return [values[0] ?? 0]
  const step = (values.length - 1) / (maxItems - 1)
  return uniqueSorted(Array.from({ length: maxItems }, (_, index) => values[Math.round(index * step)] ?? values[values.length - 1] ?? 0))
}

function clampToDuration(value: number, durationSec: number | undefined): number {
  if (!durationSec || durationSec <= 0) return value
  return Math.min(value, durationSec)
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values.map(roundTime))].sort((left, right) => left - right)
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(Math.floor(value), max))
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

function parseFrameRate(value: string | undefined): number | undefined {
  if (!value || value === '0/0') return undefined
  const [numerator, denominator] = value.split('/').map(Number)
  if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0) return roundTime(numerator / denominator)
  const parsed = Number(value)
  return positiveNumber(parsed)
}

function roundTime(value: number): number {
  return Number(value.toFixed(3))
}

async function runCommand(command: string, args: string[], signal?: AbortSignal): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError())
      return
    }
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    const onAbort = () => child.kill('SIGTERM')
    signal?.addEventListener('abort', onAbort, { once: true })
    child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)))
    child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)))
    child.on('error', (error: NodeJS.ErrnoException) => {
      signal?.removeEventListener('abort', onAbort)
      if (error.code === 'ENOENT') {
        reject(new Error(`local video frame extraction requires ${command} on PATH`))
        return
      }
      reject(error)
    })
    child.on('close', (code, termSignal) => {
      signal?.removeEventListener('abort', onAbort)
      const out = Buffer.concat(stdout).toString('utf8')
      const err = Buffer.concat(stderr).toString('utf8')
      if (signal?.aborted) {
        reject(abortError())
        return
      }
      if (code === 0) {
        resolve({ stdout: out, stderr: err })
        return
      }
      reject(new Error(`${command} failed${code !== null ? ` with exit code ${code}` : ''}${termSignal ? ` (${termSignal})` : ''}${err.trim() ? `: ${err.trim()}` : ''}`))
    })
  })
}

function abortError(): Error {
  const error = new Error('The operation was aborted')
  error.name = 'AbortError'
  return error
}
