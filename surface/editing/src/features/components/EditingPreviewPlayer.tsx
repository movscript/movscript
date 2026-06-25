import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { FileAudio, Film, Maximize2, Minimize2, Pause, Play, ZoomIn, ZoomOut } from 'lucide-react'
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@movscript/ui/primitives'
import { ResourceAuthImage, ResourceAuthVideo } from '@movscript/ui/business/resource'

import type {
  ElectronMediaPipelineAssetDescriptor,
  ElectronMediaPipelineClip,
  ElectronMediaPipelineEditingProject,
} from '@movscript/editing-surface/contracts'

import { EDITING_CANVAS_PRESETS } from '../domain/constants'
import type { TimelinePreviewProjection } from '../domain/timelinePreview'
import type { PreviewMode } from '../domain/types'
import { formatDuration } from '../domain/utils'
import { localMediaUrl, mediaDurationMs } from '../media/localMedia'
import {
  activeCanvasPresetId,
  clampPreviewScale,
  formatAspectRatio,
} from '../presentation/editingPreviewModel'
import { TimelineCompositePreview, TimelinePreviewMedia } from './EditingTimelinePreviewLayers'
import './EditingPreviewPlayer.css'

export function EditingPreviewPlayer({
  activeProject,
  asset,
  clip,
  currentMs,
  durationMs,
  isPlaying,
  mode,
  onAssetDurationChange,
  onAssetEnded,
  onAssetTimeChange,
  onApplyCanvasPreset,
  onPreviewClipTransformChange,
  onSelectClip,
  onTogglePlayback,
  playable,
  selectedClipId,
  timelineProjection,
  timelineClip,
}: {
  activeProject: ElectronMediaPipelineEditingProject | null
  asset: ElectronMediaPipelineAssetDescriptor | null
  clip: ElectronMediaPipelineClip | null
  currentMs: number
  durationMs: number
  isPlaying: boolean
  mode: PreviewMode
  onAssetDurationChange: (durationMs: number) => void
  onAssetEnded: () => void
  onAssetTimeChange: (timeMs: number) => void
  onApplyCanvasPreset: (preset: (typeof EDITING_CANVAS_PRESETS)[number]) => void
  onPreviewClipTransformChange: (
    clipId: string,
    patch: Pick<Partial<ElectronMediaPipelineClip>, 'xPercent' | 'yPercent'>,
    options?: { commit?: boolean },
  ) => void
  onSelectClip: (clip: ElectronMediaPipelineClip) => void
  onTogglePlayback: () => void
  playable: boolean
  selectedClipId: string
  timelineProjection: TimelinePreviewProjection
  timelineClip: ElectronMediaPipelineClip | null
}) {
  const playerRef = useRef<HTMLElement | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [previewScale, setPreviewScale] = useState(1)
  const absoluteClipPlayheadMs = mode === 'clip' && clip ? clip.timelineStartMs + currentMs : currentMs
  const previewWidth = activeProject?.timeline.width ?? 16
  const previewHeight = activeProject?.timeline.height ?? 9
  const previewRatioLabel = formatAspectRatio(previewWidth, previewHeight)
  const screenStyle = {
    '--editing-preview-aspect': String(previewWidth / previewHeight),
    '--editing-preview-scale': String(previewScale),
    aspectRatio: `${previewWidth} / ${previewHeight}`,
    background: mode === 'asset' ? '#050506' : activeProject?.timeline.background ?? '#050506',
  } as CSSProperties

  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === playerRef.current)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  function toggleFullscreen() {
    if (typeof document === 'undefined') return
    const player = playerRef.current
    if (!player) return
    if (document.fullscreenElement) {
      void document.exitFullscreen?.()
      return
    }
    void player.requestFullscreen?.()
  }

  return (
    <section ref={playerRef} className="editing-workspace-preview-player" aria-label="预览播放器">
      <div className="editing-workspace-preview-frame">
        <div
          className="editing-workspace-preview-screen"
          data-clickable={playable ? 'true' : undefined}
          onClick={playable ? onTogglePlayback : undefined}
          style={screenStyle}
        >
          {mode === 'asset' && asset ? (
            <AssetPreviewMedia
              asset={asset}
              currentMs={currentMs}
              isPlaying={isPlaying}
              onDurationChange={onAssetDurationChange}
              onEnded={onAssetEnded}
              onTimeChange={onAssetTimeChange}
            />
          ) : mode === 'timeline' && activeProject ? (
            <TimelineCompositePreview
              isPlaying={isPlaying}
              onPreviewClipTransformChange={onPreviewClipTransformChange}
              onSelectClip={onSelectClip}
              projection={timelineProjection}
              selectedClipId={selectedClipId}
              title={activeProject?.title ?? '预览'}
            />
          ) : clip?.asset ? (
            <TimelinePreviewMedia
              clip={clip}
              isInteractive
              isPlaying={isPlaying}
              isSelected={selectedClipId === clip.id}
              onPreviewClipTransformChange={onPreviewClipTransformChange}
              onSelectClip={onSelectClip}
              playAudio
              playheadMs={absoluteClipPlayheadMs}
            />
          ) : (
            <div className="editing-workspace-preview-empty">
              <Film size={36} />
              <p>{mode === 'clip' && !clip ? '请选择一个 clip 预览' : timelineClip ? '当前光标无可预览画面' : '预览'}</p>
            </div>
          )}
        </div>
      </div>
      <PreviewTransport
        currentMs={currentMs}
        durationMs={durationMs}
        isPlaying={isPlaying}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
        onTogglePlayback={onTogglePlayback}
        playable={playable}
      >
        <PreviewViewportControls
          activePresetId={activeCanvasPresetId(previewWidth, previewHeight)}
          ratioLabel={previewRatioLabel}
          scale={previewScale}
          onApplyCanvasPreset={onApplyCanvasPreset}
          onZoomIn={() => setPreviewScale((value) => clampPreviewScale(value + 0.1))}
          onZoomOut={() => setPreviewScale((value) => clampPreviewScale(value - 0.1))}
        />
      </PreviewTransport>
    </section>
  )
}

function PreviewViewportControls({
  activePresetId,
  ratioLabel,
  scale,
  onApplyCanvasPreset,
  onZoomIn,
  onZoomOut,
}: {
  activePresetId: string | undefined
  ratioLabel: string
  scale: number
  onApplyCanvasPreset: (preset: (typeof EDITING_CANVAS_PRESETS)[number]) => void
  onZoomIn: () => void
  onZoomOut: () => void
}) {
  const scalePercent = Math.round(scale * 100)

  return (
    <div className="editing-workspace-preview-viewport-controls" aria-label="预览画面显示控制">
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        aria-label="缩小预览画面"
        title={`缩小预览画面，当前 ${scalePercent}%`}
        onClick={onZoomOut}
      >
        <ZoomOut size={13} />
      </Button>
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        aria-label="放大预览画面"
        title={`放大预览画面，当前 ${scalePercent}%`}
        onClick={onZoomIn}
      >
        <ZoomIn size={13} />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="editing-workspace-preview-ratio" title="调整项目画面比例">
            [{ratioLabel}]
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="editing-workspace-preview-ratio-menu">
          {EDITING_CANVAS_PRESETS.map((preset) => (
            <DropdownMenuItem key={preset.id} onSelect={() => onApplyCanvasPreset(preset)}>
              <span>{preset.label}</span>
              {activePresetId === preset.id ? <span className="editing-workspace-preview-ratio-current">当前</span> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function PreviewTransport({
  children,
  currentMs,
  durationMs,
  isFullscreen,
  isPlaying,
  onToggleFullscreen,
  onTogglePlayback,
  playable,
}: {
  children?: ReactNode
  currentMs: number
  durationMs: number
  isFullscreen: boolean
  isPlaying: boolean
  onToggleFullscreen: () => void
  onTogglePlayback: () => void
  playable: boolean
}) {
  return (
    <div className="editing-workspace-preview-transport" aria-label="预览播放控制">
      <span className="editing-workspace-preview-time">
        {formatDuration(currentMs)} / {formatDuration(durationMs)}
      </span>
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        className="editing-workspace-preview-play-button"
        aria-label={isPlaying ? '暂停预览' : '播放预览'}
        disabled={!playable}
        onClick={onTogglePlayback}
      >
        {isPlaying ? <Pause size={13} /> : <Play size={13} />}
      </Button>
      <div className="editing-workspace-preview-right-controls">
        {children}
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          className="editing-workspace-preview-fullscreen-button"
          aria-label={isFullscreen ? '退出全屏' : '全屏预览'}
          onClick={onToggleFullscreen}
        >
          {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </Button>
      </div>
    </div>
  )
}

function AssetPreviewMedia({
  asset,
  currentMs,
  isPlaying,
  onDurationChange,
  onEnded,
  onTimeChange,
}: {
  asset: ElectronMediaPipelineAssetDescriptor
  currentMs: number
  isPlaying: boolean
  onDurationChange: (durationMs: number) => void
  onEnded: () => void
  onTimeChange: (timeMs: number) => void
}) {
  const mediaRef = useRef<HTMLMediaElement | null>(null)
  const src = localMediaUrl(asset)

  useEffect(() => {
    const media = mediaRef.current
    if (!media) return
    if (Math.abs(media.currentTime * 1000 - currentMs) > 120) {
      media.currentTime = Math.max(0, currentMs / 1000)
    }
  }, [currentMs, src])

  useEffect(() => {
    const media = mediaRef.current
    if (!media) return
    if (isPlaying) {
      void media.play().catch(() => undefined)
      return
    }
    media.pause()
  }, [isPlaying, src])

  if (asset.assetType === 'image') {
    return (
      <ResourceAuthImage
        src={src}
        alt={asset.label ?? asset.id}
        className="editing-workspace-preview-asset-media"
        style={{ objectFit: 'contain' }}
      />
    )
  }

  if (asset.assetType === 'video') {
    return (
      <ResourceAuthVideo
        className="editing-workspace-preview-asset-media"
        videoRef={(element) => { mediaRef.current = element }}
        src={src}
        playsInline
        preload="metadata"
        style={{ objectFit: 'contain' }}
        onEnded={onEnded}
        onLoadedMetadata={(event) => onDurationChange(mediaDurationMs(event.currentTarget))}
        onTimeUpdate={(event) => onTimeChange(Math.round(event.currentTarget.currentTime * 1000))}
      />
    )
  }

  if (asset.assetType === 'audio') {
    return (
      <div className="editing-workspace-preview-audio">
        <audio
          ref={(element) => { mediaRef.current = element }}
          src={src}
          preload="metadata"
          onEnded={onEnded}
          onLoadedMetadata={(event) => onDurationChange(mediaDurationMs(event.currentTarget))}
          onTimeUpdate={(event) => onTimeChange(Math.round(event.currentTarget.currentTime * 1000))}
        />
        <FileAudio size={36} />
        <strong>{asset.label ?? asset.id}</strong>
        <span className="editing-workspace-waveform editing-workspace-waveform--large" aria-hidden="true">
          <i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i />
        </span>
      </div>
    )
  }

  return (
    <div className="editing-workspace-preview-empty">
      <Film size={36} />
      <p>{asset.label ?? asset.id}</p>
    </div>
  )
}
