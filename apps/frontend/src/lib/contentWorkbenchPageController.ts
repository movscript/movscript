import { useEffect, useMemo, useState } from 'react'

import { pickContentWorkbenchRowIdForDeepLink } from '@/lib/contentWorkbenchRoute'
import { numberOf, titleOfRecord } from '@/lib/contentWorkbenchRecordUtils'
import {
  type ContentGenerationMomentRow,
  type ContentWorkbenchRecord,
} from '@/lib/contentWorkbenchModel'
import { sceneIdentifier } from '@/lib/productionIdentifiers'

export type ContentWorkbenchScopeLevel = 'production' | 'segment' | 'scene_moment'

export interface ContentWorkbenchFilterOption {
  value: string
  label: string
  count: number
}

export interface ContentWorkbenchSceneFilterOption extends ContentWorkbenchFilterOption {
  identifier: string
}

export type ContentWorkbenchSearchParamsSetter = (
  nextInit: URLSearchParams | ((current: URLSearchParams) => URLSearchParams),
  navigateOptions?: { replace?: boolean },
) => void

export function buildContentWorkbenchProductionRows(rows: ContentGenerationMomentRow[], productionFilter: string) {
  if (!productionFilter) return rows
  if (productionFilter === 'unassigned') return rows.filter((row) => row.productionIds.length === 0)
  const productionId = Number(productionFilter)
  if (!Number.isFinite(productionId) || productionId <= 0) return rows
  return rows.filter((row) => row.productionIds.includes(productionId))
}

export function buildContentWorkbenchFilteredRows(rows: ContentGenerationMomentRow[], segmentFilter: string) {
  if (!segmentFilter) return rows
  if (segmentFilter === 'unassigned') return rows.filter((row) => !row.segment?.ID)
  const segmentId = Number(segmentFilter)
  if (!Number.isFinite(segmentId) || segmentId <= 0) return rows
  return rows.filter((row) => row.segment?.ID === segmentId)
}

export function buildContentWorkbenchVisibleRows({
  rows,
  query,
  matchesSearch,
}: {
  rows: ContentGenerationMomentRow[]
  query: string
  matchesSearch: (row: ContentGenerationMomentRow, query: string) => boolean
}) {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) return rows
  return rows.filter((row) => matchesSearch(row, normalizedQuery))
}

export function buildContentWorkbenchProductionFilterOptions({
  rows,
  productions,
}: {
  rows: ContentGenerationMomentRow[]
  productions: ContentWorkbenchRecord[]
}): ContentWorkbenchFilterOption[] {
  const unassignedCount = rows.filter((row) => row.productionIds.length === 0).length
  return [
    ...(unassignedCount > 0 ? [{ value: 'unassigned', label: '未绑定制作', count: unassignedCount }] : []),
    ...productions.map((production) => ({
      value: String(production.ID),
      label: titleOfRecord(production),
      count: rows.filter((row) => row.productionIds.includes(production.ID)).length,
    })),
  ]
}

export function buildContentWorkbenchSegmentFilterOptions(rows: ContentGenerationMomentRow[]): ContentWorkbenchFilterOption[] {
  const segmentMap = new Map<string, ContentWorkbenchFilterOption>()
  let unassignedCount = 0
  for (const row of rows) {
    if (!row.segment?.ID) {
      unassignedCount += 1
      continue
    }
    const key = String(row.segment.ID)
    const existing = segmentMap.get(key)
    if (existing) existing.count += 1
    else segmentMap.set(key, { value: key, label: titleOfRecord(row.segment), count: 1 })
  }
  return [
    ...(unassignedCount > 0 ? [{ value: 'unassigned', label: '未绑定情绪段', count: unassignedCount }] : []),
    ...Array.from(segmentMap.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh-Hans-CN')),
  ]
}

export function buildContentWorkbenchSceneMomentFilterOptions(rows: ContentGenerationMomentRow[]): ContentWorkbenchSceneFilterOption[] {
  return rows.map((row) => ({
    value: row.id,
    label: row.title,
    identifier: sceneIdentifier(row.moment) || `#${row.moment.ID}`,
    count: row.units.length,
  }))
}

export function readContentWorkbenchLinkedIds(searchParams: URLSearchParams) {
  return {
    linkedProductionId: numberOf(searchParams.get('productionId')),
    linkedSceneMomentId: numberOf(searchParams.get('scene_moment_id')),
    linkedContentUnitId: numberOf(searchParams.get('content_unit_id')),
  }
}

export function contentWorkbenchSelectedRow({
  visibleRows,
  selectedId,
  scopeLevel,
}: {
  visibleRows: ContentGenerationMomentRow[]
  selectedId: string
  scopeLevel: ContentWorkbenchScopeLevel
}) {
  return visibleRows.find((item) => item.id === selectedId) ?? (scopeLevel === 'scene_moment' ? visibleRows[0] ?? null : null)
}

export function contentWorkbenchSelectedUnit({
  selected,
  selectedUnitId,
  optimisticSelectedUnit,
}: {
  selected: ContentGenerationMomentRow | null
  selectedUnitId: number | null
  optimisticSelectedUnit: ContentWorkbenchRecord | null
}) {
  const selectedUnitFromRows = selected?.units.find((unit) => unit.ID === selectedUnitId) ?? null
  const optimisticUnitForSelection = optimisticSelectedUnit && selectedUnitId === optimisticSelectedUnit.ID && selected?.moment.ID === Number(optimisticSelectedUnit.scene_moment_id)
    ? optimisticSelectedUnit
    : null
  return selectedUnitFromRows ?? optimisticUnitForSelection ?? null
}

export function useContentWorkbenchPageController({
  rows,
  productions,
  searchParams,
  setSearchParams,
  matchesSearch,
}: {
  rows: ContentGenerationMomentRow[]
  productions: ContentWorkbenchRecord[]
  searchParams: URLSearchParams
  setSearchParams: ContentWorkbenchSearchParamsSetter
  matchesSearch: (row: ContentGenerationMomentRow, query: string) => boolean
}) {
  const [productionFilter, setProductionFilter] = useState('')
  const [segmentFilter, setSegmentFilter] = useState('')
  const [sidebarQuery, setSidebarQuery] = useState('')
  const [scopeLevel, setScopeLevel] = useState<ContentWorkbenchScopeLevel>('production')
  const [selectedId, setSelectedId] = useState('')
  const [selectedUnitId, setSelectedUnitId] = useState<number | null>(null)
  const [optimisticSelectedUnit, setOptimisticSelectedUnit] = useState<ContentWorkbenchRecord | null>(null)
  const [editingUnit, setEditingUnit] = useState(false)

  const linkedIds = useMemo(() => readContentWorkbenchLinkedIds(searchParams), [searchParams])
  const productionFilteredRows = useMemo(
    () => buildContentWorkbenchProductionRows(rows, productionFilter),
    [productionFilter, rows],
  )
  const filteredRows = useMemo(
    () => buildContentWorkbenchFilteredRows(productionFilteredRows, segmentFilter),
    [productionFilteredRows, segmentFilter],
  )
  const visibleRows = useMemo(
    () => buildContentWorkbenchVisibleRows({ rows: filteredRows, query: sidebarQuery, matchesSearch }),
    [filteredRows, matchesSearch, sidebarQuery],
  )
  const productionFilterOptions = useMemo(
    () => buildContentWorkbenchProductionFilterOptions({ rows, productions }),
    [productions, rows],
  )
  const segmentFilterOptions = useMemo(
    () => buildContentWorkbenchSegmentFilterOptions(productionFilteredRows),
    [productionFilteredRows],
  )
  const sceneMomentFilterOptions = useMemo(
    () => buildContentWorkbenchSceneMomentFilterOptions(visibleRows),
    [visibleRows],
  )

  useEffect(() => {
    const target = linkedIds.linkedProductionId > 0 ? String(linkedIds.linkedProductionId) : ''
    if (target && productionFilter !== target && productionFilterOptions.some((option) => option.value === target)) {
      setProductionFilter(target)
    }
  }, [linkedIds.linkedProductionId, productionFilter, productionFilterOptions])

  useEffect(() => {
    if (segmentFilter && segmentFilter !== 'unassigned' && !segmentFilterOptions.some((option) => option.value === segmentFilter)) {
      setSegmentFilter('')
    }
  }, [segmentFilter, segmentFilterOptions])

  useEffect(() => {
    if (visibleRows.length === 0) {
      if (selectedId) setSelectedId('')
      return
    }
    const linkedRowId = pickContentWorkbenchRowIdForDeepLink(visibleRows, {
      sceneMomentId: linkedIds.linkedSceneMomentId,
      contentUnitId: linkedIds.linkedContentUnitId,
    })
    if (linkedRowId && selectedId !== linkedRowId) {
      setSelectedId(linkedRowId)
      setScopeLevel('scene_moment')
      return
    }
    if (scopeLevel === 'scene_moment' && (!selectedId || !visibleRows.some((row) => row.id === selectedId))) {
      setSelectedId(visibleRows[0].id)
      return
    }
    if (scopeLevel !== 'scene_moment' && selectedId && !visibleRows.some((row) => row.id === selectedId)) {
      setSelectedId('')
    }
  }, [linkedIds.linkedContentUnitId, linkedIds.linkedSceneMomentId, scopeLevel, selectedId, visibleRows])

  const selected = useMemo(
    () => contentWorkbenchSelectedRow({ visibleRows, selectedId, scopeLevel }),
    [scopeLevel, selectedId, visibleRows],
  )

  useEffect(() => {
    if (!selected) {
      if (selectedUnitId !== null) setSelectedUnitId(null)
      if (editingUnit) setEditingUnit(false)
      return
    }
    const linkedUnit = linkedIds.linkedContentUnitId > 0
      ? selected.units.find((unit) => unit.ID === linkedIds.linkedContentUnitId)
      : undefined
    if (linkedUnit && selectedUnitId !== linkedUnit.ID) {
      setSelectedUnitId(linkedUnit.ID)
      return
    }
    if (selectedUnitId !== null && !selected.units.some((unit) => unit.ID === selectedUnitId)) {
      setSelectedUnitId(null)
      if (editingUnit) setEditingUnit(false)
    }
  }, [editingUnit, linkedIds.linkedContentUnitId, selected, selectedUnitId])

  useEffect(() => {
    if (!selected || linkedIds.linkedSceneMomentId > 0 || linkedIds.linkedContentUnitId <= 0) return
    if (!selected.units.some((unit) => unit.ID === linkedIds.linkedContentUnitId)) return
    setSearchParams((current) => {
      if (current.get('scene_moment_id')) return current
      const next = new URLSearchParams(current)
      next.set('scene_moment_id', String(selected.moment.ID))
      return next
    }, { replace: true })
  }, [linkedIds.linkedContentUnitId, linkedIds.linkedSceneMomentId, selected, setSearchParams])

  useEffect(() => {
    if (!optimisticSelectedUnit) return
    if (!selected || Number(optimisticSelectedUnit.scene_moment_id) !== selected.moment.ID || selected.units.some((unit) => unit.ID === optimisticSelectedUnit.ID)) {
      setOptimisticSelectedUnit(null)
    }
  }, [optimisticSelectedUnit, selected])

  const selectedUnit = useMemo(
    () => contentWorkbenchSelectedUnit({ selected, selectedUnitId, optimisticSelectedUnit }),
    [optimisticSelectedUnit, selected, selectedUnitId],
  )
  const selectedProduction = selected?.productionIds[0]
    ? productions.find((production) => production.ID === selected.productionIds[0]) ?? null
    : null

  function selectSceneMoment(rowId: string, options: { replace?: boolean } = {}) {
    const row = visibleRows.find((item) => item.id === rowId) ?? filteredRows.find((item) => item.id === rowId) ?? rows.find((item) => item.id === rowId)
    if (scopeLevel === 'scene_moment' && selectedId === rowId) {
      setScopeLevel(segmentFilter ? 'segment' : 'production')
      setOptimisticSelectedUnit(null)
      setSelectedUnitId(null)
      setSelectedId('')
      setSearchParams((current) => {
        const next = new URLSearchParams(current)
        next.delete('scene_moment_id')
        next.delete('content_unit_id')
        return next
      }, { replace: options.replace ?? true })
      return
    }
    setScopeLevel('scene_moment')
    setOptimisticSelectedUnit(null)
    setSelectedId(rowId)
    if (!row) return
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.set('scene_moment_id', String(row.moment.ID))
      next.delete('content_unit_id')
      return next
    }, { replace: options.replace ?? true })
  }

  function selectContentUnit(unitId: number | null, options: { replace?: boolean } = {}) {
    if (!unitId || optimisticSelectedUnit?.ID !== unitId) setOptimisticSelectedUnit(null)
    setSelectedUnitId(unitId)
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (selected?.moment.ID) next.set('scene_moment_id', String(selected.moment.ID))
      if (unitId && unitId > 0) next.set('content_unit_id', String(unitId))
      else next.delete('content_unit_id')
      return next
    }, { replace: options.replace ?? true })
  }

  function selectContentUnitFromRow(row: ContentGenerationMomentRow, unitId: number | null, options: { replace?: boolean; preserveScopeLevel?: boolean } = {}) {
    if (!unitId || optimisticSelectedUnit?.ID !== unitId) setOptimisticSelectedUnit(null)
    if (!options.preserveScopeLevel) setScopeLevel('scene_moment')
    setSelectedId(row.id)
    setSelectedUnitId(unitId)
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (options.preserveScopeLevel) {
        next.delete('scene_moment_id')
        next.delete('content_unit_id')
        return next
      }
      next.set('scene_moment_id', String(row.moment.ID))
      if (unitId && unitId > 0) next.set('content_unit_id', String(unitId))
      else next.delete('content_unit_id')
      return next
    }, { replace: options.replace ?? true })
  }

  function selectProductionFilter(value: string) {
    const nextValue = value === productionFilter ? '' : value
    setScopeLevel('production')
    setOptimisticSelectedUnit(null)
    setSelectedUnitId(null)
    setSelectedId('')
    setProductionFilter(nextValue)
    setSegmentFilter('')
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (nextValue !== 'unassigned' && Number(nextValue) > 0) next.set('productionId', nextValue)
      else next.delete('productionId')
      next.delete('scene_moment_id')
      next.delete('content_unit_id')
      return next
    }, { replace: true })
  }

  function selectSegmentFilter(value: string) {
    const nextValue = value === segmentFilter ? '' : value
    setScopeLevel(nextValue ? 'segment' : 'production')
    setOptimisticSelectedUnit(null)
    setSelectedUnitId(null)
    setSelectedId('')
    setSegmentFilter(nextValue)
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.delete('scene_moment_id')
      next.delete('content_unit_id')
      return next
    }, { replace: true })
  }

  function focusRowForUnitCreation(row: ContentGenerationMomentRow) {
    setScopeLevel('scene_moment')
    setOptimisticSelectedUnit(null)
    setSelectedId(row.id)
    setSelectedUnitId(null)
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.set('scene_moment_id', String(row.moment.ID))
      next.delete('content_unit_id')
      return next
    }, { replace: true })
  }

  return {
    productionFilter,
    segmentFilter,
    sidebarQuery,
    scopeLevel,
    selectedId,
    selectedUnitId,
    optimisticSelectedUnit,
    editingUnit,
    linkedProductionId: linkedIds.linkedProductionId,
    linkedSceneMomentId: linkedIds.linkedSceneMomentId,
    linkedContentUnitId: linkedIds.linkedContentUnitId,
    productionFilteredRows,
    filteredRows,
    visibleRows,
    productionFilterOptions,
    segmentFilterOptions,
    sceneMomentFilterOptions,
    selected,
    selectedUnit,
    selectedProduction,
    setSidebarQuery,
    setScopeLevel,
    setSelectedUnitId,
    setOptimisticSelectedUnit,
    setEditingUnit,
    selectSceneMoment,
    selectContentUnit,
    selectContentUnitFromRow,
    selectProductionFilter,
    selectSegmentFilter,
    focusRowForUnitCreation,
  }
}
