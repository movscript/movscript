import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { api } from '@/lib/api'
import type { AssetKind } from '@/lib/preProductionAssetRows'
import {
  initialPreProductionResourceLibraryState,
  openPreProductionResourceLibraryState,
  preProductionResourceLibraryPageCount,
  preProductionResourceLibraryTotal,
  preProductionResourceLibraryTypeParam,
  setPreProductionResourceLibraryOpen,
  setPreProductionResourceLibraryPage,
  setPreProductionResourceLibrarySearch,
  setPreProductionResourceLibrarySelection,
  setPreProductionResourceLibraryType,
  type PreProductionResourceLibraryState,
  type PreProductionResourceTypeFilter,
} from '@/lib/preProductionAssetCandidateWrite'
import type { PaginatedResponse, RawResource } from '@/types'

export const PRE_PRODUCTION_RESOURCE_PAGE_SIZE = 18

export function buildPreProductionResourceLibraryQueryKey(
  state: PreProductionResourceLibraryState,
) {
  return ['resources', 'pre-production-library-picker', preProductionResourceLibraryTypeParam(state.type), state.search, state.page] as const
}

export function buildPreProductionResourceLibraryParams(
  state: PreProductionResourceLibraryState,
  pageSize = PRE_PRODUCTION_RESOURCE_PAGE_SIZE,
) {
  return {
    page: state.page,
    page_size: pageSize,
    type: preProductionResourceLibraryTypeParam(state.type),
    q: state.search.trim() || undefined,
  }
}

export function preProductionResourceItems(data?: PaginatedResponse<RawResource> | RawResource[]) {
  return Array.isArray(data) ? data : data?.items ?? []
}

export function usePreProductionResourceLibrary() {
  const [state, setState] = useState(initialPreProductionResourceLibraryState)
  const query = useQuery<PaginatedResponse<RawResource> | RawResource[]>({
    queryKey: buildPreProductionResourceLibraryQueryKey(state),
    queryFn: () => api.get('/resources', {
      params: buildPreProductionResourceLibraryParams(state),
    }).then((response) => response.data),
    enabled: state.open,
  })

  function open(kind: Exclude<AssetKind, 'all'>) {
    setState(openPreProductionResourceLibraryState(kind))
  }

  function setOpen(openState: boolean) {
    setState((current) => setPreProductionResourceLibraryOpen(current, openState))
  }

  function setSearch(search: string) {
    setState((current) => setPreProductionResourceLibrarySearch(current, search))
  }

  function setType(type: PreProductionResourceTypeFilter) {
    setState((current) => setPreProductionResourceLibraryType(current, type))
  }

  function setPage(page: number) {
    setState((current) => setPreProductionResourceLibraryPage(current, page))
  }

  function select(resource: RawResource) {
    setState((current) => setPreProductionResourceLibrarySelection(current, resource))
  }

  function clearSelection() {
    setState((current) => setPreProductionResourceLibrarySelection(current, null))
  }

  return {
    state,
    query,
    resources: preProductionResourceItems(query.data),
    total: preProductionResourceLibraryTotal(query.data),
    pageCount: preProductionResourceLibraryPageCount({ data: query.data }),
    isLoading: query.isLoading || query.isFetching,
    open,
    setOpen,
    setSearch,
    setType,
    setPage,
    select,
    clearSelection,
  }
}
