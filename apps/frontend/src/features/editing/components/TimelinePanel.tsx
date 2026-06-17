import { useRef, type ComponentProps, type DragEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react'
import {
  AudioLines,
  Film,
  Link2,
  Magnet,
  MousePointer2,
  MoveHorizontal,
  Plus,
  Scissors,
  Type,
} from 'lucide-react'
import { PanelResizeHandle } from '@movscript/ui/layout'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@movscript/ui/primitives'

import type {
  ElectronMediaPipelineClip,
  ElectronMediaPipelineEditingProject,
} from '@/shared/contracts/electronApiMedia'

import {
  type TimelineTool,
  type TimelineViewport,
} from '../domain/timelineInteraction'
import {
  defaultTimelineTracks,
} from '../domain/tracks'
import type { TimelineClipEditMode, TimelineTrack, TimelineTrackType } from '../domain/types'
import { formatDuration } from '../domain/utils'
import { TimelineTrackRow } from './TimelineTrackRow'

type TimelinePanelProps = {
  activeProject: ElectronMediaPipelineEditingProject | null
  linkedSelectionEnabled: boolean
  linkedSelectedClipIds: string[]
  playheadMs: number
  playheadPercent: number
  resizeHandleProps: ComponentProps<typeof PanelResizeHandle>
  rippleEditingEnabled: boolean
  selectedClipId: string
  snapEnabled: boolean
  timelineTool: TimelineTool
  timelineViewport: TimelineViewport
  onAddTrack: (type: TimelineTrackType) => void
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
  onTimelineToolChange: (tool: TimelineTool) => void
  onTimelineWheel: (event: ReactWheelEvent<HTMLElement>) => void
  onToggleLinkedSelection: () => void
  onToggleRippleEditing: () => void
  onToggleSnap: () => void
  onToggleTrackLocked: (trackId: string) => void
  onToggleTrackMuted: (trackId: string) => void
  onTrackDragOver: (event: DragEvent<HTMLElement>, track: TimelineTrack) => void
  onTrackDrop: (event: DragEvent<HTMLElement>, track: TimelineTrack) => void
  onTracksDragOver: (event: DragEvent<HTMLElement>) => void
  onTracksDrop: (event: DragEvent<HTMLElement>) => void
}

const timelineTools: Array<{ id: TimelineTool; label: string; icon: typeof MousePointer2; shortLabel?: string }> = [
  { id: 'select', label: '选择', icon: MousePointer2 },
  { id: 'trim-start', label: '左剪切', icon: MoveHorizontal, shortLabel: '左剪' },
  { id: 'trim-end', label: '右剪切', icon: MoveHorizontal, shortLabel: '右剪' },
  { id: 'split', label: '中间分割', icon: Scissors, shortLabel: '分割' },
]

export function TimelinePanel({
  activeProject,
  linkedSelectionEnabled,
  linkedSelectedClipIds,
  playheadMs,
  playheadPercent,
  resizeHandleProps,
  rippleEditingEnabled,
  selectedClipId,
  snapEnabled,
  timelineTool,
  timelineViewport,
  onAddTrack,
  onClipEditPointerDown,
  onDeleteTrack,
  onMoveTrack,
  onSelectClip,
  onSplitClipAt,
  onTimelinePointer,
  onTimelineToolChange,
  onTimelineWheel,
  onToggleLinkedSelection,
  onToggleRippleEditing,
  onToggleSnap,
  onToggleTrackLocked,
  onToggleTrackMuted,
  onTrackDragOver,
  onTrackDrop,
  onTracksDragOver,
  onTracksDrop,
}: TimelinePanelProps) {
  const trackStackRef = useRef<HTMLDivElement | null>(null)
  const tracks = activeProject ? activeProject.timeline.tracks : defaultTimelineTracks()
  const handleTimelineShellWheel = (event: ReactWheelEvent<HTMLElement>) => {
    if (event.deltaY === 0) return
    if ((event.target as Element | null)?.closest('.editing-workspace-ruler-lane')) return
    const trackStack = trackStackRef.current
    if (!trackStack || trackStack.scrollHeight <= trackStack.clientHeight) return
    event.preventDefault()
    trackStack.scrollTop += event.deltaY
  }

  return (
    <section className="editing-workspace-timeline" aria-label="时间线" onWheel={handleTimelineShellWheel}>
      <PanelResizeHandle
        className="editing-workspace-resize-handle editing-workspace-resize-handle--timeline"
        side="left"
        {...resizeHandleProps}
      />
      <TimelineCommandBar
        linkedSelectionEnabled={linkedSelectionEnabled}
        rippleEditingEnabled={rippleEditingEnabled}
        snapEnabled={snapEnabled}
        timelineTool={timelineTool}
        onTimelineToolChange={onTimelineToolChange}
        onToggleLinkedSelection={onToggleLinkedSelection}
        onToggleRippleEditing={onToggleRippleEditing}
        onToggleSnap={onToggleSnap}
      />
      <TimelineRuler
        activeProject={activeProject}
        playheadPercent={playheadPercent}
        viewport={timelineViewport}
        onAddTrack={onAddTrack}
        onPointerDown={onTimelinePointer}
        onWheel={onTimelineWheel}
      />
      <div
        ref={trackStackRef}
        className="editing-workspace-track-stack"
        onDragOver={onTracksDragOver}
        onDrop={onTracksDrop}
      >
        {activeProject && activeProject.timeline.tracks.length === 0 ? (
          <div className="editing-workspace-empty-track-drop">
            <Film size={18} />
            <span>拖入素材后自动创建第一条轨道</span>
          </div>
        ) : null}
        {tracks.map((track) => (
          <TimelineTrackRow
            key={track.id}
            activeProject={activeProject}
            linkedSelectedClipIds={linkedSelectedClipIds}
            playheadPercent={playheadPercent}
            selectedClipId={selectedClipId}
            snapEnabled={snapEnabled}
            timelineTool={timelineTool}
            track={track}
            viewport={timelineViewport}
            onClipEditPointerDown={onClipEditPointerDown}
            onDeleteTrack={onDeleteTrack}
            onMoveTrack={onMoveTrack}
            onSelectClip={onSelectClip}
            onSplitClipAt={onSplitClipAt}
            onTimelinePointer={onTimelinePointer}
            onToggleTrackLocked={onToggleTrackLocked}
            onToggleTrackMuted={onToggleTrackMuted}
            onTrackDragOver={onTrackDragOver}
            onTrackDrop={onTrackDrop}
          />
        ))}
      </div>
    </section>
  )
}

function TimelineCommandBar({
  linkedSelectionEnabled,
  rippleEditingEnabled,
  snapEnabled,
  timelineTool,
  onTimelineToolChange,
  onToggleLinkedSelection,
  onToggleRippleEditing,
  onToggleSnap,
}: Pick<TimelinePanelProps,
  | 'linkedSelectionEnabled'
  | 'rippleEditingEnabled'
  | 'snapEnabled'
  | 'timelineTool'
  | 'onTimelineToolChange'
  | 'onToggleLinkedSelection'
  | 'onToggleRippleEditing'
  | 'onToggleSnap'
>) {
  return (
    <div className="editing-workspace-timeline-commandbar">
      <div className="editing-workspace-timeline-tools" aria-label="编辑工具">
        {timelineTools.map((tool) => {
          const Icon = tool.icon
          return (
            <Button
              key={tool.id}
              type="button"
              size={tool.shortLabel ? 'sm' : 'icon-sm'}
              variant={timelineTool === tool.id ? 'solid' : 'ghost'}
              className={tool.shortLabel ? 'editing-workspace-timeline-tool--labeled gap-1' : undefined}
              aria-label={tool.label}
              title={tool.label}
              onClick={() => onTimelineToolChange(tool.id)}
            >
              <Icon size={14} />
              {tool.shortLabel ? <span>{tool.shortLabel}</span> : null}
            </Button>
          )
        })}
      </div>
      <div className="editing-workspace-timeline-toggles" aria-label="时间线开关">
        <Button type="button" size="icon-sm" variant={snapEnabled ? 'soft' : 'ghost'} aria-label="吸附" title="吸附" onClick={onToggleSnap}>
          <Magnet size={14} />
        </Button>
        <Button type="button" size="icon-sm" variant={linkedSelectionEnabled ? 'soft' : 'ghost'} aria-label="链接选择" title="链接选择" onClick={onToggleLinkedSelection}>
          <Link2 size={14} />
        </Button>
        <Button type="button" size="icon-sm" variant={rippleEditingEnabled ? 'soft' : 'ghost'} aria-label="涟漪编辑" title="涟漪编辑" onClick={onToggleRippleEditing}>
          <MoveHorizontal size={14} />
        </Button>
      </div>
    </div>
  )
}

function TimelineRuler({
  activeProject,
  playheadPercent,
  viewport,
  onAddTrack,
  onPointerDown,
  onWheel,
}: {
  activeProject: ElectronMediaPipelineEditingProject | null
  playheadPercent: number
  viewport: TimelineViewport
  onAddTrack: (type: TimelineTrackType) => void
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
  onWheel: (event: ReactWheelEvent<HTMLElement>) => void
}) {
  const tickCount = 8
  return (
    <div className="editing-workspace-timeline-ruler" aria-label="时间标尺">
      <div className="editing-workspace-ruler-spacer">
        <span>Tracks</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              className="editing-workspace-track-add-trigger"
              aria-label="添加轨道"
              title="添加轨道"
              disabled={!activeProject}
            >
              <Plus size={12} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="editing-workspace-track-add-menu">
            <DropdownMenuItem onSelect={() => onAddTrack('video')}>
              <Film size={14} />
              <span>视频轨</span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onAddTrack('audio')}>
              <AudioLines size={14} />
              <span>音频轨</span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onAddTrack('subtitle')}>
              <Type size={14} />
              <span>字幕轨</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <button
        type="button"
        className="editing-workspace-ruler-lane"
        aria-label="设置时间线光标"
        onPointerDown={onPointerDown}
        onWheel={onWheel}
      >
        <span className="editing-workspace-playhead editing-workspace-playhead--ruler" style={{ left: `${playheadPercent}%` }} />
        {Array.from({ length: tickCount + 1 }, (_value, index) => {
          const ratio = index / tickCount
          const timeMs = viewport.visibleStartMs + viewport.visibleDurationMs * ratio
          return (
            <span key={index} className="editing-workspace-ruler-tick" style={{ left: `${ratio * 100}%` }}>
              <i />
              <span>{formatDuration(timeMs)}</span>
            </span>
          )
        })}
      </button>
    </div>
  )
}
