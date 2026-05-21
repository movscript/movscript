import { useState, type MouseEvent, type ReactNode } from 'react'
import { FileAudio, FileText, Image, PackageCheck, Sparkles, Video, type LucideIcon } from 'lucide-react'

import { AuthedImage, AuthedVideo } from '@/components/shared/AuthedImage'
import {
  WorkbenchEmptyState,
  WorkbenchEntityCard,
  WorkbenchStatusBadge,
  WorkbenchThumbnail,
} from '@/components/workbench/WorkbenchPrimitives'
import { API_BASE_URL } from '@/lib/config'
import {
  assetKindLabel,
  normalizeSlotStatus,
  type AssetKind,
  type AssetSlotRecord,
  type AssetSlotViewModel,
  type CreativeReferenceRecord,
  type ReferenceAssetCluster,
  type SlotStatus,
} from '@/lib/preProductionAssetRows'
import { cn } from '@/lib/utils'
import type { RawResource } from '@/types'
import { Badge, Button } from '@movscript/ui'

const assetKindOrder: AssetKind[] = ['all', 'image', 'video', 'audio', 'text', 'brand_pack', 'reference', 'other']

type MediaFit = 'cover' | 'contain'
type PreparationView = 'queue' | 'grouped' | 'missing' | 'locked'
export type PreProductionCardContextTarget = { type: 'asset'; id: number } | { type: 'reference'; id: number }

export function PreProductionAssetBoard({
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
  onCardContextMenu,
  actions,
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
  onCardContextMenu?: (event: MouseEvent, target: PreProductionCardContextTarget) => void
  actions?: ReactNode
}) {
  const [view, setView] = useState<PreparationView>('queue')
  const selectedClusterRows = selectedCluster?.rows ?? []
  const visibleRows = view === 'missing'
    ? rows.filter((row) => normalizeSlotStatus(row.slot.status) === 'missing')
    : view === 'locked'
      ? rows.filter((row) => normalizeSlotStatus(row.slot.status) === 'locked')
      : rows
  const viewOptions: Array<{ value: PreparationView; label: string; count: number }> = [
    { value: 'queue', label: '全部准备项', count: clusters.length + rows.length + (creatingReference ? 1 : 0) },
    { value: 'grouped', label: '按设定分组', count: clusters.length + (creatingReference ? 1 : 0) },
    { value: 'missing', label: '素材缺口', count: rows.filter((row) => normalizeSlotStatus(row.slot.status) === 'missing').length },
    { value: 'locked', label: '已选资产', count: rows.filter((row) => normalizeSlotStatus(row.slot.status) === 'locked').length },
  ]

  return (
    <section className="overflow-hidden xl:flex xl:h-full xl:min-h-0 xl:flex-col">
      <div className="border-b border-border px-1 pb-3 xl:shrink-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="type-body font-semibold text-foreground">前期准备项</p>
            <p className="mt-1 type-label text-muted-foreground">把设定资料、素材需求和已选资产放在同一张准备清单里推进。</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge variant="outline" className="type-tiny">{clusters.length + rows.length + (creatingReference ? 1 : 0)} 项</Badge>
            {actions}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1 rounded-md bg-muted/50 p-1">
          {viewOptions.map((option) => (
            <Button
              key={option.value}
              size="sm"
              variant={view === option.value ? 'secondary' : 'ghost'}
              className="h-8 gap-1.5 px-2 type-caption"
              onClick={() => setView(option.value)}
            >
              {option.label}
              <span className="rounded-full bg-background/70 px-1.5 type-tiny leading-4 text-muted-foreground">{option.count}</span>
            </Button>
          ))}
        </div>
      </div>

      {view === 'grouped' ? (
        <div className="grid min-h-[560px] lg:grid-cols-[260px_minmax(0,1fr)] xl:min-h-0 xl:flex-1">
          <aside className="border-b border-border bg-muted/20 p-3 lg:border-b-0 lg:border-r xl:flex xl:min-h-0 xl:flex-col">
            <div className="mb-2 flex items-center justify-between gap-2 xl:shrink-0">
              <p className="type-label font-semibold text-foreground">设定</p>
              <Badge variant="outline" className="type-tiny">{clusters.length}</Badge>
            </div>
            {loading ? <p className="py-8 text-center type-label text-muted-foreground">加载中</p> : null}
            {!loading && clusters.length === 0 && !creatingReference ? <EmptyPreview title="暂无前期资料" description="先创建设定，再为它添加要准备的素材。" /> : null}
            <div className="space-y-2 pr-1 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
              {creatingReference ? <DraftReferenceClusterButton /> : null}
              {clusters.map((cluster) => (
                <ReferenceClusterButton
                  key={cluster.reference?.ID ?? 'unbound'}
                  cluster={cluster}
                  selected={(selectedCluster?.reference?.ID ?? 0) === (cluster.reference?.ID ?? 0)}
                  onSelect={() => cluster.reference?.ID ? onSelectReference(cluster.reference.ID) : cluster.rows[0] && onSelectSlot(cluster.rows[0].slot.ID)}
                  onContextMenu={(event) => {
                    if (cluster.reference?.ID) {
                      onCardContextMenu?.(event, { type: 'reference', id: cluster.reference.ID })
                      return
                    }
                    if (cluster.rows[0]) onCardContextMenu?.(event, { type: 'asset', id: cluster.rows[0].slot.ID })
                  }}
                />
              ))}
            </div>
          </aside>

          <div className="min-w-0 p-3 xl:flex xl:min-h-0 xl:flex-col">
            <AssetListHeader
              title={referenceTitle(selectedReference)}
              detail={`${selectedClusterRows.length} 个素材`}
              description={referenceDescription(selectedReference)}
              kindFilter={kindFilter}
              onKindChange={onKindChange}
            />
            {loading ? <p className="py-8 text-center type-label text-muted-foreground">加载中</p> : null}
            {!loading && selectedClusterRows.length === 0 ? <EmptyPreview title="没有关联素材" description="为这个设定创建图片、视频、音频或文本素材。" /> : null}
            <AssetGrid
              rows={selectedClusterRows}
              clusters={clusters}
              selected={selected}
              onSelectSlot={onSelectSlot}
              onCardContextMenu={onCardContextMenu}
              showReference={false}
            />
          </div>
        </div>
      ) : (
        <div className="min-h-[560px] min-w-0 p-3 xl:min-h-0 xl:flex-1 xl:flex xl:flex-col">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3 xl:shrink-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2 type-label text-muted-foreground">
                <PackageCheck size={14} />
                <span>{view === 'missing' ? '素材缺口' : view === 'locked' ? '已选资产' : '全部准备项'}</span>
                <span>·</span>
                <span>{visibleRows.length} 个素材</span>
              </div>
              <p className="mt-1 line-clamp-2 type-label text-muted-foreground">
                {view === 'missing'
                  ? '直接处理缺少素材的准备项，不被设定层级打断。'
                  : view === 'locked'
                    ? '查看已经锁定、可以交给下游使用的资产。'
                    : '设定和素材并列展示，先看全局准备进度，再进入具体检查器处理。'}
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-1">
              {assetKindOrder.map((kind) => (
                <Button
                  key={kind}
                  size="sm"
                  variant={kindFilter === kind ? 'secondary' : 'ghost'}
                  className="px-2 type-caption"
                  onClick={() => onKindChange(kind)}
                >
                  {kind === 'all' ? '全部' : assetKindLabel(kind)}
                </Button>
              ))}
            </div>
          </div>
          {loading ? <p className="py-8 text-center type-label text-muted-foreground">加载中</p> : null}
          {!loading && view === 'queue' && clusters.length === 0 && visibleRows.length === 0 && !creatingReference ? <EmptyPreview title="暂无前期资料" description="先创建设定，或直接创建素材需求。" /> : null}
          {!loading && view !== 'queue' && visibleRows.length === 0 ? <EmptyPreview title={view === 'missing' ? '暂无素材缺口' : '暂无已选资产'} description={view === 'missing' ? '当前筛选下没有缺少素材的准备项。' : '锁定候选后，已选资产会出现在这里。'} /> : null}
          <div className="space-y-4 pr-1 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
            {view === 'queue' ? (
              <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
                {creatingReference ? <DraftReferencePrepItem /> : null}
                {clusters.filter((cluster) => cluster.reference).map((cluster) => (
                  <ReferencePrepItem
                    key={cluster.reference?.ID}
                    cluster={cluster}
                    selected={(selectedReference?.ID ?? 0) === cluster.reference?.ID && !selected}
                    onSelect={() => cluster.reference?.ID && onSelectReference(cluster.reference.ID)}
                    onContextMenu={(event) => cluster.reference?.ID && onCardContextMenu?.(event, { type: 'reference', id: cluster.reference.ID })}
                  />
                ))}
              </div>
            ) : null}
            <AssetGrid
              rows={visibleRows}
              clusters={clusters}
              selected={selected}
              onSelectSlot={onSelectSlot}
              onCardContextMenu={onCardContextMenu}
              showReference
            />
          </div>
        </div>
      )}
    </section>
  )
}

function AssetListHeader({
  title,
  detail,
  description,
  kindFilter,
  onKindChange,
}: {
  title: string
  detail: string
  description: string
  kindFilter: AssetKind
  onKindChange: (value: AssetKind) => void
}) {
  return (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-3 xl:shrink-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2 type-label text-muted-foreground">
          <PackageCheck size={14} />
          <span>{title}</span>
          <span>·</span>
          <span>{detail}</span>
        </div>
        <p className="mt-1 line-clamp-2 type-label text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-wrap justify-end gap-1">
        {assetKindOrder.map((kind) => (
          <Button
            key={kind}
            size="sm"
            variant={kindFilter === kind ? 'secondary' : 'ghost'}
            className="px-2 type-caption"
            onClick={() => onKindChange(kind)}
          >
            {kind === 'all' ? '全部' : assetKindLabel(kind)}
          </Button>
        ))}
      </div>
    </div>
  )
}

function AssetGrid({
  rows,
  clusters,
  selected,
  onSelectSlot,
  onCardContextMenu,
  showReference,
}: {
  rows: AssetSlotViewModel[]
  clusters: ReferenceAssetCluster[]
  selected: AssetSlotViewModel | null
  onSelectSlot: (slotId: number) => void
  onCardContextMenu?: (event: MouseEvent, target: PreProductionCardContextTarget) => void
  showReference: boolean
}) {
  return (
    <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
      {rows.map((row) => (
        <ReferenceAssetTile
          key={row.slot.ID}
          row={row}
          reference={showReference ? referenceForRow(clusters, row) : null}
          selected={row.slot.ID === selected?.slot.ID}
          onSelect={() => onSelectSlot(row.slot.ID)}
          onContextMenu={(event) => onCardContextMenu?.(event, { type: 'asset', id: row.slot.ID })}
        />
      ))}
    </div>
  )
}

function ReferencePrepItem({
  cluster,
  selected,
  onSelect,
  onContextMenu,
}: {
  cluster: ReferenceAssetCluster
  selected: boolean
  onSelect: () => void
  onContextMenu?: (event: MouseEvent) => void
}) {
  return (
    <WorkbenchEntityCard
      onClick={onSelect}
      onContextMenu={onContextMenu}
      active={selected}
      media={(
        <div className="flex h-16 w-20 items-center justify-center rounded-md border border-border bg-muted/30 text-muted-foreground">
          <Sparkles size={18} />
        </div>
      )}
      title={referenceTitle(cluster.reference)}
      description={`${referenceKindLabel(cluster.reference?.kind)} · ${cluster.rows.length} 个素材 · 缺 ${cluster.missing} · 待选 ${cluster.candidate}`}
      status={<WorkbenchStatusBadge tone={cluster.missing > 0 ? 'warning' : cluster.candidate > 0 ? 'info' : 'success'} label={cluster.missing > 0 ? '有缺口' : cluster.candidate > 0 ? '待选择' : '已覆盖'} />}
    />
  )
}

function DraftReferencePrepItem() {
  return (
    <div className="workbench-entity-card border-primary bg-primary/5">
      <div className="workbench-entity-card__media">
        <div className="flex h-16 w-20 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary">
          <Sparkles size={18} />
        </div>
      </div>
      <div className="workbench-entity-card__content">
        <div className="workbench-entity-card__main">
          <p className="workbench-entity-card__title">未命名设定</p>
          <p className="workbench-entity-card__description">人物 · 编辑中</p>
        </div>
        <div className="workbench-entity-card__aside">
          <WorkbenchStatusBadge tone="info" label="新建" />
        </div>
      </div>
    </div>
  )
}

export function SlotThumb({ slot, className, fit = 'cover' }: { slot?: AssetSlotRecord; className?: string; fit?: MediaFit }) {
  const preview = slotPreview(slot)
  if (!preview.src) {
    return <WorkbenchThumbnail icon={slotKindIcon(slot?.kind)} fit={fit} className={className} />
  }
  return preview.video
    ? (
      <WorkbenchThumbnail fit={fit} className={className}>
        <AuthedVideo src={preview.src} className={fit === 'contain' ? 'bg-black' : undefined} muted playsInline />
      </WorkbenchThumbnail>
    )
    : (
      <WorkbenchThumbnail fit={fit} className={className}>
        <AuthedImage src={preview.src} alt={slot?.name ?? ''} className={fit === 'contain' ? 'bg-muted' : undefined} />
      </WorkbenchThumbnail>
    )
}

export function SlotStatusBadge({ status }: { status: SlotStatus }) {
  const meta = {
    missing: { label: '缺少', tone: 'warning' as const },
    candidate: { label: '待选择', tone: 'info' as const },
    locked: { label: '已选定', tone: 'success' as const },
    waived: { label: '不需要', tone: 'neutral' as const },
  }[status]
  return <WorkbenchStatusBadge tone={meta.tone} label={meta.label} />
}

export function EmptyPreview({ title, description }: { title: string; description: string }) {
  return <WorkbenchEmptyState title={title} description={description} compact />
}

function ReferenceClusterButton({
  cluster,
  selected,
  onSelect,
  onContextMenu,
}: {
  cluster: ReferenceAssetCluster
  selected: boolean
  onSelect: () => void
  onContextMenu?: (event: MouseEvent) => void
}) {
  const title = referenceTitle(cluster.reference)
  const previews = clusterPreviewSlots(cluster)
  return (
    <button
      onClick={onSelect}
      onContextMenu={onContextMenu}
      className={cn(
        'w-full rounded-md border p-2 text-left transition-colors hover:border-primary/50',
        selected ? 'border-primary bg-primary/5' : 'border-border bg-background',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate type-label font-semibold text-foreground">{title}</p>
          <p className="mt-0.5 truncate type-tiny text-muted-foreground">{referenceKindLabel(cluster.reference?.kind)}</p>
        </div>
        <Badge variant="outline" className="type-tiny">{cluster.rows.length}</Badge>
      </div>
      {previews.locked.length > 0 || previews.candidates.length > 0 ? (
        <div className="mt-2 space-y-1.5">
          {previews.locked.length > 0 ? (
            <ClusterPreviewStrip label="已选" tone="locked" previews={previews.locked} />
          ) : null}
          {previews.candidates.length > 0 ? (
            <ClusterPreviewStrip label="待选" tone="candidate" previews={previews.candidates} />
          ) : null}
        </div>
      ) : null}
      <div className="mt-2 grid grid-cols-3 gap-1 type-tiny">
        <span className="rounded bg-amber-500/10 px-1.5 py-1 text-amber-700 dark:text-amber-300">缺 {cluster.missing}</span>
        <span className="rounded bg-sky-500/10 px-1.5 py-1 text-sky-700 dark:text-sky-300">待选 {cluster.candidate}</span>
        <span className="rounded bg-emerald-500/10 px-1.5 py-1 text-emerald-700 dark:text-emerald-300">已选 {cluster.locked}</span>
      </div>
    </button>
  )
}

function clusterPreviewSlots(cluster: ReferenceAssetCluster) {
  const locked = cluster.rows
    .filter((row) => row.lockedSlot)
    .map((row) => ({
      key: `locked-${row.slot.ID}-${row.lockedSlot?.ID}`,
      slot: row.lockedSlot,
      tone: 'locked' as const,
    }))
  const candidates = cluster.rows.flatMap((row) => row.candidates
    .filter((candidate) => {
      if (!candidate.candidate_asset_slot) return false
      if (candidate.status === 'selected') return false
      if (candidate.candidate_asset_slot_id === row.slot.locked_asset_slot_id) return false
      if (candidate.candidate_asset_slot_id === row.lockedSlot?.ID) return false
      return true
    })
    .map((candidate) => ({
      key: `candidate-${candidate.ID}`,
      slot: candidate.candidate_asset_slot,
      tone: 'candidate' as const,
    })))
  return {
    locked: locked.slice(0, 4),
    candidates: candidates.slice(0, 4),
  }
}

function ClusterPreviewStrip({
  label,
  tone,
  previews,
}: {
  label: string
  tone: 'locked' | 'candidate'
  previews: Array<{ key: string; slot?: AssetSlotRecord }>
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn(
        'w-7 shrink-0 text-[10px] leading-none',
        tone === 'locked' ? 'text-emerald-700 dark:text-emerald-300' : 'text-sky-700 dark:text-sky-300',
      )}>
        {label}
      </span>
      <div className="flex min-w-0 gap-1 overflow-hidden">
        {previews.map((preview) => (
          <SlotThumb
            key={preview.key}
            slot={preview.slot}
            className={cn(
              'h-9 w-12 shrink-0 rounded border',
              tone === 'locked'
                ? 'border-emerald-500/40 ring-1 ring-emerald-500/30'
                : 'border-sky-500/30 opacity-85',
            )}
          />
        ))}
      </div>
    </div>
  )
}

function DraftReferenceClusterButton() {
  return (
    <div className="w-full rounded-md border border-primary bg-primary/5 p-2 text-left ring-1 ring-primary/30">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate type-label font-semibold text-foreground">未命名设定</p>
          <p className="mt-0.5 truncate type-tiny text-muted-foreground">人物 · 编辑中</p>
        </div>
        <Badge variant="outline" className="type-tiny">新建</Badge>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1 type-tiny">
        <span className="rounded bg-amber-500/10 px-1.5 py-1 text-amber-700 dark:text-amber-300">缺 0</span>
        <span className="rounded bg-sky-500/10 px-1.5 py-1 text-sky-700 dark:text-sky-300">待选 0</span>
        <span className="rounded bg-emerald-500/10 px-1.5 py-1 text-emerald-700 dark:text-emerald-300">已选 0</span>
      </div>
    </div>
  )
}

function ReferenceAssetTile({
  row,
  reference,
  selected,
  onSelect,
  onContextMenu,
}: {
  row: AssetSlotViewModel
  reference?: CreativeReferenceRecord | null
  selected: boolean
  onSelect: () => void
  onContextMenu?: (event: MouseEvent) => void
}) {
  const status = normalizeSlotStatus(row.slot.status)
  const referenceLabel = reference ? referenceTitle(reference) : undefined
  return (
    <WorkbenchEntityCard
      onClick={onSelect}
      onContextMenu={onContextMenu}
      active={selected}
      media={<SlotThumb slot={row.lockedSlot ?? row.slot} className="h-16 w-20" />}
      title={row.slot.name || `素材 #${row.slot.ID}`}
      description={[assetKindLabel(row.kind), referenceLabel, `${row.candidates.length} 个可选素材`].filter(Boolean).join(' · ')}
      status={<SlotStatusBadge status={status} />}
    />
  )
}

function referenceForRow(clusters: ReferenceAssetCluster[], row: AssetSlotViewModel) {
  if (!row.slot.creative_reference_id) return null
  return clusters.find((cluster) => cluster.reference?.ID === row.slot.creative_reference_id)?.reference ?? null
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

function slotKindIcon(kind?: string): LucideIcon {
  if (kind === 'video') return Video
  if (kind === 'audio') return FileAudio
  if (kind === 'text') return FileText
  return Image
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
