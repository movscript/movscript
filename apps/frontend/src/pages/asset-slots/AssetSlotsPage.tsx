import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient, type QueryClient, type UseMutationResult } from '@tanstack/react-query'
import { Bot, ChevronRight, CircleDashed, Database, FileAudio, FileText, GitBranch, Image, Lock, Package, PackageCheck, Plus, Sparkles, Upload, Video, Wand2, type LucideIcon } from 'lucide-react'

import { ProjectLayerProposalReviewPanel } from '@/components/proposals/ProjectLayerProposalReviewPanel'
import { AuthedImage, AuthedVideo } from '@/components/shared/AuthedImage'
import { SemanticEntityInlineEditor } from '@/components/shared/SemanticEntityInlineEditor'
import { createSemanticEntity, listSemanticEntities, updateSemanticEntity, semanticEntityConfig, type SemanticEntityRecord } from '@/api/semanticEntities'
import { readNumberParam, readStringParam, updateContentFilterParams, type ContentFilterKey } from '@/pages/contents/lib/contentFilters'
import { buildCommandFirstClientInput } from '@/lib/agentCommandInput'
import { buildEmptyAssetProposalDraftContent } from '@/lib/assetProposalDraft'
import { api } from '@/lib/api'
import { API_BASE_URL } from '@/lib/config'
import { RESOURCE_UPLOAD_ACCEPT } from '@/lib/mediaTypes'
import { openAgentPanelDraft, registerAgentPanelPageTool } from '@/lib/agentPanelBridge'
import { selectLatestDraftArtifact } from '@/lib/agentArtifacts'
import { selectLatestGeneratedResource } from '@/lib/agentGenerationArtifacts'
import { localAgentClient, type AgentDraft } from '@/lib/localAgentClient'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/store/projectStore'
import { toast } from '@/store/toastStore'
import type { Canvas, PaginatedResponse, RawResource } from '@/types'
import { Badge, Button } from '@movscript/ui'

type SlotStatus = 'missing' | 'candidate' | 'locked' | 'waived'
type AssetKind = 'all' | 'image' | 'video' | 'audio' | 'text' | 'brand_pack' | 'reference' | 'other'
type CandidateGenerationKind = 'image' | 'video'

type AssetSlotRecord = SemanticEntityRecord & {
  owner_type?: string
  owner_id?: number
  production_id?: number
  creative_reference_id?: number
  creative_reference_state_id?: number
  kind?: string
  name?: string
  description?: string
  slot_key?: string
  prompt_hint?: string
  priority?: string
  status?: string
  resource_id?: number
  resource?: RawResource
  locked_asset_slot_id?: number
  locked_asset_slot?: AssetSlotRecord
}

type AssetSlotCandidateRecord = SemanticEntityRecord & {
  asset_slot_id?: number
  candidate_asset_slot_id?: number
  candidate_asset_slot?: AssetSlotRecord
  source_type?: string
  source_id?: number
  score?: number
  status?: string
  note?: string
}

type CreativeReferenceRecord = SemanticEntityRecord & {
  kind?: string
  name?: string
  alias?: string
  description?: string
  content?: string
  importance?: string
  status?: string
}

interface AssetSlotViewModel {
  slot: AssetSlotRecord
  candidates: AssetSlotCandidateRecord[]
  lockedSlot?: AssetSlotRecord
  searchText: string
  kind: Exclude<AssetKind, 'all'>
  hasResource: boolean
}

interface ReferenceAssetCluster {
  reference: CreativeReferenceRecord | null
  rows: AssetSlotViewModel[]
  missing: number
  candidate: number
  locked: number
  searchText: string
}

const assetKindOrder: AssetKind[] = ['all', 'image', 'video', 'audio', 'text', 'brand_pack', 'reference', 'other']

const assetKindMeta: Record<Exclude<AssetKind, 'all'>, { label: string; description: string; icon: LucideIcon; accent: string; soft: string; text: string }> = {
  image: {
    label: '图片',
    description: '封面、截图、关键画面和视觉参考。',
    icon: Image,
    accent: 'from-sky-500/20 to-cyan-500/10',
    soft: 'bg-sky-500/10',
    text: 'text-sky-700 dark:text-sky-300',
  },
  video: {
    label: '视频',
    description: '实拍、样片、动图和参考镜头。',
    icon: Video,
    accent: 'from-violet-500/20 to-fuchsia-500/10',
    soft: 'bg-violet-500/10',
    text: 'text-violet-700 dark:text-violet-300',
  },
  audio: {
    label: '音频',
    description: '配音、环境声、音效和音乐。',
    icon: FileAudio,
    accent: 'from-emerald-500/20 to-teal-500/10',
    soft: 'bg-emerald-500/10',
    text: 'text-emerald-700 dark:text-emerald-300',
  },
  text: {
    label: '文本',
    description: '文案、口播、说明和引用文本。',
    icon: FileText,
    accent: 'from-amber-500/20 to-yellow-500/10',
    soft: 'bg-amber-500/10',
    text: 'text-amber-700 dark:text-amber-300',
  },
  brand_pack: {
    label: '品牌包',
    description: '品牌规范、物料包和统一素材。',
    icon: Package,
    accent: 'from-rose-500/20 to-orange-500/10',
    soft: 'bg-rose-500/10',
    text: 'text-rose-700 dark:text-rose-300',
  },
  reference: {
    label: '参考',
    description: '风格板、示意图和外部参考。',
    icon: Sparkles,
    accent: 'from-fuchsia-500/20 to-pink-500/10',
    soft: 'bg-fuchsia-500/10',
    text: 'text-fuchsia-700 dark:text-fuchsia-300',
  },
  other: {
    label: '其他',
    description: '暂未归类但仍可复用的素材。',
    icon: PackageCheck,
    accent: 'from-zinc-500/20 to-slate-500/10',
    soft: 'bg-zinc-500/10',
    text: 'text-zinc-700 dark:text-zinc-300',
  },
}

function mediaSrc(resource?: RawResource): string | undefined {
  if (!resource?.url) return undefined
  return resource.url.startsWith('http') ? resource.url : `${API_BASE_URL}${resource.url}`
}

function slotPreview(slot?: AssetSlotRecord): { src?: string; video: boolean } {
  const resource = slot?.resource
  return {
    src: mediaSrc(resource),
    video: resource?.type === 'video' || Boolean(resource?.mime_type?.startsWith('video/')),
  }
}

function SlotThumb({ slot, className }: { slot?: AssetSlotRecord; className?: string }) {
  const preview = slotPreview(slot)
  if (!preview.src) {
    return (
      <div className={cn('flex items-center justify-center bg-muted text-muted-foreground', className)}>
        <SlotKindIcon kind={slot?.kind} />
      </div>
    )
  }
  return preview.video
    ? <AuthedVideo src={preview.src} className={cn('object-cover', className)} muted playsInline />
    : <AuthedImage src={preview.src} alt={slot?.name ?? ''} className={cn('object-cover', className)} />
}

function resourcePreview(resource?: RawResource): { src?: string; video: boolean } {
  return {
    src: mediaSrc(resource),
    video: resource?.type === 'video' || Boolean(resource?.mime_type?.startsWith('video/')),
  }
}

function ResourceThumb({ resource, className }: { resource?: RawResource; className?: string }) {
  const preview = resourcePreview(resource)
  if (preview.src && preview.video) {
    return <AuthedVideo src={preview.src} className={cn('object-cover', className)} muted playsInline />
  }
  if (preview.src && (resource?.type === 'image' || resource?.mime_type?.startsWith('image/'))) {
    return <AuthedImage src={preview.src} alt={resource?.name ?? ''} className={cn('object-cover', className)} />
  }
  return (
    <div className={cn('flex items-center justify-center bg-muted text-muted-foreground', className)}>
      <ResourceKindIcon resource={resource} />
    </div>
  )
}

export function AssetGenerationWorkspace() {
  const projectId = useProjectStore((s) => s.current?.ID)
  return <AssetSlotWorkspace projectId={projectId} compact />
}

export default function AssetSlotsPage() {
  const project = useProjectStore((s) => s.current)
  return <AssetSlotWorkspace projectId={project?.ID} projectName={project?.name} />
}

function AssetSlotWorkspace({ projectId, projectName, compact = false }: { projectId?: number; projectName?: string; compact?: boolean }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const assetAssistantCleanupRef = useRef<(() => void) | null>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const [newSlotEditId, setNewSlotEditId] = useState<number | null>(null)
  const [newReferenceEditKey, setNewReferenceEditKey] = useState<string | number | null>(null)
  const [uploading, setUploading] = useState(false)
  const selectedId = readNumberParam(searchParams, 'asset_slot_id') ?? readNumberParam(searchParams, 'selected')
  const selectedReferenceParam = readNumberParam(searchParams, 'reference_id')
  const kindParam = readStringParam(searchParams, 'kind')
  const workspaceView = searchParams.get('view') === 'review' ? 'review' : 'main'
  const kindFilter: AssetKind = kindParam ? normalizeAssetKind(kindParam) : 'all'
  const slotConfig = semanticEntityConfig('assetSlots')
  const candidateConfig = semanticEntityConfig('assetSlotCandidates')
  const referenceConfig = semanticEntityConfig('creativeReferences')

  const { data: creativeReferences = [] } = useQuery({
    queryKey: ['pre-production-creative-references', projectId],
    queryFn: () => listSemanticEntities(projectId!, referenceConfig) as Promise<CreativeReferenceRecord[]>,
    enabled: !!projectId,
  })

  const { data: slots = [], isLoading } = useQuery({
    queryKey: ['semantic-asset-slots-page', projectId],
    queryFn: () => listSemanticEntities(projectId!, slotConfig) as Promise<AssetSlotRecord[]>,
    enabled: !!projectId,
  })

  const { data: candidates = [] } = useQuery({
    queryKey: ['semantic-asset-slot-candidates-page', projectId],
    queryFn: () => listSemanticEntities(projectId!, candidateConfig) as Promise<AssetSlotCandidateRecord[]>,
    enabled: !!projectId,
  })

  const { data: resourcesData } = useQuery<PaginatedResponse<RawResource> | RawResource[]>({
    queryKey: ['resources', 'asset-slot-candidate-library'],
    queryFn: () => api.get('/resources', {
      params: { page: 1, page_size: 100, type: 'image,video,audio,text,file' },
    }).then((r) => r.data),
    enabled: !!projectId,
  })
  const assetProposalDraftsQuery = useQuery<AgentDraft[]>({
    queryKey: ['asset-proposal-drafts', projectId],
    queryFn: async () => {
      const { drafts } = await localAgentClient.listDrafts({ projectId, kind: 'asset_proposal', limit: 20 })
      return drafts
    },
    enabled: !!projectId && workspaceView === 'review',
    refetchInterval: workspaceView === 'review' ? 1500 : false,
  })

  useEffect(() => () => {
    assetAssistantCleanupRef.current?.()
  }, [])

  const updateSlotMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Record<string, string | number | boolean | null> }) =>
      updateSemanticEntity(projectId!, slotConfig, id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['semantic-asset-slots-page', projectId] }),
  })

  const createSlotMutation = useMutation({
    mutationFn: () => {
      if (!projectId) throw new Error('请先选择项目')
      const kind = kindFilter === 'all' ? 'image' : kindFilter
      return createSemanticEntity(projectId, slotConfig, {
        kind,
        name: `未命名${assetKindLabel(kind)}素材`,
        status: 'missing',
        priority: 'normal',
        ...(selectedReferenceParam ? { creative_reference_id: selectedReferenceParam } : {}),
      }) as Promise<AssetSlotRecord>
    },
    onSuccess: async (record) => {
      await queryClient.invalidateQueries({ queryKey: ['semantic-asset-slots-page', projectId] })
      setNewSlotEditId(record.ID)
      setFilter({ asset_slot_id: record.ID, selected: null })
      toast.success('素材需求已创建')
    },
  })

  const addCandidateMutation = useMutation({
    mutationFn: (payload: Record<string, string | number | boolean | null>) =>
      api.post(`/projects/${projectId}/entities/asset-slot-candidates`, payload).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['semantic-asset-slot-candidates-page', projectId] })
      queryClient.invalidateQueries({ queryKey: ['semantic-asset-slots-page', projectId] })
    },
  })

  const uploadCandidateMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!projectId) throw new Error('请先选择项目')
      if (!selected) throw new Error('请先选择素材需求')
      const fd = new FormData()
      fd.append('file', file)
      const resource = await api.post('/resources/upload', fd).then((r) => r.data as RawResource)
      await api.post(`/projects/${projectId}/entities/asset-slot-candidates`, {
        asset_slot_id: selected.slot.ID,
        resource_id: resource.ID,
        source_type: 'upload',
        source_id: resource.ID,
        score: 0.75,
        status: 'candidate',
        note: `手动上传候选：${resource.name}`,
      })
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['resources'] }),
        queryClient.invalidateQueries({ queryKey: ['semantic-asset-slots-page', projectId] }),
        queryClient.invalidateQueries({ queryKey: ['semantic-asset-slot-candidates-page', projectId] }),
      ])
      toast.success('候选已上传')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '上传候选失败')
    },
    onSettled: () => {
      setUploading(false)
      if (uploadInputRef.current) uploadInputRef.current.value = ''
    },
  })

  const openCanvasMutation = useMutation({
    mutationFn: async (row: AssetSlotViewModel) => {
      if (!projectId) throw new Error('请先选择项目')
      return api.post('/canvases', {
        name: `${row.slot.name || `素材需求 #${row.slot.ID}`} · 素材准备画布`,
        project_id: projectId,
        canvas_type: 'inspiration',
        stage: 'asset_prep',
        ref_type: 'asset_slot',
        ref_id: row.slot.ID,
      }).then((r) => r.data as Canvas)
    },
    onSuccess: (canvas) => {
      navigate(`/canvases/${canvas.ID}`)
    },
  })

  const generateCandidateMutation = useMutation({
    mutationFn: async ({ row, kind }: { row: AssetSlotViewModel; kind: CandidateGenerationKind }) => {
      if (!projectId) throw new Error('请先选择项目')
      const referenceIds = candidateReferenceResourceIds(row)
      const slotName = row.slot.name || `素材需求 #${row.slot.ID}`
      const draftShell = await localAgentClient.createDraft({
        projectId,
        kind: 'asset_proposal',
        title: `素材候选提案 - ${slotName}`,
        content: JSON.stringify(buildEmptyAssetProposalDraftContent({
          projectId,
          assetSlotId: row.slot.ID,
          slotName,
          slotKind: row.kind,
          description: row.slot.description,
          promptHint: row.slot.prompt_hint,
          ownerLabel: slotScopeLabel(row.slot),
          referenceResourceIds: referenceIds,
          createdAt: new Date().toISOString(),
        }), null, 2),
        source: {
          entityType: 'asset_slot',
          entityId: row.slot.ID,
          pageType: 'asset_proposal',
          pageRoute: '/asset-slots',
        },
        target: {
          projectId,
          entityType: 'asset_slot',
          entityId: row.slot.ID,
          field: 'candidate_generation_plan',
        },
        metadata: {
          pageOwned: true,
          assetSlotId: row.slot.ID,
          requestedOutputKind: kind,
          referenceResourceIds: referenceIds,
        },
      })
      const requestId = `asset_proposal_${row.slot.ID}_${Date.now().toString(36)}`
      assetAssistantCleanupRef.current?.()
      assetAssistantCleanupRef.current = registerAgentPanelPageTool(requestId, async (payload) => {
        if (payload.run?.status === 'failed') {
          toast.error(payload.run.error || payload.error || '素材候选提案生成失败')
          assetAssistantCleanupRef.current?.()
          assetAssistantCleanupRef.current = null
          return
        }
        if (payload.run?.status === 'cancelled') {
          toast.info('素材候选提案已停止')
          assetAssistantCleanupRef.current?.()
          assetAssistantCleanupRef.current = null
          return
        }
        if (!payload.run || (payload.run.status !== 'completed' && payload.run.status !== 'completed_with_warnings')) return
        const latestDraft = selectLatestDraftArtifact(payload.artifacts, 'asset_proposal')
        const draftId = latestDraft?.draftId || draftShell.id
        toast.success(`素材候选提案已准备，可在 AI 草稿中审阅：${draftId}`)
        assetAssistantCleanupRef.current?.()
        assetAssistantCleanupRef.current = null
      })

      openAgentPanelDraft({
        requestId,
        taskType: 'asset_candidate_proposal',
        message: `请准备素材候选提案：${slotName}`,
        title: `素材提案: ${slotName}`,
        newConversation: true,
        autoSend: true,
        projectId,
        clientInput: buildCommandFirstClientInput({
          message: `请为当前素材需求编写一份可审阅的素材候选生成提案：${slotName}`,
          labels: ['asset-slots', 'asset-proposal', 'draft-application'],
          hints: {
            projectId,
            draftId: draftShell.id,
            route: { pathname: '/asset-slots' },
            selection: {
              entityType: 'asset_slot',
              entityId: row.slot.ID,
              label: slotName,
            },
          },
        }),
        runPolicy: { maxToolCalls: 12, maxIterations: 8 },
        timeoutMs: 300_000,
        renderMode: 'chat',
      })
      return { draft: draftShell }
    },
    onSuccess: () => {
      toast.success('已打开 AI 素材候选提案助手')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '准备素材候选提案失败')
    },
  })

  const visibleSlots = useMemo(() => slots.filter((slot) => !isInternalCandidateSlot(slot)), [slots])
  const slotById = useMemo(() => new Map(slots.map((slot) => [slot.ID, slot])), [slots])
  const rows = useMemo(() => buildRows(visibleSlots, candidates, slotById), [candidates, slotById, visibleSlots])
  const referenceById = useMemo(() => new Map(creativeReferences.map((reference) => [reference.ID, reference])), [creativeReferences])
  const clusters = useMemo(() => buildReferenceAssetClusters(creativeReferences, rows), [creativeReferences, rows])
  const resourceLibrary = useMemo(() => Array.isArray(resourcesData) ? resourcesData : (resourcesData?.items ?? []), [resourcesData])
  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (kindFilter !== 'all' && row.kind !== kindFilter) return false
      return true
    })
  }, [kindFilter, rows])
  const filteredClusters = useMemo(() => clusters.map((cluster) => ({
    ...cluster,
    rows: cluster.rows.filter((row) => kindFilter === 'all' || row.kind === kindFilter),
  })), [clusters, kindFilter])
  const selected = selectedId ? rows.find((row) => row.slot.ID === selectedId) ?? null : null
  const selectedReferenceId = selectedReferenceParam ?? selected?.slot.creative_reference_id ?? filteredClusters[0]?.reference?.ID
  const selectedReference = selectedReferenceId ? referenceById.get(selectedReferenceId) ?? null : null
  const selectedCluster = filteredClusters.find((cluster) => (cluster.reference?.ID ?? 0) === (selectedReferenceId ?? 0)) ?? filteredClusters[0] ?? null
  const candidateResources = useMemo(() => {
    if (!selected) return []
    const existingResourceIds = new Set(selected.candidates.map((candidate) => candidate.candidate_asset_slot?.resource?.ID ?? candidate.candidate_asset_slot?.resource_id).filter(Boolean) as number[])
    return resourceLibrary.filter((resource) => !existingResourceIds.has(resource.ID) && isResourceCompatibleWithSlot(resource, selected.kind))
  }, [resourceLibrary, selected])

  const missingCount = visibleSlots.filter((slot) => normalizeSlotStatus(slot.status) === 'missing').length
  const candidateCount = visibleSlots.filter((slot) => normalizeSlotStatus(slot.status) === 'candidate').length
  const lockedCount = visibleSlots.filter((slot) => normalizeSlotStatus(slot.status) === 'locked').length
  const waivedCount = visibleSlots.filter((slot) => normalizeSlotStatus(slot.status) === 'waived').length

  function setFilter(updates: Partial<Record<ContentFilterKey, string | number | null | undefined>>) {
    setSearchParams(updateContentFilterParams(searchParams, updates), { replace: true })
  }

  function setWorkspaceView(view: 'main' | 'review') {
    const next = new URLSearchParams(searchParams)
    if (view === 'review') next.set('view', 'review')
    else next.delete('view')
    setSearchParams(next, { replace: true })
  }

  function startCreate() {
    createSlotMutation.mutate()
  }

  function startCreateReference() {
    setNewReferenceEditKey(`new-reference-${Date.now()}`)
    setFilter({ reference_id: null, asset_slot_id: null, selected: null })
  }

  function lockToSlot(candidateSlotID: number) {
    if (!selected) return
    updateSlotMutation.mutate({
      id: selected.slot.ID,
      payload: { status: 'locked', locked_asset_slot_id: candidateSlotID },
    })
  }

  function addCandidate(resourceID: number) {
    if (!selected) return
    const existing = selected.candidates.find((candidate) => candidate.candidate_asset_slot?.resource_id === resourceID || candidate.candidate_asset_slot?.resource?.ID === resourceID)
    if (existing) return
    addCandidateMutation.mutate({
      asset_slot_id: selected.slot.ID,
      resource_id: resourceID,
      source_type: 'manual',
      status: 'candidate',
      note: '由素材库加入',
    })
  }

  function triggerUpload() {
    if (!selected || uploading || uploadCandidateMutation.isPending) return
    uploadInputRef.current?.click()
  }

  function handleUpload(file?: File) {
    if (!file || !selected || uploadCandidateMutation.isPending) return
    setUploading(true)
    uploadCandidateMutation.mutate(file)
  }

  function generateCandidate(kind: CandidateGenerationKind) {
    if (!selected) return
    generateCandidateMutation.mutate({ row: selected, kind })
  }

  function generateMediaCandidate(kind: CandidateGenerationKind) {
    if (!selected || !projectId) return
    runMediaCandidateGeneration(selected, kind, {
      projectId,
      cleanupRef: assetAssistantCleanupRef,
      queryClient,
      addCandidateMutation,
      generationBusy: generateCandidateMutation.isPending,
    })
  }

  function openAssistantForSlot() {
    if (!projectId || !selected) {
      toast.info('请先选择素材需求')
      return
    }
    generateCandidateMutation.mutate({ row: selected, kind: selected.kind === 'video' ? 'video' : 'image' })
  }

  const mainWorkspace = (
    <PreProductionWorkspace
      loading={isLoading}
      clusters={filteredClusters}
      selectedCluster={selectedCluster}
      selectedReference={selectedReference}
      referenceConfig={referenceConfig}
      newReferenceEditKey={newReferenceEditKey}
      selected={selected}
      candidateResources={candidateResources}
      referenceCount={creativeReferences.length}
      visibleSlotCount={visibleSlots.length}
      missingCount={missingCount}
      candidateCount={candidateCount}
      lockedCount={lockedCount}
      waivedCount={waivedCount}
      kindFilter={kindFilter}
      rows={rows}
      newSlotEditId={newSlotEditId}
      projectId={projectId}
      slotConfig={slotConfig}
      setFilter={setFilter}
      startCreate={startCreate}
      startCreateReference={startCreateReference}
      createSlotPending={createSlotMutation.isPending}
      setWorkspaceView={setWorkspaceView}
      updateSlotMutationPending={updateSlotMutation.isPending}
      addCandidateMutationPending={addCandidateMutation.isPending}
      uploadCandidatePending={uploadCandidateMutation.isPending}
      openCanvasPending={openCanvasMutation.isPending}
      generateCandidatePending={generateCandidateMutation.isPending}
      uploading={uploading || uploadCandidateMutation.isPending}
      generatingKind={generateCandidateMutation.variables?.kind}
      onSaved={(record) => {
        setNewSlotEditId((id) => id === record.ID ? null : id)
        setFilter({ asset_slot_id: record.ID })
      }}
      onDeleted={() => {
        setNewSlotEditId(null)
        setFilter({ asset_slot_id: null, selected: null })
      }}
      onReferenceSaved={(record) => {
        setNewReferenceEditKey(null)
        setFilter({ reference_id: record.ID, asset_slot_id: null, selected: null })
      }}
      onReferenceDeleted={() => {
        setNewReferenceEditKey(null)
        setFilter({ reference_id: null, asset_slot_id: null, selected: null })
      }}
      onLock={lockToSlot}
      onAddCandidate={addCandidate}
      onUploadCandidate={triggerUpload}
      onGenerateProposal={generateCandidate}
      onGenerateMedia={generateMediaCandidate}
      onOpenAssistant={openAssistantForSlot}
      onOpenCanvas={() => selected && openCanvasMutation.mutate(selected)}
      onSelectSlot={(slotId) => setFilter({ asset_slot_id: slotId })}
      onSelectReference={(referenceId) => {
        setNewReferenceEditKey(null)
        setFilter({ reference_id: referenceId, asset_slot_id: null, selected: null })
      }}
    />
  )

  const reviewWorkspace = (
    <PreProductionReviewWorkspace
      projectId={projectId}
      drafts={assetProposalDraftsQuery.data ?? []}
      loading={assetProposalDraftsQuery.isLoading}
      creativeReferences={creativeReferences}
      assetSlots={visibleSlots}
      onApplied={async () => {
        await queryClient.invalidateQueries({ queryKey: ['semantic-asset-slots-page', projectId] })
        await assetProposalDraftsQuery.refetch()
      }}
      setWorkspaceView={setWorkspaceView}
    />
  )

  if (workspaceView === 'review') {
    return (
      <>
        {reviewWorkspace}
        <input ref={uploadInputRef} type="file" className="hidden" accept={RESOURCE_UPLOAD_ACCEPT} onChange={(e) => handleUpload(e.target.files?.[0])} />
      </>
    )
  }

  return (
    <>
      {mainWorkspace}
      <input ref={uploadInputRef} type="file" className="hidden" accept={RESOURCE_UPLOAD_ACCEPT} onChange={(e) => handleUpload(e.target.files?.[0])} />
    </>
  )
}

function PreProductionWorkspace({
  loading,
  clusters,
  selectedCluster,
  selectedReference,
  referenceConfig,
  newReferenceEditKey,
  selected,
  candidateResources,
  referenceCount,
  visibleSlotCount,
  missingCount,
  candidateCount,
  lockedCount,
  waivedCount,
  kindFilter,
  rows,
  newSlotEditId,
  projectId,
  slotConfig,
  setFilter,
  startCreate,
  startCreateReference,
  createSlotPending,
  setWorkspaceView,
  updateSlotMutationPending,
  addCandidateMutationPending,
  uploadCandidatePending,
  openCanvasPending,
  generateCandidatePending,
  uploading,
  generatingKind,
  onSaved,
  onDeleted,
  onReferenceSaved,
  onReferenceDeleted,
  onLock,
  onAddCandidate,
  onUploadCandidate,
  onGenerateProposal,
  onGenerateMedia,
  onOpenAssistant,
  onOpenCanvas,
  onSelectSlot,
  onSelectReference,
}: {
  loading: boolean
  clusters: ReferenceAssetCluster[]
  selectedCluster: ReferenceAssetCluster | null
  selectedReference: CreativeReferenceRecord | null
  referenceConfig: ReturnType<typeof semanticEntityConfig>
  newReferenceEditKey: string | number | null
  selected: AssetSlotViewModel | null
  candidateResources: RawResource[]
  referenceCount: number
  visibleSlotCount: number
  missingCount: number
  candidateCount: number
  lockedCount: number
  waivedCount: number
  kindFilter: AssetKind
  rows: AssetSlotViewModel[]
  newSlotEditId: number | null
  projectId?: number
  slotConfig: ReturnType<typeof semanticEntityConfig>
  setFilter: (updates: Partial<Record<ContentFilterKey, string | number | null | undefined>>) => void
  startCreate: () => void
  startCreateReference: () => void
  createSlotPending: boolean
  setWorkspaceView: (view: 'main' | 'review') => void
  updateSlotMutationPending: boolean
  addCandidateMutationPending: boolean
  uploadCandidatePending: boolean
  openCanvasPending: boolean
  generateCandidatePending: boolean
  uploading: boolean
  generatingKind?: CandidateGenerationKind
  onSaved: (record: SemanticEntityRecord) => void
  onDeleted: () => void
  onReferenceSaved: (record: SemanticEntityRecord) => void
  onReferenceDeleted: () => void
  onLock: (candidateSlotID: number) => void
  onAddCandidate: (resourceID: number) => void
  onUploadCandidate: () => void
  onGenerateProposal: (kind: CandidateGenerationKind) => void
  onGenerateMedia: (kind: CandidateGenerationKind) => void
  onOpenAssistant: () => void
  onOpenCanvas: () => void
  onSelectSlot: (slotId: number) => void
  onSelectReference: (referenceId: number) => void
}) {
  const clusterRows = selectedCluster?.rows ?? []
  const busy = updateSlotMutationPending || addCandidateMutationPending || uploadCandidatePending || openCanvasPending || generateCandidatePending
  return (
    <div className="min-h-full overflow-y-auto bg-background p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <CompactMetric label="设定" value={referenceCount} />
          <CompactMetric label="素材" value={visibleSlotCount} />
          <CompactMetric label="缺口" value={missingCount} />
          <CompactMetric label="候选" value={candidateCount} />
          <CompactMetric label="锁定" value={lockedCount} detail={`${waivedCount} 豁免`} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setWorkspaceView('review')}>
            <GitBranch size={14} />
            审阅提案
          </Button>
          <Button size="sm" variant="outline" onClick={startCreateReference} disabled={!projectId}>
            <Sparkles size={14} />
            新建设定
          </Button>
          <Button size="sm" onClick={startCreate} loading={createSlotPending} disabled={!projectId || createSlotPending}>
            <Plus size={14} />
            新建素材
          </Button>
        </div>
      </div>

      <main className="space-y-4">
        <section className="rounded-lg border border-border bg-card p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-foreground">设定</p>
            <Badge variant="outline" className="text-[10px]">{clusters.length}</Badge>
          </div>
          {loading ? <p className="py-8 text-center text-xs text-muted-foreground">加载中</p> : null}
          {!loading && clusters.length === 0 ? <EmptyPreview title="暂无前期资料" description="先创建设定资料，再为它建立素材包。" /> : null}
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {clusters.map((cluster) => (
              <ReferenceClusterButton
                key={cluster.reference?.ID ?? 'unbound'}
                cluster={cluster}
                selected={(selectedCluster?.reference?.ID ?? 0) === (cluster.reference?.ID ?? 0)}
                onSelect={() => cluster.reference?.ID ? onSelectReference(cluster.reference.ID) : cluster.rows[0] && onSelectSlot(cluster.rows[0].slot.ID)}
              />
            ))}
          </div>
        </section>

        <ReferenceMaterialStrip
          reference={selectedReference}
          rows={clusterRows}
          selected={selected}
          loading={loading}
          kindFilter={kindFilter}
          onKindChange={(value) => setFilter({ kind: value })}
          onSelectSlot={onSelectSlot}
        />

        {selected ? (
          <section className="grid items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_380px]">
            <SemanticEntityInlineEditor
              projectId={projectId}
              config={slotConfig}
              record={selected.slot}
              queryKey={['semantic-asset-slots-page', projectId]}
              editKey={selected.slot.ID === newSlotEditId ? newSlotEditId : null}
              title="素材需求"
              description="维护素材名称、类型、说明、提示词、优先级和设定归属。"
              hero={{
                icon: <SlotKindIcon kind={selected.kind} />,
                eyebrow: assetKindLabel(selected.kind),
                title: selected.slot.name || `素材需求 #${selected.slot.ID}`,
                subtitle: slotScopeLabel(selected.slot),
                summary: selected.slot.description || selected.slot.prompt_hint || '暂无素材需求描述。',
                accentClassName: assetKindMeta[selected.kind].accent,
                status: <SlotStatusBadge status={normalizeSlotStatus(selected.slot.status)} />,
                stats: [
                  { label: '候选', value: selected.candidates.length },
                  { label: '资源', value: selected.hasResource ? '已关联' : '未关联' },
                  { label: '锁定', value: selected.lockedSlot?.name || (selected.slot.locked_asset_slot_id ? `#${selected.slot.locked_asset_slot_id}` : '未锁定') },
                  { label: '状态', value: slotStatusLabel(normalizeSlotStatus(selected.slot.status)) },
                ],
              }}
              onSaved={onSaved}
              onDeleted={onDeleted}
            />

            <AssetSlotDetail
              row={selected}
              candidateResources={candidateResources}
              onLock={onLock}
              onAddCandidate={onAddCandidate}
              onUploadCandidate={onUploadCandidate}
              onGenerateCandidate={onGenerateProposal}
              onGenerateMediaCandidate={onGenerateMedia}
              onOpenAssistant={onOpenAssistant}
              onOpenCanvas={onOpenCanvas}
              busy={busy}
              uploading={uploading}
              generatingKind={generatingKind}
            />
          </section>
        ) : (
          <section className="grid items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_420px]">
            <SemanticEntityInlineEditor
              projectId={projectId}
              config={referenceConfig}
              record={newReferenceEditKey ? null : selectedReference}
              defaults={newReferenceEditKey ? { kind: 'person', importance: 'main', status: 'draft', name: '未命名设定' } : undefined}
              queryKey={['pre-production-creative-references', projectId]}
              editKey={newReferenceEditKey}
              title="设定资料"
              description="先把人物、地点、道具、风格写清楚，再围绕它组织素材。"
              emptyTitle="选择或新建设定"
              emptyDescription="点击上方设定卡片，或点击新建设定开始准备。"
              onSaved={onReferenceSaved}
              onDeleted={onReferenceDeleted}
            />
            <BoundAssetCardPanel
              rows={clusterRows}
              selected={selected}
              onSelectSlot={onSelectSlot}
              onCreateAsset={startCreate}
              creating={createSlotPending}
              disabled={!projectId}
            />
          </section>
        )}
      </main>
    </div>
  )
}

function PreProductionReviewWorkspace({
  projectId,
  drafts,
  loading,
  creativeReferences,
  assetSlots,
  onApplied,
  setWorkspaceView,
}: {
  projectId?: number
  drafts: AgentDraft[]
  loading: boolean
  creativeReferences: CreativeReferenceRecord[]
  assetSlots: AssetSlotRecord[]
  onApplied: () => Promise<void>
  setWorkspaceView: (view: 'main' | 'review') => void
}) {
  return (
    <div className="h-full min-h-[720px] overflow-y-auto bg-background p-4">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
            <GitBranch size={14} />
            <span>前期准备</span>
            <ChevronRight size={13} />
            <span>提案审阅</span>
          </div>
          <h1 className="text-base font-semibold text-foreground">前期准备审阅</h1>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
            这里审阅素材需求和设定归属；候选图 prompt、模型参数和真实图片生成从具体素材进入。
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setWorkspaceView('main')}>
          <Database size={14} />
          返回工作区
        </Button>
      </header>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <ProjectLayerProposalReviewPanel
          projectId={projectId}
          kind="asset_proposal"
          title="素材需求提案"
          description="只确认需要什么素材、属于哪个设定、用途、优先级、复用边界和状态。"
          emptyMessage="暂无待审阅素材需求提案。"
          drafts={drafts}
          loading={loading}
          data={{ creativeReferences, assetSlots }}
          onApplied={onApplied}
        />
        <div className="space-y-3">
          <AssetInfoPanel title="审阅边界" icon={GitBranch}>
            <AssetInfoRow label="设定资料" value="人物、地点、道具、风格等前期核心" />
            <AssetInfoRow label="素材需求" value="围绕设定形成素材包" />
            <AssetInfoRow label="候选图片" value="进入具体素材后生成" />
          </AssetInfoPanel>
          <AssetInfoPanel title="当前规模" icon={PackageCheck}>
            <AssetInfoRow label="设定资料" value={`${creativeReferences.length}`} />
            <AssetInfoRow label="素材需求" value={`${assetSlots.length}`} />
          </AssetInfoPanel>
        </div>
      </div>
    </div>
  )
}

function ReferenceClusterButton({ cluster, selected, onSelect }: { cluster: ReferenceAssetCluster; selected: boolean; onSelect: () => void }) {
  const title = referenceTitle(cluster.reference)
  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full rounded-md border p-2 text-left transition-colors hover:border-primary/50',
        selected ? 'border-primary bg-primary/5' : 'border-border bg-background',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-foreground">{title}</p>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{referenceKindLabel(cluster.reference?.kind)}</p>
        </div>
        <Badge variant="outline" className="text-[10px]">{cluster.rows.length}</Badge>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1 text-[10px]">
        <span className="rounded bg-amber-500/10 px-1.5 py-1 text-amber-700 dark:text-amber-300">{cluster.missing} 缺口</span>
        <span className="rounded bg-sky-500/10 px-1.5 py-1 text-sky-700 dark:text-sky-300">{cluster.candidate} 候选</span>
        <span className="rounded bg-emerald-500/10 px-1.5 py-1 text-emerald-700 dark:text-emerald-300">{cluster.locked} 锁定</span>
      </div>
    </button>
  )
}

function ReferenceMaterialStrip({ reference, rows, selected, loading, kindFilter, onKindChange, onSelectSlot }: {
  reference: CreativeReferenceRecord | null
  rows: AssetSlotViewModel[]
  selected: AssetSlotViewModel | null
  loading: boolean
  kindFilter: AssetKind
  onKindChange: (value: AssetKind) => void
  onSelectSlot: (slotId: number) => void
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <PackageCheck size={14} />
            <span>{referenceTitle(reference)}</span>
            <span>·</span>
            <span>{rows.length} 个素材</span>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{referenceDescription(reference)}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {assetKindOrder.map((kind) => (
            <Button
              key={kind}
              size="sm"
              variant={kindFilter === kind ? 'secondary' : 'ghost'}
              className="h-7 px-2 text-[11px]"
              onClick={() => onKindChange(kind)}
            >
              {kind === 'all' ? '全部' : assetKindLabel(kind)}
            </Button>
          ))}
        </div>
      </div>
      {loading ? <p className="py-8 text-center text-xs text-muted-foreground">加载中</p> : null}
      {!loading && rows.length === 0 ? <EmptyPreview title="没有关联素材" description="为这个设定创建人物、地点、道具或风格素材需求。" /> : null}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 2xl:grid-cols-4">
        {rows.map((row) => (
          <ReferenceAssetTile
            key={row.slot.ID}
            row={row}
            selected={row.slot.ID === selected?.slot.ID}
            onSelect={() => onSelectSlot(row.slot.ID)}
          />
        ))}
      </div>
    </section>
  )
}

function ReferenceAssetTile({ row, selected, onSelect }: { row: AssetSlotViewModel; selected: boolean; onSelect: () => void }) {
  const status = normalizeSlotStatus(row.slot.status)
  return (
    <button
      onClick={onSelect}
      className={cn(
        'overflow-hidden rounded-md border bg-background text-left transition-colors hover:border-primary/50',
        selected ? 'border-primary ring-1 ring-primary/40' : 'border-border',
      )}
    >
      <div className="flex gap-2 p-2">
        <SlotThumb slot={row.lockedSlot ?? row.slot} className="h-16 w-20 shrink-0 rounded border border-border" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-1">
            <p className="line-clamp-2 text-xs font-medium text-foreground">{row.slot.name || `素材 #${row.slot.ID}`}</p>
            <SlotStatusBadge status={status} />
          </div>
          <p className="mt-1 truncate text-[10px] text-muted-foreground">{assetKindLabel(row.kind)} · {row.candidates.length} 候选</p>
        </div>
      </div>
    </button>
  )
}

function BoundAssetCardPanel({
  rows,
  selected,
  onSelectSlot,
  onCreateAsset,
  creating,
  disabled,
}: {
  rows: AssetSlotViewModel[]
  selected: AssetSlotViewModel | null
  onSelectSlot: (slotId: number) => void
  onCreateAsset: () => void
  creating: boolean
  disabled: boolean
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">绑定素材</p>
          <p className="mt-1 text-xs text-muted-foreground">这些素材会继承当前设定的上下文。</p>
        </div>
        <Button size="sm" onClick={onCreateAsset} loading={creating} disabled={disabled || creating}>
          <Plus size={14} />
          新建素材
        </Button>
      </div>
      {rows.length === 0 ? <EmptyPreview title="暂无绑定素材" description="为这个设定创建素材后，会在这里形成缩略素材包。" /> : null}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 2xl:grid-cols-1">
        {rows.map((row) => (
          <ReferenceAssetTile
            key={row.slot.ID}
            row={row}
            selected={row.slot.ID === selected?.slot.ID}
            onSelect={() => onSelectSlot(row.slot.ID)}
          />
        ))}
      </div>
    </section>
  )
}

function AssetSlotCard({ row, selected, onSelect }: { row: AssetSlotViewModel; selected: boolean; onSelect: () => void }) {
  const slot = row.slot
  const kindMeta = assetKindMeta[row.kind]
  const KindIcon = kindMeta.icon
  return (
    <button
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-2 overflow-hidden rounded-md border bg-background p-2 text-left transition-all hover:border-primary/50 hover:shadow-sm',
        selected ? 'border-primary ring-1 ring-primary/40' : 'border-border',
      )}
    >
      <div className="relative h-9 w-12 shrink-0 overflow-hidden rounded border border-border">
        <SlotThumb slot={slot} className="h-full w-full" />
        <div className={cn('absolute inset-0 bg-gradient-to-br opacity-40', kindMeta.accent)} />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={cn('flex h-5 w-5 items-center justify-center rounded', kindMeta.soft)}>
            <KindIcon size={10} className={kindMeta.text} />
          </span>
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-1.5">
          <p className="truncate text-xs font-medium text-foreground">{slot.name || `素材需求 #${slot.ID}`}</p>
          <SlotStatusBadge status={normalizeSlotStatus(slot.status)} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <Badge variant="outline" className="text-[10px]">{kindMeta.label} · {row.candidates.length} 候选</Badge>
          {row.hasResource ? <Badge variant="outline" className="text-[10px]">资源</Badge> : null}
        </div>
      </div>
    </button>
  )
}

function AssetSlotDetail({
  row,
  candidateResources,
  onLock,
  onAddCandidate,
  onUploadCandidate,
  onGenerateCandidate,
  onGenerateMediaCandidate,
  onOpenAssistant,
  onOpenCanvas,
  busy,
  uploading,
  generatingKind,
}: {
  row: AssetSlotViewModel | null
  candidateResources: RawResource[]
  onLock: (candidateSlotID: number) => void
  onAddCandidate: (resourceID: number) => void
  onUploadCandidate: () => void
  onGenerateCandidate: (kind: CandidateGenerationKind) => void
  onGenerateMediaCandidate: (kind: CandidateGenerationKind) => void
  onOpenAssistant: () => void
  onOpenCanvas: () => void
  busy: boolean
  uploading: boolean
  generatingKind?: CandidateGenerationKind
}) {
  if (!row) return <EmptyPreview title="选择素材需求" description="查看缺口、候选和已锁定素材需求。" />
  const slot = row.slot
  const preferredKind: CandidateGenerationKind = row.kind === 'video' ? 'video' : 'image'
  const canGenerate = row.kind === 'image' || row.kind === 'video'
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{slot.name || `素材需求 #${slot.ID}`}</p>
          <p className="mt-1 text-xs text-muted-foreground">{slotScopeLabel(slot)}</p>
        </div>
        <SlotStatusBadge status={normalizeSlotStatus(slot.status)} />
      </div>

      <SlotThumb slot={row.lockedSlot ?? slot} className="aspect-video w-full rounded-md border border-border" />

      <div className="grid grid-cols-2 gap-2">
        <MiniStat label="状态" value={slotStatusLabel(normalizeSlotStatus(slot.status))} />
        <MiniStat label="类型" value={assetKindLabel(row.kind)} />
        <MiniStat label="优先级" value={slot.priority || 'normal'} />
        <MiniStat label="锁定至" value={row.lockedSlot?.name || (slot.locked_asset_slot_id ? `#${slot.locked_asset_slot_id}` : '未锁定')} />
      </div>

      <section>
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-xs font-medium text-foreground">候选素材</p>
          <div className="flex flex-wrap justify-end gap-1.5">
            {canGenerate ? (
              <>
                <Button size="sm" disabled={busy} onClick={() => onGenerateCandidate(preferredKind)}>
                  <Wand2 size={13} />
                  {busy && generatingKind === preferredKind ? '准备中' : `${preferredKind === 'video' ? '视频' : '图片'}方案`}
                </Button>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => onGenerateMediaCandidate(preferredKind)}>
                  {preferredKind === 'video' ? <Video size={13} /> : <Image size={13} />}
                  生成{preferredKind === 'video' ? '视频' : '图片'}候选
                </Button>
                {preferredKind === 'image' ? (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => onGenerateCandidate('video')}>
                    <Video size={13} />
                    视频方案
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => onGenerateCandidate('image')}>
                    <Image size={13} />
                    图片方案
                  </Button>
                )}
              </>
            ) : null}
            <Button size="sm" variant="outline" disabled={busy} onClick={onOpenAssistant}>
              <Bot size={13} />
              AI 助手
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={onUploadCandidate}>
              <Upload size={13} />
              {uploading ? '上传中' : '上传'}
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={onOpenCanvas}>
              <Sparkles size={13} />
              画布
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          {row.candidates.length === 0 ? <EmptyPreview title="暂无候选" description={canGenerate ? '先生成素材候选提案，审阅提示词、参考素材和候选计划后再执行生成。' : '通过 AI 助手或从下方素材库加入候选。'} /> : null}
          {row.candidates.map((candidate) => (
            <CandidateRow
              key={candidate.ID}
              candidate={candidate}
              selected={slot.locked_asset_slot_id === candidate.candidate_asset_slot_id || candidate.status === 'selected'}
              onConfirm={() => candidate.candidate_asset_slot_id && onLock(candidate.candidate_asset_slot_id)}
              busy={busy}
            />
          ))}
        </div>
      </section>

      <section>
        <p className="mb-2 text-xs font-medium text-foreground">可加入候选</p>
        <div className="grid grid-cols-2 gap-2">
          {candidateResources.slice(0, 8).map((resource) => (
            <button key={resource.ID} disabled={busy} onClick={() => onAddCandidate(resource.ID)} className="overflow-hidden rounded-md border border-border bg-background text-left hover:border-primary/40 disabled:opacity-60">
              <ResourceThumb resource={resource} className="aspect-[4/3] w-full" />
              <p className="truncate p-2 text-[11px] text-foreground">{resource.name || `资源 #${resource.ID}`}</p>
            </button>
          ))}
        </div>
        {candidateResources.length === 0 ? <EmptyPreview title="暂无可加入资源" description="素材库中没有匹配当前素材类型的资源。" /> : null}
      </section>
    </div>
  )
}

function CandidateRow({ candidate, selected, onConfirm, busy }: { candidate: AssetSlotCandidateRecord; selected: boolean; onConfirm: () => void; busy: boolean }) {
  const slot = candidate.candidate_asset_slot
  return (
    <div className={cn('rounded-md border p-2', selected ? 'border-primary bg-primary/5' : 'border-border bg-background')}>
      <div className="flex gap-2">
        <SlotThumb slot={slot} className="h-14 w-20 rounded border border-border" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{slot?.name || `素材需求 #${candidate.candidate_asset_slot_id}`}</p>
          <p className="truncate text-xs text-muted-foreground">{candidate.note || sourceTypeLabel(candidate.source_type)}</p>
        </div>
      </div>
      <Button size="sm" className="mt-2 w-full" disabled={selected || busy || !candidate.candidate_asset_slot_id} onClick={onConfirm}>
        {selected ? '已锁定' : '锁定此候选'}
      </Button>
    </div>
  )
}

function buildRows(slots: AssetSlotRecord[], candidates: AssetSlotCandidateRecord[], slotById: Map<number, AssetSlotRecord>): AssetSlotViewModel[] {
  return slots.map((slot) => {
    const kind = normalizeAssetKind(slot.kind)
    const slotCandidates = candidates
      .filter((candidate) => candidate.asset_slot_id === slot.ID)
      .map((candidate) => ({ ...candidate, candidate_asset_slot: candidate.candidate_asset_slot ?? (candidate.candidate_asset_slot_id ? slotById.get(candidate.candidate_asset_slot_id) : undefined) }))
    const lockedSlot = slot.locked_asset_slot ?? (slot.locked_asset_slot_id ? slotById.get(slot.locked_asset_slot_id) : undefined)
    const searchText = [slot.name, assetKindLabel(kind), slot.kind, slot.status, slot.description, slot.prompt_hint, slotScopeLabel(slot), lockedSlot?.name].filter(Boolean).join(' ').toLowerCase()
    return { slot, candidates: slotCandidates, lockedSlot, searchText, kind, hasResource: Boolean(slot.resource_id || slot.resource) }
  })
}

function buildReferenceAssetClusters(references: CreativeReferenceRecord[], rows: AssetSlotViewModel[]): ReferenceAssetCluster[] {
  const clusters = new Map<number, ReferenceAssetCluster>()
  for (const reference of references) {
    clusters.set(reference.ID, {
      reference,
      rows: [],
      missing: 0,
      candidate: 0,
      locked: 0,
      searchText: [reference.name, reference.alias, reference.kind, reference.status, reference.description, reference.content].filter(Boolean).join(' ').toLowerCase(),
    })
  }
  const unbound: ReferenceAssetCluster = {
    reference: null,
    rows: [],
    missing: 0,
    candidate: 0,
    locked: 0,
    searchText: '未绑定 项目素材需求 unbound project assets',
  }
  for (const row of rows) {
    const cluster = row.slot.creative_reference_id ? clusters.get(row.slot.creative_reference_id) ?? unbound : unbound
    cluster.rows.push(row)
    const status = normalizeSlotStatus(row.slot.status)
    if (status === 'missing') cluster.missing += 1
    if (status === 'candidate') cluster.candidate += 1
    if (status === 'locked') cluster.locked += 1
    cluster.searchText = `${cluster.searchText} ${row.searchText}`
  }
  const output = [...clusters.values(), ...(unbound.rows.length > 0 ? [unbound] : [])]
  return output
    .filter((cluster) => cluster.rows.length > 0 || cluster.reference)
    .sort((a, b) => b.rows.length - a.rows.length)
}

function isInternalCandidateSlot(slot: AssetSlotRecord) {
  return slot.owner_type === 'asset_slot'
}

function isResourceCompatibleWithSlot(resource: RawResource, kind: Exclude<AssetKind, 'all'>) {
  if (kind === 'image' || kind === 'video' || kind === 'audio' || kind === 'text') return resource.type === kind
  if (kind === 'brand_pack' || kind === 'reference' || kind === 'other') return true
  return true
}

function candidateReferenceResourceIds(row: AssetSlotViewModel) {
  const ids: number[] = []
  const add = (id?: number) => {
    if (id && Number.isFinite(id) && !ids.includes(id)) ids.push(id)
  }
  add(row.lockedSlot?.resource?.ID ?? row.lockedSlot?.resource_id)
  add(row.slot.resource?.ID ?? row.slot.resource_id)
  for (const candidate of row.candidates) {
    add(candidate.candidate_asset_slot?.resource?.ID ?? candidate.candidate_asset_slot?.resource_id)
    if (ids.length >= 3) break
  }
  return ids
}

function assetKindLabel(kind: Exclude<AssetKind, 'all'>) {
  return assetKindMeta[kind].label
}

function normalizeAssetKind(kind?: string): Exclude<AssetKind, 'all'> {
  const normalized = String(kind ?? '').toLowerCase()
  if (normalized === 'image' || normalized === 'video' || normalized === 'audio' || normalized === 'text' || normalized === 'brand_pack' || normalized === 'reference') {
    return normalized
  }
  return 'other'
}

function SlotStatusBadge({ status }: { status: SlotStatus }) {
  const meta = {
    missing: { label: '缺口', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
    candidate: { label: '候选', className: 'bg-sky-500/10 text-sky-700 dark:text-sky-300' },
    locked: { label: '已锁定', className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
    waived: { label: '已豁免', className: 'bg-zinc-500/10 text-zinc-700 dark:text-zinc-300' },
  }[status]
  return <span className={cn('rounded-md px-2 py-1 text-[10px]', meta.className)}>{meta.label}</span>
}

function SlotKindIcon({ kind }: { kind?: string }) {
  if (kind === 'video') return <Video size={16} />
  if (kind === 'audio') return <FileAudio size={16} />
  if (kind === 'text') return <FileText size={16} />
  return <Image size={16} />
}

function ResourceKindIcon({ resource }: { resource?: RawResource }) {
  if (resource?.type === 'video') return <Video size={16} />
  if (resource?.type === 'audio') return <FileAudio size={16} />
  if (resource?.type === 'text') return <FileText size={16} />
  return <Image size={16} />
}

function normalizeSlotStatus(status?: string): SlotStatus {
  if (status === 'candidate' || status === 'locked' || status === 'waived') return status
  return 'missing'
}

function slotScopeLabel(slot: AssetSlotRecord) {
  if (slot.owner_type && slot.owner_id) {
    const label = ownerTypeLabels[slot.owner_type] ?? slot.owner_type
    return `${label} #${slot.owner_id}`
  }
  if (slot.creative_reference_id) return `设定资料 #${slot.creative_reference_id}`
  if (slot.resource_id) return `资源 #${slot.resource_id}`
  return '项目素材需求'
}

function referenceTitle(reference?: CreativeReferenceRecord | null) {
  if (!reference) return '未绑定设定'
  return reference.name || reference.alias || `设定资料 #${reference.ID}`
}

function referenceDescription(reference?: CreativeReferenceRecord | null) {
  if (!reference) return '这些素材还没有归属到具体设定资料，建议先绑定人物、地点、道具或风格，方便后续复用和一致性控制。'
  return reference.description || reference.content || '暂无设定说明。'
}

function referenceKindLabel(kind?: string) {
  const labels: Record<string, string> = {
    person: '人物',
    character: '人物',
    location: '地点',
    scene: '地点',
    object: '道具',
    prop: '道具',
    style: '风格',
    product: '产品',
    rule: '规则',
  }
  return labels[String(kind ?? '').toLowerCase()] ?? '设定资料'
}

const ownerTypeLabels: Record<string, string> = {
  scene: '分场',
  storyboard: '分镜',
  storyboard_script: '分镜脚本',
  storyboard_line: '分镜行',
  segment: '编排段',
  scene_moment: '场景时刻',
  content_unit: '制作项',
  script: '剧本',
  script_version: '剧本版本',
  keyframe: '关键帧',
  delivery_version: '交付版本',
  canvas: '画布',
  asset_slot: '素材需求',
}

function slotStatusLabel(status: SlotStatus): string {
  const labels: Record<SlotStatus, string> = {
    missing: '缺口',
    candidate: '候选',
    locked: '已锁定',
    waived: '已豁免',
  }
  return labels[status]
}

function sourceTypeLabel(sourceType?: string): string {
  if (!sourceType) return '候选'
  const labels: Record<string, string> = {
    manual: '手动添加',
    ai: 'AI 生成',
    ai_agent: 'AI 助手生成',
    upload: '上传',
    job: '任务生成',
    canvas: '画布生成',
  }
  return labels[sourceType] ?? sourceType
}

function AssetMetric({ icon: Icon, label, value, detail }: { icon: LucideIcon; label: string; value: number; detail: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon size={14} />
        {label}
      </div>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{detail}</p>
    </div>
  )
}

function CompactMetric({ label, value, detail }: { label: string; value: number; detail?: string }) {
  return (
    <div className="min-w-20 rounded-md border border-border bg-card px-3 py-2">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <div className="mt-0.5 flex items-end gap-1.5">
        <span className="text-lg font-semibold leading-none text-foreground">{value}</span>
        {detail ? <span className="pb-0.5 text-[10px] text-muted-foreground">{detail}</span> : null}
      </div>
    </div>
  )
}

function AssetInfoPanel({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <Icon size={14} className="text-muted-foreground" />
        <p className="text-sm font-semibold text-foreground">{title}</p>
      </div>
      <div className="space-y-2 p-3">{children}</div>
    </section>
  )
}

function AssetInfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-xs font-medium text-foreground">{value}</p>
    </div>
  )
}

function CandidateInfoCard({ candidate }: { candidate: AssetSlotCandidateRecord }) {
  const slot = candidate.candidate_asset_slot
  return (
    <div className="rounded-md border border-border bg-background p-2">
      <div className="flex gap-2">
        <SlotThumb slot={slot} className="h-12 w-16 rounded border border-border" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-foreground">{slot?.resource?.name || slot?.name || `候选 #${candidate.candidate_asset_slot_id}`}</p>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{candidate.note || sourceTypeLabel(candidate.source_type)}</p>
        </div>
      </div>
    </div>
  )
}

function runMediaCandidateGeneration(
  row: AssetSlotViewModel,
  kind: CandidateGenerationKind,
  options: {
    projectId: number
    cleanupRef: MutableRefObject<(() => void) | null>
    queryClient: QueryClient
    addCandidateMutation: UseMutationResult<unknown, Error, Record<string, string | number | boolean | null>>
    generationBusy: boolean
  },
) {
  if (options.generationBusy) return
  const slotName = row.slot.name || `素材需求 #${row.slot.ID}`
  const requestId = `asset_candidate_generation_${row.slot.ID}_${Date.now().toString(36)}`
  options.cleanupRef.current?.()
  options.cleanupRef.current = registerAgentPanelPageTool(requestId, async (payload) => {
    if (payload.run?.status === 'failed') {
      toast.error(payload.run.error || payload.error || '素材候选生成失败')
      options.cleanupRef.current?.()
      options.cleanupRef.current = null
      return
    }
    if (payload.run?.status === 'cancelled') {
      toast.info('素材候选生成已停止')
      options.cleanupRef.current?.()
      options.cleanupRef.current = null
      return
    }
    if (!payload.run || (payload.run.status !== 'completed' && payload.run.status !== 'completed_with_warnings')) return
    const generated = selectLatestGeneratedResource(payload.run)
    if (generated?.outputResourceId) {
      options.addCandidateMutation.mutate({
        asset_slot_id: row.slot.ID,
        resource_id: generated.outputResourceId,
        source_type: 'ai_agent',
        source_id: generated.jobId ?? generated.outputResourceId,
        status: 'candidate',
        score: 0.8,
        note: `AI 生成${kind === 'video' ? '视频' : '图片'}候选：resource #${generated.outputResourceId}`,
      })
      await Promise.all([
        options.queryClient.invalidateQueries({ queryKey: ['resources'] }),
        options.queryClient.invalidateQueries({ queryKey: ['semantic-asset-slots-page', options.projectId] }),
        options.queryClient.invalidateQueries({ queryKey: ['semantic-asset-slot-candidates-page', options.projectId] }),
      ])
      toast.success(`已加入${kind === 'video' ? '视频' : '图片'}候选 #${generated.outputResourceId}`)
    } else {
      toast.info('生成流程完成，但没有返回可加入的输出资源')
    }
    options.cleanupRef.current?.()
    options.cleanupRef.current = null
  })

  openAgentPanelDraft({
    requestId,
    taskType: 'asset_candidate_generation',
    message: `请为素材需求生成${kind === 'video' ? '视频' : '图片'}候选：${slotName}`,
    title: `生成${kind === 'video' ? '视频' : '图片'}候选: ${slotName}`,
    newConversation: true,
    autoSend: true,
    projectId: options.projectId,
    clientInput: buildCommandFirstClientInput({
      message: [
        `请为当前 asset slot 真实生成一个${kind === 'video' ? '视频' : '图片'}候选：${slotName}。`,
        `目标 assetSlotId=${row.slot.ID}，类型=${row.kind}。`,
        row.slot.description ? `素材说明：${row.slot.description}` : '',
        row.slot.prompt_hint ? `提示词线索：${row.slot.prompt_hint}` : '',
        '这不是素材方案草稿，请走 asset_candidate_generation / visual_generation，创建生成任务并监控结果；如果得到 output_resource_id，请报告它。',
      ].filter(Boolean).join('\n'),
      labels: ['pre-production', 'asset-candidate-generation', kind === 'video' ? 'video-generation' : 'image-generation'],
      hints: {
        projectId: options.projectId,
        route: { pathname: '/pre-production' },
        selection: {
          entityType: 'asset_slot',
          entityId: row.slot.ID,
          label: slotName,
        },
      },
    }),
    runPolicy: { maxToolCalls: 18, maxIterations: 10 },
    timeoutMs: 600_000,
    renderMode: 'chat',
  })
  toast.success(`已打开${kind === 'video' ? '视频' : '图片'}候选生成助手`)
}

function MiniStat({ label, value }: { label: string; value?: string | number }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-medium text-foreground">{value || '无'}</p>
    </div>
  )
}

function EmptyPreview({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-muted/30 p-4 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
    </div>
  )
}
