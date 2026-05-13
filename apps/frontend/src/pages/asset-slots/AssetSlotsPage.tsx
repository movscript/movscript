import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bot, ChevronRight, CircleDashed, Database, FileAudio, FileText, Image, Lock, Package, PackageCheck, Plus, Sparkles, Video, Wand2, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { ContentWorkspaceLayout } from '@/components/layout/ContentWorkspaceLayout'
import { AuthedImage, AuthedVideo } from '@/components/shared/AuthedImage'
import { SemanticEntityInlineEditor } from '@/components/shared/SemanticEntityInlineEditor'
import { createSemanticEntity, listSemanticEntities, updateSemanticEntity, semanticEntityConfig, type SemanticEntityRecord } from '@/api/semanticEntities'
import { ContentFilterBar } from '@/pages/contents/components/ContentFilterBar'
import { readNumberParam, readStringParam, updateContentFilterParams, type ContentFilterKey } from '@/pages/contents/lib/contentFilters'
import { buildCommandFirstClientInput } from '@/lib/agentCommandInput'
import { buildEmptyAssetProposalDraftContent } from '@/lib/assetProposalDraft'
import { api } from '@/lib/api'
import { API_BASE_URL } from '@/lib/config'
import { openAgentPanelDraft, registerAgentPanelPageTool } from '@/lib/agentPanelBridge'
import { selectLatestDraftArtifact } from '@/lib/agentArtifacts'
import { localAgentClient } from '@/lib/localAgentClient'
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

interface AssetSlotViewModel {
  slot: AssetSlotRecord
  candidates: AssetSlotCandidateRecord[]
  lockedSlot?: AssetSlotRecord
  searchText: string
  kind: Exclude<AssetKind, 'all'>
  hasResource: boolean
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
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const assetAssistantCleanupRef = useRef<(() => void) | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const [newSlotEditId, setNewSlotEditId] = useState<number | null>(null)
  const selectedId = readNumberParam(searchParams, 'asset_slot_id') ?? readNumberParam(searchParams, 'selected')
  const query = readStringParam(searchParams, 'q')
  const kindParam = readStringParam(searchParams, 'kind')
  const kindFilter: AssetKind = kindParam ? normalizeAssetKind(kindParam) : 'all'
  const slotConfig = semanticEntityConfig('assetSlots')
  const candidateConfig = semanticEntityConfig('assetSlotCandidates')

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
  const resourceLibrary = useMemo(() => Array.isArray(resourcesData) ? resourcesData : (resourcesData?.items ?? []), [resourcesData])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((row) => {
      if (kindFilter !== 'all' && row.kind !== kindFilter) return false
      if (q && !row.searchText.includes(q)) return false
      return true
    })
  }, [kindFilter, query, rows])
  const selected = (selectedId ? rows.find((row) => row.slot.ID === selectedId) : null) ?? filtered[0] ?? rows[0] ?? null
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

  function startCreate() {
    createSlotMutation.mutate()
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

  function generateCandidate(kind: CandidateGenerationKind) {
    if (!selected) return
    generateCandidateMutation.mutate({ row: selected, kind })
  }

  function openAssistantForSlot() {
    if (!projectId || !selected) {
      toast.info('请先选择素材需求')
      return
    }
    generateCandidateMutation.mutate({ row: selected, kind: selected.kind === 'video' ? 'video' : 'image' })
  }

  return (
    <ContentWorkspaceLayout
      flow
      header={(
        <header className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            {!compact ? (
              <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Database size={14} />
                <span>{projectName ?? '当前项目'}</span>
                <ChevronRight size={13} />
                <span>内容区</span>
                <ChevronRight size={13} />
                <span>素材</span>
              </div>
            ) : null}
            <p className="text-sm font-semibold text-foreground">{t('pages.assets.semantic.title', '素材准备')}</p>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              素材区按卡片组织素材需求、候选和资源来源，并能按类型快速筛选、锁定和补齐。
            </p>
          </div>
          <Button size="sm" onClick={startCreate} loading={createSlotMutation.isPending} disabled={!projectId || createSlotMutation.isPending}>
            <Plus size={14} />
            {createSlotMutation.isPending ? '创建中' : '新建素材需求'}
          </Button>
        </header>
      )}
      overview={!compact ? (
        <section className="grid grid-cols-4 gap-3">
            <AssetMetric icon={PackageCheck} label="素材需求" value={visibleSlots.length} detail="内容区素材需求" />
            <AssetMetric icon={CircleDashed} label="待补齐" value={missingCount} detail="仍缺候选或锁定素材" />
            <AssetMetric icon={Sparkles} label="候选中" value={candidateCount} detail="可作为候选素材" />
            <AssetMetric icon={Lock} label="已锁定" value={lockedCount} detail={`${waivedCount} 个已豁免`} />
        </section>
      ) : null}
      filters={(
        <ContentFilterBar
          query={query}
          onQueryChange={(value) => {
            setFilter({ q: value })
          }}
          queryPlaceholder="搜索素材需求名称、说明或提示"
          filters={[{
            id: 'kind',
            label: '类型',
            value: kindFilter,
            onChange: (value) => setFilter({ kind: value }),
            options: assetKindOrder.map((kind) => ({
              value: kind,
              label: kind === 'all' ? '全部素材需求' : assetKindLabel(kind),
              count: kind === 'all' ? rows.length : rows.filter((row) => row.kind === kind).length,
            })),
          }]}
          chips={[
            selectedId ? { id: 'selected', label: `素材需求 #${selectedId}`, onRemove: () => setFilter({ asset_slot_id: null, selected: null }) } : null,
            kindFilter !== 'all' ? { id: 'kind', label: `分类 ${assetKindLabel(kindFilter)}`, onRemove: () => setFilter({ kind: null }) } : null,
          ].filter(Boolean) as Array<{ id: string; label: string; onRemove: () => void }>}
          resultCount={filtered.length}
          totalCount={rows.length}
        />
      )}
      list={(
        <section className="rounded-lg border border-border bg-card">
          <div className="p-4">
            {isLoading ? (
              <p className="py-12 text-center text-xs text-muted-foreground">{t('common.loadingShort', '加载中')}</p>
            ) : filtered.length === 0 ? (
              <EmptyPreview title="暂无素材需求" description="从内容、情景或设定资料页面创建素材需求，或手动新建一个候选素材需求。" />
            ) : (
              <div className="grid gap-2">
                {filtered.map((row) => (
                  <AssetSlotCard key={row.slot.ID} row={row} selected={row.slot.ID === selected?.slot.ID} onSelect={() => setFilter({ asset_slot_id: row.slot.ID })} />
                ))}
              </div>
            )}
          </div>
        </section>
      )}
      detail={(
        <div className="flex-1">
          <SemanticEntityInlineEditor
            projectId={projectId}
            config={slotConfig}
            record={selected?.slot}
            queryKey={['semantic-asset-slots-page', projectId]}
            editKey={selected?.slot.ID === newSlotEditId ? newSlotEditId : null}
            title="卡片内编辑素材需求"
            description="直接维护素材需求名称、类型、描述、提示词、优先级和归属字段。"
            hero={{
              icon: selected ? <SlotKindIcon kind={selected.kind} /> : <Image size={19} />,
              eyebrow: selected ? assetKindLabel(selected.kind) : '素材需求',
              title: selected?.slot.name || (selected ? `素材需求 #${selected.slot.ID}` : '请选择素材需求'),
              subtitle: selected ? slotScopeLabel(selected.slot) : '项目素材需求',
              summary: selected?.slot.description || selected?.slot.prompt_hint || '暂无素材需求描述。',
              accentClassName: selected ? assetKindMeta[selected.kind].accent : 'from-sky-500/15 via-cyan-500/10 to-teal-500/10',
              status: <SlotStatusBadge status={normalizeSlotStatus(selected?.slot.status)} />,
              stats: selected ? [
                { label: '类型', value: assetKindLabel(selected.kind) },
                { label: '候选', value: selected.candidates.length },
                { label: '资源', value: selected.hasResource ? '已关联' : '未关联' },
                { label: '锁定', value: selected.lockedSlot?.name || (selected.slot.locked_asset_slot_id ? `#${selected.slot.locked_asset_slot_id}` : '未锁定') },
              ] : [],
            }}
            onSaved={(record) => {
              setNewSlotEditId((id) => id === record.ID ? null : id)
              setFilter({ asset_slot_id: record.ID })
            }}
            onDeleted={() => {
              setNewSlotEditId(null)
              setFilter({ asset_slot_id: null, selected: null })
            }}
          />
        </div>
      )}
      preview={(
        <div>
          <AssetSlotDetail
            row={selected}
            candidateResources={candidateResources}
            onLock={lockToSlot}
            onAddCandidate={addCandidate}
            onGenerateCandidate={generateCandidate}
            onOpenAssistant={openAssistantForSlot}
            onOpenCanvas={() => selected && openCanvasMutation.mutate(selected)}
            busy={updateSlotMutation.isPending || addCandidateMutation.isPending || openCanvasMutation.isPending || generateCandidateMutation.isPending}
            generatingKind={generateCandidateMutation.variables?.kind}
          />
        </div>
      )}
      upstream={<div />}
      downstream={<div />}
      bottom={(
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-4">
          <AssetInfoPanel title="归属对象" icon={Database}>
            <AssetInfoRow label="范围" value={selected ? slotScopeLabel(selected.slot) : '未选择素材需求'} />
            <AssetInfoRow label="设定资料" value={selected?.slot.creative_reference_id ? `设定资料 #${selected.slot.creative_reference_id}` : '未绑定设定资料'} />
          </AssetInfoPanel>
          <AssetInfoPanel title="候选素材" icon={Sparkles}>
            {selected?.candidates.length ? selected.candidates.slice(0, 4).map((candidate) => (
              <CandidateInfoCard key={candidate.ID} candidate={candidate} />
            )) : <EmptyPreview title="暂无候选" description="当前素材需求还没有候选素材。" />}
          </AssetInfoPanel>
          <AssetInfoPanel title="锁定素材" icon={Lock}>
            <AssetInfoRow label="锁定状态" value={selected?.lockedSlot?.name || (selected?.slot.locked_asset_slot_id ? `#${selected.slot.locked_asset_slot_id}` : '未锁定')} />
            <AssetInfoRow label="状态" value={selected ? slotStatusLabel(normalizeSlotStatus(selected.slot.status)) : '未选择'} />
          </AssetInfoPanel>
          <AssetInfoPanel title="资源状态" icon={PackageCheck}>
            <AssetInfoRow label="资源文件" value={selected?.hasResource ? '已关联' : '未关联'} />
            <AssetInfoRow label="素材类型" value={selected ? assetKindLabel(selected.kind) : '未选择'} />
          </AssetInfoPanel>
        </div>
      )}
      />
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
  onGenerateCandidate,
  onOpenAssistant,
  onOpenCanvas,
  busy,
  generatingKind,
}: {
  row: AssetSlotViewModel | null
  candidateResources: RawResource[]
  onLock: (candidateSlotID: number) => void
  onAddCandidate: (resourceID: number) => void
  onGenerateCandidate: (kind: CandidateGenerationKind) => void
  onOpenAssistant: () => void
  onOpenCanvas: () => void
  busy: boolean
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
                  {busy && generatingKind === preferredKind ? '准备中' : `${preferredKind === 'video' ? '视频' : '图片'}提案`}
                </Button>
                {preferredKind === 'image' ? (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => onGenerateCandidate('video')}>
                    <Video size={13} />
                    视频提案
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => onGenerateCandidate('image')}>
                    <Image size={13} />
                    图片提案
                  </Button>
                )}
              </>
            ) : null}
            <Button size="sm" variant="outline" disabled={busy} onClick={onOpenAssistant}>
              <Bot size={13} />
              AI 助手
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
