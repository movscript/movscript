import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { File, FileText, HardDrive, Image, Search, Video } from 'lucide-react'

import { api } from '@/shared/infrastructure/api'
import {
  CanvasMediaEmptyIcon,
  CanvasMediaFill,
  CanvasResourceShelfLazyFrame,
  CanvasResourceShelfMetadataProbe,
  CanvasResourceShelfMetadataText,
  CanvasResourceShelfView,
  type CanvasResourceShelfItem,
} from '@movscript/ui'
import type { PaginatedResponse, RawResource, ResourceBinding } from '@/types'
import { resourceMatchesSearch, resourceToNodeType } from '@/features/canvas/integrations/resources'
import { MediaViewer } from '@/shared/ui/MediaViewer'
import { ResourceImage } from '@/shared/ui/ResourceImage'

const RESOURCE_SHELF_THUMB_MAX_SIZE = 160

export function CanvasResourceShelf({
  projectId,
  dependencyBindings = [],
  variant = 'floating',
  disablePreviews = false,
}: {
  projectId?: number
  dependencyBindings?: ResourceBinding[]
  variant?: 'floating' | 'panel' | 'side'
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
    description: side ? undefined : <ResourceDetailMeta resource={resource} />,
    footerMeta: formatBytes(resource.size),
    selected: dependencyBindings.some((binding) => binding.resource_id === resource.ID),
    media: <ResourceThumb resource={resource} disablePreview={disablePreviews} />,
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

function ResourceThumb({ resource, disablePreview }: { resource: RawResource; disablePreview?: boolean }) {
  useEffect(() => {
    if (!disablePreview || !mediaDiagnosticsEnabled()) return
    console.info(`[canvas:media] ${resource.type} suppressed label=canvas-shelf:${resource.ID} reason=debug-disabled`)
  }, [disablePreview, resource.ID, resource.type])

  if (resource.type === 'image') {
    if (disablePreview) {
      return <CanvasMediaEmptyIcon><Image size={14} /></CanvasMediaEmptyIcon>
    }
    return <LazyResourcePreview fallback={<CanvasMediaEmptyIcon><File size={14} /></CanvasMediaEmptyIcon>}>
      <CanvasMediaFill>
        <ResourceImage resource={resource} alt="" diagnosticLabel={`canvas-shelf:${resource.ID}`} thumbnailMaxSize={RESOURCE_SHELF_THUMB_MAX_SIZE} />
      </CanvasMediaFill>
    </LazyResourcePreview>
  }
  if (resource.type === 'video') {
    if (disablePreview) {
      return <CanvasMediaEmptyIcon><Video size={14} /></CanvasMediaEmptyIcon>
    }
    return <LazyResourcePreview fallback={<CanvasMediaEmptyIcon><Video size={14} /></CanvasMediaEmptyIcon>}>
      <MediaViewer
        resource={resource}
        fit="cover"
        lightbox={false}
        diagnosticLabel={`canvas-shelf:${resource.ID}`}
      />
    </LazyResourcePreview>
  }
  if (resource.type === 'text') {
    return <LazyResourcePreview fallback={<CanvasMediaEmptyIcon><FileText size={14} /></CanvasMediaEmptyIcon>}>
      <MediaViewer
        resource={resource}
        fit="cover"
        lightbox={false}
        diagnosticLabel={`canvas-shelf:${resource.ID}`}
      />
    </LazyResourcePreview>
  }
  return <CanvasMediaEmptyIcon><File size={14} /></CanvasMediaEmptyIcon>
}

function ResourceDetailMeta({ resource }: { resource: RawResource }) {
  const [detail, setDetail] = useState(() => fallbackResourceDetail(resource))

  if (resource.type === 'image' && resource.url) {
    return (
      <>
        <CanvasResourceShelfMetadataText>{detail}</CanvasResourceShelfMetadataText>
        <CanvasResourceShelfMetadataProbe>
          <ResourceImage
            resource={resource}
            alt=""
            aria-hidden
            onLoad={(event) => {
              const image = event.currentTarget
              if (image.naturalWidth && image.naturalHeight) setDetail(`${image.naturalWidth}x${image.naturalHeight}`)
            }}
          />
        </CanvasResourceShelfMetadataProbe>
      </>
    )
  }

  if (resource.type === 'video' && resource.url) {
    return (
      <>
        <CanvasResourceShelfMetadataText>{detail}</CanvasResourceShelfMetadataText>
        <CanvasResourceShelfMetadataProbe>
          <MediaViewer
            resource={resource}
            lightbox={false}
            onVideoLoadedMetadata={(event) => {
              const video = event.currentTarget
              const parts = [
                video.videoWidth && video.videoHeight ? `${video.videoWidth}x${video.videoHeight}` : undefined,
                Number.isFinite(video.duration) ? formatDuration(video.duration) : undefined,
              ].filter(Boolean)
              if (parts.length > 0) setDetail(parts.join(' · '))
            }}
          />
        </CanvasResourceShelfMetadataProbe>
      </>
    )
  }

  return <CanvasResourceShelfMetadataText>{detail}</CanvasResourceShelfMetadataText>
}

function fallbackResourceDetail(resource: RawResource) {
  if (resource.type === 'image') return '读取像素'
  if (resource.type === 'video') return '读取时长'
  if (resource.type === 'text') return '文本'
  if (resource.type === 'audio') return '音频'
  return resource.mime_type || resource.type
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

  return <CanvasResourceShelfLazyFrame ref={ref}>{visible ? children : fallback}</CanvasResourceShelfLazyFrame>
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

function formatDuration(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '-'
  const total = Math.round(value)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return minutes > 0 ? `${minutes}:${String(seconds).padStart(2, '0')}` : `${seconds}s`
}
