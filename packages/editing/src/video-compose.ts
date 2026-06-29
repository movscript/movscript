import {
  normalizeMediaClipVolumePercent,
  type CropSpec,
  type MediaAssetDescriptor,
  type MediaAssetRegistry,
  type MediaAssetType,
  type MediaClip,
  type MediaEditingProject,
  type MediaEditingProjectOptions,
  type MediaTimelineRecipe,
  type MediaTrack,
  type MediaTrackType,
  type TransitionSpec,
} from './media-project.js'

export type MovScriptVideoComposeRenderRuntime =
  | 'movscript_media_pipeline'
  | 'ffmpeg'
  | 'remotion'
  | 'hyperframes'
  | 'external_nle'
  | string

export interface MovScriptEditDecisionsArtifact {
  schema?: string
  version?: string | number
  cuts?: MovScriptEditDecisionCut[]
  overlays?: MovScriptEditDecisionOverlay[]
  audio?: MovScriptEditDecisionAudio
  subtitles?: MovScriptEditDecisionSubtitles
  renderer_family?: string
  rendererFamily?: string
  render_runtime?: MovScriptVideoComposeRenderRuntime
  renderRuntime?: MovScriptVideoComposeRenderRuntime
  composition_mode?: string
  compositionMode?: string
  metadata?: Record<string, unknown>
  [key: string]: unknown
}

export interface MovScriptEditDecisionCut {
  id?: string
  source?: unknown
  asset_id?: unknown
  assetId?: unknown
  resource_id?: unknown
  resourceId?: unknown
  in_seconds?: unknown
  in_sec?: unknown
  out_seconds?: unknown
  out_sec?: unknown
  source_in_seconds?: unknown
  source_in_sec?: unknown
  source_start_seconds?: unknown
  source_start_sec?: unknown
  source_out_seconds?: unknown
  source_out_sec?: unknown
  source_end_seconds?: unknown
  source_end_sec?: unknown
  timeline_start_seconds?: unknown
  timeline_start_sec?: unknown
  start_seconds?: unknown
  start_sec?: unknown
  duration_seconds?: unknown
  duration_sec?: unknown
  speed?: unknown
  layer?: unknown
  type?: unknown
  transform?: Record<string, unknown>
  transition?: unknown
  transition_in?: unknown
  transitionIn?: unknown
  transition_out?: unknown
  transitionOut?: unknown
  transition_duration?: unknown
  transitionDuration?: unknown
  reason?: unknown
  metadata?: Record<string, unknown>
  [key: string]: unknown
}

export interface MovScriptEditDecisionOverlay {
  id?: string
  source?: unknown
  asset_id?: unknown
  assetId?: unknown
  resource_id?: unknown
  resourceId?: unknown
  start_seconds?: unknown
  start_sec?: unknown
  end_seconds?: unknown
  end_sec?: unknown
  duration_seconds?: unknown
  duration_sec?: unknown
  source_start_seconds?: unknown
  source_start_sec?: unknown
  source_end_seconds?: unknown
  source_end_sec?: unknown
  position?: unknown
  x_percent?: unknown
  xPercent?: unknown
  y_percent?: unknown
  yPercent?: unknown
  scale?: unknown
  opacity?: unknown
  animation?: unknown
  metadata?: Record<string, unknown>
  [key: string]: unknown
}

export interface MovScriptEditDecisionAudio {
  narration?: MovScriptEditDecisionNarration | MovScriptEditDecisionAudioSegment[]
  music?: MovScriptEditDecisionAudioLayer
  sfx?: MovScriptEditDecisionAudioSegment[]
  [key: string]: unknown
}

export interface MovScriptEditDecisionNarration {
  segments?: MovScriptEditDecisionAudioSegment[]
  [key: string]: unknown
}

export interface MovScriptEditDecisionAudioLayer {
  source?: unknown
  asset_id?: unknown
  assetId?: unknown
  resource_id?: unknown
  resourceId?: unknown
  start_seconds?: unknown
  start_sec?: unknown
  end_seconds?: unknown
  end_sec?: unknown
  duration_seconds?: unknown
  duration_sec?: unknown
  source_start_seconds?: unknown
  source_start_sec?: unknown
  source_end_seconds?: unknown
  source_end_sec?: unknown
  volume?: unknown
  fade_in?: unknown
  fadeIn?: unknown
  fade_in_seconds?: unknown
  fade_out?: unknown
  fadeOut?: unknown
  fade_out_seconds?: unknown
  ducking?: unknown
  metadata?: Record<string, unknown>
  [key: string]: unknown
}

export interface MovScriptEditDecisionAudioSegment extends MovScriptEditDecisionAudioLayer {
  id?: string
}

export interface MovScriptEditDecisionSubtitles {
  enabled?: boolean
  source?: unknown
  asset_id?: unknown
  assetId?: unknown
  resource_id?: unknown
  resourceId?: unknown
  segments?: MovScriptEditDecisionSubtitleSegment[]
  captions?: MovScriptEditDecisionSubtitleSegment[]
  format?: unknown
  renderer?: unknown
  style?: Record<string, unknown>
  font?: unknown
  font_size?: unknown
  fontSize?: unknown
  color?: unknown
  text_color?: unknown
  background?: unknown
  background_color?: unknown
  position?: unknown
  metadata?: Record<string, unknown>
  [key: string]: unknown
}

export interface MovScriptEditDecisionSubtitleSegment {
  id?: string
  text?: unknown
  content?: unknown
  start_seconds?: unknown
  start_sec?: unknown
  end_seconds?: unknown
  end_sec?: unknown
  duration_seconds?: unknown
  duration_sec?: unknown
  [key: string]: unknown
}

export interface MovScriptAssetManifest {
  schema?: string
  version?: string | number
  assets?: Record<string, unknown>[]
  [key: string]: unknown
}

export interface MediaEditDecisionsProjectOptions extends MediaEditingProjectOptions {
  assetManifest?: MovScriptAssetManifest
  productionId?: string | number
  productionPath?: string
  targetKind?: string
  targetRef?: string
  scopeKind?: string
  scopeRef?: string | number
  sourceHash?: string
  defaultDurationMs?: number
}

export function createMediaEditingProjectFromEditDecisions(
  editDecisions: MovScriptEditDecisionsArtifact,
  options: MediaEditDecisionsProjectOptions = {},
): MediaEditingProject {
  const now = options.now ?? new Date().toISOString()
  const projectId = options.projectId ?? composeProjectId(options, editDecisions)
  const assets = new ComposeAssetRegistry(options.assetManifest)
  const timeline = buildMediaTimelineRecipeFromEditDecisions(editDecisions, assets, options)
  const inputResourceIds = [...new Set(assets.assets.flatMap((asset) => asset.resourceId === undefined ? [] : [asset.resourceId]))]
    .sort((left, right) => left - right)
  return {
    version: 1,
    id: options.id ?? `editing_project_compose_${safeId(options.scopeRef ?? options.targetRef ?? options.productionId ?? 'draft')}`,
    projectId,
    title: options.title ?? `Video compose ${String(options.targetRef ?? options.scopeRef ?? options.productionId ?? 'draft')}`,
    source: {
      kind: 'edit_decisions',
      targetKind: options.targetKind ?? 'timeline_assembly',
      targetRef: options.targetRef ?? `edit_decisions:${safeId(options.scopeKind ?? 'project')}:${safeId(options.scopeRef ?? projectId)}`,
      scopeKind: options.scopeKind,
      scopeRef: options.scopeRef === undefined ? undefined : String(options.scopeRef),
      ...(options.productionId !== undefined ? { productionId: String(options.productionId) } : {}),
    },
    timeline,
    assets: { assets: assets.assets },
    provenance: {
      sourceHash: options.sourceHash,
      inputResourceIds,
      targetKind: options.targetKind ?? 'timeline_assembly',
      targetRef: options.targetRef,
      scopeKind: options.scopeKind,
      scopeRef: options.scopeRef === undefined ? undefined : String(options.scopeRef),
      productionPath: options.productionPath,
    },
    createdAt: now,
    updatedAt: now,
    revision: 1,
  }
}

function buildMediaTimelineRecipeFromEditDecisions(
  editDecisions: MovScriptEditDecisionsArtifact,
  assets: ComposeAssetRegistry,
  options: MediaEditDecisionsProjectOptions,
): MediaTimelineRecipe {
  const defaultDurationMs = options.defaultDurationMs ?? 4000
  const tracks = new TrackRegistry()
  let primaryCursorMs = 0

  for (const [index, cut] of arrayValue<MovScriptEditDecisionCut>(editDecisions.cuts).entries()) {
    const layer = stringField(cut.layer) ?? 'primary'
    const track = videoTrackForLayer(tracks, layer)
    const asset = assets.resolve(assetRef(cut), inferAssetTypeFromRecord(cut, 'video'))
    const sourceStartMs = secondsToMs(cut.source_in_seconds ?? cut.source_in_sec ?? cut.source_start_seconds ?? cut.source_start_sec ?? cut.in_seconds ?? cut.in_sec) ?? 0
    const sourceEndMs = secondsToMs(cut.source_out_seconds ?? cut.source_out_sec ?? cut.source_end_seconds ?? cut.source_end_sec ?? cut.out_seconds ?? cut.out_sec)
    const durationMs = secondsToMs(cut.duration_seconds ?? cut.duration_sec)
      ?? durationFromRange(sourceStartMs, sourceEndMs)
      ?? defaultDurationMs
    const explicitTimelineStartMs = secondsToMs(cut.timeline_start_seconds ?? cut.timeline_start_sec ?? cut.start_seconds ?? cut.start_sec)
    const timelineStartMs = explicitTimelineStartMs ?? (layer === 'primary' ? primaryCursorMs : 0)
    const transform = recordValue(cut.transform)
    const clip: MediaClip = {
      id: stringField(cut.id) ?? `cut_${index + 1}`,
      assetType: asset?.assetType ?? inferAssetTypeFromRecord(cut, 'video'),
      asset,
      timelineStartMs,
      durationMs,
      sourceStartMs,
      sourceEndMs: sourceEndMs ?? sourceStartMs + durationMs,
      speed: numberField(cut.speed),
      volume: normalizeMediaClipVolumePercent(numberField(cut.volume)) ?? 100,
      muted: false,
      fit: 'cover',
      opacity: numberField(transform?.opacity ?? cut.opacity) ?? 1,
      position: stringField(transform?.position ?? cut.position),
      xPercent: numberField(transform?.x_percent ?? transform?.xPercent ?? cut.x_percent ?? cut.xPercent),
      yPercent: numberField(transform?.y_percent ?? transform?.yPercent ?? cut.y_percent ?? cut.yPercent),
      scale: numberField(transform?.scale ?? cut.scale),
      crop: cropSpec(transform?.crop ?? cut.crop),
      ...transitionFields(cut),
      metadata: {
        movscript: {
          kind: 'edit_decision_cut',
          layer,
          reason: stringField(cut.reason),
          source: assetRef(cut),
          renderRuntime: stringField(editDecisions.render_runtime ?? editDecisions.renderRuntime),
        },
        ...(cut.metadata ?? {}),
      },
    }
    track.clips.push(clip)
    if (layer === 'primary' && explicitTimelineStartMs === undefined) primaryCursorMs = timelineStartMs + durationMs
  }

  const primaryDurationMs = Math.max(primaryCursorMs, durationFromTracks(tracks.all()))
  addOverlayTracks(editDecisions, tracks, assets, primaryDurationMs, defaultDurationMs)
  addAudioTracks(editDecisions, tracks, assets, primaryDurationMs, defaultDurationMs)
  addSubtitleTracks(editDecisions, tracks, assets, primaryDurationMs, defaultDurationMs)

  const finalTracks = tracks.all()
  return {
    version: 1,
    id: options.id ? `timeline_${safeId(options.id)}` : `timeline_compose_${safeId(options.scopeRef ?? options.targetRef ?? options.productionId ?? 'draft')}`,
    fps: options.fps ?? 30,
    width: options.width ?? 1920,
    height: options.height ?? 1080,
    background: options.background ?? '#000000',
    durationMs: durationFromTracks(finalTracks),
    tracks: finalTracks,
    metadata: {
      schema: 'movscript.video_compose_timeline.v1',
      rendererFamily: stringField(editDecisions.renderer_family ?? editDecisions.rendererFamily),
      renderRuntime: stringField(editDecisions.render_runtime ?? editDecisions.renderRuntime),
      compositionMode: stringField(editDecisions.composition_mode ?? editDecisions.compositionMode),
      targetKind: options.targetKind,
      targetRef: options.targetRef,
      scopeKind: options.scopeKind,
      scopeRef: options.scopeRef,
      ...(editDecisions.metadata ? { editDecisionMetadata: editDecisions.metadata } : {}),
    },
  }
}

function addOverlayTracks(
  editDecisions: MovScriptEditDecisionsArtifact,
  tracks: TrackRegistry,
  assets: ComposeAssetRegistry,
  timelineDurationMs: number,
  defaultDurationMs: number,
): void {
  const overlayTrack = tracks.track('track_overlay_visual', 'video', 20, 'overlay')
  for (const [index, overlay] of arrayValue<MovScriptEditDecisionOverlay>(editDecisions.overlays).entries()) {
    const asset = assets.resolve(assetRef(overlay), inferAssetTypeFromRecord(overlay, 'image'))
    const startMs = secondsToMs(overlay.start_seconds ?? overlay.start_sec) ?? 0
    const durationMs = secondsToMs(overlay.duration_seconds ?? overlay.duration_sec)
      ?? durationFromRange(startMs, secondsToMs(overlay.end_seconds ?? overlay.end_sec))
      ?? Math.max(defaultDurationMs, timelineDurationMs - startMs)
    overlayTrack.clips.push({
      id: stringField(overlay.id) ?? `overlay_${index + 1}`,
      assetType: asset?.assetType ?? inferAssetTypeFromRecord(overlay, 'image'),
      asset,
      timelineStartMs: startMs,
      durationMs,
      sourceStartMs: secondsToMs(overlay.source_start_seconds ?? overlay.source_start_sec) ?? 0,
      sourceEndMs: secondsToMs(overlay.source_end_seconds ?? overlay.source_end_sec),
      fit: 'contain',
      opacity: numberField(overlay.opacity) ?? 1,
      position: stringField(overlay.position),
      xPercent: numberField(overlay.x_percent ?? overlay.xPercent),
      yPercent: numberField(overlay.y_percent ?? overlay.yPercent),
      scale: numberField(overlay.scale),
      metadata: {
        movscript: {
          kind: 'edit_decision_overlay',
          source: assetRef(overlay),
          animation: overlay.animation,
        },
        ...(overlay.metadata ?? {}),
      },
    })
  }
}

function addAudioTracks(
  editDecisions: MovScriptEditDecisionsArtifact,
  tracks: TrackRegistry,
  assets: ComposeAssetRegistry,
  timelineDurationMs: number,
  defaultDurationMs: number,
): void {
  const audio = recordValue(editDecisions.audio)
  if (!audio) return
  const narration = recordValue(audio.narration)
  const narrationSegments = Array.isArray(audio.narration)
    ? audio.narration
    : Array.isArray(narration?.segments) ? narration.segments : []
  addAudioSegments(tracks.track('track_audio_narration', 'audio', 30, 'narration'), narrationSegments, assets, 'narration', defaultDurationMs)

  const music = recordValue(audio.music)
  if (music) {
    const track = tracks.track('track_audio_music', 'audio', 10, 'music')
    const asset = assets.resolve(assetRef(music), 'audio')
    const startMs = secondsToMs(music.start_seconds ?? music.start_sec) ?? 0
    const durationMs = secondsToMs(music.duration_seconds ?? music.duration_sec)
      ?? durationFromRange(startMs, secondsToMs(music.end_seconds ?? music.end_sec))
      ?? Math.max(defaultDurationMs, timelineDurationMs - startMs)
    track.clips.push(audioClipFromLayer({
      layer: music,
      id: 'music_bed',
      kind: 'music',
      asset,
      startMs,
      durationMs,
    }))
  }

  addAudioSegments(
    tracks.track('track_audio_sfx', 'audio', 40, 'sfx'),
    arrayValue(audio.sfx),
    assets,
    'sfx',
    defaultDurationMs,
  )
}

function addAudioSegments(
  track: MediaTrack,
  segments: unknown[],
  assets: ComposeAssetRegistry,
  kind: string,
  defaultDurationMs: number,
): void {
  for (const [index, segment] of segments.entries()) {
    const record = recordValue(segment)
    if (!record) continue
    const asset = assets.resolve(assetRef(record), 'audio')
    const startMs = secondsToMs(record.start_seconds ?? record.start_sec) ?? 0
    const durationMs = secondsToMs(record.duration_seconds ?? record.duration_sec)
      ?? durationFromRange(startMs, secondsToMs(record.end_seconds ?? record.end_sec))
      ?? defaultDurationMs
    track.clips.push(audioClipFromLayer({
      layer: record,
      id: stringField(record.id) ?? `${kind}_${index + 1}`,
      kind,
      asset,
      startMs,
      durationMs,
    }))
  }
}

function audioClipFromLayer(input: {
  layer: Record<string, unknown>
  id: string
  kind: string
  asset?: MediaAssetDescriptor
  startMs: number
  durationMs: number
}): MediaClip {
  const sourceStartMs = secondsToMs(input.layer.source_start_seconds ?? input.layer.source_start_sec) ?? 0
  return {
    id: input.id,
    assetType: 'audio',
    asset: input.asset,
    timelineStartMs: input.startMs,
    durationMs: input.durationMs,
    sourceStartMs,
    sourceEndMs: secondsToMs(input.layer.source_end_seconds ?? input.layer.source_end_sec) ?? sourceStartMs + input.durationMs,
    volume: normalizeMediaClipVolumePercent(numberField(input.layer.volume)) ?? 100,
    fadeInMs: secondsToMs(input.layer.fade_in_seconds ?? input.layer.fade_in ?? input.layer.fadeIn),
    fadeOutMs: secondsToMs(input.layer.fade_out_seconds ?? input.layer.fade_out ?? input.layer.fadeOut),
    muted: false,
    metadata: {
      movscript: {
        kind: `edit_decision_${input.kind}`,
        source: assetRef(input.layer),
        ducking: input.layer.ducking,
      },
      ...(recordValue(input.layer.metadata) ?? {}),
    },
  }
}

function addSubtitleTracks(
  editDecisions: MovScriptEditDecisionsArtifact,
  tracks: TrackRegistry,
  assets: ComposeAssetRegistry,
  timelineDurationMs: number,
  defaultDurationMs: number,
): void {
  const subtitles = recordValue(editDecisions.subtitles)
  if (!subtitles || subtitles.enabled === false) return
  const track = tracks.track('track_subtitles', 'subtitle', 50, 'subtitles')
  const segments = arrayValue(subtitles.segments).length ? arrayValue(subtitles.segments) : arrayValue(subtitles.captions)
  const style = subtitleTextStyle(subtitles)
  for (const [index, item] of segments.entries()) {
    const segment = recordValue(item)
    if (!segment) continue
    const startMs = secondsToMs(segment.start_seconds ?? segment.start_sec) ?? 0
    const durationMs = secondsToMs(segment.duration_seconds ?? segment.duration_sec)
      ?? durationFromRange(startMs, secondsToMs(segment.end_seconds ?? segment.end_sec))
      ?? defaultDurationMs
    track.clips.push({
      id: stringField(segment.id) ?? `subtitle_${index + 1}`,
      assetType: 'text',
      timelineStartMs: startMs,
      durationMs,
      text: {
        ...style,
        content: stringField(segment.text ?? segment.content) ?? '',
      },
      subtitle: {
        burnIn: true,
        style,
      },
      metadata: {
        movscript: {
          kind: 'edit_decision_subtitle_segment',
        },
      },
    })
  }

  const sourceRef = assetRef(subtitles)
  if (sourceRef !== undefined && !isGeneratedSubtitleSource(sourceRef)) {
    const asset = assets.resolve(sourceRef, 'subtitle')
    track.clips.push({
      id: 'subtitle_file',
      assetType: 'subtitle',
      asset,
      timelineStartMs: 0,
      durationMs: Math.max(defaultDurationMs, timelineDurationMs),
      subtitle: {
        resourceId: asset?.resourceId,
        format: subtitleFormat(subtitles),
        burnIn: true,
        renderer: subtitleRenderer(subtitles),
        style,
      },
      metadata: {
        movscript: {
          kind: 'edit_decision_subtitle_file',
          source: sourceRef,
        },
      },
    })
  }
}

class TrackRegistry {
  private readonly tracks = new Map<string, MediaTrack>()

  track(id: string, type: MediaTrackType, zIndex: number, name: string): MediaTrack {
    const existing = this.tracks.get(id)
    if (existing) return existing
    const track: MediaTrack = {
      id,
      type,
      zIndex,
      name,
      muted: false,
      locked: false,
      clips: [],
    }
    this.tracks.set(id, track)
    return track
  }

  all(): MediaTrack[] {
    return [...this.tracks.values()]
      .map((track) => ({
        ...track,
        clips: [...track.clips].sort((left, right) => left.timelineStartMs - right.timelineStartMs || left.id.localeCompare(right.id)),
      }))
      .filter((track) => track.clips.length > 0)
      .sort((left, right) => left.zIndex - right.zIndex || left.id.localeCompare(right.id))
  }
}

class ComposeAssetRegistry {
  private readonly byRef = new Map<string, MediaAssetDescriptor>()
  private readonly byId = new Map<string, MediaAssetDescriptor>()

  constructor(manifest: MovScriptAssetManifest | undefined) {
    for (const entry of arrayValue<Record<string, unknown>>(manifest?.assets)) {
      const asset = this.assetFromRecord(entry)
      if (!asset) continue
      this.register(asset, assetRefsFromRecord(entry))
    }
  }

  get assets(): MediaAssetDescriptor[] {
    return [...this.byId.values()].sort((left, right) => left.id.localeCompare(right.id))
  }

  resolve(ref: unknown, preferredType: MediaAssetType): MediaAssetDescriptor | undefined {
    const key = refKey(ref)
    if (key && this.byRef.has(key)) return this.byRef.get(key)
    const record = recordValue(ref)
    const asset = record
      ? this.assetFromRecord(record, preferredType)
      : this.assetFromPrimitive(ref, preferredType)
    if (!asset) return undefined
    return this.register(asset, key ? [key] : [])
  }

  private register(asset: MediaAssetDescriptor, refs: string[]): MediaAssetDescriptor {
    let next = asset
    let index = 1
    while (this.byId.has(next.id)) {
      const existing = this.byId.get(next.id)
      if (sameAsset(existing, next)) {
        next = existing!
        break
      }
      index += 1
      next = { ...asset, id: `${asset.id}_${index}` }
    }
    this.byId.set(next.id, next)
    for (const ref of refs) this.byRef.set(ref, next)
    this.byRef.set(next.id, next)
    if (next.resourceId !== undefined) this.byRef.set(String(next.resourceId), next)
    if (next.localPath) this.byRef.set(next.localPath, next)
    return next
  }

  private assetFromRecord(record: Record<string, unknown>, preferredType: MediaAssetType = 'video'): MediaAssetDescriptor | undefined {
    const rawPath = stringField(record.localPath ?? record.local_path ?? record.path ?? record.file_path ?? record.filePath ?? record.src)
    const resourceId = integerField(record.resourceId ?? record.resource_id)
      ?? resourceIdFromString(rawPath ?? '')
    const localPath = localPathField(rawPath)
    const idSource = stringField(record.mediaAssetId ?? record.media_asset_id ?? record.id ?? record.asset_id ?? record.assetId)
      ?? (resourceId !== undefined ? `resource_${resourceId}` : undefined)
      ?? localPath
    if (!idSource && resourceId === undefined && !localPath) return undefined
    const assetType = inferAssetTypeFromRecord(record, preferredType)
    return {
      id: `asset_${safeId(idSource ?? `${assetType}_${this.byId.size + 1}`)}`,
      sourceKind: resourceId !== undefined ? 'backend_resource' : 'local_file',
      assetType,
      ...(resourceId !== undefined ? { resourceId } : {}),
      ...(localPath ? { localPath } : {}),
      ...(stringField(record.mimeType ?? record.mime_type) ? { mimeType: stringField(record.mimeType ?? record.mime_type) } : {}),
      ...(stringField(record.checksum) ? { checksum: stringField(record.checksum) } : {}),
      label: stringField(record.label ?? record.title ?? record.name ?? record.id ?? record.asset_id ?? localPath),
      metadata: {
        movscript: {
          kind: 'edit_decision_asset_manifest_entry',
          manifest: record,
        },
      },
    }
  }

  private assetFromPrimitive(ref: unknown, preferredType: MediaAssetType): MediaAssetDescriptor | undefined {
    const resourceId = integerField(ref)
    if (resourceId !== undefined) {
      return {
        id: `asset_resource_${resourceId}`,
        sourceKind: 'backend_resource',
        assetType: preferredType,
        resourceId,
        label: `resource ${resourceId}`,
      }
    }
    const value = stringField(ref)
    if (!value) return undefined
    const parsedResourceId = resourceIdFromString(value)
    if (parsedResourceId !== undefined) {
      return {
        id: `asset_resource_${parsedResourceId}`,
        sourceKind: 'backend_resource',
        assetType: preferredType,
        resourceId: parsedResourceId,
        label: value,
      }
    }
    return {
      id: `asset_${safeId(value)}`,
      sourceKind: 'local_file',
      assetType: assetTypeFromPath(value) ?? preferredType,
      localPath: value,
      label: value.split('/').pop() ?? value,
      metadata: {
        movscript: {
          kind: 'edit_decision_inline_asset_ref',
          ref: value,
        },
      },
    }
  }
}

function videoTrackForLayer(tracks: TrackRegistry, layer: string): MediaTrack {
  if (layer === 'background') return tracks.track('track_background_video', 'video', -10, 'background')
  if (layer === 'overlay') return tracks.track('track_overlay_video', 'video', 20, 'overlay')
  return tracks.track('track_primary_video', 'video', 0, 'primary')
}

function transitionFields(record: Record<string, unknown>): {
  fadeInMs?: number
  fadeOutMs?: number
  transition?: TransitionSpec
} {
  const transitionIn = stringField(record.transition_in ?? record.transitionIn)
  const transitionOut = stringField(record.transition_out ?? record.transitionOut)
  const transition = stringField(record.transition)
  const durationMs = secondsToMs(record.transition_duration ?? record.transitionDuration)
  return {
    ...(transitionIn === 'fade' ? { fadeInMs: durationMs } : {}),
    ...(transitionOut === 'fade' ? { fadeOutMs: durationMs } : {}),
    ...(transition || transitionIn || transitionOut ? { transition: { type: transition ?? transitionIn ?? transitionOut ?? 'fade', durationMs } } : {}),
  }
}

function cropSpec(value: unknown): CropSpec | undefined {
  const crop = recordValue(value)
  if (!crop) return undefined
  return {
    topPercent: numberField(crop.topPercent ?? crop.top_percent ?? crop.top),
    rightPercent: numberField(crop.rightPercent ?? crop.right_percent ?? crop.right),
    bottomPercent: numberField(crop.bottomPercent ?? crop.bottom_percent ?? crop.bottom),
    leftPercent: numberField(crop.leftPercent ?? crop.left_percent ?? crop.left),
  }
}

function subtitleTextStyle(subtitles: Record<string, unknown>) {
  const style = recordValue(subtitles.style) ?? {}
  return {
    content: '',
    fontSize: numberField(style.fontSize ?? style.font_size ?? subtitles.fontSize ?? subtitles.font_size) ?? 42,
    fontFamily: stringField(style.fontFamily ?? style.font_family ?? subtitles.font) ?? 'Inter',
    color: stringField(style.color ?? style.text_color ?? subtitles.color ?? subtitles.text_color) ?? '#ffffff',
    backgroundColor: stringField(style.backgroundColor ?? style.background_color ?? subtitles.background_color ?? subtitles.background),
    align: textAlignValue(style.align ?? subtitles.align) ?? 'center',
    position: stringField(style.position ?? subtitles.position) ?? 'bottom',
  } as const
}

function subtitleFormat(subtitles: Record<string, unknown>): 'srt' | 'vtt' | 'ass' | 'ssa' | undefined {
  const format = stringField(subtitles.format)?.toLowerCase()
  if (format === 'srt' || format === 'vtt' || format === 'ass' || format === 'ssa') return format
  return undefined
}

function subtitleRenderer(subtitles: Record<string, unknown>): 'drawtext' | 'ass' | 'libass' | undefined {
  const renderer = stringField(subtitles.renderer)?.toLowerCase()
  if (renderer === 'drawtext' || renderer === 'ass' || renderer === 'libass') return renderer
  return undefined
}

function textAlignValue(value: unknown): 'left' | 'center' | 'right' | undefined {
  const normalized = stringField(value)?.toLowerCase()
  if (normalized === 'left' || normalized === 'center' || normalized === 'right') return normalized
  return undefined
}

function assetRef(record: Record<string, unknown>): unknown {
  return record.source ?? record.asset_id ?? record.assetId ?? record.resource_id ?? record.resourceId
}

function assetRefsFromRecord(record: Record<string, unknown>): string[] {
  return [
    record.id,
    record.asset_id,
    record.assetId,
    record.ref,
    record.name,
    record.path,
    record.localPath,
    record.local_path,
    record.file_path,
    record.filePath,
    record.resource_id,
    record.resourceId,
  ].flatMap((value) => {
    const key = refKey(value)
    return key ? [key] : []
  })
}

function inferAssetTypeFromRecord(record: Record<string, unknown>, fallback: MediaAssetType): MediaAssetType {
  const declared = stringField(record.assetType ?? record.asset_type ?? record.type ?? record.kind ?? record.output_kind ?? record.media_type)?.toLowerCase()
  if (declared?.includes('subtitle')) return 'subtitle'
  if (declared?.includes('audio') || declared?.includes('music') || declared?.includes('voice') || declared?.includes('sfx')) return 'audio'
  if (declared?.includes('image') || declared?.includes('photo')) return 'image'
  if (declared?.includes('text') || declared?.includes('caption')) return 'text'
  if (declared?.includes('video') || declared?.includes('clip')) return 'video'
  const mime = stringField(record.mimeType ?? record.mime_type)?.toLowerCase()
  if (mime?.startsWith('audio/')) return 'audio'
  if (mime?.startsWith('image/')) return 'image'
  if (mime?.startsWith('text/') || mime?.includes('subrip') || mime?.includes('vtt')) return 'subtitle'
  const path = localPathField(stringField(record.localPath ?? record.local_path ?? record.path ?? record.file_path ?? record.filePath ?? record.src))
  return assetTypeFromPath(path) ?? fallback
}

function assetTypeFromPath(path: string | undefined): MediaAssetType | undefined {
  const normalized = path?.split('?')[0]?.toLowerCase()
  if (!normalized) return undefined
  if (/\.(wav|mp3|m4a|aac|flac|ogg)$/.test(normalized)) return 'audio'
  if (/\.(png|jpg|jpeg|webp|gif|avif)$/.test(normalized)) return 'image'
  if (/\.(srt|vtt|ass|ssa)$/.test(normalized)) return 'subtitle'
  if (/\.(txt|md)$/.test(normalized)) return 'text'
  if (/\.(mp4|mov|m4v|webm|mkv|avi)$/.test(normalized)) return 'video'
  return undefined
}

function composeProjectId(options: MediaEditDecisionsProjectOptions, editDecisions: MovScriptEditDecisionsArtifact): string {
  if (options.productionId !== undefined) return `movscript_production_${safeId(options.productionId)}`
  if (options.scopeKind && options.scopeRef !== undefined) return `movscript_${safeId(options.scopeKind)}_${safeId(options.scopeRef)}`
  return `movscript_video_compose_${safeId(editDecisions.version ?? 'draft')}`
}

function durationFromTracks(tracks: readonly MediaTrack[]): number {
  return Math.max(0, ...tracks.flatMap((track) => track.clips.map((clip) => clip.timelineStartMs + clip.durationMs)))
}

function durationFromRange(startMs: number | undefined, endMs: number | undefined): number | undefined {
  if (startMs === undefined || endMs === undefined || endMs <= startMs) return undefined
  return endMs - startMs
}

function secondsToMs(value: unknown): number | undefined {
  const seconds = numberField(value)
  return seconds === undefined ? undefined : Math.max(0, Math.round(seconds * 1000))
}

function numberField(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return undefined
}

function integerField(value: unknown): number | undefined {
  const number = numberField(value)
  if (number === undefined || !Number.isInteger(number) || number <= 0) return undefined
  return number
}

function resourceIdFromString(value: string): number | undefined {
  const match = value.match(/^(?:resource|raw_resource|backend_resource)[:_](\d+)$/i)
  if (!match) return undefined
  return integerField(match[1]!)
}

function stringField(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function localPathField(value: string | undefined): string | undefined {
  if (!value) return undefined
  if (/^(?:resource|raw_resource|backend_resource|content-unit|content_unit):/i.test(value)) return undefined
  if (/^(?:https?:|blob:|data:)/i.test(value)) return undefined
  return value
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

function arrayValue<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : []
}

function refKey(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return stringField(value)
}

function safeId(value: unknown): string {
  const raw = String(value ?? 'draft').trim() || 'draft'
  return raw.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'draft'
}

function sameAsset(left: MediaAssetDescriptor | undefined, right: MediaAssetDescriptor): boolean {
  if (!left) return false
  if (left.resourceId !== undefined && right.resourceId !== undefined) return left.resourceId === right.resourceId
  if (left.localPath && right.localPath) return left.localPath === right.localPath
  return left.id === right.id
}

function isGeneratedSubtitleSource(value: unknown): boolean {
  const normalized = stringField(value)?.toLowerCase()
  return normalized === 'script' || normalized === 'auto' || normalized === 'captions' || normalized === 'segments'
}
