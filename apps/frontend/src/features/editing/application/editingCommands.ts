import type {
  ElectronMediaPipelineAssetDescriptor,
  ElectronMediaPipelineClip,
  ElectronMediaPipelineEditingProject,
} from '@/shared/contracts/electronApiMedia'
import {
  createMediaEditingProjectService,
  type MediaClip,
  type MediaClipPatch,
  type MediaEditingProject,
  type MediaEditingProjectServiceOptions,
  type MediaTimelineCommand,
  type MediaTrack,
} from '@movscript/editing'

import { createAudioAssetFromVideo, createLocalAsset, upsertAsset } from '../domain/assets'
import {
  compareClips,
  clipCanDropOnTrack,
  createClipFromAsset,
  createClipFromForm,
  normalizeClipPlacement,
  normalizeClipVisualTransformPatch,
} from '../domain/clips'
import {
  EDITING_TIMELINE_MIN_CLIP_DURATION_MS,
} from '../domain/constants'
import type { ClipForm, TimelineClipEditMode, TimelineTrackType } from '../domain/types'
import {
  createTrack,
  ensureAlignedAudioTrack,
  ensureCompatibleTrack,
  nextTrackId,
  nextTrackZIndex,
  normalizeTrackLayerOrder,
  trackIdForAssetType,
  trackTypeForAssetType,
} from '../domain/tracks'
import { normalizeTimelineCanvas } from '../domain/project'

export type SelectedTimelineClip = {
  trackId: string
  clip: ElectronMediaPipelineClip
}

export type TimelineClipClipboardItem = SelectedTimelineClip

function mediaProjectForService(project: ElectronMediaPipelineEditingProject): MediaEditingProject {
  const now = new Date().toISOString()
  return {
    ...project,
    source: project.source ?? { kind: 'manual' },
    createdAt: project.createdAt ?? now,
    updatedAt: project.updatedAt ?? now,
    revision: project.revision ?? 0,
  } as unknown as MediaEditingProject
}

function applyTimelineCommands(
  project: ElectronMediaPipelineEditingProject,
  commands: MediaTimelineCommand[],
  options?: MediaEditingProjectServiceOptions,
): ElectronMediaPipelineEditingProject {
  const service = createMediaEditingProjectService(mediaProjectForService(project), options)
  let nextProject = service.getProject()
  for (const command of commands) {
    nextProject = service.applyCommand(command)
  }
  return nextProject as unknown as ElectronMediaPipelineEditingProject
}

function clipPatchFromDraft(clip: ElectronMediaPipelineClip): MediaClipPatch {
  const { id: _id, assetType: _assetType, asset: _asset, ...patch } = clip
  return patch as unknown as MediaClipPatch
}

function findClip(project: ElectronMediaPipelineEditingProject, clipId: string): SelectedTimelineClip | null {
  for (const track of project.timeline.tracks) {
    const clip = track.clips.find((candidate) => candidate.id === clipId)
    if (clip) return { trackId: track.id, clip }
  }
  return null
}

function cloneTimelineClip(clip: ElectronMediaPipelineClip): ElectronMediaPipelineClip {
  return {
    ...clip,
    asset: clip.asset ? { ...clip.asset, metadata: clip.asset.metadata ? { ...clip.asset.metadata } : undefined } : undefined,
    metadata: clip.metadata ? { ...clip.metadata } : undefined,
  }
}

function ensureCompatibleClipTrack(
  project: ElectronMediaPipelineEditingProject,
  clip: ElectronMediaPipelineClip,
  preferredTrackId = '',
) {
  const preferredTrack = project.timeline.tracks.find((track) => track.id === preferredTrackId && clipCanDropOnTrack(clip, track))
  if (preferredTrack) return { project, track: preferredTrack }
  if (clip.asset) return ensureCompatibleTrack(project, clip.asset, preferredTrackId)
  const existingTrack = project.timeline.tracks.find((track) => clipCanDropOnTrack(clip, track))
  if (existingTrack) return { project, track: existingTrack }
  const trackType = trackTypeForAssetType(clip.assetType)
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

export function updateProjectCanvasCommand(
  project: ElectronMediaPipelineEditingProject,
  patch: Partial<Pick<ElectronMediaPipelineEditingProject['timeline'], 'width' | 'height' | 'fps' | 'background'>>,
) {
  return {
    ...project,
    updatedAt: new Date().toISOString(),
    timeline: normalizeTimelineCanvas({
      ...project.timeline,
      ...patch,
    }),
  }
}

export function addLocalAssetCommand(
  project: ElectronMediaPipelineEditingProject,
  localPath: string,
  assetOverride?: ElectronMediaPipelineAssetDescriptor,
) {
  const asset = assetOverride ?? createLocalAsset(localPath)
  return {
    project: {
      ...project,
      assets: {
        assets: upsertAsset(project.assets.assets, asset),
      },
      updatedAt: new Date().toISOString(),
    },
    asset,
  }
}

export function removeAssetCommand(project: ElectronMediaPipelineEditingProject, assetId: string) {
  const nextTracks = project.timeline.tracks.map((track) => ({
    ...track,
    clips: track.clips.filter((clip) => clip.asset?.id !== assetId),
  }))
  return {
    ...project,
    assets: { assets: project.assets.assets.filter((asset) => asset.id !== assetId) },
    timeline: { ...project.timeline, tracks: nextTracks },
    updatedAt: new Date().toISOString(),
  }
}

export function extractAudioAssetCommand(project: ElectronMediaPipelineEditingProject, asset: ElectronMediaPipelineAssetDescriptor) {
  const audioAsset = createAudioAssetFromVideo(asset)
  return {
    project: {
      ...project,
      assets: {
        assets: upsertAsset(project.assets.assets, audioAsset),
      },
      updatedAt: new Date().toISOString(),
    },
    audioAsset,
  }
}

export function addClipFromFormCommand(
  project: ElectronMediaPipelineEditingProject,
  asset: ElectronMediaPipelineAssetDescriptor,
  form: ClipForm,
  playheadMs: number,
) {
  const { project: projectWithTrack, track } = ensureCompatibleTrack(project, asset, form.trackId)
  const clip = normalizeClipPlacement(
    projectWithTrack,
    track.id,
    createClipFromForm(asset, { ...form, trackId: track.id, timelineStartMs: String(playheadMs) }, projectWithTrack),
    undefined,
    'move',
    [playheadMs],
  )
  return {
    project: applyTimelineCommands(projectWithTrack, [{ type: 'add_clip', trackId: track.id, clip: clip as unknown as MediaClip }]),
    clip,
    track,
  }
}

export function addAssetClipToTrackCommand(
  project: ElectronMediaPipelineEditingProject,
  asset: ElectronMediaPipelineAssetDescriptor,
  trackId: string,
  timelineStartMs: number,
  playheadMs: number,
) {
  const clip = normalizeClipPlacement(project, trackId, createClipFromAsset(asset, trackId, timelineStartMs, project), undefined, 'move', [playheadMs])
  return {
    project: applyTimelineCommands(project, [{ type: 'add_clip', trackId, clip: clip as unknown as MediaClip }]),
    clip,
  }
}

export function addAssetClipToCompatibleTrackCommand(
  project: ElectronMediaPipelineEditingProject,
  asset: ElectronMediaPipelineAssetDescriptor,
  timelineStartMs: number,
  playheadMs: number,
) {
  const { project: projectWithTrack, track } = ensureCompatibleTrack(project, asset)
  const { project: nextProject, clip } = addAssetClipToTrackCommand(projectWithTrack, asset, track.id, timelineStartMs, playheadMs)
  return { project: nextProject, clip, track }
}

export function updateClipCommand(
  project: ElectronMediaPipelineEditingProject,
  selectedClip: SelectedTimelineClip,
  patch: Partial<ElectronMediaPipelineClip>,
  playheadMs: number,
) {
  const sourceStartMs = patch.sourceStartMs ?? selectedClip.clip.sourceStartMs ?? 0
  const durationMs = patch.durationMs ?? selectedClip.clip.durationMs
  const normalizedPatch: Partial<ElectronMediaPipelineClip> = {
    ...patch,
    sourceEndMs: sourceStartMs + durationMs,
  }
  const editMode: TimelineClipEditMode = patch.durationMs !== undefined ? 'trim-end' : 'move'
  const draftClip = normalizeClipPlacement(project, selectedClip.trackId, { ...selectedClip.clip, ...normalizedPatch }, selectedClip.clip.id, editMode, [playheadMs])
  return {
    project: applyTimelineCommands(project, [{ type: 'update_clip', clipId: selectedClip.clip.id, patch: clipPatchFromDraft(draftClip) }]),
    clip: draftClip,
  }
}

export function updateClipTransformCommand(
  project: ElectronMediaPipelineEditingProject,
  clipId: string,
  patch: Pick<Partial<ElectronMediaPipelineClip>, 'scale' | 'xPercent' | 'yPercent'>,
) {
  const normalizedPatch = normalizeClipVisualTransformPatch(patch)
  const found = findClip(project, clipId)
  if (!found) return undefined
  const nextProject = applyTimelineCommands(project, [{ type: 'update_clip', clipId, patch: normalizedPatch as unknown as MediaClipPatch }])
  const nextTrack = nextProject.timeline.tracks.find((track) => track.id === found.trackId)
  if (!nextTrack) return undefined
  return {
    project: nextProject,
    track: nextTrack,
  }
}

function applyDetachAudioTimelineCommands(
  project: ElectronMediaPipelineEditingProject,
  selectedClip: SelectedTimelineClip,
  audioClip: ElectronMediaPipelineClip,
  audioTrackId: string,
) {
  return applyTimelineCommands(project, [
    {
      type: 'update_clip',
      clipId: selectedClip.clip.id,
      patch: {
        muted: true,
        metadata: {
          ...(selectedClip.clip.metadata ?? {}),
          linkedAudioClipId: audioClip.id,
          linkedAudioAssetId: audioClip.asset?.id,
        },
      },
    },
    { type: 'add_clip', trackId: audioTrackId, clip: audioClip as unknown as MediaClip },
  ])
}

export function detachClipAudioCommand(
  project: ElectronMediaPipelineEditingProject,
  selectedClip: SelectedTimelineClip,
) {
  if (selectedClip.clip.assetType !== 'video' || !selectedClip.clip.asset) return undefined
  const linkedAudioClipId = selectedClip.clip.metadata?.linkedAudioClipId
  const existingLinkedAudioClip = linkedAudioClipId ? findClip(project, String(linkedAudioClipId)) : null
  if (existingLinkedAudioClip?.clip.assetType === 'audio') return undefined
  const audioAsset = createAudioAssetFromVideo(selectedClip.clip.asset)
  const projectWithAsset = {
    ...project,
    assets: {
      assets: upsertAsset(project.assets.assets, audioAsset),
    },
    updatedAt: new Date().toISOString(),
  }
  const { project: projectWithAudioTrack, track } = ensureAlignedAudioTrack(projectWithAsset, selectedClip.clip)
  const sourceStartMs = selectedClip.clip.sourceStartMs ?? 0
  const audioClip: ElectronMediaPipelineClip = {
    id: `clip_audio_${selectedClip.clip.id}_${Date.now()}`,
    assetType: 'audio',
    asset: audioAsset,
    timelineStartMs: selectedClip.clip.timelineStartMs,
    durationMs: selectedClip.clip.durationMs,
    sourceStartMs,
    sourceEndMs: sourceStartMs + selectedClip.clip.durationMs,
    volume: selectedClip.clip.volume ?? 100,
    muted: false,
    fit: 'none',
    metadata: {
      ...(selectedClip.clip.metadata ?? {}),
      linkedVideoClipId: selectedClip.clip.id,
      linkedVideoAssetId: selectedClip.clip.asset.id,
    },
  }
  return {
    project: applyDetachAudioTimelineCommands(projectWithAudioTrack, selectedClip, audioClip, track.id),
    audioAsset,
    audioClip,
    track,
  }
}

export function splitClipAtPlayheadCommand(
  project: ElectronMediaPipelineEditingProject,
  selectedClip: SelectedTimelineClip,
  playheadMs: number,
) {
  const splitMs = playheadMs - selectedClip.clip.timelineStartMs
  if (splitMs <= EDITING_TIMELINE_MIN_CLIP_DURATION_MS || splitMs >= selectedClip.clip.durationMs - EDITING_TIMELINE_MIN_CLIP_DURATION_MS) return undefined
  const rightId = `${selectedClip.clip.id}_right_${Date.now()}`
  const nextProject = applyTimelineCommands(
    project,
    [{ type: 'split_clip', clipId: selectedClip.clip.id, splitTimeMs: playheadMs }],
    { idFactory: () => rightId },
  )
  const left = findClip(nextProject, selectedClip.clip.id)?.clip
  const right = findClip(nextProject, rightId)?.clip
  if (!left || !right) return undefined
  return {
    project: nextProject,
    left,
    right,
  }
}

export function deleteClipCommand(
  project: ElectronMediaPipelineEditingProject,
  selectedClip: SelectedTimelineClip,
  options: { ripple?: boolean } = {},
) {
  const nextProject = applyTimelineCommands(project, [{ type: 'delete_clip', clipId: selectedClip.clip.id }])
  if (!options.ripple) return nextProject
  const deletedClipEndMs = selectedClip.clip.timelineStartMs + selectedClip.clip.durationMs
  return {
    ...nextProject,
    updatedAt: new Date().toISOString(),
    timeline: {
      ...nextProject.timeline,
      tracks: nextProject.timeline.tracks.map((track) => {
        if (track.id !== selectedClip.trackId) return track
        return {
          ...track,
          clips: track.clips.map((clip) => (
            clip.timelineStartMs >= deletedClipEndMs
              ? { ...clip, timelineStartMs: Math.max(0, clip.timelineStartMs - selectedClip.clip.durationMs) }
              : clip
          )).sort(compareClips),
        }
      }),
    },
  }
}

export function copyTimelineClip(selectedClip: SelectedTimelineClip): TimelineClipClipboardItem {
  return {
    trackId: selectedClip.trackId,
    clip: cloneTimelineClip(selectedClip.clip),
  }
}

export function pasteTimelineClipCommand(
  project: ElectronMediaPipelineEditingProject,
  clipboardItem: TimelineClipClipboardItem,
  timelineStartMs: number,
) {
  const { project: projectWithTrack, track } = ensureCompatibleClipTrack(project, clipboardItem.clip, clipboardItem.trackId)
  const sourceStartMs = clipboardItem.clip.sourceStartMs ?? 0
  const draftClip: ElectronMediaPipelineClip = {
    ...cloneTimelineClip(clipboardItem.clip),
    id: `${clipboardItem.clip.id}_copy_${Date.now()}`,
    timelineStartMs: Math.max(0, Math.round(timelineStartMs)),
    sourceStartMs,
    sourceEndMs: sourceStartMs + clipboardItem.clip.durationMs,
  }
  const clip = normalizeClipPlacement(projectWithTrack, track.id, draftClip, undefined, 'move', [timelineStartMs])
  return {
    project: applyTimelineCommands(projectWithTrack, [{ type: 'add_clip', trackId: track.id, clip: clip as unknown as MediaClip }]),
    clip,
    track,
  }
}

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

export { trackIdForAssetType }
