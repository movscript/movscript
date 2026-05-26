import { join } from 'path'

import type { VideoTimelineExportInput } from './types'
import {
  buildAudioMixArgs,
  buildCaptionBurnArgs,
  buildOverlayArgs,
  normalizeTimelineAudioClips,
  normalizeTimelineCaptions,
  normalizeTimelineOverlays,
  prepareInputFile,
  runFFmpeg,
} from './runtime'

export function timelineNeedsPostProcess(input: VideoTimelineExportInput): boolean {
  return Boolean(input.captions?.length || input.audioClips?.length || input.overlays?.length)
}

export async function applyTimelinePostProcessing(input: {
  ffmpegPath: string
  workDir: string
  timeline: VideoTimelineExportInput
  baseVideoPath: string
  outputPath: string
}): Promise<void> {
  const captions = normalizeTimelineCaptions(input.timeline.captions)
  const audioClips = normalizeTimelineAudioClips(input.timeline.audioClips)
  const overlays = normalizeTimelineOverlays(input.timeline.overlays)
  let currentVideoPath = input.baseVideoPath

  if (overlays.length > 0) {
    const overlayInputPaths: string[] = []
    for (const [index, overlay] of overlays.entries()) {
      overlayInputPaths.push(await prepareInputFile({
        sourceData: overlay.sourceData,
        sourceName: overlay.sourceName || `timeline-overlay-${index + 1}.png`,
        startMs: 0,
        endMs: overlay.endMs - overlay.startMs,
      }, input.workDir))
    }
    const overlayOutputPath = captions.length > 0 || audioClips.length > 0 ? join(input.workDir, 'timeline-overlays.mp4') : input.outputPath
    await runFFmpeg(input.ffmpegPath, buildOverlayArgs(currentVideoPath, overlayInputPaths, overlayOutputPath, overlays))
    currentVideoPath = overlayOutputPath
  }

  if (captions.length > 0) {
    const captionOutputPath = audioClips.length > 0 ? join(input.workDir, 'timeline-captions.mp4') : input.outputPath
    await runFFmpeg(input.ffmpegPath, buildCaptionBurnArgs(currentVideoPath, captionOutputPath, captions))
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
      }, input.workDir))
    }
    await runFFmpeg(input.ffmpegPath, buildAudioMixArgs(currentVideoPath, audioInputPaths, input.outputPath, audioClips))
  }
}
