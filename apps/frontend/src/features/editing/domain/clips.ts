import type {
  ElectronMediaPipelineAssetDescriptor,
  ElectronMediaPipelineClip,
  ElectronMediaPipelineEditingProject,
} from '@/shared/contracts/electronApiMedia'

import {
  EDITING_TIMELINE_FRAME_CELL_MS,
  EDITING_TIMELINE_MIN_CLIP_DURATION_MS,
  EDITING_TIMELINE_SNAP_THRESHOLD_MS,
} from './constants'
import { collectTimelineSnapPoints, resolveTimelineSnap } from './timelineInteraction'
import type { ClipForm, TimelineClipEditMode, TimelineTrack } from './types'
import { clampTimelineRange } from './timelineGeometry'
import { hashText, numberInput } from './utils'
import {
  clipAssetDurationMs,
  defaultClipDurationMs,
  normalizeClipSourceStartMs,
  resolveClipFit,
} from './clipMediaModel'

export {
  assetAspectRatio,
  clipAssetDurationMs,
  defaultClipDurationMs,
  normalizeClipSourceStartMs,
  numberMetadata,
  resolveClipFit,
} from './clipMediaModel'
export {
  clipPositionPercent,
  clipScaleFromPercent,
  clipScalePercent,
  cssObjectFitForClip,
  normalizeClipVisualTransformPatch,
  previewClipFrameStyle,
} from './clipVisualModel'

type NormalizeClipPlacementOptions = {
  allowTrimEndThroughFollowingClips?: boolean
}

export function createClipFromForm(
  asset: ElectronMediaPipelineAssetDescriptor,
  form: ClipForm,
  project?: ElectronMediaPipelineEditingProject,
): ElectronMediaPipelineClip {
  const timelineStartMs = numberInput(form.timelineStartMs)
  const sourceDurationMs = clipAssetDurationMs(asset)
  const sourceStartMs = normalizeClipSourceStartMs(numberInput(form.sourceStartMs), sourceDurationMs, asset.assetType)
  const requestedDurationMs = Math.max(1, numberInput(form.durationMs))
  const durationMs = sourceDurationMs && asset.assetType !== 'image'
    ? clampTimelineRange(requestedDurationMs, EDITING_TIMELINE_MIN_CLIP_DURATION_MS, Math.max(EDITING_TIMELINE_MIN_CLIP_DURATION_MS, sourceDurationMs - sourceStartMs))
    : requestedDurationMs
  return {
    id: `clip_${Date.now()}_${hashText(`${asset.id}:${timelineStartMs}:${durationMs}`)}`,
    assetType: asset.assetType,
    asset,
    timelineStartMs,
    durationMs,
    sourceStartMs,
    sourceEndMs: sourceStartMs + durationMs,
    fit: resolveClipFit(asset, project, form.fit),
  }
}

export function createClipFromAsset(
  asset: ElectronMediaPipelineAssetDescriptor,
  trackId: string,
  timelineStartMs: number,
  project?: ElectronMediaPipelineEditingProject,
): ElectronMediaPipelineClip {
  return createClipFromForm(asset, {
    assetId: asset.id,
    trackId,
    timelineStartMs: String(timelineStartMs),
    durationMs: String(defaultClipDurationMs(asset)),
    sourceStartMs: '0',
    fit: 'contain',
  }, project)
}

export function timelineClipCells(clip: ElectronMediaPipelineClip) {
  const count = timelineClipThumbnailCellCount(clip)
  return Array.from({ length: count }, (_value, index) => index)
}

export function timelineClipThumbnailCellCount(
  clip: Pick<ElectronMediaPipelineClip, 'durationMs'>,
  clipWidthPx?: number,
) {
  const durationBasedCount = Math.ceil(clip.durationMs / EDITING_TIMELINE_FRAME_CELL_MS)
  const widthBasedCount = clipWidthPx && Number.isFinite(clipWidthPx)
    ? Math.floor(clipWidthPx / 42)
    : undefined
  return Math.min(48, Math.max(3, widthBasedCount ?? durationBasedCount))
}

export function timelineWaveformBarHeight(index: number, seed: string) {
  const hash = hashText(`${seed}:${index}`)
  const numeric = Number.parseInt(hash.slice(0, 4), 36)
  return 24 + (numeric % 64)
}

export function assetCanDropOnTrack(
  asset: ElectronMediaPipelineAssetDescriptor,
  track: TimelineTrack,
) {
  if (asset.assetType === 'audio') return track.type === 'audio'
  if (asset.assetType === 'subtitle' || asset.assetType === 'text') return track.type === 'subtitle' || track.type === 'text'
  if (asset.assetType === 'image') return track.type === 'image' || track.type === 'video'
  return track.type === 'video'
}

export function clipCanDropOnTrack(
  clip: ElectronMediaPipelineClip,
  track: TimelineTrack,
) {
  if (clip.asset) return assetCanDropOnTrack(clip.asset, track)
  if (clip.assetType === 'audio') return track.type === 'audio'
  if (clip.assetType === 'subtitle' || clip.assetType === 'text') return track.type === 'subtitle' || track.type === 'text'
  if (clip.assetType === 'image') return track.type === 'image' || track.type === 'video'
  return track.type === 'video'
}

export function draftClipFromPointerDelta(
  clip: ElectronMediaPipelineClip,
  deltaMs: number,
  mode: TimelineClipEditMode,
): ElectronMediaPipelineClip {
  if (mode === 'move') {
    return {
      ...clip,
      timelineStartMs: Math.max(0, clip.timelineStartMs + deltaMs),
    }
  }
  if (mode === 'trim-start') {
    const clipEndMs = clip.timelineStartMs + clip.durationMs
    const nextStartMs = Math.min(
      Math.max(0, clip.timelineStartMs + deltaMs),
      clipEndMs - EDITING_TIMELINE_MIN_CLIP_DURATION_MS,
    )
    const sourceDeltaMs = nextStartMs - clip.timelineStartMs
    const sourceStartMs = Math.max(0, (clip.sourceStartMs ?? 0) + sourceDeltaMs)
    return {
      ...clip,
      timelineStartMs: nextStartMs,
      durationMs: clipEndMs - nextStartMs,
      sourceStartMs,
      sourceEndMs: sourceStartMs + (clipEndMs - nextStartMs),
    }
  }
  const nextDurationMs = Math.max(EDITING_TIMELINE_MIN_CLIP_DURATION_MS, clip.durationMs + deltaMs)
  return {
    ...clip,
    durationMs: nextDurationMs,
    sourceEndMs: (clip.sourceStartMs ?? 0) + nextDurationMs,
  }
}

export function normalizeClipPlacement(
  project: ElectronMediaPipelineEditingProject,
  trackId: string,
  clip: ElectronMediaPipelineClip,
  ignoreClipId?: string,
  mode: TimelineClipEditMode = 'move',
  extraSnapPoints: number[] = [],
  snapEnabled = true,
  options: NormalizeClipPlacementOptions = {},
): ElectronMediaPipelineClip {
  const track = project.timeline.tracks.find((candidate) => candidate.id === trackId)
  const sourceDurationMs = clip.asset ? clipAssetDurationMs(clip.asset) : undefined
  const siblingClips = (track?.clips ?? [])
    .filter((candidate) => candidate.id !== (ignoreClipId ?? clip.id))
    .sort(compareClips)
  const previousClip = siblingClips
    .filter((candidate) => candidate.timelineStartMs <= clip.timelineStartMs)
    .at(-1)
  const nextClip = siblingClips.find((candidate) => candidate.timelineStartMs >= clip.timelineStartMs)
  const previousEndMs = previousClip ? previousClip.timelineStartMs + previousClip.durationMs : 0
  const nextStartMs = nextClip?.timelineStartMs ?? Number.POSITIVE_INFINITY

  if (mode === 'trim-start') {
    const clipEndMs = clip.timelineStartMs + clip.durationMs
    const snappedStartMs = snapTimelineMs(clip.timelineStartMs, project, ignoreClipId, extraSnapPoints, snapEnabled)
    const nextStartMs = clampTimelineRange(snappedStartMs, previousEndMs, clipEndMs - EDITING_TIMELINE_MIN_CLIP_DURATION_MS)
    const sourceStartMs = normalizeClipSourceStartMs(clip.sourceStartMs ?? 0, sourceDurationMs, clip.assetType)
    const durationMs = sourceDurationMs
      ? Math.min(clipEndMs - nextStartMs, Math.max(EDITING_TIMELINE_MIN_CLIP_DURATION_MS, sourceDurationMs - sourceStartMs))
      : clipEndMs - nextStartMs
    return {
      ...clip,
      timelineStartMs: nextStartMs,
      durationMs,
      sourceStartMs,
      sourceEndMs: sourceStartMs + durationMs,
    }
  }

  if (mode === 'trim-end') {
    const desiredEndMs = snapTimelineMs(clip.timelineStartMs + clip.durationMs, project, ignoreClipId, extraSnapPoints, snapEnabled)
    const maxEndMs = options.allowTrimEndThroughFollowingClips || !Number.isFinite(nextStartMs) ? desiredEndMs : nextStartMs
    const nextEndMs = clampTimelineRange(
      desiredEndMs,
      clip.timelineStartMs + EDITING_TIMELINE_MIN_CLIP_DURATION_MS,
      maxEndMs,
    )
    const requestedDurationMs = nextEndMs - clip.timelineStartMs
    const sourceStartMs = normalizeClipSourceStartMs(clip.sourceStartMs ?? 0, sourceDurationMs, clip.assetType)
    const durationMs = sourceDurationMs
      ? Math.min(requestedDurationMs, Math.max(EDITING_TIMELINE_MIN_CLIP_DURATION_MS, sourceDurationMs - sourceStartMs))
      : requestedDurationMs
    return {
      ...clip,
      durationMs,
      sourceEndMs: sourceStartMs + durationMs,
    }
  }

  const requestedDurationMs = Math.max(EDITING_TIMELINE_MIN_CLIP_DURATION_MS, clip.durationMs)
  const sourceStartMs = normalizeClipSourceStartMs(clip.sourceStartMs ?? 0, sourceDurationMs, clip.assetType)
  const durationMs = sourceDurationMs && clip.assetType !== 'image'
    ? Math.min(requestedDurationMs, Math.max(EDITING_TIMELINE_MIN_CLIP_DURATION_MS, sourceDurationMs - sourceStartMs))
    : requestedDurationMs
  const snappedStartMs = snapTimelineMs(clip.timelineStartMs, project, ignoreClipId, extraSnapPoints, snapEnabled)
  const nextStartCandidate = Number.isFinite(nextStartMs)
    ? Math.max(previousEndMs, nextStartMs - durationMs)
    : snappedStartMs
  return {
    ...clip,
    timelineStartMs: closestNonOverlappingTimelineStart(project, trackId, snappedStartMs, durationMs, ignoreClipId)
      ?? clampTimelineRange(snappedStartMs, previousEndMs, nextStartCandidate),
    durationMs,
    sourceStartMs,
    sourceEndMs: sourceStartMs + durationMs,
  }
}

export function closestNonOverlappingTimelineStart(
  project: ElectronMediaPipelineEditingProject,
  trackId: string,
  desiredStartMs: number,
  durationMs: number,
  ignoreClipId?: string,
) {
  const track = project.timeline.tracks.find((candidate) => candidate.id === trackId)
  const siblingClips = (track?.clips ?? [])
    .filter((candidate) => candidate.id !== ignoreClipId)
    .sort(compareClips)
  let bestStartMs: number | undefined
  let bestDistanceMs = Number.POSITIVE_INFINITY
  let previousEndMs = 0

  const considerSlot = (slotStartMs: number, slotEndMs: number) => {
    if (slotEndMs < slotStartMs) return
    const candidateStartMs = clampTimelineRange(desiredStartMs, slotStartMs, slotEndMs)
    const distanceMs = Math.abs(candidateStartMs - desiredStartMs)
    if (distanceMs < bestDistanceMs) {
      bestStartMs = candidateStartMs
      bestDistanceMs = distanceMs
    }
  }

  for (const clip of siblingClips) {
    considerSlot(previousEndMs, clip.timelineStartMs - durationMs)
    previousEndMs = Math.max(previousEndMs, clip.timelineStartMs + clip.durationMs)
  }
  considerSlot(previousEndMs, Math.max(previousEndMs, desiredStartMs))

  return bestStartMs
}

export function applyRippleTrimEndToTrack(
  project: ElectronMediaPipelineEditingProject,
  trackId: string,
  clipId: string,
  originalClip: ElectronMediaPipelineClip,
  editedClip: ElectronMediaPipelineClip,
): ElectronMediaPipelineEditingProject {
  const originalEndMs = originalClip.timelineStartMs + originalClip.durationMs
  const editedEndMs = editedClip.timelineStartMs + editedClip.durationMs
  const deltaMs = editedEndMs - originalEndMs
  return {
    ...project,
    updatedAt: new Date().toISOString(),
    timeline: {
      ...project.timeline,
      tracks: project.timeline.tracks.map((track) => {
        if (track.id !== trackId) return track
        return {
          ...track,
          clips: track.clips.map((clip) => {
            if (clip.id === clipId) return editedClip
            if (deltaMs !== 0 && clip.timelineStartMs >= originalEndMs) {
              return { ...clip, timelineStartMs: Math.max(0, clip.timelineStartMs + deltaMs) }
            }
            return clip
          }).sort(compareClips),
        }
      }),
    },
  }
}

export function linkedTimelineClipIds(
  project: ElectronMediaPipelineEditingProject,
  clipId: string,
): string[] {
  const selectedClip = project.timeline.tracks.flatMap((track) => track.clips).find((clip) => clip.id === clipId)
  if (!selectedClip) return []
  const linkedIds = new Set<string>()
  addLinkedClipMetadataIds(selectedClip, linkedIds)
  for (const track of project.timeline.tracks) {
    for (const clip of track.clips) {
      if (clip.id === clipId) continue
      const candidateIds = new Set<string>()
      addLinkedClipMetadataIds(clip, candidateIds)
      if (candidateIds.has(clipId)) linkedIds.add(clip.id)
    }
  }
  const existingClipIds = new Set(project.timeline.tracks.flatMap((track) => track.clips.map((clip) => clip.id)))
  return [...linkedIds].filter((id) => id !== clipId && existingClipIds.has(id))
}

export function applyLinkedClipMoveToProject(
  project: ElectronMediaPipelineEditingProject,
  clipId: string,
  deltaMs: number,
): ElectronMediaPipelineEditingProject {
  if (deltaMs === 0) return project
  const linkedClipIds = new Set(linkedTimelineClipIds(project, clipId))
  if (linkedClipIds.size === 0) return project
  return {
    ...project,
    updatedAt: new Date().toISOString(),
    timeline: {
      ...project.timeline,
      tracks: project.timeline.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip) => (
          linkedClipIds.has(clip.id)
            ? { ...clip, timelineStartMs: Math.max(0, clip.timelineStartMs + deltaMs) }
            : clip
        )).sort(compareClips),
      })),
    },
  }
}

export function applyLinkedClipTrimToProject(
  project: ElectronMediaPipelineEditingProject,
  clipId: string,
  originalClip: ElectronMediaPipelineClip,
  editedClip: ElectronMediaPipelineClip,
): ElectronMediaPipelineEditingProject {
  const linkedClipIds = new Set(linkedTimelineClipIds(project, clipId))
  if (linkedClipIds.size === 0) return project
  const timelineStartDeltaMs = editedClip.timelineStartMs - originalClip.timelineStartMs
  const durationDeltaMs = editedClip.durationMs - originalClip.durationMs
  const sourceStartDeltaMs = (editedClip.sourceStartMs ?? 0) - (originalClip.sourceStartMs ?? 0)
  if (timelineStartDeltaMs === 0 && durationDeltaMs === 0 && sourceStartDeltaMs === 0) return project
  return {
    ...project,
    updatedAt: new Date().toISOString(),
    timeline: {
      ...project.timeline,
      tracks: project.timeline.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip) => {
          if (!linkedClipIds.has(clip.id)) return clip
          const sourceStartMs = Math.max(0, (clip.sourceStartMs ?? 0) + sourceStartDeltaMs)
          const durationMs = Math.max(EDITING_TIMELINE_MIN_CLIP_DURATION_MS, clip.durationMs + durationDeltaMs)
          return {
            ...clip,
            timelineStartMs: Math.max(0, clip.timelineStartMs + timelineStartDeltaMs),
            durationMs,
            sourceStartMs,
            sourceEndMs: sourceStartMs + durationMs,
          }
        }).sort(compareClips),
      })),
    },
  }
}

function addLinkedClipMetadataIds(clip: ElectronMediaPipelineClip, ids: Set<string>) {
  const metadata = clip.metadata ?? {}
  for (const key of ['linkedClipId', 'linkedAudioClipId', 'linkedVideoClipId']) {
    const value = metadata[key]
    if (typeof value === 'string' && value) ids.add(value)
  }
}

export function snapTimelineMs(
  valueMs: number,
  project: ElectronMediaPipelineEditingProject,
  ignoreClipId?: string,
  extraSnapPoints: number[] = [],
  snapEnabled = true,
) {
  if (!snapEnabled) return Math.max(0, Math.round(valueMs))
  return resolveTimelineSnap(
    valueMs,
    collectTimelineSnapPoints(project, { ignoreClipId, extraSnapPoints }),
    EDITING_TIMELINE_SNAP_THRESHOLD_MS,
  ).valueMs
}

export function clipContainsPlayhead(clip: ElectronMediaPipelineClip, playheadMs: number) {
  return playheadMs > clip.timelineStartMs + EDITING_TIMELINE_MIN_CLIP_DURATION_MS
    && playheadMs < clip.timelineStartMs + clip.durationMs - EDITING_TIMELINE_MIN_CLIP_DURATION_MS
}

export function compareClips(left: ElectronMediaPipelineClip, right: ElectronMediaPipelineClip) {
  return left.timelineStartMs - right.timelineStartMs || left.id.localeCompare(right.id)
}
