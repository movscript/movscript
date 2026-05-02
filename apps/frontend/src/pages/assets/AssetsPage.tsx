import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleDashed, FileAudio, FileText, Image, Lock, PackageCheck, Pencil, Plus, Sparkles, Video } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { AuthedImage, AuthedVideo } from '@/components/shared/AuthedImage'
import { CreateDialog } from '@/components/shared/CreateDialog'
import { SemanticEntityCrudDialog } from '@/components/shared/SemanticEntityCrudDialog'
import { createSemanticEntity, listSemanticEntities, updateSemanticEntity, semanticEntityConfig, type SemanticEntityRecord } from '@/api/semanticEntities'
import { ContentFilterBar } from '@/pages/contents/components/ContentFilterBar'
import { readNumberParam, readStringParam, updateContentFilterParams, type ContentFilterKey } from '@/pages/contents/lib/contentFilters'
import { API_BASE_URL } from '@/lib/config'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/store/projectStore'
import type { RawResource } from '@/types'
import { Badge, Button } from '@movscript/ui'

const PAGE_SIZE = 18

type SlotStatus = 'missing' | 'candidate' | 'locked' | 'waived'

type AssetSlotRecord = SemanticEntityRecord & {
  owner_type?: string
  owner_id?: number
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

export function AssetGenerationWorkspace() {
  const projectId = useProjectStore((s) => s.current?.ID)
  return <AssetSlotWorkspace projectId={projectId} compact />
}

export default function AssetsPage() {
  const projectId = useProjectStore((s) => s.current?.ID)
  return <AssetSlotWorkspace projectId={projectId} />
}

function AssetSlotWorkspace({ projectId, compact = false }: { projectId?: number; compact?: boolean }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [page, setPage] = useState(1)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const selectedId = readNumberParam(searchParams, 'asset_slot_id') ?? readNumberParam(searchParams, 'selected')
  const query = readStringParam(searchParams, 'q')
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

  const updateSlotMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Record<string, string | number | boolean | null> }) =>
      updateSemanticEntity(projectId!, slotConfig, id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['semantic-asset-slots-page', projectId] }),
  })

  const addCandidateMutation = useMutation({
    mutationFn: (payload: Record<string, string | number | boolean | null>) => createSemanticEntity(projectId!, candidateConfig, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['semantic-asset-slot-candidates-page', projectId] }),
  })

  const slotById = useMemo(() => new Map(slots.map((slot) => [slot.ID, slot])), [slots])
  const rows = useMemo(() => buildRows(slots, candidates, slotById), [candidates, slotById, slots])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) => row.searchText.includes(q))
  }, [query, rows])
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const selected = rows.find((row) => row.slot.ID === selectedId) ?? rows[0] ?? null
  const candidateSlots = slots.filter((slot) => slot.status === 'candidate' && slot.ID !== selected?.slot.ID)

  const missingCount = slots.filter((slot) => normalizeSlotStatus(slot.status) === 'missing').length
  const candidateCount = slots.filter((slot) => normalizeSlotStatus(slot.status) === 'candidate').length
  const lockedCount = slots.filter((slot) => normalizeSlotStatus(slot.status) === 'locked').length
  const waivedCount = slots.filter((slot) => normalizeSlotStatus(slot.status) === 'waived').length

  function setFilter(updates: Partial<Record<ContentFilterKey, string | number | null | undefined>>) {
    setSearchParams(updateContentFilterParams(searchParams, updates), { replace: true })
  }

  function startCreate() {
    setDialogMode('create')
    setDialogOpen(true)
  }

  function startEdit() {
    if (!selected) return
    setDialogMode('edit')
    setDialogOpen(true)
  }

  function lockToSlot(candidateSlotID: number) {
    if (!selected) return
    updateSlotMutation.mutate({
      id: selected.slot.ID,
      payload: { status: 'locked', locked_asset_slot_id: candidateSlotID },
    })
  }

  function addCandidate(candidateSlotID: number) {
    if (!selected) return
    const existing = selected.candidates.find((candidate) => candidate.candidate_asset_slot_id === candidateSlotID)
    if (existing) return
    addCandidateMutation.mutate({
      asset_slot_id: selected.slot.ID,
      candidate_asset_slot_id: candidateSlotID,
      source_type: 'manual',
      status: 'candidate',
    })
  }

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden bg-background">
      <div className="shrink-0 border-b border-border bg-background px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{t('pages.assets.semantic.title', '素材准备')}</p>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              当前内容区只使用素材位：缺口、候选、锁定素材和资源文件都收敛在 asset_slot / asset_slot_candidate。
            </p>
          </div>
          <Button size="sm" onClick={startCreate}>
            <Plus size={14} />
            新建素材位
          </Button>
        </div>
        {!compact ? (
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <AssetMetric icon={PackageCheck} label="素材位" value={slots.length} detail="内容区素材需求" />
            <AssetMetric icon={CircleDashed} label="待补齐" value={missingCount} detail="仍缺候选或锁定素材" />
            <AssetMetric icon={Sparkles} label="候选中" value={candidateCount} detail="可作为候选素材" />
            <AssetMetric icon={Lock} label="已锁定" value={lockedCount} detail={`${waivedCount} 个已豁免`} />
          </div>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden px-6 py-5">
          <ContentFilterBar
            query={query}
            onQueryChange={(value) => {
              setFilter({ q: value })
              setPage(1)
            }}
            queryPlaceholder={t('pages.assets.searchPlaceholder', '搜索素材位')}
            chips={selectedId ? [{ id: 'selected', label: `素材位 #${selectedId}`, onRemove: () => setFilter({ asset_slot_id: null, selected: null }) }] : []}
            resultCount={pageRows.length}
            totalCount={filtered.length}
          />
          <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
            {isLoading ? (
              <p className="py-12 text-center text-xs text-muted-foreground">{t('common.loadingShort', '加载中')}</p>
            ) : pageRows.length === 0 ? (
              <EmptyPreview title="暂无素材位" description="从内容、情节或资料页面创建素材位，或手动新建一个候选素材位。" />
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {pageRows.map((row) => (
                  <AssetSlotCard key={row.slot.ID} row={row} selected={row.slot.ID === selected?.slot.ID} onSelect={() => setFilter({ asset_slot_id: row.slot.ID })} />
                ))}
              </div>
            )}
          </div>
          <div className="mt-4 flex shrink-0 items-center justify-end gap-2 border-t border-border pt-4">
            <Button variant="outline" size="sm" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1}>上一页</Button>
            <span className="text-xs text-muted-foreground">第 {page} / {pageCount} 页</span>
            <Button variant="outline" size="sm" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={page >= pageCount}>下一页</Button>
          </div>
        </div>

        <aside className="hidden w-[380px] shrink-0 overflow-y-auto border-l border-border bg-card/40 p-5 xl:block">
          <AssetSlotDetail
            row={selected}
            candidateSlots={candidateSlots}
            onEdit={startEdit}
            onLock={lockToSlot}
            onAddCandidate={addCandidate}
            busy={updateSlotMutation.isPending || addCandidateMutation.isPending}
          />
        </aside>
      </div>

      <SemanticEntityCrudDialog
        open={dialogOpen}
        mode={dialogMode}
        title={dialogMode === 'create' ? '新建素材位' : '编辑素材位'}
        projectId={projectId}
        config={slotConfig}
        record={dialogMode === 'edit' ? selected?.slot ?? null : null}
        onOpenChange={setDialogOpen}
        queryKey={['semantic-asset-slots-page', projectId]}
        onSaved={(record) => setFilter({ asset_slot_id: record.ID })}
        onDeleted={() => setFilter({ asset_slot_id: null })}
      />
    </div>
  )
}

function AssetSlotCard({ row, selected, onSelect }: { row: AssetSlotViewModel; selected: boolean; onSelect: () => void }) {
  const slot = row.slot
  return (
    <button onClick={onSelect} className={cn('overflow-hidden rounded-md border bg-card text-left', selected ? 'border-primary ring-1 ring-primary/40' : 'border-border hover:border-primary/40')}>
      <SlotThumb slot={slot} className="aspect-[4/3] w-full" />
      <div className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{slot.name || `素材位 #${slot.ID}`}</p>
            <p className="truncate text-xs text-muted-foreground">{slotScopeLabel(slot)}</p>
          </div>
          <SlotStatusBadge status={normalizeSlotStatus(slot.status)} />
        </div>
        <p className="line-clamp-2 min-h-8 text-[11px] leading-4 text-muted-foreground">{slot.description || slot.prompt_hint || '暂无描述'}</p>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Badge variant="outline" className="text-[10px]">{slot.kind || 'reference'}</Badge>
          <span>{row.candidates.length} 个候选</span>
        </div>
      </div>
    </button>
  )
}

function AssetSlotDetail({
  row,
  candidateSlots,
  onEdit,
  onLock,
  onAddCandidate,
  busy,
}: {
  row: AssetSlotViewModel | null
  candidateSlots: AssetSlotRecord[]
  onEdit: () => void
  onLock: (candidateSlotID: number) => void
  onAddCandidate: (candidateSlotID: number) => void
  busy: boolean
}) {
  if (!row) return <EmptyPreview title="选择素材位" description="查看缺口、候选和已锁定素材位。" />
  const slot = row.slot
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{slot.name || `素材位 #${slot.ID}`}</p>
          <p className="mt-1 text-xs text-muted-foreground">{slotScopeLabel(slot)}</p>
        </div>
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Pencil size={14} />
          编辑
        </Button>
      </div>

      <SlotThumb slot={row.lockedSlot ?? slot} className="aspect-video w-full rounded-md border border-border" />

      <div className="grid grid-cols-2 gap-2">
        <MiniStat label="状态" value={normalizeSlotStatus(slot.status)} />
        <MiniStat label="类型" value={slot.kind || 'reference'} />
        <MiniStat label="优先级" value={slot.priority || 'normal'} />
        <MiniStat label="锁定素材位" value={row.lockedSlot?.name || (slot.locked_asset_slot_id ? `#${slot.locked_asset_slot_id}` : '未锁定')} />
      </div>

      <section>
        <p className="mb-2 text-xs font-medium text-foreground">候选素材位</p>
        <div className="space-y-2">
          {row.candidates.length === 0 ? <EmptyPreview title="暂无候选" description="从下方候选素材位加入。" /> : null}
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
          {candidateSlots.slice(0, 8).map((candidateSlot) => (
            <button key={candidateSlot.ID} onClick={() => onAddCandidate(candidateSlot.ID)} className="overflow-hidden rounded-md border border-border bg-background text-left hover:border-primary/40">
              <SlotThumb slot={candidateSlot} className="aspect-[4/3] w-full" />
              <p className="truncate p-2 text-[11px] text-foreground">{candidateSlot.name || `素材位 #${candidateSlot.ID}`}</p>
            </button>
          ))}
        </div>
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
          <p className="truncate text-sm font-medium text-foreground">{slot?.name || `素材位 #${candidate.candidate_asset_slot_id}`}</p>
          <p className="truncate text-xs text-muted-foreground">{candidate.note || candidate.source_type || 'candidate'}</p>
        </div>
      </div>
      <Button size="sm" className="mt-2 w-full" disabled={selected || busy || !candidate.candidate_asset_slot_id} onClick={onConfirm}>
        {selected ? '已锁定' : '锁定此素材位'}
      </Button>
    </div>
  )
}

function buildRows(slots: AssetSlotRecord[], candidates: AssetSlotCandidateRecord[], slotById: Map<number, AssetSlotRecord>): AssetSlotViewModel[] {
  return slots.map((slot) => {
    const slotCandidates = candidates
      .filter((candidate) => candidate.asset_slot_id === slot.ID)
      .map((candidate) => ({ ...candidate, candidate_asset_slot: candidate.candidate_asset_slot ?? (candidate.candidate_asset_slot_id ? slotById.get(candidate.candidate_asset_slot_id) : undefined) }))
    const lockedSlot = slot.locked_asset_slot ?? (slot.locked_asset_slot_id ? slotById.get(slot.locked_asset_slot_id) : undefined)
    const searchText = [slot.name, slot.kind, slot.status, slot.description, slot.prompt_hint, slotScopeLabel(slot), lockedSlot?.name].filter(Boolean).join(' ').toLowerCase()
    return { slot, candidates: slotCandidates, lockedSlot, searchText }
  })
}

function SlotStatusBadge({ status }: { status: SlotStatus }) {
  const label = status === 'missing' ? '缺素材' : status === 'candidate' ? '候选' : status === 'waived' ? '已豁免' : '已锁定'
  return <span className="rounded-md bg-muted px-2 py-1 text-[10px] text-muted-foreground">{label}</span>
}

function SlotKindIcon({ kind }: { kind?: string }) {
  if (kind === 'video') return <Video size={16} />
  if (kind === 'audio') return <FileAudio size={16} />
  if (kind === 'text') return <FileText size={16} />
  return <Image size={16} />
}

function normalizeSlotStatus(status?: string): SlotStatus {
  if (status === 'candidate' || status === 'locked' || status === 'waived') return status
  return 'missing'
}

function slotScopeLabel(slot: AssetSlotRecord) {
  if (slot.owner_type && slot.owner_id) return `${slot.owner_type} #${slot.owner_id}`
  if (slot.creative_reference_id) return `资料 #${slot.creative_reference_id}`
  if (slot.resource_id) return `资源 #${slot.resource_id}`
  return '项目素材位'
}

function AssetMetric({ icon: Icon, label, value, detail }: { icon: typeof PackageCheck; label: string; value: number; detail: string }) {
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
