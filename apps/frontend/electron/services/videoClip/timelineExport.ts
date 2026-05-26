import { mkdtemp, readFile, rm, stat } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import type { VideoClipResult, VideoTimelineExportInput } from './types'
import {
  createFallbackWorkDir,
  FFmpegTimeoutError,
  getRequiredTimelineFFmpegFilters,
  getVideoClipStatus,
  normalizeOutputName,
  readFFmpegFilters,
  validateTimelineExportInput,
} from './runtime'
import { applyTimelinePostProcessing, timelineNeedsPostProcess } from './timelinePostProcess'
import { materializeTimelineBaseVideo } from './timelineSegments'

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
    const needsPostProcess = timelineNeedsPostProcess(input)
    const concatOutputPath = needsPostProcess ? join(workDir, 'timeline-base.mp4') : outputPath

    await materializeTimelineBaseVideo({
      ffmpegPath: status.path,
      workDir,
      timeline: input,
      outputPath: concatOutputPath,
    })

    if (needsPostProcess) {
      await applyTimelinePostProcessing({
        ffmpegPath: status.path,
        workDir,
        timeline: input,
        baseVideoPath: concatOutputPath,
        outputPath,
      })
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
