import { existsSync, statSync } from 'fs'
import type { VideoClipInput, VideoClipResult, VideoTimelineExportInput } from './types'
import {
  MAX_CLIP_DURATION_MS,
  MAX_CLIP_SOURCE_BYTES,
  MAX_TIMELINE_CAPTION_TEXT_LENGTH,
  MAX_TIMELINE_EXPORT_AUDIO_CLIPS,
  MAX_TIMELINE_EXPORT_CAPTIONS,
  MAX_TIMELINE_EXPORT_CLIPS,
  MAX_TIMELINE_EXPORT_DURATION_MS,
  MAX_TIMELINE_EXPORT_OVERLAYS,
} from './constants'

export function validateClipInput(input: VideoClipInput): VideoClipResult | undefined {
  const sourcePath = input.sourcePath?.trim()
  const sourceData = input.sourceData
  if (!sourcePath && !sourceData) return { ok: false, code: 'SOURCE_REQUIRED', error: 'Source video is required.' }
  if (sourcePath) {
    if (!existsSync(sourcePath)) return { ok: false, code: 'SOURCE_NOT_FOUND', error: 'Source video file was not found.' }
    const sourceSize = statSync(sourcePath).size
    if (sourceSize <= 0) {
      return { ok: false, code: 'SOURCE_EMPTY', error: 'Source video is empty.' }
    }
    if (sourceSize > MAX_CLIP_SOURCE_BYTES) {
      return { ok: false, code: 'SOURCE_TOO_LARGE', error: 'Source video is too large.' }
    }
  }
  if (sourceData && sourceData.byteLength <= 0) {
    return { ok: false, code: 'SOURCE_EMPTY', error: 'Source video is empty.' }
  }
  if (sourceData && sourceData.byteLength > MAX_CLIP_SOURCE_BYTES) {
    return { ok: false, code: 'SOURCE_TOO_LARGE', error: 'Source video is too large.' }
  }
  if (!Number.isFinite(input.startMs) || !Number.isFinite(input.endMs)) {
    return { ok: false, code: 'INVALID_RANGE', error: 'Clip range is invalid.' }
  }
  if (input.startMs < 0 || input.endMs <= input.startMs) {
    return { ok: false, code: 'INVALID_RANGE', error: 'Clip end must be later than clip start.' }
  }
  if (input.endMs - input.startMs > MAX_CLIP_DURATION_MS) {
    return { ok: false, code: 'CLIP_TOO_LONG', error: 'Clip duration is too long.' }
  }
  return undefined
}

export function validateTimelineExportInput(input: VideoTimelineExportInput): VideoClipResult | undefined {
  if (!Array.isArray(input.clips) || input.clips.length === 0) {
    return { ok: false, code: 'TIMELINE_EMPTY', error: 'Timeline has no video clips to export.' }
  }
  if (input.clips.length > MAX_TIMELINE_EXPORT_CLIPS) {
    return { ok: false, code: 'TIMELINE_TOO_MANY_CLIPS', error: 'Timeline has too many clips to export locally.' }
  }
  let totalDurationMs = 0
  for (const clip of input.clips) {
    const validation = validateClipInput({
      sourceData: clip.sourceData,
      sourceName: clip.sourceName,
      startMs: clip.startMs,
      endMs: clip.endMs,
    })
    if (validation) return validation
    totalDurationMs += clip.endMs - clip.startMs
  }
  if (totalDurationMs > MAX_TIMELINE_EXPORT_DURATION_MS) {
    return { ok: false, code: 'TIMELINE_TOO_LONG', error: 'Timeline export duration is too long.' }
  }
  if (input.captions && input.captions.length > MAX_TIMELINE_EXPORT_CAPTIONS) {
    return { ok: false, code: 'TIMELINE_TOO_MANY_CAPTIONS', error: 'Timeline has too many captions to burn locally.' }
  }
  if (input.audioClips && input.audioClips.length > MAX_TIMELINE_EXPORT_AUDIO_CLIPS) {
    return { ok: false, code: 'TIMELINE_TOO_MANY_AUDIO_CLIPS', error: 'Timeline has too many audio clips to mix locally.' }
  }
  if (input.overlays && input.overlays.length > MAX_TIMELINE_EXPORT_OVERLAYS) {
    return { ok: false, code: 'TIMELINE_TOO_MANY_OVERLAYS', error: 'Timeline has too many overlays to render locally.' }
  }
  for (const caption of input.captions ?? []) {
    if (!Number.isFinite(caption.startMs) || !Number.isFinite(caption.endMs) || caption.startMs < 0 || caption.endMs <= caption.startMs) {
      return { ok: false, code: 'INVALID_CAPTION_RANGE', error: 'Caption range is invalid.' }
    }
    if (caption.text.length > MAX_TIMELINE_CAPTION_TEXT_LENGTH) {
      return { ok: false, code: 'CAPTION_TOO_LONG', error: 'Caption text is too long.' }
    }
  }
  for (const audioClip of input.audioClips ?? []) {
    const validation = validateClipInput({
      sourceData: audioClip.sourceData,
      sourceName: audioClip.sourceName,
      startMs: audioClip.startMs,
      endMs: audioClip.endMs,
    })
    if (validation) return validation
    if (!Number.isFinite(audioClip.timelineStartMs) || audioClip.timelineStartMs < 0) {
      return { ok: false, code: 'INVALID_AUDIO_PLACEMENT', error: 'Audio clip placement is invalid.' }
    }
  }
  for (const overlay of input.overlays ?? []) {
    if (!overlay.sourceData || overlay.sourceData.byteLength <= 0) {
      return { ok: false, code: 'OVERLAY_SOURCE_REQUIRED', error: 'Overlay image is required.' }
    }
    if (overlay.sourceData.byteLength > MAX_CLIP_SOURCE_BYTES) {
      return { ok: false, code: 'SOURCE_TOO_LARGE', error: 'Overlay image is too large.' }
    }
    if (!Number.isFinite(overlay.startMs) || !Number.isFinite(overlay.endMs) || overlay.startMs < 0 || overlay.endMs <= overlay.startMs) {
      return { ok: false, code: 'INVALID_OVERLAY_RANGE', error: 'Overlay range is invalid.' }
    }
  }
  return undefined
}
