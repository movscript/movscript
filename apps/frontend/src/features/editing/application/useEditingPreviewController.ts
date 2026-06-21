import { useCallback, useEffect, useMemo, useState } from 'react'

import { buildTimelinePreviewProjection } from '@/features/editing/domain/timelinePreview'
import type { PreviewMode } from '@/features/editing/domain/types'
import { localMediaUrl } from '@/features/editing/media/localMedia'
import type {
  ElectronMediaPipelineAssetDescriptor,
  ElectronMediaPipelineClip,
  ElectronMediaPipelineEditingProject,
} from '@/shared/contracts/electronApiMedia'

type ValueOrUpdater<T> = T | ((current: T) => T)

type SelectedTimelineClip = {
  trackId: string
  clip: ElectronMediaPipelineClip
} | null

type UseEditingPreviewControllerOptions = {
  activeProject: ElectronMediaPipelineEditingProject | null
  assetById: Map<string, ElectronMediaPipelineAssetDescriptor>
  playheadMs: number
  selectedClip: SelectedTimelineClip
  selectedClipId: string
  setPlayheadMs: (playheadMs: ValueOrUpdater<number>) => void
  setSelectedClipId: (clipId: string) => void
  timelineDurationMs: number
}

export function useEditingPreviewController({
  activeProject,
  assetById,
  playheadMs,
  selectedClip,
  selectedClipId,
  setPlayheadMs,
  setSelectedClipId,
  timelineDurationMs,
}: UseEditingPreviewControllerOptions) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [previewMode, setPreviewMode] = useState<PreviewMode>('timeline')
  const [previewAssetId, setPreviewAssetId] = useState('')
  const [assetPreviewTimeMs, setAssetPreviewTimeMs] = useState(0)
  const [assetPreviewDurationMs, setAssetPreviewDurationMs] = useState(0)

  const previewAsset = useMemo(() => {
    if (!previewAssetId) return null
    return assetById.get(previewAssetId) ?? null
  }, [assetById, previewAssetId])
  const selectedAsset = !selectedClip && previewMode === 'asset' ? previewAsset : null
  const activePreviewClip = useMemo(() => {
    if (!activeProject) return null
    for (const track of activeProject.timeline.tracks) {
      const clip = track.clips.find((candidate) => (
        playheadMs >= candidate.timelineStartMs
        && playheadMs < candidate.timelineStartMs + candidate.durationMs
      ))
      if (clip) return clip
    }
    return null
  }, [activeProject, playheadMs])
  const timelinePreviewProjection = useMemo(() => {
    return buildTimelinePreviewProjection(activeProject, playheadMs)
  }, [activeProject, playheadMs])
  const clipPreviewClip = selectedClip?.clip ?? null
  const previewRange = useMemo(() => {
    if (previewMode === 'clip' && clipPreviewClip) {
      return {
        startMs: clipPreviewClip.timelineStartMs,
        endMs: clipPreviewClip.timelineStartMs + clipPreviewClip.durationMs,
      }
    }
    return { startMs: 0, endMs: timelineDurationMs }
  }, [clipPreviewClip, previewMode, timelineDurationMs])
  const previewCurrentMs = previewMode === 'asset'
    ? assetPreviewTimeMs
    : Math.max(0, playheadMs - previewRange.startMs)
  const previewDurationMs = previewMode === 'asset'
    ? assetPreviewDurationMs
    : Math.max(0, previewRange.endMs - previewRange.startMs)
  const previewPlayable = previewMode === 'asset'
    ? Boolean(previewAsset && (previewAsset.assetType === 'video' || previewAsset.assetType === 'audio') && localMediaUrl(previewAsset))
    : Boolean(activeProject && (previewMode !== 'clip' || clipPreviewClip))

  const stopPreviewPlayback = useCallback(() => {
    setIsPlaying(false)
  }, [])

  const resetPreviewState = useCallback(() => {
    setIsPlaying(false)
    setPreviewMode('timeline')
    setPreviewAssetId('')
    setAssetPreviewTimeMs(0)
    setAssetPreviewDurationMs(0)
  }, [])

  const clearRemovedAssetPreview = useCallback((assetId: string) => {
    if (previewAssetId !== assetId) return
    resetPreviewState()
  }, [previewAssetId, resetPreviewState])

  const previewAssetForEditing = useCallback((assetId: string) => {
    setIsPlaying(false)
    setSelectedClipId('')
    setPreviewMode('asset')
    setPreviewAssetId(assetId)
    setAssetPreviewTimeMs(0)
    setAssetPreviewDurationMs(0)
  }, [setSelectedClipId])

  const previewTimeline = useCallback(() => {
    setIsPlaying(false)
    setPreviewMode('timeline')
  }, [])

  const previewSelectedClip = useCallback((clip: ElectronMediaPipelineClip) => {
    setIsPlaying(false)
    setPreviewMode('clip')
    setPlayheadMs(clip.timelineStartMs)
  }, [setPlayheadMs])

  const selectPreviewClip = useCallback((clip: ElectronMediaPipelineClip) => {
    setSelectedClipId(clip.id)
    setIsPlaying(false)
    if (previewMode === 'asset') setPreviewMode('timeline')
  }, [previewMode, setSelectedClipId])

  const togglePreviewPlayback = useCallback(() => {
    if (!previewPlayable) return
    if (!isPlaying && previewMode !== 'asset' && playheadMs >= previewRange.endMs) {
      setPlayheadMs(previewRange.startMs)
    }
    if (!isPlaying && previewMode === 'asset' && assetPreviewDurationMs > 0 && assetPreviewTimeMs >= assetPreviewDurationMs) {
      setAssetPreviewTimeMs(0)
    }
    setIsPlaying((current) => !current)
  }, [
    assetPreviewDurationMs,
    assetPreviewTimeMs,
    isPlaying,
    playheadMs,
    previewMode,
    previewPlayable,
    previewRange.endMs,
    previewRange.startMs,
    setPlayheadMs,
  ])

  const toggleTimelinePlaybackFromKeyboard = useCallback(() => {
    setPreviewMode('timeline')
    if (!isPlaying && playheadMs >= timelineDurationMs) setPlayheadMs(0)
    setIsPlaying((current) => !current)
  }, [isPlaying, playheadMs, setPlayheadMs, timelineDurationMs])

  useEffect(() => {
    if (!isPlaying) return undefined
    if (previewMode === 'asset') return undefined
    let frame = 0
    let previousTimestamp = performance.now()
    const tick = (timestamp: number) => {
      const deltaMs = Math.max(0, timestamp - previousTimestamp)
      previousTimestamp = timestamp
      setPlayheadMs((current) => {
        const next = Math.min(current + deltaMs, previewRange.endMs)
        if (next >= previewRange.endMs) setIsPlaying(false)
        return next
      })
      frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [isPlaying, previewMode, previewRange.endMs, setPlayheadMs])

  useEffect(() => {
    if (!isPlaying || previewMode !== 'asset') return
    if (!previewAsset || (previewAsset.assetType !== 'video' && previewAsset.assetType !== 'audio')) setIsPlaying(false)
  }, [isPlaying, previewAsset, previewMode])

  return {
    activePreviewClip,
    clearRemovedAssetPreview,
    clipPreviewClip,
    isPlaying,
    previewAsset,
    previewAssetForEditing,
    previewCurrentMs,
    previewDurationMs,
    previewMode,
    previewPlayable,
    previewRange,
    previewSelectedClip,
    previewTimeline,
    resetPreviewState,
    selectPreviewClip,
    selectedAsset,
    setAssetPreviewDurationMs,
    setAssetPreviewTimeMs,
    stopPreviewPlayback,
    timelinePreviewProjection,
    togglePreviewPlayback,
    toggleTimelinePlaybackFromKeyboard,
  }
}
