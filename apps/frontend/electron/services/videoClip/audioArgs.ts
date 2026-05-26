import type { VideoTimelineExportAudioInput } from './types'
import { MAX_TIMELINE_EXPORT_AUDIO_CLIPS } from './constants'

export function buildAudioMixArgs(
  videoPath: string,
  audioInputPaths: string[],
  outputPath: string,
  audioClips: VideoTimelineExportAudioInput[],
): string[] {
  const normalized = normalizeTimelineAudioClips(audioClips).slice(0, audioInputPaths.length)
  const filter = buildAudioMixFilter(normalized)
  const args = [
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-i', videoPath,
  ]
  for (const path of audioInputPaths) args.push('-i', path)
  args.push(
    '-filter_complex', filter,
    '-map', '0:v:0',
    '-map', '[aout]',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '160k',
    '-shortest',
    '-movflags', '+faststart',
    outputPath,
  )
  return args
}

export function buildAudioMixFilter(audioClips: VideoTimelineExportAudioInput[]): string {
  const normalized = normalizeTimelineAudioClips(audioClips)
  if (normalized.length === 0) return 'anullsrc=channel_layout=stereo:sample_rate=48000[aout]'
  const chains = normalized.map((clip, index) => {
    const inputIndex = index + 1
    const start = seconds(clip.startMs)
    const duration = seconds(clip.endMs - clip.startMs)
    const delay = Math.round(clip.timelineStartMs)
    const volume = Math.max(0, Math.min(2, (clip.volume ?? 100) / 100)).toFixed(2)
    const fadeFilters = buildAudioFadeFilters(clip)
    return `[${inputIndex}:a]atrim=start=${start}:duration=${duration},asetpts=PTS-STARTPTS,volume=${volume}${fadeFilters.length ? `,${fadeFilters.join(',')}` : ''},adelay=${delay}|${delay}[a${index}]`
  })
  const mixInputs = normalized.map((_, index) => `[a${index}]`).join('')
  return `${chains.join(';')};${mixInputs}amix=inputs=${normalized.length}:duration=longest:dropout_transition=0[aout]`
}

function buildAudioFadeFilters(clip: VideoTimelineExportAudioInput): string[] {
  const durationMs = Math.max(0, clip.endMs - clip.startMs)
  const maxFadeSeconds = durationMs / 2000
  const fadeInSeconds = Math.min(maxFadeSeconds, Math.max(0, clip.fadeInMs ?? 0) / 1000)
  const fadeOutSeconds = Math.min(maxFadeSeconds, Math.max(0, clip.fadeOutMs ?? 0) / 1000)
  const filters: string[] = []
  if (fadeInSeconds > 0) filters.push(`afade=t=in:st=0:d=${fadeInSeconds.toFixed(3)}`)
  if (fadeOutSeconds > 0) {
    const startSeconds = Math.max(0, durationMs / 1000 - fadeOutSeconds)
    filters.push(`afade=t=out:st=${startSeconds.toFixed(3)}:d=${fadeOutSeconds.toFixed(3)}`)
  }
  return filters
}

export function normalizeTimelineAudioClips(audioClips: VideoTimelineExportAudioInput[] | undefined): VideoTimelineExportAudioInput[] {
  return (audioClips ?? [])
    .map(clip => ({
      sourceData: clip.sourceData,
      sourceName: clip.sourceName,
      startMs: Math.max(0, Math.round(clip.startMs)),
      endMs: Math.max(0, Math.round(clip.endMs)),
      timelineStartMs: Math.max(0, Math.round(clip.timelineStartMs)),
      volume: clip.volume == null ? undefined : Math.max(0, Math.min(200, clip.volume)),
      fadeInMs: clampFinite(clip.fadeInMs, 0, 0, Math.max(0, Math.floor((clip.endMs - clip.startMs) / 2))),
      fadeOutMs: clampFinite(clip.fadeOutMs, 0, 0, Math.max(0, Math.floor((clip.endMs - clip.startMs) / 2))),
    }))
    .filter(clip => clip.sourceData && clip.endMs > clip.startMs)
    .slice(0, MAX_TIMELINE_EXPORT_AUDIO_CLIPS)
}

function seconds(ms: number): string {
  return (Math.max(0, ms) / 1000).toFixed(3)
}

function clampFinite(value: number | undefined, fallback: number, min: number, max: number): number {
  const finiteValue = Number.isFinite(value) ? value as number : fallback
  return Math.min(max, Math.max(min, Math.round(finiteValue)))
}
