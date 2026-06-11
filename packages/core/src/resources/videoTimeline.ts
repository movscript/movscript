export const MAX_TIMELINE_EXPORT_CLIPS = 100
export const MAX_TIMELINE_EXPORT_CAPTIONS = 500
export const MAX_TIMELINE_EXPORT_AUDIO_CLIPS = 50
export const MAX_TIMELINE_EXPORT_OVERLAYS = 50
export const MAX_TIMELINE_EXPORT_DURATION_MS = 30 * 60 * 1000
export const MAX_TIMELINE_CAPTION_TEXT_LENGTH = 240

export interface VideoTimelineClipLike {
  startMs: number
  endMs: number
  timelineStartMs?: number
  layerIndex?: number
  volume?: number
  muted?: boolean
  speed?: number
  cropLeftPercent?: number
  cropRightPercent?: number
  cropTopPercent?: number
  cropBottomPercent?: number
}

export type NormalizedVideoTimelineClip<TClip extends VideoTimelineClipLike> = TClip & {
  startMs: number
  endMs: number
  timelineStartMs: number
  volume?: number
  muted: boolean
  speed: number
  layerIndex: number
  cropLeftPercent: number
  cropRightPercent: number
  cropTopPercent: number
  cropBottomPercent: number
}

export interface VideoCropPercentInput {
  cropLeftPercent?: number
  cropRightPercent?: number
  cropTopPercent?: number
  cropBottomPercent?: number
}

export function normalizeTimelineSpeed(speed: number | undefined): number {
  if (typeof speed !== 'number' || !Number.isFinite(speed) || speed <= 0) return 1
  return Math.max(0.25, Math.min(4, speed))
}

export function normalizeVideoCropPercent(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.min(45, Math.max(0, Math.round(value)))
}

export function buildVideoCropFilter(input: VideoCropPercentInput): string {
  const left = normalizeVideoCropPercent(input.cropLeftPercent)
  const right = normalizeVideoCropPercent(input.cropRightPercent)
  const top = normalizeVideoCropPercent(input.cropTopPercent)
  const bottom = normalizeVideoCropPercent(input.cropBottomPercent)
  if (left === 0 && right === 0 && top === 0 && bottom === 0) return ''
  const width = Math.max(10, 100 - left - right)
  const height = Math.max(10, 100 - top - bottom)
  return `crop=iw*${(width / 100).toFixed(4)}:ih*${(height / 100).toFixed(4)}:iw*${(left / 100).toFixed(4)}:ih*${(top / 100).toFixed(4)}`
}

export function hasVideoVisualCrop(input: VideoCropPercentInput): boolean {
  return normalizeVideoCropPercent(input.cropLeftPercent) > 0
    || normalizeVideoCropPercent(input.cropRightPercent) > 0
    || normalizeVideoCropPercent(input.cropTopPercent) > 0
    || normalizeVideoCropPercent(input.cropBottomPercent) > 0
}

export function normalizeTimelineVideoClips<TClip extends VideoTimelineClipLike>(
  clips: TClip[],
): Array<NormalizedVideoTimelineClip<TClip>> {
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

export function timelineVideoClipOutputDurationMs(clip: VideoTimelineClipLike): number {
  const sourceDurationMs = Math.max(100, Math.round(clip.endMs - clip.startMs))
  return Math.max(100, Math.round(sourceDurationMs / normalizeTimelineSpeed(clip.speed)))
}

export function timelineVideoGapsMs(clips: VideoTimelineClipLike[]): number[] {
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
