import type { VideoTimelineExportInput } from './types'
import { normalizeTimelineAudioClips } from './audioArgs'
import { normalizeTimelineCaptions } from './captionArgs'
import { normalizeTimelineOverlays } from './overlayArgs'
import { timelineVideoGapsMs } from './timelineClips'
import {
  hasVisualCrop,
  normalizeTimelineSpeed,
} from './visualArgs'

export function getRequiredTimelineFFmpegFilters(input: VideoTimelineExportInput): string[] {
  const required = new Set<string>()
  required.add('scale')
  required.add('pad')
  required.add('setsar')
  if (input.clips.some(clip => (clip.fadeInMs ?? 0) > 0 || (clip.fadeOutMs ?? 0) > 0)) {
    required.add('fade')
  }
  if (input.clips.some(clip => normalizeTimelineSpeed(clip.speed) !== 1)) {
    required.add('atempo')
    required.add('setpts')
  }
  if (input.clips.some(hasVisualCrop) || (input.overlays ?? []).some(hasVisualCrop)) {
    required.add('crop')
  }
  if (timelineVideoGapsMs(input.clips).length > 0) {
    required.add('anullsrc')
    required.add('color')
  }
  if (input.clips.some(clip => !clip.muted && clip.volume != null && clip.volume > 0 && clip.volume !== 100)) {
    required.add('volume')
  }
  if (normalizeTimelineCaptions(input.captions).length > 0) {
    required.add('drawtext')
  }
  if (normalizeTimelineOverlays(input.overlays).length > 0) {
    required.add('scale')
    required.add('format')
    required.add('colorchannelmixer')
    required.add('overlay')
    if ((input.overlays ?? []).some(overlay => overlay.sourceKind === 'video')) {
      required.add('trim')
      required.add('setpts')
    }
    if ((input.overlays ?? []).some(overlay => (overlay.fadeInMs ?? 0) > 0 || (overlay.fadeOutMs ?? 0) > 0)) {
      required.add('fade')
    }
  }
  if (normalizeTimelineAudioClips(input.audioClips).length > 0) {
    required.add('atrim')
    required.add('asetpts')
    required.add('volume')
    required.add('adelay')
    required.add('amix')
    if ((input.audioClips ?? []).some(clip => (clip.fadeInMs ?? 0) > 0 || (clip.fadeOutMs ?? 0) > 0)) {
      required.add('afade')
    }
  }
  return [...required].sort()
}
