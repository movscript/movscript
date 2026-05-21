import { useEffect, useState } from 'react'
import type { QueryClient } from '@tanstack/react-query'

import {
  createSemanticEntity,
  semanticEntityConfig,
  type SemanticEntityConfig,
  type SemanticEntityKind,
  type SemanticEntityPayload,
  type SemanticEntityRecord,
} from '@/api/semanticEntities'
import {
  createProductionOrchestrationDefaultsForType,
  type ProductionOrchestrationEntityFilter,
} from '@/lib/productionOrchestrationEntityModel'
import type { SceneMomentRecord } from '@/lib/productionOrchestrationData'

type SearchParamsSetter = (
  nextInit: URLSearchParams | ((current: URLSearchParams) => URLSearchParams),
  navigateOptions?: { replace?: boolean },
) => void

type EntityFilter = ProductionOrchestrationEntityFilter

const productionOrchestrationEntityLabels: Record<EntityFilter, string> = {
  all: '全局结构',
  segments: '编排段结构',
  sceneMoments: '情节结构',
  writingExpressions: '表达条目',
  creativeReferences: '设定资料梳理',
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

interface ProductionOrchestrationEditDialogState extends ProductionOrchestrationDialogState {
  record: SemanticEntityRecord
  onSaved: () => void
}

export function useProductionOrchestrationPageController({
  projectId,
  searchParams,
  setSearchParams,
  sceneMoments,
  effectiveProductionId,
  queryClient,
  queryKey,
  refetch,
}: {
  projectId?: number
  searchParams: URLSearchParams
  setSearchParams: SearchParamsSetter
  sceneMoments: SceneMomentRecord[]
  effectiveProductionId: number
  queryClient: QueryClient
  queryKey: readonly unknown[]
  refetch: () => Promise<unknown> | unknown
}) {
  const [createType, setCreateType] = useState<EntityFilter | null>(null)
  const [editEntry, setEditEntry] = useState<{ type: EntityFilter; record: SemanticEntityRecord } | null>(null)
  const [selectedWritingMomentId, setSelectedWritingMomentId] = useState<number | null>(null)
  const [createSegmentId, setCreateSegmentId] = useState<number | null>(null)

  useEffect(() => {
    const requestedMomentId = Number(searchParams.get('scene_moment_id')) || 0
    const requestedMoment = requestedMomentId ? sceneMoments.find((moment) => moment.ID === requestedMomentId) : null
    if (requestedMoment) {
      setSelectedWritingMomentId(requestedMoment.ID)
      return
    }
    if (selectedWritingMomentId && sceneMoments.some((moment) => moment.ID === selectedWritingMomentId)) return
    setSelectedWritingMomentId(sceneMoments[0]?.ID ?? null)
  }, [sceneMoments, searchParams, selectedWritingMomentId])

  function handleSelectProduction(id: string) {
    const next = new URLSearchParams(searchParams)
    if (id) next.set('productionId', id)
    else next.delete('productionId')
    setSearchParams(next, { replace: true })
  }

  function selectSceneMoment(momentId: number) {
    setSelectedWritingMomentId(momentId)
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.set('scene_moment_id', String(momentId))
      return next
    }, { replace: true })
  }

  function editSegment(record: SemanticEntityRecord) {
    setEditEntry({ type: 'segments', record })
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
    await createSemanticEntity(projectId, semanticEntityConfig('creativeReferenceUsages'), {
      owner_type: ownerType,
      owner_id: ownerId,
      creative_reference_id: referenceId,
      role,
      source: 'ai',
      status: 'draft',
      evidence: evidence ?? '',
    })
  }

  function closeCreateDialog() {
    setCreateType(null)
    setCreateSegmentId(null)
  }

  function handleCreatedRecord(record: SemanticEntityRecord) {
    const ownerSegmentId = createSegmentId
    if (createType === 'creativeReferences') {
      linkReferenceToOwner('segment', ownerSegmentId, record.ID, String(record.description ?? ''), 'supporting').finally(() => {
        queryClient.invalidateQueries({ queryKey })
        refetch()
      })
    }
    closeCreateDialog()
  }

  function closeEditDialog() {
    setEditEntry(null)
  }

  const createDialog = createType && createType !== 'all'
    ? {
        config: semanticEntityConfig(createType as SemanticEntityKind),
        defaults: createProductionOrchestrationDefaultsForType(createType, effectiveProductionId, createSegmentId ?? undefined, undefined),
        title: `新增${productionOrchestrationEntityLabels[createType] ?? ''}`,
        onOpenChange: (open: boolean) => {
          if (!open) closeCreateDialog()
        },
        onSaved: handleCreatedRecord,
      } satisfies ProductionOrchestrationCreateDialogState
    : null

  const editDialog = editEntry
    ? {
        config: semanticEntityConfig(editEntry.type as SemanticEntityKind),
        record: editEntry.record,
        title: `编辑${productionOrchestrationEntityLabels[editEntry.type] ?? ''}`,
        onOpenChange: (open: boolean) => {
          if (!open) closeEditDialog()
        },
        onSaved: closeEditDialog,
      } satisfies ProductionOrchestrationEditDialogState
    : null

  return {
    selectedWritingMomentId,
    createDialog,
    editDialog,
    handleSelectProduction,
    selectSceneMoment,
    editSegment,
    createSegment,
    createSceneMoment,
  }
}
