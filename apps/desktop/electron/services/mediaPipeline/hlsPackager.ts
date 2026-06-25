import { mkdir, readdir, stat, writeFile } from 'fs/promises'
import { basename, extname, join } from 'path'

import {
  buildMediaHlsMasterManifest,
  buildMediaHlsPackageArgs,
  buildMediaHlsVariantPackageArgs,
  mediaHlsVariantBandwidth,
} from './ffmpegGraph'
import { runMediaPipelineFFmpeg, type MediaPipelineProcessOutput } from './ffmpegRunner'

export interface MediaPipelineHlsPackageResult {
  manifestPath: string
  manifestName: string
  outputDirectory: string
  segmentPaths: string[]
  variants?: MediaPipelineHlsVariantResult[]
}

export interface MediaPipelineHlsVariantSpec {
  name?: string
  width?: number
  height?: number
  videoBitrateKbps?: number
  video_bitrate_kbps?: number
  audioBitrateKbps?: number
  audio_bitrate_kbps?: number
}

export interface MediaPipelineHlsVariantResult {
  name: string
  manifestPath: string
  manifestName: string
  width?: number
  height?: number
  bandwidth: number
}

export async function packageMediaPipelineHls(input: {
  ffmpegPath: string
  sourceMp4Path: string
  outputDirectory: string
  manifestName?: string
  segmentDurationSec?: number
  variants?: MediaPipelineHlsVariantSpec[]
  signal?: AbortSignal
  onFFmpegOutput?: (output: MediaPipelineProcessOutput) => void
}): Promise<MediaPipelineHlsPackageResult> {
  const manifestName = normalizeHlsManifestName(input.manifestName)
  const segmentDurationSec = clampSegmentDuration(input.segmentDurationSec)
  await mkdir(input.outputDirectory, { recursive: true })
  const variants = normalizeHlsVariants(input.variants)
  if (variants.length > 0) {
    return packageVariantHls({
      ...input,
      manifestName,
      segmentDurationSec,
      variants,
    })
  }
  const manifestPath = join(input.outputDirectory, manifestName)
  const segmentPattern = join(input.outputDirectory, 'segment-%05d.m4s')
  await runMediaPipelineFFmpeg(input.ffmpegPath, buildMediaHlsPackageArgs({
    sourceMp4Path: input.sourceMp4Path,
    manifestPath,
    segmentPattern,
    segmentDurationSec,
    initName: 'init.mp4',
  }), {
    signal: input.signal,
    onOutput: input.onFFmpegOutput,
  })
  const segmentPaths = await listHlsSegments(input.outputDirectory, manifestName)
  await assertHlsOutput({ manifestPath, segmentPaths })
  return {
    manifestPath,
    manifestName,
    outputDirectory: input.outputDirectory,
    segmentPaths,
  }
}

async function packageVariantHls(input: {
  ffmpegPath: string
  sourceMp4Path: string
  outputDirectory: string
  manifestName: string
  segmentDurationSec: number
  variants: MediaPipelineHlsVariantSpec[]
  signal?: AbortSignal
  onFFmpegOutput?: (output: MediaPipelineProcessOutput) => void
}): Promise<MediaPipelineHlsPackageResult> {
  const variantResults: MediaPipelineHlsVariantResult[] = []
  for (const variant of input.variants) {
    const name = normalizeVariantName(variant.name)
    const manifestName = `${name}.m3u8`
    const initName = `${name}-init.mp4`
    const segmentPattern = join(input.outputDirectory, `${name}-segment-%05d.m4s`)
    const manifestPath = join(input.outputDirectory, manifestName)
    await runMediaPipelineFFmpeg(input.ffmpegPath, buildMediaHlsVariantPackageArgs({
      sourceMp4Path: input.sourceMp4Path,
      manifestPath,
      segmentPattern,
      initName,
      segmentDurationSec: input.segmentDurationSec,
      variant,
    }), {
      signal: input.signal,
      onOutput: input.onFFmpegOutput,
    })
    variantResults.push({
      name,
      manifestPath,
      manifestName,
      ...(variant.width ? { width: variant.width } : {}),
      ...(variant.height ? { height: variant.height } : {}),
      bandwidth: mediaHlsVariantBandwidth(variant),
    })
  }
  const masterPath = join(input.outputDirectory, input.manifestName)
  await writeFile(masterPath, buildMediaHlsMasterManifest(variantResults), 'utf8')
  const segmentPaths = await listHlsSegments(input.outputDirectory, input.manifestName)
  await assertHlsOutput({ manifestPath: masterPath, segmentPaths })
  return {
    manifestPath: masterPath,
    manifestName: input.manifestName,
    outputDirectory: input.outputDirectory,
    segmentPaths,
    variants: variantResults,
  }
}

export function normalizeHlsManifestName(value: string | undefined): string {
  const raw = value?.trim() || 'index.m3u8'
  const cleaned = raw.replace(/[\u0000-\u001f<>:"|?*\\/]+/g, '_')
  const ext = extname(cleaned).toLowerCase()
  const base = (ext ? cleaned.slice(0, -ext.length) : cleaned)
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^\.+$/, '')
    .replace(/^\.*/, '')
    .replace(/\.*$/, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120) || 'index'
  return `${base}.m3u8`
}

async function listHlsSegments(outputDirectory: string, masterManifestName: string): Promise<string[]> {
  const entries = await readdir(outputDirectory)
  return entries
    .filter((entry) => entry !== masterManifestName)
    .filter((entry) => {
      const lower = entry.toLowerCase()
      return basename(entry) === entry && (lower.endsWith('.mp4') || lower.endsWith('.m4s') || lower.endsWith('.m3u8'))
    })
    .sort((left, right) => left.localeCompare(right))
    .map((entry) => join(outputDirectory, entry))
}

async function assertHlsOutput(input: { manifestPath: string; segmentPaths: string[] }): Promise<void> {
  const manifest = await stat(input.manifestPath).catch(() => undefined)
  if (!manifest?.isFile()) {
    throw new Error(`HLS_PACKAGE_MANIFEST_MISSING: ${input.manifestPath}`)
  }
  if (input.segmentPaths.length === 0) {
    throw new Error('HLS_PACKAGE_SEGMENTS_MISSING: ffmpeg did not produce any HLS segments.')
  }
}

function clampSegmentDuration(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 6
  return Math.min(30, Math.max(1, Math.round(value)))
}

function normalizeHlsVariants(value: MediaPipelineHlsVariantSpec[] | undefined): MediaPipelineHlsVariantSpec[] {
  if (!Array.isArray(value)) return []
  const variants = value
    .map((variant, index) => ({
      ...variant,
      name: normalizeVariantName(variant.name || (variant.height ? `${variant.height}p` : `variant-${index + 1}`)),
      width: positiveInt(variant.width),
      height: positiveInt(variant.height),
      videoBitrateKbps: positiveInt(variant.videoBitrateKbps ?? variant.video_bitrate_kbps),
      audioBitrateKbps: positiveInt(variant.audioBitrateKbps ?? variant.audio_bitrate_kbps),
    }))
    .filter((variant) => variant.videoBitrateKbps || variant.height || variant.width)
    .slice(0, 6)
  const seen = new Set<string>()
  return variants.map((variant, index) => {
    let name = normalizeVariantName(variant.name)
    if (seen.has(name)) name = `${name}-${index + 1}`
    seen.add(name)
    return { ...variant, name }
  })
}

function positiveInt(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined
}

function normalizeVariantName(value: string | undefined): string {
  return (value || 'variant')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'variant'
}
