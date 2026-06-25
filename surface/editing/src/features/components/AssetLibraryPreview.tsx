import { useEffect, useRef } from 'react'
import { FileAudio, Image as ImageIcon, PlayCircle, Scissors } from 'lucide-react'
import { ResourceAuthImage, ResourceAuthVideo } from '@movscript/ui/business/resource'

import type { ElectronMediaPipelineAssetDescriptor } from '@movscript/editing-surface/contracts'

import { localMediaUrl } from '../media/localMedia'
import { seekVideoThumbnail } from '../media/videoFrames'

export function AssetLibraryPreview({ asset }: { asset: ElectronMediaPipelineAssetDescriptor }) {
  if (asset.assetType === 'image') {
    return (
      <span className="editing-workspace-asset-thumb editing-workspace-asset-thumb--media">
        <ResourceAuthImage src={localMediaUrl(asset)} alt={asset.label ?? asset.id} />
        <span className="editing-workspace-asset-thumb__badge">
          <ImageIcon size={14} />
        </span>
      </span>
    )
  }
  if (asset.assetType === 'video') {
    return (
      <span className="editing-workspace-asset-thumb editing-workspace-asset-thumb--media">
        <AssetLibraryVideoPreview asset={asset} />
        <span className="editing-workspace-asset-thumb__badge">
          <PlayCircle size={16} />
        </span>
      </span>
    )
  }
  if (asset.assetType === 'audio') {
    return (
      <span className="editing-workspace-asset-thumb editing-workspace-asset-thumb--audio">
        <span className="editing-workspace-waveform" aria-hidden="true">
          <i /><i /><i /><i /><i /><i /><i />
        </span>
        <span className="editing-workspace-asset-thumb__badge">
          <FileAudio size={14} />
        </span>
      </span>
    )
  }
  return (
    <span className="editing-workspace-asset-thumb editing-workspace-asset-thumb--fallback">
      <span className="editing-workspace-asset-thumb__center-icon">
        {asset.assetType === 'subtitle' || asset.assetType === 'text' ? <Scissors size={14} /> : <ImageIcon size={14} />}
      </span>
    </span>
  )
}

function AssetLibraryVideoPreview({ asset }: { asset: ElectronMediaPipelineAssetDescriptor }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const src = localMediaUrl(asset)

  useEffect(() => {
    seekVideoThumbnail(videoRef.current)
  }, [src])

  return (
    <ResourceAuthVideo
      videoRef={videoRef}
      src={src}
      muted
      playsInline
      preload="auto"
      onCanPlay={(event) => seekVideoThumbnail(event.currentTarget)}
      onLoadedMetadata={(event) => seekVideoThumbnail(event.currentTarget)}
    />
  )
}
