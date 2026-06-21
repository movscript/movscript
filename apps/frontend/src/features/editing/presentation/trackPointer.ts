import type { ElectronMediaPipelineEditingProject } from '@/shared/contracts/electronApiMedia'
import type { TimelineTrack } from '@/features/editing/domain/types'

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
