import type { MediaPipelineProcessOutput } from './ffmpegRunner'

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
  fit?: 'crop' | 'contain' | 'cover' | 'none'
  cropLeftPercent?: number
  cropRightPercent?: number
  cropTopPercent?: number
  cropBottomPercent?: number
  xPercent?: number
  yPercent?: number
  scalePercent?: number
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
  sourcePath?: string
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
  fit?: 'crop' | 'contain' | 'cover' | 'none'
  cropLeftPercent?: number
  cropRightPercent?: number
  cropTopPercent?: number
  cropBottomPercent?: number
  xPercent?: number
  yPercent?: number
  scalePercent?: number
}

export interface VideoTimelineExportCaptionInput {
  startMs: number
  endMs: number
  text: string
  layerIndex?: number
  fontSize?: number
  fontFamily?: string
  yPercent?: number
  textColor?: string
  backgroundColor?: string
  boxOpacityPercent?: number
  align?: 'left' | 'center' | 'right'
  renderer?: 'drawtext' | 'ass'
}

export interface VideoTimelineExportSubtitleFileInput {
  sourcePath?: string
  sourceData?: ArrayBuffer | Uint8Array
  sourceName?: string
  format?: 'srt' | 'vtt' | 'ass' | 'ssa'
}

export interface VideoTimelineExportAudioInput {
  sourcePath?: string
  sourceData?: ArrayBuffer | Uint8Array
  sourceName?: string
  startMs: number
  endMs: number
  timelineStartMs: number
  volume?: number
  speed?: number
  fadeInMs?: number
  fadeOutMs?: number
}

export interface VideoTimelineExportOverlayInput {
  sourcePath?: string
  sourceData?: ArrayBuffer | Uint8Array
  sourceName?: string
  sourceKind?: 'image' | 'video'
  startMs: number
  endMs: number
  sourceStartMs?: number
  sourceEndMs?: number
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
  xPercent?: number
  yPercent?: number
  scalePercent?: number
  opacityPercent?: number
}

export interface VideoTimelineExportInput {
  clips: VideoTimelineExportClipInput[]
  captions?: VideoTimelineExportCaptionInput[]
  subtitleFiles?: VideoTimelineExportSubtitleFileInput[]
  audioClips?: VideoTimelineExportAudioInput[]
  overlays?: VideoTimelineExportOverlayInput[]
  outputName?: string
  width?: number
  height?: number
  background?: string
  signal?: AbortSignal
  onFFmpegOutput?: (output: MediaPipelineProcessOutput) => void
}
