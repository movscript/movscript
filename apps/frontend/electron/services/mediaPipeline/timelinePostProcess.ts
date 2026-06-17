import { join } from 'path'

import {
  buildAudioMixArgs,
  buildOverlayArgs,
  normalizeTimelineAudioClips,
  normalizeTimelineOverlays,
} from './ffmpegGraph'
import { runMediaPipelineFFmpeg } from './ffmpegRunner'
import {
  mediaPipelineTimelineHasCaptions,
  renderMediaPipelineTimelineCaptions,
} from './subtitleRenderer'
import type { VideoTimelineExportAudioInput, VideoTimelineExportInput, VideoTimelineExportOverlayInput } from './timelineExportTypes'
import { prepareMediaPipelineTimelineInputFile } from './timelineInputs'

export function mediaPipelineTimelineNeedsPostProcess(input: VideoTimelineExportInput): boolean {
  return Boolean(mediaPipelineTimelineHasCaptions(input) || input.audioClips?.length || input.overlays?.length)
}

export async function applyMediaPipelineTimelinePostProcessing(input: {
  ffmpegPath: string
  workDir: string
  timeline: VideoTimelineExportInput
  baseVideoPath: string
  outputPath: string
}): Promise<void> {
  const hasCaptions = mediaPipelineTimelineHasCaptions(input.timeline)
  const overlays = normalizeTimelineOverlays(input.timeline.overlays)
  const audioClips = normalizeTimelineAudioClips([
    ...(input.timeline.audioClips ?? []),
    ...overlayAudioClips(overlays),
  ])
  let currentVideoPath = input.baseVideoPath

  if (overlays.length > 0) {
    const overlayInputPaths: string[] = []
    for (const [index, overlay] of overlays.entries()) {
      overlayInputPaths.push(await prepareMediaPipelineTimelineInputFile({
        sourcePath: overlay.sourcePath,
        sourceData: overlay.sourceData,
        sourceName: overlay.sourceName || `timeline-overlay-${index + 1}.png`,
      }, input.workDir))
    }
    const overlayOutputPath = hasCaptions || audioClips.length > 0 ? join(input.workDir, 'timeline-overlays.mp4') : input.outputPath
    await runMediaPipelineFFmpeg(input.ffmpegPath, buildOverlayArgs(currentVideoPath, overlayInputPaths, overlayOutputPath, overlays), {
      signal: input.timeline.signal,
      onOutput: input.timeline.onFFmpegOutput,
    })
    currentVideoPath = overlayOutputPath
  }

  if (hasCaptions) {
    const captionOutputPath = audioClips.length > 0 ? join(input.workDir, 'timeline-captions.mp4') : input.outputPath
    await renderMediaPipelineTimelineCaptions({
      ffmpegPath: input.ffmpegPath,
      timeline: input.timeline,
      workDir: input.workDir,
      inputPath: currentVideoPath,
      outputPath: captionOutputPath,
    })
    currentVideoPath = captionOutputPath
  }

  if (audioClips.length > 0) {
    const audioInputPaths: string[] = []
    for (const [index, clip] of audioClips.entries()) {
      audioInputPaths.push(await prepareMediaPipelineTimelineInputFile({
        sourcePath: clip.sourcePath,
        sourceData: clip.sourceData,
        sourceName: clip.sourceName || `timeline-audio-${index + 1}.m4a`,
      }, input.workDir))
    }
    await runMediaPipelineFFmpeg(input.ffmpegPath, buildAudioMixArgs(currentVideoPath, audioInputPaths, input.outputPath, audioClips), {
      signal: input.timeline.signal,
      onOutput: input.timeline.onFFmpegOutput,
    })
  }
}

function overlayAudioClips(overlays: VideoTimelineExportOverlayInput[]): VideoTimelineExportAudioInput[] {
  return overlays
    .filter((overlay) => overlay.sourceKind === 'video' && !overlay.muted && (overlay.volume ?? 100) > 0)
    .map((overlay) => ({
      sourcePath: overlay.sourcePath,
      sourceData: overlay.sourceData,
      sourceName: overlay.sourceName,
      startMs: overlay.sourceStartMs ?? 0,
      endMs: overlay.sourceEndMs ?? (overlay.sourceStartMs ?? 0) + (overlay.endMs - overlay.startMs),
      timelineStartMs: overlay.startMs,
      volume: overlay.volume,
      speed: overlay.speed,
      fadeInMs: overlay.fadeInMs,
      fadeOutMs: overlay.fadeOutMs,
    }))
}
