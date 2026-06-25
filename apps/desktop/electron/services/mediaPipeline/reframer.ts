import { dirname } from 'node:path'
import { mkdir } from 'node:fs/promises'

import { buildMediaReframeArgs, buildMediaReframeFilter } from './ffmpegGraph'
import { runMediaPipelineFFmpeg, type MediaPipelineProcessOutput } from './ffmpegRunner'
import type { MediaPipelineReframeSpec } from './types'

export interface MediaPipelineReframeResult {
  outputPath: string
  width: number
  height: number
  mode: 'crop' | 'contain' | 'stretch'
  filter: string
}

export async function reframeMediaPipelineSource(input: {
  ffmpegPath: string
  sourcePath: string
  outputPath: string
  spec?: MediaPipelineReframeSpec
  target?: string
  mode?: string
  signal?: AbortSignal
  onFFmpegOutput?: (output: MediaPipelineProcessOutput) => void
}): Promise<MediaPipelineReframeResult> {
  const target = resolveReframeTarget(input.spec, input.target)
  const mode = normalizeReframeMode(input.spec?.mode ?? input.mode)
  const background = normalizeColor(input.spec?.background) ?? '#000000'
  const filter = buildMediaReframeFilter({ width: target.width, height: target.height, mode, background })
  await mkdir(dirname(input.outputPath), { recursive: true })
  await runMediaPipelineFFmpeg(input.ffmpegPath, buildMediaReframeArgs({
    sourcePath: input.sourcePath,
    outputPath: input.outputPath,
    filter,
  }), {
    signal: input.signal,
    onOutput: input.onFFmpegOutput,
  })
  return {
    outputPath: input.outputPath,
    width: target.width,
    height: target.height,
    mode,
    filter,
  }
}

export function resolveReframeTarget(spec: MediaPipelineReframeSpec | undefined, targetInput: string | undefined): { width: number; height: number; label: string } {
  const width = positiveInteger(spec?.width)
  const height = positiveInteger(spec?.height)
  if (width && height) return { width, height, label: `${width}x${height}` }

  const target = normalizeTarget(targetInput ?? spec?.target)
  const explicit = target ? /^(\d{2,5})x(\d{2,5})$/.exec(target) : undefined
  if (explicit) {
    const parsedWidth = Number(explicit[1])
    const parsedHeight = Number(explicit[2])
    if (parsedWidth > 0 && parsedHeight > 0) return { width: parsedWidth, height: parsedHeight, label: `${parsedWidth}x${parsedHeight}` }
  }

  switch (target) {
    case '1:1':
    case 'square':
      return { width: 1080, height: 1080, label: '1:1' }
    case '16:9':
    case 'landscape':
    case 'youtube':
      return { width: 1920, height: 1080, label: '16:9' }
    case '4:5':
    case 'portrait_feed':
      return { width: 1080, height: 1350, label: '4:5' }
    case '9:16':
    case 'vertical':
    case 'portrait':
    case 'shorts':
    case 'reels':
    case 'tiktok':
    case undefined:
    case '':
      return { width: 1080, height: 1920, label: '9:16' }
    default:
      throw new Error(`REFRAME_TARGET_UNSUPPORTED: unsupported reframe target "${targetInput}". Use 9:16, 16:9, 1:1, 4:5, or WIDTHxHEIGHT.`)
  }
}

export function normalizeReframeMode(value: string | undefined): 'crop' | 'contain' | 'stretch' {
  const normalized = value?.trim().toLowerCase()
  if (!normalized || normalized === 'crop' || normalized === 'cover') return 'crop'
  if (normalized === 'contain' || normalized === 'pad') return 'contain'
  if (normalized === 'stretch' || normalized === 'fill') return 'stretch'
  throw new Error(`REFRAME_MODE_UNSUPPORTED: unsupported reframe mode "${value}". Use crop, contain, pad, or stretch.`)
}

function normalizeTarget(value: string | undefined): string | undefined {
  return value?.trim().toLowerCase().replace(/\s+/g, '_')
}

function normalizeColor(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed || undefined
}

function positiveInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  const rounded = Math.round(value)
  return rounded > 0 ? rounded : undefined
}
