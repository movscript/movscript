import type { ElectronMediaPipelineAssetDescriptor } from '@/shared/contracts/electronApiMedia'

import { hashText } from './utils'

export function createLocalAsset(localPath: string): ElectronMediaPipelineAssetDescriptor {
  const label = fileNameFromPath(localPath)
  return {
    id: `local_${hashText(localPath)}`,
    sourceKind: 'local_file',
    assetType: inferAssetType(localPath),
    localPath,
    label,
    metadata: {
      fileExtension: fileExtensionFromPath(localPath),
    },
  }
}

export function createAudioAssetFromVideo(asset: ElectronMediaPipelineAssetDescriptor): ElectronMediaPipelineAssetDescriptor {
  const label = asset.label ?? asset.id
  return {
    ...asset,
    id: `audio_${asset.id}`,
    assetType: 'audio',
    label: label.endsWith(' · 音频') ? label : `${label} · 音频`,
    mimeType: asset.mimeType?.startsWith('audio/') ? asset.mimeType : 'audio/mp4',
    metadata: {
      ...(asset.metadata ?? {}),
      extractedAudio: true,
      extractedFromAssetId: asset.id,
      extractedFromAssetType: asset.assetType,
    },
  }
}

export function isExtractedAudioAsset(asset: ElectronMediaPipelineAssetDescriptor) {
  return asset.assetType === 'audio' && Boolean(asset.metadata?.extractedAudio)
}

export function upsertAsset(
  assets: ElectronMediaPipelineAssetDescriptor[],
  asset: ElectronMediaPipelineAssetDescriptor,
) {
  return [asset, ...assets.filter((candidate) => candidate.id !== asset.id)]
}

export function inferAssetType(localPath: string): ElectronMediaPipelineAssetDescriptor['assetType'] {
  const extension = fileExtensionFromPath(localPath)
  if (['mp3', 'wav', 'aac', 'm4a', 'flac', 'ogg'].includes(extension)) return 'audio'
  if (['srt', 'vtt', 'ass', 'ssa'].includes(extension)) return 'subtitle'
  if (['txt', 'md'].includes(extension)) return 'text'
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif'].includes(extension)) return 'image'
  return 'video'
}

export function fileNameFromPath(localPath: string) {
  return localPath.split(/[\\/]/).filter(Boolean).at(-1) ?? localPath
}

export function fileExtensionFromPath(localPath: string) {
  const filename = fileNameFromPath(localPath).toLowerCase()
  const dotIndex = filename.lastIndexOf('.')
  return dotIndex >= 0 ? filename.slice(dotIndex + 1) : ''
}
