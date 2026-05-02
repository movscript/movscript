import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Database,
  FileAudio,
  FileText,
  Image,
  Layers3,
  Lock,
  PackageCheck,
  Pencil,
  Plus,
  Sparkles,
  Upload,
  Video,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { CreateDialog } from '@/components/shared/CreateDialog'
import { AssetCreateForm } from '@/components/shared/EntityCreateForms'
import { AuthedImage, AuthedVideo } from '@/components/shared/AuthedImage'
import { ContentFilterBar } from '@/pages/contents/components/ContentFilterBar'
import { readNumberParam, readStringParam, updateContentFilterParams, type ContentFilterKey } from '@/pages/contents/lib/contentFilters'
import { API_BASE_URL } from '@/lib/config'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/store/projectStore'
import type { Asset, PaginatedResponse, RawResource, Setting } from '@/types'
import { Badge, Button } from '@movscript/ui'
import { createV2Entity, listV2Entities, updateV2Entity, v2EntityConfig, type V2EntityRecord } from '@/api/v2Entities'
import { V2EntityCrudDialog } from '@/components/shared/V2EntityCrudDialog'

const PAGE_SIZE = 18

type SlotStatus = 'missing' | 'candidate' | 'locked' | 'waived'

interface AssetSlot {
  dbId?: number
  id: string
  title: string
  scope: string
  kind: 'image' | 'video' | 'audio' | 'text' | 'brand_pack' | 'reference'
  status: SlotStatus
  description?: string
  promptHint?: string
  lockedAssetId?: number
}

type AssetSlotRecord = V2EntityRecord & {
  owner_type?: string
  owner_id?: number
  creative_reference_id?: number
  kind?: string
  name?: string
  description?: string
  slot_key?: string
  prompt_hint?: string
  priority?: string
  status?: string
  locked_asset_id?: number
}

type SegmentRecord = V2EntityRecord & {
  title?: string
  summary?: string
  content?: string
}

type SceneMomentRecord = V2EntityRecord & {
  segment_id?: number
  title?: string
  description?: string
  action_text?: string
  location_text?: string
  time_text?: string
}

type ContentUnitRecord = V2EntityRecord & {
  segment_id?: number
  scene_moment_id?: number
  title?: string
  description?: string
  prompt?: string
}

type CreativeReferenceRecord = V2EntityRecord & {
  name?: string
  kind?: string
  description?: string
}

type AssetSlotCandidateRecord = V2EntityRecord & {
  asset_slot_id?: number
  asset_id?: number
  source_type?: string
  source_id?: number
  score?: number
  status?: string
  note?: string
  asset?: Asset
}

interface AssetSlotViewModel {
  slot: AssetSlotRecord
  segment?: SegmentRecord
  sceneMoment?: SceneMomentRecord
  contentUnit?: ContentUnitRecord
  reference?: CreativeReferenceRecord
  candidates: AssetSlotCandidateRecord[]
  lockedAsset?: Asset
  appearances: Array<{ label: string; value: string }>
  searchText: string
}

const demoSlots: AssetSlot[] = [
  { id: 'slot-main-state', title: '主角当前状态参考', scope: '来自情节和资料约束', kind: 'image', status: 'missing' },
  { id: 'slot-location', title: '地点环境与光线', scope: '用于关键帧和内容生成', kind: 'video', status: 'candidate' },
  { id: 'slot-prop-detail', title: '道具特写素材', scope: '被资料使用，传递到内容', kind: 'image', status: 'locked' },
]

function mediaSrc(resource?: RawResource): string | undefined {
  if (!resource?.url) return undefined
  return resource.url.startsWith('http') ? resource.url : `${API_BASE_URL}${resource.url}`
}

function assetPreview(asset?: Asset): { src?: string; video: boolean } {
  if (!asset) return { video: false }
  const resource = asset.resource ?? asset.views?.[0]?.resource
  const src = mediaSrc(resource) ?? asset.views?.[0]?.image_url
  const video = resource?.type === 'video' || Boolean(resource?.mime_type?.startsWith('video/'))
  return { src, video }
}

function AssetThumb({ asset, className }: { asset?: Asset; className?: string }) {
  const preview = assetPreview(asset)
  if (!preview.src) {
    return (
      <div className={cn('flex items-center justify-center bg-muted text-muted-foreground', className)}>
        <Image size={18} />
      </div>
    )
  }
  return preview.video
    ? <AuthedVideo src={preview.src} className={cn('object-cover', className)} muted playsInline />
    : <AuthedImage src={preview.src} alt={asset?.name ?? ''} className={cn('object-cover', className)} />
}

export function AssetGenerationWorkspace() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const projectId = useProjectStore((s) => s.current?.ID)
  const [selectedId, setSelectedId] = useState(demoSlots[0].id)
  const [showUploadCandidate, setShowUploadCandidate] = useState(false)
  const [slotDialogOpen, setSlotDialogOpen] = useState(false)
  const [slotDialogMode, setSlotDialogMode] = useState<'create' | 'edit'>('create')
  const slotConfig = v2EntityConfig('assetSlots')

  const { data: slotRecords = [], isLoading: slotsLoading } = useQuery({
    queryKey: ['v2-asset-slots-workspace', projectId, 'asset-slots'],
    queryFn: () => listV2Entities(projectId!, slotConfig) as Promise<AssetSlotRecord[]>,
    enabled: !!projectId,
  })

  const { data: assetData } = useQuery<PaginatedResponse<Asset>>({
    queryKey: ['assets', projectId, 'slot-candidates'],
    queryFn: () => api.get(`/projects/${projectId}/assets`, { params: { page: 1, page_size: 12 } }).then((r) => r.data),
    enabled: !!projectId,
  })

  const updateSlotMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Record<string, string | number | boolean | null> }) => updateV2Entity(projectId!, slotConfig, id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['v2-asset-slots-workspace', projectId] }),
  })

  const slots = useMemo(() => {
    if (slotRecords.length === 0) return demoSlots
    return slotRecords.map((slot) => ({
      dbId: slot.ID,
      id: String(slot.ID),
      title: slot.name || `素材位 #${slot.ID}`,
      scope: slot.owner_type && slot.owner_id ? `${slot.owner_type} #${slot.owner_id}` : slot.creative_reference_id ? `资料 #${slot.creative_reference_id}` : '项目素材位',
      kind: normalizeSlotKind(slot.kind),
      status: normalizeSlotStatus(slot.status),
      description: slot.description,
      promptHint: slot.prompt_hint,
      lockedAssetId: slot.locked_asset_id,
    }))
  }, [slotRecords])
  const selected = slots.find((slot) => slot.id === selectedId) ?? slots[0] ?? null
  const selectedRecord = selected?.dbId ? slotRecords.find((slot) => slot.ID === selected.dbId) : null
  const assets = assetData?.items ?? []
  const lockedAsset = selected?.lockedAssetId ? assets.find((asset) => asset.ID === selected.lockedAssetId) : undefined

  function startCreateSlot() {
    setSlotDialogMode('create')
    setSlotDialogOpen(true)
  }

  function startEditSlot() {
    if (!selectedRecord) return
    setSlotDialogMode('edit')
    setSlotDialogOpen(true)
  }

  function updateSlotStatus(status: SlotStatus, lockedAssetId?: number) {
    if (!selected?.dbId) return
    updateSlotMutation.mutate({
      id: selected.dbId,
      payload: {
        ...selectedRecord,
        status,
        locked_asset_id: lockedAssetId ?? selected.lockedAssetId ?? null,
      } as Record<string, string | number | boolean | null>,
    })
  }

  return (
    <div className="grid h-full min-w-0 grid-cols-[340px_minmax(0,1fr)] overflow-hidden bg-background">
      <aside className="min-h-0 border-r border-border bg-card">
        <div className="border-b border-border p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">{t('pages.assets.v2.title', '素材准备')}</p>
              <p className="mt-1 text-xs text-muted-foreground">按资料、情节和内容单元补齐素材位。</p>
            </div>
            <Button size="icon-sm" onClick={startCreateSlot} title="新建素材位">
              <Plus size={14} />
            </Button>
          </div>
        </div>
        <div className="space-y-2 p-3">
          {slotsLoading ? <p className="py-8 text-center text-xs text-muted-foreground">加载中</p> : null}
          {slots.map((slot) => (
            <button
              key={slot.id}
              type="button"
              onClick={() => setSelectedId(slot.id)}
              className={cn('w-full rounded-md border bg-background p-3 text-left', selected.id === slot.id ? 'border-primary ring-1 ring-primary/40' : 'border-border hover:border-primary/40')}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-foreground">{slot.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{slot.scope}</p>
                </div>
                <SlotStatusBadge status={slot.status} />
              </div>
            </button>
          ))}
          {!slotsLoading && slots.length === 0 ? (
            <EmptyPreview title="暂无素材位" description="点击右上角加号创建素材位。" />
          ) : null}
        </div>
      </aside>
      <main className="min-h-0 overflow-auto p-5">
        <section className="rounded-lg border border-border bg-card">
          <div className="flex items-start justify-between gap-4 border-b border-border p-4">
            <div>
              <p className="text-lg font-semibold text-foreground">{selected?.title ?? '未选择素材位'}</p>
              <p className="mt-1 text-sm text-muted-foreground">{selected?.description || selected?.scope}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={startEditSlot} disabled={!selectedRecord}>
                <Pencil size={14} />
                编辑素材位
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowUploadCandidate(true)}>
                <Upload size={14} />
                上传候选
              </Button>
              <Button size="sm" onClick={() => updateSlotStatus('candidate')} disabled={!selected?.dbId || updateSlotMutation.isPending}>
                <Sparkles size={14} />
                请求候选
              </Button>
            </div>
          </div>
          <div className="grid gap-3 p-4 md:grid-cols-3">
            <ReadinessItem complete={Boolean(selected && selected.status !== 'missing')} label="素材位已识别" />
            <ReadinessItem complete={Boolean(selected && (selected.status === 'candidate' || selected.status === 'locked'))} label="已有候选素材" />
            <ReadinessItem complete={selected?.status === 'locked'} label="可传递到内容生产" />
          </div>
        </section>

        <section className="mt-4 rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border p-4">
            <div>
              <p className="text-sm font-semibold text-foreground">候选素材</p>
              <p className="mt-1 text-xs text-muted-foreground">从素材库中选择一个素材锁定到当前素材位。</p>
            </div>
            {selected?.dbId ? (
              <Button variant="outline" size="sm" onClick={() => updateSlotStatus('waived')} disabled={updateSlotMutation.isPending}>
                豁免
              </Button>
            ) : null}
          </div>
          <div className="grid gap-3 p-4 md:grid-cols-3">
            {assets.map((asset) => (
              <button
                key={asset.ID}
                type="button"
                onClick={() => updateSlotStatus('locked', asset.ID)}
                className={cn('overflow-hidden rounded-md border bg-background text-left', selected?.lockedAssetId === asset.ID ? 'border-primary ring-1 ring-primary/40' : 'border-border hover:border-primary/40')}
                disabled={!selected?.dbId}
              >
                <AssetThumb asset={asset} className="aspect-[4/3] w-full" />
                <div className="p-2">
                  <p className="truncate text-xs font-medium text-foreground">{asset.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{asset.type}</p>
                </div>
              </button>
            ))}
            {assets.length === 0 ? <EmptyPreview title="暂无可选素材" description="先上传素材，再回到这里锁定到素材位。" /> : null}
          </div>
        </section>

        {lockedAsset ? (
          <section className="mt-4 rounded-lg border border-border bg-card p-4">
            <p className="text-sm font-semibold text-foreground">已锁定素材</p>
            <div className="mt-3 max-w-xs">
              <AssetCard asset={lockedAsset} />
            </div>
          </section>
        ) : null}

        <V2CandidateUploadDialog
          open={showUploadCandidate}
          title="上传候选素材"
          projectId={projectId}
          onClose={() => setShowUploadCandidate(false)}
          onCreated={(asset) => {
            setShowUploadCandidate(false)
            if (selected?.dbId) updateSlotStatus('locked', asset.ID)
          }}
        />
        <V2EntityCrudDialog
          open={slotDialogOpen}
          mode={slotDialogMode}
          projectId={projectId}
          config={slotConfig}
          record={slotDialogMode === 'edit' ? selectedRecord : null}
          defaults={{ kind: 'image', status: 'missing', priority: 'normal' }}
          queryKey={['v2-asset-slots-workspace', projectId]}
          onOpenChange={setSlotDialogOpen}
          onSaved={(record) => setSelectedId(String(record.ID))}
          onDeleted={() => setSelectedId('')}
        />
      </main>
    </div>
  )
}

export default function AssetsPage() {
  const projectId = useProjectStore((s) => s.current?.ID)
  const projectName = useProjectStore((s) => s.current?.name)
  const [searchParams, setSearchParams] = useSearchParams()
  const query = readStringParam(searchParams, 'q')
  const statusFilter = readStringParam(searchParams, 'status', 'all')
  const kindFilter = readStringParam(searchParams, 'kind', 'all')
  const selectedId = readNumberParam(searchParams, 'asset_slot_id') ?? readNumberParam(searchParams, 'selected')
  const segmentFilterId = readNumberParam(searchParams, 'segment_id')
  const sceneMomentFilterId = readNumberParam(searchParams, 'scene_moment_id')
  const contentUnitFilterId = readNumberParam(searchParams, 'content_unit_id')
  const referenceFilterId = readNumberParam(searchParams, 'reference_id')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [showUploadCandidate, setShowUploadCandidate] = useState(false)
  const slotConfig = v2EntityConfig('assetSlots')
  const candidateConfig = v2EntityConfig('assetSlotCandidates')

  const slotsQuery = useQuery({
    queryKey: ['v2-asset-slots-page', projectId, 'asset-slots'],
    queryFn: () => listV2Entities(projectId!, slotConfig) as Promise<AssetSlotRecord[]>,
    enabled: !!projectId,
  })
  const segmentsQuery = useQuery({
    queryKey: ['v2-asset-slots-page', projectId, 'segments'],
    queryFn: () => listV2Entities(projectId!, v2EntityConfig('segments')) as Promise<SegmentRecord[]>,
    enabled: !!projectId,
  })
  const sceneMomentsQuery = useQuery({
    queryKey: ['v2-asset-slots-page', projectId, 'scene-moments'],
    queryFn: () => listV2Entities(projectId!, v2EntityConfig('sceneMoments')) as Promise<SceneMomentRecord[]>,
    enabled: !!projectId,
  })
  const contentUnitsQuery = useQuery({
    queryKey: ['v2-asset-slots-page', projectId, 'content-units'],
    queryFn: () => listV2Entities(projectId!, v2EntityConfig('contentUnits')) as Promise<ContentUnitRecord[]>,
    enabled: !!projectId,
  })
  const referencesQuery = useQuery({
    queryKey: ['v2-asset-slots-page', projectId, 'creative-references'],
    queryFn: () => listV2Entities(projectId!, v2EntityConfig('creativeReferences')) as Promise<CreativeReferenceRecord[]>,
    enabled: !!projectId,
  })
  const candidatesQuery = useQuery({
    queryKey: ['v2-asset-slots-page', projectId, 'asset-slot-candidates'],
    queryFn: () => listV2Entities(projectId!, candidateConfig) as Promise<AssetSlotCandidateRecord[]>,
    enabled: !!projectId,
  })
  const { data: assetData } = useQuery<PaginatedResponse<Asset>>({
    queryKey: ['assets', projectId, 'asset-page-candidate-library'],
    queryFn: () => api.get(`/projects/${projectId}/assets`, { params: { page: 1, page_size: 18 } }).then((r) => r.data),
    enabled: !!projectId,
  })

  const queryClient = useQueryClient()
  const updateSlotMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Record<string, string | number | boolean | null> }) => updateV2Entity(projectId!, slotConfig, id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['v2-asset-slots-page', projectId] }),
  })
  const updateCandidateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Record<string, string | number | boolean | null> }) => updateV2Entity(projectId!, candidateConfig, id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['v2-asset-slots-page', projectId, 'asset-slot-candidates'] }),
  })
  const createCandidateMutation = useMutation({
    mutationFn: (payload: Record<string, string | number | boolean | null>) => createV2Entity(projectId!, candidateConfig, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['v2-asset-slots-page', projectId, 'asset-slot-candidates'] }),
  })

  const slots = slotsQuery.data ?? []
  const segments = segmentsQuery.data ?? []
  const sceneMoments = sceneMomentsQuery.data ?? []
  const contentUnits = contentUnitsQuery.data ?? []
  const references = referencesQuery.data ?? []
  const candidates = candidatesQuery.data ?? []
  const assets = assetData?.items ?? []
  const segmentById = useMemo(() => new Map(segments.map((item) => [item.ID, item])), [segments])
  const sceneMomentById = useMemo(() => new Map(sceneMoments.map((item) => [item.ID, item])), [sceneMoments])
  const contentUnitById = useMemo(() => new Map(contentUnits.map((item) => [item.ID, item])), [contentUnits])
  const referenceById = useMemo(() => new Map(references.map((item) => [item.ID, item])), [references])
  const assetById = useMemo(() => new Map(assets.map((item) => [item.ID, item])), [assets])
  const candidatesBySlotId = useMemo(() => {
    const grouped = new Map<number, AssetSlotCandidateRecord[]>()
    for (const candidate of candidates) {
      if (!candidate.asset_slot_id) continue
      const list = grouped.get(candidate.asset_slot_id) ?? []
      list.push({
        ...candidate,
        asset: candidate.asset ?? (candidate.asset_id ? assetById.get(candidate.asset_id) : undefined),
      })
      grouped.set(candidate.asset_slot_id, list)
    }
    for (const list of grouped.values()) {
      list.sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0))
    }
    return grouped
  }, [assetById, candidates])

  const slotViewModels = useMemo(() => slots.map((slot) => buildAssetSlotViewModel(slot, {
    segmentById,
    sceneMomentById,
    contentUnitById,
    referenceById,
    candidatesBySlotId,
    assetById,
  })), [assetById, candidatesBySlotId, contentUnitById, referenceById, sceneMomentById, segmentById, slots])

  const filteredSlots = useMemo(() => {
    const q = query.trim().toLowerCase()
    return slotViewModels.filter((item) => {
      const slot = item.slot
      const status = String(slot.status ?? 'missing')
      const kind = String(slot.kind ?? 'image')
      if (statusFilter !== 'all' && status !== statusFilter) return false
      if (kindFilter !== 'all' && kind !== kindFilter) return false
      if (segmentFilterId && item.segment?.ID !== segmentFilterId) return false
      if (sceneMomentFilterId && item.sceneMoment?.ID !== sceneMomentFilterId) return false
      if (contentUnitFilterId && item.contentUnit?.ID !== contentUnitFilterId) return false
      if (referenceFilterId && item.reference?.ID !== referenceFilterId) return false
      if (!q) return true
      return item.searchText.includes(q)
    })
  }, [contentUnitFilterId, kindFilter, query, referenceFilterId, sceneMomentFilterId, segmentFilterId, slotViewModels, statusFilter])

  const selected = useMemo(() => {
    if (selectedId) {
      const matched = slotViewModels.find((item) => item.slot.ID === selectedId)
      if (matched) return matched
    }
    return filteredSlots[0] ?? slotViewModels[0] ?? null
  }, [filteredSlots, selectedId, slotViewModels])

  const missingCount = slots.filter((slot) => normalizeSlotStatus(slot.status) === 'missing').length
  const candidateCount = slots.filter((slot) => normalizeSlotStatus(slot.status) === 'candidate').length
  const lockedCount = slots.filter((slot) => normalizeSlotStatus(slot.status) === 'locked').length
  const waivedCount = slots.filter((slot) => normalizeSlotStatus(slot.status) === 'waived').length
  const kindOptions = ['all', 'image', 'video', 'audio', 'text', 'brand_pack', 'reference']
  const isLoading = slotsQuery.isLoading || segmentsQuery.isLoading || sceneMomentsQuery.isLoading || contentUnitsQuery.isLoading || referencesQuery.isLoading || candidatesQuery.isLoading

  function setFilter(updates: Partial<Record<ContentFilterKey, string | number | null | undefined>>) {
    setSearchParams(updateContentFilterParams(searchParams, updates), { replace: true })
  }

  function startCreateSlot() {
    setDialogMode('create')
    setDialogOpen(true)
  }

  function startEditSlot() {
    if (!selected) return
    setDialogMode('edit')
    setDialogOpen(true)
  }

  function confirmCandidate(candidate: AssetSlotCandidateRecord) {
    if (!selected || !candidate.asset_id) return
    updateSlotMutation.mutate({
      id: selected.slot.ID,
      payload: {
        status: 'locked',
        locked_asset_id: candidate.asset_id,
      },
    })
    updateCandidateMutation.mutate({
      id: candidate.ID,
      payload: {
        asset_slot_id: candidate.asset_slot_id ?? selected.slot.ID,
        asset_id: candidate.asset_id,
        source_type: candidate.source_type ?? 'manual',
        source_id: candidate.source_id ?? null,
        score: Number(candidate.score ?? 0),
        status: 'selected',
        note: candidate.note ?? '',
      },
    })
  }

  function addCandidate(asset: Asset) {
    if (!selected) return
    const existing = selected.candidates.find((candidate) => candidate.asset_id === asset.ID)
    if (existing) {
      confirmCandidate(existing)
      return
    }
    createCandidateMutation.mutate({
      asset_slot_id: selected.slot.ID,
      asset_id: asset.ID,
      source_type: 'manual',
      score: 0,
      status: 'candidate',
      note: '',
    }, {
      onSuccess: (created) => {
        confirmCandidate({
          ...(created as AssetSlotCandidateRecord),
          asset_slot_id: selected.slot.ID,
          asset_id: asset.ID,
          asset,
          status: 'candidate',
        })
      },
    })
  }

  return (
    <div className="h-full overflow-auto bg-background">
      <div className="min-w-[1120px] space-y-5 p-5">
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Database size={14} />
              <span>{projectName ?? '当前项目'}</span>
              <span>/</span>
              <span>v2 素材</span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal text-foreground">素材</h1>
            <p className="mt-1 max-w-4xl text-sm leading-relaxed text-muted-foreground">
              这里管理内容区的素材位列表。每个素材位描述生产需要什么素材，候选上传、生成和锁定放在素材准备工作台完成。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2" onClick={startEditSlot} disabled={!selected}>
              <Pencil size={15} />
              编辑素材
            </Button>
            <Button className="gap-2" onClick={startCreateSlot}>
              <Plus size={15} />
              新建素材
            </Button>
          </div>
        </header>

        <section className="grid grid-cols-4 gap-3">
          <AssetMetric icon={PackageCheck} label="素材位" value={slots.length} detail="内容区素材需求" />
          <AssetMetric icon={CircleDashed} label="待补齐" value={missingCount} detail="仍缺候选或锁定素材" />
          <AssetMetric icon={Sparkles} label="候选中" value={candidateCount} detail="已有候选待选择" />
          <AssetMetric icon={Layers3} label="引用位置" value={countReferencedSlots(slotViewModels)} detail="已挂到片段、情节、内容或资料" />
        </section>

        <section className="grid grid-cols-[minmax(0,1fr)_360px] gap-4">
          <main className="min-w-0 rounded-lg border border-border bg-card">
            <div className="border-b border-border p-4">
              <ContentFilterBar
                query={query}
                onQueryChange={(value) => setFilter({ q: value })}
                queryPlaceholder="搜索素材、片段、情节、内容、资料或生成提示"
                filters={[
                  {
                    id: 'status',
                    label: '状态',
                    value: statusFilter,
                    onChange: (value) => setFilter({ status: value }),
                    options: [
                      { value: 'all', label: '全部', count: slots.length },
                      { value: 'missing', label: '待补齐', count: missingCount },
                      { value: 'candidate', label: '候选中', count: candidateCount },
                      { value: 'locked', label: '已锁定', count: lockedCount },
                      { value: 'waived', label: '已豁免', count: waivedCount },
                    ],
                  },
                  {
                    id: 'kind',
                    label: '类型',
                    value: kindFilter,
                    onChange: (value) => setFilter({ kind: value }),
                    options: kindOptions.map((kind) => ({
                      value: kind,
                      label: kind === 'all' ? '全部类型' : slotKindLabel(kind),
                      count: kind === 'all' ? slots.length : slots.filter((slot) => slot.kind === kind).length,
                    })),
                  },
                ]}
                chips={[
                  segmentFilterId ? { id: 'segment', label: `片段 #${segmentFilterId}`, onRemove: () => setFilter({ segment_id: null }) } : null,
                  sceneMomentFilterId ? { id: 'scene', label: `情节 #${sceneMomentFilterId}`, onRemove: () => setFilter({ scene_moment_id: null }) } : null,
                  contentUnitFilterId ? { id: 'content', label: `内容 #${contentUnitFilterId}`, onRemove: () => setFilter({ content_unit_id: null }) } : null,
                  referenceFilterId ? { id: 'reference', label: `资料 #${referenceFilterId}`, onRemove: () => setFilter({ reference_id: null }) } : null,
                  selectedId ? { id: 'selected', label: `素材 #${selectedId}`, onRemove: () => setFilter({ asset_slot_id: null, selected: null }) } : null,
                ].filter(Boolean) as Array<{ id: string; label: string; onRemove: () => void }>}
                resultCount={filteredSlots.length}
                totalCount={slots.length}
              />
            </div>

            {isLoading ? (
              <EmptyPreview title="正在加载素材" description="读取内容区素材位列表。" />
            ) : filteredSlots.length === 0 ? (
              <EmptyPreview title="暂无素材" description="点击右上角新建素材，添加当前内容生产需要的素材位。" />
            ) : (
              <div className="grid grid-cols-3 gap-3 p-4">
                {filteredSlots.map((slot) => (
                  <AssetSlotCard
                    key={slot.slot.ID}
                    item={slot}
                    selected={selected?.slot.ID === slot.slot.ID}
                    onSelect={() => setFilter({ asset_slot_id: slot.slot.ID })}
                  />
                ))}
              </div>
            )}
          </main>

          <aside className="space-y-4">
            <AssetSlotDetail
              item={selected}
              assets={assets}
              confirming={updateSlotMutation.isPending || updateCandidateMutation.isPending || createCandidateMutation.isPending}
              onEdit={startEditSlot}
              onConfirmCandidate={confirmCandidate}
              onAddCandidate={addCandidate}
              onUploadCandidate={() => setShowUploadCandidate(true)}
            />
          </aside>
        </section>
      </div>

      <V2EntityCrudDialog
        open={dialogOpen}
        mode={dialogMode}
        projectId={projectId}
        config={slotConfig}
        record={dialogMode === 'edit' ? selected?.slot : null}
        defaults={{
          owner_type: contentUnitFilterId ? 'content_unit' : sceneMomentFilterId ? 'scene_moment' : segmentFilterId ? 'segment' : '',
          owner_id: contentUnitFilterId ?? sceneMomentFilterId ?? segmentFilterId ?? null,
          creative_reference_id: referenceFilterId ?? null,
          kind: kindFilter === 'all' ? 'image' : kindFilter,
          status: 'missing',
          priority: 'normal',
        }}
        queryKey={['v2-asset-slots-page', projectId]}
        onOpenChange={setDialogOpen}
        onSaved={(record) => setFilter({ asset_slot_id: record.ID })}
        onDeleted={() => setFilter({ asset_slot_id: null })}
      />
      <V2CandidateUploadDialog
        open={showUploadCandidate}
        title="上传候选素材"
        projectId={projectId}
        onClose={() => setShowUploadCandidate(false)}
        onCreated={(asset) => {
          setShowUploadCandidate(false)
          addCandidate(asset)
        }}
      />
    </div>
  )
}

export function AssetLibraryPage() {
  const { t } = useTranslation()
  const projectId = useProjectStore((s) => s.current?.ID)
  const [searchParams, setSearchParams] = useSearchParams()
  const query = readStringParam(searchParams, 'q')
  const segmentFilterId = readNumberParam(searchParams, 'segment_id')
  const sceneMomentFilterId = readNumberParam(searchParams, 'scene_moment_id')
  const contentUnitFilterId = readNumberParam(searchParams, 'content_unit_id')
  const referenceFilterId = readNumberParam(searchParams, 'reference_id')
  const assetSlotFilterId = readNumberParam(searchParams, 'asset_slot_id')
  const [showCreate, setShowCreate] = useState(false)
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery<PaginatedResponse<Asset>>({
    queryKey: ['assets-overview', projectId, query, page],
    queryFn: () => api.get(`/projects/${projectId}/assets`, {
      params: { page, page_size: PAGE_SIZE, q: query || undefined },
    }).then((r) => r.data),
    enabled: !!projectId,
  })

  const { data: settings = [] } = useQuery<Setting[]>({
    queryKey: ['settings', projectId],
    queryFn: () => api.get(`/projects/${projectId}/settings`).then((r) => r.data),
    enabled: !!projectId,
  })

  const assets = data?.items ?? []
  const total = data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const mediaCount = assets.filter((asset) => assetPreview(asset).src).length
  const linkedCount = assets.filter((asset) => asset.setting_id || asset.setting).length
  const chips = [
    segmentFilterId ? { id: 'segment', label: `片段 #${segmentFilterId}`, onRemove: () => setFilter({ segment_id: null }) } : null,
    sceneMomentFilterId ? { id: 'scene', label: `情节 #${sceneMomentFilterId}`, onRemove: () => setFilter({ scene_moment_id: null }) } : null,
    contentUnitFilterId ? { id: 'content', label: `内容 #${contentUnitFilterId}`, onRemove: () => setFilter({ content_unit_id: null }) } : null,
    referenceFilterId ? { id: 'reference', label: `资料 #${referenceFilterId}`, onRemove: () => setFilter({ reference_id: null }) } : null,
    assetSlotFilterId ? { id: 'asset', label: `素材位 #${assetSlotFilterId}`, onRemove: () => setFilter({ asset_slot_id: null }) } : null,
  ].filter(Boolean) as Array<{ id: string; label: string; onRemove: () => void }>

  function setFilter(updates: Partial<Record<ContentFilterKey, string | number | null | undefined>>) {
    setSearchParams(updateContentFilterParams(searchParams, updates), { replace: true })
  }

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden bg-background">
      <div className="shrink-0 border-b border-border bg-background px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{t('pages.assets.library.title', '素材库')}</p>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              素材会被资料使用，并继续传递到情节、片段和内容生产。筛选条件保存在地址栏，便于从其它内容区页面直接进入。
            </p>
          </div>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus size={14} />
            上传素材库
          </Button>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <InfoBox icon={PackageCheck} label="素材" value={String(total)} />
          <InfoBox icon={Layers3} label="资料设定" value={String(settings.length)} />
          <InfoBox icon={Image} label="有媒体" value={String(mediaCount)} />
          <InfoBox icon={Lock} label="已关联" value={String(linkedCount)} />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-6 py-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <ContentFilterBar
            query={query}
            onQueryChange={(value) => {
              setFilter({ q: value })
              setPage(1)
            }}
            queryPlaceholder={t('pages.assets.searchPlaceholder', '搜索素材')}
            chips={chips}
            resultCount={assets.length}
            totalCount={total}
            className="flex-1"
          />
          <span className="shrink-0 text-xs text-muted-foreground">{total} 条 / 第 {page} 页</span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading ? (
            <p className="py-12 text-center text-xs text-muted-foreground">{t('common.loadingShort', '加载中')}</p>
          ) : assets.length === 0 ? (
            <EmptyPreview title="暂无素材" description="可上传素材，或从情节、资料、内容页面带筛选条件进入素材准备。" />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {assets.map((asset) => <AssetCard key={asset.ID} asset={asset} />)}
            </div>
          )}
        </div>

        <div className="mt-4 flex shrink-0 items-center justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" size="sm" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1}>
            <ChevronLeft size={14} />
            上一页
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={page >= pageCount}>
            下一页
            <ChevronRight size={14} />
          </Button>
        </div>
      </div>

      <CreateDialog open={showCreate} onClose={() => setShowCreate(false)} title={t('pages.assets.createTitle', '新建素材')}>
        <AssetCreateForm
          projectId={projectId!}
          onCreated={() => {
            setFilter({ q: null })
            setPage(1)
          }}
          onSuccess={() => setShowCreate(false)}
          onCancel={() => setShowCreate(false)}
        />
      </CreateDialog>
    </div>
  )
}

function V2CandidateUploadDialog({
  open,
  title,
  projectId,
  onClose,
  onCreated,
}: {
  open: boolean
  title: string
  projectId?: number
  onClose: () => void
  onCreated: (asset: Asset) => void
}) {
  if (!open || !projectId) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[86vh] w-[640px] max-w-[calc(100vw-32px)] overflow-y-auto rounded-lg border border-border bg-card p-5 shadow-xl">
        <div className="mb-4">
          <p className="text-base font-semibold text-foreground">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground">候选会先进入素材库，再锁定到当前素材位。</p>
        </div>
        <AssetCreateForm
          projectId={projectId}
          onCreated={onCreated}
          onSuccess={onClose}
          onCancel={onClose}
        />
      </div>
    </div>
  )
}

function AssetSlotCard({
  item,
  selected,
  onSelect,
}: {
  item: AssetSlotViewModel
  selected: boolean
  onSelect: () => void
}) {
  const slot = item.slot
  const status = normalizeSlotStatus(slot.status)
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'rounded-lg border bg-background p-3 text-left transition-colors hover:border-primary/50',
        selected ? 'border-primary ring-1 ring-primary/40' : 'border-border',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <SlotKindIcon kind={slot.kind} />
        </span>
        <SlotStatusBadge status={status} />
      </div>
      <h3 className="mt-3 line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-foreground">{slot.name || `素材位 #${slot.ID}`}</h3>
      <p className="mt-1 truncate text-xs text-muted-foreground">{slotKindLabel(slot.kind)} · {primaryAppearance(item)}</p>
      <p className="mt-3 line-clamp-2 min-h-9 text-xs leading-5 text-muted-foreground">{slot.description || slot.prompt_hint || '暂无用途说明'}</p>
      <div className="mt-3 space-y-1">
        {item.appearances.slice(0, 2).map((appearance) => (
          <div key={`${appearance.label}:${appearance.value}`} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5">{appearance.label}</span>
            <span className="truncate">{appearance.value}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge variant="outline" className="text-[10px]">{slot.priority || 'normal'}</Badge>
        {item.candidates.length > 0 ? <Badge variant="outline" className="text-[10px]">候选 {item.candidates.length}</Badge> : null}
        {slot.locked_asset_id ? <Badge variant="outline" className="text-[10px]">已锁定 #{slot.locked_asset_id}</Badge> : null}
      </div>
    </button>
  )
}

function AssetSlotDetail({
  item,
  assets,
  confirming,
  onEdit,
  onConfirmCandidate,
  onAddCandidate,
  onUploadCandidate,
}: {
  item: AssetSlotViewModel | null
  assets: Asset[]
  confirming: boolean
  onEdit: () => void
  onConfirmCandidate: (candidate: AssetSlotCandidateRecord) => void
  onAddCandidate: (asset: Asset) => void
  onUploadCandidate: () => void
}) {
  if (!item) {
    return (
      <section className="rounded-lg border border-border bg-card p-4">
        <EmptyPreview title="未选择素材" description="从列表选择一个素材位查看详情。" />
      </section>
    )
  }

  const slot = item.slot
  const status = normalizeSlotStatus(slot.status)
  return (
    <>
      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border p-4">
          <div className="flex items-start justify-between gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <SlotKindIcon kind={slot.kind} />
            </span>
            <SlotStatusBadge status={status} />
          </div>
          <h2 className="mt-3 text-lg font-semibold text-foreground">{slot.name || `素材位 #${slot.ID}`}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{slotKindLabel(slot.kind)} · {primaryAppearance(item)}</p>
        </div>
        <div className="space-y-4 p-4">
          <InfoBlock label="用途说明" value={slot.description || '暂无用途说明'} />
          <InfoBlock label="生成提示" value={slot.prompt_hint || '暂无生成提示'} />
          <div>
            <p className="mb-2 text-xs text-muted-foreground">出现位置</p>
            <div className="space-y-2">
              {item.appearances.length > 0 ? item.appearances.map((appearance) => (
                <div key={`${appearance.label}:${appearance.value}`} className="rounded-md border border-border bg-background p-2">
                  <p className="text-[11px] text-muted-foreground">{appearance.label}</p>
                  <p className="mt-1 line-clamp-2 text-sm font-medium text-foreground">{appearance.value}</p>
                </div>
              )) : (
                <p className="rounded-md border border-dashed border-border bg-muted/20 p-2 text-xs text-muted-foreground">暂无片段、情节、内容或资料引用。</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <MiniStat label="优先级" value={String(slot.priority || 'normal')} />
            <MiniStat label="锁定素材" value={item.lockedAsset?.name || (slot.locked_asset_id ? `#${slot.locked_asset_id}` : '未锁定')} />
          </div>
          <Button variant="outline" className="w-full gap-2" onClick={onEdit}>
            <Pencil size={14} />
            编辑素材
          </Button>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between gap-3 border-b border-border p-4">
          <div>
            <p className="text-sm font-semibold text-foreground">候选素材</p>
            <p className="mt-1 text-xs text-muted-foreground">确认一个候选后，素材位会进入已锁定状态。</p>
          </div>
          <Button variant="outline" size="sm" onClick={onUploadCandidate}>
            <Upload size={14} />
            上传
          </Button>
        </div>
        <div className="space-y-3 p-4">
          {item.candidates.length > 0 ? item.candidates.map((candidate) => (
            <CandidateCard
              key={candidate.ID}
              candidate={candidate}
              selected={slot.locked_asset_id === candidate.asset_id || candidate.status === 'selected'}
              confirming={confirming}
              onConfirm={() => onConfirmCandidate(candidate)}
            />
          )) : (
            <p className="rounded-md border border-dashed border-border bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">暂无候选。可以上传素材，或从下方素材库选择一个作为候选并确认。</p>
          )}
          <div className="border-t border-border pt-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">从素材库确认</p>
            <div className="grid grid-cols-2 gap-2">
              {assets.slice(0, 6).map((asset) => (
                <button
                  key={asset.ID}
                  type="button"
                  onClick={() => onAddCandidate(asset)}
                  className="overflow-hidden rounded-md border border-border bg-background text-left hover:border-primary/40"
                  disabled={confirming}
                >
                  <AssetThumb asset={asset} className="aspect-[4/3] w-full" />
                  <div className="p-2">
                    <p className="truncate text-xs font-medium text-foreground">{asset.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{asset.type}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  )
}

function CandidateCard({
  candidate,
  selected,
  confirming,
  onConfirm,
}: {
  candidate: AssetSlotCandidateRecord
  selected: boolean
  confirming: boolean
  onConfirm: () => void
}) {
  const asset = candidate.asset
  return (
    <div className={cn('overflow-hidden rounded-md border bg-background', selected ? 'border-primary ring-1 ring-primary/40' : 'border-border')}>
      <AssetThumb asset={asset} className="aspect-[4/3] w-full" />
      <div className="space-y-2 p-3">
        <div>
          <p className="truncate text-sm font-medium text-foreground">{asset?.name || `素材 #${candidate.asset_id}`}</p>
          <p className="truncate text-xs text-muted-foreground">{candidate.source_type || 'manual'} · {candidate.status || 'candidate'}</p>
        </div>
        {candidate.note ? <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">{candidate.note}</p> : null}
        <Button size="sm" className="w-full" disabled={selected || confirming || !candidate.asset_id} onClick={onConfirm}>
          {selected ? '已确认' : '确认采用'}
        </Button>
      </div>
    </div>
  )
}

function AssetCard({ asset }: { asset: Asset }) {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-card">
      <div className="aspect-[4/3] overflow-hidden bg-muted">
        <AssetThumb asset={asset} className="h-full w-full" />
      </div>
      <div className="space-y-1 p-3">
        <p className="truncate text-sm font-medium text-foreground">{asset.name}</p>
        <p className="truncate text-xs text-muted-foreground">{asset.setting?.name || asset.type || '未关联资料'}</p>
        <p className="line-clamp-2 min-h-8 text-[11px] leading-4 text-muted-foreground">{asset.description || asset.prompt || '暂无描述'}</p>
      </div>
    </div>
  )
}

function SlotStatusBadge({ status }: { status: SlotStatus }) {
  const label = status === 'missing' ? '缺素材' : status === 'candidate' ? '候选' : status === 'waived' ? '已豁免' : '已锁定'
  return <span className="rounded-md bg-muted px-2 py-1 text-[10px] text-muted-foreground">{label}</span>
}

function SlotKindIcon({ kind }: { kind?: string }) {
  if (kind === 'video') return <Video size={16} />
  if (kind === 'audio') return <FileAudio size={16} />
  if (kind === 'text') return <FileText size={16} />
  if (kind === 'brand_pack' || kind === 'reference') return <Layers3 size={16} />
  return <Image size={16} />
}

function normalizeSlotStatus(status?: string): SlotStatus {
  if (status === 'candidate' || status === 'locked' || status === 'waived') return status
  return 'missing'
}

function normalizeSlotKind(kind?: string): AssetSlot['kind'] {
  if (kind === 'video' || kind === 'audio' || kind === 'text' || kind === 'brand_pack' || kind === 'reference') return kind
  return 'image'
}

function slotKindLabel(kind?: string) {
  const labels: Record<string, string> = {
    image: '图片',
    video: '视频',
    audio: '音频',
    text: '文本',
    brand_pack: '品牌包',
    reference: '参考',
  }
  return labels[String(kind ?? 'image')] ?? String(kind ?? '图片')
}

function slotScopeLabel(slot: AssetSlotRecord) {
  if (slot.owner_type && slot.owner_id) return `${slot.owner_type} #${slot.owner_id}`
  if (slot.creative_reference_id) return `资料 #${slot.creative_reference_id}`
  return '项目'
}

function buildAssetSlotViewModel(
  slot: AssetSlotRecord,
  maps: {
    segmentById: Map<number, SegmentRecord>
    sceneMomentById: Map<number, SceneMomentRecord>
    contentUnitById: Map<number, ContentUnitRecord>
    referenceById: Map<number, CreativeReferenceRecord>
    candidatesBySlotId: Map<number, AssetSlotCandidateRecord[]>
    assetById: Map<number, Asset>
  },
): AssetSlotViewModel {
  const directSegment = slot.owner_type === 'segment' && slot.owner_id ? maps.segmentById.get(slot.owner_id) : undefined
  const directSceneMoment = slot.owner_type === 'scene_moment' && slot.owner_id ? maps.sceneMomentById.get(slot.owner_id) : undefined
  const directContentUnit = slot.owner_type === 'content_unit' && slot.owner_id ? maps.contentUnitById.get(slot.owner_id) : undefined
  const reference = slot.creative_reference_id ? maps.referenceById.get(slot.creative_reference_id) : undefined
  const sceneMoment = directSceneMoment ?? (directContentUnit?.scene_moment_id ? maps.sceneMomentById.get(directContentUnit.scene_moment_id) : undefined)
  const segment = directSegment ?? (directContentUnit?.segment_id ? maps.segmentById.get(directContentUnit.segment_id) : undefined) ?? (sceneMoment?.segment_id ? maps.segmentById.get(sceneMoment.segment_id) : undefined)
  const candidates = maps.candidatesBySlotId.get(slot.ID) ?? []
  const lockedAsset = slot.locked_asset_id ? maps.assetById.get(slot.locked_asset_id) ?? candidates.find((candidate) => candidate.asset_id === slot.locked_asset_id)?.asset : undefined
  const appearances = [
    segment ? { label: '片段', value: titleOfRecord(segment, '未命名片段') } : null,
    sceneMoment ? { label: '情节', value: titleOfRecord(sceneMoment, '未命名情节') } : null,
    directContentUnit ? { label: '内容', value: titleOfRecord(directContentUnit, '未命名内容') } : null,
    reference ? { label: '资料', value: titleOfRecord(reference, '未命名资料') } : null,
    !segment && !sceneMoment && !directContentUnit && !reference && slot.owner_type ? { label: '归属', value: slotScopeLabel(slot) } : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>
  const searchText = [
    slot.name,
    slot.description,
    slot.prompt_hint,
    slot.kind,
    slot.status,
    slot.owner_type,
    segment?.title,
    segment?.summary,
    segment?.content,
    sceneMoment?.title,
    sceneMoment?.description,
    sceneMoment?.action_text,
    sceneMoment?.location_text,
    sceneMoment?.time_text,
    directContentUnit?.title,
    directContentUnit?.description,
    directContentUnit?.prompt,
    reference?.name,
    reference?.kind,
    reference?.description,
    lockedAsset?.name,
    ...candidates.map((candidate) => [candidate.asset?.name, candidate.note, candidate.status].filter(Boolean).join(' ')),
  ].filter(Boolean).join(' ').toLowerCase()

  return {
    slot,
    segment,
    sceneMoment,
    contentUnit: directContentUnit,
    reference,
    candidates,
    lockedAsset,
    appearances,
    searchText,
  }
}

function titleOfRecord(record: V2EntityRecord | undefined, fallback: string) {
  if (!record) return fallback
  return String(record.title ?? record.name ?? record.label ?? fallback)
}

function primaryAppearance(item: AssetSlotViewModel) {
  return item.appearances[0]?.value ?? slotScopeLabel(item.slot)
}

function countReferencedSlots(items: AssetSlotViewModel[]) {
  return items.filter((item) => item.appearances.length > 0).length
}

function AssetMetric({ icon: Icon, label, value, detail }: { icon: typeof PackageCheck; label: string; value: number; detail: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon size={18} />
        </span>
      </div>
      <p className="mt-2 truncate text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 whitespace-pre-wrap rounded-md border border-border bg-background p-2 text-sm leading-5 text-foreground">{value}</p>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-medium text-foreground">{value}</p>
    </div>
  )
}

function InfoBox({ icon: Icon, label, value }: { icon: typeof PackageCheck; label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon size={14} />
        {label}
      </div>
      <p className="mt-2 line-clamp-3 text-sm leading-5 text-foreground">{value}</p>
    </div>
  )
}

function ReadinessItem({ complete, label }: { complete: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-background p-3">
      <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full', complete ? 'bg-emerald-600 text-white' : 'bg-muted text-muted-foreground')}>
        {complete ? <Check size={13} /> : <CircleDashed size={13} />}
      </span>
      <span className="text-xs font-medium text-foreground">{label}</span>
    </div>
  )
}

function EmptyPreview({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-muted/20 p-6 text-center">
      <PackageCheck size={28} className="text-muted-foreground/50" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-sm text-xs leading-5 text-muted-foreground">{description}</p>
    </div>
  )
}
