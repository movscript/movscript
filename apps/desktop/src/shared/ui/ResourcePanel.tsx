import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  ResourcePanelContent,
  ResourcePanelEmptyState,
  ResourcePanelFilters,
  ResourcePanelList,
  ResourcePanelPager,
  ResourcePanelSearchField,
  ResourcePanelSegmentButton,
  ResourcePanelSegmentGroup,
  ResourcePanelSelect,
  ResourcePanelShell,
  ResourcePanelTabButton,
  ResourcePanelTabs,
} from '@movscript/ui/business/resource'
import { api } from '@/shared/infrastructure/api'
import { listSemanticEntities, semanticEntityConfig, type SemanticEntityRecord } from '@/shared/infrastructure/api/semanticEntities'
import type { AssetSlot, RawResource, PaginatedResponse } from '@/types'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { Search } from 'lucide-react'
import { resourceKeys } from '@movscript/resource-surface/data'
import { AssetSlotListItem, ResourceListItem } from '@/shared/ui/ResourcePanelItems'

type AssetSlotPanelRecord = SemanticEntityRecord & AssetSlot
export { AssetSlotListItem, ResourceListItem, ResourcePreviewDialog } from '@/shared/ui/ResourcePanelItems'

// ─── ResourcePanel (tool sidebar) ────────────────────────────────────────────

type ResourcePanelInputType = 'image' | 'video' | 'audio' | 'image+video' | 'media'
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
    queryKey: resourceKeys.panel({
      inputType,
      resourceType: resourceTypeParam,
      keyword,
      page: resourcePage,
    }),
    queryFn: () => api.get('/resources', {
      params: { page: resourcePage, page_size: pageSize, type: resourceTypeParam, q: keyword || undefined },
    }).then(r => r.data),
  })
  const resources = resourcesPageData?.items ?? []
  const resourceTotal = resourcesPageData?.total ?? 0
  const resourcePageCount = Math.max(1, Math.ceil(resourceTotal / pageSize))

  const { data: slotRecords = [] } = useQuery<AssetSlotPanelRecord[]>({
    queryKey: resourceKeys.assetSlotsPanel(current?.ID),
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
  const slotPreviewResources = slots.map(slot => slot.resource).filter((resource): resource is RawResource => Boolean(resource))

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
                previewResources={resources}
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
                previewResources={slotPreviewResources}
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
