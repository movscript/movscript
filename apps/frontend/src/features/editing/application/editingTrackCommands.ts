import type {
  ElectronMediaPipelineEditingProject,
} from '@/shared/contracts/electronApiMedia'
import type { MediaTrack } from '@movscript/editing'

import type { TimelineTrackType } from '../domain/types'
import {
  createTrack,
  nextTrackId,
  nextTrackZIndex,
  normalizeTrackLayerOrder,
} from '../domain/tracks'
import { applyTimelineCommands } from './editingCommandService'

export function addTimelineTrackCommand(project: ElectronMediaPipelineEditingProject, type: TimelineTrackType) {
  const track = createTrack(nextTrackId(project, type), type, nextTrackZIndex(project, type))
  return {
    project: applyTimelineCommands(project, [{ type: 'add_track', track: track as unknown as MediaTrack }]),
    track,
  }
}

export function deleteTimelineTrackCommand(project: ElectronMediaPipelineEditingProject, trackId: string) {
  const track = project.timeline.tracks.find((candidate) => candidate.id === trackId)
  if (!track || track.clips.length > 0) return undefined
  const nextProject = applyTimelineCommands(project, [{ type: 'remove_track', trackId }])
  return {
    project: nextProject,
    track,
    nextTracks: nextProject.timeline.tracks,
  }
}

export function moveTimelineTrackCommand(project: ElectronMediaPipelineEditingProject, trackId: string, direction: -1 | 1) {
  const trackIndex = project.timeline.tracks.findIndex((track) => track.id === trackId)
  const track = project.timeline.tracks[trackIndex]
  if (!track) return undefined
  const sameTypeTracks = project.timeline.tracks
    .map((candidate, index) => ({ track: candidate, index }))
    .filter((candidate) => candidate.track.type === track.type)
  const sameTypeIndex = sameTypeTracks.findIndex((candidate) => candidate.track.id === trackId)
  const swapTarget = sameTypeTracks[sameTypeIndex + direction]
  if (!swapTarget) return undefined
  const nextTracks = [...project.timeline.tracks]
  nextTracks[trackIndex] = swapTarget.track
  nextTracks[swapTarget.index] = track
  return {
    ...project,
    updatedAt: new Date().toISOString(),
    revision: (project.revision ?? 0) + 1,
    timeline: {
      ...project.timeline,
      tracks: normalizeTrackLayerOrder(nextTracks),
    },
  }
}

export function toggleTimelineTrackLockedCommand(project: ElectronMediaPipelineEditingProject, trackId: string) {
  return {
    ...project,
    updatedAt: new Date().toISOString(),
    timeline: {
      ...project.timeline,
      tracks: project.timeline.tracks.map((track) => (
        track.id === trackId ? { ...track, locked: !track.locked } : track
      )),
    },
  }
}

export function toggleTimelineTrackMutedCommand(project: ElectronMediaPipelineEditingProject, trackId: string) {
  return {
    ...project,
    updatedAt: new Date().toISOString(),
    timeline: {
      ...project.timeline,
      tracks: project.timeline.tracks.map((track) => (
        track.id === trackId ? { ...track, muted: !track.muted } : track
      )),
    },
  }
}
