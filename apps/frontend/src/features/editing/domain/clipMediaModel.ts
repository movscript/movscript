import type {
  ElectronMediaPipelineAssetDescriptor,
  ElectronMediaPipelineClip,
  ElectronMediaPipelineEditingProject,
} from '@/shared/contracts/electronApiMedia'

import { EDITING_TIMELINE_MIN_CLIP_DURATION_MS } from './constants'
import { clampTimelineRange } from './timelineGeometry'

export function defaultClipDurationMs(asset: ElectronMediaPipelineAssetDescriptor) {
  const sourceDurationMs = clipAssetDurationMs(asset)
  if (sourceDurationMs && (asset.assetType === 'video' || asset.assetType === 'audio')) return sourceDurationMs
  if (asset.assetType === 'audio') return 10000
  if (asset.assetType === 'subtitle' || asset.assetType === 'text') return 3000
  return 5000
}

export function resolveClipFit(
  asset: ElectronMediaPipelineAssetDescriptor,
  project: ElectronMediaPipelineEditingProject | undefined,
  requestedFit: NonNullable<ElectronMediaPipelineClip['fit']>,
): NonNullable<ElectronMediaPipelineClip['fit']> {
  if (asset.assetType !== 'video' && asset.assetType !== 'image') return 'none'
  const assetRatio = assetAspectRatio(asset)
  const projectRatio = project ? project.timeline.width / project.timeline.height : undefined
  if (!assetRatio || !projectRatio || !Number.isFinite(projectRatio)) return requestedFit
  return requestedFit
}

export function assetAspectRatio(asset: ElectronMediaPipelineAssetDescriptor) {
  const metadata = asset.metadata ?? {}
  const width = numberMetadata(metadata.width ?? metadata.videoWidth ?? metadata.imageWidth ?? metadata.naturalWidth)
  const height = numberMetadata(metadata.height ?? metadata.videoHeight ?? metadata.imageHeight ?? metadata.naturalHeight)
  if (!width || !height) return undefined
  return width / height
}

export function numberMetadata(value: unknown) {
  const numericValue = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : undefined
}

export function clipAssetDurationMs(asset: ElectronMediaPipelineAssetDescriptor): number | undefined {
  const explicitMs = numberMetadata(asset.metadata?.durationMs ?? asset.metadata?.duration_ms)
  if (explicitMs) return Math.round(explicitMs)
  const durationSeconds = numberMetadata(asset.metadata?.duration)
  return durationSeconds ? Math.round(durationSeconds * 1000) : undefined
}

export function normalizeClipSourceStartMs(
  valueMs: number,
  sourceDurationMs: number | undefined,
  assetType: ElectronMediaPipelineAssetDescriptor['assetType'],
): number {
  if (!sourceDurationMs || assetType === 'image') return Math.max(0, Math.round(valueMs))
  return clampTimelineRange(
    Math.round(valueMs),
    0,
    Math.max(0, sourceDurationMs - EDITING_TIMELINE_MIN_CLIP_DURATION_MS),
  )
}
