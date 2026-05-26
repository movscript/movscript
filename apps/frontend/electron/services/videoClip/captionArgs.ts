import type { VideoTimelineExportCaptionInput } from './types'
import { MAX_TIMELINE_EXPORT_CAPTIONS } from './constants'

export function buildCaptionBurnArgs(
  inputPath: string,
  outputPath: string,
  captions: VideoTimelineExportCaptionInput[],
): string[] {
  const filter = buildCaptionFilter(captions)
  return [
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-i', inputPath,
    '-vf', filter,
    '-map', '0:v:0',
    '-map', '0:a?',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'veryfast',
    '-c:a', 'copy',
    '-movflags', '+faststart',
    outputPath,
  ]
}

export function buildCaptionFilter(captions: VideoTimelineExportCaptionInput[]): string {
  const normalized = normalizeTimelineCaptions(captions)
    .sort((a, b) => (a.layerIndex ?? 40) - (b.layerIndex ?? 40) || a.startMs - b.startMs)
  if (normalized.length === 0) return 'null'
  return normalized.map((caption) => {
    const start = seconds(caption.startMs)
    const end = seconds(caption.endMs)
    const fontSize = Math.max(12, Math.min(96, Math.round(caption.fontSize ?? 42)))
    const yPercent = Math.max(5, Math.min(95, Math.round(caption.yPercent ?? 88))) / 100
    const color = sanitizeDrawtextColor(caption.textColor)
    const boxOpacity = Math.max(0, Math.min(100, Math.round(caption.boxOpacityPercent ?? 35))) / 100
    return [
      `drawtext=text='${escapeDrawtextText(caption.text)}'`,
      "x=(w-text_w)/2",
      `y=h*${yPercent.toFixed(2)}-text_h/2`,
      `fontsize=${fontSize}`,
      `fontcolor=${color}`,
      "borderw=3",
      "bordercolor=black@0.85",
      "box=1",
      `boxcolor=black@${boxOpacity.toFixed(2)}`,
      "boxborderw=18",
      `enable='between(t\\,${start}\\,${end})'`,
    ].join(':')
  }).join(',')
}

export function normalizeTimelineCaptions(captions: VideoTimelineExportCaptionInput[] | undefined): VideoTimelineExportCaptionInput[] {
  return (captions ?? [])
    .map(caption => ({
      startMs: Math.max(0, Math.round(caption.startMs)),
      endMs: Math.max(0, Math.round(caption.endMs)),
      text: caption.text.trim().replace(/\s+/g, ' '),
      layerIndex: clampFinite(caption.layerIndex, 40, -100, 100),
      fontSize: clampFinite(caption.fontSize, 42, 12, 96),
      yPercent: clampFinite(caption.yPercent, 88, 5, 95),
      textColor: sanitizeDrawtextColor(caption.textColor),
      boxOpacityPercent: clampFinite(caption.boxOpacityPercent, 35, 0, 100),
    }))
    .filter(caption => caption.text && caption.endMs > caption.startMs)
    .slice(0, MAX_TIMELINE_EXPORT_CAPTIONS)
}

function escapeDrawtextText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/,/g, '\\,')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/%/g, '\\%')
    .replace(/\n/g, ' ')
    .replace(/\r/g, ' ')
}

function sanitizeDrawtextColor(value: string | undefined): string {
  const normalized = value?.trim().toLowerCase()
  if (!normalized) return 'white'
  const hexMatch = normalized.match(/^#([0-9a-f]{6})$/)
  if (hexMatch) return `0x${hexMatch[1]}`
  const ffmpegHexMatch = normalized.match(/^0x[0-9a-f]{6}$/)
  return ffmpegHexMatch ? normalized : 'white'
}

function seconds(ms: number): string {
  return (Math.max(0, ms) / 1000).toFixed(3)
}

function clampFinite(value: number | undefined, fallback: number, min: number, max: number): number {
  const finiteValue = Number.isFinite(value) ? value as number : fallback
  return Math.min(max, Math.max(min, Math.round(finiteValue)))
}
