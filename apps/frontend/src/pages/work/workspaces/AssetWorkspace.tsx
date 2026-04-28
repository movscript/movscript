import { AssetDetail } from '@/components/detail'
import type { Asset } from '@/types'
import { ArtifactWorkspaceFrame } from '../ArtifactWorkspaceFrame'
import type { WorkspaceFrameProps } from './types'

interface AssetWorkspaceProps extends WorkspaceFrameProps {
  asset: Asset
}

export function AssetWorkspace({ asset, node, pipeline, members, onNodeUpdated }: AssetWorkspaceProps) {
  return (
    <ArtifactWorkspaceFrame
      kind="asset"
      title={asset.name}
      subtitle={`素材 · ${asset.type}`}
      node={node}
      pipeline={pipeline}
      members={members}
      onNodeUpdated={onNodeUpdated}
    >
      <AssetDetail asset={asset} showHeader={false} />
    </ArtifactWorkspaceFrame>
  )
}
