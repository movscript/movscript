import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ResourceAuthImage, ResourceAuthVideo } from '@movscript/ui/business/resource'

import type { ElectronMediaPipelineClip } from '@/shared/contracts/electronApiMedia'

import { assetAspectRatio, timelineClipCells, timelineClipThumbnailCellCount, timelineWaveformBarHeight } from '../domain/clips'
import { extractTimelineAudioWaveform } from '../media/audioWaveform'
import { localMediaUrl } from '../media/localMedia'
import { extractTimelineVideoFrames } from '../media/videoFrames'

const videoFrameCache = new Map<string, string[]>()
const audioWaveformCache = new Map<string, number[]>()
const MAX_VIDEO_FRAME_CACHE_ENTRIES = 80
const MAX_AUDIO_WAVEFORM_CACHE_ENTRIES = 120
const DEFAULT_VIDEO_FRAME_RATIO = 16 / 9
const MAX_VIDEO_FRAME_COUNT = 48
const MIN_TIMELINE_VIDEO_FRAME_CELL_WIDTH = 12
const MAX_TIMELINE_VIDEO_FRAME_CELL_WIDTH = 110
const MAX_AUDIO_WAVEFORM_BAR_COUNT = 240

export function TimelineClipFilmstrip({ clip }: { clip: ElectronMediaPipelineClip }) {
  if (clip.assetType === 'audio') {
    return <TimelineAudioWaveformStrip clip={clip} />
  }

  if (clip.assetType === 'video' || clip.assetType === 'image') {
    const imageSrc = clip.asset?.assetType === 'image' ? localMediaUrl(clip.asset) : undefined
    if (clip.asset?.assetType === 'video') return <TimelineVideoFrameStrip clip={clip} />
    return (
      <span className="editing-workspace-clip-media editing-workspace-clip-filmstrip" aria-hidden="true">
        {timelineClipCells(clip).map((cell) => (
          <i key={cell}>
            {imageSrc ? <ResourceAuthImage src={imageSrc} alt="" /> : null}
          </i>
        ))}
      </span>
    )
  }

  return (
    <span className="editing-workspace-clip-media editing-workspace-clip-text-strip" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  )
}

function TimelineVideoFrameStrip({ clip }: { clip: ElectronMediaPipelineClip }) {
  const [stripRef, stripSize] = useElementSize<HTMLSpanElement>()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [readyTick, setReadyTick] = useState(0)
  const [frames, setFrames] = useState<string[]>([])
  const [naturalAspectRatio, setNaturalAspectRatio] = useState<number | undefined>(undefined)
  const src = clip.asset ? localMediaUrl(clip.asset) : undefined
  const frameMetrics = timelineVideoFrameMetrics(clip, stripSize.width, stripSize.height, naturalAspectRatio)
  const frameCount = frameMetrics.count
  const cells = Array.from({ length: frameCount }, (_value, index) => index)
  const cacheKey = [
    src ?? '',
    clip.id,
    clip.sourceStartMs ?? 0,
    clip.sourceEndMs ?? '',
    clip.durationMs,
    clip.speed ?? '',
    frameCount,
    frameMetrics.captureWidth,
    frameMetrics.height,
    frameMetrics.cellWidth,
  ].join(':')

  useEffect(() => {
    let cancelled = false
    const video = videoRef.current
    if (!video || !src || video.readyState < 1) {
      setFrames([])
      return undefined
    }
    const cachedFrames = videoFrameCache.get(cacheKey)
    if (cachedFrames) {
      setFrames(cachedFrames)
      return undefined
    }
    void extractTimelineVideoFrames(video, clip, frameCount, {
      width: frameMetrics.captureWidth,
      height: frameMetrics.height,
    }).then((nextFrames) => {
      if (nextFrames.length > 0) cacheVideoFrames(cacheKey, nextFrames)
      if (!cancelled) setFrames(nextFrames)
    })
    return () => {
      cancelled = true
    }
  }, [cacheKey, clip, frameCount, frameMetrics.captureWidth, frameMetrics.height, readyTick, src])

  useEffect(() => {
    setNaturalAspectRatio(undefined)
  }, [src])

  function markVideoReady(video: HTMLVideoElement) {
    setNaturalAspectRatio(videoNaturalAspectRatio(video))
    setReadyTick((current) => current + 1)
  }

  return (
    <span
      ref={stripRef}
      className="editing-workspace-clip-media editing-workspace-clip-filmstrip editing-workspace-clip-filmstrip--video"
      data-frame-count={frameCount}
      data-frame-cell-width={frameMetrics.cellWidth}
      style={{
        '--editing-timeline-frame-cell-width': `${frameMetrics.cellWidth}px`,
        display: 'grid',
        gridTemplateColumns: `repeat(${frameCount}, ${frameMetrics.cellWidth}px)`,
        gridAutoColumns: `${frameMetrics.cellWidth}px`,
      } as CSSProperties}
      aria-hidden="true"
    >
      <ResourceAuthVideo
        videoRef={videoRef}
        src={src}
        muted
        playsInline
        preload="auto"
        className="editing-workspace-clip-frame-source"
        onLoadedMetadata={(event) => markVideoReady(event.currentTarget)}
        onCanPlay={(event) => markVideoReady(event.currentTarget)}
      />
      {cells.map((cell) => (
        <i
          key={cell}
          style={{
            width: `${frameMetrics.cellWidth}px`,
            minWidth: `${frameMetrics.cellWidth}px`,
            maxWidth: `${frameMetrics.cellWidth}px`,
            gridColumn: `${cell + 1}`,
            flexBasis: `${frameMetrics.cellWidth}px`,
            flexGrow: 0,
            flexShrink: 0,
          }}
        >
          {frames[cell] || frames[frames.length - 1] ? <ResourceAuthImage src={frames[cell] ?? frames[frames.length - 1]} alt="" /> : <span />}
        </i>
      ))}
    </span>
  )
}

function TimelineAudioWaveformStrip({ clip }: { clip: ElectronMediaPipelineClip }) {
  const [stripRef, stripSize] = useElementSize<HTMLSpanElement>()
  const src = clip.asset ? localMediaUrl(clip.asset) : undefined
  const barCount = timelineAudioWaveformBarCount(stripSize.width)
  const [waveform, setWaveform] = useState<number[]>([])
  const cells = Array.from({ length: barCount }, (_value, index) => index)
  const cacheKey = [
    src ?? '',
    clip.id,
    clip.sourceStartMs ?? 0,
    clip.sourceEndMs ?? '',
    clip.durationMs,
    clip.speed ?? '',
    barCount,
  ].join(':')

  useEffect(() => {
    let cancelled = false
    if (!src || barCount <= 0) {
      setWaveform([])
      return undefined
    }
    const cachedWaveform = audioWaveformCache.get(cacheKey)
    if (cachedWaveform) {
      setWaveform(cachedWaveform)
      return undefined
    }
    void extractTimelineAudioWaveform(src, clip, barCount).then((nextWaveform) => {
      if (nextWaveform.length > 0) cacheAudioWaveform(cacheKey, nextWaveform)
      if (!cancelled) setWaveform(nextWaveform)
    })
    return () => {
      cancelled = true
    }
  }, [barCount, cacheKey, clip, src])

  return (
    <span
      ref={stripRef}
      className="editing-workspace-clip-media editing-workspace-clip-waveform"
      data-waveform-ready={waveform.length > 0 ? 'true' : undefined}
      style={{
        gridTemplateColumns: `repeat(${barCount}, minmax(1px, 1fr))`,
      }}
      aria-hidden="true"
    >
      {cells.map((cell) => {
        const height = waveform[cell] === undefined
          ? timelineWaveformBarHeight(cell, clip.id)
          : timelineAudioWaveformHeight(waveform[cell])
        return <i key={cell} style={{ height: `${height}%` }} />
      })}
    </span>
  )
}

function useElementSize<Element extends HTMLElement>() {
  const ref = useRef<Element | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const element = ref.current
    if (!element) return undefined
    const updateSize = () => {
      const rect = element.getBoundingClientRect()
      const nextSize = {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }
      setSize((current) => (
        current.width === nextSize.width && current.height === nextSize.height ? current : nextSize
      ))
    }
    updateSize()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(updateSize)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return [ref, size] as const
}

function timelineVideoFrameMetrics(
  clip: ElectronMediaPipelineClip,
  stripWidth: number,
  stripHeight: number,
  naturalAspectRatio: number | undefined,
) {
  const ratio = naturalAspectRatio ?? (clip.asset ? assetAspectRatio(clip.asset) ?? DEFAULT_VIDEO_FRAME_RATIO : DEFAULT_VIDEO_FRAME_RATIO)
  const height = Math.max(36, Math.min(120, stripHeight || 54))
  const captureWidth = Math.max(12, Math.min(220, Math.round(height * ratio)))
  const cellWidth = Math.max(
    MIN_TIMELINE_VIDEO_FRAME_CELL_WIDTH,
    Math.min(MAX_TIMELINE_VIDEO_FRAME_CELL_WIDTH, captureWidth),
  )
  const count = stripWidth > 0
    ? Math.min(MAX_VIDEO_FRAME_COUNT, Math.max(2, Math.ceil(stripWidth / cellWidth) + 1))
    : Math.min(MAX_VIDEO_FRAME_COUNT, Math.max(6, timelineClipThumbnailCellCount(clip)))
  return { count, captureWidth, cellWidth, height }
}

function videoNaturalAspectRatio(video: HTMLVideoElement): number | undefined {
  if (video.videoWidth <= 0 || video.videoHeight <= 0) return undefined
  const ratio = video.videoWidth / video.videoHeight
  return Number.isFinite(ratio) && ratio > 0 ? ratio : undefined
}

function timelineAudioWaveformBarCount(stripWidth: number) {
  if (stripWidth <= 0) return 32
  return Math.min(MAX_AUDIO_WAVEFORM_BAR_COUNT, Math.max(12, Math.floor(stripWidth / 3)))
}

function timelineAudioWaveformHeight(value: number) {
  return Math.max(10, Math.min(98, Math.round(12 + value * 86)))
}

function cacheVideoFrames(key: string, frames: string[]) {
  if (!videoFrameCache.has(key) && videoFrameCache.size >= MAX_VIDEO_FRAME_CACHE_ENTRIES) {
    const firstKey = videoFrameCache.keys().next().value
    if (firstKey) videoFrameCache.delete(firstKey)
  }
  videoFrameCache.set(key, frames)
}

function cacheAudioWaveform(key: string, waveform: number[]) {
  if (!audioWaveformCache.has(key) && audioWaveformCache.size >= MAX_AUDIO_WAVEFORM_CACHE_ENTRIES) {
    const firstKey = audioWaveformCache.keys().next().value
    if (firstKey) audioWaveformCache.delete(firstKey)
  }
  audioWaveformCache.set(key, waveform)
}
