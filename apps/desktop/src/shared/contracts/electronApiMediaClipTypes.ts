export type ElectronVideoClipInput = {
  sourceData?: ArrayBuffer | Uint8Array
  sourcePath?: string
  sourceName?: string
  startMs: number
  endMs: number
  outputName?: string
  mode?: 'fast' | 'accurate'
  fadeInMs?: number
  fadeOutMs?: number
}

export type ElectronVideoClipResult = {
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

export type ElectronVideoClipStatus = {
  available: boolean
  path?: string
  version?: string
  error?: string
  code?: 'FFMPEG_NOT_FOUND' | 'FFMPEG_UNAVAILABLE'
  expectedBundledPath?: string
  platform?: string
  arch?: string
}

export type ElectronShotCutInput = {
  sourceData?: ArrayBuffer | Uint8Array
  sourceName?: string
  durationSec?: number
  sceneThreshold?: number
  minShotDurationSec?: number
  maxShotDurationSec?: number
}

export type ElectronShotCutSegment = {
  startSec: number
  endSec: number
}

export type ElectronShotCutResult = {
  ok: boolean
  strategy?: 'scene_detection' | 'even'
  shots?: ElectronShotCutSegment[]
  error?: string
  code?: string
}
