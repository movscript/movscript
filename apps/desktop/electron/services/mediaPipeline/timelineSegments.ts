import { writeFile } from 'fs/promises'
import { join } from 'path'

import {
  buildBlankVideoArgs,
  buildConcatArgs,
  buildConcatList,
  buildTimelineSegmentArgs,
  normalizeTimelineVideoClips,
  timelineVideoClipOutputDurationMs,
} from './ffmpegGraph'
import { runMediaPipelineFFmpeg } from './ffmpegRunner'
import { prepareMediaPipelineTimelineInputFile } from './timelineInputs'
import type { VideoTimelineExportInput } from './timelineExportTypes'

export async function materializeMediaPipelineTimelineBaseVideo(input: {
  ffmpegPath: string
  workDir: string
  timeline: VideoTimelineExportInput
  outputPath: string
}): Promise<void> {
  const segmentPaths: string[] = []
  let cursorMs = 0
  const videoClips = normalizeTimelineVideoClips(input.timeline.clips)

  for (const [index, clip] of videoClips.entries()) {
    const gapMs = clip.timelineStartMs - cursorMs
    if (gapMs > 0) {
      const gapPath = join(input.workDir, `segment-${String(segmentPaths.length + 1).padStart(4, '0')}-gap.mp4`)
      await runMediaPipelineFFmpeg(input.ffmpegPath, buildBlankVideoArgs(gapPath, gapMs, {
        width: input.timeline.width,
        height: input.timeline.height,
        background: input.timeline.background,
      }), {
        signal: input.timeline.signal,
        onOutput: input.timeline.onFFmpegOutput,
      })
      segmentPaths.push(gapPath)
      cursorMs += gapMs
    }

    const sourcePath = await prepareMediaPipelineTimelineInputFile({
      sourcePath: clip.sourcePath,
      sourceData: clip.sourceData,
      sourceName: clip.sourceName || `timeline-source-${index + 1}.mp4`,
    }, input.workDir)
    const segmentPath = join(input.workDir, `segment-${String(segmentPaths.length + 1).padStart(4, '0')}.mp4`)
    await runMediaPipelineFFmpeg(input.ffmpegPath, buildTimelineSegmentArgs({
      sourcePath,
      sourceName: clip.sourceName,
      startMs: clip.startMs,
      endMs: clip.endMs,
      volume: clip.volume,
      muted: clip.muted,
      speed: clip.speed,
      fit: clip.fit,
      width: input.timeline.width,
      height: input.timeline.height,
      background: input.timeline.background,
      fadeInMs: clip.fadeInMs,
      fadeOutMs: clip.fadeOutMs,
      cropLeftPercent: clip.cropLeftPercent,
      cropRightPercent: clip.cropRightPercent,
      cropTopPercent: clip.cropTopPercent,
      cropBottomPercent: clip.cropBottomPercent,
      xPercent: clip.xPercent,
      yPercent: clip.yPercent,
      scalePercent: clip.scalePercent,
      mode: 'accurate',
    }, segmentPath, clip.endMs - clip.startMs), {
      signal: input.timeline.signal,
      onOutput: input.timeline.onFFmpegOutput,
    })
    segmentPaths.push(segmentPath)
    cursorMs = Math.max(cursorMs, clip.timelineStartMs + timelineVideoClipOutputDurationMs(clip))
  }

  const concatListPath = join(input.workDir, 'concat-list.txt')
  await writeFile(concatListPath, buildConcatList(segmentPaths))
  await runMediaPipelineFFmpeg(input.ffmpegPath, buildConcatArgs(concatListPath, input.outputPath), {
    signal: input.timeline.signal,
    onOutput: input.timeline.onFFmpegOutput,
  })
}
