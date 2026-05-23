import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { File, HardDrive, Search } from 'lucide-react'

import { AuthedImage, AuthedVideo } from '@/components/shared/AuthedImage'
import { API_BASE_URL as API_BASE } from '@/lib/config'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Badge, Input, semanticToneClass } from '@movscript/ui'
import type { PaginatedResponse, RawResource, ResourceBinding } from '@/types'
import { resourceMatchesSearch, resourceToNodeType } from '@/features/canvas/integrations/resources'

export function CanvasResourceShelf({
  projectId,
  dependencyBindings = [],
  variant = 'floating',
}: {
  projectId?: number
  dependencyBindings?: ResourceBinding[]
  variant?: 'floating' | 'panel' | 'side'
}) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const isPanel = variant === 'panel'
  const isSide = variant === 'side'
  const { data: resourcePage } = useQuery<PaginatedResponse<RawResource>>({
    queryKey: ['canvas-resource-shelf', 'resources'],
    queryFn: () => api.get('/resources', { params: { page: 1, page_size: 48, type: 'image,video,text' } }).then((r) => r.data),
  })
  const resources = (resourcePage?.items ?? []).filter((resource) => resourceToNodeType(resource))
  const resourceItems = resources.filter((resource) => resourceMatchesSearch(resource, search))
  const activeFilteredCount = resourceItems.length

  function dragResource(event: React.DragEvent, resource: RawResource) {
    event.dataTransfer.setData('application/canvas-resource', JSON.stringify(resource))
    event.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <div className={cn(
      isPanel || isSide
        ? 'flex h-full flex-col overflow-hidden bg-background'
        : 'pointer-events-auto absolute bottom-4 left-4 right-24 z-10 overflow-hidden rounded-lg border border-border bg-background/95 shadow-lg backdrop-blur'
    )}>
      <div className={cn(
        isSide ? 'shrink-0 space-y-2 border-b border-border px-3 py-3' : 'flex h-11 shrink-0 items-center gap-2 border-b border-border px-3'
      )}>
        {!isPanel && !isSide && (
          <>
            <HardDrive size={14} className="text-muted-foreground" />
            <span className="shrink-0 type-label font-semibold text-foreground">{t('canvas.editor.resourceShelf.title')}</span>
          </>
        )}
        <nav className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
          <span className="flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-primary bg-primary px-2.5 type-label text-primary-foreground">
            <span className="truncate">资源库</span>
            <span className="shrink-0 rounded bg-primary-foreground/20 px-1 tabular-nums type-tiny text-primary-foreground">{resources.length}</span>
          </span>
        </nav>
        <div className={cn('relative', isSide ? 'w-full' : 'min-w-[180px] max-w-[340px] flex-[0_1_340px]')}>
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-7 pl-7 type-label"
            placeholder="搜索资源：名称、类型、ID"
          />
        </div>
        <span className="shrink-0 type-caption text-muted-foreground">
          {search.trim() ? `${activeFilteredCount} 个结果` : t('canvas.editor.resourceShelf.dragHint')}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-w-0 flex-1 overflow-auto p-3">
          {resourceItems.length > 0 ? (
            <div className={cn(isSide ? 'grid grid-cols-1 gap-2' : 'grid auto-rows-[150px] grid-cols-[repeat(auto-fill,236px)] gap-3')}>
              {resourceItems.map((resource) => (
                <ResourceShelfCard
                  key={resource.ID}
                  resource={resource}
                  selected={dependencyBindings.some((binding) => binding.resource_id === resource.ID)}
                  compact={isSide}
                  onDragStart={(event) => dragResource(event, resource)}
                />
              ))}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center type-label text-muted-foreground">
              {t('shared.resourcePanel.noResources')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ResourceShelfCard({
  resource,
  selected,
  compact = false,
  onDragStart,
}: {
  resource: RawResource
  selected?: boolean
  compact?: boolean
  onDragStart: (event: React.DragEvent) => void
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      className={cn(
        'group flex shrink-0 cursor-grab flex-col overflow-hidden rounded-lg border bg-card text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-foreground/25 hover:shadow-md active:cursor-grabbing',
        compact ? 'h-[132px] w-full' : 'h-[150px] w-[236px]',
        selected ? cn(semanticToneClass('success', 'surface'), 'ring-1') : 'border-border',
      )}
      title={resource.name}
    >
      <div className="flex min-h-0 flex-1 gap-3 p-3">
        <div className={cn(
          'flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted text-muted-foreground',
          compact ? 'h-16 w-16' : 'h-[82px] w-[82px]'
        )}>
          <div className="h-full w-full">
            <ResourceThumb resource={resource} />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <Badge variant="outline" className="shrink-0 type-tiny leading-none">{resource.type}</Badge>
            {selected ? <span className={cn('truncate type-tiny leading-none', semanticToneClass('success', 'icon'))}>已作为依赖</span> : null}
          </div>
          <p className="mt-2 line-clamp-2 min-h-9 type-body font-semibold leading-[18px] text-foreground">{resource.name}</p>
          <p className="mt-1 line-clamp-2 type-caption leading-4 text-muted-foreground">
            {resource.mime_type || resource.type}
          </p>
        </div>
      </div>
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-t border-border bg-muted/25 px-3 type-tiny text-muted-foreground">
        <span className="truncate">#{resource.ID}</span>
        <span className="truncate">{selected ? '可直接拖入画布' : formatBytes(resource.size)}</span>
      </div>
    </div>
  )
}

function ResourceThumb({ resource }: { resource: RawResource }) {
  const url = resource.direct_url ?? (resource.url ? `${API_BASE}${resource.url}` : '')
  if (resource.type === 'image') {
    return resource.direct_url
      ? <img src={resource.direct_url} alt="" className="h-full w-full object-cover" />
      : <AuthedImage src={url} alt="" className="h-full w-full object-cover" />
  }
  if (resource.type === 'video') {
    return resource.direct_url
      ? <video src={resource.direct_url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
      : <AuthedVideo src={url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
  }
  return <File size={14} className="text-muted-foreground" />
}

function formatBytes(value: number | undefined) {
  if (!value) return '-'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}
