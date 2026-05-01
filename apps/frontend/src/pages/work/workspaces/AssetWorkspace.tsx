import { AssetDetail } from '@/components/detail'
import type { Asset } from '@/types'
import { ArtifactWorkspaceFrame } from '../ArtifactWorkspaceFrame'
import type { WorkspaceFrameProps } from './types'

interface AssetWorkspaceProps extends WorkspaceFrameProps {
  asset: Asset
}

export function AssetWorkspace({ asset }: AssetWorkspaceProps) {
  return (
    <ArtifactWorkspaceFrame
      kind="asset"
      title={asset.name}
      subtitle={`素材 · ${asset.type}`}
    >
      <AssetDetail asset={asset} showHeader={false} />
    </ArtifactWorkspaceFrame>
  )
}
