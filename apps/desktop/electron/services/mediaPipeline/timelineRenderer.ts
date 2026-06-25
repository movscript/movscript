import { mkdir, mkdtemp, readFile, rm, stat } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { normalizeMediaClipVolumePercent } from '@movscript/editing'

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
  const primaryVideoTrackId = primaryTimelineVideoTrackId(timeline)

  for (const track of timeline.tracks) {
    for (const clip of track.clips) {
      if (track.type === 'video' && clip.assetType === 'video' && track.id === primaryVideoTrackId) {
        clips.push(await mediaPipelineTimelineVideoClipInput(track, clip, workspace, materializeOptions))
      } else if (track.type === 'video' && clip.assetType === 'video') {
        overlays.push(await overlayInput(track, clip, 'video', workspace, materializeOptions))
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
          ...(textPositionYPercent(textStyle?.position ?? clip.text.position ?? clip.position) === undefined ? {} : {
            yPercent: textPositionYPercent(textStyle?.position ?? clip.text.position ?? clip.position),
          }),
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
    clips: clips.sort((left, right) => (left.timelineStartMs ?? 0) - (right.timelineStartMs ?? 0) || (left.layerIndex ?? 0) - (right.layerIndex ?? 0)),
    ...(captions.length ? { captions: captions.sort((left, right) => (left.layerIndex ?? 0) - (right.layerIndex ?? 0) || left.startMs - right.startMs) } : {}),
    ...(subtitleFiles.length ? { subtitleFiles } : {}),
    ...(audioClips.length ? { audioClips: audioClips.sort((left, right) => left.timelineStartMs - right.timelineStartMs) } : {}),
    ...(overlays.length ? { overlays: overlays.sort((left, right) => (left.layerIndex ?? 0) - (right.layerIndex ?? 0) || left.startMs - right.startMs) } : {}),
    width: timeline.width,
    height: timeline.height,
    background: timeline.background,
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
    volume: normalizeMediaClipVolumePercent(clip.volume),
    muted: clip.muted,
    ...clipTimingInput(clip),
    ...clipCropInput(clip),
    ...(clip.fit ? { fit: clip.fit } : {}),
    ...(clip.xPercent === undefined ? {} : { xPercent: clip.xPercent }),
    ...(clip.yPercent === undefined ? {} : { yPercent: clip.yPercent }),
    ...(clip.scale === undefined ? {} : { scalePercent: clip.scale * 100 }),
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
    volume: normalizeMediaClipVolumePercent(clip.volume),
    ...clipTimingInput(clip),
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
    ...(sourceKind === 'video' ? { sourceStartMs: clip.sourceStartMs ?? 0 } : {}),
    ...(sourceKind === 'video' ? { sourceEndMs: clip.sourceEndMs ?? (clip.sourceStartMs ?? 0) + clip.durationMs } : {}),
    layerIndex: track.zIndex,
    ...(sourceKind === 'video' && clip.volume !== undefined ? { volume: normalizeMediaClipVolumePercent(clip.volume) } : {}),
    ...(sourceKind === 'video' && clip.muted !== undefined ? { muted: clip.muted } : {}),
    ...clipTimingInput(clip),
    ...clipCropInput(clip),
    ...(clip.xPercent === undefined ? {} : { xPercent: clip.xPercent }),
    ...(clip.yPercent === undefined ? {} : { yPercent: clip.yPercent }),
    ...(clip.scale === undefined ? {} : { scalePercent: clip.scale * 100 }),
    ...(clip.opacity === undefined ? {} : { opacityPercent: clip.opacity * 100 }),
  }
}

function primaryTimelineVideoTrackId(timeline: MediaPipelineTimelineRecipe): string | undefined {
  const videoTracks = timeline.tracks
    .filter((track) => track.type === 'video' && track.clips.some((clip) => clip.assetType === 'video'))
    .sort((left, right) => left.zIndex - right.zIndex || left.id.localeCompare(right.id))
  return videoTracks[0]?.id
}

function clipTimingInput(clip: MediaPipelineClip): {
  speed?: number
  fadeInMs?: number
  fadeOutMs?: number
} {
  const metadata = clip.metadata ?? {}
  const transitionFadeMs = clip.transition?.type === 'fade' ? numericValue(clip.transition.durationMs) : undefined
  return {
    ...(numericValue(clip.speed ?? metadata.speed) ? { speed: numericValue(clip.speed ?? metadata.speed) } : {}),
    ...(numericValue(clip.fadeInMs ?? metadata.fadeInMs ?? metadata.fade_in_ms ?? transitionFadeMs) ? { fadeInMs: numericValue(clip.fadeInMs ?? metadata.fadeInMs ?? metadata.fade_in_ms ?? transitionFadeMs) } : {}),
    ...(numericValue(clip.fadeOutMs ?? metadata.fadeOutMs ?? metadata.fade_out_ms ?? transitionFadeMs) ? { fadeOutMs: numericValue(clip.fadeOutMs ?? metadata.fadeOutMs ?? metadata.fade_out_ms ?? transitionFadeMs) } : {}),
  }
}

function clipCropInput(clip: MediaPipelineClip): {
  cropLeftPercent?: number
  cropRightPercent?: number
  cropTopPercent?: number
  cropBottomPercent?: number
} {
  const crop = clip.crop
  if (!crop) return {}
  return {
    ...(numericValue(crop.leftPercent) ? { cropLeftPercent: numericValue(crop.leftPercent) } : {}),
    ...(numericValue(crop.rightPercent) ? { cropRightPercent: numericValue(crop.rightPercent) } : {}),
    ...(numericValue(crop.topPercent) ? { cropTopPercent: numericValue(crop.topPercent) } : {}),
    ...(numericValue(crop.bottomPercent) ? { cropBottomPercent: numericValue(crop.bottomPercent) } : {}),
  }
}

function textPositionYPercent(position: string | undefined): number | undefined {
  const normalized = position?.trim().toLowerCase()
  if (!normalized) return undefined
  if (normalized === 'top') return 15
  if (normalized === 'center' || normalized === 'middle') return 50
  if (normalized === 'bottom') return 88
  const percent = normalized.match(/^(\d+(?:\.\d+)?)%$/)
  if (percent) return numericValue(percent[1])
  return undefined
}

function numericValue(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isFinite(numeric) ? numeric : undefined
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
