import { useEffect, useRef, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { FileAudio, Film } from 'lucide-react'
import { ResourceAuthImage, ResourceAuthVideo } from '@movscript/ui/business/resource'

import type { ElectronMediaPipelineClip } from '@/shared/contracts/electronApiMedia'
import { listenToWindowEvent } from '@/shared/infrastructure/windowEvents'

import { clipPositionPercent, cssObjectFitForClip, previewClipFrameStyle } from '../domain/clips'
import type {
  TimelinePreviewProjection,
  TimelinePreviewTextLayer,
  TimelinePreviewVisualLayer,
} from '../domain/timelinePreview'
import { localMediaUrl } from '../media/localMedia'
import { seekPreviewVideo } from '../media/videoFrames'
import { colorWithAlpha } from '../presentation/editingPreviewModel'

type PreviewClipTransformChange = (
  clipId: string,
  patch: Pick<Partial<ElectronMediaPipelineClip>, 'xPercent' | 'yPercent'>,
  options?: { commit?: boolean },
) => void

export function TimelineCompositePreview({
  onPreviewClipTransformChange,
  onSelectClip,
  projection,
  selectedClipId,
  title,
}: {
  onPreviewClipTransformChange: PreviewClipTransformChange
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
  onPreviewClipTransformChange: PreviewClipTransformChange
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

export function TimelinePreviewMedia({
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
  onPreviewClipTransformChange?: PreviewClipTransformChange
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
    let unsubscribePointerMove: (() => void) | undefined
    let unsubscribePointerUp: (() => void) | undefined
    let unsubscribePointerCancel: (() => void) | undefined
    const handlePointerUp = () => {
      unsubscribePointerMove?.()
      unsubscribePointerUp?.()
      unsubscribePointerCancel?.()
      if (latestPatch) onPreviewClipTransformChange(clip.id, latestPatch, { commit: true })
    }

    unsubscribePointerMove = listenToWindowEvent('pointermove', handlePointerMove)
    unsubscribePointerUp = listenToWindowEvent('pointerup', handlePointerUp)
    unsubscribePointerCancel = listenToWindowEvent('pointercancel', handlePointerUp)
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
