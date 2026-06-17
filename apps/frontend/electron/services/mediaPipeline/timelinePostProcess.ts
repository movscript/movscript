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
import type { VideoTimelineExportInput } from './timelineExportTypes'
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
  const audioClips = normalizeTimelineAudioClips(input.timeline.audioClips)
  const overlays = normalizeTimelineOverlays(input.timeline.overlays)
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
