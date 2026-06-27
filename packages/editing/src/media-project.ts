import type {
  MovScriptEditPlanArtifact,
  MovScriptEditPlanTrack,
  MovScriptEditPlanTrackItem,
  MovScriptEditPlanTrackType,
} from './movscript-edit-plan.js'

export type MediaTrackType = 'video' | 'image' | 'audio' | 'text' | 'subtitle' | 'effect'
export type MediaAssetType = 'video' | 'image' | 'audio' | 'text' | 'subtitle'
export type MediaAssetSourceKind = 'raw_resource' | 'backend_resource' | 'local_file' | 'generated_resource' | 'bytes'
export type MediaEditingProjectSourceKind = 'movscript_edit_plan' | 'manual' | 'imported_media'
export type MediaTimelineFit = 'crop' | 'contain' | 'cover' | 'none'
export type MediaTimelineCommandType =
  | 'add_track'
  | 'remove_track'
  | 'add_clip'
  | 'update_clip'
  | 'move_clip'
  | 'split_clip'
  | 'delete_clip'

export interface MediaEditingProject {
  version: 1
  id: string
  projectId: string
  title: string
  source: MediaEditingProjectSource
  timeline: MediaTimelineRecipe
  assets: MediaAssetRegistry
  workspace?: MediaWorkspaceBinding
  provenance?: MediaEditingProjectProvenance
  createdAt: string
  updatedAt: string
  revision: number
}

export interface MediaEditingProjectSource {
  kind: MediaEditingProjectSourceKind
  targetKind?: string
  targetRef?: string
  scopeKind?: string
  scopeRef?: string
  sceneMomentId?: string
  productionId?: string
  editPlanId?: string
  contentUnitIds?: string[]
}

export interface MediaWorkspaceBinding {
  workspaceId: string
  rootPath?: string
}

export interface MediaEditingProjectProvenance {
  sourceHash?: string
  selectedCandidateIds?: string[]
  inputResourceIds?: number[]
  targetKind?: string
  targetRef?: string
  scopeKind?: string
  scopeRef?: string
  scopePath?: string
  legacyTargetKind?: string
  legacyTargetRef?: string
  productionPath?: string
  sceneMomentPath?: string
}

export interface MediaTimelineRecipe {
  version: 1
  id: string
  fps: number
  width: number
  height: number
  background: string
  durationMs?: number
  tracks: MediaTrack[]
  metadata?: Record<string, unknown>
}

export interface MediaTrack {
  id: string
  type: MediaTrackType
  zIndex: number
  name?: string
  muted?: boolean
  locked?: boolean
  clips: MediaClip[]
}

export interface MediaClip {
  id: string
  assetType: MediaAssetType
  asset?: MediaAssetDescriptor
  timelineStartMs: number
  durationMs: number
  sourceStartMs?: number
  sourceEndMs?: number
  volume?: number
  muted?: boolean
  speed?: number
  fadeInMs?: number
  fadeOutMs?: number
  fit?: MediaTimelineFit
  position?: string
  xPercent?: number
  yPercent?: number
  scale?: number
  opacity?: number
  crop?: CropSpec
  transition?: TransitionSpec
  text?: TextSpec
  subtitle?: SubtitleSpec
  metadata?: Record<string, unknown>
}

export interface MediaAssetRegistry {
  assets: MediaAssetDescriptor[]
}

export interface MediaAssetDescriptor {
  id: string
  sourceKind: MediaAssetSourceKind
  assetType: MediaAssetType
  resourceId?: number
  localPath?: string
  mimeType?: string
  checksum?: string
  label?: string
  metadata?: Record<string, unknown>
}

export interface CropSpec {
  topPercent?: number
  rightPercent?: number
  bottomPercent?: number
  leftPercent?: number
}

export interface TransitionSpec {
  type: 'fade' | 'none' | string
  durationMs?: number
}

export interface TextSpec {
  content: string
  fontSize?: number
  fontFamily?: string
  color?: string
  backgroundColor?: string
  backgroundOpacity?: number
  align?: 'left' | 'center' | 'right'
  position?: string
}

export interface SubtitleSpec {
  resourceId?: number
  format?: 'srt' | 'vtt' | 'ass' | 'ssa'
  burnIn?: boolean
  renderer?: 'drawtext' | 'ass' | 'libass'
  style?: TextSpec
}

export type MediaTimelineCommand =
  | { type: 'add_track'; track: MediaTrack }
  | { type: 'remove_track'; trackId: string }
  | { type: 'add_clip'; trackId: string; clip: MediaClip }
  | { type: 'update_clip'; clipId: string; patch: MediaClipPatch }
  | { type: 'move_clip'; clipId: string; targetTrackId?: string; timelineStartMs: number }
  | { type: 'split_clip'; clipId: string; splitTimeMs: number; retainSide?: 'both' | 'left' | 'right' }
  | { type: 'delete_clip'; clipId: string }

export type MediaClipPatch = Partial<Omit<MediaClip, 'id' | 'assetType' | 'asset'>>

export interface MediaEditingProjectOptions {
  id?: string
  projectId?: string
  title?: string
  now?: string
  fps?: number
  width?: number
  height?: number
  background?: string
  defaultDurationMs?: number
  includeMissingPlaceholders?: boolean
}

export interface MediaProductionTimelineClip {
  id?: string
  title: string
  sceneMomentId?: string | number
  sceneMomentPath?: string
  contentUnitId: string | number
  candidateId?: string | number
  resourceId: number
  durationSec?: number
}

export interface MediaProductionTimelineProjectOptions extends MediaEditingProjectOptions {
  productionId: string | number
  productionPath?: string
  targetKind?: string
  targetRef?: string
  scopeKind?: string
  scopeRef?: string
  clips: MediaProductionTimelineClip[]
}

export interface MediaTimelineAssemblyProjectOptions extends MediaEditingProjectOptions {
  targetKind?: string
  targetRef?: string
  scopeKind: string
  scopeRef: string | number
  scopePath?: string
  productionId?: string | number
  productionPath?: string
  legacyTargetKind?: string
  legacyTargetRef?: string | number
  clips: MediaProductionTimelineClip[]
}

export interface MediaEditingProjectServiceOptions {
  now?: () => string
  idFactory?: (prefix: string) => string
}

export interface MediaTimelineDiagnostic {
  code: string
  severity: 'error' | 'warning'
  trackId?: string
  track_id?: string
  clipId?: string
  clip_id?: string
  previousClipId?: string
  previous_clip_id?: string
  assetId?: string
  asset_id?: string
  message: string
  details?: Record<string, unknown>
}

export class MediaEditingProjectService {
  private project: MediaEditingProject
  private generatedId = 0
  private readonly now: () => string
  private readonly idFactory?: (prefix: string) => string

  constructor(project: MediaEditingProject, options: MediaEditingProjectServiceOptions = {}) {
    this.project = clone(project)
    this.now = options.now ?? (() => new Date().toISOString())
    this.idFactory = options.idFactory
  }

  getProject(): MediaEditingProject {
    return clone(this.project)
  }

  applyCommand(command: MediaTimelineCommand): MediaEditingProject {
    switch (command.type) {
      case 'add_track':
        this.addTrack(command.track)
        break
      case 'remove_track':
        this.removeTrack(command.trackId)
        break
      case 'add_clip':
        this.addClip(command.trackId, command.clip)
        break
      case 'update_clip':
        this.updateClip(command.clipId, command.patch)
        break
      case 'move_clip':
        this.moveClip(command.clipId, command.targetTrackId, command.timelineStartMs)
        break
      case 'split_clip':
        this.splitClip(command.clipId, command.splitTimeMs, command.retainSide ?? 'both')
        break
      case 'delete_clip':
        this.deleteClip(command.clipId)
        break
      default:
        assertNever(command)
    }
    this.refreshProject()
    return this.getProject()
  }

  private addTrack(track: MediaTrack): void {
    if (this.project.timeline.tracks.some((candidate) => candidate.id === track.id)) {
      throw new Error(`Media track already exists: ${track.id}`)
    }
    this.project.timeline.tracks.push(clone(track))
    this.sortTracks()
  }

  private removeTrack(trackId: string): void {
    const track = this.trackById(trackId)
    if (track.clips.length > 0) throw new Error(`Cannot remove non-empty media track: ${trackId}`)
    this.project.timeline.tracks = this.project.timeline.tracks.filter((candidate) => candidate.id !== trackId)
  }

  private addClip(trackId: string, clip: MediaClip): void {
    const track = this.trackById(trackId)
    assertClipFitsTrack(track, clip)
    if (this.findClip(clip.id)) throw new Error(`Media clip already exists: ${clip.id}`)
    track.clips.push(clone(clip))
    sortClips(track)
  }

  private updateClip(clipId: string, patch: MediaClipPatch): void {
    const found = this.requiredClip(clipId)
    found.track.clips[found.index] = {
      ...found.clip,
      ...clone(patch),
    }
    sortClips(found.track)
  }

  private moveClip(clipId: string, targetTrackId: string | undefined, timelineStartMs: number): void {
    const found = this.requiredClip(clipId)
    const moved = {
      ...found.clip,
      timelineStartMs,
    }
    if (!targetTrackId || targetTrackId === found.track.id) {
      found.track.clips[found.index] = moved
      sortClips(found.track)
      return
    }

    const targetTrack = this.trackById(targetTrackId)
    assertClipFitsTrack(targetTrack, moved)
    found.track.clips.splice(found.index, 1)
    targetTrack.clips.push(moved)
    sortClips(found.track)
    sortClips(targetTrack)
  }

  private splitClip(clipId: string, splitTimeMs: number, retainSide: 'both' | 'left' | 'right'): void {
    const found = this.requiredClip(clipId)
    const clipEndMs = found.clip.timelineStartMs + found.clip.durationMs
    if (splitTimeMs <= found.clip.timelineStartMs || splitTimeMs >= clipEndMs) {
      throw new Error(`Split time ${splitTimeMs} is outside media clip ${clipId}`)
    }

    const leftDurationMs = splitTimeMs - found.clip.timelineStartMs
    const rightDurationMs = found.clip.durationMs - leftDurationMs
    const sourceStartMs = found.clip.sourceStartMs
    const left: MediaClip = {
      ...found.clip,
      durationMs: leftDurationMs,
      sourceEndMs: sourceStartMs !== undefined ? sourceStartMs + leftDurationMs : found.clip.sourceEndMs,
    }
    const right: MediaClip = {
      ...found.clip,
      id: this.makeId(`${found.clip.id}_right`),
      timelineStartMs: splitTimeMs,
      durationMs: rightDurationMs,
      sourceStartMs: sourceStartMs !== undefined ? sourceStartMs + leftDurationMs : found.clip.sourceStartMs,
    }

    const replacement = retainSide === 'left' ? [left] : retainSide === 'right' ? [right] : [left, right]
    found.track.clips.splice(found.index, 1, ...replacement)
    sortClips(found.track)
  }

  private deleteClip(clipId: string): void {
    const found = this.requiredClip(clipId)
    found.track.clips.splice(found.index, 1)
  }

  private refreshProject(): void {
    this.project.updatedAt = this.now()
    this.project.revision += 1
    this.project.timeline.durationMs = durationFromTracks(this.project.timeline.tracks)
  }

  private sortTracks(): void {
    this.project.timeline.tracks.sort((left, right) => {
      if (left.zIndex !== right.zIndex) return left.zIndex - right.zIndex
      return left.id.localeCompare(right.id)
    })
  }

  private trackById(trackId: string): MediaTrack {
    const track = this.project.timeline.tracks.find((candidate) => candidate.id === trackId)
    if (!track) throw new Error(`Media track not found: ${trackId}`)
    return track
  }

  private requiredClip(clipId: string): { track: MediaTrack; clip: MediaClip; index: number } {
    const found = this.findClip(clipId)
    if (!found) throw new Error(`Media clip not found: ${clipId}`)
    return found
  }

  private findClip(clipId: string): { track: MediaTrack; clip: MediaClip; index: number } | undefined {
    for (const track of this.project.timeline.tracks) {
      const index = track.clips.findIndex((candidate) => candidate.id === clipId)
      const clip = index >= 0 ? track.clips[index] : undefined
      if (clip) return { track, clip, index }
    }
    return undefined
  }

  private makeId(prefix: string): string {
    if (this.idFactory) return this.idFactory(prefix)
    this.generatedId += 1
    return `${prefix}_${this.generatedId}`
  }
}

export function createMediaEditingProjectFromMovScriptEditPlan(
  editPlan: MovScriptEditPlanArtifact,
  options: MediaEditingProjectOptions = {},
): MediaEditingProject {
  const now = options.now ?? new Date().toISOString()
  const projectId = options.projectId ?? `movscript_${String(editPlan.productionId)}`
  const assets = buildMediaAssetRegistryFromEditPlan(editPlan)
  const timeline = buildMediaTimelineRecipeFromEditPlan(editPlan, assets, options)
  return {
    version: 1,
    id: options.id ?? `editing_project_${String(editPlan.sceneMomentId)}`,
    projectId,
    title: options.title ?? `Scene moment ${String(editPlan.sceneMomentId)}`,
    source: {
      kind: 'movscript_edit_plan',
      targetKind: editPlan.target_kind ?? 'scene_moment',
      targetRef: editPlan.target_ref,
      scopeKind: editPlan.scope_kind,
      scopeRef: editPlan.scope_ref === undefined ? undefined : String(editPlan.scope_ref),
      sceneMomentId: String(editPlan.sceneMomentId),
      productionId: String(editPlan.productionId),
      contentUnitIds: editPlan.tracks.flatMap((track) => track.items.map((item) => String(item.content_unit_id))),
    },
    timeline,
    assets,
    provenance: {
      targetKind: editPlan.target_kind ?? 'scene_moment',
      targetRef: editPlan.target_ref,
      scopeKind: editPlan.scope_kind,
      scopeRef: editPlan.scope_ref === undefined ? undefined : String(editPlan.scope_ref),
      legacyTargetKind: editPlan.legacy_target_kind,
      legacyTargetRef: editPlan.legacy_target_ref === undefined ? undefined : String(editPlan.legacy_target_ref),
      productionPath: editPlan.productionPath,
      sceneMomentPath: editPlan.sceneMomentPath,
      selectedCandidateIds: editPlan.tracks
        .flatMap((track) => track.items)
        .filter((item) => item.selected && item.candidate_id !== undefined)
        .map((item) => String(item.candidate_id)),
      inputResourceIds: assets.assets.flatMap((asset) => asset.resourceId === undefined ? [] : [asset.resourceId]),
    },
    createdAt: now,
    updatedAt: now,
    revision: 1,
  }
}

export function createMediaEditingProjectFromProductionTimelineClips(
  options: MediaProductionTimelineProjectOptions,
): MediaEditingProject {
  const productionId = String(options.productionId)
  return createMediaEditingProjectFromTimelineAssemblyClips({
    ...options,
    productionId,
    productionPath: options.productionPath,
    targetKind: options.targetKind ?? 'timeline_assembly',
    targetRef: options.targetRef,
    scopeKind: options.scopeKind ?? 'production',
    scopeRef: options.scopeRef ?? productionId,
    legacyTargetKind: options.targetKind === undefined || options.targetKind === 'timeline_assembly' ? 'production' : undefined,
    legacyTargetRef: options.targetKind === undefined || options.targetKind === 'timeline_assembly' ? productionId : undefined,
  })
}

export function createMediaEditingProjectFromTimelineAssemblyClips(
  options: MediaTimelineAssemblyProjectOptions,
): MediaEditingProject {
  const now = options.now ?? new Date().toISOString()
  const scopeKind = options.scopeKind
  const scopeRef = String(options.scopeRef)
  const target = timelineAssemblyTarget(options)
  const defaultDurationMs = options.defaultDurationMs ?? 4000
  let cursorMs = 0
  const assets: MediaAssetDescriptor[] = []
  const clips = options.clips.map((clip): MediaClip => {
    const durationMs = Math.max(1, Math.round((clip.durationSec ?? defaultDurationMs / 1000) * 1000))
    const asset: MediaAssetDescriptor = {
      id: `movscript_resource_${clip.resourceId}`,
      sourceKind: 'backend_resource',
      assetType: 'video',
      resourceId: clip.resourceId,
      label: clip.title,
      metadata: {
        movscript: {
          sceneMomentId: clip.sceneMomentId,
          sceneMomentPath: clip.sceneMomentPath,
          contentUnitId: clip.contentUnitId,
          candidateId: clip.candidateId,
          resourceId: clip.resourceId,
          outputKind: 'video',
          trackType: 'video',
          targetKind: target.targetKind,
          targetRef: target.targetRef,
          scopeKind: target.scopeKind,
          scopeRef: target.scopeRef,
          legacyTargetKind: target.legacyTargetKind,
          legacyTargetRef: target.legacyTargetRef,
          selected: true,
          stale: false,
        },
      },
    }
    assets.push(asset)
    const mediaClip: MediaClip = {
      id: clip.id || `assembly_clip_${safeId(scopeKind)}_${safeId(scopeRef)}_${assets.length}`,
      assetType: 'video',
      asset,
      timelineStartMs: cursorMs,
      durationMs,
      sourceStartMs: 0,
      sourceEndMs: durationMs,
      fit: 'cover',
      opacity: 1,
      muted: false,
      metadata: asset.metadata,
    }
    cursorMs += durationMs
    return mediaClip
  })

  return {
    version: 1,
    id: options.id ?? `editing_project_${safeId(scopeKind)}_${safeId(scopeRef)}`,
    projectId: options.projectId ?? `movscript_${safeId(scopeKind)}_${safeId(scopeRef)}`,
    title: options.title ?? `Timeline assembly ${scopeKind}:${scopeRef}`,
    source: {
      kind: 'movscript_edit_plan',
      targetKind: target.targetKind,
      targetRef: target.targetRef,
      scopeKind: target.scopeKind,
      scopeRef: target.scopeRef,
      ...(options.productionId !== undefined ? { productionId: String(options.productionId) } : {}),
      contentUnitIds: options.clips.map((clip) => String(clip.contentUnitId)),
    },
    timeline: {
      version: 1,
      id: `timeline_${safeId(scopeKind)}_${safeId(scopeRef)}`,
      fps: options.fps ?? 30,
      width: options.width ?? 1920,
      height: options.height ?? 1080,
      background: options.background ?? '#000000',
      durationMs: cursorMs,
      tracks: [{
        id: 'track_timeline_assembly_video_0',
        name: 'timeline assembly video',
        type: 'video',
        zIndex: 0,
        muted: false,
        locked: false,
        clips,
      }],
      metadata: {
        targetKind: target.targetKind,
        targetRef: target.targetRef,
        scopeKind: target.scopeKind,
        scopeRef: target.scopeRef,
        legacyTargetKind: target.legacyTargetKind,
        legacyTargetRef: target.legacyTargetRef,
        ...(options.scopePath ? { scopePath: options.scopePath } : {}),
        ...(options.productionPath ? { productionPath: options.productionPath } : {}),
      },
    },
    assets: { assets },
    provenance: {
      targetKind: target.targetKind,
      targetRef: target.targetRef,
      scopeKind: target.scopeKind,
      scopeRef: target.scopeRef,
      legacyTargetKind: target.legacyTargetKind,
      legacyTargetRef: target.legacyTargetRef,
      ...(options.scopePath ? { scopePath: options.scopePath } : {}),
      ...(options.productionPath ? { productionPath: options.productionPath } : {}),
      selectedCandidateIds: options.clips.flatMap((clip) => clip.candidateId === undefined ? [] : [String(clip.candidateId)]),
      inputResourceIds: options.clips.map((clip) => clip.resourceId),
    },
    createdAt: now,
    updatedAt: now,
    revision: 1,
  }
}

function timelineAssemblyTarget(options: MediaTimelineAssemblyProjectOptions): {
  targetKind: string
  targetRef: string
  scopeKind?: string
  scopeRef?: string
  legacyTargetKind?: string
  legacyTargetRef?: string
} {
  const targetKind = options.targetKind ?? 'timeline_assembly'
  const scopeKind = options.scopeKind
  const scopeRef = String(options.scopeRef)
  const targetRef = options.targetRef
    ?? (targetKind === 'timeline_assembly' ? `timeline_assembly:${scopeKind}:${scopeRef}` : scopeRef)
  return {
    targetKind,
    targetRef,
    ...(scopeKind ? { scopeKind } : {}),
    ...(scopeRef ? { scopeRef } : {}),
    ...(options.legacyTargetKind && options.legacyTargetRef !== undefined ? {
      legacyTargetKind: options.legacyTargetKind,
      legacyTargetRef: String(options.legacyTargetRef),
    } : {}),
  }
}

function buildMediaAssetRegistryFromEditPlan(editPlan: MovScriptEditPlanArtifact): MediaAssetRegistry {
  const assetsById = new Map<string, MediaAssetDescriptor>()
  for (const item of editPlan.tracks.flatMap((track) => track.items)) {
    if (item.resource_id === undefined) continue
    const id = mediaAssetIdForItem(item)
    if (assetsById.has(id)) continue
    assetsById.set(id, {
      id,
      sourceKind: 'backend_resource',
      assetType: assetTypeForEditPlanItem(item),
      resourceId: item.resource_id,
      label: String(item.content_unit_id),
      metadata: movscriptItemMetadata(item),
    })
  }
  return { assets: [...assetsById.values()].sort((left, right) => left.id.localeCompare(right.id)) }
}

function buildMediaTimelineRecipeFromEditPlan(
  editPlan: MovScriptEditPlanArtifact,
  assets: MediaAssetRegistry = buildMediaAssetRegistryFromEditPlan(editPlan),
  options: MediaEditingProjectOptions = {},
): MediaTimelineRecipe {
  const tracks = editPlan.tracks.flatMap((track, index) =>
    mediaTrackFromMovScriptTrack({
      track,
      assets,
      index,
      defaultDurationMs: options.defaultDurationMs ?? 4000,
      includeMissingPlaceholders: options.includeMissingPlaceholders ?? true,
    }),
  )
  return {
    version: 1,
    id: `timeline_scene_moment_${String(editPlan.sceneMomentId)}`,
    fps: options.fps ?? 30,
    width: options.width ?? 1080,
    height: options.height ?? 1920,
    background: options.background ?? '#000000',
    durationMs: durationFromTracks(tracks),
    tracks,
    metadata: {
      targetRef: editPlan.target_ref,
      status: editPlan.status,
    },
  }
}

export function createMediaEditingProjectService(
  project: MediaEditingProject,
  options?: MediaEditingProjectServiceOptions,
): MediaEditingProjectService {
  return new MediaEditingProjectService(project, options)
}

export function validateMediaEditingProjectTimeline(project: MediaEditingProject): MediaTimelineDiagnostic[] {
  const diagnostics: MediaTimelineDiagnostic[] = []
  const assetIds = new Set(project.assets.assets.map((asset) => asset.id))
  const seenTrackIds = new Set<string>()
  const seenClipIds = new Set<string>()

  for (const track of project.timeline.tracks) {
    if (seenTrackIds.has(track.id)) {
      diagnostics.push(diagnostic('duplicate_track_id', 'error', `Duplicate media track id: ${track.id}`, { trackId: track.id }))
    }
    seenTrackIds.add(track.id)

    const sortedClips = [...track.clips].sort((left, right) => left.timelineStartMs - right.timelineStartMs || left.id.localeCompare(right.id))
    for (const clip of track.clips) {
      if (seenClipIds.has(clip.id)) {
        diagnostics.push(diagnostic('duplicate_clip_id', 'error', `Duplicate media clip id: ${clip.id}`, { trackId: track.id, clipId: clip.id }))
      }
      seenClipIds.add(clip.id)
      if (clip.durationMs <= 0) {
        diagnostics.push(diagnostic('invalid_duration', 'error', `Media clip ${clip.id} has invalid duration.`, { trackId: track.id, clipId: clip.id }))
      }
      if (clip.timelineStartMs < 0) {
        diagnostics.push(diagnostic('invalid_timeline_start', 'error', `Media clip ${clip.id} starts before the timeline.`, { trackId: track.id, clipId: clip.id }))
      }
      if (clip.sourceStartMs !== undefined && clip.sourceEndMs !== undefined && clip.sourceEndMs < clip.sourceStartMs) {
        diagnostics.push(diagnostic('invalid_source_range', 'error', `Media clip ${clip.id} has an invalid source range.`, {
          trackId: track.id,
          clipId: clip.id,
          details: { sourceStartMs: clip.sourceStartMs, sourceEndMs: clip.sourceEndMs },
        }))
      }
      if (!clipFitsTrackType(track.type, clip.assetType)) {
        diagnostics.push(diagnostic('track_clip_type_mismatch', 'error', `Media clip ${clip.id} cannot be placed on ${track.type} track ${track.id}.`, {
          trackId: track.id,
          clipId: clip.id,
          details: { trackType: track.type, clipAssetType: clip.assetType },
        }))
      }
      if (clip.asset && !assetIds.has(clip.asset.id)) {
        diagnostics.push(diagnostic('asset_not_registered', 'error', `Media clip ${clip.id} references unregistered asset ${clip.asset.id}.`, {
          trackId: track.id,
          clipId: clip.id,
          assetId: clip.asset.id,
        }))
      }
      if (clip.asset && clip.asset.assetType !== clip.assetType) {
        diagnostics.push(diagnostic('asset_type_mismatch', 'error', `Media clip ${clip.id} asset type does not match its clip type.`, {
          trackId: track.id,
          clipId: clip.id,
          assetId: clip.asset.id,
          details: { clipAssetType: clip.assetType, assetType: clip.asset.assetType },
        }))
      }
      if (clip.assetType === 'subtitle' && !clip.subtitle?.resourceId && !clip.asset?.resourceId && !clip.text?.content) {
        diagnostics.push(diagnostic('subtitle_reference_missing', 'error', `Subtitle clip ${clip.id} has no subtitle file, text, or resource reference.`, {
          trackId: track.id,
          clipId: clip.id,
        }))
      }
      if (clip.volume !== undefined && clip.volume > 0 && clip.volume <= 2) {
        diagnostics.push(diagnostic('legacy_ratio_volume', 'warning', `Media clip ${clip.id} uses legacy ratio volume; it will be interpreted as percent volume.`, {
          trackId: track.id,
          clipId: clip.id,
          details: { volume: clip.volume, normalizedVolume: normalizeMediaClipVolumePercent(clip.volume) },
        }))
      }
    }

    if (!trackAllowsOverlap(track.type)) {
      for (let index = 1; index < sortedClips.length; index += 1) {
        const previous = sortedClips[index - 1]!
        const current = sortedClips[index]!
        const previousEndMs = previous.timelineStartMs + previous.durationMs
        if (previousEndMs > current.timelineStartMs) {
          diagnostics.push(diagnostic('clip_overlap', 'error', `Media clip ${current.id} overlaps ${previous.id}.`, {
            trackId: track.id,
            clipId: current.id,
            previousClipId: previous.id,
            details: { overlapMs: previousEndMs - current.timelineStartMs },
          }))
        }
      }
    }
  }

  return diagnostics
}

export function mediaTimelineIsValid(project: MediaEditingProject): boolean {
  return validateMediaEditingProjectTimeline(project).every((diagnostic) => diagnostic.severity !== 'error')
}

export function normalizeMediaClipVolumePercent(volume: number | undefined): number | undefined {
  if (volume === undefined || !Number.isFinite(volume)) return undefined
  const normalized = volume > 0 && volume <= 2 ? volume * 100 : volume
  return Math.max(0, Math.min(200, normalized))
}

function mediaTrackFromMovScriptTrack(input: {
  track: MovScriptEditPlanTrack
  assets: MediaAssetRegistry
  index: number
  defaultDurationMs: number
  includeMissingPlaceholders: boolean
}): MediaTrack[] {
  const trackType = mediaTrackTypeForMovScriptTrack(input.track.type)
  if (!trackType) return []

  let cursorMs = 0
  const clips = input.track.items
    .slice()
    .sort((left, right) => left.order - right.order)
    .flatMap((item) => {
      if (!input.includeMissingPlaceholders && (item.selected !== true || item.resource_id === undefined)) return []
      const clip = mediaClipFromMovScriptItem({
        item,
        trackType,
        assets: input.assets,
        fallbackStartMs: cursorMs,
        defaultDurationMs: input.defaultDurationMs,
      })
      cursorMs = clip.timelineStartMs + clip.durationMs
      return [clip]
    })

  return [{
    id: `track_${input.track.type}_${input.index}`,
    type: trackType,
    zIndex: input.index,
    name: input.track.type,
    muted: false,
    locked: false,
    clips,
  }]
}

function mediaClipFromMovScriptItem(input: {
  item: MovScriptEditPlanTrackItem
  trackType: MediaTrackType
  assets: MediaAssetRegistry
  fallbackStartMs: number
  defaultDurationMs: number
}): MediaClip {
  const timing = input.item.timing_intent ?? {}
  const sourceStartMs = secField(timing.trim_start_sec) ?? secField(timing.in_sec) ?? secField(timing.start_sec) ?? 0
  const durationMs = secField(timing.duration_sec) ?? durationFromInOutMs(timing) ?? input.defaultDurationMs
  const timelineStartMs = secField(timing.timeline_start_sec) ?? secField(timing.start_time_sec) ?? input.fallbackStartMs
  const asset = input.item.resource_id === undefined
    ? undefined
    : input.assets.assets.find((candidate) => candidate.id === mediaAssetIdForItem(input.item))
  const base = {
    id: input.item.id,
    assetType: assetTypeForEditPlanItem(input.item),
    asset,
    timelineStartMs,
    durationMs,
    sourceStartMs,
    sourceEndMs: sourceStartMs + durationMs,
    volume: normalizeMediaClipVolumePercent(numberField(timing.volume)) ?? 100,
    muted: false,
    fit: 'cover',
    opacity: numberField(timing.opacity) ?? 1,
    metadata: movscriptItemMetadata(input.item),
  } satisfies MediaClip

  if (base.assetType === 'text' || input.trackType === 'subtitle') {
    return {
      ...base,
      assetType: 'text',
      text: {
        content: stringField(timing.text) ?? String(input.item.content_unit_id),
        fontSize: numberField(timing.font_size) ?? 42,
        fontFamily: stringField(timing.font_family) ?? 'Inter',
        color: stringField(timing.color) ?? '#ffffff',
        backgroundColor: stringField(timing.background_color),
        align: 'center',
        position: stringField(timing.position) ?? 'bottom_center',
      },
    }
  }

  return base
}

function mediaTrackTypeForMovScriptTrack(type: MovScriptEditPlanTrackType): MediaTrackType | undefined {
  switch (type) {
    case 'video':
      return 'video'
    case 'image':
      return 'image'
    case 'voice':
    case 'audio':
      return 'audio'
    case 'subtitle':
      return 'subtitle'
    case 'metadata':
      return undefined
  }
}

function assetTypeForEditPlanItem(item: MovScriptEditPlanTrackItem): MediaAssetType {
  switch (item.output_kind) {
    case 'video':
      return 'video'
    case 'image':
      return 'image'
    case 'audio':
      return 'audio'
    case 'text':
      return 'text'
    case 'metadata':
      return 'text'
  }
}

function assertClipFitsTrack(track: MediaTrack, clip: MediaClip): void {
  if (clipFitsTrackType(track.type, clip.assetType)) return
  throw new Error(`Media clip type ${clip.assetType} cannot be placed on ${track.type} track ${track.id}`)
}

export function clipFitsTrackType(trackType: MediaTrackType, assetType: MediaAssetType): boolean {
  if (trackType === 'video') return assetType === 'video' || assetType === 'image'
  if (trackType === 'image') return assetType === 'image'
  if (trackType === 'audio') return assetType === 'audio'
  if (trackType === 'text') return assetType === 'text' || assetType === 'subtitle'
  if (trackType === 'subtitle') return assetType === 'subtitle' || assetType === 'text'
  if (trackType === 'effect') return true
  return false
}

export function trackAllowsOverlap(trackType: MediaTrackType): boolean {
  return trackType === 'effect' || trackType === 'text' || trackType === 'subtitle'
}

function diagnostic(
  code: string,
  severity: MediaTimelineDiagnostic['severity'],
  message: string,
  input: {
    trackId?: string
    clipId?: string
    previousClipId?: string
    assetId?: string
    details?: Record<string, unknown>
  } = {},
): MediaTimelineDiagnostic {
  return {
    code,
    severity,
    message,
    ...(input.trackId ? { trackId: input.trackId, track_id: input.trackId } : {}),
    ...(input.clipId ? { clipId: input.clipId, clip_id: input.clipId } : {}),
    ...(input.previousClipId ? { previousClipId: input.previousClipId, previous_clip_id: input.previousClipId } : {}),
    ...(input.assetId ? { assetId: input.assetId, asset_id: input.assetId } : {}),
    ...(input.details ? { details: input.details } : {}),
  }
}

function mediaAssetIdForItem(item: MovScriptEditPlanTrackItem): string {
  return `resource_${item.resource_id}`
}

function movscriptItemMetadata(item: MovScriptEditPlanTrackItem): Record<string, unknown> {
  return {
    contentUnitId: item.content_unit_id,
    contentUnitRef: item.content_unit_ref,
    candidateId: item.candidate_id,
    resourceId: item.resource_id,
    outputKind: item.output_kind,
    targetKind: item.target_kind,
    targetRef: item.target_ref,
    expressionUnitRef: item.expression_unit_ref,
    expressionModality: item.expression_modality,
    expressionRole: item.expression_role,
    selected: item.selected,
    stale: item.stale,
  }
}

function durationFromTracks(tracks: readonly MediaTrack[]): number {
  return Math.max(
    0,
    ...tracks.flatMap((track) => track.clips.map((clip) => clip.timelineStartMs + clip.durationMs)),
  )
}

function durationFromInOutMs(timing: Record<string, unknown>): number | undefined {
  const startMs = secField(timing.in_sec) ?? secField(timing.start_sec)
  const endMs = secField(timing.out_sec) ?? secField(timing.end_sec)
  if (startMs === undefined || endMs === undefined || endMs <= startMs) return undefined
  return endMs - startMs
}

function secField(value: unknown): number | undefined {
  const seconds = numberField(value)
  return seconds === undefined ? undefined : Math.round(seconds * 1000)
}

function numberField(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return undefined
}

function stringField(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'item'
}

function sortClips(track: MediaTrack): void {
  track.clips.sort((left, right) => {
    if (left.timelineStartMs !== right.timelineStartMs) return left.timelineStartMs - right.timelineStartMs
    return left.id.localeCompare(right.id)
  })
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function assertNever(value: never): never {
  throw new Error(`Unexpected media editing value: ${JSON.stringify(value)}`)
}
