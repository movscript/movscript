import { useEffect, useMemo, useRef, useState } from 'react'

import type { SemanticEntityRecord } from '@/shared/infrastructure/api/semanticEntities'
import { readNumberParam, readStringParam, updateContentFilterParams, type ContentFilterKey } from '@/features/content/presentation/contentFilters'
import {
  hasExplicitWorkbenchSearchParam,
  useWorkbenchSessionStore,
} from '@/features/project-workbenches/application/workbenchSessionStore'
import {
  normalizeAssetKind,
  type AssetKind,
  type AssetSlotViewModel,
  type CreativeReferenceRecord,
  type ReferenceAssetCluster,
} from '@/features/pre-production/domain/preProductionAssetRows'

const PRE_PRODUCTION_SESSION_SELECTION_KEYS = ['reference_id', 'asset_slot_id', 'selected']

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

export type PreProductionSearchParamsSetter = (
  nextInit: URLSearchParams | ((current: URLSearchParams) => URLSearchParams),
  navigateOptions?: { replace?: boolean },
) => void

export function buildPreProductionFilterParams(
  searchParams: URLSearchParams,
  updates: Partial<Record<ContentFilterKey, string | number | null | undefined>>,
) {
  return updateContentFilterParams(searchParams, updates) as URLSearchParams
}

export function normalizePreProductionKindFilter(value?: string | null): AssetKind {
  const normalized = String(value ?? '').trim()
  return !normalized || normalized === 'all' ? 'all' : normalizeAssetKind(normalized)
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

export function buildPreProductionSessionRestoreParams({
  searchParams,
  rows,
  referenceById,
  kind,
  slotId,
  referenceId,
}: {
  searchParams: URLSearchParams
  rows: AssetSlotViewModel[]
  referenceById: Map<number, CreativeReferenceRecord>
  kind: AssetKind
  slotId: number
  referenceId: number
}) {
  const restoredRow = slotId ? rows.find((row) => row.slot.ID === slotId) ?? null : null
  const restoredReferenceId = restoredRow?.slot.creative_reference_id ?? (referenceId && referenceById.has(referenceId) ? referenceId : 0)
  const next = new URLSearchParams(searchParams)
  if (!next.get('kind') && kind !== 'all' && rows.some((row) => row.kind === kind)) next.set('kind', kind)
  if (restoredReferenceId) next.set('reference_id', String(restoredReferenceId))
  else next.delete('reference_id')
  if (restoredRow) next.set('asset_slot_id', String(restoredRow.slot.ID))
  else next.delete('asset_slot_id')
  next.delete('selected')
  return next
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
  const parsedKindFilter = normalizePreProductionKindFilter(kindParam)
  const filteredByKind = rows.filter((row) => parsedKindFilter === 'all' || row.kind === parsedKindFilter)
  const kindFilter = parsedKindFilter === 'other' && rows.length > 0 && filteredByKind.length === 0 ? 'all' : parsedKindFilter
  const filtered = kindFilter === parsedKindFilter ? filteredByKind : rows
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
  projectId,
  route,
  searchParams,
  setSearchParams,
  rows,
  clusters,
  referenceById,
}: PreProductionPageSelectionInput & {
  projectId?: number
  route?: string
  setSearchParams: PreProductionSearchParamsSetter
}) {
  const [newSlotEditId, setNewSlotEditId] = useState<number | null>(null)
  const [newReferenceEditKey, setNewReferenceEditKey] = useState<string | number | null>(null)
  const restoredSessionRef = useRef(false)
  const sessionSnapshot = useWorkbenchSessionStore((state) => projectId ? state.snapshotFor(projectId, 'pre_production') : null)
  const upsertWorkbenchSessionSnapshot = useWorkbenchSessionStore((state) => state.upsertSnapshot)
  const hasExplicitSelectionSearch = useMemo(
    () => hasExplicitWorkbenchSearchParam(searchParams, PRE_PRODUCTION_SESSION_SELECTION_KEYS),
    [searchParams],
  )
  const selection = useMemo(() => resolvePreProductionPageSelection({
    searchParams,
    rows,
    clusters,
    referenceById,
  }), [clusters, referenceById, rows, searchParams])

  function persistSessionSnapshot(nextParams: URLSearchParams) {
    if (!projectId) return
    const selectedId = readNumberParam(nextParams, 'asset_slot_id') ?? readNumberParam(nextParams, 'selected')
    const selectedReferenceParam = readNumberParam(nextParams, 'reference_id')
    const selectedRow = selectedId ? rows.find((row) => row.slot.ID === selectedId) ?? null : null
    const selectedReferenceId = selectedReferenceParam ?? selectedRow?.slot.creative_reference_id ?? null
    const kind = normalizePreProductionKindFilter(readStringParam(nextParams, 'kind'))
    upsertWorkbenchSessionSnapshot({
      projectId,
      workbenchId: 'pre_production',
      route,
      search: nextParams.toString(),
      filters: {
        kind,
        selectedId: selectedId ?? null,
        selectedReferenceId: selectedReferenceId ?? null,
      },
      selection: {
        ...(selectedReferenceId ? { primary: { entityType: 'creative_reference', entityId: selectedReferenceId } } : {}),
        ...(selectedId ? { secondary: { entityType: 'asset_slot', entityId: selectedId } } : {}),
      },
    })
  }

  useEffect(() => {
    if (!projectId || hasExplicitSelectionSearch || restoredSessionRef.current || !sessionSnapshot) return
    if (rows.length === 0 && referenceById.size === 0) return
    restoredSessionRef.current = true
    const snapshotKind = normalizePreProductionKindFilter(typeof sessionSnapshot.filters?.kind === 'string' ? sessionSnapshot.filters.kind : null)
    const snapshotSlotId = sessionSnapshot.selection?.secondary?.entityType === 'asset_slot'
      ? sessionSnapshot.selection.secondary.entityId
      : Number(sessionSnapshot.filters?.selectedId) || 0
    const snapshotReferenceId = sessionSnapshot.selection?.primary?.entityType === 'creative_reference'
      ? sessionSnapshot.selection.primary.entityId
      : Number(sessionSnapshot.filters?.selectedReferenceId) || 0
    setSearchParams((current) => {
      return buildPreProductionSessionRestoreParams({
        searchParams: current,
        rows,
        referenceById,
        kind: snapshotKind,
        slotId: snapshotSlotId,
        referenceId: snapshotReferenceId,
      })
    }, { replace: true })
  }, [hasExplicitSelectionSearch, projectId, referenceById, rows, sessionSnapshot, setSearchParams])

  function setFilter(updates: Partial<Record<ContentFilterKey, string | number | null | undefined>>) {
    const next = buildPreProductionFilterParams(searchParams, updates)
    setSearchParams(next, { replace: true })
    persistSessionSnapshot(next)
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
    const next = buildPreProductionSlotSelectionParams(searchParams, rows, slotId)
    setSearchParams(next, { replace: true })
    persistSessionSnapshot(next)
  }

  function selectReference(referenceId: number) {
    setNewReferenceEditKey(null)
    const next = buildPreProductionReferenceSelectionParams(searchParams, referenceId)
    setSearchParams(next, { replace: true })
    persistSessionSnapshot(next)
  }

  function openSlot(slotId: number) {
    setNewReferenceEditKey(null)
    const next = buildPreProductionSlotSelectionParams(searchParams, rows, slotId, { forceOpen: true })
    setSearchParams(next, { replace: true })
    persistSessionSnapshot(next)
  }

  function openReference(referenceId: number) {
    setNewReferenceEditKey(null)
    const next = buildPreProductionReferenceSelectionParams(searchParams, referenceId, { forceOpen: true })
    setSearchParams(next, { replace: true })
    persistSessionSnapshot(next)
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
