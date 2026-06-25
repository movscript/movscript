import type { ElectronMediaPipelineEditingProject } from '@movscript/editing-surface/contracts'
import type { TimelineTrack } from '../domain/types'

export function trackFromPointer(
  project: ElectronMediaPipelineEditingProject,
  clientX: number,
  clientY: number,
  fallbackTrack: TimelineTrack,
) {
  if (typeof document === 'undefined') return fallbackTrack
  const element = document.elementFromPoint(clientX, clientY)
  const lane = element?.closest('.editing-workspace-track-lane')
  if (!(lane instanceof HTMLElement)) return fallbackTrack
  const trackId = lane.dataset.trackId
  return project.timeline.tracks.find((track) => track.id === trackId) ?? fallbackTrack
}
