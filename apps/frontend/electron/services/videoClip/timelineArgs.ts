import type { VideoClipInput } from './types'
import { ffmpegSeconds } from './time'
import { buildVideoFadeFilter } from './singleArgs'
import {
  buildCropFilter,
  normalizeTimelineSpeed,
} from './visualArgs'

export function buildTimelineSegmentArgs(
  input: VideoClipInput & { sourcePath: string; volume?: number; muted?: boolean; speed?: number },
  outputPath: string,
  durationMs: number,
): string[] {
  const start = ffmpegSeconds(input.startMs)
  const duration = ffmpegSeconds(durationMs)
  const speed = normalizeTimelineSpeed(input.speed)
  const filters = [
    buildCropFilter(input),
    buildVideoFadeFilter(input.fadeInMs, input.fadeOutMs, durationMs),
    speed === 1 ? '' : `setpts=${(1 / speed).toFixed(6)}*PTS`,
    'scale=1280:720:force_original_aspect_ratio=decrease',
    'pad=1280:720:(ow-iw)/2:(oh-ih)/2',
    'setsar=1',
  ].filter(Boolean).join(',')
  const args = [
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-i', input.sourcePath,
    '-ss', start,
    '-t', duration,
    '-map', '0:v:0',
    '-vf', filters,
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'veryfast',
    '-movflags', '+faststart',
  ]
  const volume = Math.max(0, Math.min(200, input.volume ?? 100))
  if (input.muted || volume <= 0) {
    args.push('-an')
  } else {
    args.push('-map', '0:a?')
    const audioFilters = [
      speed === 1 ? '' : buildAudioTempoFilter(speed),
      volume === 100 ? '' : `volume=${(volume / 100).toFixed(2)}`,
    ].filter(Boolean)
    if (audioFilters.length > 0) args.push('-filter:a', audioFilters.join(','))
    args.push('-c:a', 'aac', '-b:a', '128k')
  }
  args.push(outputPath)
  return args
}

export function buildAudioTempoFilter(speed: number): string {
  let remaining = normalizeTimelineSpeed(speed)
  const factors: number[] = []
  while (remaining > 2) {
    factors.push(2)
    remaining /= 2
  }
  while (remaining < 0.5) {
    factors.push(0.5)
    remaining /= 0.5
  }
  factors.push(remaining)
  return factors.map(factor => `atempo=${factor.toFixed(3)}`).join(',')
}

export function buildBlankVideoArgs(outputPath: string, durationMs: number): string[] {
  return [
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-f', 'lavfi',
    '-i', 'color=c=black:s=1280x720:r=30',
    '-f', 'lavfi',
    '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
    '-t', ffmpegSeconds(durationMs),
    '-shortest',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'veryfast',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    outputPath,
  ]
}
