import type { VideoClipInput } from './types'
import { ffmpegSeconds } from './time'

export function buildFFmpegArgs(input: VideoClipInput & { sourcePath: string }, outputPath: string, durationMs: number): string[] {
  const start = ffmpegSeconds(input.startMs)
  const duration = ffmpegSeconds(durationMs)
  if (input.mode === 'fast') {
    return [
      '-y',
      '-hide_banner',
      '-loglevel', 'error',
      '-ss', start,
      '-i', input.sourcePath,
      '-t', duration,
      '-map', '0:v:0',
      '-map', '0:a?',
      '-c', 'copy',
      '-movflags', '+faststart',
      outputPath,
    ].filter(Boolean)
  }
  const args = [
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-i', input.sourcePath,
    '-ss', start,
    '-t', duration,
    '-map', '0:v:0',
    '-map', '0:a?',
  ]
  const videoFadeFilter = buildVideoFadeFilter(input.fadeInMs, input.fadeOutMs, durationMs)
  if (videoFadeFilter) args.push('-vf', videoFadeFilter)
  args.push(
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'veryfast',
    '-movflags', '+faststart',
    '-c:a', 'aac',
    '-b:a', '128k',
    outputPath,
  )
  return args
}

export function buildVideoFadeFilter(fadeInMs: number | undefined, fadeOutMs: number | undefined, durationMs: number): string {
  const durationSeconds = Math.max(0, durationMs) / 1000
  const maxFadeSeconds = durationSeconds / 2
  const fadeInSeconds = Math.min(maxFadeSeconds, Math.max(0, fadeInMs ?? 0) / 1000)
  const fadeOutSeconds = Math.min(maxFadeSeconds, Math.max(0, fadeOutMs ?? 0) / 1000)
  const filters: string[] = []
  if (fadeInSeconds > 0) filters.push(`fade=t=in:st=0:d=${fadeInSeconds.toFixed(3)}`)
  if (fadeOutSeconds > 0) {
    const startSeconds = Math.max(0, durationSeconds - fadeOutSeconds)
    filters.push(`fade=t=out:st=${startSeconds.toFixed(3)}:d=${fadeOutSeconds.toFixed(3)}`)
  }
  return filters.join(',')
}
