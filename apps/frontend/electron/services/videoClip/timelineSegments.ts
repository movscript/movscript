import { writeFile } from 'fs/promises'
import { join } from 'path'

import type { VideoTimelineExportInput } from './types'
import {
  buildBlankVideoArgs,
  buildConcatArgs,
  buildConcatList,
  buildTimelineSegmentArgs,
  normalizeTimelineVideoClips,
  prepareInputFile,
  runFFmpeg,
  timelineVideoClipOutputDurationMs,
} from './runtime'

export async function materializeTimelineBaseVideo(input: {
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
      await runFFmpeg(input.ffmpegPath, buildBlankVideoArgs(gapPath, gapMs))
      segmentPaths.push(gapPath)
      cursorMs += gapMs
    }

    const sourcePath = await prepareInputFile({
      sourceData: clip.sourceData,
      sourceName: clip.sourceName || `timeline-source-${index + 1}.mp4`,
      startMs: clip.startMs,
      endMs: clip.endMs,
    }, input.workDir)
    const segmentPath = join(input.workDir, `segment-${String(segmentPaths.length + 1).padStart(4, '0')}.mp4`)
    await runFFmpeg(input.ffmpegPath, buildTimelineSegmentArgs({
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

  const concatListPath = join(input.workDir, 'concat-list.txt')
  await writeFile(concatListPath, buildConcatList(segmentPaths))
  await runFFmpeg(input.ffmpegPath, buildConcatArgs(concatListPath, input.outputPath))
}
