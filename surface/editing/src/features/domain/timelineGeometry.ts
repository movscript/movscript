import { EDITING_TIMELINE_MAX_ZOOM, EDITING_TIMELINE_MIN_VISIBLE_MS } from './constants'

export function timelinePercent(valueMs: number, durationMs: number) {
  if (durationMs <= 0) return 0
  return Math.min(Math.max((valueMs / durationMs) * 100, 0), 100)
}

export function timelinePositionPercent(valueMs: number, visibleStartMs: number, visibleDurationMs: number) {
  if (visibleDurationMs <= 0) return 0
  return ((valueMs - visibleStartMs) / visibleDurationMs) * 100
}

export function timelineDurationPercent(durationMs: number, visibleDurationMs: number) {
  if (visibleDurationMs <= 0) return 0
  return (durationMs / visibleDurationMs) * 100
}

export function visibleTimelineDuration(durationMs: number, zoom: number) {
  const safeDurationMs = Math.max(durationMs, EDITING_TIMELINE_MIN_VISIBLE_MS)
  const safeZoom = clampTimelineZoom(zoom)
  return Math.max(EDITING_TIMELINE_MIN_VISIBLE_MS, Math.round(safeDurationMs / safeZoom))
}

export function clampTimelineZoom(value: number) {
  if (!Number.isFinite(value)) return 1
  return Math.min(Math.max(value, 1), EDITING_TIMELINE_MAX_ZOOM)
}

export function timelineMsFromPointer(element: HTMLElement, clientX: number, visibleStartMs: number, visibleDurationMs: number) {
  const rect = element.getBoundingClientRect()
  if (rect.width <= 0) return visibleStartMs
  const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1)
  return Math.round(visibleStartMs + ratio * Math.max(visibleDurationMs, 0))
}

export function clampTimelineRange(value: number, min: number, max: number) {
  const resolvedMin = Math.max(0, Math.round(min))
  const resolvedMax = Math.max(resolvedMin, Math.round(max))
  return Math.min(Math.max(Math.round(value), resolvedMin), resolvedMax)
}

export function clampTimelineMs(value: number, durationMs: number) {
  return clampTimelineRange(value, 0, Math.max(0, durationMs))
}
