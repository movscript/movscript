import { spawn } from 'child_process'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { extname, join } from 'path'
import type { Readable } from 'stream'

import { MAX_CLIP_SOURCE_BYTES } from './constants'
import { getVideoClipStatus } from './ffmpeg'
import { createFallbackWorkDir } from './files'
import { FFmpegTimeoutError } from './ffmpegRun'
import type { VideoShotCutInput, VideoShotCutResult, VideoShotCutSegment } from './types'

const DEFAULT_SCENE_THRESHOLD = 0.28
const DEFAULT_MIN_SHOT_DURATION_SEC = 1.2
const DEFAULT_MAX_SHOT_DURATION_SEC = 12
const DEFAULT_TARGET_SHOT_DURATION_SEC = 6

type FFmpegOutputProcess = {
  stdout?: Readable
  stderr?: Readable
  kill: (signal?: NodeJS.Signals | number) => boolean
  on: (event: 'error' | 'exit', listener: (value: Error | number | null) => void) => FFmpegOutputProcess
}

type FFmpegOutputSpawn = (
  command: string,
  args: string[],
  options: { stdio: ['ignore', 'pipe', 'pipe'] },
) => FFmpegOutputProcess

export async function analyzeShotCuts(input: VideoShotCutInput): Promise<VideoShotCutResult> {
  const durationSec = normalizedPositiveNumber(input.durationSec)
  if (!durationSec) {
    return { ok: false, code: 'SHOT_CUT_DURATION_MISSING', error: 'Video duration is required for local shot cutting.' }
  }
  if (!input.sourceData) {
    return { ok: true, strategy: 'even', shots: buildEvenShotSegments(durationSec) }
  }
  const sourceBytes = input.sourceData instanceof Uint8Array ? input.sourceData : new Uint8Array(input.sourceData)
  if (sourceBytes.byteLength === 0) {
    return { ok: true, strategy: 'even', shots: buildEvenShotSegments(durationSec) }
  }
  if (sourceBytes.byteLength > MAX_CLIP_SOURCE_BYTES) {
    return { ok: false, code: 'SHOT_CUT_SOURCE_TOO_LARGE', error: 'Video source is too large for local shot cutting.' }
  }

  const status = await getVideoClipStatus()
  if (!status.available || !status.path) {
    return { ok: true, strategy: 'even', shots: buildEvenShotSegments(durationSec) }
  }

  const workDir = await mkdtemp(join(tmpdir(), 'movscript-shot-cut-')).catch(createFallbackWorkDir)
  const inputPath = join(workDir, normalizeShotCutInputName(input.sourceName))
  try {
    await writeFile(inputPath, sourceBytes)
    const stderr = await runFFmpegSceneDetect(status.path, inputPath, {
      sceneThreshold: input.sceneThreshold,
    })
    const sceneTimes = parseSceneDetectTimes(stderr)
    const shots = buildSceneShotSegments(durationSec, sceneTimes, input)
    return shots.length > 0
      ? { ok: true, strategy: 'scene_detection', shots }
      : { ok: true, strategy: 'even', shots: buildEvenShotSegments(durationSec) }
  } catch (error) {
    return {
      ok: true,
      strategy: 'even',
      shots: buildEvenShotSegments(durationSec),
      error: error instanceof Error ? error.message : 'Local shot cutting failed.',
      code: error instanceof FFmpegTimeoutError ? 'SHOT_CUT_TIMEOUT' : 'SHOT_CUT_FALLBACK',
    }
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

export function parseSceneDetectTimes(output: string): number[] {
  const times = new Set<number>()
  for (const match of output.matchAll(/\bpts_time:([0-9]+(?:\.[0-9]+)?)/g)) {
    const value = Number(match[1])
    if (Number.isFinite(value) && value > 0) times.add(roundTime(value))
  }
  return Array.from(times).sort((a, b) => a - b)
}

export function buildSceneShotSegments(
  durationSec: number,
  sceneTimes: number[],
  input: Pick<VideoShotCutInput, 'minShotDurationSec' | 'maxShotDurationSec'> = {},
): VideoShotCutSegment[] {
  const duration = normalizedPositiveNumber(durationSec)
  if (!duration) return []
  const minDuration = normalizedPositiveNumber(input.minShotDurationSec) ?? DEFAULT_MIN_SHOT_DURATION_SEC
  const maxDuration = normalizedPositiveNumber(input.maxShotDurationSec) ?? DEFAULT_MAX_SHOT_DURATION_SEC
  const boundaries = normalizeSceneBoundaries(sceneTimes, duration, minDuration, maxDuration)
  return rangesFromBoundaries(duration, boundaries)
}

export function buildEvenShotSegments(durationSec: number): VideoShotCutSegment[] {
  const duration = normalizedPositiveNumber(durationSec)
  if (!duration) return []
  const segmentCount = Math.max(1, Math.ceil(duration / DEFAULT_TARGET_SHOT_DURATION_SEC))
  const segmentLength = duration / segmentCount
  return Array.from({ length: segmentCount }, (_, index) => ({
    startSec: roundTime(index * segmentLength),
    endSec: roundTime(index === segmentCount - 1 ? duration : (index + 1) * segmentLength),
  }))
}

function runFFmpegSceneDetect(
  ffmpeg: string,
  inputPath: string,
  options: {
    sceneThreshold?: number
    timeoutMs?: number
    spawnProcess?: FFmpegOutputSpawn
  } = {},
): Promise<string> {
  return new Promise((resolveRun, reject) => {
    const sceneThreshold = normalizedPositiveNumber(options.sceneThreshold) ?? DEFAULT_SCENE_THRESHOLD
    const timeoutMs = options.timeoutMs ?? 0
    const spawnProcess: FFmpegOutputSpawn = options.spawnProcess ?? spawn
    const args = [
      '-hide_banner',
      '-i', inputPath,
      '-filter:v', `select='gt(scene,${sceneThreshold})',showinfo`,
      '-an',
      '-f', 'null',
      '-',
    ]
    const child = spawnProcess(ffmpeg, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
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
    const append = (chunk: unknown) => {
      output += String(chunk)
      if (output.length > 512 * 1024) output = output.slice(output.length - 512 * 1024)
    }
    child.stdout?.on('data', append)
    child.stderr?.on('data', append)
    child.on('error', (error) => settle(() => reject(error instanceof Error ? error : new Error(String(error)))))
    child.on('exit', (code) => {
      settle(() => {
        if (code === 0) {
          resolveRun(output)
          return
        }
        reject(new Error(output.trim() || `ffmpeg scene detection exited with code ${code ?? 'unknown'}`))
      })
    })
  })
}

function normalizeSceneBoundaries(
  sceneTimes: number[],
  durationSec: number,
  minDurationSec: number,
  maxDurationSec: number,
): number[] {
  const boundaries: number[] = []
  let previous = 0
  const candidates = sceneTimes
    .map(roundTime)
    .filter(time => time > 0 && time < durationSec)
    .sort((a, b) => a - b)
  for (const candidate of candidates) {
    addForcedBoundaries(boundaries, previous, candidate, maxDurationSec)
    previous = boundaries[boundaries.length - 1] ?? previous
    if (candidate - previous >= minDurationSec && durationSec - candidate >= minDurationSec) {
      boundaries.push(candidate)
      previous = candidate
    }
  }
  addForcedBoundaries(boundaries, previous, durationSec, maxDurationSec)
  return boundaries
}

function addForcedBoundaries(
  boundaries: number[],
  startSec: number,
  endSec: number,
  maxDurationSec: number,
) {
  if (maxDurationSec <= 0) return
  let cursor = startSec
  while (endSec - cursor > maxDurationSec) {
    cursor = roundTime(cursor + maxDurationSec)
    if (cursor < endSec) boundaries.push(cursor)
  }
}

function rangesFromBoundaries(durationSec: number, boundaries: number[]): VideoShotCutSegment[] {
  const points = [0, ...boundaries, durationSec]
  const result: VideoShotCutSegment[] = []
  for (let index = 0; index < points.length - 1; index += 1) {
    const startSec = roundTime(points[index])
    const endSec = roundTime(points[index + 1])
    if (endSec > startSec) result.push({ startSec, endSec })
  }
  return result
}

function normalizeShotCutInputName(value: string | undefined): string {
  const raw = value?.trim() || 'input.mp4'
  const cleaned = raw.replace(/[\u0000-\u001f<>:"|?*\\/]+/g, '_')
  const ext = extname(cleaned)
  const base = (ext ? cleaned.slice(0, -ext.length) : cleaned).trim().replace(/\s+/g, ' ').slice(0, 80) || 'input'
  return `${base}${ext || '.mp4'}`
}

function normalizedPositiveNumber(value: unknown): number | undefined {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function roundTime(value: number): number {
  return Math.round(value * 10) / 10
}
