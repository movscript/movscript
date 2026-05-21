import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import type { DeliveryTimelineItem } from '@/api/deliveryEntities'
import { api } from '@/lib/api'
import { deliveryResourcePageCount, selectDeliveryResource } from '@/lib/deliveryWorkbenchModel'
import type { PaginatedResponse, RawResource } from '@/types'

export type DeliveryResourceTypeFilter = 'all' | RawResource['type']

export interface DeliveryResourceLibraryState {
  search: string
  type: DeliveryResourceTypeFilter
  page: number
}

export const DELIVERY_RESOURCE_PAGE_SIZE = 6

export const initialDeliveryResourceLibraryState: DeliveryResourceLibraryState = {
  search: '',
  type: 'video',
  page: 1,
}

export function deliveryResourceLibraryTypeParam(type: DeliveryResourceTypeFilter) {
  return type === 'all' ? 'image,video,audio,text,file' : type
}

export function buildDeliveryResourceLibraryQueryKey(
  projectId: number | undefined,
  state: DeliveryResourceLibraryState,
) {
  return ['resources', 'semantic-final-library', projectId, state.type, state.search, state.page] as const
}

export function buildDeliveryResourceLibraryParams(
  state: DeliveryResourceLibraryState,
  pageSize = DELIVERY_RESOURCE_PAGE_SIZE,
) {
  return {
    page: state.page,
    page_size: pageSize,
    type: deliveryResourceLibraryTypeParam(state.type),
    q: state.search.trim() || undefined,
  }
}

export function setDeliveryResourceLibrarySearch(
  state: DeliveryResourceLibraryState,
  search: string,
): DeliveryResourceLibraryState {
  return {
    ...state,
    search,
    page: 1,
  }
}

export function setDeliveryResourceLibraryType(
  state: DeliveryResourceLibraryState,
  type: DeliveryResourceTypeFilter,
): DeliveryResourceLibraryState {
  return {
    ...state,
    type,
    page: 1,
  }
}

export function setDeliveryResourceLibraryPage(
  state: DeliveryResourceLibraryState,
  page: number,
): DeliveryResourceLibraryState {
  return {
    ...state,
    page: Math.max(1, Math.round(Number(page) || 1)),
  }
}

export function useDeliveryWorkbenchResourceLibrary({
  projectId,
  selectedItem,
}: {
  projectId?: number
  selectedItem: DeliveryTimelineItem | null
}) {
  const [state, setState] = useState(initialDeliveryResourceLibraryState)
  const query = useQuery<PaginatedResponse<RawResource>>({
    queryKey: buildDeliveryResourceLibraryQueryKey(projectId, state),
    queryFn: () => api.get('/resources', {
      params: buildDeliveryResourceLibraryParams(state),
    }).then((response) => response.data),
    enabled: !!projectId,
  })

  const resources = query.data?.items ?? []
  const total = query.data?.total ?? 0
  const pageCount = deliveryResourcePageCount(total, DELIVERY_RESOURCE_PAGE_SIZE)
  const selectedResource = useMemo(
    () => selectDeliveryResource(resources, selectedItem),
    [resources, selectedItem],
  )

  return {
    state,
    resources,
    total,
    pageCount,
    selectedResource,
    isLoading: query.isLoading || query.isFetching,
    query,
    setSearch: (search: string) => setState((current) => setDeliveryResourceLibrarySearch(current, search)),
    setType: (type: DeliveryResourceTypeFilter) => setState((current) => setDeliveryResourceLibraryType(current, type)),
    setPage: (page: number) => setState((current) => setDeliveryResourceLibraryPage(current, page)),
  }
}
