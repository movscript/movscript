import { EDITING_CANVAS_PRESETS } from '../domain/constants'

export function colorWithAlpha(color: string, alpha: number) {
  const normalizedAlpha = Math.max(0, Math.min(1, alpha))
  if (/^#[0-9a-f]{6}$/i.test(color)) {
    const red = Number.parseInt(color.slice(1, 3), 16)
    const green = Number.parseInt(color.slice(3, 5), 16)
    const blue = Number.parseInt(color.slice(5, 7), 16)
    return `rgba(${red}, ${green}, ${blue}, ${normalizedAlpha.toFixed(2)})`
  }
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    const red = Number.parseInt(color[1] + color[1], 16)
    const green = Number.parseInt(color[2] + color[2], 16)
    const blue = Number.parseInt(color[3] + color[3], 16)
    return `rgba(${red}, ${green}, ${blue}, ${normalizedAlpha.toFixed(2)})`
  }
  return color
}

export function clampPreviewScale(value: number) {
  return Math.max(0.5, Math.min(2, Math.round(value * 10) / 10))
}

export function formatAspectRatio(width: number, height: number) {
  const normalizedWidth = Math.max(1, Math.round(width))
  const normalizedHeight = Math.max(1, Math.round(height))
  const divisor = greatestCommonDivisor(normalizedWidth, normalizedHeight)
  return `${Math.round(normalizedWidth / divisor)}:${Math.round(normalizedHeight / divisor)}`
}

export function activeCanvasPresetId(width: number, height: number) {
  const ratio = formatAspectRatio(width, height)
  return EDITING_CANVAS_PRESETS.find((preset) => preset.id === ratio)?.id
}

function greatestCommonDivisor(a: number, b: number): number {
  let x = Math.abs(a)
  let y = Math.abs(b)
  while (y > 0) {
    const next = x % y
    x = y
    y = next
  }
  return x || 1
}
