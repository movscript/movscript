import type { ShotLibraryEntry } from '@/features/shot-library/domain/shotReferenceLibrary'

export function shotReferenceAspectRatio(entry: ShotLibraryEntry): string {
  const fromAspectRatio = parseAspectRatio(entry.executionDetails.aspectRatio)
  if (fromAspectRatio) return fromAspectRatio
  const fromResolution = parseResolutionAspectRatio(entry.executionDetails.resolution)
  if (fromResolution) return fromResolution
  return '16 / 9'
}

export function normalizedCssAspectRatio(width: number, height: number): string | undefined {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return undefined
  const ratio = width / height
  if (ratio < 0.25 || ratio > 4) return undefined
  return `${width} / ${height}`
}

export function videoElementAspectRatio(video: HTMLVideoElement): string | undefined {
  return normalizedCssAspectRatio(video.videoWidth, video.videoHeight)
}

export function seekVideoToTime(video: HTMLVideoElement, timeSec: number) {
  if (!Number.isFinite(timeSec)) return
  const duration = Number.isFinite(video.duration) ? video.duration : undefined
  const target = duration === undefined ? timeSec : Math.min(timeSec, Math.max(0, duration - 0.05))
  if (Math.abs(video.currentTime - target) > 0.15) video.currentTime = target
}

function parseAspectRatio(value: string | undefined): string | undefined {
  const match = value?.trim().match(/^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/)
  if (!match) return undefined
  return normalizedCssAspectRatio(Number(match[1]), Number(match[2]))
}

function parseResolutionAspectRatio(value: string | undefined): string | undefined {
  const match = value?.trim().match(/^(\d+)\s*x\s*(\d+)$/i)
  if (!match) return undefined
  return normalizedCssAspectRatio(Number(match[1]), Number(match[2]))
}
