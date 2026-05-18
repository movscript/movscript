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
  speed?: number
  fadeInMs?: number
  fadeOutMs?: number
  cropLeftPercent?: number
  cropRightPercent?: number
  cropTopPercent?: number
  cropBottomPercent?: number
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
  missingFilters?: string[]
}

export interface VideoTimelineExportClipInput {
  sourceData?: ArrayBuffer | Uint8Array
  sourceName?: string
  startMs: number
  endMs: number
  timelineStartMs?: number
  layerIndex?: number
  volume?: number
  muted?: boolean
  speed?: number
  fadeInMs?: number
  fadeOutMs?: number
  cropLeftPercent?: number
  cropRightPercent?: number
  cropTopPercent?: number
  cropBottomPercent?: number
}

export interface VideoTimelineExportCaptionInput {
  startMs: number
  endMs: number
  text: string
  layerIndex?: number
  fontSize?: number
  yPercent?: number
  textColor?: string
  boxOpacityPercent?: number
}

export interface VideoTimelineExportAudioInput {
  sourceData?: ArrayBuffer | Uint8Array
  sourceName?: string
  startMs: number
  endMs: number
  timelineStartMs: number
  volume?: number
  fadeInMs?: number
  fadeOutMs?: number
}

export interface VideoTimelineExportOverlayInput {
  sourceData?: ArrayBuffer | Uint8Array
  sourceName?: string
  sourceKind?: 'image' | 'video'
  startMs: number
  endMs: number
  sourceStartMs?: number
  sourceEndMs?: number
  layerIndex?: number
  fadeInMs?: number
  fadeOutMs?: number
  cropLeftPercent?: number
  cropRightPercent?: number
  cropTopPercent?: number
  cropBottomPercent?: number
  xPercent?: number
  yPercent?: number
  scalePercent?: number
  opacityPercent?: number
}

export interface VideoTimelineExportInput {
  clips: VideoTimelineExportClipInput[]
  captions?: VideoTimelineExportCaptionInput[]
  audioClips?: VideoTimelineExportAudioInput[]
  overlays?: VideoTimelineExportOverlayInput[]
  outputName?: string
}

export interface VideoClipStatus {
  available: boolean
  path?: string
  version?: string
  error?: string
  code?: 'FFMPEG_NOT_FOUND' | 'FFMPEG_UNAVAILABLE'
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
const MAX_TIMELINE_EXPORT_CLIPS = 100
const MAX_TIMELINE_EXPORT_CAPTIONS = 500
const MAX_TIMELINE_EXPORT_AUDIO_CLIPS = 50
const MAX_TIMELINE_EXPORT_OVERLAYS = 50
const MAX_TIMELINE_EXPORT_DURATION_MS = 30 * 60 * 1000
const MAX_TIMELINE_CAPTION_TEXT_LENGTH = 240

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
      code: 'FFMPEG_NOT_FOUND',
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
      code: missingCommand ? 'FFMPEG_NOT_FOUND' : 'FFMPEG_UNAVAILABLE',
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

export async function exportVideoTimeline(input: VideoTimelineExportInput): Promise<VideoClipResult> {
  const validation = validateTimelineExportInput(input)
  if (validation) return validation

  const status = await getVideoClipStatus()
  if (!status.available || !status.path) {
    return { ok: false, code: 'FFMPEG_NOT_FOUND', error: status.error || 'ffmpeg is not available on this device.' }
  }
  const requiredFilters = getRequiredTimelineFFmpegFilters(input)
  if (requiredFilters.length > 0) {
    try {
      const availableFilters = await readFFmpegFilters(status.path)
      const missingFilters = requiredFilters.filter(filter => !availableFilters.has(filter))
      if (missingFilters.length > 0) {
        return {
          ok: false,
          code: 'FFMPEG_FILTER_MISSING',
          missingFilters,
          error: `Current ffmpeg is missing required filters: ${missingFilters.join(', ')}.`,
        }
      }
    } catch (error) {
      return {
        ok: false,
        code: 'FFMPEG_FILTER_PROBE_FAILED',
        error: error instanceof Error ? error.message : 'Failed to inspect ffmpeg filters.',
      }
    }
  }

  const workDir = await mkdtemp(join(tmpdir(), 'movscript-video-timeline-')).catch(createFallbackWorkDir)
  const outputName = normalizeOutputName(input.outputName, 'movscript-edit.mp4')
  const outputPath = join(workDir, outputName)

  try {
    const segmentPaths: string[] = []
    let cursorMs = 0
    const videoClips = normalizeTimelineVideoClips(input.clips)
    for (const [index, clip] of videoClips.entries()) {
      const gapMs = clip.timelineStartMs - cursorMs
      if (gapMs > 0) {
        const gapPath = join(workDir, `segment-${String(segmentPaths.length + 1).padStart(4, '0')}-gap.mp4`)
        await runFFmpeg(status.path, buildBlankVideoArgs(gapPath, gapMs))
        segmentPaths.push(gapPath)
        cursorMs += gapMs
      }
      const sourcePath = await prepareInputFile({
        sourceData: clip.sourceData,
        sourceName: clip.sourceName || `timeline-source-${index + 1}.mp4`,
        startMs: clip.startMs,
        endMs: clip.endMs,
      }, workDir)
      const segmentPath = join(workDir, `segment-${String(segmentPaths.length + 1).padStart(4, '0')}.mp4`)
      await runFFmpeg(status.path, buildTimelineSegmentArgs({
        sourcePath,
        sourceName: clip.sourceName,
        startMs: clip.startMs,
        endMs: clip.endMs,
        volume: clip.volume,
        muted: clip.muted,
        speed: clip.speed,
        fadeInMs: clip.fadeInMs,
        fadeOutMs: clip.fadeOutMs,
        cropLeftPercent: clip.cropLeftPercent,
        cropRightPercent: clip.cropRightPercent,
        cropTopPercent: clip.cropTopPercent,
        cropBottomPercent: clip.cropBottomPercent,
        mode: 'accurate',
      }, segmentPath, clip.endMs - clip.startMs))
      segmentPaths.push(segmentPath)
      cursorMs = Math.max(cursorMs, clip.timelineStartMs + timelineVideoClipOutputDurationMs(clip))
    }

    const captions = normalizeTimelineCaptions(input.captions)
    const audioClips = normalizeTimelineAudioClips(input.audioClips)
    const overlays = normalizeTimelineOverlays(input.overlays)
    const needsPostProcess = captions.length > 0 || audioClips.length > 0 || overlays.length > 0
    const concatOutputPath = needsPostProcess ? join(workDir, 'timeline-base.mp4') : outputPath
    const concatListPath = join(workDir, 'concat-list.txt')
    await writeFile(concatListPath, buildConcatList(segmentPaths))
    await runFFmpeg(status.path, buildConcatArgs(concatListPath, concatOutputPath))
    let currentVideoPath = concatOutputPath
    if (overlays.length > 0) {
      const overlayInputPaths: string[] = []
      for (const [index, overlay] of overlays.entries()) {
        overlayInputPaths.push(await prepareInputFile({
          sourceData: overlay.sourceData,
          sourceName: overlay.sourceName || `timeline-overlay-${index + 1}.png`,
          startMs: 0,
          endMs: overlay.endMs - overlay.startMs,
        }, workDir))
      }
      const overlayOutputPath = captions.length > 0 || audioClips.length > 0 ? join(workDir, 'timeline-overlays.mp4') : outputPath
      await runFFmpeg(status.path, buildOverlayArgs(currentVideoPath, overlayInputPaths, overlayOutputPath, overlays))
      currentVideoPath = overlayOutputPath
    }
    if (captions.length > 0) {
      const captionOutputPath = audioClips.length > 0 ? join(workDir, 'timeline-captions.mp4') : outputPath
      await runFFmpeg(status.path, buildCaptionBurnArgs(currentVideoPath, captionOutputPath, captions))
      currentVideoPath = captionOutputPath
    }
    if (audioClips.length > 0) {
      const audioInputPaths: string[] = []
      for (const [index, clip] of audioClips.entries()) {
        audioInputPaths.push(await prepareInputFile({
          sourceData: clip.sourceData,
          sourceName: clip.sourceName || `timeline-audio-${index + 1}.m4a`,
          startMs: clip.startMs,
          endMs: clip.endMs,
        }, workDir))
      }
      await runFFmpeg(status.path, buildAudioMixArgs(currentVideoPath, audioInputPaths, outputPath, audioClips))
    }
    const info = await stat(outputPath)
    const data = await readFile(outputPath)
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined)
    return {
      ok: true,
      outputName,
      mode: 'accurate',
      data,
      size: info.size,
      mimeType: 'video/mp4',
    }
  } catch (error) {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined)
    return {
      ok: false,
      code: error instanceof FFmpegTimeoutError ? 'TIMELINE_EXPORT_TIMEOUT' : 'TIMELINE_EXPORT_FAILED',
      error: error instanceof Error ? error.message : 'Video timeline export failed.',
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

export function readFFmpegFilters(
  ffmpeg: string,
  options: {
    timeoutMs?: number
    spawnProcess?: FFmpegVersionSpawn
  } = {},
): Promise<Set<string>> {
  return new Promise((resolveRun, reject) => {
    const timeoutMs = options.timeoutMs ?? FFMPEG_STATUS_TIMEOUT_MS
    const spawnProcess: FFmpegVersionSpawn = options.spawnProcess ?? spawn
    const child = spawnProcess(ffmpeg, ['-hide_banner', '-filters'], { stdio: ['ignore', 'pipe', 'pipe'] })
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
          resolveRun(parseFFmpegFilters(stdout))
          return
        }
        reject(new Error(stderr.trim() || `ffmpeg -filters exited with code ${code ?? 'unknown'}`))
      })
    })
  })
}

export function parseFFmpegFilters(output: string): Set<string> {
  const filters = new Set<string>()
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*[T.][S.][C.]\s+([^\s]+)\s/)
    if (match?.[1]) filters.add(match[1])
  }
  return filters
}

export function getRequiredTimelineFFmpegFilters(input: VideoTimelineExportInput): string[] {
  const required = new Set<string>()
  required.add('scale')
  required.add('pad')
  required.add('setsar')
  if (input.clips.some(clip => (clip.fadeInMs ?? 0) > 0 || (clip.fadeOutMs ?? 0) > 0)) {
    required.add('fade')
  }
  if (input.clips.some(clip => normalizeTimelineSpeed(clip.speed) !== 1)) {
    required.add('atempo')
    required.add('setpts')
  }
  if (input.clips.some(hasVisualCrop) || (input.overlays ?? []).some(hasVisualCrop)) {
    required.add('crop')
  }
  if (timelineVideoGapsMs(input.clips).length > 0) {
    required.add('anullsrc')
    required.add('color')
  }
  if (input.clips.some(clip => !clip.muted && clip.volume != null && clip.volume > 0 && clip.volume !== 100)) {
    required.add('volume')
  }
  if (normalizeTimelineCaptions(input.captions).length > 0) {
    required.add('drawtext')
  }
  if (normalizeTimelineOverlays(input.overlays).length > 0) {
    required.add('scale')
    required.add('format')
    required.add('colorchannelmixer')
    required.add('overlay')
    if ((input.overlays ?? []).some(overlay => overlay.sourceKind === 'video')) {
      required.add('trim')
      required.add('setpts')
    }
    if ((input.overlays ?? []).some(overlay => (overlay.fadeInMs ?? 0) > 0 || (overlay.fadeOutMs ?? 0) > 0)) {
      required.add('fade')
    }
  }
  if (normalizeTimelineAudioClips(input.audioClips).length > 0) {
    required.add('atrim')
    required.add('asetpts')
    required.add('volume')
    required.add('adelay')
    required.add('amix')
    if ((input.audioClips ?? []).some(clip => (clip.fadeInMs ?? 0) > 0 || (clip.fadeOutMs ?? 0) > 0)) {
      required.add('afade')
    }
  }
  return [...required].sort()
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

function validateTimelineExportInput(input: VideoTimelineExportInput): VideoClipResult | undefined {
  if (!Array.isArray(input.clips) || input.clips.length === 0) {
    return { ok: false, code: 'TIMELINE_EMPTY', error: 'Timeline has no video clips to export.' }
  }
  if (input.clips.length > MAX_TIMELINE_EXPORT_CLIPS) {
    return { ok: false, code: 'TIMELINE_TOO_MANY_CLIPS', error: 'Timeline has too many clips to export locally.' }
  }
  let totalDurationMs = 0
  for (const clip of input.clips) {
    const validation = validateClipInput({
      sourceData: clip.sourceData,
      sourceName: clip.sourceName,
      startMs: clip.startMs,
      endMs: clip.endMs,
    })
    if (validation) return validation
    totalDurationMs += clip.endMs - clip.startMs
  }
  if (totalDurationMs > MAX_TIMELINE_EXPORT_DURATION_MS) {
    return { ok: false, code: 'TIMELINE_TOO_LONG', error: 'Timeline export duration is too long.' }
  }
  if (input.captions && input.captions.length > MAX_TIMELINE_EXPORT_CAPTIONS) {
    return { ok: false, code: 'TIMELINE_TOO_MANY_CAPTIONS', error: 'Timeline has too many captions to burn locally.' }
  }
  if (input.audioClips && input.audioClips.length > MAX_TIMELINE_EXPORT_AUDIO_CLIPS) {
    return { ok: false, code: 'TIMELINE_TOO_MANY_AUDIO_CLIPS', error: 'Timeline has too many audio clips to mix locally.' }
  }
  if (input.overlays && input.overlays.length > MAX_TIMELINE_EXPORT_OVERLAYS) {
    return { ok: false, code: 'TIMELINE_TOO_MANY_OVERLAYS', error: 'Timeline has too many overlays to render locally.' }
  }
  for (const caption of input.captions ?? []) {
    if (!Number.isFinite(caption.startMs) || !Number.isFinite(caption.endMs) || caption.startMs < 0 || caption.endMs <= caption.startMs) {
      return { ok: false, code: 'INVALID_CAPTION_RANGE', error: 'Caption range is invalid.' }
    }
    if (caption.text.length > MAX_TIMELINE_CAPTION_TEXT_LENGTH) {
      return { ok: false, code: 'CAPTION_TOO_LONG', error: 'Caption text is too long.' }
    }
  }
  for (const audioClip of input.audioClips ?? []) {
    const validation = validateClipInput({
      sourceData: audioClip.sourceData,
      sourceName: audioClip.sourceName,
      startMs: audioClip.startMs,
      endMs: audioClip.endMs,
    })
    if (validation) return validation
    if (!Number.isFinite(audioClip.timelineStartMs) || audioClip.timelineStartMs < 0) {
      return { ok: false, code: 'INVALID_AUDIO_PLACEMENT', error: 'Audio clip placement is invalid.' }
    }
  }
  for (const overlay of input.overlays ?? []) {
    if (!overlay.sourceData || overlay.sourceData.byteLength <= 0) {
      return { ok: false, code: 'OVERLAY_SOURCE_REQUIRED', error: 'Overlay image is required.' }
    }
    if (overlay.sourceData.byteLength > MAX_CLIP_SOURCE_BYTES) {
      return { ok: false, code: 'SOURCE_TOO_LARGE', error: 'Overlay image is too large.' }
    }
    if (!Number.isFinite(overlay.startMs) || !Number.isFinite(overlay.endMs) || overlay.startMs < 0 || overlay.endMs <= overlay.startMs) {
      return { ok: false, code: 'INVALID_OVERLAY_RANGE', error: 'Overlay range is invalid.' }
    }
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
    ].filter(Boolean)
  }
  const args = [
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-i', input.sourcePath,
    '-ss', start,
    '-t', duration,
    '-map', '0:v:0',
    '-map', '0:a?',
  ]
  const videoFadeFilter = buildVideoFadeFilter(input.fadeInMs, input.fadeOutMs, durationMs)
  if (videoFadeFilter) args.push('-vf', videoFadeFilter)
  args.push(
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'veryfast',
    '-movflags', '+faststart',
    '-c:a', 'aac',
    '-b:a', '128k',
    outputPath,
  )
  return args
}

export function buildVideoFadeFilter(fadeInMs: number | undefined, fadeOutMs: number | undefined, durationMs: number): string {
  const durationSeconds = Math.max(0, durationMs) / 1000
  const maxFadeSeconds = durationSeconds / 2
  const fadeInSeconds = Math.min(maxFadeSeconds, Math.max(0, fadeInMs ?? 0) / 1000)
  const fadeOutSeconds = Math.min(maxFadeSeconds, Math.max(0, fadeOutMs ?? 0) / 1000)
  const filters: string[] = []
  if (fadeInSeconds > 0) filters.push(`fade=t=in:st=0:d=${fadeInSeconds.toFixed(3)}`)
  if (fadeOutSeconds > 0) {
    const startSeconds = Math.max(0, durationSeconds - fadeOutSeconds)
    filters.push(`fade=t=out:st=${startSeconds.toFixed(3)}:d=${fadeOutSeconds.toFixed(3)}`)
  }
  return filters.join(',')
}

export function buildTimelineSegmentArgs(
  input: VideoClipInput & { sourcePath: string; volume?: number; muted?: boolean; speed?: number },
  outputPath: string,
  durationMs: number,
): string[] {
  const start = seconds(input.startMs)
  const duration = seconds(durationMs)
  const speed = normalizeTimelineSpeed(input.speed)
  const filters = [
    buildCropFilter(input),
    buildVideoFadeFilter(input.fadeInMs, input.fadeOutMs, durationMs),
    speed === 1 ? '' : `setpts=${(1 / speed).toFixed(6)}*PTS`,
    'scale=1280:720:force_original_aspect_ratio=decrease',
    'pad=1280:720:(ow-iw)/2:(oh-ih)/2',
    'setsar=1',
  ].filter(Boolean).join(',')
  const args = [
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-i', input.sourcePath,
    '-ss', start,
    '-t', duration,
    '-map', '0:v:0',
    '-vf', filters,
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'veryfast',
    '-movflags', '+faststart',
  ]
  const volume = Math.max(0, Math.min(200, input.volume ?? 100))
  if (input.muted || volume <= 0) {
    args.push('-an')
  } else {
    args.push('-map', '0:a?')
    const audioFilters = [
      speed === 1 ? '' : buildAudioTempoFilter(speed),
      volume === 100 ? '' : `volume=${(volume / 100).toFixed(2)}`,
    ].filter(Boolean)
    if (audioFilters.length > 0) args.push('-filter:a', audioFilters.join(','))
    args.push('-c:a', 'aac', '-b:a', '128k')
  }
  args.push(outputPath)
  return args
}

export function buildAudioTempoFilter(speed: number): string {
  let remaining = normalizeTimelineSpeed(speed)
  const factors: number[] = []
  while (remaining > 2) {
    factors.push(2)
    remaining /= 2
  }
  while (remaining < 0.5) {
    factors.push(0.5)
    remaining /= 0.5
  }
  factors.push(remaining)
  return factors.map(factor => `atempo=${factor.toFixed(3)}`).join(',')
}

export function buildCropFilter(input: Pick<VideoClipInput, 'cropLeftPercent' | 'cropRightPercent' | 'cropTopPercent' | 'cropBottomPercent'>): string {
  const left = normalizeCropPercent(input.cropLeftPercent)
  const right = normalizeCropPercent(input.cropRightPercent)
  const top = normalizeCropPercent(input.cropTopPercent)
  const bottom = normalizeCropPercent(input.cropBottomPercent)
  if (left === 0 && right === 0 && top === 0 && bottom === 0) return ''
  const width = Math.max(10, 100 - left - right)
  const height = Math.max(10, 100 - top - bottom)
  return `crop=iw*${(width / 100).toFixed(4)}:ih*${(height / 100).toFixed(4)}:iw*${(left / 100).toFixed(4)}:ih*${(top / 100).toFixed(4)}`
}

export function normalizeTimelineSpeed(speed: number | undefined): number {
  if (typeof speed !== 'number' || !Number.isFinite(speed) || speed <= 0) return 1
  return Math.max(0.25, Math.min(4, speed))
}

function normalizeCropPercent(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.min(45, Math.max(0, Math.round(value)))
}

function hasVisualCrop(input: Pick<VideoClipInput, 'cropLeftPercent' | 'cropRightPercent' | 'cropTopPercent' | 'cropBottomPercent'>): boolean {
  return normalizeCropPercent(input.cropLeftPercent) > 0
    || normalizeCropPercent(input.cropRightPercent) > 0
    || normalizeCropPercent(input.cropTopPercent) > 0
    || normalizeCropPercent(input.cropBottomPercent) > 0
}

export function buildConcatArgs(concatListPath: string, outputPath: string): string[] {
  return [
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-f', 'concat',
    '-safe', '0',
    '-i', concatListPath,
    '-c', 'copy',
    '-movflags', '+faststart',
    outputPath,
  ]
}

export function buildBlankVideoArgs(outputPath: string, durationMs: number): string[] {
  return [
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-f', 'lavfi',
    '-i', 'color=c=black:s=1280x720:r=30',
    '-f', 'lavfi',
    '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
    '-t', seconds(durationMs),
    '-shortest',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'veryfast',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    outputPath,
  ]
}

export function buildConcatList(paths: string[]): string {
  return paths.map(path => `file '${path.replace(/'/g, "'\\''")}'`).join('\n')
}

export function buildCaptionBurnArgs(
  inputPath: string,
  outputPath: string,
  captions: VideoTimelineExportCaptionInput[],
): string[] {
  const filter = buildCaptionFilter(captions)
  return [
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-i', inputPath,
    '-vf', filter,
    '-map', '0:v:0',
    '-map', '0:a?',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'veryfast',
    '-c:a', 'copy',
    '-movflags', '+faststart',
    outputPath,
  ]
}

export function buildCaptionFilter(captions: VideoTimelineExportCaptionInput[]): string {
  const normalized = normalizeTimelineCaptions(captions)
    .sort((a, b) => (a.layerIndex ?? 40) - (b.layerIndex ?? 40) || a.startMs - b.startMs)
  if (normalized.length === 0) return 'null'
  return normalized.map((caption) => {
    const start = seconds(caption.startMs)
    const end = seconds(caption.endMs)
    const fontSize = Math.max(12, Math.min(96, Math.round(caption.fontSize ?? 42)))
    const yPercent = Math.max(5, Math.min(95, Math.round(caption.yPercent ?? 88))) / 100
    const color = sanitizeDrawtextColor(caption.textColor)
    const boxOpacity = Math.max(0, Math.min(100, Math.round(caption.boxOpacityPercent ?? 35))) / 100
    return [
      `drawtext=text='${escapeDrawtextText(caption.text)}'`,
      "x=(w-text_w)/2",
      `y=h*${yPercent.toFixed(2)}-text_h/2`,
      `fontsize=${fontSize}`,
      `fontcolor=${color}`,
      "borderw=3",
      "bordercolor=black@0.85",
      "box=1",
      `boxcolor=black@${boxOpacity.toFixed(2)}`,
      "boxborderw=18",
      `enable='between(t\\,${start}\\,${end})'`,
    ].join(':')
  }).join(',')
}

export function buildOverlayArgs(
  videoPath: string,
  overlayInputPaths: string[],
  outputPath: string,
  overlays: VideoTimelineExportOverlayInput[],
): string[] {
  const normalized = overlays
    .slice(0, overlayInputPaths.length)
    .map((overlay, index) => ({ overlay: normalizeTimelineOverlay(overlay), path: overlayInputPaths[index] }))
    .filter(item => item.path && item.overlay.sourceData && item.overlay.endMs > item.overlay.startMs)
    .sort((a, b) => (a.overlay.layerIndex ?? 30) - (b.overlay.layerIndex ?? 30) || a.overlay.startMs - b.overlay.startMs)
    .slice(0, MAX_TIMELINE_EXPORT_OVERLAYS)
  const filter = buildOverlayFilter(normalized.map(item => item.overlay))
  const args = [
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-i', videoPath,
  ]
  for (const item of normalized) {
    if (item.overlay.sourceKind !== 'video') args.push('-loop', '1')
    args.push('-i', item.path)
  }
  args.push(
    '-filter_complex', filter,
    '-map', '[vout]',
    '-map', '0:a?',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'veryfast',
    '-c:a', 'copy',
    '-movflags', '+faststart',
    outputPath,
  )
  return args
}

export function buildOverlayFilter(overlays: VideoTimelineExportOverlayInput[]): string {
  const normalized = normalizeTimelineOverlays(overlays)
    .sort((a, b) => (a.layerIndex ?? 30) - (b.layerIndex ?? 30) || a.startMs - b.startMs)
  if (normalized.length === 0) return '[0:v]null[vout]'
  const prepare = normalized.map((overlay, index) => {
    const scale = ((overlay.scalePercent ?? 100) / 100).toFixed(3)
    const opacity = ((overlay.opacityPercent ?? 100) / 100).toFixed(3)
    const fadeFilters = buildOverlayFadeFilters(overlay)
    const sourceDurationMs = Math.max(100, (overlay.sourceEndMs ?? overlay.endMs) - (overlay.sourceStartMs ?? overlay.startMs))
    const filters = [
      overlay.sourceKind === 'video'
        ? `trim=start=${seconds(overlay.sourceStartMs ?? 0)}:duration=${seconds(sourceDurationMs)}`
        : '',
      overlay.sourceKind === 'video' ? `setpts=PTS-STARTPTS+${seconds(overlay.startMs)}/TB` : '',
      buildCropFilter(overlay),
      `scale=iw*${scale}:ih*${scale}`,
      'format=rgba',
      `colorchannelmixer=aa=${opacity}`,
      ...fadeFilters,
    ].filter(Boolean)
    return `[${index + 1}:v]${filters.join(',')}[ov${index}]`
  })
  const overlayChains = normalized.map((overlay, index) => {
    const input = index === 0 ? '[0:v]' : `[v${index - 1}]`
    const output = index === normalized.length - 1 ? '[vout]' : `[v${index}]`
    const start = seconds(overlay.startMs)
    const end = seconds(overlay.endMs)
    const x = ((overlay.xPercent ?? 50) / 100).toFixed(3)
    const y = ((overlay.yPercent ?? 50) / 100).toFixed(3)
    return `${input}[ov${index}]overlay=x=W*${x}-w/2:y=H*${y}-h/2:enable='between(t\\,${start}\\,${end})'${output}`
  })
  return [...prepare, ...overlayChains].join(';')
}

function buildOverlayFadeFilters(overlay: VideoTimelineExportOverlayInput): string[] {
  const durationMs = Math.max(0, overlay.endMs - overlay.startMs)
  const maxFadeSeconds = durationMs / 2000
  const fadeInSeconds = Math.min(maxFadeSeconds, Math.max(0, overlay.fadeInMs ?? 0) / 1000)
  const fadeOutSeconds = Math.min(maxFadeSeconds, Math.max(0, overlay.fadeOutMs ?? 0) / 1000)
  const filters: string[] = []
  if (fadeInSeconds > 0) {
    filters.push(`fade=t=in:st=${seconds(overlay.startMs)}:d=${fadeInSeconds.toFixed(3)}:alpha=1`)
  }
  if (fadeOutSeconds > 0) {
    const startSeconds = Math.max(0, overlay.endMs / 1000 - fadeOutSeconds)
    filters.push(`fade=t=out:st=${startSeconds.toFixed(3)}:d=${fadeOutSeconds.toFixed(3)}:alpha=1`)
  }
  return filters
}

export function buildAudioMixArgs(
  videoPath: string,
  audioInputPaths: string[],
  outputPath: string,
  audioClips: VideoTimelineExportAudioInput[],
): string[] {
  const normalized = normalizeTimelineAudioClips(audioClips).slice(0, audioInputPaths.length)
  const filter = buildAudioMixFilter(normalized)
  const args = [
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-i', videoPath,
  ]
  for (const path of audioInputPaths) args.push('-i', path)
  args.push(
    '-filter_complex', filter,
    '-map', '0:v:0',
    '-map', '[aout]',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '160k',
    '-shortest',
    '-movflags', '+faststart',
    outputPath,
  )
  return args
}

export function buildAudioMixFilter(audioClips: VideoTimelineExportAudioInput[]): string {
  const normalized = normalizeTimelineAudioClips(audioClips)
  if (normalized.length === 0) return 'anullsrc=channel_layout=stereo:sample_rate=48000[aout]'
  const chains = normalized.map((clip, index) => {
    const inputIndex = index + 1
    const start = seconds(clip.startMs)
    const duration = seconds(clip.endMs - clip.startMs)
    const delay = Math.round(clip.timelineStartMs)
    const volume = Math.max(0, Math.min(2, (clip.volume ?? 100) / 100)).toFixed(2)
    const fadeFilters = buildAudioFadeFilters(clip)
    return `[${inputIndex}:a]atrim=start=${start}:duration=${duration},asetpts=PTS-STARTPTS,volume=${volume}${fadeFilters.length ? `,${fadeFilters.join(',')}` : ''},adelay=${delay}|${delay}[a${index}]`
  })
  const mixInputs = normalized.map((_, index) => `[a${index}]`).join('')
  return `${chains.join(';')};${mixInputs}amix=inputs=${normalized.length}:duration=longest:dropout_transition=0[aout]`
}

function buildAudioFadeFilters(clip: VideoTimelineExportAudioInput): string[] {
  const durationMs = Math.max(0, clip.endMs - clip.startMs)
  const maxFadeSeconds = durationMs / 2000
  const fadeInSeconds = Math.min(maxFadeSeconds, Math.max(0, clip.fadeInMs ?? 0) / 1000)
  const fadeOutSeconds = Math.min(maxFadeSeconds, Math.max(0, clip.fadeOutMs ?? 0) / 1000)
  const filters: string[] = []
  if (fadeInSeconds > 0) filters.push(`afade=t=in:st=0:d=${fadeInSeconds.toFixed(3)}`)
  if (fadeOutSeconds > 0) {
    const startSeconds = Math.max(0, durationMs / 1000 - fadeOutSeconds)
    filters.push(`afade=t=out:st=${startSeconds.toFixed(3)}:d=${fadeOutSeconds.toFixed(3)}`)
  }
  return filters
}

function normalizeTimelineCaptions(captions: VideoTimelineExportCaptionInput[] | undefined): VideoTimelineExportCaptionInput[] {
  return (captions ?? [])
    .map(caption => ({
      startMs: Math.max(0, Math.round(caption.startMs)),
      endMs: Math.max(0, Math.round(caption.endMs)),
      text: caption.text.trim().replace(/\s+/g, ' '),
      layerIndex: clampFinite(caption.layerIndex, 40, -100, 100),
      fontSize: clampFinite(caption.fontSize, 42, 12, 96),
      yPercent: clampFinite(caption.yPercent, 88, 5, 95),
      textColor: sanitizeDrawtextColor(caption.textColor),
      boxOpacityPercent: clampFinite(caption.boxOpacityPercent, 35, 0, 100),
    }))
    .filter(caption => caption.text && caption.endMs > caption.startMs)
    .slice(0, MAX_TIMELINE_EXPORT_CAPTIONS)
}

function normalizeTimelineVideoClips(clips: VideoTimelineExportClipInput[]): Array<VideoTimelineExportClipInput & { timelineStartMs: number }> {
  let cursorMs = 0
  return clips
    .map((clip) => {
      const startMs = Math.max(0, Math.round(clip.startMs))
      const endMs = Math.max(startMs + 100, Math.round(clip.endMs))
      const durationMs = endMs - startMs
      const timelineStartMs = clip.timelineStartMs == null ? cursorMs : Math.max(0, Math.round(clip.timelineStartMs))
      cursorMs = Math.max(cursorMs, timelineStartMs + durationMs)
      return {
        ...clip,
        startMs,
        endMs,
        timelineStartMs,
        volume: clip.volume == null ? undefined : Math.max(0, Math.min(200, clip.volume)),
        muted: clip.muted === true,
        speed: normalizeTimelineSpeed(clip.speed),
        layerIndex: clampFinite(clip.layerIndex, 0, -100, 100),
        cropLeftPercent: clampFinite(clip.cropLeftPercent, 0, 0, 45),
        cropRightPercent: clampFinite(clip.cropRightPercent, 0, 0, 45),
        cropTopPercent: clampFinite(clip.cropTopPercent, 0, 0, 45),
        cropBottomPercent: clampFinite(clip.cropBottomPercent, 0, 0, 45),
      }
    })
    .sort((a, b) => a.timelineStartMs - b.timelineStartMs)
}

function timelineVideoClipOutputDurationMs(clip: VideoTimelineExportClipInput): number {
  const sourceDurationMs = Math.max(100, Math.round(clip.endMs - clip.startMs))
  return Math.max(100, Math.round(sourceDurationMs / normalizeTimelineSpeed(clip.speed)))
}

function timelineVideoGapsMs(clips: VideoTimelineExportClipInput[]): number[] {
  const gaps: number[] = []
  let cursorMs = 0
  for (const clip of normalizeTimelineVideoClips(clips)) {
    const gapMs = clip.timelineStartMs - cursorMs
    if (gapMs > 0) gaps.push(gapMs)
    cursorMs = Math.max(cursorMs, clip.timelineStartMs + timelineVideoClipOutputDurationMs(clip))
  }
  return gaps
}

function normalizeTimelineAudioClips(audioClips: VideoTimelineExportAudioInput[] | undefined): VideoTimelineExportAudioInput[] {
  return (audioClips ?? [])
    .map(clip => ({
      sourceData: clip.sourceData,
      sourceName: clip.sourceName,
      startMs: Math.max(0, Math.round(clip.startMs)),
      endMs: Math.max(0, Math.round(clip.endMs)),
      timelineStartMs: Math.max(0, Math.round(clip.timelineStartMs)),
      volume: clip.volume == null ? undefined : Math.max(0, Math.min(200, clip.volume)),
      fadeInMs: clampFinite(clip.fadeInMs, 0, 0, Math.max(0, Math.floor((clip.endMs - clip.startMs) / 2))),
      fadeOutMs: clampFinite(clip.fadeOutMs, 0, 0, Math.max(0, Math.floor((clip.endMs - clip.startMs) / 2))),
    }))
    .filter(clip => clip.sourceData && clip.endMs > clip.startMs)
    .slice(0, MAX_TIMELINE_EXPORT_AUDIO_CLIPS)
}

function normalizeTimelineOverlays(overlays: VideoTimelineExportOverlayInput[] | undefined): VideoTimelineExportOverlayInput[] {
  return (overlays ?? [])
    .map(normalizeTimelineOverlay)
    .filter(overlay => overlay.sourceData && overlay.endMs > overlay.startMs)
    .sort((a, b) => (a.layerIndex ?? 30) - (b.layerIndex ?? 30) || a.startMs - b.startMs)
    .slice(0, MAX_TIMELINE_EXPORT_OVERLAYS)
}

function normalizeTimelineOverlay(overlay: VideoTimelineExportOverlayInput): VideoTimelineExportOverlayInput {
  return {
    sourceData: overlay.sourceData,
    sourceName: overlay.sourceName,
    sourceKind: overlay.sourceKind === 'video' ? 'video' : 'image',
    startMs: Math.max(0, Math.round(overlay.startMs)),
    endMs: Math.max(0, Math.round(overlay.endMs)),
    sourceStartMs: Math.max(0, Math.round(overlay.sourceStartMs ?? 0)),
    sourceEndMs: Math.max(0, Math.round(overlay.sourceEndMs ?? overlay.endMs - overlay.startMs)),
    layerIndex: clampFinite(overlay.layerIndex, 30, -100, 100),
    fadeInMs: clampFinite(overlay.fadeInMs, 0, 0, Math.max(0, Math.floor((overlay.endMs - overlay.startMs) / 2))),
    fadeOutMs: clampFinite(overlay.fadeOutMs, 0, 0, Math.max(0, Math.floor((overlay.endMs - overlay.startMs) / 2))),
    cropLeftPercent: clampFinite(overlay.cropLeftPercent, 0, 0, 45),
    cropRightPercent: clampFinite(overlay.cropRightPercent, 0, 0, 45),
    cropTopPercent: clampFinite(overlay.cropTopPercent, 0, 0, 45),
    cropBottomPercent: clampFinite(overlay.cropBottomPercent, 0, 0, 45),
    xPercent: clampFinite(overlay.xPercent, 50, 0, 100),
    yPercent: clampFinite(overlay.yPercent, 50, 0, 100),
    scalePercent: clampFinite(overlay.scalePercent, 100, 10, 300),
    opacityPercent: clampFinite(overlay.opacityPercent, 100, 0, 100),
  }
}

function escapeDrawtextText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/,/g, '\\,')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/%/g, '\\%')
    .replace(/\n/g, ' ')
    .replace(/\r/g, ' ')
}

function sanitizeDrawtextColor(value: string | undefined): string {
  const normalized = value?.trim().toLowerCase()
  if (!normalized) return 'white'
  const hexMatch = normalized.match(/^#([0-9a-f]{6})$/)
  if (hexMatch) return `0x${hexMatch[1]}`
  const ffmpegHexMatch = normalized.match(/^0x[0-9a-f]{6}$/)
  return ffmpegHexMatch ? normalized : 'white'
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

function clampFinite(value: number | undefined, fallback: number, min: number, max: number): number {
  const finiteValue = Number.isFinite(value) ? value as number : fallback
  return Math.min(max, Math.max(min, Math.round(finiteValue)))
}
