import { useEffect, useRef, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { FileAudio, Film } from 'lucide-react'
import { ResourceAuthImage, ResourceAuthVideo } from '@movscript/ui/business/resource'

import type { ElectronMediaPipelineClip } from '@movscript/editing-surface/contracts'
import { listenToWindowEvent } from '@movscript/editing-surface/window-events'

import { clipPositionPercent, cssObjectFitForClip, previewClipFrameStyle } from '../domain/clips'
import type {
  TimelinePreviewAudioLayer,
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
  isPlaying,
  onPreviewClipTransformChange,
  onSelectClip,
  projection,
  selectedClipId,
  title,
}: {
  isPlaying: boolean
  onPreviewClipTransformChange: PreviewClipTransformChange
  onSelectClip: (clip: ElectronMediaPipelineClip) => void
  projection: TimelinePreviewProjection
  selectedClipId: string
  title: string
}) {
  const hasVisibleLayers = projection.visualLayers.length > 0 || projection.textLayers.length > 0
  const hasAudioLayers = projection.audioLayers.length > 0
  if (!hasVisibleLayers && !hasAudioLayers) {
    return (
      <div className="editing-workspace-preview-empty">
        <Film size={36} />
        <p>{title}</p>
      </div>
    )
  }

  return (
    <>
      <TimelinePreviewAudioDeck isPlaying={isPlaying} projection={projection} />
      {!hasVisibleLayers ? (
        <div className="editing-workspace-preview-audio">
          <FileAudio size={36} />
          <strong>音频预览</strong>
          <span className="editing-workspace-waveform editing-workspace-waveform--large" aria-hidden="true">
            <i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i />
          </span>
        </div>
      ) : null}
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
  isPlaying = false,
  isSelected = false,
  layerStyle,
  localTimeMs,
  onPreviewClipTransformChange,
  onSelectClip,
  playAudio = false,
  playheadMs,
}: {
  clip: ElectronMediaPipelineClip
  isInteractive?: boolean
  isPlaying?: boolean
  isSelected?: boolean
  layerStyle?: CSSProperties
  localTimeMs?: number
  onPreviewClipTransformChange?: PreviewClipTransformChange
  onSelectClip?: (clip: ElectronMediaPipelineClip) => void
  playAudio?: boolean
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
        {playAudio && isTimelinePreviewClipAudible(clip) ? (
          <TimelinePreviewAudioMedia clip={clip} isPlaying={isPlaying} localTimeMs={clipLocalTimeMs} />
        ) : null}
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

function TimelinePreviewAudioDeck({
  isPlaying,
  projection,
}: {
  isPlaying: boolean
  projection: TimelinePreviewProjection
}) {
  const audibleVideoLayers = projection.visualLayers.filter((layer) => (
    layer.clip.asset?.assetType === 'video'
    && isTimelinePreviewClipAudible(layer.clip, layer.trackMuted)
  ))
  const audibleAudioLayers = projection.audioLayers.filter((layer) => (
    layer.clip.asset?.assetType === 'audio'
    && isTimelinePreviewClipAudible(layer.clip, layer.trackMuted)
  ))

  return (
    <>
      {audibleVideoLayers.map((layer) => (
        <TimelinePreviewAudioMedia
          key={`video-audio:${layer.trackId}:${layer.clip.id}`}
          clip={layer.clip}
          isPlaying={isPlaying}
          localTimeMs={layer.localTimeMs}
        />
      ))}
      {audibleAudioLayers.map((layer) => (
        <TimelinePreviewAudioLayerMedia
          key={`audio:${layer.trackId}:${layer.clip.id}`}
          isPlaying={isPlaying}
          layer={layer}
        />
      ))}
    </>
  )
}

function TimelinePreviewAudioLayerMedia({
  isPlaying,
  layer,
}: {
  isPlaying: boolean
  layer: TimelinePreviewAudioLayer
}) {
  return (
    <TimelinePreviewAudioMedia
      clip={layer.clip}
      isPlaying={isPlaying}
      localTimeMs={layer.localTimeMs}
    />
  )
}

function TimelinePreviewAudioMedia({
  clip,
  isPlaying,
  localTimeMs,
}: {
  clip: ElectronMediaPipelineClip
  isPlaying: boolean
  localTimeMs: number
}) {
  const asset = clip.asset
  const mediaRef = useRef<HTMLMediaElement | null>(null)
  const src = asset ? localMediaUrl(asset) : ''
  const sourceTimeSeconds = Math.max(0, ((clip.sourceStartMs ?? 0) + localTimeMs) / 1000)
  const volume = timelinePreviewVolume(clip)

  useEffect(() => {
    const media = mediaRef.current
    if (!media || !src) return
    if (Math.abs(media.currentTime - sourceTimeSeconds) > 0.18) {
      media.currentTime = sourceTimeSeconds
    }
  }, [sourceTimeSeconds, src])

  useEffect(() => {
    const media = mediaRef.current
    if (!media) return
    media.volume = volume
  }, [src, volume])

  useEffect(() => {
    const media = mediaRef.current
    if (!media || !src || volume <= 0) return
    if (isPlaying) {
      void media.play().catch(() => undefined)
      return
    }
    media.pause()
  }, [isPlaying, src, volume])

  useEffect(() => {
    const media = mediaRef.current
    return () => media?.pause()
  }, [src])

  if (!asset || !src || (asset.assetType !== 'audio' && asset.assetType !== 'video')) return null
  if (asset.assetType === 'audio') {
    return (
      <audio
        ref={(element) => { mediaRef.current = element }}
        src={src}
        preload="auto"
        style={audioPreviewMediaStyle}
      />
    )
  }
  return (
    <video
      ref={(element) => { mediaRef.current = element }}
      src={src}
      preload="auto"
      playsInline
      style={audioPreviewMediaStyle}
    />
  )
}

const audioPreviewMediaStyle: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  opacity: 0,
  pointerEvents: 'none',
}

function isTimelinePreviewClipAudible(clip: ElectronMediaPipelineClip, trackMuted = false): boolean {
  return !trackMuted && !clip.muted && timelinePreviewVolume(clip) > 0
}

function timelinePreviewVolume(clip: ElectronMediaPipelineClip): number {
  const rawVolume = typeof clip.volume === 'number' && Number.isFinite(clip.volume) ? clip.volume : 100
  return Math.max(0, Math.min(2, rawVolume / 100))
}
