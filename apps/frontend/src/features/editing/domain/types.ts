import type { ElectronAPI } from '@/shared/contracts/electronApi'
import type { ElectronMediaPipelineClip, ElectronMediaPipelineEditingProject } from '@/shared/contracts/electronApiMedia'

export type TimelineClipEditMode = 'move' | 'trim-start' | 'trim-end'
export type TimelineTrackType = ElectronMediaPipelineEditingProject['timeline']['tracks'][number]['type']
export type TimelineTrack = ElectronMediaPipelineEditingProject['timeline']['tracks'][number]
export type PreviewMode = 'asset' | 'timeline' | 'clip'

export type SaveState =
  | { status: 'idle'; message?: string }
  | { status: 'saving'; message?: string }
  | { status: 'saved'; message: string }
  | { status: 'conflict'; message: string }
  | { status: 'error'; message: string }

export type EditingMediaAPI = Pick<
  ElectronAPI,
  | 'openFile'
  | 'revealFileInFolder'
  | 'saveMediaEditingProject'
  | 'getMediaEditingProject'
  | 'createMediaPipelineTask'
  | 'getMediaPipelineTask'
  | 'onMediaPipelineTaskEvent'
  | 'onMediaEditingProjectEvent'
>

export type ClipForm = {
  assetId: string
  trackId: string
  timelineStartMs: string
  durationMs: string
  sourceStartMs: string
  fit: NonNullable<ElectronMediaPipelineClip['fit']>
}

export const emptyClipForm: ClipForm = {
  assetId: '',
  trackId: 'track_video_0',
  timelineStartMs: '0',
  durationMs: '5000',
  sourceStartMs: '0',
  fit: 'contain',
}

export type EditingLayoutSizes = {
  libraryWidth: number
  inspectorWidth: number
  timelineHeight: number
}
