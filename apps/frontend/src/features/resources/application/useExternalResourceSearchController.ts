import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ExternalResourceItem, ExternalResourceSearchResult, ExternalResourceSource, RawResource } from '@/types'
import { api } from '@/shared/infrastructure/api'
import { toast } from '@/shared/ui/toastStore'
import {
  externalResourceSearchInitialData,
  loadExternalResourceSearchSnapshot,
  saveExternalResourceSearchSnapshot,
  subscribeExternalResourceSearchSnapshot,
  type ExternalMediaFilter,
  type ExternalOrientationFilter,
  type ExternalResourceSearchSnapshot,
} from '@/features/resources/application/externalResourceSearchSnapshot'
import {
  EXTERNAL_RESOURCE_PAGE_SIZE,
  externalResourceKey,
} from '@/features/resources/application/externalResourceSearchModel'
import { externalResourceKeys } from '@/features/resources/application/resourceQueryKeys'
import { invalidateResourceMutationResult, resourceLibraryChangedResult } from '@/features/resources/application/resourceMutationInvalidation'
import { uploadExternalResourceItem } from '@/features/resources/application/externalResourceImport'

export function useExternalResourceSearchController() {
  const qc = useQueryClient()
  const [searchSnapshot, setSearchSnapshot] = useState(() => loadExternalResourceSearchSnapshot())
  const externalSearchUserEditedRef = useRef(false)
  const appliedSnapshotSignatureRef = useRef(externalResourceSearchSnapshotSignature(searchSnapshot))
  const [selectedSourceId, setSelectedSourceId] = useState<number | null>(searchSnapshot?.sourceId ?? null)
  const [query, setQuery] = useState(searchSnapshot?.query ?? '')
  const [submittedQuery, setSubmittedQuery] = useState(searchSnapshot?.submittedQuery ?? '')
  const [selectedMediaTypes, setSelectedMediaTypes] = useState<Set<ExternalMediaFilter>>(() => new Set(searchSnapshot?.mediaTypes?.length ? searchSnapshot.mediaTypes : ['image', 'video']))
  const [orientation, setOrientation] = useState<ExternalOrientationFilter>(searchSnapshot?.orientation ?? 'all')
  const [page, setPage] = useState<number>(searchSnapshot?.page ?? 1)
  const [selectedExternalKeys, setSelectedExternalKeys] = useState<Set<string>>(() => new Set())
  const [previewItem, setPreviewItem] = useState<ExternalResourceItem | null>(null)

  useEffect(() => {
    const applyHydratedSnapshot = (snapshot: ExternalResourceSearchSnapshot | null) => {
      if (!snapshot || externalSearchUserEditedRef.current) return
      const snapshotSignature = externalResourceSearchSnapshotSignature(snapshot)
      if (snapshotSignature === appliedSnapshotSignatureRef.current) return
      appliedSnapshotSignatureRef.current = snapshotSignature
      setSearchSnapshot(snapshot)
      setSelectedSourceId(snapshot.sourceId ?? null)
      setQuery(snapshot.query ?? snapshot.submittedQuery ?? '')
      setSubmittedQuery(snapshot.submittedQuery ?? '')
      setSelectedMediaTypes(new Set(snapshot.mediaTypes?.length ? snapshot.mediaTypes : ['image', 'video']))
      setOrientation(snapshot.orientation ?? 'all')
      setPage(snapshot.page ?? 1)
      setSelectedExternalKeys(new Set())
    }
    const unsubscribe = subscribeExternalResourceSearchSnapshot(applyHydratedSnapshot)
    applyHydratedSnapshot(loadExternalResourceSearchSnapshot())
    return unsubscribe
  }, [])

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

  const mediaTypes = useMemo(
    () => Array.from(selectedMediaTypes).sort() as ExternalMediaFilter[],
    [selectedMediaTypes],
  )
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
  }, [mediaTypeKey, mediaTypes, orientation, page, searchQuery.data, selectedSource?.ID, submittedQuery])

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

  function submitSearch() {
    externalSearchUserEditedRef.current = true
    const nextQuery = query.trim()
    if (!nextQuery) return
    setSubmittedQuery(nextQuery)
    setPage(1)
    setSelectedExternalKeys(new Set())
  }

  function updateQuery(nextQuery: string) {
    externalSearchUserEditedRef.current = true
    setQuery(nextQuery)
  }

  function toggleMediaType(mediaType: ExternalMediaFilter) {
    externalSearchUserEditedRef.current = true
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
    externalSearchUserEditedRef.current = true
    setOrientation(nextOrientation)
    setPage(1)
    setSelectedExternalKeys(new Set())
  }

  function updateSelectedSource(nextSourceId: number) {
    externalSearchUserEditedRef.current = true
    setSelectedSourceId(nextSourceId)
    setPage(1)
    setSelectedExternalKeys(new Set())
  }

  function updateSelectedProvider(nextProviderKey: string) {
    externalSearchUserEditedRef.current = true
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

  function clearSelection() {
    setSelectedExternalKeys(new Set())
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

  function previousPage() {
    externalSearchUserEditedRef.current = true
    setPage(p => Math.max(1, p - 1))
    setSelectedExternalKeys(new Set())
  }

  function nextPage() {
    externalSearchUserEditedRef.current = true
    setPage(p => Math.min(pageCount, p + 1))
    setSelectedExternalKeys(new Set())
  }

  return {
    allVisibleSelected,
    clearSelection,
    importExternalResources,
    isExternalItemSelected: (item: ExternalResourceItem) => selectedExternalKeys.has(externalResourceKey(item)),
    items,
    itemKey: externalResourceKey,
    nextPage,
    orientation,
    page,
    pageCount,
    previousPage,
    previewItem,
    providerOptions,
    providerSources,
    query,
    searchQuery,
    selectedItems,
    selectedMediaTypes,
    selectedProviderKey,
    selectedSource,
    setPreviewItem,
    sourcesLoading,
    submitSearch,
    submittedQuery,
    toggleExternalSelection,
    toggleMediaType,
    toggleVisibleSelection,
    updateOrientation,
    updateQuery,
    updateSelectedProvider,
    updateSelectedSource,
  }
}

function externalResourceSearchSnapshotSignature(snapshot: ExternalResourceSearchSnapshot | null): string {
  return snapshot ? JSON.stringify(snapshot) : ''
}
