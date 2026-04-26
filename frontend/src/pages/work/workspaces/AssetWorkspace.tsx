import { AssetDetail } from '@/components/detail'
import type { Asset } from '@/types'

export function AssetWorkspace({ asset }: { asset: Asset }) {
  return <AssetDetail asset={asset} />
}
