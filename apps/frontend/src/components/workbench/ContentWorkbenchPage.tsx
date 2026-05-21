import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ClipboardCheck,
  Route,
  Wand2,
} from 'lucide-react'

import { RESOURCE_UPLOAD_ACCEPT } from '@/lib/mediaTypes'
import {
  launchContentWorkbenchAiSuggestAgent,
  launchContentWorkbenchVisualPlanAgent,
} from '@/lib/contentWorkbenchAgentLaunch'
import { localAgentClient, type AgentDraft } from '@/lib/localAgentClient'
import { pickContentWorkbenchFirstUsableUnit } from '@/lib/contentWorkbenchCandidateFocus'
import { contentWorkbenchProposalDefaults } from '@/lib/contentWorkbenchDraftProposal'
import { buildContentDraftReviewModel, dedupeDrafts, type ContentDraftReviewModel } from '@/lib/contentWorkbenchDraftReviewModel'
import {
  keyframeFrameRoleLabel,
  keyframeOrderForRole,
  nextKeyframeFrameRole,
} from '@/lib/contentWorkbenchEditModel'
import { contentWorkbenchCanvasRoute, openContentWorkbenchUnitCanvas } from '@/lib/contentWorkbenchCanvasLaunch'
import { pickContentWorkbenchRelevantJobs } from '@/lib/contentWorkbenchJobScope'
import { buildContentWorkbenchReviewQueueSummary } from '@/lib/contentWorkbenchReviewQueue'
import { pickContentWorkbenchRowIdForDeepLink } from '@/lib/contentWorkbenchRoute'
import { apiErrorMessage, contentUnitWorkStatus, normalizeAssetSlotStatus } from '@/lib/contentWorkbenchStatus'
import { mergeProjectWorkbenchArtifactReviewSearchParams } from '@/lib/projectWorkbenchDraftReview'
import {
  buildContentGenerationMomentRows,
  buildGenerationContextRows,
  buildGenerationContextStandards,
  buildMomentStandards,
  contentWorkbenchNullableNumber,
  isVisibleContentWorkbenchRecord,
  loadContentWorkbenchData,
  type ContentGenerationMomentRow,
  type ContentWorkbenchRecord as WorkbenchRecord,
} from '@/lib/contentWorkbenchModel'
import {
  buildContentWorkbenchUploadCandidateMutationOptions,
  useContentWorkbenchCandidateUploadInput,
} from '@/lib/contentWorkbenchUploadController'
import {
  buildApplyContentUnitProposalMutationOptions,
  buildMarkContentDraftReviewedMutationOptions,
  buildMoveContentUnitOnTimelineMutationOptions,
  buildRejectContentDraftMutationOptions,
  buildReorderContentUnitsMutationOptions,
} from '@/lib/contentWorkbenchMutationController'
import {
  byOrder,
  firstText,
  numberOf,
  titleOfRecord,
} from '@/lib/contentWorkbenchRecordUtils'
import {
  previewTimelineItemRank,
} from '@/lib/contentWorkbenchTimeline'
import { contentWorkbenchUnitRequiresKeyframe } from '@/lib/contentWorkbenchUnitTrack'
import { pickContentWorkbenchUploadTarget } from '@/lib/contentWorkbenchUploadTarget'
import {
  contentUnitStoryboardBriefPromptText,
  contentUnitVisualPlanPromptText,
} from '@/lib/contentUnitPlanningMetadata'
import { sceneIdentifier, unitIdentifier } from '@/lib/productionIdentifiers'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/store/projectStore'
import { toast } from '@/store/toastStore'
import { Badge, Button, Card } from '@movscript/ui'
import { ContentGenerationReviewPanel } from './ContentGenerationReviewPanel'
import { ContentWorkbenchDialogs } from './ContentWorkbenchDialogs'
import {
  ContentWorkbenchFilterSidebar,
  contentWorkbenchRowMatchesSearch,
  type HierarchyFilterOption,
} from './ContentWorkbenchFilterSidebar'
import { ContentWorkbenchScenePreview } from './ContentWorkbenchScenePreview'
import { ContentWorkbenchUnitInspector, UnitProductionTrack } from './ContentWorkbenchUnitTrack'
import { ScenarioWorkspace } from './ScenarioWorkspace'
import {
  ContextStack,
  GateChecklist,
  MetricStrip,
  ProjectWorkbenchShell,
  QueueMiniMetric,
  SpecializedQueue,
  type WorkbenchGate,
  type WorkbenchMetric,
} from './WorkbenchChrome'
import { WorkbenchPanel } from './WorkbenchPanel'
import {
  buildContentUnitGenerationContext,
  semanticEntityConfig,
  type SemanticEntityPayload,
} from '@/api/semanticEntities'
import { ROUTES, withRouteParams } from '@/routes/projectRoutes'

type ContentWorkbenchScopeLevel = 'production' | 'segment' | 'scene_moment'

function appendReviewGate(rows: WorkbenchGate[], pendingDraftCount: number): WorkbenchGate[] {
  if (rows.length === 0) return rows
  return [
    ...rows,
    {
      label: 'AI 草案已处理',
      detail: pendingDraftCount > 0 ? `${pendingDraftCount} 个制作项草案仍需人工审阅` : '没有待处理的制作项草案',
      done: pendingDraftCount === 0,
      tone: pendingDraftCount === 0 ? 'success' : 'warning',
    },
  ]
}

export function ContentWorkbenchPage() {
  const project = useProjectStore((s) => s.current)
  const projectId = project?.ID
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const candidateUploadInput = useContentWorkbenchCandidateUploadInput()
  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['workbench', 'production', projectId],
    queryFn: () => loadContentWorkbenchData(projectId!),
    enabled: !!projectId,
  })
  const rows = useMemo(() => buildContentGenerationMomentRows(data), [data])
  const [productionFilter, setProductionFilter] = useState('')
  const [segmentFilter, setSegmentFilter] = useState('')
  const [sidebarQuery, setSidebarQuery] = useState('')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [scopeLevel, setScopeLevel] = useState<ContentWorkbenchScopeLevel>('production')
  const [selectedId, setSelectedId] = useState('')
  const [selectedUnitId, setSelectedUnitId] = useState<number | null>(null)
  const [creatingUnit, setCreatingUnit] = useState(false)
  const [unitDraftDefaults, setUnitDraftDefaults] = useState<Partial<SemanticEntityPayload> | null>(null)
  const [optimisticSelectedUnit, setOptimisticSelectedUnit] = useState<WorkbenchRecord | null>(null)
  const [editingUnit, setEditingUnit] = useState(false)
  const [creatingAssetSlot, setCreatingAssetSlot] = useState(false)
  const [reviewPanelCollapsed, setReviewPanelCollapsed] = useState(false)
  const [creatingKeyframe, setCreatingKeyframe] = useState(false)
  const linkedProductionId = numberOf(searchParams.get('productionId'))
  const linkedSceneMomentId = numberOf(searchParams.get('scene_moment_id'))
  const linkedContentUnitId = numberOf(searchParams.get('content_unit_id'))
  const reviewDraftId = searchParams.get('draftId')?.trim() ?? ''
  const reviewMode = searchParams.get('view') === 'review' || reviewDraftId.length > 0
  useEffect(() => {
    if (reviewMode) setReviewPanelCollapsed(false)
  }, [reviewMode])
  const productionFilteredRows = useMemo(() => {
    if (!productionFilter) return rows
    if (productionFilter === 'unassigned') return rows.filter((row) => row.productionIds.length === 0)
    const productionId = Number(productionFilter)
    if (!Number.isFinite(productionId) || productionId <= 0) return rows
    return rows.filter((row) => row.productionIds.includes(productionId))
  }, [productionFilter, rows])
  const filteredRows = useMemo(() => {
    if (!segmentFilter) return productionFilteredRows
    if (segmentFilter === 'unassigned') return productionFilteredRows.filter((row) => !row.segment?.ID)
    const segmentId = Number(segmentFilter)
    if (!Number.isFinite(segmentId) || segmentId <= 0) return productionFilteredRows
    return productionFilteredRows.filter((row) => row.segment?.ID === segmentId)
  }, [productionFilteredRows, segmentFilter])
  const visibleRows = useMemo(() => {
    const query = sidebarQuery.trim()
    if (!query) return filteredRows
    return filteredRows.filter((row) => contentWorkbenchRowMatchesSearch(row, query))
  }, [filteredRows, sidebarQuery])
  const productionFilterOptions = useMemo(() => {
    const productions = data?.productions ?? []
    const unassignedCount = rows.filter((row) => row.productionIds.length === 0).length
    return [
      ...(unassignedCount > 0 ? [{ value: 'unassigned', label: '未绑定制作', count: unassignedCount }] : []),
      ...productions.map((production) => ({
        value: String(production.ID),
        label: titleOfRecord(production),
        count: rows.filter((row) => row.productionIds.includes(production.ID)).length,
      })),
    ]
  }, [data?.productions, rows])
  useEffect(() => {
    const target = linkedProductionId > 0 ? String(linkedProductionId) : ''
    if (target && productionFilter !== target && productionFilterOptions.some((option) => option.value === target)) {
      setProductionFilter(target)
    }
  }, [linkedProductionId, productionFilter, productionFilterOptions])
  const segmentFilterOptions = useMemo(() => {
    const segmentMap = new Map<string, { value: string; label: string; count: number }>()
    let unassignedCount = 0
    for (const row of productionFilteredRows) {
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
  }, [productionFilteredRows])
  const sceneMomentFilterOptions = useMemo(() => visibleRows.map((row) => ({
    value: row.id,
    label: row.title,
    identifier: sceneIdentifier(row.moment) || `#${row.moment.ID}`,
    count: row.units.length,
  })), [visibleRows])

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
    const linkedRowId = pickContentWorkbenchRowIdForDeepLink(visibleRows, { sceneMomentId: linkedSceneMomentId, contentUnitId: linkedContentUnitId })
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
  }, [linkedContentUnitId, linkedSceneMomentId, scopeLevel, selectedId, visibleRows])

  const selected = visibleRows.find((item) => item.id === selectedId) ?? (scopeLevel === 'scene_moment' ? visibleRows[0] ?? null : null)

  useEffect(() => {
    if (!selected) {
      if (selectedUnitId !== null) setSelectedUnitId(null)
      if (editingUnit) setEditingUnit(false)
      return
    }
    const linkedUnit = linkedContentUnitId > 0 ? selected.units.find((unit) => unit.ID === linkedContentUnitId) : undefined
    if (linkedUnit && selectedUnitId !== linkedUnit.ID) {
      setSelectedUnitId(linkedUnit.ID)
      return
    }
    if (selectedUnitId !== null && !selected.units.some((unit) => unit.ID === selectedUnitId)) {
      setSelectedUnitId(null)
      if (editingUnit) setEditingUnit(false)
    }
  }, [editingUnit, linkedContentUnitId, selected, selectedUnitId])

  useEffect(() => {
    if (!selected || linkedSceneMomentId > 0 || linkedContentUnitId <= 0) return
    if (!selected.units.some((unit) => unit.ID === linkedContentUnitId)) return
    setSearchParams((current) => {
      if (current.get('scene_moment_id')) return current
      const next = new URLSearchParams(current)
      next.set('scene_moment_id', String(selected.moment.ID))
      return next
    }, { replace: true })
  }, [linkedContentUnitId, linkedSceneMomentId, selected, setSearchParams])

  const selectedUnitFromRows = selected?.units.find((unit) => unit.ID === selectedUnitId) ?? null
  const optimisticUnitForSelection = optimisticSelectedUnit && selectedUnitId === optimisticSelectedUnit.ID && selected?.moment.ID === Number(optimisticSelectedUnit.scene_moment_id)
    ? optimisticSelectedUnit
    : null
  const selectedUnit = selectedUnitFromRows ?? optimisticUnitForSelection ?? null
  const selectedProduction = selected?.productionIds[0]
    ? data?.productions.find((production) => production.ID === selected.productionIds[0])
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

  useEffect(() => {
    if (!optimisticSelectedUnit) return
    if (!selected || Number(optimisticSelectedUnit.scene_moment_id) !== selected.moment.ID || selected.units.some((unit) => unit.ID === optimisticSelectedUnit.ID)) {
      setOptimisticSelectedUnit(null)
    }
  }, [optimisticSelectedUnit, selected])

  const generationContextQuery = useQuery({
    queryKey: ['workbench', 'production', 'generation-context', projectId, selectedUnit?.ID],
    queryFn: () => buildContentUnitGenerationContext(projectId!, selectedUnit!.ID, 'video'),
    enabled: !!projectId && !!selectedUnit?.ID,
  })
  const uploadCandidate = useMutation(buildContentWorkbenchUploadCandidateMutationOptions({
    projectId,
    queryClient,
    onSettled: candidateUploadInput.resetUpload,
  }))
  const openUnitCanvas = useMutation({
    mutationFn: async (unit: WorkbenchRecord) => {
      if (!projectId) throw new Error('请先选择项目')
      return openContentWorkbenchUnitCanvas({
        projectId,
        unit,
      })
    },
    onSuccess: (canvas) => navigate(contentWorkbenchCanvasRoute(canvas)),
    onError: (error) => {
      toast.error(apiErrorMessage(error, '打开生成画布失败'))
    },
  })
  const baseStandards = generationContextQuery.data
    ? buildGenerationContextStandards(generationContextQuery.data)
    : buildMomentStandards(selected, data?.jobs ?? [])
  const generationContextRows = buildGenerationContextRows(generationContextQuery.data)
  const selectedUnitKeyframes = selected && selectedUnit
    ? selected.keyframes.filter((keyframe) => Number(keyframe.content_unit_id) === selectedUnit.ID).slice().sort(byOrder)
    : []
  const selectedUnitAssetSlots = selected && selectedUnit
    ? selected.assetSlots.filter((slot) => slot.owner_type === 'content_unit' && Number(slot.owner_id) === selectedUnit.ID)
    : []
  const selectedUnitMissingSlots = selectedUnitAssetSlots.filter((slot) => normalizeAssetSlotStatus(slot.status) === 'missing')
  const uploadTargetSlot = pickContentWorkbenchUploadTarget({
    selectedUnitAssetSlots,
    momentAssetSlots: selected?.assetSlots ?? [],
  })
  const selectedUnitResourceIds = [
    ...selectedUnitAssetSlots.map((slot) => numberOf(slot.resource_id)),
    ...selectedUnitKeyframes.map((keyframe) => numberOf(keyframe.resource_id)),
  ].filter((id) => id > 0)
  const selectedUnitJobs = pickContentWorkbenchRelevantJobs({
    jobs: data?.jobs ?? [],
    contentUnitId: selectedUnit?.ID,
    contentUnitTitle: selectedUnit ? titleOfRecord(selectedUnit) : undefined,
    resourceIds: selectedUnitResourceIds,
  })
  const selectedUnitRunningJobCount = selectedUnitJobs.filter((job) => job.status === 'pending' || job.status === 'running').length
  const selectedUnitCompletedJobCount = selectedUnitJobs.filter((job) => job.status === 'succeeded').length
  const selectedUnitRequiresKeyframe = selectedUnit ? contentWorkbenchUnitRequiresKeyframe(selectedUnit.kind) : true
  const selectedUnitStatus = selectedUnit ? contentUnitWorkStatus(selectedUnit, selectedUnitMissingSlots) : 'blocked'
  const keyframeConfig = useMemo(() => semanticEntityConfig('keyframes'), [])
  const assetSlotConfig = useMemo(() => semanticEntityConfig('assetSlots'), [])
  const nextKeyframeRole = nextKeyframeFrameRole(selectedUnitKeyframes)
  const keyframeDefaults = useMemo<Partial<SemanticEntityPayload> | undefined>(() => {
    if (!selected || !selectedUnit) return undefined
    return {
      production_id: contentWorkbenchNullableNumber(selectedUnit.production_id ?? selected.segment?.production_id ?? selected.moment.production_id ?? selected.productionIds[0]),
      scene_moment_id: selected.moment.ID,
      content_unit_id: selectedUnit.ID,
      order: keyframeOrderForRole(nextKeyframeRole, selectedUnitKeyframes),
      status: 'candidate',
      metadata_json: JSON.stringify({
        frame_role: nextKeyframeRole,
        frame_role_label: keyframeFrameRoleLabel(nextKeyframeRole),
      }),
    }
  }, [nextKeyframeRole, selected, selectedUnit, selectedUnitKeyframes])
  const assetSlotDefaults = useMemo<Partial<SemanticEntityPayload> | undefined>(() => {
    if (!selected || !selectedUnit) return undefined
    return {
      production_id: contentWorkbenchNullableNumber(selectedUnit.production_id ?? selected.moment.production_id ?? selected.segment?.production_id ?? selected.productionIds[0]),
      owner_type: 'content_unit',
      owner_id: selectedUnit.ID,
      kind: 'image',
      name: `${titleOfRecord(selectedUnit)}参考素材`,
      slot_key: `content_unit_${selectedUnit.ID}_asset_${selectedUnitAssetSlots.length + 1}`,
      description: firstText(selectedUnit.description, selectedUnit.prompt, ''),
      prompt_hint: firstText(selectedUnit.prompt, selectedUnit.description, ''),
      priority: selectedUnitAssetSlots.length === 0 ? 'high' : 'normal',
      status: 'missing',
    }
  }, [selected, selectedUnit, selectedUnitAssetSlots.length])
  const missingGenerationContext = generationContextQuery.data
    ? buildGenerationContextStandards(generationContextQuery.data).filter((item) => !item.done)
    : []

  function triggerCandidateUpload() {
    candidateUploadInput.triggerUpload(uploadTargetSlot, candidateUploadInput.uploading || uploadCandidate.isPending)
  }

  function handleCandidateUpload(file?: File) {
    candidateUploadInput.uploadFile(file, uploadTargetSlot, {
      disabled: uploadCandidate.isPending,
      onUpload: (input) => uploadCandidate.mutate(input),
    })
  }

  function openCreateKeyframe() {
    if (!selectedUnit) return
    setCreatingKeyframe(true)
  }

  function openCreateAssetSlot() {
    if (!selectedUnit) return
    setCreatingAssetSlot(true)
  }

  const contentUnitConfig = useMemo(() => semanticEntityConfig('contentUnits'), [])
  const previewTimelineItemConfig = useMemo(() => semanticEntityConfig('previewTimelineItems'), [])
  const productionWorkbenchQueryKey = ['workbench', 'production', projectId] as const
  const reviewDraftsQuery = useQuery<AgentDraft[]>({
    queryKey: ['workbench', 'production', 'content-drafts', projectId],
    queryFn: async () => {
      if (!projectId) return []
      const contentUnitProposals = await localAgentClient.listDrafts({ projectId, kind: 'content_unit_proposal', status: ['draft', 'accepted'], limit: 20 })
      return dedupeDrafts(contentUnitProposals.drafts)
    },
    enabled: !!projectId,
    retry: false,
  })
  const reviewDrafts = reviewDraftsQuery.data ?? []
  const reviewDraftsById = useMemo(() => new Map(reviewDrafts.map((draft) => [draft.id, draft] as const)), [reviewDrafts])
  const selectedReviewDraft = reviewDraftId ? reviewDraftsById.get(reviewDraftId) ?? null : reviewDrafts[0] ?? null
  const contentDraftReview = useMemo(() => {
    if (!selectedReviewDraft) return null
    return buildContentDraftReviewModel(selectedReviewDraft, {
      rowByMomentId: new Map(rows.map((row) => [row.moment.ID, row] as const)),
      rowByUnitId: new Map(rows.flatMap((row) => row.units.map((unit) => [unit.ID, row] as const))),
    })
  }, [rows, selectedReviewDraft])
  const reviewQueueSummary = useMemo(() => buildContentWorkbenchReviewQueueSummary({
    drafts: reviewDrafts,
    selectedReview: contentDraftReview ? {
      warningCount: contentDraftReview.warnings.length,
      diffCount: contentDraftReview.diffs.length,
      addedCount: contentDraftReview.diffs.filter((diff) => diff.state === 'added').length,
      changedCount: contentDraftReview.diffs.filter((diff) => diff.state === 'changed').length,
    } : null,
  }), [contentDraftReview, reviewDrafts])
  const standards = useMemo(() => appendReviewGate(baseStandards, reviewQueueSummary.pending), [baseStandards, reviewQueueSummary.pending])

  function selectReviewDraft(draftId: string) {
    setReviewPanelCollapsed(false)
    setSearchParams((current) => mergeProjectWorkbenchArtifactReviewSearchParams(current, {
      workbenchId: 'content_orchestration',
      primary: {
        proposalKind: 'content_unit_proposal',
        fallbackDraftId: draftId,
      },
    }), { replace: true })
  }

  function closeReview() {
    setReviewPanelCollapsed(true)
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.delete('view')
      next.delete('draftId')
      return next
    }, { replace: true })
  }

  const rejectContentDraft = useMutation(buildRejectContentDraftMutationOptions({
    refetchDrafts: reviewDraftsQuery.refetch,
    closeReview,
  }))
  const markContentDraftReviewed = useMutation(buildMarkContentDraftReviewedMutationOptions({
    projectId,
    selectedMomentId: selected?.moment.ID,
    refetchDrafts: reviewDraftsQuery.refetch,
    closeReview,
  }))
  const applyContentUnitProposal = useMutation(buildApplyContentUnitProposalMutationOptions({
    projectId,
    contentUnitConfig,
    contentUnits: data?.contentUnits ?? [],
    queryClient,
    productionWorkbenchQueryKey,
    selectContentUnit,
    setOptimisticSelectedUnit,
  }))

  const totalUnitCount = visibleRows.reduce((sum, row) => sum + row.units.length, 0)
  const totalKeyframeCount = visibleRows.reduce((sum, row) => sum + row.keyframes.length, 0)
  const totalMissingSlotCount = visibleRows.reduce((sum, row) => sum + row.missingSlots.length, 0)
  const projectReferenceCount = (data?.creativeReferences ?? []).filter(isVisibleContentWorkbenchRecord).length
  const projectAssetSlotCount = (data?.assetSlots ?? []).filter((slot) => slot.owner_type !== 'asset_slot' && isVisibleContentWorkbenchRecord(slot)).length
  const runningJobCount = data?.jobs.filter((job) => job.status === 'pending' || job.status === 'running').length ?? 0
  const completedJobCount = data?.jobs.filter((job) => job.status === 'succeeded').length ?? 0
  const selectedProductionIdSet = new Set(selected?.productionIds ?? [])
  const selectedPreviewItemCount = data?.previewTimelineItems.filter((item) => (
    selectedProductionIdSet.has(numberOf(item.production_id)) ||
    (selected?.moment.ID && numberOf(item.scene_moment_id) === selected.moment.ID) ||
    (selectedUnit?.ID && numberOf(item.content_unit_id) === selectedUnit.ID)
  )).length ?? 0
  const reorderContentUnits = useMutation(buildReorderContentUnitsMutationOptions({
    projectId,
    contentUnitConfig,
    queryClient,
    productionWorkbenchQueryKey,
    selectContentUnitFromRow,
  }))
  const moveContentUnitOnTimeline = useMutation(buildMoveContentUnitOnTimelineMutationOptions({
    projectId,
    previewTimelineItemConfig,
    previewTimelines: data?.previewTimelines ?? [],
    queryClient,
    productionWorkbenchQueryKey,
    selectContentUnit,
  }))

  function openAiSuggest(rowOverride?: ContentGenerationMomentRow) {
    const targetRow = rowOverride ?? selected
    const targetProduction = targetRow?.productionIds[0]
      ? data?.productions.find((production) => production.ID === targetRow.productionIds[0])
      : null
    if (!projectId || !targetRow) {
      toast.info('请先选择情节')
      return
    }
    launchContentWorkbenchAiSuggestAgent({
      requestId: `content_unit_suggest_${targetRow.moment.ID}_${Date.now().toString(36)}`,
      projectId,
      productionId: targetProduction?.ID,
      sceneMomentId: targetRow.moment.ID,
      momentTitle: targetRow.title,
      momentScope: targetRow.scope,
      existingUnits: targetRow.units.map((unit) => ({
        title: titleOfRecord(unit),
        kind: unit.kind,
        status: unit.status,
        prompt: unit.prompt,
        description: unit.description,
      })),
    })
    toast.success('已打开 AI 助手，可在输入框补充需求后发送')
  }

  function openAiVisualPlan(unitOverride?: WorkbenchRecord | null) {
    const targetRow = selected
    const targetUnit = unitOverride ?? selectedUnit
    const targetProduction = targetRow?.productionIds[0]
      ? data?.productions.find((production) => production.ID === targetRow.productionIds[0])
      : null
    if (!projectId || !targetRow || !targetUnit) {
      toast.info('请先选择情节和制作项')
      return
    }
    const selectedUnitTitle = titleOfRecord(targetUnit)
    launchContentWorkbenchVisualPlanAgent({
      requestId: `content_unit_visual_plan_${targetUnit.ID}_${Date.now().toString(36)}`,
      projectId,
      productionId: targetProduction?.ID,
      sceneMomentId: targetRow.moment.ID,
      momentTitle: targetRow.title,
      momentScope: targetRow.scope,
      selectedUnitId: targetUnit.ID,
      selectedUnitTitle,
      existingUnits: targetRow.units.map((unit) => ({
        id: unit.ID,
        unit_code: firstText(unit.unit_code),
        title: titleOfRecord(unit),
        kind: unit.kind,
        status: unit.status,
        prompt: unit.prompt,
        description: unit.description,
        visualPlan: contentUnitVisualPlanPromptText(unit),
        storyboardBrief: contentUnitStoryboardBriefPromptText(unit),
      })),
    })
    toast.success('已打开 AI 助手，可起草当前制作项的视觉计划')
  }

  function openReviewQueue() {
    setReviewPanelCollapsed(false)
    const draft = selectedReviewDraft ?? reviewDrafts[0]
    if (!draft) {
      openAiSuggest()
      return
    }
    selectReviewDraft(draft.id)
  }

  function openEditSelectedUnit(unitId?: number) {
    const targetUnit = unitId && selected?.units.some((unit) => unit.ID === unitId)
      ? selected.units.find((unit) => unit.ID === unitId) ?? null
      : selectedUnit
    if (!targetUnit) {
      setCreatingUnit(true)
      return
    }
    selectContentUnit(targetUnit.ID)
    setEditingUnit(true)
  }

  function openCreateUnitFromProposal(proposal: Record<string, unknown>) {
    setUnitDraftDefaults(contentWorkbenchProposalDefaults(proposal))
    setCreatingUnit(true)
  }

  function openCreateUnit() {
    if (!selected) return
    setUnitDraftDefaults(null)
    setCreatingUnit(true)
  }

  function openCreateUnitForRow(row: ContentGenerationMomentRow) {
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
    setUnitDraftDefaults(null)
    setCreatingUnit(true)
  }

  function openSelectedUnitCanvas() {
    if (openUnitCanvas.isPending) return
    if (!selectedUnit) {
      setCreatingUnit(true)
      return
    }
    openUnitCanvas.mutate(selectedUnit)
  }

  function selectFirstSceneMoment() {
    const firstRow = visibleRows[0]
    if (!firstRow) {
      toast.info('暂无可选择的情节')
      return
    }
    selectSceneMoment(firstRow.id)
  }

  function selectFirstContentUnit() {
    if (!selected) {
      selectFirstSceneMoment()
      return
    }
    const targetUnitId = pickContentWorkbenchFirstUsableUnit(selected.units.map((unit) => ({ id: unit.ID, status: unit.status })))
    if (!targetUnitId) {
      setCreatingUnit(true)
      return
    }
    selectContentUnit(targetUnitId)
  }

  const showReviewPanel = reviewMode || reviewDraftsQuery.isLoading || (reviewDrafts.length > 0 && !reviewPanelCollapsed)
  const activeProductionFilter = productionFilterOptions.find((option) => option.value === productionFilter)
  const activeSegmentFilter = segmentFilterOptions.find((option) => option.value === segmentFilter)
  const contentWorkbenchViewTitle = scopeLevel === 'production'
    ? activeProductionFilter?.label ?? '全部内容'
    : scopeLevel === 'segment'
      ? activeSegmentFilter?.label ?? '情绪段筛选'
      : selected ? selected.title : '暂无情节'
  const contentWorkbenchViewDetail = scopeLevel === 'scene_moment' && selected
    ? selected.scope
    : `${visibleRows.length} 个情节 · ${totalUnitCount} 个制作项 · ${projectReferenceCount} 个设定 · ${projectAssetSlotCount} 个素材 · ${totalKeyframeCount} 个关键帧 · ${totalMissingSlotCount} 个缺口`

  return (
    <ProjectWorkbenchShell
      workbenchId="content_orchestration"
      projectName={project?.name}
      kicker="内容编排"
      title="内容编排工作台"
      description="把情节拆成制作项，用时间轴管理顺序、对白、声音和关键帧。"
      badges={isFetching ? <Badge variant="outline">同步中</Badge> : null}
      onRefresh={() => { void refetch() }}
      refreshing={isFetching}
    >
      <main className="min-h-0 flex-1 overflow-hidden p-4">
        {!projectId ? (
          <EmptyWorkbenchState title="请先选择项目" text="当前没有可用的项目信息，无法拉取情节、制作项、素材需求和生成任务。" />
        ) : isLoading ? (
          <Card className="rounded-lg border-border bg-card p-8 text-center type-body text-muted-foreground">正在加载内容编排数据...</Card>
        ) : isError ? (
          <EmptyWorkbenchState title="内容编排数据加载失败" text="后端语义实体接口未返回可用数据，稍后重试。" />
        ) : (
          <div className="production-workbench h-full min-h-0">
            <div
              className={cn(
                'grid h-full min-h-0 gap-3 transition-[grid-template-columns]',
                sidebarCollapsed ? 'xl:grid-cols-[64px_minmax(0,1fr)]' : 'xl:grid-cols-[280px_minmax(0,1fr)]',
              )}
              data-testid="content-workbench-command-center"
              data-sidebar-collapsed={sidebarCollapsed ? 'true' : undefined}
            >
              <ContentWorkbenchFilterSidebar
                productionOptions={productionFilterOptions}
                productionValue={productionFilter}
                segmentOptions={segmentFilterOptions}
                segmentValue={segmentFilter}
                sceneOptions={sceneMomentFilterOptions}
                sceneValue={scopeLevel === 'scene_moment' ? selected?.id ?? '' : ''}
                query={sidebarQuery}
                resultCount={visibleRows.length}
                unitCount={totalUnitCount}
                collapsed={sidebarCollapsed}
                onQueryChange={setSidebarQuery}
                onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
                onSelectProduction={selectProductionFilter}
                onSelectSegment={selectSegmentFilter}
                onSelectScene={selectSceneMoment}
              />

              <div className="min-h-0 min-w-0 space-y-3 overflow-auto pr-1" data-testid="content-workbench-main-scroll">
                <section className="overflow-hidden rounded-lg border border-border bg-card">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/25 px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 type-label font-medium text-muted-foreground">
                        <Wand2 size={14} />
                        编排视图
                      </div>
                      <h2 className="mt-1 truncate type-title-sm font-semibold text-foreground">{contentWorkbenchViewTitle}</h2>
                      <p className="mt-1 line-clamp-2 type-label leading-5 text-muted-foreground">{contentWorkbenchViewDetail}</p>
                    </div>
                    <div className="shrink-0" data-testid="content-workbench-review-action">
                      <button
                        type="button"
                        data-action-key="review_ai_drafts"
                        className={cn(
                          'inline-flex h-8 items-center gap-2 rounded-md border px-2.5 type-label font-medium transition-colors hover:bg-primary/5',
                          reviewQueueSummary.pending > 0
                            ? 'border-amber-200 bg-amber-50/80 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100'
                            : 'border-border bg-background text-muted-foreground',
                        )}
                        onClick={openReviewQueue}
                      >
                        <ClipboardCheck size={14} />
                        <span>待审草案</span>
                        <Badge variant={reviewQueueSummary.pending > 0 ? 'warning' : 'outline'}>{reviewQueueSummary.pending}</Badge>
                      </button>
                    </div>
                  </div>
                  {visibleRows.length === 0 ? (
                    <div className="p-2.5">
                      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 type-label leading-5 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
                        <p>{filteredRows.length === 0 ? '当前项目还没有情节入口，先完成制作编排后再进入内容编排。' : '没有匹配当前搜索条件的情节。'}</p>
                        {filteredRows.length === 0 ? (
                          <Button size="sm" variant="outline" className="mt-2 gap-1.5" onClick={() => navigate(ROUTES.project.productionOrchestration)}>
                            <Route size={13} />
                            进入制作编排
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </section>

                {!selected ? (
                  <div className="rounded-lg border border-dashed border-border bg-card px-4 py-10 text-center" data-testid="content-workbench-select-scene-empty">
                    <Route size={20} className="mx-auto text-muted-foreground" />
                    <p className="mt-3 type-body font-medium text-foreground">请先选择情节</p>
                    <p className="mt-1 type-label text-muted-foreground">在左侧情节卡片中选择一个情节后，再编辑画面预览和内容单元。</p>
                  </div>
                ) : (
                  <>
                    {showReviewPanel ? (
                      <ContentGenerationReviewPanel
                        reviewMode={reviewMode}
                        drafts={reviewDrafts}
                        selectedDraft={selectedReviewDraft}
                        reviewModel={contentDraftReview}
                        queueSummary={reviewQueueSummary}
                        rejectingDraft={rejectContentDraft.isPending}
                        markingDraftReviewed={markContentDraftReviewed.isPending}
                        onOpenAiSuggest={openAiSuggest}
                        onSelectDraft={selectReviewDraft}
                        onCreateUnitFromProposal={openCreateUnitFromProposal}
                        onEditCurrentUnit={openEditSelectedUnit}
                        onApplyUnitProposal={(unitId, proposal) => applyContentUnitProposal.mutate({ unitId, proposal })}
                        onMarkDraftReviewed={(draft) => markContentDraftReviewed.mutate(draft)}
                        onRejectDraft={(draft) => rejectContentDraft.mutate(draft)}
                        onCloseReview={closeReview}
                      />
                    ) : null}

                    <div className="grid gap-3 2xl:grid-cols-[minmax(0,1fr)_400px] 2xl:items-start" data-testid="content-workbench-production-grid">
                      <div className="min-w-0 space-y-3">
                        <ContentWorkbenchScenePreview
                          row={selected}
                          selectedUnit={selectedUnit}
                          keyframes={selectedUnitKeyframes}
                          previewItemCount={selectedPreviewItemCount}
                          runningJobCount={selectedUnitRunningJobCount}
                          onSelectUnit={(unitId) => selectContentUnitFromRow(selected, selectedUnit?.ID === unitId ? null : unitId)}
                        />

                        <UnitProductionTrack
                          row={selected}
                          selectedUnitId={selectedUnit?.ID}
                          showInlineEditor={false}
                          onSelectUnit={(unitId) => selectContentUnitFromRow(selected, unitId)}
                          onCreateUnit={() => openCreateUnitForRow(selected)}
                          onAiSuggest={() => openAiSuggest(selected)}
                          onSelectFirstMoment={selectFirstSceneMoment}
                          onCreateAssetSlot={openCreateAssetSlot}
                          onCreateKeyframe={openCreateKeyframe}
                          onOpenCanvas={openSelectedUnitCanvas}
                          onUploadMissingAssets={triggerCandidateUpload}
                          onReorderUnit={(draggedUnitId, targetUnitId, position) => {
                            if (reorderContentUnits.isPending) return
                            reorderContentUnits.mutate({ row: selected, draggedUnitId, targetUnitId, position })
                          }}
                          onMoveUnitOnTimeline={(unitId, startSec) => {
                            if (moveContentUnitOnTimeline.isPending) return
                            moveContentUnitOnTimeline.mutate({ row: selected, unitId, startSec })
                          }}
                          onDeleteUnit={(unit) => {
                            selectContentUnitFromRow(selected, null, { replace: true })
                          }}
                          projectId={projectId}
                          queryKey={productionWorkbenchQueryKey}
                          jobs={data?.jobs ?? []}
                          isReordering={reorderContentUnits.isPending || moveContentUnitOnTimeline.isPending}
                        />
                      </div>

                      <ContentWorkbenchUnitInspector
                        projectId={projectId}
                        queryKey={productionWorkbenchQueryKey}
                        jobs={data?.jobs ?? []}
                        row={selected}
                        unit={selectedUnit}
                        onSelectUnit={(unitId) => selectContentUnitFromRow(selected, unitId)}
                        onCreateUnit={() => openCreateUnitForRow(selected)}
                        onAiSuggest={() => openAiSuggest(selected)}
                        onAiVisualPlan={() => openAiVisualPlan(selectedUnit)}
                        onCreateAssetSlot={openCreateAssetSlot}
                        onCreateKeyframe={openCreateKeyframe}
                        onOpenCanvas={openSelectedUnitCanvas}
                        onUploadMissingAssets={triggerCandidateUpload}
                        onDeleteUnit={(unit) => {
                          selectContentUnitFromRow(selected, null, { replace: true })
                        }}
                      />
                    </div>
                  </>
                )}
            </div>
            </div>
            <input ref={candidateUploadInput.inputRef} type="file" className="hidden" accept={RESOURCE_UPLOAD_ACCEPT} onChange={(e) => handleCandidateUpload(e.target.files?.[0])} />
          </div>
        )}
      </main>

      <ContentWorkbenchDialogs
        projectId={projectId}
        queryKey={productionWorkbenchQueryKey}
        selected={selected}
        selectedUnit={selectedUnit}
        selectedUnitKeyframes={selectedUnitKeyframes}
        contentUnitConfig={contentUnitConfig}
        assetSlotConfig={assetSlotConfig}
        keyframeConfig={keyframeConfig}
        creatingUnit={creatingUnit}
        unitDraftDefaults={unitDraftDefaults}
        editingUnit={editingUnit}
        creatingAssetSlot={creatingAssetSlot}
        assetSlotDefaults={assetSlotDefaults}
        creatingKeyframe={creatingKeyframe}
        keyframeDefaults={keyframeDefaults}
        onCreatingUnitChange={(open) => {
          if (!open) {
            setCreatingUnit(false)
            setUnitDraftDefaults(null)
          }
        }}
        onUnitSaved={(record) => {
          selectContentUnit(record.ID)
          setOptimisticSelectedUnit(record)
          setCreatingUnit(false)
          setUnitDraftDefaults(null)
          setEditingUnit(false)
        }}
        onEditingUnitChange={(open) => { if (!open) setEditingUnit(false) }}
        onAssetSlotCreated={() => setCreatingAssetSlot(false)}
        onCreatingAssetSlotChange={(open) => { if (!open) setCreatingAssetSlot(false) }}
        onKeyframeCreated={(record) => {
          setCreatingKeyframe(false)
          selectContentUnit(Number(record.content_unit_id) || selectedUnit?.ID || null)
        }}
        onCreatingKeyframeChange={(open) => { if (!open) setCreatingKeyframe(false) }}
      />

    </ProjectWorkbenchShell>
  )
}

function EmptyWorkbenchState({ title, text }: { title: string; text: string }) {
  return (
    <Card className="rounded-lg border-dashed border-border bg-card p-8 text-center">
      <p className="type-body font-semibold text-foreground">{title}</p>
      <p className="mx-auto mt-2 max-w-md type-body leading-6 text-muted-foreground">{text}</p>
    </Card>
  )
}
