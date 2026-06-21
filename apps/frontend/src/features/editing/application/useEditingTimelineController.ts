import { useCallback, useEffect, useMemo, useState, type Dispatch, type DragEvent, type PointerEvent as ReactPointerEvent, type SetStateAction, type WheelEvent as ReactWheelEvent } from 'react'

import {
  addAssetClipToCompatibleTrackCommand,
  addAssetClipToTrackCommand,
  addTimelineTrackCommand,
  copyTimelineClip,
  deleteTimelineTrackCommand,
  moveTimelineTrackCommand,
  pasteTimelineClipCommand,
  splitClipAtPlayheadCommand,
  toggleTimelineTrackLockedCommand,
  toggleTimelineTrackMutedCommand,
  type SelectedTimelineClip,
  type TimelineClipClipboardItem,
} from '@/features/editing/application/editingCommands'
import {
  EDITING_ASSET_DRAG_TYPE,
} from '@/features/editing/domain/constants'
import {
  applyRippleTrimEndToTrack,
  applyLinkedClipMoveToProject,
  applyLinkedClipTrimToProject,
  assetCanDropOnTrack,
  clipCanDropOnTrack,
  draftClipFromPointerDelta,
  linkedTimelineClipIds,
  normalizeClipPlacement,
} from '@/features/editing/domain/clips'
import {
  refreshTimelineDuration,
} from '@/features/editing/domain/project'
import {
  clampTimelineMs,
  timelineMsFromPointer,
} from '@/features/editing/domain/timelineGeometry'
import {
  createTimelineViewport,
  zoomTimelineViewportAtRatio,
  type TimelineTool,
} from '@/features/editing/domain/timelineInteraction'
import {
  moveClipToTrack,
  reorderClipWithinTrackByMidpoint,
} from '@/features/editing/domain/tracks'
import type {
  ClipForm,
  TimelineClipEditMode,
  TimelineTrack,
  TimelineTrackType,
} from '@/features/editing/domain/types'
import { trackFromPointer } from '@/features/editing/presentation/trackPointer'
import type {
  ElectronMediaPipelineAssetDescriptor,
  ElectronMediaPipelineClip,
  ElectronMediaPipelineEditingProject,
} from '@/shared/contracts/electronApiMedia'
import { listenToWindowEvent } from '@/shared/infrastructure/windowEvents'

import { isEditableKeyboardTarget } from './browser'

type ValueOrUpdater<T> = T | ((current: T) => T)

type CommitProjectChangeOptions = {
  selectedClipId?: string
  playheadMs?: number
  dirty?: boolean
}

type UseEditingTimelineControllerOptions = {
  activeProject: ElectronMediaPipelineEditingProject | null
  assetById: Map<string, ElectronMediaPipelineAssetDescriptor>
  commitProjectChange: (
    project: ElectronMediaPipelineEditingProject,
    options?: CommitProjectChangeOptions,
  ) => void
  playheadMs: number
  previewSelectedClip: (clip: ElectronMediaPipelineClip) => void
  selectedClip: SelectedTimelineClip | null
  selectedClipId: string
  setActiveEditingProject: (project: ElectronMediaPipelineEditingProject | null) => void
  setClipForm: Dispatch<SetStateAction<ClipForm>>
  setPlayheadMs: (playheadMs: ValueOrUpdater<number>) => void
  setSelectedClipId: (clipId: string) => void
  stopPreviewPlayback: () => void
  timelineDurationMs: number
  toggleTimelinePlaybackFromKeyboard: () => void
}

export function useEditingTimelineController({
  activeProject,
  assetById,
  commitProjectChange,
  playheadMs,
  previewSelectedClip,
  selectedClip,
  selectedClipId,
  setActiveEditingProject,
  setClipForm,
  setPlayheadMs,
  setSelectedClipId,
  stopPreviewPlayback,
  timelineDurationMs,
  toggleTimelinePlaybackFromKeyboard,
}: UseEditingTimelineControllerOptions) {
  const [timelineClipClipboard, setTimelineClipClipboard] = useState<TimelineClipClipboardItem | null>(null)
  const [timelineZoom, setTimelineZoom] = useState(1)
  const [timelineViewStartMs, setTimelineViewStartMs] = useState(0)
  const [timelineTool, setTimelineTool] = useState<TimelineTool>('select')
  const [timelineSnapEnabled, setTimelineSnapEnabled] = useState(true)
  const [linkedSelectionEnabled, setLinkedSelectionEnabled] = useState(true)
  const [rippleEditingEnabled, setRippleEditingEnabled] = useState(false)

  const linkedSelectedClipIds = useMemo(() => (
    activeProject && linkedSelectionEnabled && selectedClipId
      ? linkedTimelineClipIds(activeProject, selectedClipId)
      : []
  ), [activeProject, linkedSelectionEnabled, selectedClipId])
  const timelineViewport = createTimelineViewport(timelineDurationMs, timelineZoom, timelineViewStartMs)
  const timelineVisibleDurationMs = timelineViewport.visibleDurationMs
  const timelineVisibleStartMs = timelineViewport.visibleStartMs
  const playheadPercent = timelineVisibleDurationMs <= 0
    ? 0
    : ((playheadMs - timelineVisibleStartMs) / timelineVisibleDurationMs) * 100

  useEffect(() => {
    setTimelineViewStartMs((current) => clampTimelineMs(current, Math.max(0, timelineDurationMs - timelineVisibleDurationMs)))
  }, [timelineDurationMs, timelineVisibleDurationMs])

  const resetTimelineViewState = useCallback(() => {
    setTimelineZoom(1)
    setTimelineViewStartMs(0)
  }, [])

  function copySelectedTimelineClip() {
    if (!selectedClip) return
    setTimelineClipClipboard(copyTimelineClip(selectedClip))
  }

  function pasteTimelineClip() {
    if (!activeProject || !timelineClipClipboard) return
    const { project, clip, track } = pasteTimelineClipCommand(activeProject, timelineClipClipboard, playheadMs)
    previewSelectedClip(clip)
    commitProjectChange(project, { selectedClipId: clip.id, playheadMs: clip.timelineStartMs })
    setClipForm((current) => ({
      ...current,
      assetId: clip.asset?.id ?? current.assetId,
      trackId: track.id,
      timelineStartMs: String(clip.timelineStartMs),
      durationMs: String(clip.durationMs),
    }))
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!activeProject) return
      if (isEditableKeyboardTarget(event.target)) return
      const commandKey = event.metaKey || event.ctrlKey
      const key = event.key.toLowerCase()
      if (commandKey && !event.shiftKey && !event.altKey && key === 'c') {
        event.preventDefault()
        copySelectedTimelineClip()
        return
      }
      if (commandKey && !event.shiftKey && !event.altKey && key === 'v') {
        event.preventDefault()
        pasteTimelineClip()
        return
      }
      if (event.code !== 'Space' || event.repeat) return
      event.preventDefault()
      toggleTimelinePlaybackFromKeyboard()
    }
    return listenToWindowEvent('keydown', handleKeyDown)
  }, [activeProject, selectedClip, timelineClipClipboard, toggleTimelinePlaybackFromKeyboard])

  function addTimelineTrack(type: TimelineTrackType) {
    if (!activeProject) return
    const { project, track } = addTimelineTrackCommand(activeProject, type)
    commitProjectChange(project)
    setClipForm((current) => ({ ...current, trackId: track.id }))
  }

  function deleteTimelineTrack(trackId: string) {
    if (!activeProject) return
    const result = deleteTimelineTrackCommand(activeProject, trackId)
    if (!result) return
    commitProjectChange(result.project)
    setClipForm((current) => {
      if (current.trackId !== trackId) return current
      return {
        ...current,
        trackId: result.nextTracks.find((candidate) => candidate.type === result.track.type)?.id ?? result.nextTracks[0]?.id ?? '',
      }
    })
  }

  function moveTimelineTrack(trackId: string, direction: -1 | 1) {
    if (!activeProject) return
    const nextProject = moveTimelineTrackCommand(activeProject, trackId, direction)
    if (nextProject) commitProjectChange(nextProject)
  }

  function toggleTimelineTrackLocked(trackId: string) {
    if (!activeProject) return
    commitProjectChange(toggleTimelineTrackLockedCommand(activeProject, trackId))
  }

  function toggleTimelineTrackMuted(trackId: string) {
    if (!activeProject) return
    commitProjectChange(toggleTimelineTrackMutedCommand(activeProject, trackId))
  }

  function handleTrackDragOver(event: DragEvent<HTMLElement>, track: TimelineTrack) {
    if (!event.dataTransfer.types.includes(EDITING_ASSET_DRAG_TYPE)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    const assetId = event.dataTransfer.getData(EDITING_ASSET_DRAG_TYPE)
    const asset = assetId ? assetById.get(assetId) : undefined
    if (asset && !assetCanDropOnTrack(asset, track)) event.dataTransfer.dropEffect = 'none'
  }

  function handleTrackDrop(event: DragEvent<HTMLElement>, track: TimelineTrack) {
    if (!activeProject) return
    const assetId = event.dataTransfer.getData(EDITING_ASSET_DRAG_TYPE)
    const asset = assetById.get(assetId)
    if (!asset || !assetCanDropOnTrack(asset, track)) return
    event.preventDefault()
    event.stopPropagation()
    const timelineStartMs = timelineMsFromPointer(event.currentTarget, event.clientX, timelineVisibleStartMs, timelineVisibleDurationMs)
    const { project, clip } = addAssetClipToTrackCommand(activeProject, asset, track.id, timelineStartMs, playheadMs)
    commitProjectChange(project, { selectedClipId: clip.id, playheadMs: clip.timelineStartMs })
    setClipForm((current) => ({
      ...current,
      assetId: asset.id,
      trackId: track.id,
      timelineStartMs: String(timelineStartMs),
      durationMs: String(clip.durationMs),
    }))
  }

  function handleTracksDragOver(event: DragEvent<HTMLElement>) {
    if (!activeProject || activeProject.timeline.tracks.length > 0) return
    if (!event.dataTransfer.types.includes(EDITING_ASSET_DRAG_TYPE)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  function handleTracksDrop(event: DragEvent<HTMLElement>) {
    if (!activeProject || activeProject.timeline.tracks.length > 0) return
    const assetId = event.dataTransfer.getData(EDITING_ASSET_DRAG_TYPE)
    const asset = assetById.get(assetId)
    if (!asset) return
    event.preventDefault()
    const { project, clip, track } = addAssetClipToCompatibleTrackCommand(activeProject, asset, playheadMs, playheadMs)
    commitProjectChange(project, { selectedClipId: clip.id, playheadMs: clip.timelineStartMs })
    setClipForm((current) => ({
      ...current,
      assetId: asset.id,
      trackId: track.id,
      timelineStartMs: String(clip.timelineStartMs),
      durationMs: String(clip.durationMs),
    }))
  }

  function handleTimelinePointer(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0) return
    event.preventDefault()
    stopPreviewPlayback()
    const target = event.currentTarget
    const seekFromClientX = (clientX: number) => {
      setPlayheadMs(timelineMsFromPointer(target, clientX, timelineVisibleStartMs, timelineVisibleDurationMs))
    }
    seekFromClientX(event.clientX)

    const handlePointerMove = (pointerEvent: PointerEvent) => {
      seekFromClientX(pointerEvent.clientX)
    }
    let unsubscribePointerMove: (() => void) | undefined
    let unsubscribePointerUp: (() => void) | undefined
    let unsubscribePointerCancel: (() => void) | undefined
    const handlePointerUp = () => {
      unsubscribePointerMove?.()
      unsubscribePointerUp?.()
      unsubscribePointerCancel?.()
    }
    unsubscribePointerMove = listenToWindowEvent('pointermove', handlePointerMove)
    unsubscribePointerUp = listenToWindowEvent('pointerup', handlePointerUp)
    unsubscribePointerCancel = listenToWindowEvent('pointercancel', handlePointerUp)
  }

  function handleTimelineWheel(event: ReactWheelEvent<HTMLElement>) {
    if (!activeProject) return
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width <= 0) return
    const ratio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1)
    const zoomFactor = Math.exp(-event.deltaY * 0.0018)
    const nextViewport = zoomTimelineViewportAtRatio(timelineViewport, ratio, zoomFactor)
    setTimelineZoom(nextViewport.zoom)
    setTimelineViewStartMs(nextViewport.visibleStartMs)
  }

  function handleClipEditPointerDown(
    event: ReactPointerEvent<HTMLElement>,
    track: TimelineTrack,
    clip: ElectronMediaPipelineClip,
    mode: TimelineClipEditMode,
  ) {
    if (!activeProject || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    stopPreviewPlayback()
    setSelectedClipId(clip.id)
    const lane = event.currentTarget.closest('.editing-workspace-track-lane')
    if (!(lane instanceof HTMLElement)) return
    const rect = lane.getBoundingClientRect()
    if (rect.width <= 0) return
    const pointerPlayheadMs = timelineMsFromPointer(lane, event.clientX, timelineVisibleStartMs, timelineVisibleDurationMs)
    setPlayheadMs(pointerPlayheadMs)
    const startClientX = event.clientX
    const startClip = { ...clip }
    const startProject = activeProject
    const msPerPx = timelineVisibleDurationMs / rect.width
    let latestProject = activeProject
    let latestClip = clip
    let hasChangedClip = false

    const handlePointerMove = (pointerEvent: PointerEvent) => {
      const deltaMs = Math.round((pointerEvent.clientX - startClientX) * msPerPx)
      const targetTrack = mode === 'move'
        ? trackFromPointer(startProject, pointerEvent.clientX, pointerEvent.clientY, track)
        : track
      const targetTrackId = clipCanDropOnTrack(startClip, targetTrack) ? targetTrack.id : track.id
      if (deltaMs === 0 && targetTrackId === track.id) return
      const draftClip = draftClipFromPointerDelta(startClip, deltaMs, mode)
      const rippleTrimEnd = rippleEditingEnabled && mode === 'trim-end' && targetTrackId === track.id
      const nextClip = normalizeClipPlacement(startProject, targetTrackId, draftClip, startClip.id, mode, [pointerPlayheadMs], timelineSnapEnabled, {
        allowTrimEndThroughFollowingClips: rippleTrimEnd,
      })
      const draggedCenterMs = draftClip.timelineStartMs + draftClip.durationMs / 2
      hasChangedClip = true
      const reorderResult = mode === 'move' && targetTrackId === track.id
        ? reorderClipWithinTrackByMidpoint(startProject, track.id, startClip.id, draggedCenterMs)
        : undefined
      latestClip = reorderResult?.clip ?? nextClip
      latestProject = rippleTrimEnd
        ? applyRippleTrimEndToTrack(startProject, track.id, startClip.id, startClip, nextClip)
        : reorderResult?.project ?? moveClipToTrack(startProject, track.id, targetTrackId, startClip.id, nextClip)
      if (linkedSelectionEnabled && mode === 'move') {
        latestProject = applyLinkedClipMoveToProject(latestProject, startClip.id, latestClip.timelineStartMs - startClip.timelineStartMs)
      } else if (linkedSelectionEnabled && (mode === 'trim-start' || mode === 'trim-end')) {
        latestProject = applyLinkedClipTrimToProject(latestProject, startClip.id, startClip, latestClip)
      }
      setActiveEditingProject(refreshTimelineDuration(latestProject))
      setPlayheadMs(latestClip.timelineStartMs)
    }
    let unsubscribePointerMove: (() => void) | undefined
    let unsubscribePointerUp: (() => void) | undefined
    let unsubscribePointerCancel: (() => void) | undefined
    const handlePointerUp = () => {
      unsubscribePointerMove?.()
      unsubscribePointerUp?.()
      unsubscribePointerCancel?.()
      if (!hasChangedClip) return
      commitProjectChange(latestProject, { selectedClipId: latestClip.id, playheadMs: latestClip.timelineStartMs })
    }

    unsubscribePointerMove = listenToWindowEvent('pointermove', handlePointerMove)
    unsubscribePointerUp = listenToWindowEvent('pointerup', handlePointerUp)
    unsubscribePointerCancel = listenToWindowEvent('pointercancel', handlePointerUp)
  }

  function splitClipAtTimelineTime(
    track: TimelineTrack,
    clip: ElectronMediaPipelineClip,
    splitAtMs: number,
  ) {
    if (!activeProject || track.locked) return
    const result = splitClipAtPlayheadCommand(activeProject, { trackId: track.id, clip }, splitAtMs)
    if (!result) return
    previewSelectedClip(result.right)
    commitProjectChange(result.project, { selectedClipId: result.right.id, playheadMs: result.right.timelineStartMs })
  }

  function selectTimelineClip(clip: ElectronMediaPipelineClip) {
    setSelectedClipId(clip.id)
    stopPreviewPlayback()
  }

  return {
    linkedSelectedClipIds,
    linkedSelectionEnabled,
    playheadPercent,
    resetTimelineViewState,
    rippleEditingEnabled,
    snapEnabled: timelineSnapEnabled,
    timelineTool,
    timelineViewport,
    onAddTrack: addTimelineTrack,
    onClipEditPointerDown: handleClipEditPointerDown,
    onDeleteTrack: deleteTimelineTrack,
    onMoveTrack: moveTimelineTrack,
    onSelectClip: selectTimelineClip,
    onSplitClipAt: splitClipAtTimelineTime,
    onTimelinePointer: handleTimelinePointer,
    onTimelineToolChange: setTimelineTool,
    onTimelineWheel: handleTimelineWheel,
    onToggleLinkedSelection: () => setLinkedSelectionEnabled((current) => !current),
    onToggleRippleEditing: () => setRippleEditingEnabled((current) => !current),
    onToggleSnap: () => setTimelineSnapEnabled((current) => !current),
    onToggleTrackLocked: toggleTimelineTrackLocked,
    onToggleTrackMuted: toggleTimelineTrackMuted,
    onTrackDragOver: handleTrackDragOver,
    onTrackDrop: handleTrackDrop,
    onTracksDragOver: handleTracksDragOver,
    onTracksDrop: handleTracksDrop,
  }
}
