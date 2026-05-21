import { useEffect, useMemo, useRef, useState } from 'react'

import type { DeliveryTimelineItem, DeliveryVersion } from '@/api/deliveryEntities'
import {
  filterDeliveryVersions,
  parsePositiveDeliveryNumber,
  type DeliveryVersionFilter,
} from '@/lib/deliveryWorkbenchModel'

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
  searchParams,
  setSearchParams,
  versions,
}: {
  searchParams: URLSearchParams
  setSearchParams: DeliveryWorkbenchSearchParamsSetter
  versions: DeliveryVersion[]
}) {
  const [filter, setFilter] = useState<DeliveryVersionFilter>('all')
  const [search, setSearch] = useState('')
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null)
  const selectedProductionId = useMemo(() => readDeliveryWorkbenchProductionId(searchParams), [searchParams])
  const previousProductionId = useRef(selectedProductionId)

  const visibleVersions = useMemo(
    () => buildDeliveryWorkbenchVisibleVersions(versions, filter, search),
    [filter, search, versions],
  )
  const selectedVersion = useMemo(
    () => versions.find((item) => item.ID === selectedVersionId) ?? null,
    [selectedVersionId, versions],
  )

  useEffect(() => {
    if (!selectedVersionId && versions.length > 0) {
      setSelectedVersionId(resolveDeliveryWorkbenchSelectedVersion(versions, null)?.ID ?? null)
    }
  }, [selectedVersionId, versions])

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
    setSearchParams(buildDeliveryWorkbenchProductionSearchParams(searchParams, productionId), { replace: true })
  }

  return {
    filter,
    search,
    selectedProductionId,
    selectedVersionId,
    selectedVersion,
    visibleVersions,
    setFilter,
    setSearch,
    setSelectedVersionId,
    selectProduction,
  }
}

export function useDeliveryWorkbenchTimelineSelectionController({
  selectedVersionId,
  timelineItems,
}: {
  selectedVersionId: number | null
  timelineItems: DeliveryTimelineItem[]
}) {
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null)
  const [editingItem, setEditingItem] = useState(false)
  const selectedItem = useMemo(
    () => resolveDeliveryWorkbenchSelectedItem(timelineItems, selectedItemId),
    [selectedItemId, timelineItems],
  )

  useEffect(() => {
    setSelectedItemId(null)
    setEditingItem(false)
  }, [selectedVersionId])

  useEffect(() => {
    if (selectedItemId === null && timelineItems.length > 0) {
      setSelectedItemId(timelineItems[0].ID)
    }
  }, [selectedItemId, timelineItems])

  useEffect(() => {
    setEditingItem(false)
  }, [selectedItemId])

  return {
    selectedItemId,
    selectedItem,
    editingItem,
    setSelectedItemId,
    setEditingItem,
  }
}
