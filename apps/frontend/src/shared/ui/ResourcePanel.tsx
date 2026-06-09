import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  ResourceAssetSlotBody,
  ResourceAssetSlotCard,
  ResourceAssetSlotDragButton,
  ResourceAssetSlotHeader,
  ResourceAssetSlotMeta,
  ResourceAssetSlotTitle,
  ResourceListItemShell,
  ResourcePanelContent,
  ResourcePanelEmptyState,
  ResourcePanelFilters,
  ResourcePanelItemName,
  ResourcePanelList,
  ResourcePanelPager,
  ResourcePanelSearchField,
  ResourcePanelSegmentButton,
  ResourcePanelSegmentGroup,
  ResourcePanelSelect,
  ResourcePanelSelectedLabel,
  ResourcePanelShell,
  ResourcePanelTabButton,
  ResourcePanelTabs,
  ResourcePanelThumb,
  ResourcePanelThumbFallback,
} from '@movscript/ui'
import { api } from '@/shared/infrastructure/api'
import { listSemanticEntities, semanticEntityConfig, type SemanticEntityRecord } from '@/shared/infrastructure/api/semanticEntities'
import type { AssetSlot, RawResource, PaginatedResponse } from '@/types'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { MediaViewer } from '@/shared/ui/MediaViewer'
import { ResourceCandidateAttachPanel, candidateResourceFromRawResource } from '@/shared/ui/ResourceCandidateAttachPanel'
import { FileAudio, FileText, Package, Search } from 'lucide-react'
import { writeResourceDragPayload } from '@/features/resources/domain/resourceDragPayload'

type AssetSlotPanelRecord = SemanticEntityRecord & AssetSlot

// ─── Shared preview dialog ────────────────────────────────────────────────────

export function ResourcePreviewDialog({ resource, projectId, onClose }: { resource: RawResource; projectId?: number; onClose: () => void }) {
  return (
    <MediaViewer
      resource={resource}
      open
      onOpenChange={v => !v && onClose()}
      fit="contain"
      sidePanel={(
        <ResourceCandidateAttachPanel
          resources={[candidateResourceFromRawResource(resource)]}
          projectId={projectId}
          compact
        />
      )}
    />
  )
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
  previewProjectId?: number
}

export function ResourceListItem({
  resource: r,
  selected,
  onClick,
  draggable: isDraggable,
  trailing,
  thumbSize = 'sm',
  previewProjectId,
}: ResourceListItemProps) {
  const { t } = useTranslation()
  const [preview, setPreview] = useState(false)

  function handleDragStart(e: React.DragEvent) {
    writeResourceDragPayload(e.dataTransfer, r)
  }

  function handleClick() {
    if (onClick) { onClick(); return }
    setPreview(true)
  }

  return (
    <>
      <ResourceListItemShell
        selected={selected}
        draggableActive={Boolean(isDraggable && !selected)}
        draggable={isDraggable && !selected}
        onDragStart={isDraggable && !selected ? handleDragStart : undefined}
        onClick={handleClick}
        title={selected ? t('common.selected') : isDraggable ? t('shared.resourcePanel.previewDragTitle') : undefined}
      >
        <ResourcePanelThumb size={thumbSize}>
          {r.type === 'image' || r.type === 'video' || r.type === 'text' ? (
            <MediaViewer resource={r} lightbox={false} />
          ) : r.type === 'audio' ? (
            <ResourcePanelThumbFallback>
              <FileAudio size={thumbSize === 'sm' ? 12 : 14} />
            </ResourcePanelThumbFallback>
          ) : (
            <ResourcePanelThumbFallback>
              <FileText size={thumbSize === 'sm' ? 12 : 14} />
            </ResourcePanelThumbFallback>
          )}
        </ResourcePanelThumb>
        <ResourcePanelItemName>{r.name}</ResourcePanelItemName>
        {selected && <ResourcePanelSelectedLabel>{t('common.selected')}</ResourcePanelSelectedLabel>}
        {trailing}
      </ResourceListItemShell>

      {/* Controlled MediaViewer lightbox uses the same AuthedImage path as grid mode. */}
      {preview && <ResourcePreviewDialog resource={r} projectId={previewProjectId} onClose={() => setPreview(false)} />}
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
  previewProjectId?: number
}

export function AssetSlotListItem({
  slot,
  selected,
  onClick,
  draggable: isDraggable,
  selectedResourceIds = [],
  trailing,
  previewProjectId,
}: AssetSlotListItemProps) {
  const { t } = useTranslation()
  const [preview, setPreview] = useState<RawResource | null>(null)
  const resource = slot.resource

  function handleDragStart(e: React.DragEvent, res: RawResource) {
    writeResourceDragPayload(e.dataTransfer, res)
  }

  return (
    <>
      <ResourceAssetSlotCard
        selected={selected}
        clickable={Boolean(onClick)}
        onClick={onClick}
      >
        <ResourceAssetSlotHeader>
          <ResourcePanelThumb size="sm">
            {resource ? (
              <MediaViewer resource={resource} lightbox={false} />
            ) : (
              <ResourcePanelThumbFallback>
                <Package size={12} />
              </ResourcePanelThumbFallback>
            )}
          </ResourcePanelThumb>
          <ResourceAssetSlotBody>
            <ResourceAssetSlotTitle>{slot.name || `#${slot.ID}`}</ResourceAssetSlotTitle>
            <ResourceAssetSlotMeta>
              {slot.owner_type && slot.owner_id ? `${slot.owner_type} #${slot.owner_id}` : t('shared.resourcePanel.assetLibrary')}
              {' · '}
              {slot.kind || 'reference'}
            </ResourceAssetSlotMeta>
          </ResourceAssetSlotBody>
          {trailing}
        </ResourceAssetSlotHeader>

        {isDraggable && resource && (
          <ResourceAssetSlotDragButton
            selected={selectedResourceIds.includes(resource.ID)}
            role="button"
            tabIndex={0}
            draggable={!selectedResourceIds.includes(resource.ID)}
            onDragStart={e => { e.stopPropagation(); !selectedResourceIds.includes(resource.ID) && handleDragStart(e, resource) }}
            onClick={e => { e.stopPropagation(); setPreview(resource) }}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.stopPropagation()
                setPreview(resource)
              }
            }}
            title={resource.name}
          >
            <MediaViewer resource={resource} lightbox={false} />
          </ResourceAssetSlotDragButton>
        )}
      </ResourceAssetSlotCard>

      {preview && <ResourcePreviewDialog resource={preview} projectId={previewProjectId} onClose={() => setPreview(null)} />}
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

  return (
    <ResourcePanelShell>
      <ResourcePanelTabs>
        {(['resources', 'assetSlots'] as const).map(panelTab => (
          <ResourcePanelTabButton
            key={panelTab}
            onClick={() => resetFilters(panelTab)}
            active={tab === panelTab}
          >
            {panelTab === 'resources' ? t('shared.resourcePanel.resourceLibrary') : t('shared.resourcePanel.assetLibrary')}
          </ResourcePanelTabButton>
        ))}
      </ResourcePanelTabs>

      <ResourcePanelFilters>
        <ResourcePanelSearchField
          icon={<Search size={12} />}
          value={keyword}
          onChange={e => { setKeyword(e.target.value); resetFilters() }}
          placeholder={tab === 'resources' ? t('shared.resourcePanel.searchResources') : t('shared.resourcePanel.searchAssets')}
        />
        {tab === 'resources' && (inputType === 'image+video' || inputType === 'media') && (
          <ResourcePanelSegmentGroup>
            {resourceTypeOptions.map(type => (
              <ResourcePanelSegmentButton
                key={type}
                onClick={() => { setResourceType(type); setResourcePage(1) }}
                active={resourceType === type}
              >
                {type === 'all' ? t('common.all') : t(`pages.resources.types.${type}`)}
              </ResourcePanelSegmentButton>
            ))}
          </ResourcePanelSegmentGroup>
        )}
        {tab === 'assetSlots' && (
          <ResourcePanelSelect
            value={slotKind}
            onChange={e => { setSlotKind(e.target.value as typeof slotKind); setSlotPage(1) }}
          >
            <option value="all">{t('shared.resourcePanel.allAssets')}</option>
            {(['image', 'video', 'audio', 'text', 'reference'] as const).map((type) => <option key={type} value={type}>{type}</option>)}
          </ResourcePanelSelect>
        )}
      </ResourcePanelFilters>

      <ResourcePanelContent>
        {tab === 'resources' && (
          <ResourcePanelList>
            {resources.length === 0 && (
              <ResourcePanelEmptyState>{t('shared.resourcePanel.noResources')}</ResourcePanelEmptyState>
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
          </ResourcePanelList>
        )}

        {tab === 'assetSlots' && (
          <ResourcePanelList data-density="asset">
            {!current && <ResourcePanelEmptyState>{t('shared.resourcePanel.selectProjectFirst')}</ResourcePanelEmptyState>}
            {current && slots.length === 0 && <ResourcePanelEmptyState>{t('shared.resourcePanel.noAssets')}</ResourcePanelEmptyState>}
            {slots.map(slot => (
              <AssetSlotListItem
                key={slot.ID}
                slot={slot}
                draggable
                selectedResourceIds={selectedIds}
                previewProjectId={current?.ID}
              />
            ))}
          </ResourcePanelList>
        )}
      </ResourcePanelContent>
      {tab === 'resources' ? (
        <ResourcePanelPager
          page={resourcePage}
          pageCount={resourcePageCount}
          summary={t('common.itemsCount', { count: resourceTotal })}
          previousLabel={t('pages.resources.previousPage')}
          nextLabel={t('pages.resources.nextPage')}
          onPage={setResourcePage}
        />
      ) : (
        <ResourcePanelPager
          page={slotPage}
          pageCount={slotPageCount}
          summary={t('common.itemsCount', { count: slotTotal })}
          previousLabel={t('pages.resources.previousPage')}
          nextLabel={t('pages.resources.nextPage')}
          onPage={setSlotPage}
        />
      )}
    </ResourcePanelShell>
  )
}
