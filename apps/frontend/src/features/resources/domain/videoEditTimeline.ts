export type VideoEditTrackKind = 'video' | 'audio' | 'caption' | 'overlay'

export interface VideoEditTrack {
  id: string
  kind: VideoEditTrackKind
  name: string
  locked?: boolean
  muted?: boolean
  solo?: boolean
  collapsed?: boolean
}

export interface VideoEditClip {
  id: string
  trackId: string
  kind: VideoEditTrackKind
  resourceId?: number
  resourceName?: string
  startMs: number
  durationMs: number
  sourceInMs: number
  sourceOutMs: number
  text?: string
  layerIndex?: number
  volume?: number
  muted?: boolean
  speed?: number
  fadeInMs?: number
  fadeOutMs?: number
  cropLeftPercent?: number
  cropRightPercent?: number
  cropTopPercent?: number
  cropBottomPercent?: number
  overlayXPercent?: number
  overlayYPercent?: number
  overlayScalePercent?: number
  overlayOpacityPercent?: number
  captionFontSize?: number
  captionYPercent?: number
  captionTextColor?: string
  captionBoxOpacityPercent?: number
  scriptSegmentId?: string
}

export interface VideoEditMarker {
  id: string
  atMs: number
  label: string
  color?: string
}

export interface VideoEditScriptSegment {
  id: string
  text: string
  startMs?: number
  durationMs: number
}

export interface VideoEditTimeline {
  id: string
  name: string
  updatedAt: string
  tracks: VideoEditTrack[]
  clips: VideoEditClip[]
  markers: VideoEditMarker[]
}

export interface VideoEditResourceLike {
  ID: number
  type: 'image' | 'video' | 'audio' | 'text' | 'file'
  name: string
}

export const DEFAULT_VIDEO_EDIT_TRACKS: VideoEditTrack[] = [
  { id: 'video-3', kind: 'video', name: 'V3' },
  { id: 'video-2', kind: 'video', name: 'V2' },
  { id: 'video-1', kind: 'video', name: 'V1' },
  { id: 'overlay-1', kind: 'overlay', name: 'Overlay' },
  { id: 'caption-1', kind: 'caption', name: 'Captions' },
  { id: 'audio-1', kind: 'audio', name: 'A1' },
]

export function createVideoEditTimeline(name = 'Untitled edit'): VideoEditTimeline {
  return touchTimeline({
    id: createId('timeline'),
    name,
    updatedAt: '',
    tracks: DEFAULT_VIDEO_EDIT_TRACKS.map(track => ({ ...track })),
    clips: [],
    markers: [],
  })
}

export function addResourceClip(
  timeline: VideoEditTimeline,
  resource: VideoEditResourceLike,
  options: {
    durationMs?: number
    trackId?: string
    sourceInMs?: number
    startMs?: number
  } = {},
): VideoEditTimeline {
  const kind = inferClipKind(resource.type)
  const track = options.trackId
    ? timeline.tracks.find(item => item.id === options.trackId)
    : timeline.tracks.find(item => item.kind === kind && item.id === 'video-1') ?? timeline.tracks.find(item => item.kind === kind)
  if (!track) return timeline
  const startMs = options.startMs ?? trackEndMs(timeline, track.id)
  const durationMs = Math.max(500, options.durationMs ?? defaultDurationForKind(kind))
  const sourceInMs = Math.max(0, options.sourceInMs ?? 0)
  const clip: VideoEditClip = {
    id: createId('clip'),
    trackId: track.id,
    kind,
    resourceId: resource.ID,
    resourceName: resource.name,
    startMs,
    durationMs,
    sourceInMs,
    sourceOutMs: sourceInMs + durationMs,
    layerIndex: defaultLayerForTrack(track.id, kind),
    volume: kind === 'audio' || kind === 'video' ? 100 : undefined,
    speed: kind === 'video' ? 1 : undefined,
    fadeInMs: kind === 'video' || kind === 'overlay' || kind === 'audio' ? 0 : undefined,
    fadeOutMs: kind === 'video' || kind === 'overlay' || kind === 'audio' ? 0 : undefined,
    cropLeftPercent: kind === 'video' || kind === 'overlay' ? 0 : undefined,
    cropRightPercent: kind === 'video' || kind === 'overlay' ? 0 : undefined,
    cropTopPercent: kind === 'video' || kind === 'overlay' ? 0 : undefined,
    cropBottomPercent: kind === 'video' || kind === 'overlay' ? 0 : undefined,
    overlayXPercent: kind === 'overlay' || kind === 'video' ? 50 : undefined,
    overlayYPercent: kind === 'overlay' || kind === 'video' ? 50 : undefined,
    overlayScalePercent: kind === 'overlay' || kind === 'video' ? 100 : undefined,
    overlayOpacityPercent: kind === 'overlay' || kind === 'video' ? 100 : undefined,
    captionFontSize: kind === 'caption' ? 42 : undefined,
    captionYPercent: kind === 'caption' ? 88 : undefined,
    captionTextColor: kind === 'caption' ? '#ffffff' : undefined,
    captionBoxOpacityPercent: kind === 'caption' ? 35 : undefined,
  }
  return normalizeTimeline({ ...timeline, clips: [...timeline.clips, clip] })
}

export function splitClipAt(timeline: VideoEditTimeline, clipId: string, atMs: number): VideoEditTimeline {
  const clip = timeline.clips.find(item => item.id === clipId)
  if (!clip) return timeline
  const localMs = atMs - clip.startMs
  if (localMs <= 0 || localMs >= clip.durationMs) return timeline
  const left: VideoEditClip = {
    ...clip,
    durationMs: localMs,
    sourceOutMs: clip.sourceInMs + localMs,
  }
  const right: VideoEditClip = {
    ...clip,
    id: createId('clip'),
    startMs: atMs,
    durationMs: clip.durationMs - localMs,
    sourceInMs: left.sourceOutMs,
  }
  right.sourceOutMs = right.sourceInMs + right.durationMs
  return normalizeTimeline({
    ...timeline,
    clips: timeline.clips.flatMap(item => item.id === clipId ? [left, right] : [item]),
  })
}

export function trimClip(
  timeline: VideoEditTimeline,
  clipId: string,
  patch: Partial<Pick<VideoEditClip, 'startMs' | 'durationMs' | 'sourceInMs' | 'sourceOutMs'>>,
): VideoEditTimeline {
  const source = timeline.clips.find(clip => clip.id === clipId)
  if (!source || timeline.tracks.find(track => track.id === source.trackId)?.locked) return timeline
  const clips = timeline.clips.map((clip) => {
    if (clip.id !== clipId) return clip
    const nextStart = Math.max(0, patch.startMs ?? clip.startMs)
    const nextDuration = Math.max(100, patch.durationMs ?? clip.durationMs)
    if (wouldOverlap(timeline.clips, clip.id, clip.trackId, nextStart, nextDuration)) return clip
    const nextSourceIn = Math.max(0, patch.sourceInMs ?? clip.sourceInMs)
    const nextSourceOut = Math.max(nextSourceIn + 100, patch.sourceOutMs ?? nextSourceIn + nextDuration)
    return {
      ...clip,
      startMs: nextStart,
      durationMs: nextDuration,
      sourceInMs: nextSourceIn,
      sourceOutMs: nextSourceOut,
    }
  })
  return normalizeTimeline({ ...timeline, clips })
}

export function moveClip(
  timeline: VideoEditTimeline,
  clipId: string,
  startMs: number,
  trackId?: string,
): VideoEditTimeline {
  const trackMap = new Map(timeline.tracks.map(track => [track.id, track]))
  const clips = timeline.clips.map((clip) => {
    if (clip.id !== clipId) return clip
    const currentTrack = trackMap.get(clip.trackId)
    if (currentTrack?.locked) return clip
    const requestedTrack = trackId ? trackMap.get(trackId) : undefined
    const nextTrackId = requestedTrack && requestedTrack.kind === clip.kind && !requestedTrack.locked ? requestedTrack.id : clip.trackId
    const nextStart = Math.max(0, startMs)
    if (wouldOverlap(timeline.clips, clip.id, nextTrackId, nextStart, clip.durationMs)) return clip
    return {
      ...clip,
      startMs: nextStart,
      trackId: nextTrackId,
      layerIndex: nextTrackId !== clip.trackId ? defaultLayerForTrack(nextTrackId, clip.kind) : clip.layerIndex,
    }
  })
  return normalizeTimeline({ ...timeline, clips })
}

function wouldOverlap(clips: VideoEditClip[], clipId: string, trackId: string, startMs: number, durationMs: number): boolean {
  const endMs = startMs + durationMs
  return clips.some(clip => clip.id !== clipId
    && clip.trackId === trackId
    && startMs < clip.startMs + clip.durationMs
    && endMs > clip.startMs)
}

export function deleteClip(timeline: VideoEditTimeline, clipId: string): VideoEditTimeline {
  return normalizeTimeline({ ...timeline, clips: timeline.clips.filter(clip => clip.id !== clipId) })
}

export function duplicateClip(
  timeline: VideoEditTimeline,
  clipId: string,
  options: { startMs?: number; trackId?: string } = {},
): VideoEditTimeline {
  const source = timeline.clips.find(clip => clip.id === clipId)
  if (!source) return timeline
  const trackMap = new Map(timeline.tracks.map(track => [track.id, track]))
  const sourceTrack = trackMap.get(source.trackId)
  if (sourceTrack?.locked) return timeline
  const requestedTrack = options.trackId ? trackMap.get(options.trackId) : undefined
  if (options.trackId && (!requestedTrack || requestedTrack.kind !== source.kind || requestedTrack.locked)) return timeline
  const targetTrack = requestedTrack ?? sourceTrack
  if (!targetTrack) return timeline
  const startMs = Math.max(0, Math.round(options.startMs ?? source.startMs + source.durationMs))
  if (wouldOverlap(timeline.clips, '', targetTrack.id, startMs, source.durationMs)) return timeline
  const copy: VideoEditClip = {
    ...source,
    id: createId('clip'),
    trackId: targetTrack.id,
    startMs,
    layerIndex: targetTrack.id !== source.trackId ? defaultLayerForTrack(targetTrack.id, source.kind) : source.layerIndex,
  }
  return normalizeTimeline({ ...timeline, clips: [...timeline.clips, copy] })
}

export function updateClip(timeline: VideoEditTimeline, clipId: string, patch: Partial<VideoEditClip>): VideoEditTimeline {
  return normalizeTimeline({
    ...timeline,
    clips: timeline.clips.map(clip => clip.id === clipId ? sanitizeClip({ ...clip, ...patch, id: clip.id }) : clip),
  })
}

export function updateTrack(timeline: VideoEditTimeline, trackId: string, patch: Partial<VideoEditTrack>): VideoEditTimeline {
  return normalizeTimeline({
    ...timeline,
    tracks: timeline.tracks.map(track => track.id === trackId ? sanitizeTrack({ ...track, ...patch, id: track.id, kind: track.kind }) : track),
  })
}

export function addTrack(timeline: VideoEditTimeline, kind: VideoEditTrackKind): VideoEditTimeline {
  const track = createTrack(timeline.tracks, kind)
  return normalizeTimeline({
    ...timeline,
    tracks: insertTrackByKind(timeline.tracks, track),
  })
}

export function deleteTrack(timeline: VideoEditTimeline, trackId: string): VideoEditTimeline {
  const track = timeline.tracks.find(item => item.id === trackId)
  if (!track || timeline.clips.some(clip => clip.trackId === trackId)) return timeline
  const sameKindTracks = timeline.tracks.filter(item => item.kind === track.kind)
  if (sameKindTracks.length <= 1) return timeline
  return normalizeTimeline({
    ...timeline,
    tracks: timeline.tracks.filter(item => item.id !== trackId),
  })
}

export function addMarker(timeline: VideoEditTimeline, atMs: number, label: string): VideoEditTimeline {
  const trimmed = label.trim()
  if (!trimmed) return timeline
  return normalizeTimeline({
    ...timeline,
    markers: [...timeline.markers, { id: createId('marker'), atMs: Math.max(0, atMs), label: trimmed }],
  })
}

export function deleteMarker(timeline: VideoEditTimeline, markerId: string): VideoEditTimeline {
  return normalizeTimeline({ ...timeline, markers: timeline.markers.filter(marker => marker.id !== markerId) })
}

export function applyScriptRoughCut(
  timeline: VideoEditTimeline,
  segments: VideoEditScriptSegment[],
  options: { captionTrackId?: string; startMs?: number } = {},
): VideoEditTimeline {
  const captionTrack = options.captionTrackId
    ? timeline.tracks.find(track => track.id === options.captionTrackId)
    : timeline.tracks.find(track => track.kind === 'caption')
  if (!captionTrack) return timeline
  const baseStartMs = Math.max(0, options.startMs ?? trackEndMs(timeline, captionTrack.id))
  let cursor = baseStartMs
  const clips = segments
    .filter(segment => segment.text.trim())
    .map((segment) => {
      const durationMs = Math.max(800, segment.durationMs)
      const startMs = segment.startMs == null ? cursor : baseStartMs + Math.max(0, segment.startMs)
      const clip: VideoEditClip = {
        id: createId('caption'),
        trackId: captionTrack.id,
        kind: 'caption',
        startMs,
        durationMs,
        sourceInMs: 0,
        sourceOutMs: durationMs,
        text: segment.text.trim(),
        layerIndex: defaultLayerForKind('caption'),
        captionFontSize: 42,
        captionYPercent: 88,
        captionTextColor: '#ffffff',
        captionBoxOpacityPercent: 35,
        scriptSegmentId: segment.id,
      }
      cursor = Math.max(cursor + durationMs, startMs + durationMs)
      return clip
    })
  return normalizeTimeline({ ...timeline, clips: [...timeline.clips, ...clips] })
}

export function parseScriptSegments(input: string, wordsPerMinute = 220): VideoEditScriptSegment[] {
  return input
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)
    .map((text, index) => ({
      id: `script-${index + 1}`,
      text,
      durationMs: estimateSpeechDurationMs(text, wordsPerMinute),
    }))
}

export function parseSrtCaptions(input: string): VideoEditScriptSegment[] {
  return input
    .replace(/\r/g, '')
    .split(/\n{2,}/)
    .map((block, index): VideoEditScriptSegment | undefined => {
      const lines = block.split('\n').map(line => line.trim()).filter(Boolean)
      const timeLineIndex = lines.findIndex(line => line.includes('-->'))
      if (timeLineIndex < 0) return undefined
      const [start, end] = lines[timeLineIndex].split('-->').map(part => parseSrtTime(part.trim()))
      const text = lines.slice(timeLineIndex + 1).join(' ').trim()
      if (start == null || end == null || end <= start || !text) return undefined
      return {
        id: `srt-${index + 1}`,
        text,
        startMs: start,
        durationMs: end - start,
      }
    })
    .filter((item): item is VideoEditScriptSegment => Boolean(item))
}

export function timelineDurationMs(timeline: VideoEditTimeline): number {
  return timeline.clips.reduce((max, clip) => Math.max(max, clip.startMs + clip.durationMs), 0)
}

export function trackEndMs(timeline: VideoEditTimeline, trackId: string): number {
  return timeline.clips
    .filter(clip => clip.trackId === trackId)
    .reduce((max, clip) => Math.max(max, clip.startMs + clip.durationMs), 0)
}

export function clipsForTrack(timeline: VideoEditTimeline, trackId: string): VideoEditClip[] {
  return timeline.clips
    .filter(clip => clip.trackId === trackId)
    .sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id))
}

function normalizeTimeline(timeline: VideoEditTimeline): VideoEditTimeline {
  return touchTimeline({
    ...timeline,
    tracks: timeline.tracks.map(sanitizeTrack),
    clips: timeline.clips.map(sanitizeClip).sort((a, b) => a.trackId.localeCompare(b.trackId) || a.startMs - b.startMs),
    markers: timeline.markers
      .map(marker => ({ ...marker, atMs: Math.max(0, marker.atMs), label: marker.label.trim() || 'Marker' }))
      .sort((a, b) => a.atMs - b.atMs),
  })
}

function sanitizeTrack(track: VideoEditTrack): VideoEditTrack {
  return {
    ...track,
    name: track.name.trim() || track.id,
    locked: track.locked === true,
    muted: track.muted === true,
    solo: track.solo === true,
    collapsed: track.collapsed === true,
  }
}

function sanitizeClip(clip: VideoEditClip): VideoEditClip {
  const startMs = Math.max(0, Math.round(clip.startMs))
  const durationMs = Math.max(100, Math.round(clip.durationMs))
  const sourceInMs = Math.max(0, Math.round(clip.sourceInMs))
  const sourceOutMs = Math.max(sourceInMs + 100, Math.round(clip.sourceOutMs || sourceInMs + durationMs))
  return {
    ...clip,
    startMs,
    durationMs,
    sourceInMs,
    sourceOutMs,
    layerIndex: clip.layerIndex == null ? undefined : clampFinite(clip.layerIndex, defaultLayerForKind(clip.kind), -100, 100),
    volume: clip.volume == null ? undefined : clamp(clip.volume, 0, 200),
    speed: clip.speed == null ? undefined : clamp(clip.speed, 0.25, 4),
    fadeInMs: clip.fadeInMs == null ? undefined : clamp(Math.round(clip.fadeInMs), 0, Math.floor(durationMs / 2)),
    fadeOutMs: clip.fadeOutMs == null ? undefined : clamp(Math.round(clip.fadeOutMs), 0, Math.floor(durationMs / 2)),
    cropLeftPercent: clip.cropLeftPercent == null ? undefined : clampFinite(clip.cropLeftPercent, 0, 0, 45),
    cropRightPercent: clip.cropRightPercent == null ? undefined : clampFinite(clip.cropRightPercent, 0, 0, 45),
    cropTopPercent: clip.cropTopPercent == null ? undefined : clampFinite(clip.cropTopPercent, 0, 0, 45),
    cropBottomPercent: clip.cropBottomPercent == null ? undefined : clampFinite(clip.cropBottomPercent, 0, 0, 45),
    overlayXPercent: clip.overlayXPercent == null ? undefined : clampFinite(clip.overlayXPercent, 50, 0, 100),
    overlayYPercent: clip.overlayYPercent == null ? undefined : clampFinite(clip.overlayYPercent, 50, 0, 100),
    overlayScalePercent: clip.overlayScalePercent == null ? undefined : clampFinite(clip.overlayScalePercent, 100, 10, 300),
    overlayOpacityPercent: clip.overlayOpacityPercent == null ? undefined : clampFinite(clip.overlayOpacityPercent, 100, 0, 100),
    captionFontSize: clip.captionFontSize == null ? undefined : clampFinite(clip.captionFontSize, 42, 12, 96),
    captionYPercent: clip.captionYPercent == null ? undefined : clampFinite(clip.captionYPercent, 88, 5, 95),
    captionTextColor: clip.captionTextColor == null ? undefined : sanitizeHexColor(clip.captionTextColor, '#ffffff'),
    captionBoxOpacityPercent: clip.captionBoxOpacityPercent == null ? undefined : clampFinite(clip.captionBoxOpacityPercent, 35, 0, 100),
  }
}

function touchTimeline(timeline: VideoEditTimeline): VideoEditTimeline {
  return { ...timeline, updatedAt: new Date().toISOString() }
}

function inferClipKind(resourceType: VideoEditResourceLike['type']): VideoEditTrackKind {
  if (resourceType === 'audio') return 'audio'
  if (resourceType === 'image') return 'overlay'
  if (resourceType === 'text') return 'caption'
  return 'video'
}

function defaultDurationForKind(kind: VideoEditTrackKind): number {
  if (kind === 'caption') return 3000
  if (kind === 'overlay') return 5000
  return 8000
}

function defaultLayerForKind(kind: VideoEditTrackKind): number {
  if (kind === 'caption') return 40
  if (kind === 'overlay') return 30
  if (kind === 'video') return 0
  return -10
}

function defaultLayerForTrack(trackId: string, kind: VideoEditTrackKind): number {
  if (kind === 'video') {
    const index = parseTrackIndex(trackId)
    if (index != null) return (index - 1) * 10
    return 0
  }
  if (kind === 'overlay') {
    const index = parseTrackIndex(trackId)
    if (index != null) return 30 + index - 1
  }
  if (kind === 'caption') {
    const index = parseTrackIndex(trackId)
    if (index != null) return 40 + index - 1
  }
  return defaultLayerForKind(kind)
}

function createTrack(tracks: VideoEditTrack[], kind: VideoEditTrackKind): VideoEditTrack {
  const index = nextTrackIndex(tracks, kind)
  const prefix = trackPrefix(kind)
  return {
    id: `${prefix}-${index}`,
    kind,
    name: trackName(kind, index),
  }
}

function insertTrackByKind(tracks: VideoEditTrack[], track: VideoEditTrack): VideoEditTrack[] {
  const next = [...tracks]
  if (track.kind === 'video') {
    const firstVideoIndex = next.findIndex(item => item.kind === 'video')
    next.splice(firstVideoIndex >= 0 ? firstVideoIndex : 0, 0, track)
    return next
  }
  if (track.kind === 'overlay') {
    const lastVisualIndex = findLastIndex(next, item => item.kind === 'video' || item.kind === 'overlay')
    next.splice(lastVisualIndex + 1, 0, track)
    return next
  }
  if (track.kind === 'caption') {
    const lastCaptionIndex = findLastIndex(next, item => item.kind === 'caption')
    if (lastCaptionIndex >= 0) {
      next.splice(lastCaptionIndex + 1, 0, track)
      return next
    }
    const firstAudioIndex = next.findIndex(item => item.kind === 'audio')
    next.splice(firstAudioIndex >= 0 ? firstAudioIndex : next.length, 0, track)
    return next
  }
  next.push(track)
  return next
}

function nextTrackIndex(tracks: VideoEditTrack[], kind: VideoEditTrackKind): number {
  const prefix = `${trackPrefix(kind)}-`
  return tracks.reduce((max, track) => {
    if (!track.id.startsWith(prefix)) return max
    return Math.max(max, parseTrackIndex(track.id) ?? 0)
  }, 0) + 1
}

function parseTrackIndex(trackId: string): number | undefined {
  const match = trackId.match(/-(\d+)$/)
  if (!match) return undefined
  const value = Number(match[1])
  return Number.isInteger(value) && value > 0 ? value : undefined
}

function trackPrefix(kind: VideoEditTrackKind): string {
  if (kind === 'caption') return 'caption'
  if (kind === 'overlay') return 'overlay'
  return kind
}

function trackName(kind: VideoEditTrackKind, index: number): string {
  if (kind === 'video') return `V${index}`
  if (kind === 'audio') return `A${index}`
  if (kind === 'caption') return `Captions ${index}`
  return `Overlay ${index}`
}

function findLastIndex<T>(items: T[], predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) return index
  }
  return -1
}

function estimateSpeechDurationMs(text: string, wordsPerMinute: number): number {
  const cjkChars = (text.match(/[\u3400-\u9fff]/g) ?? []).length
  const latinWords = (text.replace(/[\u3400-\u9fff]/g, ' ').match(/\b[\w'-]+\b/g) ?? []).length
  const units = cjkChars + latinWords
  const unitsPerMinute = Math.max(80, wordsPerMinute)
  return Math.max(1200, Math.round(units / unitsPerMinute * 60_000))
}

function parseSrtTime(value: string): number | undefined {
  const match = value.match(/^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})$/)
  if (!match) return undefined
  const [, hours, minutes, seconds, millis] = match
  const ms = Number(millis.padEnd(3, '0'))
  return Number(hours) * 3_600_000 + Number(minutes) * 60_000 + Number(seconds) * 1000 + ms
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function clampFinite(value: number, fallback: number, min: number, max: number): number {
  return clamp(Math.round(Number.isFinite(value) ? value : fallback), min, max)
}

function sanitizeHexColor(value: string, fallback: string): string {
  const normalized = value.trim().toLowerCase()
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : fallback
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
