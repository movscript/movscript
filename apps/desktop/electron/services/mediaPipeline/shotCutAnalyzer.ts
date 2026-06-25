import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { extname, join } from 'path'

import { getMediaPipelineFFmpegStatus } from './ffmpegProbe'
import { MediaPipelineFFmpegTimeoutError, runMediaPipelineFFmpeg } from './ffmpegRunner'

export interface MediaPipelineShotCutInput {
  sourceData?: ArrayBuffer | Uint8Array
  sourceName?: string
  durationSec?: number
  sceneThreshold?: number
  minShotDurationSec?: number
  maxShotDurationSec?: number
}

export interface MediaPipelineShotCutSegment {
  startSec: number
  endSec: number
}

export interface MediaPipelineShotCutResult {
  ok: boolean
  strategy?: 'scene_detection' | 'even'
  shots?: MediaPipelineShotCutSegment[]
  error?: string
  code?: string
}

const MEDIA_PIPELINE_SHOT_CUT_MAX_SOURCE_BYTES = 1024 * 1024 * 1024
const MEDIA_PIPELINE_SCENE_DETECT_OUTPUT_LIMIT = 512 * 1024
const DEFAULT_SCENE_THRESHOLD = 0.28
const DEFAULT_MIN_SHOT_DURATION_SEC = 1.2
const DEFAULT_MAX_SHOT_DURATION_SEC = 12
const DEFAULT_TARGET_SHOT_DURATION_SEC = 6

export async function analyzeMediaPipelineShotCuts(input: MediaPipelineShotCutInput): Promise<MediaPipelineShotCutResult> {
  const durationSec = normalizedPositiveNumber(input.durationSec)
  if (!durationSec) {
    return { ok: false, code: 'SHOT_CUT_DURATION_MISSING', error: 'Video duration is required for local shot cutting.' }
  }
  if (!input.sourceData) {
    return { ok: true, strategy: 'even', shots: buildMediaPipelineEvenShotSegments(durationSec) }
  }
  const sourceBytes = input.sourceData instanceof Uint8Array ? input.sourceData : new Uint8Array(input.sourceData)
  if (sourceBytes.byteLength === 0) {
    return { ok: true, strategy: 'even', shots: buildMediaPipelineEvenShotSegments(durationSec) }
  }
  if (sourceBytes.byteLength > MEDIA_PIPELINE_SHOT_CUT_MAX_SOURCE_BYTES) {
    return { ok: false, code: 'SHOT_CUT_SOURCE_TOO_LARGE', error: 'Video source is too large for local shot cutting.' }
  }

  const status = await getMediaPipelineFFmpegStatus()
  if (!status.available || !status.path) {
    return { ok: true, strategy: 'even', shots: buildMediaPipelineEvenShotSegments(durationSec) }
  }

  const workDir = await mkdtemp(join(tmpdir(), 'movscript-shot-cut-')).catch(createMediaPipelineShotCutFallbackWorkDir)
  const inputPath = join(workDir, normalizeMediaPipelineShotCutInputName(input.sourceName))
  try {
    await writeFile(inputPath, sourceBytes)
    const output = await runMediaPipelineSceneDetect(status.path, inputPath, {
      sceneThreshold: input.sceneThreshold,
    })
    const sceneTimes = parseMediaPipelineSceneDetectTimes(output)
    const shots = buildMediaPipelineSceneShotSegments(durationSec, sceneTimes, input)
    return shots.length > 0
      ? { ok: true, strategy: 'scene_detection', shots }
      : { ok: true, strategy: 'even', shots: buildMediaPipelineEvenShotSegments(durationSec) }
  } catch (error) {
    return {
      ok: true,
      strategy: 'even',
      shots: buildMediaPipelineEvenShotSegments(durationSec),
      error: error instanceof Error ? error.message : 'Local shot cutting failed.',
      code: error instanceof MediaPipelineFFmpegTimeoutError ? 'SHOT_CUT_TIMEOUT' : 'SHOT_CUT_FALLBACK',
    }
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

export function parseMediaPipelineSceneDetectTimes(output: string): number[] {
  const times = new Set<number>()
  for (const match of output.matchAll(/\bpts_time:([0-9]+(?:\.[0-9]+)?)/g)) {
    const value = Number(match[1])
    if (Number.isFinite(value) && value > 0) times.add(roundTime(value))
  }
  return Array.from(times).sort((a, b) => a - b)
}

export function buildMediaPipelineSceneShotSegments(
  durationSec: number,
  sceneTimes: number[],
  input: Pick<MediaPipelineShotCutInput, 'minShotDurationSec' | 'maxShotDurationSec'> = {},
): MediaPipelineShotCutSegment[] {
  const duration = normalizedPositiveNumber(durationSec)
  if (!duration) return []
  const minDuration = normalizedPositiveNumber(input.minShotDurationSec) ?? DEFAULT_MIN_SHOT_DURATION_SEC
  const maxDuration = normalizedPositiveNumber(input.maxShotDurationSec) ?? DEFAULT_MAX_SHOT_DURATION_SEC
  const boundaries = normalizeSceneBoundaries(sceneTimes, duration, minDuration, maxDuration)
  return rangesFromBoundaries(duration, boundaries)
}

export function buildMediaPipelineEvenShotSegments(durationSec: number): MediaPipelineShotCutSegment[] {
  const duration = normalizedPositiveNumber(durationSec)
  if (!duration) return []
  const segmentCount = Math.max(1, Math.ceil(duration / DEFAULT_TARGET_SHOT_DURATION_SEC))
  const segmentLength = duration / segmentCount
  return Array.from({ length: segmentCount }, (_, index) => ({
    startSec: roundTime(index * segmentLength),
    endSec: roundTime(index === segmentCount - 1 ? duration : (index + 1) * segmentLength),
  }))
}

async function runMediaPipelineSceneDetect(
  ffmpeg: string,
  inputPath: string,
  options: {
    sceneThreshold?: number
    timeoutMs?: number
  } = {},
): Promise<string> {
  const sceneThreshold = normalizedPositiveNumber(options.sceneThreshold) ?? DEFAULT_SCENE_THRESHOLD
  const args = [
    '-hide_banner',
    '-i', inputPath,
    '-filter:v', `select='gt(scene,${sceneThreshold})',showinfo`,
    '-an',
    '-f', 'null',
    '-',
  ]
  let output = ''
  await runMediaPipelineFFmpeg(ffmpeg, args, {
    timeoutMs: options.timeoutMs ?? 0,
    onOutput: (chunk) => {
      output += chunk.chunk
      if (output.length > MEDIA_PIPELINE_SCENE_DETECT_OUTPUT_LIMIT) {
        output = output.slice(output.length - MEDIA_PIPELINE_SCENE_DETECT_OUTPUT_LIMIT)
      }
    },
  })
  return output
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
): void {
  if (maxDurationSec <= 0) return
  let cursor = startSec
  while (endSec - cursor > maxDurationSec) {
    cursor = roundTime(cursor + maxDurationSec)
    if (cursor < endSec) boundaries.push(cursor)
  }
}

function rangesFromBoundaries(durationSec: number, boundaries: number[]): MediaPipelineShotCutSegment[] {
  const points = [0, ...boundaries, durationSec]
  const result: MediaPipelineShotCutSegment[] = []
  for (let index = 0; index < points.length - 1; index += 1) {
    const startSec = roundTime(points[index])
    const endSec = roundTime(points[index + 1])
    if (endSec > startSec) result.push({ startSec, endSec })
  }
  return result
}

async function createMediaPipelineShotCutFallbackWorkDir(): Promise<string> {
  const dir = join(tmpdir(), `movscript-shot-cut-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  await mkdir(dir, { recursive: true })
  return dir
}

function normalizeMediaPipelineShotCutInputName(value: string | undefined): string {
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
