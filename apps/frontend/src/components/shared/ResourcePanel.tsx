import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import { listSemanticEntities, semanticEntityConfig, type SemanticEntityRecord } from '@/api/semanticEntities'
import type { AssetSlot, RawResource, PaginatedResponse } from '@/types'
import { useProjectStore } from '@/store/projectStore'
import { MediaViewer } from '@/components/shared/MediaViewer'
import { FileAudio, FileText, Package, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

type AssetSlotPanelRecord = SemanticEntityRecord & AssetSlot

// ─── Shared preview dialog ────────────────────────────────────────────────────

export function ResourcePreviewDialog({ resource, onClose }: { resource: RawResource; onClose: () => void }) {
  return <MediaViewer resource={resource} open onOpenChange={v => !v && onClose()} />
}

// ─── Shared resource list item ────────────────────────────────────────────────
// Used in ResourcePanel (tool sidebar) and ResourcesPage (list view).

interface ResourceListItemProps {
  resource: RawResource
  /** Show a selected badge and disable drag when true */
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
  const { t } = useTranslation()
  const [preview, setPreview] = useState(false)
  const thumbCls = thumbSize === 'sm' ? 'w-8 h-8' : 'w-10 h-10'

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData('application/resource-id', String(r.ID))
    e.dataTransfer.setData('application/canvas-resource', JSON.stringify(r))
    e.dataTransfer.effectAllowed = 'copy'
  }

  function handleClick() {
    if (onClick) { onClick(); return }
    setPreview(true)
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
        title={selected ? t('common.selected') : isDraggable ? t('shared.resourcePanel.previewDragTitle') : undefined}
      >
        <div className={cn(thumbCls, 'rounded shrink-0 overflow-hidden bg-muted')}>
          {r.type === 'image' || r.type === 'video' ? (
            <MediaViewer resource={r} className="w-full h-full" lightbox={false} />
          ) : r.type === 'text' ? (
            <MediaViewer resource={r} className="w-full h-full" lightbox={false} />
          ) : r.type === 'audio' ? (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              <FileAudio size={thumbSize === 'sm' ? 12 : 14} />
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              <FileText size={thumbSize === 'sm' ? 12 : 14} />
            </div>
          )}
        </div>
        <span className="text-xs text-foreground truncate flex-1">{r.name}</span>
        {selected && <span className="text-[10px] text-muted-foreground shrink-0">{t('common.selected')}</span>}
        {trailing}
      </div>

      {/* Controlled MediaViewer lightbox uses the same AuthedImage path as grid mode. */}
      {preview && <MediaViewer resource={r} className="" open={preview} onOpenChange={v => !v && setPreview(false)} />}
    </>
  )
}

// ─── Shared asset slot list item ─────────────────────────────────────────────

interface AssetSlotListItemProps {
  slot: AssetSlotPanelRecord
  selected?: boolean
  onClick?: () => void
  draggable?: boolean
  selectedResourceIds?: number[]
  trailing?: React.ReactNode
}

export function AssetSlotListItem({
  slot,
  selected,
  onClick,
  draggable: isDraggable,
  selectedResourceIds = [],
  trailing,
}: AssetSlotListItemProps) {
  const { t } = useTranslation()
  const [preview, setPreview] = useState<RawResource | null>(null)
  const resource = slot.resource

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
            {resource ? (
              <MediaViewer resource={resource} className="w-full h-full" lightbox={false} />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                <Package size={12} />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-foreground truncate leading-tight">{slot.name || `#${slot.ID}`}</p>
            <p className="text-[10px] text-muted-foreground truncate">
              {slot.owner_type && slot.owner_id ? `${slot.owner_type} #${slot.owner_id}` : t('shared.resourcePanel.assetLibrary')}
              {' · '}
              {slot.kind || 'reference'}
            </p>
          </div>
          {trailing}
        </div>

        {isDraggable && resource && (
          <button
            draggable={!selectedResourceIds.includes(resource.ID)}
            onDragStart={e => { e.stopPropagation(); !selectedResourceIds.includes(resource.ID) && handleDragStart(e, resource) }}
            onClick={e => { e.stopPropagation(); setPreview(resource) }}
            title={resource.name}
            className={cn(
              'ml-1 h-8 w-8 rounded overflow-hidden border transition-colors cursor-pointer',
              selectedResourceIds.includes(resource.ID) ? 'border-primary opacity-50' : 'border-border hover:border-primary cursor-grab active:cursor-grabbing'
            )}
          >
            <MediaViewer resource={resource} className="w-full h-full" lightbox={false} />
          </button>
        )}
      </div>

      {preview && <ResourcePreviewDialog resource={preview} onClose={() => setPreview(null)} />}
    </>
  )
}

// ─── ResourcePanel (tool sidebar) ────────────────────────────────────────────

type ResourcePanelInputType = 'image' | 'video' | 'image+video' | 'media'
type ResourcePanelResourceType = 'all' | 'image' | 'video' | 'audio' | 'text'

interface ResourcePanelProps {
  inputType: ResourcePanelInputType
  selectedIds: number[]
  onSelect: (resource: RawResource) => void
}

export function ResourcePanel({ inputType, selectedIds, onSelect: _onSelect }: ResourcePanelProps) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'resources' | 'assetSlots'>('resources')
  const [keyword, setKeyword] = useState('')
  const [resourceType, setResourceType] = useState<ResourcePanelResourceType>('all')
  const [slotKind, setSlotKind] = useState<'all' | 'image' | 'video' | 'audio' | 'text' | 'reference'>('all')
  const [resourcePage, setResourcePage] = useState(1)
  const [slotPage, setSlotPage] = useState(1)
  const current = useProjectStore(s => s.current)
  const pageSize = 12
  const slotConfig = semanticEntityConfig('assetSlots')

  const resourceTypeParam = (() => {
    if (inputType === 'image+video') return resourceType === 'all' ? 'image,video' : resourceType
    if (inputType === 'media') return resourceType === 'all' ? 'image,video,audio,text' : resourceType
    return inputType
  })()
  const resourceTypeOptions: ResourcePanelResourceType[] = inputType === 'media'
    ? ['all', 'image', 'video', 'audio', 'text']
    : ['all', 'image', 'video']

  const { data: resourcesPageData } = useQuery<PaginatedResponse<RawResource>>({
    queryKey: ['resources', 'panel', inputType, resourceTypeParam, keyword, resourcePage],
    queryFn: () => api.get('/resources', {
      params: { page: resourcePage, page_size: pageSize, type: resourceTypeParam, q: keyword || undefined },
    }).then(r => r.data),
  })
  const resources = resourcesPageData?.items ?? []
  const resourceTotal = resourcesPageData?.total ?? 0
  const resourcePageCount = Math.max(1, Math.ceil(resourceTotal / pageSize))

  const { data: slotRecords = [] } = useQuery<AssetSlotPanelRecord[]>({
    queryKey: ['asset-slots', 'panel', current?.ID],
    queryFn: () => listSemanticEntities(current!.ID, slotConfig) as Promise<AssetSlotPanelRecord[]>,
    enabled: !!current,
  })
  const filteredSlots = slotRecords.filter((slot) => {
    if (slotKind !== 'all' && slot.kind !== slotKind) return false
    if (keyword.trim()) {
      const q = keyword.trim().toLowerCase()
      return [slot.name, slot.description, slot.prompt_hint, slot.kind, slot.status].filter(Boolean).join(' ').toLowerCase().includes(q)
    }
    return true
  })
  const slotTotal = filteredSlots.length
  const slotPageCount = Math.max(1, Math.ceil(slotTotal / pageSize))
  const slots = filteredSlots.slice((slotPage - 1) * pageSize, slotPage * pageSize)

  function resetFilters(nextTab?: 'resources' | 'assetSlots') {
    if (nextTab) setTab(nextTab)
    setResourcePage(1)
    setSlotPage(1)
  }

  function Pager({ page, pageCount, total, onPage }: { page: number; pageCount: number; total: number; onPage: (p: number) => void }) {
    return (
      <div className="flex items-center justify-between px-2 py-2 border-t border-border text-[11px] text-muted-foreground shrink-0">
        <span>{t('common.itemsCount', { count: total })}</span>
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
        {(['resources', 'assetSlots'] as const).map(panelTab => (
          <button
            key={panelTab}
            onClick={() => resetFilters(panelTab)}
            className={cn(
              'flex-1 py-2 text-xs font-medium transition-colors',
              tab === panelTab ? 'text-foreground border-b-2 border-primary -mb-px' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {panelTab === 'resources' ? t('shared.resourcePanel.resourceLibrary') : t('shared.resourcePanel.assetLibrary')}
          </button>
        ))}
      </div>

      <div className="p-2 border-b border-border space-y-2 shrink-0">
        <div className="relative">
          <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={keyword}
            onChange={e => { setKeyword(e.target.value); resetFilters() }}
            placeholder={tab === 'resources' ? t('shared.resourcePanel.searchResources') : t('shared.resourcePanel.searchAssets')}
            className="w-full pl-6 pr-2 py-1.5 text-xs rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        {tab === 'resources' && (inputType === 'image+video' || inputType === 'media') && (
          <div className="flex rounded-md border border-border overflow-hidden text-[11px]">
            {resourceTypeOptions.map(type => (
              <button
                key={type}
                onClick={() => { setResourceType(type); setResourcePage(1) }}
                className={cn('flex-1 py-1 transition-colors', resourceType === type ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted')}
              >
                {type === 'all' ? t('common.all') : t(`pages.resources.types.${type}`)}
              </button>
            ))}
          </div>
        )}
        {tab === 'assetSlots' && (
          <select
            value={slotKind}
            onChange={e => { setSlotKind(e.target.value as typeof slotKind); setSlotPage(1) }}
            className="w-full px-2 py-1.5 text-xs rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="all">{t('shared.resourcePanel.allAssets')}</option>
            {(['image', 'video', 'audio', 'text', 'reference'] as const).map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {tab === 'resources' && (
          <div className="space-y-0.5">
            {resources.length === 0 && (
              <p className="text-xs text-muted-foreground text-center pt-8">{t('shared.resourcePanel.noResources')}</p>
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

        {tab === 'assetSlots' && (
          <div className="space-y-1">
            {!current && <p className="text-xs text-muted-foreground text-center pt-8">{t('shared.resourcePanel.selectProjectFirst')}</p>}
            {current && slots.length === 0 && <p className="text-xs text-muted-foreground text-center pt-8">{t('shared.resourcePanel.noAssets')}</p>}
            {slots.map(slot => (
              <AssetSlotListItem
                key={slot.ID}
                slot={slot}
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
        <Pager page={slotPage} pageCount={slotPageCount} total={slotTotal} onPage={setSlotPage} />
      )}
    </div>
  )
}
