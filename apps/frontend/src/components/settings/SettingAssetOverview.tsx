import { useQuery } from '@tanstack/react-query'
import { Image, PackageCheck } from 'lucide-react'

import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { Asset, PaginatedResponse, Setting } from '@/types'

export function SettingAssetOverview({ setting, className }: { setting: Setting; className?: string }) {
  const { data, isLoading } = useQuery<PaginatedResponse<Asset>>({
    queryKey: ['setting-assets-overview', setting.project_id, setting.ID],
    queryFn: () => api.get(`/projects/${setting.project_id}/assets`, {
      params: { setting_id: setting.ID, page: 1, page_size: 6 },
    }).then((r) => r.data),
    enabled: !!setting.project_id && !!setting.ID,
  })

  const assets = data?.items ?? []

  return (
    <section className={cn('rounded-lg border border-border bg-card', className)}>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <PackageCheck size={15} className="text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">关联素材</p>
        </div>
        <span className="text-xs text-muted-foreground">{data?.total ?? assets.length}</span>
      </div>
      <div className="p-4">
        {isLoading ? (
          <p className="py-8 text-center text-xs text-muted-foreground">正在加载素材</p>
        ) : assets.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-6 text-center">
            <Image size={22} className="mx-auto text-muted-foreground" />
            <p className="mt-2 text-sm font-medium text-foreground">暂无关联素材</p>
            <p className="mt-1 text-xs text-muted-foreground">素材会从资料继续传递到情节和内容生产。</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {assets.map((asset) => (
              <div key={asset.ID} className="rounded-md border border-border bg-background p-3">
                <p className="truncate text-sm font-medium text-foreground">{asset.name}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">{asset.state || asset.effective_status || asset.type}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
