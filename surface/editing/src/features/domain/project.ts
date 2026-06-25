import type { ElectronMediaPipelineEditingProject } from '@movscript/editing-surface/contracts'

import { EDITING_CANVAS_MAX_SIZE, EDITING_CANVAS_MIN_SIZE } from './constants'
import { clampNumber } from './utils'

export function normalizeEditingProjectCanvas(project: ElectronMediaPipelineEditingProject): ElectronMediaPipelineEditingProject {
  return {
    ...project,
    timeline: normalizeTimelineCanvas(project.timeline),
  }
}

export function normalizeTimelineCanvas(
  timeline: ElectronMediaPipelineEditingProject['timeline'],
): ElectronMediaPipelineEditingProject['timeline'] {
  return {
    ...timeline,
    width: clampNumber(timeline.width, EDITING_CANVAS_MIN_SIZE, EDITING_CANVAS_MAX_SIZE, 1920),
    height: clampNumber(timeline.height, EDITING_CANVAS_MIN_SIZE, EDITING_CANVAS_MAX_SIZE, 1080),
    fps: clampNumber(timeline.fps, 1, 120, 24),
    background: normalizeCanvasBackground(timeline.background),
  }
}

export function normalizeCanvasBackground(value: unknown) {
  const background = typeof value === 'string' ? value.trim() : ''
  if (/^#[0-9a-f]{6}$/i.test(background)) return background
  if (/^#[0-9a-f]{3}$/i.test(background)) {
    const [, red, green, blue] = background
    return `#${red}${red}${green}${green}${blue}${blue}`
  }
  return '#000000'
}

export function refreshTimelineDuration(project: ElectronMediaPipelineEditingProject): ElectronMediaPipelineEditingProject {
  const durationMs = project.timeline.tracks.reduce((maxDuration, track) => {
    const trackDuration = track.clips.reduce((maxClipDuration, clip) => {
      return Math.max(maxClipDuration, clip.timelineStartMs + clip.durationMs)
    }, 0)
    return Math.max(maxDuration, trackDuration)
  }, 0)
  return {
    ...project,
    timeline: {
      ...project.timeline,
      durationMs,
    },
  }
}
