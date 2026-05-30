import { useEffect, useMemo, useRef, useState } from 'react'

import type { DeliveryTimelineItem, DeliveryVersion } from '@/shared/infrastructure/api/deliveryEntities'
import {
  filterDeliveryVersions,
  parsePositiveDeliveryNumber,
  type DeliveryVersionFilter,
} from '@/features/delivery/domain/deliveryWorkbenchModel'
import {
  hasExplicitWorkbenchSearchParam,
  useWorkbenchSessionStore,
} from '@/features/project-workbenches/application/workbenchSessionStore'

const DELIVERY_WORKBENCH_SESSION_SEARCH_KEYS = ['productionId']

export type DeliveryWorkbenchSearchParamsSetter = (
  nextInit: URLSearchParams,
  navigateOptions?: { replace?: boolean },
) => void

export function readDeliveryWorkbenchProductionId(searchParams: URLSearchParams) {
  return parsePositiveDeliveryNumber(searchParams.get('productionId'))
}

export function buildDeliveryWorkbenchProductionSearchParams(searchParams: URLSearchParams, productionId: number | null) {
  const next = new URLSearchParams(searchParams)
  if (productionId) next.set('productionId', String(productionId))
  else next.delete('productionId')
  return next
}

export function buildDeliveryWorkbenchVisibleVersions(
  versions: DeliveryVersion[],
  filter: DeliveryVersionFilter,
  search: string,
) {
  return filterDeliveryVersions(versions, filter, search)
}

export function resolveDeliveryWorkbenchSelectedVersion(
  versions: DeliveryVersion[],
  selectedVersionId: number | null,
) {
  if (selectedVersionId) {
    const selected = versions.find((item) => item.ID === selectedVersionId)
    if (selected) return selected
  }
  return versions.find((item) => item.is_primary) ?? versions[0] ?? null
}

export function resolveDeliveryWorkbenchSelectedItem(
  timelineItems: DeliveryTimelineItem[],
  selectedItemId: number | null,
) {
  return selectedItemId ? timelineItems.find((item) => item.ID === selectedItemId) ?? null : null
}

export function useDeliveryWorkbenchVersionController({
  projectId,
  route,
  searchParams,
  setSearchParams,
  versions,
}: {
  projectId?: number
  route?: string
  searchParams: URLSearchParams
  setSearchParams: DeliveryWorkbenchSearchParamsSetter
  versions: DeliveryVersion[]
}) {
  const [filter, setFilter] = useState<DeliveryVersionFilter>('all')
  const [search, setSearch] = useState('')
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null)
  const selectedProductionId = useMemo(() => readDeliveryWorkbenchProductionId(searchParams), [searchParams])
  const previousProductionId = useRef(selectedProductionId)
  const restoredProductionRef = useRef(false)
  const sessionSnapshot = useWorkbenchSessionStore((state) => projectId ? state.snapshotFor(projectId, 'delivery') : null)
  const upsertWorkbenchSessionSnapshot = useWorkbenchSessionStore((state) => state.upsertSnapshot)
  const hasExplicitSessionSearch = useMemo(
    () => hasExplicitWorkbenchSearchParam(searchParams, DELIVERY_WORKBENCH_SESSION_SEARCH_KEYS),
    [searchParams],
  )

  const visibleVersions = useMemo(
    () => buildDeliveryWorkbenchVisibleVersions(versions, filter, search),
    [filter, search, versions],
  )
  const selectedVersion = useMemo(
    () => versions.find((item) => item.ID === selectedVersionId) ?? null,
    [selectedVersionId, versions],
  )
  const snapshotVersionId = sessionSnapshot?.selection?.secondary?.entityType === 'delivery_version'
    ? sessionSnapshot.selection.secondary.entityId
    : 0

  function persistSessionSnapshot(input: {
    productionId?: number | null
    versionId?: number | null
    itemId?: number | null
    filter?: DeliveryVersionFilter
    search?: string
  }) {
    if (!projectId) return
    const nextProductionId = input.productionId === undefined ? selectedProductionId : input.productionId
    const nextVersionId = input.versionId === undefined ? selectedVersionId : input.versionId
    const filters: Record<string, string | number | null> = {
      productionId: nextProductionId ?? null,
      versionFilter: input.filter ?? filter,
      versionSearch: input.search ?? search,
    }
    if (input.itemId !== undefined) filters.selectedItemId = input.itemId
    upsertWorkbenchSessionSnapshot({
      projectId,
      workbenchId: 'delivery',
      route,
      search: searchParams.toString(),
      filters,
      selection: {
        ...(nextProductionId ? { primary: { entityType: 'production', entityId: nextProductionId } } : {}),
        ...(nextVersionId ? { secondary: { entityType: 'delivery_version', entityId: nextVersionId } } : {}),
      },
    })
  }

  useEffect(() => {
    if (!projectId || hasExplicitSessionSearch || restoredProductionRef.current || !sessionSnapshot) return
    restoredProductionRef.current = true
    const snapshotProductionId = sessionSnapshot.selection?.primary?.entityType === 'production'
      ? sessionSnapshot.selection.primary.entityId
      : Number(sessionSnapshot.filters?.productionId) || 0
    const snapshotFilter = sessionSnapshot.filters?.versionFilter
    const snapshotSearch = sessionSnapshot.filters?.versionSearch
    if (snapshotFilter === 'all' || snapshotFilter === 'draft' || snapshotFilter === 'checking' || snapshotFilter === 'approved' || snapshotFilter === 'exported') {
      setFilter(snapshotFilter)
    }
    if (typeof snapshotSearch === 'string') setSearch(snapshotSearch)
    if (snapshotProductionId > 0) {
      setSearchParams(buildDeliveryWorkbenchProductionSearchParams(searchParams, snapshotProductionId), { replace: true })
    }
  }, [hasExplicitSessionSearch, projectId, searchParams, sessionSnapshot, setSearchParams])

  useEffect(() => {
    if (!selectedVersionId && versions.length > 0) {
      const restoredVersion = snapshotVersionId ? versions.find((item) => item.ID === snapshotVersionId) ?? null : null
      setSelectedVersionId((restoredVersion ?? resolveDeliveryWorkbenchSelectedVersion(versions, null))?.ID ?? null)
    }
  }, [selectedVersionId, snapshotVersionId, versions])

  useEffect(() => {
    if (selectedVersionId && !versions.some((item) => item.ID === selectedVersionId)) {
      setSelectedVersionId(resolveDeliveryWorkbenchSelectedVersion(versions, null)?.ID ?? null)
    }
  }, [selectedVersionId, versions])

  useEffect(() => {
    if (previousProductionId.current === selectedProductionId) return
    previousProductionId.current = selectedProductionId
    setSelectedVersionId(null)
  }, [selectedProductionId])

  function selectProduction(productionId: number | null) {
    persistSessionSnapshot({ productionId, versionId: null, itemId: null })
    setSearchParams(buildDeliveryWorkbenchProductionSearchParams(searchParams, productionId), { replace: true })
  }

  function selectVersion(versionId: number | null) {
    setSelectedVersionId(versionId)
    persistSessionSnapshot({ versionId, itemId: null })
  }

  return {
    filter,
    search,
    selectedProductionId,
    selectedVersionId,
    selectedVersion,
    visibleVersions,
    setFilter: (value: DeliveryVersionFilter) => {
      setFilter(value)
      persistSessionSnapshot({ filter: value })
    },
    setSearch: (value: string) => {
      setSearch(value)
      persistSessionSnapshot({ search: value })
    },
    setSelectedVersionId: selectVersion,
    selectProduction,
  }
}

export function useDeliveryWorkbenchTimelineSelectionController({
  projectId,
  route,
  selectedProductionId,
  selectedVersionId,
  timelineItems,
}: {
  projectId?: number
  route?: string
  selectedProductionId: number | null
  selectedVersionId: number | null
  timelineItems: DeliveryTimelineItem[]
}) {
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null)
  const [editingItem, setEditingItem] = useState(false)
  const sessionSnapshot = useWorkbenchSessionStore((state) => projectId ? state.snapshotFor(projectId, 'delivery') : null)
  const upsertWorkbenchSessionSnapshot = useWorkbenchSessionStore((state) => state.upsertSnapshot)
  const selectedItem = useMemo(
    () => resolveDeliveryWorkbenchSelectedItem(timelineItems, selectedItemId),
    [selectedItemId, timelineItems],
  )
  const snapshotVersionId = sessionSnapshot?.selection?.secondary?.entityType === 'delivery_version'
    ? sessionSnapshot.selection.secondary.entityId
    : 0
  const snapshotItemId = Number(sessionSnapshot?.filters?.selectedItemId) || 0

  function persistSessionSnapshot(itemId: number | null) {
    if (!projectId) return
    upsertWorkbenchSessionSnapshot({
      projectId,
      workbenchId: 'delivery',
      route,
      filters: {
        productionId: selectedProductionId ?? null,
        selectedItemId: itemId,
      },
      selection: {
        ...(selectedProductionId ? { primary: { entityType: 'production', entityId: selectedProductionId } } : {}),
        ...(selectedVersionId ? { secondary: { entityType: 'delivery_version', entityId: selectedVersionId } } : {}),
      },
    })
  }

  useEffect(() => {
    setSelectedItemId(null)
    setEditingItem(false)
  }, [selectedVersionId])

  useEffect(() => {
    if (selectedItemId === null && timelineItems.length > 0) {
      const restoredItem = snapshotVersionId === selectedVersionId && snapshotItemId
        ? timelineItems.find((item) => item.ID === snapshotItemId) ?? null
        : null
      setSelectedItemId((restoredItem ?? timelineItems[0]).ID)
    }
  }, [selectedItemId, selectedVersionId, snapshotItemId, snapshotVersionId, timelineItems])

  useEffect(() => {
    setEditingItem(false)
  }, [selectedItemId])

  return {
    selectedItemId,
    selectedItem,
    editingItem,
    setSelectedItemId: (itemId: number | null) => {
      setSelectedItemId(itemId)
      persistSessionSnapshot(itemId)
    },
    setEditingItem,
  }
}
