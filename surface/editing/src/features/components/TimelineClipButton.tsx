import { type PointerEvent as ReactPointerEvent } from 'react'
import { AudioLines, Film, Type } from 'lucide-react'

import type { ElectronMediaPipelineClip } from '@movscript/editing-surface/contracts'

import {
  resolveTimelineEditIntent,
  timelinePxToTime,
  type TimelineClipHitZone,
  type TimelineTool,
  type TimelineViewport,
} from '../domain/timelineInteraction'
import { timelineDurationPercent, timelinePositionPercent } from '../domain/timelineGeometry'
import type { TimelineClipEditMode, TimelineTrack } from '../domain/types'
import { formatDuration } from '../domain/utils'
import { TimelineClipFilmstrip } from './TimelineClipFilmstrip'
import './TimelineClipButton.css'

type TimelineClipButtonProps = {
  clip: ElectronMediaPipelineClip
  isLocked: boolean
  isLinkedSelected: boolean
  isSelected: boolean
  timelineTool: TimelineTool
  track: TimelineTrack
  viewport: TimelineViewport
  onClipEditPointerDown: (
    event: ReactPointerEvent<HTMLElement>,
    track: TimelineTrack,
    clip: ElectronMediaPipelineClip,
    mode: TimelineClipEditMode,
  ) => void
  onSelectClip: (clip: ElectronMediaPipelineClip) => void
  onSplitClipAt: (track: TimelineTrack, clip: ElectronMediaPipelineClip, splitAtMs: number) => void
}

export function TimelineClipButton({
  clip,
  isLocked,
  isLinkedSelected,
  isSelected,
  timelineTool,
  track,
  viewport,
  onClipEditPointerDown,
  onSelectClip,
  onSplitClipAt,
}: TimelineClipButtonProps) {
  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>, requestedHitZone: TimelineClipHitZone) => {
    if (isLocked) return
    const hitZone = requestedHitZone === 'body'
      ? clipBodyHitZoneFromPointer(event)
      : requestedHitZone
    const intent = resolveTimelineEditIntent(timelineTool, hitZone)
    if (intent.type === 'split_clip') {
      event.preventDefault()
      event.stopPropagation()
      const lane = event.currentTarget.closest('.editing-workspace-track-lane')
      if (!(lane instanceof HTMLElement)) return
      const rect = lane.getBoundingClientRect()
      const splitAtMs = timelinePxToTime(event.clientX - rect.left, viewport, rect.width)
      onSplitClipAt(track, clip, splitAtMs)
      return
    }
    const mode = intent.type === 'trim_start'
      ? 'trim-start'
      : intent.type === 'trim_end'
        ? 'trim-end'
        : 'move'
    onClipEditPointerDown(event, track, clip, mode)
  }
  const label = clip.asset?.label ?? clip.id
  const TypeIcon = clipTypeIcon(clip)
  const durationLabel = formatDuration(clip.durationMs)
  const speedLabel = clip.speed && clip.speed !== 1 ? `${clip.speed}x` : null
  const mediaInfo = clip.assetType === 'video'
    ? clip.muted ? '音频关闭' : '含音频'
    : clip.assetType === 'audio'
      ? '波形'
      : clip.assetType === 'image'
        ? '图片'
        : '文本'
  return (
    <button
      type="button"
      className="editing-workspace-clip"
      data-asset-type={clip.assetType}
      data-clip-layout={clip.assetType === 'video' || clip.assetType === 'image' ? 'visual' : clip.assetType === 'audio' ? 'audio' : 'text'}
      data-linked-selected={isLinkedSelected ? 'true' : undefined}
      data-selected={isSelected ? 'true' : undefined}
      data-timeline-tool={timelineTool}
      style={{
        left: `${timelinePositionPercent(clip.timelineStartMs, viewport.visibleStartMs, viewport.visibleDurationMs)}%`,
        width: `${Math.max(3, timelineDurationPercent(clip.durationMs, viewport.visibleDurationMs))}%`,
      }}
      onPointerDown={(event) => handlePointerDown(event, 'body')}
      onClick={() => onSelectClip(clip)}
    >
      <span
        className="editing-workspace-clip-trim editing-workspace-clip-trim--start"
        role="separator"
        aria-label="调整片段起点"
        onPointerDown={(event) => handlePointerDown(event, 'trim-start')}
      />
      <span className="editing-workspace-clip-content">
        <span className="editing-workspace-clip-titlebar">
          <span className="editing-workspace-clip-label">
            <TypeIcon size={11} />
            <span>{label}</span>
          </span>
          <span className="editing-workspace-clip-duration">{durationLabel}</span>
        </span>
        {clip.assetType === 'audio' ? (
          <span className="editing-workspace-clip-audio-body">
            <TimelineClipFilmstrip clip={clip} />
          </span>
        ) : clip.assetType === 'video' || clip.assetType === 'image' ? (
          <>
            <span className="editing-workspace-clip-visual-body">
              <TimelineClipFilmstrip clip={clip} />
            </span>
            <span className="editing-workspace-clip-footerbar">
              <span className="editing-workspace-clip-audio-state">
                {clip.assetType === 'video' ? <AudioLines size={11} /> : <Film size={11} />}
                <span>{speedLabel ?? mediaInfo}</span>
              </span>
            </span>
          </>
        ) : (
          <span className="editing-workspace-clip-text-body">
            <TimelineClipFilmstrip clip={clip} />
            <span>{speedLabel ?? mediaInfo}</span>
          </span>
        )}
      </span>
      <span
        className="editing-workspace-clip-trim editing-workspace-clip-trim--end"
        role="separator"
        aria-label="调整片段终点"
        onPointerDown={(event) => handlePointerDown(event, 'trim-end')}
      />
    </button>
  )
}

function clipTypeIcon(clip: ElectronMediaPipelineClip) {
  if (clip.assetType === 'audio') return AudioLines
  if (clip.assetType === 'subtitle' || clip.assetType === 'text') return Type
  return Film
}

function clipBodyHitZoneFromPointer(event: ReactPointerEvent<HTMLElement>): TimelineClipHitZone {
  const edgeHitWidthPx = 14
  const rect = event.currentTarget.getBoundingClientRect()
  if (rect.width <= edgeHitWidthPx * 2) return 'body'
  const x = event.clientX - rect.left
  if (x <= edgeHitWidthPx) return 'trim-start'
  if (x >= rect.width - edgeHitWidthPx) return 'trim-end'
  return 'body'
}
