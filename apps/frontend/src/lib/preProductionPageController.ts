import { useMemo, useState } from 'react'

import type { SemanticEntityRecord } from '@/api/semanticEntities'
import { readNumberParam, readStringParam, updateContentFilterParams, type ContentFilterKey } from '@/pages/contents/lib/contentFilters'
import {
  normalizeAssetKind,
  type AssetKind,
  type AssetSlotViewModel,
  type CreativeReferenceRecord,
  type ReferenceAssetCluster,
} from '@/lib/preProductionAssetRows'

export interface PreProductionPageSelectionInput {
  searchParams: URLSearchParams
  rows: AssetSlotViewModel[]
  clusters: ReferenceAssetCluster[]
  referenceById: Map<number, CreativeReferenceRecord>
}

export interface PreProductionPageSelection {
  selectedId: number | null
  selectedReferenceParam: number | null
  kindFilter: AssetKind
  filtered: AssetSlotViewModel[]
  filteredClusters: ReferenceAssetCluster[]
  selected: AssetSlotViewModel | null
  selectedReferenceId: number | null | undefined
  selectedReference: CreativeReferenceRecord | null
  selectedCluster: ReferenceAssetCluster | null
}

export function buildPreProductionFilterParams(
  searchParams: URLSearchParams,
  updates: Partial<Record<ContentFilterKey, string | number | null | undefined>>,
) {
  return updateContentFilterParams(searchParams, updates) as URLSearchParams
}

export function buildPreProductionSlotSelectionParams(
  searchParams: URLSearchParams,
  rows: AssetSlotViewModel[],
  slotId: number,
  options: { forceOpen?: boolean } = {},
) {
  const selectedId = readNumberParam(searchParams, 'asset_slot_id') ?? readNumberParam(searchParams, 'selected')
  if (!options.forceOpen && selectedId === slotId) {
    return buildPreProductionFilterParams(searchParams, { reference_id: null, asset_slot_id: null, selected: null })
  }
  const row = rows.find((item) => item.slot.ID === slotId)
  return buildPreProductionFilterParams(searchParams, {
    reference_id: row?.slot.creative_reference_id ?? null,
    asset_slot_id: slotId,
    selected: null,
  })
}

export function buildPreProductionReferenceSelectionParams(
  searchParams: URLSearchParams,
  referenceId: number,
  options: { forceOpen?: boolean } = {},
) {
  const selectedId = readNumberParam(searchParams, 'asset_slot_id') ?? readNumberParam(searchParams, 'selected')
  const selectedReferenceId = readNumberParam(searchParams, 'reference_id')
  if (!options.forceOpen && !selectedId && selectedReferenceId === referenceId) {
    return buildPreProductionFilterParams(searchParams, { reference_id: null, asset_slot_id: null, selected: null })
  }
  return buildPreProductionFilterParams(searchParams, { reference_id: referenceId, asset_slot_id: null, selected: null })
}

export function resolvePreProductionPageSelection({
  searchParams,
  rows,
  clusters,
  referenceById,
}: PreProductionPageSelectionInput): PreProductionPageSelection {
  const selectedId = readNumberParam(searchParams, 'asset_slot_id') ?? readNumberParam(searchParams, 'selected')
  const selectedReferenceParam = readNumberParam(searchParams, 'reference_id')
  const kindParam = readStringParam(searchParams, 'kind')
  const kindFilter: AssetKind = kindParam ? normalizeAssetKind(kindParam) : 'all'
  const filtered = rows.filter((row) => kindFilter === 'all' || row.kind === kindFilter)
  const filteredClusters = clusters.map((cluster) => ({
    ...cluster,
    rows: cluster.rows.filter((row) => kindFilter === 'all' || row.kind === kindFilter),
  }))
  const selected = selectedId ? rows.find((row) => row.slot.ID === selectedId) ?? null : null
  const selectedReferenceId = selected
    ? selectedReferenceParam ?? selected.slot.creative_reference_id ?? null
    : selectedReferenceParam ?? null
  const selectedReference = selectedReferenceId ? referenceById.get(selectedReferenceId) ?? null : null
  const selectedCluster = selectedReferenceId
    ? filteredClusters.find((cluster) => (cluster.reference?.ID ?? 0) === selectedReferenceId) ?? null
    : null

  return {
    selectedId,
    selectedReferenceParam,
    kindFilter,
    filtered,
    filteredClusters,
    selected,
    selectedReferenceId,
    selectedReference,
    selectedCluster,
  }
}

export function usePreProductionPageController({
  searchParams,
  setSearchParams,
  rows,
  clusters,
  referenceById,
}: PreProductionPageSelectionInput & {
  setSearchParams: (nextInit: URLSearchParams, navigateOptions?: { replace?: boolean }) => void
}) {
  const [newSlotEditId, setNewSlotEditId] = useState<number | null>(null)
  const [newReferenceEditKey, setNewReferenceEditKey] = useState<string | number | null>(null)
  const selection = useMemo(() => resolvePreProductionPageSelection({
    searchParams,
    rows,
    clusters,
    referenceById,
  }), [clusters, referenceById, rows, searchParams])

  function setFilter(updates: Partial<Record<ContentFilterKey, string | number | null | undefined>>) {
    setSearchParams(buildPreProductionFilterParams(searchParams, updates), { replace: true })
  }

  function startCreateReference() {
    setNewReferenceEditKey(`new-reference-${Date.now()}`)
    setFilter({ reference_id: null, asset_slot_id: null, selected: null })
  }

  function handleSlotCreated(record: SemanticEntityRecord) {
    setNewSlotEditId(record.ID)
    setFilter({ asset_slot_id: record.ID, selected: null })
  }

  function handleSlotSaved(record: SemanticEntityRecord) {
    setNewSlotEditId((id) => id === record.ID ? null : id)
    setFilter({ asset_slot_id: record.ID })
  }

  function handleSlotDeleted() {
    setNewSlotEditId(null)
    setFilter({ asset_slot_id: null, selected: null })
  }

  function handleReferenceSaved(record: SemanticEntityRecord) {
    setNewReferenceEditKey(null)
    setFilter({ reference_id: record.ID, asset_slot_id: null, selected: null })
  }

  function handleReferenceDeleted() {
    setNewReferenceEditKey(null)
    setFilter({ reference_id: null, asset_slot_id: null, selected: null })
  }

  function selectSlot(slotId: number) {
    setNewReferenceEditKey(null)
    setSearchParams(buildPreProductionSlotSelectionParams(searchParams, rows, slotId), { replace: true })
  }

  function selectReference(referenceId: number) {
    setNewReferenceEditKey(null)
    setSearchParams(buildPreProductionReferenceSelectionParams(searchParams, referenceId), { replace: true })
  }

  function openSlot(slotId: number) {
    setNewReferenceEditKey(null)
    setSearchParams(buildPreProductionSlotSelectionParams(searchParams, rows, slotId, { forceOpen: true }), { replace: true })
  }

  function openReference(referenceId: number) {
    setNewReferenceEditKey(null)
    setSearchParams(buildPreProductionReferenceSelectionParams(searchParams, referenceId, { forceOpen: true }), { replace: true })
  }

  return {
    ...selection,
    newSlotEditId,
    newReferenceEditKey,
    setFilter,
    startCreateReference,
    handleSlotCreated,
    handleSlotSaved,
    handleSlotDeleted,
    handleReferenceSaved,
    handleReferenceDeleted,
    selectSlot,
    selectReference,
    openSlot,
    openReference,
  }
}
