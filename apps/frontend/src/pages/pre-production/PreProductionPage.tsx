import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient, type QueryClient, type UseMutationResult } from '@tanstack/react-query'
import { Bot, Check, ChevronRight, Database, FileAudio, FileText, GitBranch, Image, Package, PackageCheck, Plus, Sparkles, Upload, Video, Wand2, type LucideIcon } from 'lucide-react'

import { ProjectLayerProposalReviewPanel } from '@/components/proposals/ProjectLayerProposalReviewPanel'
import { AuthedImage, AuthedVideo } from '@/components/shared/AuthedImage'
import { ResourceLibraryPicker, type ResourceTypeFilter } from '@/components/shared/ResourceLibraryPicker'
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
import { invalidateAssetCandidateConsumers } from '@/lib/assetCandidateQueryInvalidation'
import { localAgentClient, type AgentDraft } from '@/lib/localAgentClient'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/store/projectStore'
import { toast } from '@/store/toastStore'
import type { Canvas, PaginatedResponse, RawResource } from '@/types'
import { Badge, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@movscript/ui'
import { ROUTES } from '@/routes/projectRoutes'

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

type MediaFit = 'cover' | 'contain'

function SlotThumb({ slot, className, fit = 'cover' }: { slot?: AssetSlotRecord; className?: string; fit?: MediaFit }) {
  const preview = slotPreview(slot)
  if (!preview.src) {
    return (
      <div className={cn('flex items-center justify-center bg-muted text-muted-foreground', className)}>
        <SlotKindIcon kind={slot?.kind} />
      </div>
    )
  }
  return preview.video
    ? <AuthedVideo src={preview.src} className={cn(fit === 'contain' ? 'object-contain bg-black' : 'object-cover', className)} muted playsInline />
    : <AuthedImage src={preview.src} alt={slot?.name ?? ''} className={cn(fit === 'contain' ? 'object-contain bg-muted' : 'object-cover', className)} />
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

async function loadPreProductionReviewDrafts(
  projectId: number,
  kind: Extract<AgentDraft['kind'], 'setting_proposal' | 'asset_proposal'>,
  draftIds: string[],
): Promise<AgentDraft[]> {
  const ids = Array.from(new Set(draftIds.map((id) => id.trim()).filter(Boolean)))
  if (ids.length === 0) return []
  const drafts = await Promise.all(ids.map(async (draftId) => {
    try {
      return await localAgentClient.getDraft(draftId)
    } catch {
      return null
    }
  }))
  return drafts.filter((draft): draft is AgentDraft => Boolean(draft && draft.projectId === projectId && draft.kind === kind))
}

export function PreProductionAssetWorkspace() {
  const projectId = useProjectStore((s) => s.current?.ID)
  return <PreProductionWorkspaceShell projectId={projectId} compact />
}

export default function PreProductionPage() {
  const project = useProjectStore((s) => s.current)
  return <PreProductionWorkspaceShell projectId={project?.ID} projectName={project?.name} />
}

function PreProductionWorkspaceShell({ projectId, projectName, compact = false }: { projectId?: number; projectName?: string; compact?: boolean }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const assetAssistantCleanupRef = useRef<(() => void) | null>(null)
  const prepAuditCleanupRef = useRef<(() => void) | null>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const [newSlotEditId, setNewSlotEditId] = useState<number | null>(null)
  const [newReferenceEditKey, setNewReferenceEditKey] = useState<string | number | null>(null)
  const [uploading, setUploading] = useState(false)
  const [prepAuditLaunching, setPrepAuditLaunching] = useState(false)
  const [resourceLibraryOpen, setResourceLibraryOpen] = useState(false)
  const [resourceLibrarySearch, setResourceLibrarySearch] = useState('')
  const [resourceLibraryType, setResourceLibraryType] = useState<ResourceTypeFilter>('all')
  const [resourceLibraryPage, setResourceLibraryPage] = useState(1)
  const [selectedLibraryResource, setSelectedLibraryResource] = useState<RawResource | null>(null)
  const selectedId = readNumberParam(searchParams, 'asset_slot_id') ?? readNumberParam(searchParams, 'selected')
  const selectedReferenceParam = readNumberParam(searchParams, 'reference_id')
  const kindParam = readStringParam(searchParams, 'kind')
  const workspaceView = searchParams.get('view') === 'review' ? 'review' : 'main'
  const openedDraftId = searchParams.get('draftId')?.trim() || ''
  const openedSettingDraftId = searchParams.get('settingDraftId')?.trim() || ''
  const openedAssetProposalDraftId = searchParams.get('assetProposalDraftId')?.trim() || ''
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

  const resourceLibraryTypeParam = resourceLibraryType === 'all' ? 'image,video,audio,text,file' : resourceLibraryType
  const resourceLibraryQuery = useQuery<PaginatedResponse<RawResource> | RawResource[]>({
    queryKey: ['resources', 'pre-production-library-picker', resourceLibraryTypeParam, resourceLibrarySearch, resourceLibraryPage],
    queryFn: () => api.get('/resources', {
      params: {
        page: resourceLibraryPage,
        page_size: 18,
        type: resourceLibraryTypeParam,
        q: resourceLibrarySearch.trim() || undefined,
      },
    }).then((r) => r.data),
    enabled: resourceLibraryOpen,
  })

  const assetProposalDraftsQuery = useQuery<AgentDraft[]>({
    queryKey: ['asset-proposal-drafts', projectId, openedAssetProposalDraftId, openedDraftId],
    queryFn: () => loadPreProductionReviewDrafts(projectId!, 'asset_proposal', [openedAssetProposalDraftId, openedDraftId]),
    enabled: !!projectId && workspaceView === 'review' && Boolean(openedAssetProposalDraftId || openedDraftId),
    refetchInterval: workspaceView === 'review' ? 1500 : false,
  })
  const settingProposalDraftsQuery = useQuery<AgentDraft[]>({
    queryKey: ['setting-proposal-drafts', projectId, openedSettingDraftId, openedDraftId],
    queryFn: () => loadPreProductionReviewDrafts(projectId!, 'setting_proposal', [openedSettingDraftId, openedDraftId]),
    enabled: !!projectId && workspaceView === 'review' && Boolean(openedSettingDraftId || openedDraftId),
    refetchInterval: workspaceView === 'review' ? 1500 : false,
  })

  useEffect(() => () => {
    assetAssistantCleanupRef.current?.()
    prepAuditCleanupRef.current?.()
  }, [])

  const updateSlotMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Record<string, string | number | boolean | null> }) =>
      updateSemanticEntity(projectId!, slotConfig, id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['semantic-asset-slots-page', projectId] }),
  })

  const lockCandidateMutation = useMutation({
    mutationFn: async ({ row, candidate }: { row: AssetSlotViewModel; candidate: AssetSlotCandidateRecord }) => {
      if (!projectId) throw new Error('请先选择项目')
      if (!candidate.candidate_asset_slot_id) throw new Error('候选缺少素材位')
      if (!assetSlotHasLoadedResource(candidate.candidate_asset_slot)) throw new Error('候选资源不存在或未加载')
      await api.patch(`/projects/${projectId}/entities/asset-slot-candidates/${candidate.ID}`, candidatePatchPayload(row.slot.ID, candidate, 'selected'))
    },
    onSuccess: () => {
      invalidateAssetCandidateConsumers(queryClient, projectId)
      toast.success('素材已选定')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '选定素材失败')
    },
  })
  const rejectCandidateMutation = useMutation({
    mutationFn: async ({ row, candidate }: { row: AssetSlotViewModel; candidate: AssetSlotCandidateRecord }) => {
      if (!projectId) throw new Error('请先选择项目')
      if (!candidate.candidate_asset_slot_id) throw new Error('候选缺少素材位')
      await api.patch(`/projects/${projectId}/entities/asset-slot-candidates/${candidate.ID}`, candidatePatchPayload(row.slot.ID, candidate, 'rejected'))
    },
    onSuccess: () => {
      invalidateAssetCandidateConsumers(queryClient, projectId)
      toast.success('素材候选已拒绝')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '拒绝候选失败')
    },
  })

  const createSlotMutation = useMutation({
    mutationFn: () => {
      if (!projectId) throw new Error('请先选择项目')
      const kind = kindFilter === 'all' ? 'image' : kindFilter
      const selectedSlotRecord = selectedId ? slots.find((slot) => slot.ID === selectedId) : undefined
      const referenceId = selectedReferenceParam ?? selectedSlotRecord?.creative_reference_id
      return createSemanticEntity(projectId, slotConfig, {
        kind,
        name: `未命名${assetKindLabel(kind)}素材`,
        status: 'missing',
        priority: 'normal',
        ...(referenceId ? { creative_reference_id: referenceId, owner_type: 'creative_reference', owner_id: referenceId } : {}),
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
      invalidateAssetCandidateConsumers(queryClient, projectId)
    },
  })

  const attachLibraryCandidateMutation = useMutation({
    mutationFn: async ({ row, resource }: { row: AssetSlotViewModel; resource: RawResource }) => {
      if (!projectId) throw new Error('请先选择项目')
      await api.post(`/projects/${projectId}/entities/asset-slot-candidates`, {
        asset_slot_id: row.slot.ID,
        resource_id: resource.ID,
        source_type: 'manual',
        source_id: resource.ID,
        score: 0.7,
        status: 'candidate',
        note: `从资源库选择：${resource.name}`,
      })
    },
    onSuccess: async () => {
      setResourceLibraryOpen(false)
      setSelectedLibraryResource(null)
      invalidateAssetCandidateConsumers(queryClient, projectId)
      toast.success('资源已加入候选')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '加入资源候选失败')
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
      await queryClient.invalidateQueries({ queryKey: ['resources'] })
      invalidateAssetCandidateConsumers(queryClient, projectId)
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
          pageRoute: ROUTES.project.preProduction,
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
            route: { pathname: ROUTES.project.preProduction },
            selection: {
              entityType: 'asset_slot',
              entityId: row.slot.ID,
              label: slotName,
            },
          },
        }),
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
  const selectedReferenceId = selected
    ? selectedReferenceParam ?? selected.slot.creative_reference_id ?? null
    : selectedReferenceParam ?? filteredClusters[0]?.reference?.ID
  const selectedReference = selectedReferenceId ? referenceById.get(selectedReferenceId) ?? null : null
  const selectedCluster = filteredClusters.find((cluster) => (cluster.reference?.ID ?? 0) === (selectedReferenceId ?? 0)) ?? filteredClusters[0] ?? null

  const missingCount = visibleSlots.filter((slot) => normalizeSlotStatus(slot.status) === 'missing').length
  const candidateCount = rows.filter(rowHasActiveAssetCandidates).length
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

  function lockCandidate(candidate: AssetSlotCandidateRecord) {
    if (!selected) return
    lockCandidateMutation.mutate({ row: selected, candidate })
  }

  function rejectCandidate(candidate: AssetSlotCandidateRecord) {
    if (!selected) return
    rejectCandidateMutation.mutate({ row: selected, candidate })
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

  function openResourceLibraryPicker() {
    if (!selected) {
      toast.info('请先选择素材需求')
      return
    }
    setResourceLibraryType(defaultResourceTypeForAssetKind(selected.kind))
    setResourceLibrarySearch('')
    setResourceLibraryPage(1)
    setSelectedLibraryResource(null)
    setResourceLibraryOpen(true)
  }

  function attachSelectedLibraryResource() {
    if (!selected || !selectedLibraryResource || attachLibraryCandidateMutation.isPending) return
    attachLibraryCandidateMutation.mutate({ row: selected, resource: selectedLibraryResource })
  }

  function openAssistantForSlot() {
    if (!projectId || !selected) {
      toast.info('请先选择素材需求')
      return
    }
    generateCandidateMutation.mutate({ row: selected, kind: selected.kind === 'video' ? 'video' : 'image' })
  }

  function organizeCurrentPrep() {
    if (!projectId) {
      toast.info('请先选择项目')
      return
    }
    const projectLabel = projectName || `项目 #${projectId}`
    const requestId = `pre_production_audit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    setPrepAuditLaunching(true)
    prepAuditCleanupRef.current?.()
    prepAuditCleanupRef.current = registerAgentPanelPageTool(requestId, async (payload) => {
      setPrepAuditLaunching(false)
      prepAuditCleanupRef.current?.()
      prepAuditCleanupRef.current = null
      if (payload.status === 'cancelled' || payload.run?.status === 'cancelled') {
        toast.info('前期准备梳理已停止')
      } else if (payload.status === 'error' || payload.run?.status === 'failed') {
        toast.error(payload.run?.error || payload.error || '前期准备梳理失败')
      } else {
        const latestSettingDraft = selectLatestDraftArtifact(payload.artifacts, 'setting_proposal')
        const latestAssetProposalDraft = selectLatestDraftArtifact(payload.artifacts, 'asset_proposal')
        setSearchParams((current) => {
          const next = new URLSearchParams(current)
          next.set('view', 'review')
          if (latestSettingDraft?.draftId) next.set('settingDraftId', latestSettingDraft.draftId)
          if (latestAssetProposalDraft?.draftId) next.set('assetProposalDraftId', latestAssetProposalDraft.draftId)
          return next
        }, { replace: true })
        toast.success('前期准备梳理完成，可在审阅区查看设定和素材提案')
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['pre-production-creative-references', projectId] }),
        queryClient.invalidateQueries({ queryKey: ['semantic-asset-slots-page', projectId] }),
        settingProposalDraftsQuery.refetch(),
        assetProposalDraftsQuery.refetch(),
      ])
    })

    openAgentPanelDraft({
      requestId,
      taskType: 'pre_production_audit',
      message: `请梳理当前设定和素材：${projectLabel}`,
      title: `前期准备梳理: ${projectLabel}`,
      newConversation: true,
      autoSend: true,
      projectId,
      clientInput: buildCommandFirstClientInput({
        message: [
          `请梳理当前项目「${projectLabel}」的前期准备。`,
          '读取当前 draft model / 已有 proposal draft 的 seed 与 snapshot 作为设定基准，再检查 asset_slots，输出可审阅草稿：',
          '1. 如果设定资料缺漏、重复、状态不清晰，创建或更新 setting_proposal；只修改 proposal.creative_references，proposal.asset_slots 必须为空。',
          '2. 如果素材需求缺漏、归属不清晰、优先级/状态/类型需要修正，创建或更新 asset_proposal；只修改 proposal.asset_slots，proposal.creative_references 必须为空。',
          '3. 本轮只做设定与素材需求提案；不处理图片/视频输出、媒体任务或候选 prompt。',
          '4. 已有 setting_proposal draft 时，优先使用 draft 的 metadata.seed.data 或 content.snapshot_base；不要用 live creative reference 查询覆盖 draft 基准。',
          '5. 如果查询工具返回 total_count > 0 但 count/returned = 0，说明当前筛选没有可用明细；应回到 draft seed/snapshot 或放宽筛选，不要据此判定“有资料但不能编辑”。',
          '6. 保留已确认信息，在 summary 或 impact_notes 中列出关键缺口和建议审阅顺序。',
        ].join('\n'),
        labels: ['pre-production', 'setting_proposal', 'asset_proposal', 'draft-review'],
        hints: {
          projectId,
          route: { pathname: ROUTES.project.preProduction },
          selection: { entityType: 'project', entityId: projectId, label: projectLabel },
        },
      }),
      timeoutMs: 240_000,
      renderMode: 'page',
    })
    toast.info('已打开前期准备梳理会话；AI 生成的草稿会回到审阅区')
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
      prepAuditLaunching={prepAuditLaunching}
      setWorkspaceView={setWorkspaceView}
      updateSlotMutationPending={updateSlotMutation.isPending}
      lockCandidatePending={lockCandidateMutation.isPending}
      rejectCandidatePending={rejectCandidateMutation.isPending}
      addCandidateMutationPending={addCandidateMutation.isPending}
      uploadCandidatePending={uploadCandidateMutation.isPending}
      attachLibraryCandidatePending={attachLibraryCandidateMutation.isPending}
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
      onLock={lockCandidate}
      onReject={rejectCandidate}
      onUploadCandidate={triggerUpload}
      onOpenResourceLibrary={openResourceLibraryPicker}
      onGenerateProposal={generateCandidate}
      onGenerateMedia={generateMediaCandidate}
      onOpenAssistant={openAssistantForSlot}
      onOrganizeCurrentPrep={organizeCurrentPrep}
      onOpenCanvas={() => selected && openCanvasMutation.mutate(selected)}
      onSelectSlot={(slotId) => {
        const row = rows.find((item) => item.slot.ID === slotId)
        setNewReferenceEditKey(null)
        setFilter({ reference_id: row?.slot.creative_reference_id ?? null, asset_slot_id: slotId })
      }}
      onSelectReference={(referenceId) => {
        setNewReferenceEditKey(null)
        setFilter({ reference_id: referenceId, asset_slot_id: null, selected: null })
      }}
    />
  )

  const reviewWorkspace = (
    <PreProductionReviewWorkspace
      projectId={projectId}
      settingDrafts={settingProposalDraftsQuery.data ?? []}
      settingDraftsLoading={settingProposalDraftsQuery.isLoading}
      drafts={assetProposalDraftsQuery.data ?? []}
      loading={assetProposalDraftsQuery.isLoading}
      creativeReferences={creativeReferences}
      assetSlots={visibleSlots}
      onApplied={async () => {
        await queryClient.invalidateQueries({ queryKey: ['pre-production-creative-references', projectId] })
        await queryClient.invalidateQueries({ queryKey: ['semantic-asset-slots-page', projectId] })
        await settingProposalDraftsQuery.refetch()
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
      <AssetResourceLibraryDialog
        open={resourceLibraryOpen}
        row={selected}
        resources={Array.isArray(resourceLibraryQuery.data) ? resourceLibraryQuery.data : resourceLibraryQuery.data?.items ?? []}
        selectedResource={selectedLibraryResource}
        search={resourceLibrarySearch}
        type={resourceLibraryType}
        page={resourceLibraryPage}
        pageCount={Math.max(1, Math.ceil((Array.isArray(resourceLibraryQuery.data) ? resourceLibraryQuery.data.length : resourceLibraryQuery.data?.total ?? 0) / 18))}
        total={Array.isArray(resourceLibraryQuery.data) ? resourceLibraryQuery.data.length : resourceLibraryQuery.data?.total ?? 0}
        isLoading={resourceLibraryQuery.isLoading || resourceLibraryQuery.isFetching}
        isSaving={attachLibraryCandidateMutation.isPending}
        onOpenChange={setResourceLibraryOpen}
        onSearch={(value) => {
          setResourceLibrarySearch(value)
          setResourceLibraryPage(1)
        }}
        onType={(value) => {
          setResourceLibraryType(value)
          setResourceLibraryPage(1)
          setSelectedLibraryResource(null)
        }}
        onPage={setResourceLibraryPage}
        onSelect={setSelectedLibraryResource}
        onClear={() => setSelectedLibraryResource(null)}
        onConfirm={attachSelectedLibraryResource}
      />
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
  prepAuditLaunching,
  setWorkspaceView,
  updateSlotMutationPending,
  lockCandidatePending,
  rejectCandidatePending,
  addCandidateMutationPending,
  uploadCandidatePending,
  attachLibraryCandidatePending,
  openCanvasPending,
  generateCandidatePending,
  uploading,
  generatingKind,
  onSaved,
  onDeleted,
  onReferenceSaved,
  onReferenceDeleted,
  onLock,
  onReject,
  onUploadCandidate,
  onOpenResourceLibrary,
  onGenerateProposal,
  onGenerateMedia,
  onOpenAssistant,
  onOrganizeCurrentPrep,
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
  prepAuditLaunching: boolean
  setWorkspaceView: (view: 'main' | 'review') => void
  updateSlotMutationPending: boolean
  lockCandidatePending: boolean
  rejectCandidatePending: boolean
  addCandidateMutationPending: boolean
  uploadCandidatePending: boolean
  attachLibraryCandidatePending: boolean
  openCanvasPending: boolean
  generateCandidatePending: boolean
  uploading: boolean
  generatingKind?: CandidateGenerationKind
  onSaved: (record: SemanticEntityRecord) => void
  onDeleted: () => void
  onReferenceSaved: (record: SemanticEntityRecord) => void
  onReferenceDeleted: () => void
  onLock: (candidate: AssetSlotCandidateRecord) => void
  onReject: (candidate: AssetSlotCandidateRecord) => void
  onUploadCandidate: () => void
  onOpenResourceLibrary: () => void
  onGenerateProposal: (kind: CandidateGenerationKind) => void
  onGenerateMedia: (kind: CandidateGenerationKind) => void
  onOpenAssistant: () => void
  onOrganizeCurrentPrep: () => void
  onOpenCanvas: () => void
  onSelectSlot: (slotId: number) => void
  onSelectReference: (referenceId: number) => void
}) {
  const clusterRows = selectedCluster?.rows ?? []
  const busy = updateSlotMutationPending || lockCandidatePending || rejectCandidatePending || addCandidateMutationPending || uploadCandidatePending || attachLibraryCandidatePending || openCanvasPending || generateCandidatePending
  const headerActionButtonClass = 'h-8 w-[132px] justify-center gap-1.5 text-xs'
  const creatingReference = Boolean(newReferenceEditKey)
  const [referenceEditorCollapsed, setReferenceEditorCollapsed] = useState(true)
  const [assetEditorCollapsed, setAssetEditorCollapsed] = useState(false)

  useEffect(() => {
    if (creatingReference) {
      setReferenceEditorCollapsed(false)
      setAssetEditorCollapsed(true)
      return
    }
    if (selected) {
      setReferenceEditorCollapsed(true)
      setAssetEditorCollapsed(false)
      return
    }
    setReferenceEditorCollapsed(true)
    setAssetEditorCollapsed(true)
  }, [creatingReference, selected?.slot.ID])

  function handleReferenceEditorCollapsedChange(collapsed: boolean) {
    setReferenceEditorCollapsed(collapsed)
    if (!collapsed) setAssetEditorCollapsed(true)
  }

  function handleAssetEditorCollapsedChange(collapsed: boolean) {
    setAssetEditorCollapsed(collapsed)
    if (!collapsed) setReferenceEditorCollapsed(true)
  }

  return (
    <div className="min-h-full overflow-y-auto bg-background p-4 xl:flex xl:h-full xl:min-h-[720px] xl:flex-col xl:overflow-hidden">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 xl:shrink-0">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <CompactMetric label="设定" value={referenceCount} />
          <CompactMetric label="素材" value={visibleSlotCount} />
          <CompactMetric label="缺少" value={missingCount} />
          <CompactMetric label="待选择" value={candidateCount} />
          <CompactMetric label="已选定" value={lockedCount} detail={`${waivedCount} 不需要`} />
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <Button size="sm" variant="outline" className={headerActionButtonClass} onClick={startCreateReference} disabled={!projectId}>
            <Sparkles size={14} />
            新建设定
          </Button>
          <Button size="sm" variant="outline" className={headerActionButtonClass} onClick={startCreate} loading={createSlotPending} disabled={!projectId || createSlotPending || creatingReference}>
            <Plus size={14} />
            新建素材
          </Button>
          <Button size="sm" variant="outline" className={headerActionButtonClass} onClick={onOrganizeCurrentPrep} loading={prepAuditLaunching} disabled={!projectId || prepAuditLaunching}>
            <Bot size={14} />
            梳理设定+素材
          </Button>
          <Button size="sm" variant="outline" className={headerActionButtonClass} onClick={() => setWorkspaceView('review')}>
            <GitBranch size={14} />
            审阅提案
          </Button>
        </div>
      </div>

      <main className="grid items-stretch gap-4 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 xl:min-h-0">
          <PreProductionAssetBoard
            clusters={clusters}
            selectedCluster={selectedCluster}
            selectedReference={selectedReference}
            rows={clusterRows}
            selected={selected}
            loading={loading}
            creatingReference={creatingReference}
            kindFilter={kindFilter}
            onKindChange={(value) => setFilter({ kind: value })}
            onSelectSlot={onSelectSlot}
            onSelectReference={onSelectReference}
          />
        </div>

        <aside className="min-w-0 space-y-3 pr-1 xl:min-h-0 xl:overflow-y-auto">
          {selected || newReferenceEditKey ? (
            <>
              <SemanticEntityInlineEditor
                projectId={projectId}
                config={referenceConfig}
                record={newReferenceEditKey ? null : selectedReference}
                defaults={newReferenceEditKey ? { kind: 'person', importance: 'main', status: 'draft', name: '未命名设定' } : undefined}
                queryKey={['pre-production-creative-references', projectId]}
                editKey={newReferenceEditKey}
                title="编辑设定"
                primaryFieldKeys={['kind', 'name', 'alias', 'description', 'content', 'importance', 'status']}
                collapsed={referenceEditorCollapsed}
                onCollapsedChange={handleReferenceEditorCollapsedChange}
                emptyTitle="当前素材未绑定设定"
                emptyDescription="这个素材还没有绑定到具体设定。可以在素材字段里补充归属。"
                onSaved={onReferenceSaved}
                onDeleted={onReferenceDeleted}
              />
              {selected ? (
                <>
                  <SemanticEntityInlineEditor
                    projectId={projectId}
                    config={slotConfig}
                    record={selected.slot}
                    queryKey={['semantic-asset-slots-page', projectId]}
                    editKey={selected.slot.ID === newSlotEditId ? newSlotEditId : null}
                    title="编辑素材"
                    description="关键字段：素材名称、类型、状态、优先级、用途说明和提示词线索。"
                    primaryFieldKeys={['name', 'kind', 'status', 'priority', 'description', 'prompt_hint', 'creative_reference_id', 'creative_reference_state_id']}
                    collapsed={assetEditorCollapsed}
                    onCollapsedChange={handleAssetEditorCollapsedChange}
                    onSaved={onSaved}
                    onDeleted={onDeleted}
                  />
                  <AssetSlotDetail
                    row={selected}
                    onLock={onLock}
                    onReject={onReject}
                    onUploadCandidate={onUploadCandidate}
                    onOpenResourceLibrary={onOpenResourceLibrary}
                    onGenerateCandidate={onGenerateProposal}
                    onGenerateMediaCandidate={onGenerateMedia}
                    onOpenAssistant={onOpenAssistant}
                    onOpenCanvas={onOpenCanvas}
                    busy={busy}
                    uploading={uploading}
                    generatingKind={generatingKind}
                  />
                </>
              ) : null}
            </>
          ) : (
            <SemanticEntityInlineEditor
              projectId={projectId}
              config={referenceConfig}
              record={selectedReference}
              queryKey={['pre-production-creative-references', projectId]}
              title="编辑设定"
              primaryFieldKeys={['kind', 'name', 'alias', 'description', 'content', 'importance', 'status']}
              collapsed={referenceEditorCollapsed}
              onCollapsedChange={handleReferenceEditorCollapsedChange}
              emptyTitle="选择或新建设定"
              emptyDescription="点击左侧设定卡片，或点击新建设定开始准备。"
              onSaved={onReferenceSaved}
              onDeleted={onReferenceDeleted}
            />
          )}
        </aside>
      </main>
    </div>
  )
}

function PreparationFlowBar({ creatingReference, hasReference, hasAsset }: { creatingReference: boolean; hasReference: boolean; hasAsset: boolean }) {
  const steps = [
    {
      key: 'reference',
      icon: Sparkles,
      title: '设定',
      detail: creatingReference ? '编辑中' : hasReference ? '已选择' : '未选择',
      active: creatingReference || hasReference,
      done: hasReference && !creatingReference,
    },
    {
      key: 'asset-pack',
      icon: PackageCheck,
      title: '素材包',
      detail: hasReference ? '已开放' : '待设定',
      active: hasReference,
      done: hasAsset,
    },
    {
      key: 'asset-detail',
      icon: Image,
      title: '素材详情',
      detail: hasAsset ? '已选择' : '待素材',
      active: hasAsset,
      done: false,
    },
  ]

  return (
    <section className="rounded-lg border border-border bg-card p-2">
      <div className="grid gap-2 md:grid-cols-3">
        {steps.map((step, index) => {
          const Icon = step.icon
          return (
            <div
              key={step.key}
              className={cn(
                'flex min-w-0 items-center gap-3 rounded-md border px-3 py-2',
                step.active ? 'border-primary/40 bg-primary/5' : 'border-border bg-background',
              )}
            >
              <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-md', step.done ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : step.active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
                {step.done ? <CheckIcon /> : <Icon size={15} />}
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-foreground">{index + 1}. {step.title}</p>
                <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{step.detail}</p>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function CheckIcon() {
  return <Check size={14} />
}

function PreProductionAssetBoard({
  clusters,
  selectedCluster,
  selectedReference,
  rows,
  selected,
  loading,
  creatingReference,
  kindFilter,
  onKindChange,
  onSelectSlot,
  onSelectReference,
}: {
  clusters: ReferenceAssetCluster[]
  selectedCluster: ReferenceAssetCluster | null
  selectedReference: CreativeReferenceRecord | null
  rows: AssetSlotViewModel[]
  selected: AssetSlotViewModel | null
  loading: boolean
  creatingReference: boolean
  kindFilter: AssetKind
  onKindChange: (value: AssetKind) => void
  onSelectSlot: (slotId: number) => void
  onSelectReference: (referenceId: number) => void
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card xl:flex xl:h-full xl:min-h-0 xl:flex-col">
      <div className="border-b border-border px-3 py-3 xl:shrink-0">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-foreground">设定和素材</p>
            <p className="mt-1 text-xs text-muted-foreground">左侧选择人物、地点、道具或风格；右侧维护它下面的素材。</p>
          </div>
          <Badge variant="outline" className="text-[10px]">{clusters.length + (creatingReference ? 1 : 0)} 个设定</Badge>
        </div>
      </div>
      <div className="grid min-h-[560px] lg:grid-cols-[260px_minmax(0,1fr)] xl:min-h-0 xl:flex-1">
        <aside className="border-b border-border bg-muted/20 p-3 lg:border-b-0 lg:border-r xl:flex xl:min-h-0 xl:flex-col">
          <div className="mb-2 flex items-center justify-between gap-2 xl:shrink-0">
            <p className="text-xs font-semibold text-foreground">设定</p>
            <Badge variant="outline" className="text-[10px]">{clusters.length}</Badge>
          </div>
          {loading ? <p className="py-8 text-center text-xs text-muted-foreground">加载中</p> : null}
          {!loading && clusters.length === 0 && !creatingReference ? <EmptyPreview title="暂无前期资料" description="先创建设定，再为它添加要准备的素材。" /> : null}
          <div className="space-y-2 pr-1 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
            {creatingReference ? <DraftReferenceClusterButton /> : null}
            {clusters.map((cluster) => (
              <ReferenceClusterButton
                key={cluster.reference?.ID ?? 'unbound'}
                cluster={cluster}
                selected={(selectedCluster?.reference?.ID ?? 0) === (cluster.reference?.ID ?? 0)}
                onSelect={() => cluster.reference?.ID ? onSelectReference(cluster.reference.ID) : cluster.rows[0] && onSelectSlot(cluster.rows[0].slot.ID)}
              />
            ))}
          </div>
        </aside>

        <div className="min-w-0 p-3 xl:flex xl:min-h-0 xl:flex-col">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3 xl:shrink-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <PackageCheck size={14} />
                <span>{referenceTitle(selectedReference)}</span>
                <span>·</span>
                <span>{rows.length} 个素材</span>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{referenceDescription(selectedReference)}</p>
            </div>
            <div className="flex flex-wrap justify-end gap-1">
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
          {!loading && rows.length === 0 ? <EmptyPreview title="没有关联素材" description="为这个设定创建图片、视频、音频或文本素材。" /> : null}
          <div className="pr-1 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
            <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
              {rows.map((row) => (
                <ReferenceAssetTile
                  key={row.slot.ID}
                  row={row}
                  selected={row.slot.ID === selected?.slot.ID}
                  onSelect={() => onSelectSlot(row.slot.ID)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function PreProductionReviewWorkspace({
  projectId,
  settingDrafts,
  settingDraftsLoading,
  drafts,
  loading,
  creativeReferences,
  assetSlots,
  onApplied,
  setWorkspaceView,
}: {
  projectId?: number
  settingDrafts: AgentDraft[]
  settingDraftsLoading: boolean
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
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <ProjectLayerProposalReviewPanel
            projectId={projectId}
            kind="setting_proposal"
            title="设定提案"
            description="只确认人物、地点、道具、产品、风格和世界规则；素材需求不在此提案内写入。"
            emptyMessage="暂无待审阅设定提案。"
            drafts={settingDrafts}
            loading={settingDraftsLoading}
            data={{ creativeReferences, assetSlots }}
            onApplied={onApplied}
          />
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
        </div>
        <div className="min-w-0 space-y-3">
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
        <span className="rounded bg-amber-500/10 px-1.5 py-1 text-amber-700 dark:text-amber-300">缺 {cluster.missing}</span>
        <span className="rounded bg-sky-500/10 px-1.5 py-1 text-sky-700 dark:text-sky-300">待选 {cluster.candidate}</span>
        <span className="rounded bg-emerald-500/10 px-1.5 py-1 text-emerald-700 dark:text-emerald-300">已选 {cluster.locked}</span>
      </div>
    </button>
  )
}

function DraftReferenceClusterButton() {
  return (
    <div className="w-full rounded-md border border-primary bg-primary/5 p-2 text-left ring-1 ring-primary/30">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-foreground">未命名设定</p>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">人物 · 编辑中</p>
        </div>
        <Badge variant="outline" className="text-[10px]">新建</Badge>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1 text-[10px]">
        <span className="rounded bg-amber-500/10 px-1.5 py-1 text-amber-700 dark:text-amber-300">缺 0</span>
        <span className="rounded bg-sky-500/10 px-1.5 py-1 text-sky-700 dark:text-sky-300">待选 0</span>
        <span className="rounded bg-emerald-500/10 px-1.5 py-1 text-emerald-700 dark:text-emerald-300">已选 0</span>
      </div>
    </div>
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
          <p className="mt-1 truncate text-[10px] text-muted-foreground">{assetKindLabel(row.kind)} · {row.candidates.length} 个可选素材</p>
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
          <Badge variant="outline" className="text-[10px]">{kindMeta.label} · {row.candidates.length} 个可选</Badge>
          {row.hasResource ? <Badge variant="outline" className="text-[10px]">资源</Badge> : null}
        </div>
      </div>
    </button>
  )
}

function AssetSlotDetail({
  row,
  onLock,
  onReject,
  onUploadCandidate,
  onOpenResourceLibrary,
  onGenerateMediaCandidate,
  busy,
  uploading,
}: {
  row: AssetSlotViewModel | null
  onLock: (candidate: AssetSlotCandidateRecord) => void
  onReject: (candidate: AssetSlotCandidateRecord) => void
  onUploadCandidate: () => void
  onOpenResourceLibrary: () => void
  onGenerateCandidate: (kind: CandidateGenerationKind) => void
  onGenerateMediaCandidate: (kind: CandidateGenerationKind) => void
  onOpenAssistant: () => void
  onOpenCanvas: () => void
  busy: boolean
  uploading: boolean
  generatingKind?: CandidateGenerationKind
}) {
  if (!row) {
    return (
      <section className="rounded-lg border border-border bg-card p-3">
        <EmptyPreview title="选择素材" description="查看可选素材，并选择或拒绝。" />
      </section>
    )
  }
  const slot = row.slot
  const preferredKind: CandidateGenerationKind = row.kind === 'video' ? 'video' : 'image'
  const canGenerate = row.kind === 'image' || row.kind === 'video'
  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground">可选素材</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{slot.name || `素材需求 #${slot.ID}`} · {slotScopeLabel(slot)}</p>
        </div>
        <SlotStatusBadge status={normalizeSlotStatus(slot.status)} />
      </div>

      <SlotThumb slot={row.lockedSlot ?? slot} fit="contain" className="aspect-[16/7] max-h-44 w-full rounded-md border border-border" />

      <div className="grid grid-cols-2 gap-2">
        <MiniStat label="类型" value={assetKindLabel(row.kind)} />
        <MiniStat label="状态" value={slotStatusLabel(normalizeSlotStatus(slot.status))} />
      </div>

      <section>
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-xs font-medium text-foreground">候选列表</p>
          <div className="flex flex-wrap justify-end gap-1.5">
            {canGenerate ? (
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => onGenerateMediaCandidate(preferredKind)}>
                {preferredKind === 'video' ? <Video size={13} /> : <Image size={13} />}
                生成候选
              </Button>
            ) : null}
            <Button size="sm" variant="outline" disabled={busy} onClick={onUploadCandidate}>
              <Upload size={13} />
              {uploading ? '上传中' : '上传'}
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={onOpenResourceLibrary}>
              <Database size={13} />
              资源库
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          {row.candidates.length === 0 ? <EmptyPreview title="暂无候选" description={canGenerate ? '可以生成候选、上传已有素材，或从资源库选择。' : '可以上传已有素材，或从资源库选择。'} /> : null}
          {row.candidates.map((candidate) => (
            <CandidateRow
              key={candidate.ID}
              candidate={candidate}
              selected={slot.locked_asset_slot_id === candidate.candidate_asset_slot_id || candidate.status === 'selected'}
              onConfirm={() => onLock(candidate)}
              onReject={() => onReject(candidate)}
              busy={busy}
            />
          ))}
        </div>
      </section>
    </section>
  )
}

function AssetResourceLibraryDialog({
  open,
  row,
  resources,
  selectedResource,
  search,
  type,
  page,
  pageCount,
  total,
  isLoading,
  isSaving,
  onOpenChange,
  onSearch,
  onType,
  onPage,
  onSelect,
  onClear,
  onConfirm,
}: {
  open: boolean
  row: AssetSlotViewModel | null
  resources: RawResource[]
  selectedResource: RawResource | null
  search: string
  type: ResourceTypeFilter
  page: number
  pageCount: number
  total: number
  isLoading: boolean
  isSaving: boolean
  onOpenChange: (open: boolean) => void
  onSearch: (value: string) => void
  onType: (value: ResourceTypeFilter) => void
  onPage: (value: number) => void
  onSelect: (resource: RawResource) => void
  onClear: () => void
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[86vh] w-[min(920px,92vw)] max-w-none flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>从资源库选择素材</DialogTitle>
          <DialogDescription>
            {row ? `${row.slot.name || `素材需求 #${row.slot.ID}`} · ${assetKindLabel(row.kind)}` : '选择一个资源加入当前素材候选列表。'}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1">
          <ResourceLibraryPicker
            resources={resources}
            selectedResource={selectedResource}
            search={search}
            type={type}
            page={page}
            pageCount={pageCount}
            total={total}
            isLoading={isLoading}
            onSearch={onSearch}
            onType={onType}
            onPage={onPage}
            onSelect={onSelect}
            onClear={onClear}
            className="flex h-[min(620px,64vh)] flex-col bg-background"
            listClassName="max-h-none flex-1"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>取消</Button>
          <Button onClick={onConfirm} disabled={!row || !selectedResource || isSaving} loading={isSaving}>
            加入候选
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CandidateRow({
  candidate,
  selected,
  onConfirm,
  onReject,
  busy,
}: {
  candidate: AssetSlotCandidateRecord
  selected: boolean
  onConfirm: () => void
  onReject: () => void
  busy: boolean
}) {
  const slot = candidate.candidate_asset_slot
  const canLock = selected || assetSlotHasLoadedResource(slot)
  return (
    <div className={cn('rounded-md border p-2', selected ? 'border-primary bg-primary/5' : 'border-border bg-background')}>
      <div className="flex gap-2">
        <SlotThumb slot={slot} fit="contain" className="h-14 w-20 rounded border border-border" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{slot?.name || `素材需求 #${candidate.candidate_asset_slot_id}`}</p>
          <p className="truncate text-xs text-muted-foreground">{candidate.note || sourceTypeLabel(candidate.source_type)}</p>
          {slot && !assetSlotHasLoadedResource(slot) ? (
            <p className="mt-0.5 truncate text-xs text-amber-600 dark:text-amber-300">候选资源不存在或未加载，暂不能锁定。</p>
          ) : null}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <Button size="sm" disabled={selected || busy || !candidate.candidate_asset_slot_id || !canLock} onClick={onConfirm}>
          {selected ? '已选定' : canLock ? '锁定此候选' : '缺资源'}
        </Button>
        <Button size="sm" variant="outline" disabled={selected || busy || !candidate.candidate_asset_slot_id} onClick={onReject}>
          拒绝
        </Button>
      </div>
    </div>
  )
}

function assetSlotHasLoadedResource(slot?: AssetSlotRecord) {
  return Boolean(slot?.resource?.ID)
}

function buildRows(slots: AssetSlotRecord[], candidates: AssetSlotCandidateRecord[], slotById: Map<number, AssetSlotRecord>): AssetSlotViewModel[] {
  return slots.map((slot) => {
    const kind = normalizeAssetKind(slot.kind)
    const slotCandidates = candidates
      .filter((candidate) => candidate.asset_slot_id === slot.ID && candidate.status !== 'rejected')
      .map((candidate) => ({ ...candidate, candidate_asset_slot: candidate.candidate_asset_slot ?? (candidate.candidate_asset_slot_id ? slotById.get(candidate.candidate_asset_slot_id) : undefined) }))
    const lockedSlot = slot.locked_asset_slot ?? (slot.locked_asset_slot_id ? slotById.get(slot.locked_asset_slot_id) : undefined)
    const searchText = [slot.name, assetKindLabel(kind), slot.kind, slot.status, slot.description, slot.prompt_hint, slotScopeLabel(slot), lockedSlot?.name].filter(Boolean).join(' ').toLowerCase()
    return { slot, candidates: slotCandidates, lockedSlot, searchText, kind, hasResource: Boolean(slot.resource_id || slot.resource) }
  })
}

function candidatePatchPayload(assetSlotId: number, candidate: AssetSlotCandidateRecord, status: 'selected' | 'rejected') {
  return {
    asset_slot_id: candidate.asset_slot_id ?? assetSlotId,
    candidate_asset_slot_id: candidate.candidate_asset_slot_id ?? 0,
    score: candidate.score ?? 0,
    status,
    ...(candidate.source_type ? { source_type: candidate.source_type } : {}),
    ...(candidate.source_id !== undefined ? { source_id: candidate.source_id } : {}),
    ...(candidate.note ? { note: candidate.note } : {}),
  }
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
    if (rowHasActiveAssetCandidates(row)) cluster.candidate += 1
    if (status === 'locked') cluster.locked += 1
    cluster.searchText = `${cluster.searchText} ${row.searchText}`
  }
  const output = [...clusters.values(), ...(unbound.rows.length > 0 ? [unbound] : [])]
  return output
    .filter((cluster) => cluster.rows.length > 0 || cluster.reference)
    .sort((a, b) => b.rows.length - a.rows.length)
}

function rowHasActiveAssetCandidates(row: AssetSlotViewModel) {
  return row.candidates.some((candidate) => candidate.status !== 'selected')
}

function isInternalCandidateSlot(slot: AssetSlotRecord) {
  return slot.owner_type === 'asset_slot'
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

function defaultResourceTypeForAssetKind(kind: Exclude<AssetKind, 'all'>): ResourceTypeFilter {
  if (kind === 'image' || kind === 'video' || kind === 'audio' || kind === 'text') return kind
  return 'all'
}

function SlotStatusBadge({ status }: { status: SlotStatus }) {
  const meta = {
    missing: { label: '缺少', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
    candidate: { label: '待选择', className: 'bg-sky-500/10 text-sky-700 dark:text-sky-300' },
    locked: { label: '已选定', className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
    waived: { label: '不需要', className: 'bg-zinc-500/10 text-zinc-700 dark:text-zinc-300' },
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
  segment: '编排段',
  scene_moment: '场景时刻',
  content_unit: '制作项',
  script: '剧本',
  script_version: '剧本版本',
  keyframe: '画面锚点',
  delivery_version: '交付版本',
  canvas: '画布',
  asset_slot: '素材需求',
}

function slotStatusLabel(status: SlotStatus): string {
  const labels: Record<SlotStatus, string> = {
    missing: '缺少',
    candidate: '待选择',
    locked: '已选定',
    waived: '不需要',
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
        <SlotThumb slot={slot} fit="contain" className="h-12 w-16 rounded border border-border" />
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
    const outputResourceIds = generated?.outputResourceIds?.length
      ? generated.outputResourceIds
      : generated?.outputResourceId
        ? [generated.outputResourceId]
        : []
    if (outputResourceIds.length > 0) {
      const results = await Promise.allSettled(outputResourceIds.map((outputResourceId) => (
        options.addCandidateMutation.mutateAsync({
          asset_slot_id: row.slot.ID,
          resource_id: outputResourceId,
          source_type: 'ai_agent',
          source_id: generated?.jobId ?? outputResourceId,
          status: 'candidate',
          score: 0.8,
          note: `AI 生成${kind === 'video' ? '视频' : '图片'}候选：resource #${outputResourceId}`,
        })
      )))
      const successCount = results.filter((result) => result.status === 'fulfilled').length
      const failedCount = results.length - successCount
      if (successCount > 0) {
        await options.queryClient.invalidateQueries({ queryKey: ['resources'] })
        invalidateAssetCandidateConsumers(options.queryClient, options.projectId)
      }
      if (failedCount > 0 && successCount > 0) {
        toast.info(`已加入 ${successCount} 个候选，${failedCount} 个失败`)
      } else if (failedCount > 0) {
        toast.error('生成完成，但候选写入失败')
      } else {
        toast.success(outputResourceIds.length === 1
          ? `已加入${kind === 'video' ? '视频' : '图片'}候选 #${outputResourceIds[0]}`
          : `已加入 ${outputResourceIds.length} 个${kind === 'video' ? '视频' : '图片'}候选`)
      }
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
        `请为当前 asset slot 真实生成一个或多个${kind === 'video' ? '视频' : '图片'}候选：${slotName}。`,
        `目标 assetSlotId=${row.slot.ID}，类型=${row.kind}。`,
        row.slot.description ? `素材说明：${row.slot.description}` : '',
        row.slot.prompt_hint ? `提示词线索：${row.slot.prompt_hint}` : '',
        '这不是素材方案草稿，请走 asset_candidate_generation / visual_generation，创建生成任务并监控结果；如果得到一个或多个 output_resource_id，请逐个加入候选集并逐项报告写入结果。',
      ].filter(Boolean).join('\n'),
      labels: ['pre-production', 'asset-candidate-generation', kind === 'video' ? 'video-generation' : 'image-generation'],
      hints: {
        projectId: options.projectId,
        route: { pathname: ROUTES.project.preProduction },
        selection: {
          entityType: 'asset_slot',
          entityId: row.slot.ID,
          label: slotName,
        },
      },
    }),
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
