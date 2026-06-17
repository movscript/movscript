import type { ElectronMediaPipelineAssetDescriptor } from '@/shared/contracts/electronApiMedia'
import {
  loadImageProbeMetadataFromUrl,
  loadTimedMediaProbeMetadataFromUrl,
} from '@/shared/ui/VideoProbe'

const EDITING_LOCAL_FILE_MEDIA_URL = 'movscript-media://local-file/'
const EDITING_LOCAL_MEDIA_PROBE_TIMEOUT_MS = 5000

export function localMediaUrl(asset: ElectronMediaPipelineAssetDescriptor) {
  if (!asset.localPath) return undefined
  const localPath = asset.localPath.trim()
  if (!localPath) return undefined
  if (/^[a-z][a-z0-9+.-]*:/i.test(localPath)) return localPath
  if (/^[a-zA-Z]:[\\/]/.test(localPath) || localPath.startsWith('/')) return `${EDITING_LOCAL_FILE_MEDIA_URL}?path=${encodeURIComponent(localPath)}`
  return localPath
}

export function mediaDurationMs(media: HTMLMediaElement) {
  return Number.isFinite(media.duration) && media.duration > 0 ? Math.round(media.duration * 1000) : 0
}

export async function probeLocalMediaAsset(asset: ElectronMediaPipelineAssetDescriptor): Promise<ElectronMediaPipelineAssetDescriptor> {
  const src = localMediaUrl(asset)
  if (!src) return asset
  try {
    if (asset.assetType === 'video' || asset.assetType === 'audio') {
      return await probeTimedMediaAsset(asset, src)
    }
    if (asset.assetType === 'image') {
      return await probeImageAsset(asset, src)
    }
  } catch {
    return asset
  }
  return asset
}

export function mediaAssetDurationMs(asset: ElectronMediaPipelineAssetDescriptor): number | undefined {
  const explicitMs = numericMetadata(asset.metadata?.durationMs ?? asset.metadata?.duration_ms)
  if (explicitMs) return Math.round(explicitMs)
  const durationSeconds = numericMetadata(asset.metadata?.duration)
  return durationSeconds ? Math.round(durationSeconds * 1000) : undefined
}

async function probeTimedMediaAsset(
  asset: ElectronMediaPipelineAssetDescriptor,
  src: string,
): Promise<ElectronMediaPipelineAssetDescriptor> {
  if (asset.assetType !== 'audio' && asset.assetType !== 'video') return asset
  const metadata = await loadTimedMediaProbeMetadataFromUrl(src, asset.assetType, EDITING_LOCAL_MEDIA_PROBE_TIMEOUT_MS)
  return {
    ...asset,
    metadata: {
      ...(asset.metadata ?? {}),
      ...(metadata.durationMs ? { durationMs: metadata.durationMs } : {}),
      ...(metadata.width ? { width: metadata.width, videoWidth: metadata.width } : {}),
      ...(metadata.height ? { height: metadata.height, videoHeight: metadata.height } : {}),
    },
  }
}

async function probeImageAsset(
  asset: ElectronMediaPipelineAssetDescriptor,
  src: string,
): Promise<ElectronMediaPipelineAssetDescriptor> {
  const metadata = await loadImageProbeMetadataFromUrl(src, EDITING_LOCAL_MEDIA_PROBE_TIMEOUT_MS)
  return {
    ...asset,
    metadata: {
      ...(asset.metadata ?? {}),
      ...(metadata.width ? { width: metadata.width, imageWidth: metadata.width } : {}),
      ...(metadata.height ? { height: metadata.height, imageHeight: metadata.height } : {}),
    },
  }
}

function numericMetadata(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined
}
