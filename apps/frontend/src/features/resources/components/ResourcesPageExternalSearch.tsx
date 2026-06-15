import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import './ResourcesPage.css'
import type { ExternalResourceItem, ExternalResourceSearchResult, ExternalResourceSource, RawResource } from '@/types'
import { ChevronLeft, ChevronRight, Download, KeyRound, Search } from 'lucide-react'
import { api } from '@/shared/infrastructure/api'
import { toast } from '@/shared/ui/toastStore'
import {
  externalResourceSearchInitialData,
  loadExternalResourceSearchSnapshot,
  saveExternalResourceSearchSnapshot,
  type ExternalMediaFilter,
  type ExternalOrientationFilter,
} from '@/features/resources/application/externalResourceSearchSnapshot'
import { externalResourceKeys } from '@/features/resources/application/resourceQueryKeys'
import { invalidateResourceMutationResult, resourceLibraryChangedResult } from '@/features/resources/application/resourceMutationInvalidation'
import {
  ResourcePageActionButton,
  ResourcePageActionGroup,
  ResourcePageAssetGrid,
  ResourcePageBulkActions,
  ResourcePageContent,
  ResourcePageEmptyState,
  ResourcePageFilterBar,
  ResourcePageFlexibleSpace,
  ResourcePageLayout,
  ResourcePageLoadingState,
  ResourcePageMain,
  ResourcePageMutedText,
  ResourcePagePager,
  ResourcePageSearchField,
} from '@/features/resources/components/ResourcePageUi'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@movscript/ui/primitives'
import type { ResourceLibraryViewProps } from '@/features/resources/components/resourceLibraryViewTypes'
import { externalResourceProviderName, uploadExternalResourceItem } from '@/features/resources/application/externalResourceImport'
import {
  ExternalResourceCard,
  ExternalResourcePreviewDialog,
  externalResourceKey,
} from '@/features/resources/components/ResourcesPageExternalSearchItems'

const EXTERNAL_RESOURCE_PAGE_SIZE = 24

const EXTERNAL_ORIENTATION_OPTIONS = [
  { value: 'all', label: '全部方向' },
  { value: 'landscape', label: '横向' },
  { value: 'portrait', label: '竖向' },
  { value: 'square', label: '方形' },
] satisfies Array<{ value: ExternalOrientationFilter; label: string }>

export function ExternalResourceSearchView() {
  const qc = useQueryClient()
  const [searchSnapshot] = useState(() => loadExternalResourceSearchSnapshot())
  const [selectedSourceId, setSelectedSourceId] = useState<number | null>(searchSnapshot?.sourceId ?? null)
  const [query, setQuery] = useState(searchSnapshot?.query ?? '')
  const [submittedQuery, setSubmittedQuery] = useState(searchSnapshot?.submittedQuery ?? '')
  const [selectedMediaTypes, setSelectedMediaTypes] = useState<Set<ExternalMediaFilter>>(() => new Set(searchSnapshot?.mediaTypes?.length ? searchSnapshot.mediaTypes : ['image', 'video']))
  const [orientation, setOrientation] = useState<ExternalOrientationFilter>(searchSnapshot?.orientation ?? 'all')
  const [page, setPage] = useState<number>(searchSnapshot?.page ?? 1)
  const [selectedExternalKeys, setSelectedExternalKeys] = useState<Set<string>>(() => new Set())
  const [previewItem, setPreviewItem] = useState<ExternalResourceItem | null>(null)

  const { data: sources = [], isLoading: sourcesLoading } = useQuery<ExternalResourceSource[]>({
    queryKey: externalResourceKeys.sources,
    queryFn: () => api.get('/external-resource-sources').then(r => r.data),
  })
  const enabledSources = useMemo(() => sources.filter(source => source.is_enabled), [sources])
  const providerOptions = useMemo(() => {
    const seen = new Set<string>()
    return enabledSources.filter((source) => {
      if (seen.has(source.provider_key)) return false
      seen.add(source.provider_key)
      return true
    })
  }, [enabledSources])
  const selectedSource = enabledSources.find(source => source.ID === selectedSourceId) ?? enabledSources[0]
  const selectedProviderKey = selectedSource?.provider_key ?? providerOptions[0]?.provider_key ?? ''
  const providerSources = useMemo(
    () => enabledSources.filter(source => source.provider_key === selectedProviderKey),
    [enabledSources, selectedProviderKey],
  )

  useEffect(() => {
    if (enabledSources[0] && (!selectedSourceId || !enabledSources.some(source => source.ID === selectedSourceId))) {
      setSelectedSourceId(enabledSources[0].ID)
    }
  }, [enabledSources, selectedSourceId])

  const mediaTypes = Array.from(selectedMediaTypes).sort() as ExternalMediaFilter[]
  const mediaTypeKey = mediaTypes.join('|')
  const searchQuery = useQuery<ExternalResourceSearchResult>({
    queryKey: externalResourceKeys.search({
      sourceId: selectedSource?.ID,
      query: submittedQuery,
      mediaTypeKey,
      orientation,
      page,
    }),
    queryFn: async () => {
      const pageSize = Math.max(1, Math.floor(EXTERNAL_RESOURCE_PAGE_SIZE / Math.max(1, mediaTypes.length)))
      const searchMediaType = (mediaType: ExternalMediaFilter) => {
        const params = new URLSearchParams()
        params.set('source_id', String(selectedSource!.ID))
        params.set('q', submittedQuery)
        params.set('media_type', mediaType)
        params.set('page', String(page))
        params.set('page_size', String(pageSize))
        if (orientation !== 'all') params.set('orientation', orientation)
        return api.get(`/external-resources/search?${params}`).then(r => r.data as ExternalResourceSearchResult)
      }
      if (mediaTypes.length === 1) return searchMediaType(mediaTypes[0])
      const results = await Promise.all(mediaTypes.map(searchMediaType))
      return {
        total: results.reduce((sum, result) => sum + result.total, 0),
        items: results.flatMap(result => result.items),
        page,
        page_size: EXTERNAL_RESOURCE_PAGE_SIZE,
        provider: results[0]?.provider ?? selectedSource?.provider_key ?? '',
        source_name: results[0]?.source_name,
      }
    },
    enabled: Boolean(selectedSource?.ID && submittedQuery.trim() && mediaTypes.length > 0),
    initialData: () => externalResourceSearchInitialData(searchSnapshot, {
      sourceId: selectedSource?.ID,
      submittedQuery,
      mediaTypeKey,
      orientation,
      page,
    }),
  })

  useEffect(() => {
    if (!searchQuery.data || !selectedSource?.ID || !submittedQuery.trim()) return
    saveExternalResourceSearchSnapshot({
      sourceId: selectedSource.ID,
      query: submittedQuery,
      submittedQuery,
      mediaTypes,
      orientation,
      page,
      result: searchQuery.data,
    })
  }, [mediaTypeKey, orientation, page, searchQuery.data, selectedSource?.ID, submittedQuery])

  function submitSearch() {
    const nextQuery = query.trim()
    if (!nextQuery) return
    setSubmittedQuery(nextQuery)
    setPage(1)
    setSelectedExternalKeys(new Set())
  }

  const items = searchQuery.data?.items ?? []
  const total = searchQuery.data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / EXTERNAL_RESOURCE_PAGE_SIZE))
  const selectedItems = items.filter(item => selectedExternalKeys.has(externalResourceKey(item)))
  const allVisibleSelected = items.length > 0 && selectedItems.length === items.length
  const importExternalResources = useMutation({
    mutationFn: async (resources: ExternalResourceItem[]) => {
      const created: RawResource[] = []
      for (const item of resources) {
        created.push(await uploadExternalResourceItem(item))
      }
      return created
    },
    onSuccess: (created) => {
      invalidateResourceMutationResult(qc, resourceLibraryChangedResult({ changedIds: created.map(resource => resource.ID) }))
      setSelectedExternalKeys(new Set())
      toast.success(`已加入素材库`, `${created.length} 个外部资源已保存`)
    },
    onError: (error) => {
      toast.error('加入素材库失败', error instanceof Error ? error.message : undefined)
    },
  })

  function toggleMediaType(mediaType: ExternalMediaFilter) {
    setSelectedMediaTypes(current => {
      const next = new Set(current)
      if (next.has(mediaType)) {
        if (next.size === 1) return current
        next.delete(mediaType)
      } else {
        next.add(mediaType)
      }
      return next
    })
    setPage(1)
    setSelectedExternalKeys(new Set())
  }

  function updateOrientation(nextOrientation: ExternalOrientationFilter) {
    setOrientation(nextOrientation)
    setPage(1)
    setSelectedExternalKeys(new Set())
  }

  function updateSelectedSource(nextSourceId: number) {
    setSelectedSourceId(nextSourceId)
    setPage(1)
    setSelectedExternalKeys(new Set())
  }

  function updateSelectedProvider(nextProviderKey: string) {
    const providerSource = enabledSources.find(source => source.provider_key === nextProviderKey)
    if (!providerSource) return
    setSelectedSourceId(providerSource.ID)
    setPage(1)
    setSelectedExternalKeys(new Set())
  }

  function toggleExternalSelection(item: ExternalResourceItem, selected: boolean) {
    const key = externalResourceKey(item)
    setSelectedExternalKeys(current => {
      const next = new Set(current)
      if (selected) next.add(key)
      else next.delete(key)
      return next
    })
  }

  function toggleVisibleSelection() {
    setSelectedExternalKeys(current => {
      const next = new Set(current)
      if (allVisibleSelected) {
        items.forEach(item => next.delete(externalResourceKey(item)))
      } else {
        items.forEach(item => next.add(externalResourceKey(item)))
      }
      return next
    })
  }

  return (
    <>
      <ResourcePageFilterBar>
        <ResourcePageSearchField
          icon={Search}
          value={query}
          onChange={event => setQuery(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') submitSearch()
          }}
          placeholder={selectedSource ? `搜索 ${externalResourceProviderName(selectedSource.provider_key)}` : '搜索外部资源'}
        />
        <ResourcePageActionButton size="sm" onClick={submitSearch} disabled={!selectedSource || !query.trim() || searchQuery.isFetching}>
          <Search size={14} />
          搜索
        </ResourcePageActionButton>
        {providerOptions.length > 1 && (
          <Select
            value={selectedProviderKey}
            onValueChange={updateSelectedProvider}
          >
            <SelectTrigger
              size="sm"
              className="resource-page__external-provider-trigger"
              aria-label="选择外部资源 provider"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {providerOptions.map(source => (
                <SelectItem key={source.provider_key} value={source.provider_key}>
                  {externalResourceProviderName(source.provider_key)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {providerSources.length > 1 && (
          <Select
            value={selectedSource ? String(selectedSource.ID) : ''}
            onValueChange={value => updateSelectedSource(Number(value))}
          >
            <SelectTrigger
              size="sm"
              className="resource-page__external-source-trigger"
              aria-label="选择外部资源来源"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {providerSources.map(source => (
                <SelectItem key={source.ID} value={String(source.ID)}>
                  {source.name || externalResourceProviderName(source.provider_key)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <ResourcePageActionGroup>
          <ResourcePageActionButton size="xs" variant={selectedMediaTypes.has('image') ? 'solid' : 'ghost'} onClick={() => toggleMediaType('image')}>
            图片
          </ResourcePageActionButton>
          <ResourcePageActionButton size="xs" variant={selectedMediaTypes.has('video') ? 'solid' : 'ghost'} onClick={() => toggleMediaType('video')}>
            视频
          </ResourcePageActionButton>
        </ResourcePageActionGroup>
        <ResourcePageActionGroup>
          {EXTERNAL_ORIENTATION_OPTIONS.map(option => (
            <ResourcePageActionButton
              key={option.value}
              size="xs"
              variant={orientation === option.value ? 'solid' : 'ghost'}
              onClick={() => updateOrientation(option.value)}
            >
              {option.label}
            </ResourcePageActionButton>
          ))}
        </ResourcePageActionGroup>
        <ResourcePageFlexibleSpace />
        {selectedItems.length > 0 && (
          <ResourcePageBulkActions>
            <ResourcePageMutedText>已选择 {selectedItems.length} 个</ResourcePageMutedText>
            <ResourcePageActionButton
              variant="outline"
              size="sm"
              onClick={() => importExternalResources.mutate(selectedItems)}
              disabled={importExternalResources.isPending}
            >
              <Download size={14} />
              加入素材库
            </ResourcePageActionButton>
            <ResourcePageActionButton variant="outline" size="sm" onClick={() => setSelectedExternalKeys(new Set())}>
              取消
            </ResourcePageActionButton>
          </ResourcePageBulkActions>
        )}
        {items.length > 0 && (
          <ResourcePageActionButton variant="outline" size="sm" onClick={toggleVisibleSelection}>
            {allVisibleSelected ? '取消全选' : '全选本页'}
          </ResourcePageActionButton>
        )}
      </ResourcePageFilterBar>

      <ResourcePageContent>
        {sourcesLoading ? (
          <ResourcePageLoadingState>加载中</ResourcePageLoadingState>
        ) : !selectedSource ? (
          <ResourcePageEmptyState icon={KeyRound}>配置外部资源 API Key 后开始搜索</ResourcePageEmptyState>
        ) : !submittedQuery ? (
          <ResourcePageEmptyState icon={Search}>输入关键词搜索外部资源</ResourcePageEmptyState>
        ) : searchQuery.isLoading && items.length === 0 ? (
          <ResourcePageLoadingState>搜索中</ResourcePageLoadingState>
        ) : items.length === 0 ? (
          <ResourcePageEmptyState icon={Search}>没有匹配的外部资源</ResourcePageEmptyState>
        ) : (
          <ResourcePageAssetGrid>
            {items.map(item => (
              <ExternalResourceCard
                key={externalResourceKey(item)}
                item={item}
                selected={selectedExternalKeys.has(externalResourceKey(item))}
                onSelectChange={selected => toggleExternalSelection(item, selected)}
                onPreview={() => setPreviewItem(item)}
              />
            ))}
          </ResourcePageAssetGrid>
        )}
      </ResourcePageContent>

      <ResourcePagePager
        status={`第 ${page} / ${pageCount} 页`}
        actions={(
          <>
            <ResourcePageActionButton
              variant="outline"
              size="sm"
              onClick={() => { setPage(p => Math.max(1, p - 1)); setSelectedExternalKeys(new Set()) }}
              disabled={page <= 1 || searchQuery.isFetching}
            >
              <ChevronLeft size={14} />
              上一页
            </ResourcePageActionButton>
            <ResourcePageActionButton
              variant="outline"
              size="sm"
              onClick={() => { setPage(p => Math.min(pageCount, p + 1)); setSelectedExternalKeys(new Set()) }}
              disabled={page >= pageCount || searchQuery.isFetching}
            >
              下一页
              <ChevronRight size={14} />
            </ResourcePageActionButton>
          </>
        )}
      />
      {previewItem ? (
        <ExternalResourcePreviewDialog
          item={previewItem}
          onClose={() => setPreviewItem(null)}
          onAdd={() => importExternalResources.mutate([previewItem], { onSuccess: () => setPreviewItem(null) })}
          adding={importExternalResources.isPending}
        />
      ) : null}
    </>
  )
}

export function ExternalResourceSearchPage({
  variant = 'page',
}: ResourceLibraryViewProps) {
  return (
    <ResourcePageLayout data-resource-variant={variant}>
      <ResourcePageMain>
        <ExternalResourceSearchView />
      </ResourcePageMain>
    </ResourcePageLayout>
  )
}
