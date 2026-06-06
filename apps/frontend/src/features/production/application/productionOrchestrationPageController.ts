import { useEffect, useMemo, useRef, useState } from 'react'
import type { QueryClient } from '@tanstack/react-query'

import {
  createSemanticEntity,
  semanticEntityConfig,
  type SemanticEntityConfig,
  type SemanticEntityKind,
  type SemanticEntityPayload,
  type SemanticEntityRecord,
} from '@/shared/infrastructure/api/semanticEntities'
import {
  createProductionOrchestrationDefaultsForType,
  type ProductionOrchestrationEntityFilter,
} from '@/features/production/domain/productionOrchestrationEntityModel'
import type { SceneMomentRecord, SegmentRecord } from '@/features/production/domain/productionOrchestrationData'
import {
  hasExplicitWorkbenchSearchParam,
  useWorkbenchSessionStore,
} from '@/features/project-workbenches/application/workbenchSessionStore'

type SearchParamsSetter = (
  nextInit: URLSearchParams | ((current: URLSearchParams) => URLSearchParams),
  navigateOptions?: { replace?: boolean },
) => void

type EntityFilter = ProductionOrchestrationEntityFilter

const PRODUCTION_ORCHESTRATION_SESSION_SEARCH_KEYS = ['productionId', 'scene_moment_id']

const productionOrchestrationEntityLabels: Record<EntityFilter, string> = {
  all: '全局结构',
  segments: '编排段结构',
  sceneMoments: '情节结构',
  writingExpressions: '表达条目',
  settings: '设定资料梳理',
  assetSlots: '素材需求缺口',
  contentUnits: '内容单元',
}

interface ProductionOrchestrationDialogState {
  config: SemanticEntityConfig
  title: string
  onOpenChange: (open: boolean) => void
}

interface ProductionOrchestrationCreateDialogState extends ProductionOrchestrationDialogState {
  defaults: Partial<SemanticEntityPayload>
  onSaved: (record: SemanticEntityRecord) => void
}

export function buildProductionOrchestrationSessionRestoreParams({
  searchParams,
  productionId,
  sceneMoments,
  sceneMomentId,
}: {
  searchParams: URLSearchParams
  productionId: number
  sceneMoments: SceneMomentRecord[]
  sceneMomentId: number
}) {
  const restoredMoment = sceneMomentId
    ? sceneMoments.find((moment) => moment.ID === sceneMomentId) ?? null
    : null
  const next = new URLSearchParams(searchParams)
  if (productionId > 0) next.set('productionId', String(productionId))
  if (restoredMoment) next.set('scene_moment_id', String(restoredMoment.ID))
  else next.delete('scene_moment_id')
  return {
    searchParams: next,
    restoredSceneMomentId: restoredMoment?.ID ?? null,
  }
}

export function buildProductionOrchestrationStaleContentUnitParams({
  searchParams,
  sceneMomentId,
}: {
  searchParams: URLSearchParams
  sceneMomentId?: number | null
}) {
  const next = new URLSearchParams(searchParams)
  next.delete('content_unit_id')
  if (sceneMomentId && next.get('scene_moment_id') === String(sceneMomentId)) {
    next.delete('scene_moment_id')
  }
  return next
}

export function useProductionOrchestrationPageController({
  projectId,
  route,
  searchParams,
  setSearchParams,
  sceneMoments,
  segments,
  effectiveProductionId,
  queryClient,
  queryKey,
  refetch,
}: {
  projectId?: number
  route?: string
  searchParams: URLSearchParams
  setSearchParams: SearchParamsSetter
  sceneMoments: SceneMomentRecord[]
  segments: SegmentRecord[]
  effectiveProductionId: number
  queryClient: QueryClient
  queryKey: readonly unknown[]
  refetch: () => Promise<unknown> | unknown
}) {
  const [createType, setCreateType] = useState<EntityFilter | null>(null)
  const [selectedWritingMomentId, setSelectedWritingMomentId] = useState<number | null>(null)
  const [createSegmentId, setCreateSegmentId] = useState<number | null>(null)
  const restoredSessionRef = useRef(false)
  const hasInitialExplicitSessionSearch = useRef(hasExplicitWorkbenchSearchParam(searchParams, PRODUCTION_ORCHESTRATION_SESSION_SEARCH_KEYS)).current
  const sessionSnapshot = useWorkbenchSessionStore((state) => projectId ? state.snapshotFor(projectId, 'orchestration_production') : null)
  const upsertWorkbenchSessionSnapshot = useWorkbenchSessionStore((state) => state.upsertSnapshot)
  const snapshotProductionId = sessionSnapshot?.selection?.primary?.entityType === 'production'
    ? sessionSnapshot.selection.primary.entityId
    : Number(sessionSnapshot?.filters?.productionId) || 0
  const snapshotSceneMomentId = sessionSnapshot?.selection?.secondary?.entityType === 'scene_moment'
    ? sessionSnapshot.selection.secondary.entityId
    : Number(sessionSnapshot?.filters?.selectedSceneMomentId) || 0
  const requestedProductionId = useMemo(() => Number(searchParams.get('productionId')) || 0, [searchParams])

  function persistSessionSnapshot(input: { productionId?: number | null; sceneMomentId?: number | null }) {
    if (!projectId) return
    const nextProductionId = input.productionId === undefined ? effectiveProductionId : input.productionId
    const nextSceneMomentId = input.sceneMomentId === undefined ? selectedWritingMomentId : input.sceneMomentId
    upsertWorkbenchSessionSnapshot({
      projectId,
      workbenchId: 'orchestration_production',
      route,
      search: searchParams.toString(),
      filters: {
        productionId: nextProductionId ?? null,
        selectedSceneMomentId: nextSceneMomentId ?? null,
      },
      selection: {
        ...(nextProductionId ? { primary: { entityType: 'production', entityId: nextProductionId } } : {}),
        ...(nextSceneMomentId ? { secondary: { entityType: 'scene_moment', entityId: nextSceneMomentId } } : {}),
      },
    })
  }

  useEffect(() => {
    if (!projectId || hasInitialExplicitSessionSearch || restoredSessionRef.current || !sessionSnapshot) return
    if (snapshotProductionId > 0 && requestedProductionId !== snapshotProductionId) {
      setSearchParams((current) => {
        const next = new URLSearchParams(current)
        next.set('productionId', String(snapshotProductionId))
        return next
      }, { replace: true })
      return
    }
    if (snapshotSceneMomentId > 0 && sceneMoments.length === 0) return
    restoredSessionRef.current = true
    const restored = buildProductionOrchestrationSessionRestoreParams({
      searchParams,
      productionId: snapshotProductionId,
      sceneMoments,
      sceneMomentId: snapshotSceneMomentId,
    })
    setSelectedWritingMomentId(restored.restoredSceneMomentId)
    setSearchParams((current) => {
      return buildProductionOrchestrationSessionRestoreParams({
        searchParams: current,
        productionId: snapshotProductionId,
        sceneMoments,
        sceneMomentId: snapshotSceneMomentId,
      }).searchParams
    }, { replace: true })
  }, [hasInitialExplicitSessionSearch, projectId, requestedProductionId, sceneMoments, searchParams, sessionSnapshot, setSearchParams, snapshotProductionId, snapshotSceneMomentId])

  useEffect(() => {
    const requestedMomentId = Number(searchParams.get('scene_moment_id')) || 0
    const requestedMoment = requestedMomentId ? sceneMoments.find((moment) => moment.ID === requestedMomentId) : null
    if (requestedMoment) {
      if (selectedWritingMomentId !== requestedMoment.ID) setSelectedWritingMomentId(requestedMoment.ID)
      return
    }
    if (selectedWritingMomentId && sceneMoments.some((moment) => moment.ID === selectedWritingMomentId)) return
    if (selectedWritingMomentId !== null) setSelectedWritingMomentId(null)
  }, [sceneMoments, searchParams, selectedWritingMomentId])

  function handleSelectProduction(id: string) {
    const next = new URLSearchParams(searchParams)
    if (id) next.set('productionId', id)
    else next.delete('productionId')
    persistSessionSnapshot({ productionId: id ? Number(id) || null : null, sceneMomentId: null })
    setSearchParams(next, { replace: true })
  }

  function selectSceneMoment(momentId: number) {
    const nextMomentId = selectedWritingMomentId === momentId ? null : momentId
    setSelectedWritingMomentId(nextMomentId)
    persistSessionSnapshot({ sceneMomentId: nextMomentId })
    const currentMomentId = searchParams.get('scene_moment_id')
    if (nextMomentId && currentMomentId === String(nextMomentId)) return
    if (!nextMomentId && !currentMomentId) return
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (nextMomentId) next.set('scene_moment_id', String(nextMomentId))
      else next.delete('scene_moment_id')
      return next
    }, { replace: true })
  }

  function focusSceneMoment(momentId: number) {
    if (selectedWritingMomentId !== momentId) {
      setSelectedWritingMomentId(momentId)
      persistSessionSnapshot({ sceneMomentId: momentId })
    }
    if (searchParams.get('scene_moment_id') === String(momentId)) return
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.set('scene_moment_id', String(momentId))
      return next
    }, { replace: true })
  }

  function createSegment() {
    setCreateSegmentId(null)
    setCreateType('segments')
  }

  function createSceneMoment(segmentId: number) {
    setCreateSegmentId(segmentId)
    setCreateType('sceneMoments')
  }

  async function linkReferenceToOwner(
    ownerType: string,
    ownerId: number | null | undefined,
    referenceId: number | null | undefined,
    evidence?: string,
    role = 'supporting',
  ) {
    if (!projectId || !ownerId || !referenceId) return
    await createSemanticEntity(projectId, semanticEntityConfig('settingUsages'), {
      owner_type: ownerType,
      owner_id: ownerId,
      setting_id: referenceId,
      role,
      source: 'ai',
      status: 'workspace',
      evidence: evidence ?? '',
    })
  }

  function closeCreateDialog() {
    setCreateType(null)
    setCreateSegmentId(null)
  }

  function handleCreatedRecord(record: SemanticEntityRecord) {
    const ownerSegmentId = createSegmentId
    if (createType === 'settings') {
      linkReferenceToOwner('segment', ownerSegmentId, record.ID, String(record.description ?? ''), 'supporting').finally(() => {
        queryClient.invalidateQueries({ queryKey })
        refetch()
      })
    }
    closeCreateDialog()
  }

  const createDefaults = createType && createType !== 'all'
    ? productionOrchestrationCreateDefaults({
      createType,
      effectiveProductionId,
      createSegmentId,
      segments,
      sceneMoments,
    })
    : null

  const createDialog = createType && createType !== 'all' && createDefaults
    ? {
        config: semanticEntityConfig(createType as SemanticEntityKind),
        defaults: createDefaults,
        title: `新增${productionOrchestrationEntityLabels[createType] ?? ''}`,
        onOpenChange: (open: boolean) => {
          if (!open) closeCreateDialog()
        },
        onSaved: handleCreatedRecord,
      } satisfies ProductionOrchestrationCreateDialogState
    : null

  return {
    selectedWritingMomentId,
    createDialog,
    handleSelectProduction,
    selectSceneMoment,
    focusSceneMoment,
    createSegment,
    createSceneMoment,
  }
}

function productionOrchestrationCreateDefaults({
  createType,
  effectiveProductionId,
  createSegmentId,
  segments,
  sceneMoments,
}: {
  createType: EntityFilter
  effectiveProductionId: number
  createSegmentId: number | null
  segments: SegmentRecord[]
  sceneMoments: SceneMomentRecord[]
}): Partial<SemanticEntityPayload> {
  const defaults = createProductionOrchestrationDefaultsForType(createType, effectiveProductionId, createSegmentId ?? undefined, undefined)
  if (createType === 'segments') {
    return { ...defaults, order: segments.length + 1 }
  }
  if (createType === 'sceneMoments' && createSegmentId) {
    return {
      ...defaults,
      order: sceneMoments.filter((moment) => Number(moment.segment_id) === createSegmentId).length + 1,
    }
  }
  return defaults
}
