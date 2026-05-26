import { mkdtemp, readFile, rm, stat } from 'fs/promises'
import { tmpdir } from 'os'
import { basename, join } from 'path'

import type { VideoClipInput, VideoClipResult } from './types'
import {
  createFallbackWorkDir,
  FFmpegTimeoutError,
  getVideoClipStatus,
  normalizeOutputName,
  prepareInputFile,
  runClipWithFallback,
  validateClipInput,
} from './runtime'

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
