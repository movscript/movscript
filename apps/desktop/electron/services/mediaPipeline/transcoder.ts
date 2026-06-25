import { dirname } from 'node:path'
import { mkdir } from 'node:fs/promises'

import { buildMediaTranscodeArgs } from './ffmpegGraph'
import { runMediaPipelineFFmpeg, type MediaPipelineProcessOutput } from './ffmpegRunner'
import type { MediaPipelineTranscodeSpec } from './types'

export interface MediaPipelineTranscodeResult {
  outputPath: string
  videoCodec: string
  audioCodec: string
  videoBitrateKbps?: number
  audioBitrateKbps?: number
}

export async function transcodeMediaPipelineSource(input: {
  ffmpegPath: string
  sourcePath: string
  outputPath: string
  spec?: MediaPipelineTranscodeSpec
  signal?: AbortSignal
  onFFmpegOutput?: (output: MediaPipelineProcessOutput) => void
}): Promise<MediaPipelineTranscodeResult> {
  const videoCodec = normalizeCodec(input.spec?.videoCodec ?? input.spec?.video_codec) ?? 'libx264'
  const audioCodec = normalizeCodec(input.spec?.audioCodec ?? input.spec?.audio_codec) ?? 'aac'
  const videoBitrateKbps = positiveInteger(input.spec?.videoBitrateKbps ?? input.spec?.video_bitrate_kbps)
  const audioBitrateKbps = positiveInteger(input.spec?.audioBitrateKbps ?? input.spec?.audio_bitrate_kbps)
  await mkdir(dirname(input.outputPath), { recursive: true })
  await runMediaPipelineFFmpeg(input.ffmpegPath, buildMediaTranscodeArgs({
    sourcePath: input.sourcePath,
    outputPath: input.outputPath,
    videoCodec,
    audioCodec,
    ...(videoBitrateKbps ? { videoBitrateKbps } : {}),
    ...(audioBitrateKbps ? { audioBitrateKbps } : {}),
  }), {
    signal: input.signal,
    onOutput: input.onFFmpegOutput,
  })
  return {
    outputPath: input.outputPath,
    videoCodec,
    audioCodec,
    ...(videoBitrateKbps ? { videoBitrateKbps } : {}),
    ...(audioBitrateKbps ? { audioBitrateKbps } : {}),
  }
}

function normalizeCodec(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed || undefined
}

function positiveInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  const rounded = Math.round(value)
  return rounded > 0 ? rounded : undefined
}
