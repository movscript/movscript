import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { File, HardDrive, Image, Search, Video } from 'lucide-react'

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

const RESOURCE_SHELF_THUMB_MAX_SIZE = 160

export function CanvasResourceShelf({
  projectId,
  dependencyBindings = [],
  variant = 'floating',
  activeCanvasResourceIds,
  disablePreviews = false,
}: {
  projectId?: number
  dependencyBindings?: ResourceBinding[]
  variant?: 'floating' | 'panel' | 'side'
  activeCanvasResourceIds?: ReadonlySet<number>
  disablePreviews?: boolean
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
  const side = variant === 'side'
  const shelfItems: CanvasResourceShelfItem[] = resourceItems.map((resource) => ({
    id: resource.ID,
    type: resource.type,
    name: resource.name,
    description: side ? undefined : (resource.mime_type || resource.type),
    footerMeta: formatBytes(resource.size),
    selected: dependencyBindings.some((binding) => binding.resource_id === resource.ID),
    media: <ResourceThumb resource={resource} suppressPreview={activeCanvasResourceIds?.has(resource.ID) ?? false} disablePreview={disablePreviews} />,
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
      searchPlaceholder={side ? '搜索' : '搜索资源：名称、类型、ID'}
      hint={search.trim() ? `${activeFilteredCount} 个结果` : (side ? `${resources.length}` : t('canvas.editor.resourceShelf.dragHint'))}
      emptyTitle={t('shared.resourcePanel.noResources')}
      items={shelfItems}
      selectedLabel="已作为依赖"
      dragMetaLabel={side ? undefined : '可直接拖入画布'}
      onItemDragStart={dragResource}
    />
  )
}

function ResourceThumb({ resource, suppressPreview, disablePreview }: { resource: RawResource; suppressPreview?: boolean; disablePreview?: boolean }) {
  const url = resource.direct_url ?? (resource.url ? `${API_BASE}${resource.url}` : '')
  useEffect(() => {
    if ((!suppressPreview && !disablePreview) || !mediaDiagnosticsEnabled()) return
    console.info(`[canvas:media] ${resource.type} suppressed label=canvas-shelf:${resource.ID} reason=${disablePreview ? 'debug-disabled' : 'already-on-canvas'}`)
  }, [disablePreview, suppressPreview, resource.ID, resource.type])

  if (resource.type === 'image') {
    if (suppressPreview || disablePreview) {
      return <CanvasMediaEmptyIcon><Image size={14} /></CanvasMediaEmptyIcon>
    }
    return <LazyResourcePreview fallback={<CanvasMediaEmptyIcon><File size={14} /></CanvasMediaEmptyIcon>}>
      <CanvasMediaFill>
        <AuthedImage src={url} alt="" diagnosticLabel={`canvas-shelf:${resource.ID}`} thumbnailMaxSize={RESOURCE_SHELF_THUMB_MAX_SIZE} />
      </CanvasMediaFill>
    </LazyResourcePreview>
  }
  if (resource.type === 'video') {
    if (suppressPreview || disablePreview) {
      return <CanvasMediaEmptyIcon><Video size={14} /></CanvasMediaEmptyIcon>
    }
    return <LazyResourcePreview fallback={<CanvasMediaEmptyIcon><File size={14} /></CanvasMediaEmptyIcon>}>
      <CanvasMediaFill>
        {resource.direct_url
          ? <video src={resource.direct_url} muted playsInline preload="metadata" />
          : <AuthedVideo src={url} muted playsInline preload="metadata" diagnosticLabel={`canvas-shelf:${resource.ID}`} />}
      </CanvasMediaFill>
    </LazyResourcePreview>
  }
  return <CanvasMediaEmptyIcon><File size={14} /></CanvasMediaEmptyIcon>
}

function LazyResourcePreview({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new IntersectionObserver((entries) => {
      setVisible(entries.some((entry) => entry.isIntersecting))
    }, { rootMargin: '160px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return <div ref={ref} className="size-full">{visible ? children : fallback}</div>
}

function mediaDiagnosticsEnabled() {
  if (!import.meta.env.DEV) return false
  if (import.meta.env.VITE_MOVSCRIPT_AGENT_MODE_RENDER_DIAGNOSTICS === '1') return true
  try {
    if (new URLSearchParams(window.location.search).has('canvasDebug')) return true
    return !!window.localStorage.getItem('movscript.canvasDebug')
  } catch {
    return false
  }
}

function formatBytes(value: number | undefined) {
  if (!value) return '-'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}
