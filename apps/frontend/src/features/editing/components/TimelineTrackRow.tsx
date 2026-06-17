import { type DragEvent, type PointerEvent as ReactPointerEvent } from 'react'

import type {
  ElectronMediaPipelineClip,
  ElectronMediaPipelineEditingProject,
} from '@/shared/contracts/electronApiMedia'

import type { TimelineTool, TimelineViewport } from '../domain/timelineInteraction'
import type { TimelineClipEditMode, TimelineTrack } from '../domain/types'
import { TimelineClipButton } from './TimelineClipButton'
import { TimelineTrackHeader } from './TimelineTrackHeader'

type TimelineTrackRowProps = {
  activeProject: ElectronMediaPipelineEditingProject | null
  linkedSelectedClipIds: string[]
  playheadPercent: number
  selectedClipId: string
  snapEnabled: boolean
  timelineTool: TimelineTool
  track: TimelineTrack
  viewport: TimelineViewport
  onClipEditPointerDown: (
    event: ReactPointerEvent<HTMLElement>,
    track: TimelineTrack,
    clip: ElectronMediaPipelineClip,
    mode: TimelineClipEditMode,
  ) => void
  onDeleteTrack: (trackId: string) => void
  onMoveTrack: (trackId: string, direction: -1 | 1) => void
  onSelectClip: (clip: ElectronMediaPipelineClip) => void
  onSplitClipAt: (track: TimelineTrack, clip: ElectronMediaPipelineClip, splitAtMs: number) => void
  onTimelinePointer: (event: ReactPointerEvent<HTMLElement>) => void
  onToggleTrackLocked: (trackId: string) => void
  onToggleTrackMuted: (trackId: string) => void
  onTrackDragOver: (event: DragEvent<HTMLElement>, track: TimelineTrack) => void
  onTrackDrop: (event: DragEvent<HTMLElement>, track: TimelineTrack) => void
}

export function TimelineTrackRow({
  activeProject,
  linkedSelectedClipIds,
  playheadPercent,
  selectedClipId,
  snapEnabled,
  timelineTool,
  track,
  viewport,
  onClipEditPointerDown,
  onDeleteTrack,
  onMoveTrack,
  onSelectClip,
  onSplitClipAt,
  onTimelinePointer,
  onToggleTrackLocked,
  onToggleTrackMuted,
  onTrackDragOver,
  onTrackDrop,
}: TimelineTrackRowProps) {
  const isLocked = Boolean(track.locked)
  return (
    <div className="editing-workspace-track-row" data-track-type={track.type}>
      <TimelineTrackHeader
        activeProject={activeProject}
        track={track}
        onDeleteTrack={onDeleteTrack}
        onMoveTrack={onMoveTrack}
        onToggleTrackLocked={onToggleTrackLocked}
        onToggleTrackMuted={onToggleTrackMuted}
      />
      <div
        className="editing-workspace-track-lane"
        data-snap-enabled={snapEnabled ? 'true' : undefined}
        data-track-id={track.id}
        data-track-locked={isLocked ? 'true' : undefined}
        onPointerDown={isLocked ? undefined : onTimelinePointer}
        onDragOver={(event) => {
          if (!isLocked) onTrackDragOver(event, track)
        }}
        onDrop={(event) => {
          if (!isLocked) onTrackDrop(event, track)
        }}
      >
        <span className="editing-workspace-playhead" style={{ left: `${playheadPercent}%` }} />
        {track.clips.length === 0 ? (
          <span className="editing-workspace-muted">empty</span>
        ) : track.clips.map((clip) => (
          <TimelineClipButton
            key={clip.id}
            clip={clip}
            isLocked={isLocked}
            isLinkedSelected={linkedSelectedClipIds.includes(clip.id)}
            isSelected={selectedClipId === clip.id}
            timelineTool={timelineTool}
            track={track}
            viewport={viewport}
            onClipEditPointerDown={onClipEditPointerDown}
            onSelectClip={onSelectClip}
            onSplitClipAt={onSplitClipAt}
          />
        ))}
      </div>
    </div>
  )
}
