import type { ElectronMediaPipelineEditingProject } from '@/shared/contracts/electronApiMedia'

import { EDITING_TIMELINE_SNAP_THRESHOLD_MS } from './constants'
import { clampTimelineMs, clampTimelineZoom, visibleTimelineDuration } from './timelineGeometry'

export type TimelineTool = 'select' | 'trim-start' | 'trim-end' | 'split'

export type TimelineClipHitZone = 'body' | 'trim-start' | 'trim-end'

export type TimelineEditIntent =
  | { type: 'move_clip' }
  | { type: 'trim_start' }
  | { type: 'trim_end' }
  | { type: 'split_clip' }
  | { type: 'seek_playhead' }

export type TimelineViewport = {
  durationMs: number
  visibleStartMs: number
  visibleDurationMs: number
  zoom: number
}

export type TimelineZoomResult = {
  zoom: number
  visibleStartMs: number
  visibleDurationMs: number
}

export type TimelineSnapResult = {
  valueMs: number
  snapped: boolean
  snapPointMs?: number
}

export type TimelineSnapPoint = {
  valueMs: number
  kind: 'timeline_start' | 'clip_start' | 'clip_end' | 'playhead' | 'marker'
  trackId?: string
  clipId?: string
}

export function createTimelineViewport(durationMs: number, zoom: number, visibleStartMs: number): TimelineViewport {
  const resolvedDurationMs = Math.max(0, Math.round(durationMs))
  const resolvedZoom = clampTimelineZoom(zoom)
  const visibleDurationMs = visibleTimelineDuration(resolvedDurationMs, resolvedZoom)
  return {
    durationMs: resolvedDurationMs,
    visibleStartMs: clampTimelineMs(visibleStartMs, Math.max(0, resolvedDurationMs - visibleDurationMs)),
    visibleDurationMs,
    zoom: resolvedZoom,
  }
}

export function timelineTimeToPx(valueMs: number, viewport: TimelineViewport, widthPx: number) {
  if (viewport.visibleDurationMs <= 0 || widthPx <= 0) return 0
  return ((valueMs - viewport.visibleStartMs) / viewport.visibleDurationMs) * widthPx
}

export function timelinePxToTime(px: number, viewport: TimelineViewport, widthPx: number) {
  if (widthPx <= 0) return viewport.visibleStartMs
  const ratio = Math.min(Math.max(px / widthPx, 0), 1)
  return Math.round(viewport.visibleStartMs + ratio * viewport.visibleDurationMs)
}

export function zoomTimelineViewportAtRatio(
  viewport: TimelineViewport,
  ratio: number,
  zoomFactor: number,
): TimelineZoomResult {
  const resolvedRatio = Math.min(Math.max(ratio, 0), 1)
  const anchorMs = viewport.visibleStartMs + resolvedRatio * viewport.visibleDurationMs
  const nextZoom = clampTimelineZoom(viewport.zoom * zoomFactor)
  const nextVisibleDurationMs = visibleTimelineDuration(viewport.durationMs, nextZoom)
  return {
    zoom: nextZoom,
    visibleDurationMs: nextVisibleDurationMs,
    visibleStartMs: clampTimelineMs(
      anchorMs - resolvedRatio * nextVisibleDurationMs,
      Math.max(0, viewport.durationMs - nextVisibleDurationMs),
    ),
  }
}

export function collectTimelineSnapPoints(
  project: ElectronMediaPipelineEditingProject,
  options: {
    ignoreClipId?: string
    playheadMs?: number
    extraSnapPoints?: number[]
  } = {},
): TimelineSnapPoint[] {
  const points: TimelineSnapPoint[] = [{ valueMs: 0, kind: 'timeline_start' }]
  if (options.playheadMs !== undefined) points.push({ valueMs: options.playheadMs, kind: 'playhead' })
  for (const valueMs of options.extraSnapPoints ?? []) points.push({ valueMs, kind: 'marker' })
  for (const track of project.timeline.tracks) {
    for (const clip of track.clips) {
      if (clip.id === options.ignoreClipId) continue
      points.push({ valueMs: clip.timelineStartMs, kind: 'clip_start', trackId: track.id, clipId: clip.id })
      points.push({ valueMs: clip.timelineStartMs + clip.durationMs, kind: 'clip_end', trackId: track.id, clipId: clip.id })
    }
  }
  return points
}

export function resolveTimelineSnap(
  valueMs: number,
  points: TimelineSnapPoint[],
  thresholdMs = EDITING_TIMELINE_SNAP_THRESHOLD_MS,
): TimelineSnapResult {
  let closestPoint: TimelineSnapPoint | undefined
  let closestDistanceMs = Math.max(0, thresholdMs) + 1
  for (const point of points) {
    const distanceMs = Math.abs(point.valueMs - valueMs)
    if (distanceMs < closestDistanceMs) {
      closestPoint = point
      closestDistanceMs = distanceMs
    }
  }
  if (closestPoint && closestDistanceMs <= thresholdMs) {
    return { valueMs: Math.max(0, Math.round(closestPoint.valueMs)), snapped: true, snapPointMs: closestPoint.valueMs }
  }
  return { valueMs: Math.max(0, Math.round(valueMs)), snapped: false }
}

export function resolveTimelineEditIntent(
  tool: TimelineTool,
  hitZone: TimelineClipHitZone | 'ruler' | 'lane',
): TimelineEditIntent {
  if (tool === 'split') return hitZone === 'body' ? { type: 'split_clip' } : { type: 'seek_playhead' }
  if (hitZone === 'trim-start') return { type: 'trim_start' }
  if (hitZone === 'trim-end') return { type: 'trim_end' }
  if (tool === 'trim-start' && hitZone === 'body') return { type: 'trim_start' }
  if (tool === 'trim-end' && hitZone === 'body') return { type: 'trim_end' }
  if (hitZone === 'ruler' || hitZone === 'lane') return { type: 'seek_playhead' }
  return { type: 'move_clip' }
}
