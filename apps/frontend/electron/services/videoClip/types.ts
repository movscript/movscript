export interface VideoClipInput {
  sourcePath?: string
  sourceData?: ArrayBuffer | Uint8Array
  sourceName?: string
  startMs: number
  endMs: number
  outputName?: string
  mode?: 'fast' | 'accurate'
  speed?: number
  fadeInMs?: number
  fadeOutMs?: number
  cropLeftPercent?: number
  cropRightPercent?: number
  cropTopPercent?: number
  cropBottomPercent?: number
}

export interface VideoClipResult {
  ok: boolean
  outputPath?: string
  outputName?: string
  mode?: 'fast' | 'accurate'
  fallbackApplied?: boolean
  data?: Uint8Array
  size?: number
  mimeType?: string
  error?: string
  code?: string
  missingFilters?: string[]
}

export interface VideoTimelineExportClipInput {
  sourceData?: ArrayBuffer | Uint8Array
  sourceName?: string
  startMs: number
  endMs: number
  timelineStartMs?: number
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
}

export interface VideoTimelineExportCaptionInput {
  startMs: number
  endMs: number
  text: string
  layerIndex?: number
  fontSize?: number
  yPercent?: number
  textColor?: string
  boxOpacityPercent?: number
}

export interface VideoTimelineExportAudioInput {
  sourceData?: ArrayBuffer | Uint8Array
  sourceName?: string
  startMs: number
  endMs: number
  timelineStartMs: number
  volume?: number
  fadeInMs?: number
  fadeOutMs?: number
}

export interface VideoTimelineExportOverlayInput {
  sourceData?: ArrayBuffer | Uint8Array
  sourceName?: string
  sourceKind?: 'image' | 'video'
  startMs: number
  endMs: number
  sourceStartMs?: number
  sourceEndMs?: number
  layerIndex?: number
  fadeInMs?: number
  fadeOutMs?: number
  cropLeftPercent?: number
  cropRightPercent?: number
  cropTopPercent?: number
  cropBottomPercent?: number
  xPercent?: number
  yPercent?: number
  scalePercent?: number
  opacityPercent?: number
}

export interface VideoTimelineExportInput {
  clips: VideoTimelineExportClipInput[]
  captions?: VideoTimelineExportCaptionInput[]
  audioClips?: VideoTimelineExportAudioInput[]
  overlays?: VideoTimelineExportOverlayInput[]
  outputName?: string
}

export interface VideoClipStatus {
  available: boolean
  path?: string
  version?: string
  error?: string
  code?: 'FFMPEG_NOT_FOUND' | 'FFMPEG_UNAVAILABLE'
  expectedBundledPath?: string
  platform?: NodeJS.Platform
  arch?: string
}

export interface VideoShotCutInput {
  sourceData?: ArrayBuffer | Uint8Array
  sourceName?: string
  durationSec?: number
  sceneThreshold?: number
  minShotDurationSec?: number
  maxShotDurationSec?: number
}

export interface VideoShotCutSegment {
  startSec: number
  endSec: number
}

export interface VideoShotCutResult {
  ok: boolean
  strategy?: 'scene_detection' | 'even'
  shots?: VideoShotCutSegment[]
  error?: string
  code?: string
}
