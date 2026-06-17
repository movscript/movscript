import { mkdir, mkdtemp, readFile, rm, stat } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import {
  materializeMediaPipelineAsset,
  type MediaPipelineMaterializeOptions,
} from './assetMaterializer'
import { parseMaterializeError, taskError } from './errors'
import { getRequiredTimelineFFmpegFilters } from './ffmpegGraph'
import {
  getMediaPipelineFFmpegStatus,
  readMediaPipelineFFmpegFilters,
} from './ffmpegProbe'
import {
  MediaPipelineFFmpegCanceledError,
  MediaPipelineFFmpegTimeoutError,
} from './ffmpegRunner'
import {
  resolveMediaPipelineSubtitleCaptionRenderer,
  resolveMediaPipelineSubtitleFileFormat,
} from './subtitleRenderer'
import type { VideoClipResult, VideoTimelineExportInput } from './timelineExportTypes'
import { normalizeMediaPipelineTimelineOutputName } from './timelineFiles'
import {
  applyMediaPipelineTimelinePostProcessing,
  mediaPipelineTimelineNeedsPostProcess,
} from './timelinePostProcess'
import { materializeMediaPipelineTimelineBaseVideo } from './timelineSegments'
import { validateMediaPipelineTimelineExportInput } from './timelineValidation'
import type { MediaPipelineClip, MediaPipelineTimelineRecipe, MediaPipelineTrack } from './types'
import type { MediaWorkspacePaths } from './workspace'

export type { VideoClipResult as MediaPipelineTimelineRenderResult, VideoTimelineExportInput }

export async function renderMediaPipelineTimeline(input: VideoTimelineExportInput): Promise<VideoClipResult> {
  const validation = validateMediaPipelineTimelineExportInput(input)
  if (validation) return validation

  const status = await getMediaPipelineFFmpegStatus()
  if (!status.available || !status.path) {
    return { ok: false, code: 'FFMPEG_NOT_FOUND', error: status.error || 'ffmpeg is not available on this device.' }
  }
  const requiredFilters = getRequiredTimelineFFmpegFilters(input)
  if (requiredFilters.length > 0) {
    try {
      const availableFilters = await readMediaPipelineFFmpegFilters(status.path)
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

  const workDir = await mkdtemp(join(tmpdir(), 'movscript-media-timeline-')).catch(createMediaPipelineFallbackWorkDir)
  const outputName = normalizeMediaPipelineTimelineOutputName(input.outputName, 'movscript-edit.mp4')
  const outputPath = join(workDir, outputName)

  try {
    if (input.signal?.aborted) throw new MediaPipelineFFmpegCanceledError()
    const needsPostProcess = mediaPipelineTimelineNeedsPostProcess(input)
    const concatOutputPath = needsPostProcess ? join(workDir, 'timeline-base.mp4') : outputPath

    await materializeMediaPipelineTimelineBaseVideo({
      ffmpegPath: status.path,
      workDir,
      timeline: input,
      outputPath: concatOutputPath,
    })

    if (needsPostProcess) {
      await applyMediaPipelineTimelinePostProcessing({
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
      code: error instanceof MediaPipelineFFmpegCanceledError
        ? 'TIMELINE_EXPORT_CANCELED'
        : error instanceof MediaPipelineFFmpegTimeoutError ? 'TIMELINE_EXPORT_TIMEOUT' : 'TIMELINE_EXPORT_FAILED',
      error: error instanceof Error ? error.message : 'Video timeline export failed.',
    }
  }
}

export async function mediaPipelineTimelineToVideoExportInput(
  timeline: MediaPipelineTimelineRecipe,
  workspace: MediaWorkspacePaths,
  materializeOptions: MediaPipelineMaterializeOptions,
): Promise<VideoTimelineExportInput> {
  const clips: VideoTimelineExportInput['clips'] = []
  const captions: NonNullable<VideoTimelineExportInput['captions']> = []
  const subtitleFiles: NonNullable<VideoTimelineExportInput['subtitleFiles']> = []
  const audioClips: NonNullable<VideoTimelineExportInput['audioClips']> = []
  const overlays: NonNullable<VideoTimelineExportInput['overlays']> = []

  for (const track of timeline.tracks) {
    for (const clip of track.clips) {
      if (track.type === 'video' && clip.assetType === 'video') {
        clips.push(await mediaPipelineTimelineVideoClipInput(track, clip, workspace, materializeOptions))
      } else if (track.type === 'audio' && clip.assetType === 'audio') {
        audioClips.push(await audioClipInput(clip, workspace, materializeOptions))
      } else if ((track.type === 'text' || track.type === 'subtitle') && clip.text?.content) {
        const textStyle = clip.subtitle?.style
        const backgroundOpacity = textStyle?.backgroundOpacity ?? clip.text.backgroundOpacity
        captions.push({
          startMs: clip.timelineStartMs,
          endMs: clip.timelineStartMs + clip.durationMs,
          text: textStyle?.content || clip.text.content,
          layerIndex: track.zIndex,
          fontSize: textStyle?.fontSize ?? clip.text.fontSize,
          fontFamily: textStyle?.fontFamily ?? clip.text.fontFamily,
          textColor: textStyle?.color ?? clip.text.color,
          backgroundColor: textStyle?.backgroundColor ?? clip.text.backgroundColor,
          boxOpacityPercent: backgroundOpacity === undefined
            ? undefined
            : backgroundOpacity * 100,
          align: textStyle?.align ?? clip.text.align,
          renderer: resolveMediaPipelineSubtitleCaptionRenderer(clip),
        })
      } else if (track.type === 'subtitle' && clip.assetType === 'subtitle' && clip.asset && clip.subtitle?.burnIn !== false) {
        const subtitlePath = await materializedAssetPath(clip, workspace, materializeOptions)
        subtitleFiles.push({
          sourcePath: subtitlePath,
          sourceName: clip.asset.label,
          format: resolveMediaPipelineSubtitleFileFormat(clip, subtitlePath),
        })
      } else if ((track.type === 'video' || track.type === 'image') && clip.assetType === 'image') {
        overlays.push(await overlayInput(track, clip, 'image', workspace, materializeOptions))
      }
    }
  }

  return {
    clips,
    ...(captions.length ? { captions } : {}),
    ...(subtitleFiles.length ? { subtitleFiles } : {}),
    ...(audioClips.length ? { audioClips } : {}),
    ...(overlays.length ? { overlays } : {}),
  }
}

async function mediaPipelineTimelineVideoClipInput(
  track: MediaPipelineTrack,
  clip: MediaPipelineClip,
  workspace: MediaWorkspacePaths,
  materializeOptions: MediaPipelineMaterializeOptions,
): Promise<VideoTimelineExportInput['clips'][number]> {
  const startMs = clip.sourceStartMs ?? 0
  const endMs = clip.sourceEndMs ?? startMs + clip.durationMs

  return {
    sourcePath: await materializedAssetPath(clip, workspace, materializeOptions),
    sourceName: clip.asset?.label,
    startMs,
    endMs,
    timelineStartMs: clip.timelineStartMs,
    layerIndex: track.zIndex,
    volume: clip.volume,
    muted: clip.muted,
  }
}

async function audioClipInput(
  clip: MediaPipelineClip,
  workspace: MediaWorkspacePaths,
  materializeOptions: MediaPipelineMaterializeOptions,
): Promise<NonNullable<VideoTimelineExportInput['audioClips']>[number]> {
  const startMs = clip.sourceStartMs ?? 0
  const endMs = clip.sourceEndMs ?? startMs + clip.durationMs

  return {
    sourcePath: await materializedAssetPath(clip, workspace, materializeOptions),
    sourceName: clip.asset?.label,
    startMs,
    endMs,
    timelineStartMs: clip.timelineStartMs,
    volume: clip.volume,
  }
}

async function overlayInput(
  track: MediaPipelineTrack,
  clip: MediaPipelineClip,
  sourceKind: 'image' | 'video',
  workspace: MediaWorkspacePaths,
  materializeOptions: MediaPipelineMaterializeOptions,
): Promise<NonNullable<VideoTimelineExportInput['overlays']>[number]> {
  return {
    sourcePath: await materializedAssetPath(clip, workspace, materializeOptions),
    sourceName: clip.asset?.label,
    sourceKind,
    startMs: clip.timelineStartMs,
    endMs: clip.timelineStartMs + clip.durationMs,
    layerIndex: track.zIndex,
    opacityPercent: clip.opacity === undefined ? undefined : clip.opacity * 100,
  }
}

async function materializedAssetPath(
  clip: MediaPipelineClip,
  workspace: MediaWorkspacePaths,
  materializeOptions: MediaPipelineMaterializeOptions,
): Promise<string> {
  if (!clip.asset) throw taskError('ASSET_REQUIRED', `Clip ${clip.id} is missing an asset.`)
  try {
    return (await materializeMediaPipelineAsset({ asset: clip.asset, workspace, options: materializeOptions })).path
  } catch (error) {
    const parsed = parseMaterializeError(error)
    throw taskError(parsed.code, `Clip ${clip.id}: ${parsed.message}`)
  }
}

async function createMediaPipelineFallbackWorkDir(): Promise<string> {
  const dir = join(tmpdir(), `movscript-media-timeline-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  await mkdir(dir, { recursive: true })
  return dir
}
