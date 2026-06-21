export type ElectronTimelineVideoInput = {
  clips: Array<{
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
  }>
  captions?: Array<{
    startMs: number
    endMs: number
    text: string
    layerIndex?: number
    fontSize?: number
    yPercent?: number
    textColor?: string
    boxOpacityPercent?: number
  }>
  audioClips?: Array<{
    sourceData?: ArrayBuffer | Uint8Array
    sourceName?: string
    startMs: number
    endMs: number
    timelineStartMs: number
    volume?: number
    speed?: number
    fadeInMs?: number
    fadeOutMs?: number
  }>
  overlays?: Array<{
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
  }>
  outputName?: string
  width?: number
  height?: number
  background?: string
}

export type ElectronTimelineVideoResult = {
  ok: boolean
  outputName?: string
  data?: Uint8Array
  size?: number
  mimeType?: string
  error?: string
  code?: string
  missingFilters?: string[]
}
