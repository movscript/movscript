import { mkdir, mkdtemp, readFile, rm, stat } from 'fs/promises'
import { tmpdir } from 'os'
import { basename, join } from 'path'

import type { VideoClipInput, VideoClipResult } from './timelineExportTypes'
import { getMediaPipelineFFmpegStatus } from './ffmpegProbe'
import {
  MediaPipelineFFmpegTimeoutError,
  runMediaPipelineFFmpeg,
} from './ffmpegRunner'
import { normalizeMediaPipelineTimelineOutputName } from './timelineFiles'
import { prepareMediaPipelineTimelineInputFile } from './timelineInputs'
import { validateMediaPipelineClipInput } from './timelineValidation'

type MediaPipelineClipRun = (ffmpeg: string, args: string[]) => Promise<void>

export async function renderMediaPipelineSingleClip(input: VideoClipInput): Promise<VideoClipResult> {
  const validation = validateMediaPipelineClipInput(input)
  if (validation) return validation

  const status = await getMediaPipelineFFmpegStatus()
  if (!status.available || !status.path) {
    return { ok: false, code: 'FFMPEG_NOT_FOUND', error: status.error || 'ffmpeg is not available on this device.' }
  }

  const workDir = await mkdtemp(join(tmpdir(), 'movscript-video-clip-')).catch(createMediaPipelineClipFallbackWorkDir)
  const sourcePath = await prepareMediaPipelineTimelineInputFile(input, workDir)
  const outputName = normalizeMediaPipelineTimelineOutputName(
    input.outputName,
    input.sourceName ?? input.sourcePath ?? 'video.mp4',
    basename(sourcePath),
  )
  const outputPath = join(workDir, outputName)
  const durationMs = input.endMs - input.startMs
  const requestedMode = input.mode === 'fast' ? 'fast' : 'accurate'

  try {
    const usedMode = await runMediaPipelineClipWithFallback(
      status.path,
      { ...input, sourcePath, mode: requestedMode },
      outputPath,
      durationMs,
    )
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
      code: error instanceof MediaPipelineFFmpegTimeoutError ? 'CLIP_TIMEOUT' : 'CLIP_FAILED',
      error: error instanceof Error ? error.message : 'Video clip failed.',
    }
  }
}

export function buildMediaPipelineSingleClipArgs(
  input: VideoClipInput & { sourcePath: string },
  outputPath: string,
  durationMs: number,
): string[] {
  const start = mediaPipelineFFmpegSeconds(input.startMs)
  const duration = mediaPipelineFFmpegSeconds(durationMs)
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
  const videoFadeFilter = buildMediaPipelineVideoFadeFilter(input.fadeInMs, input.fadeOutMs, durationMs)
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

export function buildMediaPipelineVideoFadeFilter(
  fadeInMs: number | undefined,
  fadeOutMs: number | undefined,
  durationMs: number,
): string {
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

export async function runMediaPipelineClipWithFallback(
  ffmpeg: string,
  input: VideoClipInput & { sourcePath: string; mode: 'fast' | 'accurate' },
  outputPath: string,
  durationMs: number,
  run: MediaPipelineClipRun = runMediaPipelineFFmpeg,
): Promise<'fast' | 'accurate'> {
  try {
    await run(ffmpeg, buildMediaPipelineSingleClipArgs(input, outputPath, durationMs))
    return input.mode
  } catch (error) {
    if (input.mode !== 'fast') throw error
    await run(ffmpeg, buildMediaPipelineSingleClipArgs({ ...input, mode: 'accurate' }, outputPath, durationMs))
    return 'accurate'
  }
}

export async function createMediaPipelineClipFallbackWorkDir(): Promise<string> {
  const dir = join(tmpdir(), `movscript-video-clip-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  await mkdir(dir, { recursive: true })
  return dir
}

function mediaPipelineFFmpegSeconds(ms: number): string {
  return (Math.max(0, ms) / 1000).toFixed(3)
}
