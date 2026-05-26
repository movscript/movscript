import type { VideoTimelineExportOverlayInput } from './types'
import { MAX_TIMELINE_EXPORT_OVERLAYS } from './constants'
import { buildCropFilter } from './visualArgs'

export function buildOverlayArgs(
  videoPath: string,
  overlayInputPaths: string[],
  outputPath: string,
  overlays: VideoTimelineExportOverlayInput[],
): string[] {
  const normalized = overlays
    .slice(0, overlayInputPaths.length)
    .map((overlay, index) => ({ overlay: normalizeTimelineOverlay(overlay), path: overlayInputPaths[index] }))
    .filter(item => item.path && item.overlay.sourceData && item.overlay.endMs > item.overlay.startMs)
    .sort((a, b) => (a.overlay.layerIndex ?? 30) - (b.overlay.layerIndex ?? 30) || a.overlay.startMs - b.overlay.startMs)
    .slice(0, MAX_TIMELINE_EXPORT_OVERLAYS)
  const filter = buildOverlayFilter(normalized.map(item => item.overlay))
  const args = [
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-i', videoPath,
  ]
  for (const item of normalized) {
    if (item.overlay.sourceKind !== 'video') args.push('-loop', '1')
    args.push('-i', item.path)
  }
  args.push(
    '-filter_complex', filter,
    '-map', '[vout]',
    '-map', '0:a?',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'veryfast',
    '-c:a', 'copy',
    '-movflags', '+faststart',
    outputPath,
  )
  return args
}

export function buildOverlayFilter(overlays: VideoTimelineExportOverlayInput[]): string {
  const normalized = normalizeTimelineOverlays(overlays)
    .sort((a, b) => (a.layerIndex ?? 30) - (b.layerIndex ?? 30) || a.startMs - b.startMs)
  if (normalized.length === 0) return '[0:v]null[vout]'
  const prepare = normalized.map((overlay, index) => {
    const scale = ((overlay.scalePercent ?? 100) / 100).toFixed(3)
    const opacity = ((overlay.opacityPercent ?? 100) / 100).toFixed(3)
    const fadeFilters = buildOverlayFadeFilters(overlay)
    const sourceDurationMs = Math.max(100, (overlay.sourceEndMs ?? overlay.endMs) - (overlay.sourceStartMs ?? overlay.startMs))
    const filters = [
      overlay.sourceKind === 'video'
        ? `trim=start=${seconds(overlay.sourceStartMs ?? 0)}:duration=${seconds(sourceDurationMs)}`
        : '',
      overlay.sourceKind === 'video' ? `setpts=PTS-STARTPTS+${seconds(overlay.startMs)}/TB` : '',
      buildCropFilter(overlay),
      `scale=iw*${scale}:ih*${scale}`,
      'format=rgba',
      `colorchannelmixer=aa=${opacity}`,
      ...fadeFilters,
    ].filter(Boolean)
    return `[${index + 1}:v]${filters.join(',')}[ov${index}]`
  })
  const overlayChains = normalized.map((overlay, index) => {
    const input = index === 0 ? '[0:v]' : `[v${index - 1}]`
    const output = index === normalized.length - 1 ? '[vout]' : `[v${index}]`
    const start = seconds(overlay.startMs)
    const end = seconds(overlay.endMs)
    const x = ((overlay.xPercent ?? 50) / 100).toFixed(3)
    const y = ((overlay.yPercent ?? 50) / 100).toFixed(3)
    return `${input}[ov${index}]overlay=x=W*${x}-w/2:y=H*${y}-h/2:enable='between(t\\,${start}\\,${end})'${output}`
  })
  return [...prepare, ...overlayChains].join(';')
}

function buildOverlayFadeFilters(overlay: VideoTimelineExportOverlayInput): string[] {
  const durationMs = Math.max(0, overlay.endMs - overlay.startMs)
  const maxFadeSeconds = durationMs / 2000
  const fadeInSeconds = Math.min(maxFadeSeconds, Math.max(0, overlay.fadeInMs ?? 0) / 1000)
  const fadeOutSeconds = Math.min(maxFadeSeconds, Math.max(0, overlay.fadeOutMs ?? 0) / 1000)
  const filters: string[] = []
  if (fadeInSeconds > 0) {
    filters.push(`fade=t=in:st=${seconds(overlay.startMs)}:d=${fadeInSeconds.toFixed(3)}:alpha=1`)
  }
  if (fadeOutSeconds > 0) {
    const startSeconds = Math.max(0, overlay.endMs / 1000 - fadeOutSeconds)
    filters.push(`fade=t=out:st=${startSeconds.toFixed(3)}:d=${fadeOutSeconds.toFixed(3)}:alpha=1`)
  }
  return filters
}

export function normalizeTimelineOverlays(overlays: VideoTimelineExportOverlayInput[] | undefined): VideoTimelineExportOverlayInput[] {
  return (overlays ?? [])
    .map(normalizeTimelineOverlay)
    .filter(overlay => overlay.sourceData && overlay.endMs > overlay.startMs)
    .sort((a, b) => (a.layerIndex ?? 30) - (b.layerIndex ?? 30) || a.startMs - b.startMs)
    .slice(0, MAX_TIMELINE_EXPORT_OVERLAYS)
}

export function normalizeTimelineOverlay(overlay: VideoTimelineExportOverlayInput): VideoTimelineExportOverlayInput {
  return {
    sourceData: overlay.sourceData,
    sourceName: overlay.sourceName,
    sourceKind: overlay.sourceKind === 'video' ? 'video' : 'image',
    startMs: Math.max(0, Math.round(overlay.startMs)),
    endMs: Math.max(0, Math.round(overlay.endMs)),
    sourceStartMs: Math.max(0, Math.round(overlay.sourceStartMs ?? 0)),
    sourceEndMs: Math.max(0, Math.round(overlay.sourceEndMs ?? overlay.endMs - overlay.startMs)),
    layerIndex: clampFinite(overlay.layerIndex, 30, -100, 100),
    fadeInMs: clampFinite(overlay.fadeInMs, 0, 0, Math.max(0, Math.floor((overlay.endMs - overlay.startMs) / 2))),
    fadeOutMs: clampFinite(overlay.fadeOutMs, 0, 0, Math.max(0, Math.floor((overlay.endMs - overlay.startMs) / 2))),
    cropLeftPercent: clampFinite(overlay.cropLeftPercent, 0, 0, 45),
    cropRightPercent: clampFinite(overlay.cropRightPercent, 0, 0, 45),
    cropTopPercent: clampFinite(overlay.cropTopPercent, 0, 0, 45),
    cropBottomPercent: clampFinite(overlay.cropBottomPercent, 0, 0, 45),
    xPercent: clampFinite(overlay.xPercent, 50, 0, 100),
    yPercent: clampFinite(overlay.yPercent, 50, 0, 100),
    scalePercent: clampFinite(overlay.scalePercent, 100, 10, 300),
    opacityPercent: clampFinite(overlay.opacityPercent, 100, 0, 100),
  }
}

function seconds(ms: number): string {
  return (Math.max(0, ms) / 1000).toFixed(3)
}

function clampFinite(value: number | undefined, fallback: number, min: number, max: number): number {
  const finiteValue = Number.isFinite(value) ? value as number : fallback
  return Math.min(max, Math.max(min, Math.round(finiteValue)))
}
