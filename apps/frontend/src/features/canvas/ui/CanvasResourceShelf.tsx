import { useState, type DragEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { File, HardDrive, Search } from 'lucide-react'

import { AuthedImage, AuthedVideo } from '@/shared/ui/AuthedImage'
import { API_BASE_URL as API_BASE } from '@/shared/infrastructure/config'
import { api } from '@/shared/infrastructure/api'
import {
  CanvasMediaEmptyIcon,
  CanvasMediaFill,
  CanvasResourceShelfView,
  type CanvasResourceShelfItem,
} from '@movscript/ui'
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
  const { data: resourcePage } = useQuery<PaginatedResponse<RawResource>>({
    queryKey: ['canvas-resource-shelf', 'resources'],
    queryFn: () => api.get('/resources', { params: { page: 1, page_size: 48, type: 'image,video,text' } }).then((r) => r.data),
  })
  const resources = (resourcePage?.items ?? []).filter((resource) => resourceToNodeType(resource))
  const resourceItems = resources.filter((resource) => resourceMatchesSearch(resource, search))
  const activeFilteredCount = resourceItems.length
  const shelfItems: CanvasResourceShelfItem[] = resourceItems.map((resource) => ({
    id: resource.ID,
    type: resource.type,
    name: resource.name,
    description: resource.mime_type || resource.type,
    footerMeta: formatBytes(resource.size),
    selected: dependencyBindings.some((binding) => binding.resource_id === resource.ID),
    media: <ResourceThumb resource={resource} />,
  }))

  function dragResource(event: DragEvent<HTMLDivElement>, item: CanvasResourceShelfItem) {
    const resource = resourceItems.find((candidate) => candidate.ID === item.id)
    if (!resource) return
    event.dataTransfer.setData('application/canvas-resource', JSON.stringify(resource))
    event.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <CanvasResourceShelfView
      variant={variant}
      title={t('canvas.editor.resourceShelf.title')}
      titleIcon={<HardDrive size={14} />}
      navLabel="资源库"
      totalCount={resources.length}
      searchIcon={<Search size={12} />}
      searchValue={search}
      onSearchChange={(event) => setSearch(event.target.value)}
      searchPlaceholder="搜索资源：名称、类型、ID"
      hint={search.trim() ? `${activeFilteredCount} 个结果` : t('canvas.editor.resourceShelf.dragHint')}
      emptyTitle={t('shared.resourcePanel.noResources')}
      items={shelfItems}
      selectedLabel="已作为依赖"
      dragMetaLabel="可直接拖入画布"
      onItemDragStart={dragResource}
    />
  )
}

function ResourceThumb({ resource }: { resource: RawResource }) {
  const url = resource.direct_url ?? (resource.url ? `${API_BASE}${resource.url}` : '')
  if (resource.type === 'image') {
    return resource.direct_url
      ? <CanvasMediaFill><img src={resource.direct_url} alt="" /></CanvasMediaFill>
      : <CanvasMediaFill><AuthedImage src={url} alt="" /></CanvasMediaFill>
  }
  if (resource.type === 'video') {
    return resource.direct_url
      ? <CanvasMediaFill><video src={resource.direct_url} muted playsInline preload="metadata" /></CanvasMediaFill>
      : <CanvasMediaFill><AuthedVideo src={url} muted playsInline preload="metadata" /></CanvasMediaFill>
  }
  return <CanvasMediaEmptyIcon><File size={14} /></CanvasMediaEmptyIcon>
}

function formatBytes(value: number | undefined) {
  if (!value) return '-'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}
