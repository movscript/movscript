import type { VideoTimelineExportClipInput } from './types'
import { normalizeTimelineSpeed } from './visualArgs'

export function normalizeTimelineVideoClips(clips: VideoTimelineExportClipInput[]): Array<VideoTimelineExportClipInput & { timelineStartMs: number }> {
  let cursorMs = 0
  return clips
    .map((clip) => {
      const startMs = Math.max(0, Math.round(clip.startMs))
      const endMs = Math.max(startMs + 100, Math.round(clip.endMs))
      const durationMs = endMs - startMs
      const timelineStartMs = clip.timelineStartMs == null ? cursorMs : Math.max(0, Math.round(clip.timelineStartMs))
      cursorMs = Math.max(cursorMs, timelineStartMs + durationMs)
      return {
        ...clip,
        startMs,
        endMs,
        timelineStartMs,
        volume: clip.volume == null ? undefined : Math.max(0, Math.min(200, clip.volume)),
        muted: clip.muted === true,
        speed: normalizeTimelineSpeed(clip.speed),
        layerIndex: clampFinite(clip.layerIndex, 0, -100, 100),
        cropLeftPercent: clampFinite(clip.cropLeftPercent, 0, 0, 45),
        cropRightPercent: clampFinite(clip.cropRightPercent, 0, 0, 45),
        cropTopPercent: clampFinite(clip.cropTopPercent, 0, 0, 45),
        cropBottomPercent: clampFinite(clip.cropBottomPercent, 0, 0, 45),
      }
    })
    .sort((a, b) => a.timelineStartMs - b.timelineStartMs)
}

export function timelineVideoClipOutputDurationMs(clip: VideoTimelineExportClipInput): number {
  const sourceDurationMs = Math.max(100, Math.round(clip.endMs - clip.startMs))
  return Math.max(100, Math.round(sourceDurationMs / normalizeTimelineSpeed(clip.speed)))
}

export function timelineVideoGapsMs(clips: VideoTimelineExportClipInput[]): number[] {
  const gaps: number[] = []
  let cursorMs = 0
  for (const clip of normalizeTimelineVideoClips(clips)) {
    const gapMs = clip.timelineStartMs - cursorMs
    if (gapMs > 0) gaps.push(gapMs)
    cursorMs = Math.max(cursorMs, clip.timelineStartMs + timelineVideoClipOutputDurationMs(clip))
  }
  return gaps
}

function clampFinite(value: number | undefined, fallback: number, min: number, max: number): number {
  const finiteValue = Number.isFinite(value) ? value as number : fallback
  return Math.min(max, Math.max(min, Math.round(finiteValue)))
}
