import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { FileAudio, Film, Maximize2, Minimize2, Pause, Play, ZoomIn, ZoomOut } from 'lucide-react'
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@movscript/ui/primitives'
import { ResourceAuthImage, ResourceAuthVideo } from '@movscript/ui/business/resource'

import type {
  ElectronMediaPipelineAssetDescriptor,
  ElectronMediaPipelineClip,
  ElectronMediaPipelineEditingProject,
} from '@/shared/contracts/electronApiMedia'

import { clipPositionPercent, cssObjectFitForClip, previewClipFrameStyle } from '../domain/clips'
import { EDITING_CANVAS_PRESETS } from '../domain/constants'
import type {
  TimelinePreviewProjection,
  TimelinePreviewTextLayer,
  TimelinePreviewVisualLayer,
} from '../domain/timelinePreview'
import type { PreviewMode } from '../domain/types'
import { formatDuration } from '../domain/utils'
import { localMediaUrl, mediaDurationMs } from '../media/localMedia'
import { seekPreviewVideo } from '../media/videoFrames'

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
              isSelected={selectedClipId === clip.id}
              onPreviewClipTransformChange={onPreviewClipTransformChange}
              onSelectClip={onSelectClip}
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

function TimelineCompositePreview({
  onPreviewClipTransformChange,
  onSelectClip,
  projection,
  selectedClipId,
  title,
}: {
  onPreviewClipTransformChange: (
    clipId: string,
    patch: Pick<Partial<ElectronMediaPipelineClip>, 'xPercent' | 'yPercent'>,
    options?: { commit?: boolean },
  ) => void
  onSelectClip: (clip: ElectronMediaPipelineClip) => void
  projection: TimelinePreviewProjection
  selectedClipId: string
  title: string
}) {
  const hasVisibleLayers = projection.visualLayers.length > 0 || projection.textLayers.length > 0
  if (!hasVisibleLayers) {
    return (
      <div className="editing-workspace-preview-empty">
        <Film size={36} />
        <p>{title}</p>
      </div>
    )
  }

  return (
    <>
      {projection.visualLayers.map((layer) => (
        <TimelinePreviewVisualLayerMedia
          key={`${layer.trackId}:${layer.clip.id}`}
          isSelected={selectedClipId === layer.clip.id}
          layer={layer}
          onPreviewClipTransformChange={onPreviewClipTransformChange}
          onSelectClip={onSelectClip}
        />
      ))}
      {projection.textLayers.map((layer) => (
        <TimelinePreviewText
          key={`${layer.trackId}:${layer.clip.id}`}
          isSelected={selectedClipId === layer.clip.id}
          layer={layer}
          onSelectClip={onSelectClip}
        />
      ))}
    </>
  )
}

function TimelinePreviewVisualLayerMedia({
  isSelected,
  layer,
  onPreviewClipTransformChange,
  onSelectClip,
}: {
  isSelected: boolean
  layer: TimelinePreviewVisualLayer
  onPreviewClipTransformChange: (
    clipId: string,
    patch: Pick<Partial<ElectronMediaPipelineClip>, 'xPercent' | 'yPercent'>,
    options?: { commit?: boolean },
  ) => void
  onSelectClip: (clip: ElectronMediaPipelineClip) => void
}) {
  return (
    <TimelinePreviewMedia
      clip={layer.clip}
      isInteractive
      isSelected={isSelected}
      localTimeMs={layer.localTimeMs}
      layerStyle={{
        zIndex: layer.layerIndex,
        opacity: layer.clip.opacity ?? 1,
      }}
      onPreviewClipTransformChange={onPreviewClipTransformChange}
      onSelectClip={onSelectClip}
    />
  )
}

function TimelinePreviewText({
  isSelected,
  layer,
  onSelectClip,
}: {
  isSelected: boolean
  layer: TimelinePreviewTextLayer
  onSelectClip: (clip: ElectronMediaPipelineClip) => void
}) {
  const textStyle = layer.clip.subtitle?.style ?? layer.clip.text
  const fontSize = Math.max(12, Math.min(96, Math.round(textStyle?.fontSize ?? 42)))
  const backgroundOpacity = Math.max(0, Math.min(1, textStyle?.backgroundOpacity ?? 0.35))
  const backgroundColor = textStyle?.backgroundColor ?? '#000000'
  const textColor = textStyle?.color ?? '#ffffff'
  const align = textStyle?.align === 'left' || textStyle?.align === 'right' ? textStyle.align : 'center'

  return (
    <div
      className="editing-workspace-preview-text-layer"
      data-selected={isSelected ? 'true' : undefined}
      role="button"
      style={{
        zIndex: layer.layerIndex,
        color: textColor,
        fontSize,
        textAlign: align,
      }}
      tabIndex={0}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onSelectClip(layer.clip)
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        event.stopPropagation()
        onSelectClip(layer.clip)
      }}
    >
      <span style={{ backgroundColor: colorWithAlpha(backgroundColor, backgroundOpacity) }}>
        {layer.text}
      </span>
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

function TimelinePreviewMedia({
  clip,
  isInteractive = false,
  isSelected = false,
  layerStyle,
  localTimeMs,
  onPreviewClipTransformChange,
  onSelectClip,
  playheadMs,
}: {
  clip: ElectronMediaPipelineClip
  isInteractive?: boolean
  isSelected?: boolean
  layerStyle?: CSSProperties
  localTimeMs?: number
  onPreviewClipTransformChange?: (
    clipId: string,
    patch: Pick<Partial<ElectronMediaPipelineClip>, 'xPercent' | 'yPercent'>,
    options?: { commit?: boolean },
  ) => void
  onSelectClip?: (clip: ElectronMediaPipelineClip) => void
  playheadMs?: number
}) {
  const asset = clip.asset
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const clipLocalTimeMs = localTimeMs ?? Math.max(0, (playheadMs ?? clip.timelineStartMs) - clip.timelineStartMs)
  const sourceTimeSeconds = Math.max(0, ((clip.sourceStartMs ?? 0) + clipLocalTimeMs) / 1000)
  const mediaStyle = { objectFit: cssObjectFitForClip(clip) } as CSSProperties
  const frameStyle = { ...previewClipFrameStyle(clip), ...layerStyle }
  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isInteractive || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    onSelectClip?.(clip)
    if (!onPreviewClipTransformChange || (clip.assetType !== 'video' && clip.assetType !== 'image')) return

    const screen = event.currentTarget.closest('.editing-workspace-preview-screen')
    if (!(screen instanceof HTMLElement)) return
    const rect = screen.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return

    const startClientX = event.clientX
    const startClientY = event.clientY
    const startXPercent = clipPositionPercent(clip.xPercent)
    const startYPercent = clipPositionPercent(clip.yPercent)
    let latestPatch: Pick<Partial<ElectronMediaPipelineClip>, 'xPercent' | 'yPercent'> | null = null

    const handlePointerMove = (pointerEvent: PointerEvent) => {
      const xPercent = clipPositionPercent(startXPercent + ((pointerEvent.clientX - startClientX) / rect.width) * 100)
      const yPercent = clipPositionPercent(startYPercent + ((pointerEvent.clientY - startClientY) / rect.height) * 100)
      latestPatch = { xPercent, yPercent }
      onPreviewClipTransformChange(clip.id, latestPatch, { commit: false })
    }
    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
      if (latestPatch) onPreviewClipTransformChange(clip.id, latestPatch, { commit: true })
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)
  }
  const handleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!isInteractive) return
    event.preventDefault()
    event.stopPropagation()
    onSelectClip?.(clip)
  }
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!isInteractive || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    event.stopPropagation()
    onSelectClip?.(clip)
  }
  useEffect(() => {
    if (asset?.assetType !== 'video') return
    seekPreviewVideo(videoRef.current, sourceTimeSeconds)
  }, [asset?.assetType, sourceTimeSeconds])
  if (!asset) return null
  if (asset.assetType === 'image') {
    return (
      <div
        className="editing-workspace-preview-media-frame"
        data-interactive={isInteractive ? 'true' : undefined}
        data-selected={isSelected ? 'true' : undefined}
        aria-label={`选择 ${asset.label ?? clip.id}`}
        role={isInteractive ? 'button' : undefined}
        style={frameStyle}
        tabIndex={isInteractive ? 0 : undefined}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
      >
        <ResourceAuthImage src={localMediaUrl(asset)} alt={asset.label ?? asset.id} style={mediaStyle} />
      </div>
    )
  }
  if (asset.assetType === 'video') {
    return (
      <div
        className="editing-workspace-preview-media-frame"
        data-interactive={isInteractive ? 'true' : undefined}
        data-selected={isSelected ? 'true' : undefined}
        aria-label={`选择 ${asset.label ?? clip.id}`}
        role={isInteractive ? 'button' : undefined}
        style={frameStyle}
        tabIndex={isInteractive ? 0 : undefined}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
      >
        <ResourceAuthVideo
          videoRef={videoRef}
          src={localMediaUrl(asset)}
          style={mediaStyle}
          muted
          playsInline
          preload="metadata"
          onLoadedMetadata={(event) => seekPreviewVideo(event.currentTarget, sourceTimeSeconds)}
        />
      </div>
    )
  }
  if (asset.assetType === 'audio') {
    return (
      <div className="editing-workspace-preview-audio">
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
      <p>{asset.label ?? clip.id}</p>
    </div>
  )
}

function colorWithAlpha(color: string, alpha: number) {
  if (/^#[0-9a-f]{6}$/i.test(color)) {
    const red = Number.parseInt(color.slice(1, 3), 16)
    const green = Number.parseInt(color.slice(3, 5), 16)
    const blue = Number.parseInt(color.slice(5, 7), 16)
    return `rgba(${red}, ${green}, ${blue}, ${alpha.toFixed(2)})`
  }
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    const red = Number.parseInt(color[1] + color[1], 16)
    const green = Number.parseInt(color[2] + color[2], 16)
    const blue = Number.parseInt(color[3] + color[3], 16)
    return `rgba(${red}, ${green}, ${blue}, ${alpha.toFixed(2)})`
  }
  return color
}

function clampPreviewScale(value: number) {
  return Math.max(0.5, Math.min(2, Math.round(value * 10) / 10))
}

function formatAspectRatio(width: number, height: number) {
  const normalizedWidth = Math.max(1, Math.round(width))
  const normalizedHeight = Math.max(1, Math.round(height))
  const divisor = greatestCommonDivisor(normalizedWidth, normalizedHeight)
  return `${Math.round(normalizedWidth / divisor)}:${Math.round(normalizedHeight / divisor)}`
}

function activeCanvasPresetId(width: number, height: number) {
  const ratio = formatAspectRatio(width, height)
  return EDITING_CANVAS_PRESETS.find((preset) => preset.id === ratio)?.id
}

function greatestCommonDivisor(a: number, b: number): number {
  let x = Math.abs(a)
  let y = Math.abs(b)
  while (y > 0) {
    const next = x % y
    x = y
    y = next
  }
  return x || 1
}
