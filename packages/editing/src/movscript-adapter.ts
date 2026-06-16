import {
  defaultOpenCutTransform,
  type OpenCutAudioElement,
  type OpenCutBackground,
  type OpenCutCanvasSize,
  type OpenCutImageElement,
  type OpenCutProjectSettings,
  type OpenCutTextElement,
  type OpenCutTimelineDocument,
  type OpenCutTimelineElement,
  type OpenCutTimelineTrack,
  type OpenCutTrackType,
  type OpenCutVideoElement,
} from './opencut-protocol.js'

export type MovScriptEditPlanTrackType = 'video' | 'voice' | 'subtitle' | 'audio' | 'image' | 'metadata'
export type MovScriptEditPlanOutputKind = 'image' | 'video' | 'audio' | 'text' | 'metadata'

export interface MovScriptEditPlanTrackItem {
  id: string
  content_unit_id: string | number
  content_unit_ref: string
  output_kind: MovScriptEditPlanOutputKind
  target_kind: 'scene_moment' | 'expression_unit' | 'content_unit' | string
  target_ref: string
  expression_unit_ref?: string
  expression_modality?: string
  expression_role?: string
  candidate_id?: string | number
  resource_id?: number
  selected: boolean
  stale: boolean
  timing_intent?: Record<string, unknown>
  generation_role?: string
  order: number
}

export interface MovScriptEditPlanTrack {
  type: MovScriptEditPlanTrackType
  items: MovScriptEditPlanTrackItem[]
}

export interface MovScriptEditPlanArtifact {
  schema: 'movscript.edit_plan.v1'
  productionId: string | number
  productionPath: string
  sceneMomentId: string | number
  sceneMomentPath: string
  target_ref: string
  status: 'ready_to_compose' | 'missing_selection'
  tracks: MovScriptEditPlanTrack[]
  compose_inputs: Array<{
    content_unit_id: string | number
    resource_id: number
    output_kind: MovScriptEditPlanOutputKind
    track_type: MovScriptEditPlanTrackType
  }>
  blockers?: Array<{
    code: 'selection_missing' | 'selection_stale' | 'resource_missing'
    content_unit_id: string | number
    message: string
  }>
}

export interface MovScriptEditPlanToOpenCutOptions {
  projectId?: string
  projectName?: string
  sceneName?: string
  now?: string
  settings?: Partial<OpenCutProjectSettings>
  defaultDurationSec?: number
  includeMissingPlaceholders?: boolean
}

export function createOpenCutTimelineFromMovScriptEditPlan(
  editPlan: MovScriptEditPlanArtifact,
  options: MovScriptEditPlanToOpenCutOptions = {},
): OpenCutTimelineDocument {
  const now = options.now ?? new Date().toISOString()
  const sceneId = `scene_moment_${String(editPlan.sceneMomentId)}`
  const settings = openCutProjectSettings(options.settings)
  const tracks = editPlan.tracks.flatMap((track, index) =>
    openCutTrackFromMovScriptTrack({
      track,
      index,
      sceneMomentId: editPlan.sceneMomentId,
      sceneMomentPath: editPlan.sceneMomentPath,
      defaultDurationSec: options.defaultDurationSec ?? 4,
      includeMissingPlaceholders: options.includeMissingPlaceholders ?? true,
    }),
  )
  const duration = durationFromTracks(tracks)

  return {
    schema: 'opencut.timeline.v1',
    protocol: {
      upstream: 'opencut',
      compatibility: 'timeline',
      version: 1,
    },
    project: {
      metadata: {
        id: options.projectId ?? `movscript_${String(editPlan.productionId)}`,
        name: options.projectName ?? `MovScript ${String(editPlan.productionId)}`,
        duration,
        createdAt: now,
        updatedAt: now,
      },
      scenes: [{
        id: sceneId,
        name: options.sceneName ?? `Scene moment ${String(editPlan.sceneMomentId)}`,
        isMain: true,
        tracks,
        bookmarks: [],
        createdAt: now,
        updatedAt: now,
      }],
      currentSceneId: sceneId,
      settings,
      version: 1,
      timelineViewState: {
        zoomLevel: 1,
        scrollLeft: 0,
        playheadTime: 0,
      },
    },
  }
}

function openCutTrackFromMovScriptTrack(input: {
  track: MovScriptEditPlanTrack
  index: number
  sceneMomentId: string | number
  sceneMomentPath: string
  defaultDurationSec: number
  includeMissingPlaceholders: boolean
}): OpenCutTimelineTrack[] {
  const openCutType = openCutTrackTypeForMovScriptTrack(input.track.type)
  if (!openCutType) return []

  let cursor = 0
  const elements = input.track.items
    .slice()
    .sort((left, right) => left.order - right.order)
    .flatMap((item) => {
      if (!input.includeMissingPlaceholders && (item.selected !== true || item.resource_id === undefined)) return []
      const element = openCutElementFromMovScriptItem({
        item,
        trackType: input.track.type,
        openCutType,
        fallbackStartTime: cursor,
        defaultDurationSec: input.defaultDurationSec,
        sceneMomentId: input.sceneMomentId,
        sceneMomentPath: input.sceneMomentPath,
      })
      cursor = element.startTime + element.duration
      return [element]
    })

  const base = {
    id: `track_${input.track.type}_${input.index}`,
    name: input.track.type,
    elements,
  }

  switch (openCutType) {
    case 'video':
      return [{
        ...base,
        type: 'video',
        elements: elements.filter((element): element is OpenCutVideoElement | OpenCutImageElement => element.type === 'video' || element.type === 'image'),
        isMain: input.track.type === 'video',
        muted: false,
        hidden: false,
      }]
    case 'audio':
      return [{
        ...base,
        type: 'audio',
        elements: elements.filter((element): element is OpenCutAudioElement => element.type === 'audio'),
        muted: false,
      }]
    case 'text':
      return [{
        ...base,
        type: 'text',
        elements: elements.filter((element): element is OpenCutTextElement => element.type === 'text'),
        hidden: false,
      }]
    default:
      return []
  }
}

function openCutElementFromMovScriptItem(input: {
  item: MovScriptEditPlanTrackItem
  trackType: MovScriptEditPlanTrackType
  openCutType: OpenCutTrackType
  fallbackStartTime: number
  defaultDurationSec: number
  sceneMomentId: string | number
  sceneMomentPath: string
}): OpenCutTimelineElement {
  const timing = input.item.timing_intent ?? {}
  const trimStart = numberField(timing.trim_start_sec) ?? numberField(timing.in_sec) ?? numberField(timing.start_sec) ?? 0
  const trimEnd = numberField(timing.trim_end_sec) ?? 0
  const duration =
    numberField(timing.duration_sec) ??
    durationFromInOut(timing) ??
    input.defaultDurationSec
  const startTime =
    numberField(timing.timeline_start_sec) ??
    numberField(timing.start_time_sec) ??
    input.fallbackStartTime
  const sourceDuration = numberField(timing.source_duration_sec) ?? trimStart + duration + trimEnd
  const mediaId = mediaIdForItem(input.item)
  const metadata = {
    movscript: {
      sceneMomentId: input.sceneMomentId,
      sceneMomentPath: input.sceneMomentPath,
      contentUnitId: input.item.content_unit_id,
      contentUnitRef: input.item.content_unit_ref,
      candidateId: input.item.candidate_id,
      resourceId: input.item.resource_id,
      outputKind: input.item.output_kind,
      trackType: input.trackType,
      targetKind: input.item.target_kind,
      targetRef: input.item.target_ref,
      expressionUnitRef: input.item.expression_unit_ref,
      expressionModality: input.item.expression_modality,
      expressionRole: input.item.expression_role,
      selected: input.item.selected,
      stale: input.item.stale,
    },
  }
  const base = {
    id: input.item.id,
    name: String(input.item.content_unit_id),
    duration,
    startTime,
    trimStart,
    trimEnd,
    sourceDuration,
    metadata,
  }

  if (input.item.output_kind === 'audio' || input.openCutType === 'audio') {
    return {
      ...base,
      type: 'audio',
      sourceType: 'upload',
      mediaId,
      volume: numberField(timing.volume) ?? 1,
      muted: false,
    }
  }

  if (input.item.output_kind === 'text' || input.openCutType === 'text') {
    return {
      ...base,
      type: 'text',
      content: stringField(timing.text) ?? String(input.item.content_unit_id),
      fontSize: numberField(timing.font_size) ?? 42,
      fontFamily: stringField(timing.font_family) ?? 'Inter',
      color: stringField(timing.color) ?? '#ffffff',
      background: {
        color: stringField(timing.background_color) ?? 'transparent',
      },
      textAlign: 'center',
      fontWeight: 'normal',
      fontStyle: 'normal',
      textDecoration: 'none',
      transform: defaultOpenCutTransform(),
      opacity: numberField(timing.opacity) ?? 1,
      hidden: false,
    }
  }

  if (input.item.output_kind === 'image') {
    return {
      ...base,
      type: 'image',
      mediaId,
      transform: defaultOpenCutTransform(),
      opacity: numberField(timing.opacity) ?? 1,
      hidden: false,
    }
  }

  return {
    ...base,
    type: 'video',
    mediaId,
    transform: defaultOpenCutTransform(),
    opacity: numberField(timing.opacity) ?? 1,
    muted: false,
    hidden: false,
  }
}

function openCutTrackTypeForMovScriptTrack(type: MovScriptEditPlanTrackType): 'video' | 'audio' | 'text' | undefined {
  switch (type) {
    case 'video':
    case 'image':
      return 'video'
    case 'voice':
    case 'audio':
      return 'audio'
    case 'subtitle':
      return 'text'
    case 'metadata':
      return undefined
  }
}

function openCutProjectSettings(settings: Partial<OpenCutProjectSettings> = {}): OpenCutProjectSettings {
  return {
    fps: settings.fps ?? 30,
    canvasSize: settings.canvasSize ?? defaultCanvasSize(),
    originalCanvasSize: settings.originalCanvasSize ?? null,
    background: settings.background ?? defaultBackground(),
  }
}

function defaultCanvasSize(): OpenCutCanvasSize {
  return { width: 1080, height: 1920 }
}

function defaultBackground(): OpenCutBackground {
  return { type: 'color', color: '#000000' }
}

function durationFromTracks(tracks: readonly OpenCutTimelineTrack[]): number {
  return Math.max(
    0,
    ...tracks.flatMap((track) => track.elements.map((element) => element.startTime + element.duration)),
  )
}

function durationFromInOut(timing: Record<string, unknown>): number | undefined {
  const start = numberField(timing.in_sec) ?? numberField(timing.start_sec)
  const end = numberField(timing.out_sec) ?? numberField(timing.end_sec)
  if (start === undefined || end === undefined || end <= start) return undefined
  return end - start
}

function mediaIdForItem(item: MovScriptEditPlanTrackItem): string {
  if (item.resource_id !== undefined) return `movscript-resource-${item.resource_id}`
  return `movscript-content-unit-${String(item.content_unit_id)}`
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
