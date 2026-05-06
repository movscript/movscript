import { useQuery } from '@tanstack/react-query'
import { Image, PackageCheck } from 'lucide-react'

import { listSemanticEntities, semanticEntityConfig, type SemanticEntityRecord } from '@/api/semanticEntities'
import { cn } from '@/lib/utils'
import type { AssetSlot, Setting } from '@/types'

type SettingAssetSlot = SemanticEntityRecord & AssetSlot

export function SettingAssetOverview({ setting, className }: { setting: Setting; className?: string }) {
  const assetSlotConfig = semanticEntityConfig('assetSlots')
  const { data: allSlots = [], isLoading } = useQuery<SettingAssetSlot[]>({
    queryKey: ['setting-asset-slots-overview', setting.project_id, setting.ID],
    queryFn: () => listSemanticEntities(setting.project_id, assetSlotConfig) as Promise<SettingAssetSlot[]>,
    enabled: !!setting.project_id && !!setting.ID,
  })

  const slots = allSlots
    .filter((slot) => slot.creative_reference_id === setting.ID || (slot.owner_type === 'setting' && slot.owner_id === setting.ID))
    .slice(0, 6)

  return (
    <section className={cn('rounded-lg border border-border bg-card', className)}>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <PackageCheck size={15} className="text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">关联素材需求</p>
        </div>
        <span className="text-xs text-muted-foreground">{slots.length}</span>
      </div>
      <div className="p-4">
        {isLoading ? (
          <p className="py-8 text-center text-xs text-muted-foreground">正在加载素材需求</p>
        ) : slots.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-6 text-center">
            <Image size={22} className="mx-auto text-muted-foreground" />
            <p className="mt-2 text-sm font-medium text-foreground">暂无关联素材需求</p>
            <p className="mt-1 text-xs text-muted-foreground">素材需求会从设定资料继续传递到情景和内容制作。</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {slots.map((slot) => (
              <div key={slot.ID} className="rounded-md border border-border bg-background p-3">
                <p className="truncate text-sm font-medium text-foreground">{slot.name}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">{slot.status || slot.kind || 'asset_slot'}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
