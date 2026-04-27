import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { API_BASE_URL as API_BASE } from '@/lib/config'
import type { RawResource, Asset, AssetView, PaginatedResponse } from '@/types'
import { useProjectStore } from '@/store/projectStore'
import { useUserStore } from '@/store/userStore'
import { MediaViewer } from '@/components/shared/MediaViewer'
import { Video, Package, X, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import * as Dialog from '@radix-ui/react-dialog'

// ─── Shared preview dialog ────────────────────────────────────────────────────

export function ResourcePreviewDialog({ resource, onClose }: { resource: RawResource; onClose: () => void }) {
  const userId = useUserStore(s => s.currentUser?.ID)
  const proxyUrl = resource.direct_url ?? `${API_BASE}${resource.url}${userId ? `?uid=${userId}` : ''}`
  return (
    <Dialog.Root open onOpenChange={v => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/80 z-[100] backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="flex flex-col gap-2 max-w-[90vw] max-h-[90vh]">
            <div className="flex items-center justify-between gap-4 shrink-0">
              <span className="text-white/80 text-sm truncate max-w-[60vw]">{resource.name}</span>
              <Dialog.Close className="text-white/70 hover:text-white transition-colors">
                <X size={18} />
              </Dialog.Close>
            </div>
            {resource.type === 'video' ? (
              <video src={proxyUrl} controls autoPlay className="max-w-[90vw] max-h-[80vh] rounded-lg" />
            ) : (
              <img src={proxyUrl} alt={resource.name} className="max-w-[90vw] max-h-[80vh] object-contain rounded-lg" />
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// ─── Shared resource list item ────────────────────────────────────────────────
// Used in ResourcePanel (tool sidebar) and ResourcesPage (list view).

interface ResourceListItemProps {
  resource: RawResource
  /** Show "已选" badge and disable drag when true */
  selected?: boolean
  /** Called on click — defaults to opening preview */
  onClick?: () => void
  /** If provided, item is draggable and sets this data on dragStart */
  draggable?: boolean
  /** Trailing slot — e.g. a dropdown menu */
  trailing?: React.ReactNode
  thumbSize?: 'sm' | 'md'
}

export function ResourceListItem({
  resource: r,
  selected,
  onClick,
  draggable: isDraggable,
  trailing,
  thumbSize = 'sm',
}: ResourceListItemProps) {
  const [preview, setPreview] = useState(false)
  const userId = useUserStore(s => s.currentUser?.ID)
  const proxyUrl = r.direct_url ?? `${API_BASE}${r.url}${userId ? `?uid=${userId}` : ''}`
  const thumbCls = thumbSize === 'sm' ? 'w-8 h-8' : 'w-10 h-10'

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData('application/resource-id', String(r.ID))
    e.dataTransfer.setData('application/canvas-resource', JSON.stringify(r))
    e.dataTransfer.effectAllowed = 'copy'
  }

  function handleClick() {
    if (onClick) { onClick(); return }
    if (r.type === 'image' || r.type === 'video') setPreview(true)
  }

  return (
    <>
      <div
        draggable={isDraggable && !selected}
        onDragStart={isDraggable && !selected ? handleDragStart : undefined}
        onClick={handleClick}
        className={cn(
          'group flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors cursor-pointer',
          selected ? 'opacity-40' : 'hover:bg-muted/50',
          isDraggable && !selected && 'cursor-grab active:cursor-grabbing'
        )}
        title={selected ? '已选' : isDraggable ? '点击预览，拖拽添加' : undefined}
      >
        <div className={cn(thumbCls, 'rounded shrink-0 overflow-hidden bg-muted')}>
          {r.type === 'image' || r.type === 'video' ? (
            <MediaViewer resource={r} className="w-full h-full" lightbox={false} />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              <Video size={thumbSize === 'sm' ? 12 : 14} />
            </div>
          )}
        </div>
        <span className="text-xs text-foreground truncate flex-1">{r.name}</span>
        {selected && <span className="text-[10px] text-muted-foreground shrink-0">已选</span>}
        {trailing}
      </div>

      {/* Controlled MediaViewer lightbox — same AuthedImage path as grid mode */}
      {preview && <MediaViewer resource={r} className="" open={preview} onOpenChange={v => !v && setPreview(false)} />}
    </>
  )
}

// ─── Shared asset list item ───────────────────────────────────────────────────
// Used in ResourcePanel (tool sidebar) and AssetsPage (list view).

interface AssetListItemProps {
  asset: Asset
  selected?: boolean
  onClick?: () => void
  /** When true, view thumbnails are draggable */
  draggable?: boolean
  selectedResourceIds?: number[]
  trailing?: React.ReactNode
}

function viewThumbUrl(view: AssetView): string | null {
  if (view.resource?.direct_url) return view.resource.direct_url
  if (view.resource?.url) return `${API_BASE}${view.resource.url}`
  if (view.image_url) return view.image_url.startsWith('http') ? view.image_url : `${API_BASE}${view.image_url}`
  return null
}

export function AssetListItem({
  asset,
  selected,
  onClick,
  draggable: isDraggable,
  selectedResourceIds = [],
  trailing,
}: AssetListItemProps) {
  const [preview, setPreview] = useState<RawResource | null>(null)
  const userId = useUserStore(s => s.currentUser?.ID)
  const views = asset.views?.filter(v => v.resource) ?? []
  const firstView = views[0]
  const thumbUrl = firstView ? viewThumbUrl(firstView) : null
  const isVid = firstView?.resource?.type === 'video'

  function handleDragStart(e: React.DragEvent, res: RawResource) {
    e.dataTransfer.setData('application/resource-id', String(res.ID))
    e.dataTransfer.setData('application/canvas-resource', JSON.stringify(res))
    e.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <>
      <div
        className={cn(
          'rounded-md transition-colors p-1.5',
          selected ? 'bg-muted' : 'hover:bg-muted/30',
          onClick && 'cursor-pointer'
        )}
        onClick={onClick}
      >
        <div className="flex items-center gap-2 mb-1">
          <div className="w-7 h-7 rounded shrink-0 overflow-hidden bg-muted">
            {thumbUrl ? (
              isVid
                ? <video src={`${thumbUrl}${userId ? `?uid=${userId}` : ''}`} className="w-full h-full object-cover" muted playsInline preload="metadata" />
                : <MediaViewer resource={firstView!.resource!} className="w-full h-full" lightbox={false} />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                <Package size={12} />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-foreground truncate leading-tight">{asset.name}</p>
            <p className="text-[10px] text-muted-foreground capitalize">{asset.type}</p>
          </div>
          {trailing}
        </div>

        {isDraggable && views.length > 0 && (
          <div className="flex gap-1 flex-wrap pl-1">
            {views.map(view => {
              if (!view.resource) return null
              const res = view.resource
              const inUse = selectedResourceIds.includes(res.ID)
              const vUrl = res.direct_url ?? `${API_BASE}${res.url}${userId ? `?uid=${userId}` : ''}`
              return (
                <div
                  key={view.ID}
                  draggable={!inUse}
                  onDragStart={e => { e.stopPropagation(); !inUse && handleDragStart(e, res) }}
                  onClick={e => { e.stopPropagation(); setPreview(res) }}
                  title={view.label || view.view_type}
                  className={cn(
                    'w-8 h-8 rounded overflow-hidden border transition-colors cursor-pointer',
                    inUse ? 'border-primary opacity-50' : 'border-border hover:border-primary cursor-grab active:cursor-grabbing'
                  )}
                >
                  {res.type === 'video' ? (
                    <video src={vUrl} className="w-full h-full object-cover" muted playsInline preload="metadata" />
                  ) : (
                    <MediaViewer resource={res} className="w-full h-full" lightbox={false} />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {preview && <ResourcePreviewDialog resource={preview} onClose={() => setPreview(null)} />}
    </>
  )
}

// ─── ResourcePanel (tool sidebar) ────────────────────────────────────────────

interface ResourcePanelProps {
  inputType: 'image' | 'video' | 'image+video'
  selectedIds: number[]
  onSelect: (resource: RawResource) => void
}

export function ResourcePanel({ inputType, selectedIds, onSelect: _onSelect }: ResourcePanelProps) {
  const [tab, setTab] = useState<'resources' | 'assets'>('resources')
  const [keyword, setKeyword] = useState('')
  const [resourceType, setResourceType] = useState<'all' | 'image' | 'video'>('all')
  const [assetType, setAssetType] = useState<'all' | 'character' | 'scene' | 'prop' | 'draft'>('all')
  const [resourcePage, setResourcePage] = useState(1)
  const [assetPage, setAssetPage] = useState(1)
  const current = useProjectStore(s => s.current)
  const pageSize = 12

  const resourceTypeParam = (() => {
    if (inputType === 'image+video') return resourceType === 'all' ? 'image,video' : resourceType
    return inputType
  })()

  const { data: resourcesPageData } = useQuery<PaginatedResponse<RawResource>>({
    queryKey: ['resources', 'panel', inputType, resourceTypeParam, keyword, resourcePage],
    queryFn: () => api.get('/resources', {
      params: { page: resourcePage, page_size: pageSize, type: resourceTypeParam, q: keyword || undefined },
    }).then(r => r.data),
  })
  const resources = resourcesPageData?.items ?? []
  const resourceTotal = resourcesPageData?.total ?? 0
  const resourcePageCount = Math.max(1, Math.ceil(resourceTotal / pageSize))

  const { data: assetsPageData } = useQuery<PaginatedResponse<Asset>>({
    queryKey: ['assets', 'panel', current?.ID, assetType, keyword, assetPage],
    queryFn: () => api.get(`/projects/${current!.ID}/assets`, {
      params: {
        page: assetPage,
        page_size: pageSize,
        type: assetType === 'all' ? undefined : assetType,
        q: keyword || undefined,
      },
    }).then(r => r.data),
    enabled: !!current,
  })
  const assets = assetsPageData?.items ?? []
  const assetTotal = assetsPageData?.total ?? 0
  const assetPageCount = Math.max(1, Math.ceil(assetTotal / pageSize))

  function resetFilters(nextTab?: 'resources' | 'assets') {
    if (nextTab) setTab(nextTab)
    setResourcePage(1)
    setAssetPage(1)
  }

  function Pager({ page, pageCount, total, onPage }: { page: number; pageCount: number; total: number; onPage: (p: number) => void }) {
    return (
      <div className="flex items-center justify-between px-2 py-2 border-t border-border text-[11px] text-muted-foreground shrink-0">
        <span>{total} 项</span>
        <div className="flex items-center gap-1">
          <button className="p-1 rounded hover:bg-muted disabled:opacity-40" disabled={page <= 1} onClick={() => onPage(Math.max(1, page - 1))}>
            <ChevronLeft size={12} />
          </button>
          <span className="tabular-nums">{page}/{pageCount}</span>
          <button className="p-1 rounded hover:bg-muted disabled:opacity-40" disabled={page >= pageCount} onClick={() => onPage(Math.min(pageCount, page + 1))}>
            <ChevronRight size={12} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-56 shrink-0 border-r border-border bg-background flex flex-col overflow-hidden">
      <div className="flex border-b border-border shrink-0">
        {(['resources', 'assets'] as const).map(t => (
          <button
            key={t}
            onClick={() => resetFilters(t)}
            className={cn(
              'flex-1 py-2 text-xs font-medium transition-colors',
              tab === t ? 'text-foreground border-b-2 border-primary -mb-px' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t === 'resources' ? '资源库' : '素材库'}
          </button>
        ))}
      </div>

      <div className="p-2 border-b border-border space-y-2 shrink-0">
        <div className="relative">
          <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={keyword}
            onChange={e => { setKeyword(e.target.value); resetFilters() }}
            placeholder={tab === 'resources' ? '搜索资源…' : '搜索素材…'}
            className="w-full pl-6 pr-2 py-1.5 text-xs rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        {tab === 'resources' && inputType === 'image+video' && (
          <div className="flex rounded-md border border-border overflow-hidden text-[11px]">
            {(['all', 'image', 'video'] as const).map(t => (
              <button
                key={t}
                onClick={() => { setResourceType(t); setResourcePage(1) }}
                className={cn('flex-1 py-1 transition-colors', resourceType === t ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted')}
              >
                {t === 'all' ? '全部' : t === 'image' ? '图片' : '视频'}
              </button>
            ))}
          </div>
        )}
        {tab === 'assets' && (
          <select
            value={assetType}
            onChange={e => { setAssetType(e.target.value as typeof assetType); setAssetPage(1) }}
            className="w-full px-2 py-1.5 text-xs rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="all">全部素材</option>
            <option value="character">角色</option>
            <option value="scene">场景</option>
            <option value="prop">道具</option>
            <option value="draft">底稿</option>
          </select>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {tab === 'resources' && (
          <div className="space-y-0.5">
            {resources.length === 0 && (
              <p className="text-xs text-muted-foreground text-center pt-8">暂无资源</p>
            )}
            {resources.map(r => (
              <ResourceListItem
                key={r.ID}
                resource={r}
                selected={selectedIds.includes(r.ID)}
                onClick={() => !selectedIds.includes(r.ID) && _onSelect(r)}
                draggable
                thumbSize="sm"
              />
            ))}
          </div>
        )}

        {tab === 'assets' && (
          <div className="space-y-1">
            {!current && <p className="text-xs text-muted-foreground text-center pt-8">需要先选择项目</p>}
            {current && assets.length === 0 && <p className="text-xs text-muted-foreground text-center pt-8">暂无素材</p>}
            {assets.map(asset => (
              <AssetListItem
                key={asset.ID}
                asset={asset}
                draggable
                selectedResourceIds={selectedIds}
              />
            ))}
          </div>
        )}
      </div>
      {tab === 'resources' ? (
        <Pager page={resourcePage} pageCount={resourcePageCount} total={resourceTotal} onPage={setResourcePage} />
      ) : (
        <Pager page={assetPage} pageCount={assetPageCount} total={assetTotal} onPage={setAssetPage} />
      )}
    </div>
  )
}
