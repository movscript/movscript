import type {
  ElectronMediaPipelineAssetDescriptor,
  ElectronMediaPipelineClip,
  ElectronMediaPipelineEditingProject,
} from '@movscript/editing-surface/contracts'

import { assetCanDropOnTrack, compareClips } from './clips'
import type { TimelineTrack, TimelineTrackType } from './types'

export function defaultTimelineTracks(): ElectronMediaPipelineEditingProject['timeline']['tracks'] {
  return [
    { id: 'track_video_0', type: 'video', zIndex: 0, clips: [] },
    { id: 'track_audio_0', type: 'audio', zIndex: 0, clips: [] },
    { id: 'track_subtitle_0', type: 'subtitle', zIndex: 1, clips: [] },
  ]
}

export function trackIdForAssetType(assetType: ElectronMediaPipelineAssetDescriptor['assetType']) {
  if (assetType === 'audio') return 'track_audio_0'
  if (assetType === 'text' || assetType === 'subtitle') return 'track_subtitle_0'
  return 'track_video_0'
}

export function updateProjectTrack(
  project: ElectronMediaPipelineEditingProject,
  trackId: string,
  updateTrack: (track: TimelineTrack) => TimelineTrack,
): ElectronMediaPipelineEditingProject {
  const existingTrack = project.timeline.tracks.find((track) => track.id === trackId)
  const targetTrack = existingTrack ?? createTrack(trackId)
  const nextTrack = updateTrack(targetTrack)
  const nextTracks = existingTrack
    ? project.timeline.tracks.map((track) => track.id === trackId ? nextTrack : track)
    : [...project.timeline.tracks, nextTrack]
  return {
    ...project,
    updatedAt: new Date().toISOString(),
    timeline: {
      ...project.timeline,
      tracks: nextTracks,
    },
  }
}

export function ensureCompatibleTrack(
  project: ElectronMediaPipelineEditingProject,
  asset: ElectronMediaPipelineAssetDescriptor,
  preferredTrackId = '',
) {
  const preferredTrack = project.timeline.tracks.find((track) => track.id === preferredTrackId && assetCanDropOnTrack(asset, track))
  if (preferredTrack) return { project, track: preferredTrack }
  const existingTrack = project.timeline.tracks.find((track) => assetCanDropOnTrack(asset, track))
  if (existingTrack) return { project, track: existingTrack }
  const trackType = trackTypeForAssetType(asset.assetType)
  const track = createTrack(nextTrackId(project, trackType), trackType, nextTrackZIndex(project, trackType))
  return {
    project: {
      ...project,
      updatedAt: new Date().toISOString(),
      timeline: {
        ...project.timeline,
        tracks: normalizeTrackLayerOrder([...project.timeline.tracks, track]),
      },
    },
    track,
  }
}

export function ensureAlignedAudioTrack(
  project: ElectronMediaPipelineEditingProject,
  clip: ElectronMediaPipelineClip,
) {
  const clipStartMs = clip.timelineStartMs
  const clipEndMs = clip.timelineStartMs + clip.durationMs
  const existingTrack = project.timeline.tracks.find((track) => (
    track.type === 'audio'
    && track.clips.every((candidate) => !timelineRangesOverlap(
      clipStartMs,
      clipEndMs,
      candidate.timelineStartMs,
      candidate.timelineStartMs + candidate.durationMs,
    ))
  ))
  if (existingTrack) return { project, track: existingTrack }
  const track = createTrack(nextTrackId(project, 'audio'), 'audio', nextTrackZIndex(project, 'audio'))
  return {
    project: {
      ...project,
      updatedAt: new Date().toISOString(),
      timeline: {
        ...project.timeline,
        tracks: normalizeTrackLayerOrder([...project.timeline.tracks, track]),
      },
    },
    track,
  }
}

export function timelineRangesOverlap(startMs: number, endMs: number, candidateStartMs: number, candidateEndMs: number) {
  return startMs < candidateEndMs && candidateStartMs < endMs
}

export function moveClipToTrack(
  project: ElectronMediaPipelineEditingProject,
  sourceTrackId: string,
  targetTrackId: string,
  clipId: string,
  nextClip: ElectronMediaPipelineClip,
): ElectronMediaPipelineEditingProject {
  return {
    ...project,
    updatedAt: new Date().toISOString(),
    timeline: {
      ...project.timeline,
      tracks: project.timeline.tracks.map((track) => {
        if (track.id === sourceTrackId && track.id === targetTrackId) {
          return {
            ...track,
            clips: track.clips.map((clip) => clip.id === clipId ? nextClip : clip).sort(compareClips),
          }
        }
        if (track.id === sourceTrackId) {
          return { ...track, clips: track.clips.filter((clip) => clip.id !== clipId) }
        }
        if (track.id === targetTrackId) {
          return { ...track, clips: [...track.clips.filter((clip) => clip.id !== clipId), nextClip].sort(compareClips) }
        }
        return track
      }),
    },
  }
}

export function reorderClipWithinTrackByMidpoint(
  project: ElectronMediaPipelineEditingProject,
  trackId: string,
  clipId: string,
  draggedCenterMs: number,
): { project: ElectronMediaPipelineEditingProject; clip: ElectronMediaPipelineClip } | undefined {
  const track = project.timeline.tracks.find((candidate) => candidate.id === trackId)
  if (!track) return undefined
  const sortedClips = [...track.clips].sort(compareClips)
  const clipIndex = sortedClips.findIndex((clip) => clip.id === clipId)
  if (clipIndex < 0) return undefined
  const otherClips = sortedClips.filter((clip) => clip.id !== clipId)
  const targetIndex = otherClips.reduce((index, clip) => (
    draggedCenterMs > clipCenterMs(clip) ? index + 1 : index
  ), 0)
  if (targetIndex === clipIndex) return undefined

  const reorderedIds = sortedClips.map((clip) => clip.id)
  const [movedId] = reorderedIds.splice(clipIndex, 1)
  if (movedId === undefined) return undefined
  reorderedIds.splice(targetIndex, 0, movedId)
  const originalGaps = sortedClips.map((clip, index) => {
    const next = sortedClips[index + 1]
    return next ? Math.max(0, next.timelineStartMs - (clip.timelineStartMs + clip.durationMs)) : 0
  })
  const clipById = new Map(sortedClips.map((clip) => [clip.id, clip]))
  let cursorMs = sortedClips[0]?.timelineStartMs ?? 0
  let movedClip: ElectronMediaPipelineClip | undefined
  const nextClips = reorderedIds.map((id, index) => {
    const clip = clipById.get(id)
    if (!clip) return undefined
    const nextClip = {
      ...clip,
      timelineStartMs: cursorMs,
    }
    if (id === clipId) movedClip = nextClip
    cursorMs += clip.durationMs + (originalGaps[index] ?? 0)
    return nextClip
  }).filter((clip): clip is ElectronMediaPipelineClip => Boolean(clip))

  if (!movedClip) return undefined
  return {
    project: {
      ...project,
      updatedAt: new Date().toISOString(),
      timeline: {
        ...project.timeline,
        tracks: project.timeline.tracks.map((candidate) => (
          candidate.id === trackId ? { ...candidate, clips: nextClips.sort(compareClips) } : candidate
        )),
      },
    },
    clip: movedClip,
  }
}

function clipCenterMs(clip: ElectronMediaPipelineClip) {
  return clip.timelineStartMs + clip.durationMs / 2
}

export function createTrack(
  trackId: string,
  explicitType?: TimelineTrackType,
  zIndex?: number,
): TimelineTrack {
  const type = explicitType ?? (trackId.includes('audio')
    ? 'audio'
    : trackId.includes('subtitle')
      ? 'subtitle'
      : 'video')
  return { id: trackId, type, zIndex: zIndex ?? (type === 'subtitle' ? 1 : 0), clips: [] }
}

export function nextTrackId(project: ElectronMediaPipelineEditingProject, type: TimelineTrackType) {
  const prefix = `track_${type}_`
  let index = project.timeline.tracks
    .filter((track) => track.id.startsWith(prefix))
    .reduce((maxIndex, track) => {
      const parsed = Number.parseInt(track.id.slice(prefix.length), 10)
      return Number.isFinite(parsed) ? Math.max(maxIndex, parsed) : maxIndex
    }, -1) + 1
  while (project.timeline.tracks.some((track) => track.id === `${prefix}${index}`)) index += 1
  return `${prefix}${index}`
}

export function nextTrackZIndex(project: ElectronMediaPipelineEditingProject, type: TimelineTrackType) {
  const sameVisualTracks = project.timeline.tracks.filter((track) => track.type === type)
  if (type === 'video' || type === 'image') {
    return sameVisualTracks.reduce((maxIndex, track) => Math.max(maxIndex, track.zIndex), -1) + 1
  }
  if (type === 'subtitle' || type === 'text') return 10 + sameVisualTracks.length
  return 0
}

export function trackTypeForAssetType(assetType: ElectronMediaPipelineAssetDescriptor['assetType']): TimelineTrackType {
  if (assetType === 'audio') return 'audio'
  if (assetType === 'subtitle' || assetType === 'text') return 'subtitle'
  return 'video'
}

export function canDeleteTimelineTrack(
  project: ElectronMediaPipelineEditingProject,
  track: TimelineTrack,
) {
  return project.timeline.tracks.some((candidate) => candidate.id === track.id) && track.clips.length === 0
}

export function canMoveTimelineTrack(
  project: ElectronMediaPipelineEditingProject,
  track: TimelineTrack,
  direction: -1 | 1,
) {
  const sameTypeTracks = project.timeline.tracks.filter((candidate) => candidate.type === track.type)
  const sameTypeIndex = sameTypeTracks.findIndex((candidate) => candidate.id === track.id)
  return sameTypeIndex >= 0 && sameTypeIndex + direction >= 0 && sameTypeIndex + direction < sameTypeTracks.length
}

export function normalizeTrackLayerOrder(
  tracks: ElectronMediaPipelineEditingProject['timeline']['tracks'],
): ElectronMediaPipelineEditingProject['timeline']['tracks'] {
  const visualTracks = tracks.filter((track) => track.type === 'video' || track.type === 'image')
  const subtitleTracks = tracks.filter((track) => track.type === 'subtitle' || track.type === 'text')
  return tracks.map((track) => {
    if (track.type === 'video' || track.type === 'image') {
      const visualIndex = visualTracks.findIndex((candidate) => candidate.id === track.id)
      return { ...track, zIndex: Math.max(0, visualTracks.length - visualIndex - 1) }
    }
    if (track.type === 'subtitle' || track.type === 'text') {
      const subtitleIndex = subtitleTracks.findIndex((candidate) => candidate.id === track.id)
      return { ...track, zIndex: 100 + subtitleTracks.length - subtitleIndex - 1 }
    }
    return { ...track, zIndex: 0 }
  })
}

export function trackDisplayName(track: TimelineTrack) {
  const sameTypeSuffix = track.id.match(/_(\d+)$/)?.[1]
  const index = sameTypeSuffix ? Number.parseInt(sameTypeSuffix, 10) + 1 : undefined
  const label = track.type === 'video'
    ? '视频'
    : track.type === 'audio'
      ? '音频'
      : track.type === 'subtitle'
        ? '字幕'
        : track.type
  return `${label}${index ? ` ${index}` : ''}`
}
