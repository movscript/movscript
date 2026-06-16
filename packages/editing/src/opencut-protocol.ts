export type OpenCutTimelineSchema = 'opencut.timeline.v1'

export interface OpenCutCanvasSize {
  width: number
  height: number
}

export type OpenCutBackground =
  | { type: 'color'; color: string }
  | { type: 'blur'; blurIntensity: number }

export interface OpenCutProjectSettings {
  fps: number
  canvasSize: OpenCutCanvasSize
  originalCanvasSize?: OpenCutCanvasSize | null
  background: OpenCutBackground
}

export interface OpenCutProjectMetadata {
  id: string
  name: string
  thumbnail?: string
  duration: number
  createdAt: string
  updatedAt: string
}

export interface OpenCutTimelineViewState {
  zoomLevel: number
  scrollLeft: number
  playheadTime: number
}

export interface OpenCutTimelineDocument {
  schema: OpenCutTimelineSchema
  project: OpenCutProject
  protocol: {
    upstream: 'opencut'
    compatibility: 'timeline'
    version: 1
  }
}

export interface OpenCutProject {
  metadata: OpenCutProjectMetadata
  scenes: OpenCutScene[]
  currentSceneId: string
  settings: OpenCutProjectSettings
  version: number
  timelineViewState?: OpenCutTimelineViewState
}

export interface OpenCutBookmark {
  time: number
  note?: string
  color?: string
  duration?: number
}

export interface OpenCutScene {
  id: string
  name: string
  isMain: boolean
  tracks: OpenCutTimelineTrack[]
  bookmarks: OpenCutBookmark[]
  createdAt: string
  updatedAt: string
}

export type OpenCutTrackType = 'video' | 'text' | 'audio' | 'sticker' | 'effect'

export interface OpenCutBaseTrack {
  id: string
  name: string
  type: OpenCutTrackType
  elements: OpenCutTimelineElement[]
}

export interface OpenCutVideoTrack extends OpenCutBaseTrack {
  type: 'video'
  elements: Array<OpenCutVideoElement | OpenCutImageElement>
  isMain: boolean
  muted: boolean
  hidden: boolean
}

export interface OpenCutTextTrack extends OpenCutBaseTrack {
  type: 'text'
  elements: OpenCutTextElement[]
  hidden: boolean
}

export interface OpenCutAudioTrack extends OpenCutBaseTrack {
  type: 'audio'
  elements: OpenCutAudioElement[]
  muted: boolean
}

export interface OpenCutStickerTrack extends OpenCutBaseTrack {
  type: 'sticker'
  elements: OpenCutStickerElement[]
  hidden: boolean
}

export interface OpenCutEffectTrack extends OpenCutBaseTrack {
  type: 'effect'
  elements: OpenCutEffectElement[]
  hidden: boolean
}

export type OpenCutTimelineTrack =
  | OpenCutVideoTrack
  | OpenCutTextTrack
  | OpenCutAudioTrack
  | OpenCutStickerTrack
  | OpenCutEffectTrack

export interface OpenCutTransform {
  x: number
  y: number
  scaleX: number
  scaleY: number
  rotation: number
}

export interface OpenCutTimelineElementMetadata {
  movscript?: {
    sceneMomentId?: string | number
    sceneMomentPath?: string
    contentUnitId?: string | number
    contentUnitRef?: string
    candidateId?: string | number
    resourceId?: number
    outputKind?: string
    trackType?: string
    targetKind?: string
    targetRef?: string
    expressionUnitRef?: string
    expressionModality?: string
    expressionRole?: string
    selected?: boolean
    stale?: boolean
  }
  [key: string]: unknown
}

export interface OpenCutBaseElement {
  id: string
  name: string
  duration: number
  startTime: number
  trimStart: number
  trimEnd: number
  sourceDuration?: number
  animations?: Record<string, unknown>
  metadata?: OpenCutTimelineElementMetadata
}

export interface OpenCutVideoElement extends OpenCutBaseElement {
  type: 'video'
  mediaId: string
  muted?: boolean
  hidden?: boolean
  transform: OpenCutTransform
  opacity: number
  blendMode?: string
  effects?: unknown[]
}

export interface OpenCutImageElement extends OpenCutBaseElement {
  type: 'image'
  mediaId: string
  hidden?: boolean
  transform: OpenCutTransform
  opacity: number
  blendMode?: string
  effects?: unknown[]
}

export interface OpenCutAudioElement extends OpenCutBaseElement {
  type: 'audio'
  sourceType: 'upload' | 'library'
  mediaId?: string
  sourceUrl?: string
  volume: number
  muted?: boolean
}

export interface OpenCutTextElement extends OpenCutBaseElement {
  type: 'text'
  content: string
  fontSize: number
  fontFamily: string
  color: string
  background: {
    color: string
    cornerRadius?: number
    paddingX?: number
    paddingY?: number
    offsetX?: number
    offsetY?: number
  }
  textAlign: 'left' | 'center' | 'right'
  fontWeight: 'normal' | 'bold'
  fontStyle: 'normal' | 'italic'
  textDecoration: 'none' | 'underline' | 'line-through'
  letterSpacing?: number
  lineHeight?: number
  hidden?: boolean
  transform: OpenCutTransform
  opacity: number
  blendMode?: string
  effects?: unknown[]
}

export interface OpenCutStickerElement extends OpenCutBaseElement {
  type: 'sticker'
  stickerId: string
  hidden?: boolean
  transform: OpenCutTransform
  opacity: number
  blendMode?: string
  effects?: unknown[]
}

export interface OpenCutEffectElement extends OpenCutBaseElement {
  type: 'effect'
  effectType: string
  params: Record<string, unknown>
}

export type OpenCutTimelineElement =
  | OpenCutAudioElement
  | OpenCutVideoElement
  | OpenCutImageElement
  | OpenCutTextElement
  | OpenCutStickerElement
  | OpenCutEffectElement

export type OpenCutCommand =
  | {
      type: 'insert_element'
      sceneId?: string
      trackId: string
      element: OpenCutTimelineElement
    }
  | {
      type: 'update_element_trim'
      sceneId?: string
      elementId: string
      trimStart: number
      trimEnd: number
      startTime?: number
      duration?: number
    }
  | {
      type: 'update_element_duration'
      sceneId?: string
      elementId: string
      duration: number
    }
  | {
      type: 'update_element_start_time'
      sceneId?: string
      elementId: string
      startTime: number
    }
  | {
      type: 'move_element'
      sceneId?: string
      sourceTrackId: string
      targetTrackId: string
      elementId: string
      startTime: number
    }
  | {
      type: 'split_elements'
      sceneId?: string
      elements: Array<{ trackId: string; elementId: string }>
      splitTime: number
      retainSide?: 'both' | 'left' | 'right'
    }
  | {
      type: 'delete_elements'
      sceneId?: string
      elements: Array<{ trackId: string; elementId: string }>
    }

export interface OpenCutComposeInput {
  trackId: string
  elementId: string
  resource_id: number
  start_sec?: number
  end_sec?: number
  duration_sec?: number
  trim_start_sec: number
  trim_end_sec: number
  timeline_start_sec: number
  timeline_duration_sec: number
  content_unit_id?: string | number
}

export function defaultOpenCutTransform(): OpenCutTransform {
  return {
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
  }
}
