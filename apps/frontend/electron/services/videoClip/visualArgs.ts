import type { VideoClipInput } from './types'

export function buildCropFilter(input: Pick<VideoClipInput, 'cropLeftPercent' | 'cropRightPercent' | 'cropTopPercent' | 'cropBottomPercent'>): string {
  const left = normalizeCropPercent(input.cropLeftPercent)
  const right = normalizeCropPercent(input.cropRightPercent)
  const top = normalizeCropPercent(input.cropTopPercent)
  const bottom = normalizeCropPercent(input.cropBottomPercent)
  if (left === 0 && right === 0 && top === 0 && bottom === 0) return ''
  const width = Math.max(10, 100 - left - right)
  const height = Math.max(10, 100 - top - bottom)
  return `crop=iw*${(width / 100).toFixed(4)}:ih*${(height / 100).toFixed(4)}:iw*${(left / 100).toFixed(4)}:ih*${(top / 100).toFixed(4)}`
}

export function normalizeTimelineSpeed(speed: number | undefined): number {
  if (typeof speed !== 'number' || !Number.isFinite(speed) || speed <= 0) return 1
  return Math.max(0.25, Math.min(4, speed))
}

export function hasVisualCrop(input: Pick<VideoClipInput, 'cropLeftPercent' | 'cropRightPercent' | 'cropTopPercent' | 'cropBottomPercent'>): boolean {
  return normalizeCropPercent(input.cropLeftPercent) > 0
    || normalizeCropPercent(input.cropRightPercent) > 0
    || normalizeCropPercent(input.cropTopPercent) > 0
    || normalizeCropPercent(input.cropBottomPercent) > 0
}

function normalizeCropPercent(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.min(45, Math.max(0, Math.round(value)))
}
