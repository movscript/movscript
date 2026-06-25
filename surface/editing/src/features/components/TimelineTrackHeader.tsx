import {
  AudioLines,
  ChevronDown,
  ChevronUp,
  Film,
  Lock,
  LockOpen,
  Rows3,
  Trash2,
  Type,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { Button } from '@movscript/ui/primitives'

import type { ElectronMediaPipelineEditingProject } from '@movscript/editing-surface/contracts'

import {
  canDeleteTimelineTrack,
  canMoveTimelineTrack,
  trackDisplayName,
} from '../domain/tracks'
import type { TimelineTrack } from '../domain/types'
import './TimelineTrackHeader.css'

type TimelineTrackHeaderProps = {
  activeProject: ElectronMediaPipelineEditingProject | null
  track: TimelineTrack
  onDeleteTrack: (trackId: string) => void
  onMoveTrack: (trackId: string, direction: -1 | 1) => void
  onToggleTrackLocked: (trackId: string) => void
  onToggleTrackMuted: (trackId: string) => void
}

export function TimelineTrackHeader({
  activeProject,
  track,
  onDeleteTrack,
  onMoveTrack,
  onToggleTrackLocked,
  onToggleTrackMuted,
}: TimelineTrackHeaderProps) {
  const muted = Boolean(track.muted)
  const locked = Boolean(track.locked)
  const TypeIcon = trackTypeIcon(track)
  const clipCount = track.clips.length
  return (
    <div
      className="editing-workspace-track-header"
      data-locked={locked ? 'true' : undefined}
      data-muted={muted ? 'true' : undefined}
    >
      <div className="editing-workspace-track-header-main">
        <div className="editing-workspace-track-identity">
          <span className="editing-workspace-track-code">{trackShortCode(track)}</span>
          <span className="editing-workspace-track-title">
            {track.name ?? trackDisplayName(track)}
          </span>
        </div>
        <div className="editing-workspace-track-controls editing-workspace-track-controls--primary">
          <Button
            type="button"
            size="icon-xs"
            variant={locked ? 'soft' : 'ghost'}
            aria-label={`${locked ? '解锁' : '锁定'} ${trackDisplayName(track)}`}
            aria-pressed={locked}
            title={locked ? '解锁轨道' : '锁定轨道'}
            disabled={!activeProject}
            data-active={locked ? 'true' : undefined}
            onClick={() => onToggleTrackLocked(track.id)}
          >
            {locked ? <Lock size={12} /> : <LockOpen size={12} />}
          </Button>
          <Button
            type="button"
            size="icon-xs"
            variant={muted ? 'soft' : 'ghost'}
            aria-label={`${muted ? '取消静音' : '静音'} ${trackDisplayName(track)}`}
            aria-pressed={muted}
            title={muted ? '取消静音' : '静音轨道'}
            disabled={!activeProject}
            data-active={muted ? 'true' : undefined}
            onClick={() => onToggleTrackMuted(track.id)}
          >
            {muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
          </Button>
        </div>
      </div>
      <div className="editing-workspace-track-header-sub">
        <div className="editing-workspace-track-meta" aria-label={`${trackDisplayName(track)} 轨道状态`}>
          <span className="editing-workspace-track-chip" title={trackRoleLabel(track)}>
            <TypeIcon size={11} />
          </span>
          <span className="editing-workspace-track-chip editing-workspace-track-chip--count" title={`${clipCount} 个片段`}>
            <Rows3 size={11} />
            <span>{clipCount}</span>
          </span>
        </div>
        <div className="editing-workspace-track-controls editing-workspace-track-controls--secondary">
          <Button type="button" size="icon-xs" variant="ghost" aria-label={`提升 ${trackDisplayName(track)} 层级`} title="上移轨道" disabled={!activeProject || !canMoveTimelineTrack(activeProject, track, -1)} onClick={() => onMoveTrack(track.id, -1)}>
            <ChevronUp size={12} />
          </Button>
          <Button type="button" size="icon-xs" variant="ghost" aria-label={`降低 ${trackDisplayName(track)} 层级`} title="下移轨道" disabled={!activeProject || !canMoveTimelineTrack(activeProject, track, 1)} onClick={() => onMoveTrack(track.id, 1)}>
            <ChevronDown size={12} />
          </Button>
          <Button type="button" size="icon-xs" variant="ghost" intent="danger" aria-label={`删除 ${trackDisplayName(track)}`} title="删除轨道" disabled={!activeProject || track.clips.length > 0 || !canDeleteTimelineTrack(activeProject, track)} onClick={() => onDeleteTrack(track.id)}>
            <Trash2 size={12} />
          </Button>
        </div>
      </div>
    </div>
  )
}

function trackShortCode(track: TimelineTrack) {
  const index = Number.parseInt(track.id.match(/_(\d+)$/)?.[1] ?? '0', 10) + 1
  if (track.type === 'audio') return `A${index}`
  if (track.type === 'subtitle' || track.type === 'text') return `S${index}`
  return `V${index}`
}

function trackRoleLabel(track: TimelineTrack) {
  if (track.type === 'audio') return 'Audio'
  if (track.type === 'subtitle' || track.type === 'text') return 'Titles'
  if (track.type === 'image') return 'Image'
  return 'Video'
}

function trackTypeIcon(track: TimelineTrack) {
  if (track.type === 'audio') return AudioLines
  if (track.type === 'subtitle' || track.type === 'text') return Type
  return Film
}
