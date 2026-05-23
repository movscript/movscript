import { useState, type MouseEvent, type ReactNode } from 'react'
import { ChevronDown, ChevronUp, FileAudio, FileText, Image, PackageCheck, Sparkles, Video, type LucideIcon } from 'lucide-react'

import { AuthedImage, AuthedVideo } from '@/components/shared/AuthedImage'
import {
  semanticToneClass,
  WorkbenchEmptyState,
  WorkbenchEntityCard,
  WorkbenchSection,
  WorkbenchStatusBadge,
  WorkbenchThumbnail,
} from '@movscript/ui'
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
import { assetCoverage, assetSlotAction } from '@/lib/productionTerminology'
import { cn } from '@/lib/utils'
import type { RawResource } from '@/types'
import { Badge, Button } from '@movscript/ui'

const assetKindOrder: AssetKind[] = ['all', 'image', 'video', 'audio', 'text', 'brand_pack', 'reference', 'other']

type MediaFit = 'cover' | 'contain'
type PreparationView = 'queue' | 'grouped' | 'missing' | 'locked'
type QueueSection = 'references' | 'assets'
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
  const [queueCollapsed, setQueueCollapsed] = useState<Record<QueueSection, boolean>>({
    references: false,
    assets: false,
  })
  const selectedClusterRows = selectedCluster?.rows ?? []
  const visibleRows = view === 'missing'
    ? rows.filter((row) => normalizeSlotStatus(row.slot.status) === 'missing')
    : view === 'locked'
      ? rows.filter((row) => normalizeSlotStatus(row.slot.status) === 'locked')
      : rows
  const queueReferenceRows = clusters.filter((cluster) => cluster.reference)
  const viewOptions: Array<{ value: PreparationView; label: string; count: number }> = [
    { value: 'queue', label: '全部准备项', count: clusters.length + rows.length + (creatingReference ? 1 : 0) },
    { value: 'grouped', label: '按设定分组', count: clusters.length + (creatingReference ? 1 : 0) },
    { value: 'missing', label: '素材缺口', count: rows.filter((row) => normalizeSlotStatus(row.slot.status) === 'missing').length },
    { value: 'locked', label: '已选资产', count: rows.filter((row) => normalizeSlotStatus(row.slot.status) === 'locked').length },
  ]
  function toggleQueueSection(section: QueueSection) {
    setQueueCollapsed((current) => {
      const next = { ...current, [section]: !current[section] }
      if (next.references && next.assets) {
        return section === 'references'
          ? { references: true, assets: false }
          : { references: false, assets: true }
      }
      return next
    })
  }
  function focusQueueSection(section: QueueSection) {
    setQueueCollapsed(section === 'references'
      ? { references: false, assets: true }
      : { references: true, assets: false })
  }
  function showAllQueueSections() {
    setQueueCollapsed({ references: false, assets: false })
  }

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
                    : '设定和素材并列展示，先看全局准备清单，再进入具体检查器处理。'}
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
          {view === 'queue' ? (
            <div className="flex min-h-[520px] min-w-0 flex-col gap-3 overflow-hidden xl:min-h-0 xl:flex-1">
              {queueCollapsed.references ? (
                <CollapsedQueueSection
                  title="设定"
                  count={queueReferenceRows.length + (creatingReference ? 1 : 0)}
                  onExpand={() => toggleQueueSection('references')}
                />
              ) : (
                <QueueSectionPanel
                  title="设定"
                  detail={`${queueReferenceRows.length + (creatingReference ? 1 : 0)} 项`}
                  description="人物、地点、道具、风格等可复用设定，先确保归属和上下文清晰。"
                  className={queueCollapsed.assets ? 'flex-1' : 'basis-[44%]'}
                  onCollapse={() => toggleQueueSection('references')}
                  onFocus={() => focusQueueSection('references')}
                  focusLabel="只看设定"
                  onShowAll={queueCollapsed.assets ? showAllQueueSections : undefined}
                >
                  {creatingReference || queueReferenceRows.length > 0 ? (
                    <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
                      {creatingReference ? <DraftReferencePrepItem /> : null}
                      {queueReferenceRows.map((cluster) => (
                        <ReferencePrepItem
                          key={cluster.reference?.ID}
                          cluster={cluster}
                          selected={(selectedReference?.ID ?? 0) === cluster.reference?.ID && !selected}
                          onSelect={() => cluster.reference?.ID && onSelectReference(cluster.reference.ID)}
                          onContextMenu={(event) => cluster.reference?.ID && onCardContextMenu?.(event, { type: 'reference', id: cluster.reference.ID })}
                        />
                      ))}
                    </div>
                  ) : (
                    <EmptyPreview title="暂无设定" description="先创建设定，再为它添加要准备的素材。" />
                  )}
                </QueueSectionPanel>
              )}

              {queueCollapsed.assets ? (
                <CollapsedQueueSection
                  title="素材"
                  count={visibleRows.length}
                  onExpand={() => toggleQueueSection('assets')}
                />
              ) : (
                <QueueSectionPanel
                  title="素材"
                  detail={`${visibleRows.length} 项`}
                  description="图片、视频、音频和文本素材需求，集中处理候选、缺口和已选资产。"
                  className={queueCollapsed.references ? 'flex-1' : 'basis-[56%]'}
                  onCollapse={() => toggleQueueSection('assets')}
                  onFocus={() => focusQueueSection('assets')}
                  focusLabel="只看素材"
                  onShowAll={queueCollapsed.references ? showAllQueueSections : undefined}
                >
                  {visibleRows.length > 0 ? (
                    <AssetGrid
                      rows={visibleRows}
                      clusters={clusters}
                      selected={selected}
                      onSelectSlot={onSelectSlot}
                      onCardContextMenu={onCardContextMenu}
                      showReference
                    />
                  ) : (
                    <EmptyPreview title="暂无素材" description="为设定创建图片、视频、音频或文本素材需求。" />
                  )}
                </QueueSectionPanel>
              )}
            </div>
          ) : (
            <div className="space-y-4 pr-1 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
              <AssetGrid
                rows={visibleRows}
                clusters={clusters}
                selected={selected}
                onSelectSlot={onSelectSlot}
                onCardContextMenu={onCardContextMenu}
                showReference
              />
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function QueueSectionPanel({
  title,
  detail,
  description,
  className,
  children,
  onCollapse,
  onFocus,
  focusLabel,
  onShowAll,
}: {
  title: string
  detail: string
  description: string
  className?: string
  children: ReactNode
  onCollapse: () => void
  onFocus: () => void
  focusLabel: string
  onShowAll?: () => void
}) {
  return (
    <WorkbenchSection
      icon={PackageCheck}
      title={title}
      description={description}
      className={cn('flex min-h-[180px] min-w-0 flex-col', className)}
      bodyClassName="min-h-0 flex-1 overflow-y-auto p-3 pr-2"
      action={(
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          <WorkbenchStatusBadge tone="neutral" label={detail} />
          {onShowAll ? (
            <Button size="sm" variant="ghost" className="h-7 px-2 type-tiny" onClick={onShowAll}>
              全部
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" className="h-7 px-2 type-tiny" onClick={onFocus}>
            {focusLabel}
          </Button>
          <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 type-tiny" onClick={onCollapse}>
            <ChevronUp size={13} />
            折叠
          </Button>
        </div>
      )}
    >
      {children}
    </WorkbenchSection>
  )
}

function CollapsedQueueSection({
  title,
  count,
  onExpand,
}: {
  title: string
  count: number
  onExpand: () => void
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className="h-auto shrink-0 justify-between gap-3 border-dashed bg-muted/20 px-3 py-2 text-left hover:border-primary/50 hover:bg-muted/40 [&_.ms-button__content]:w-full [&_.ms-button__content]:justify-between"
      onClick={onExpand}
    >
      <span className="flex min-w-0 items-center gap-2">
        <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
        <span className="truncate type-label font-semibold text-foreground">{title}已折叠</span>
      </span>
      <WorkbenchStatusBadge tone="neutral" label={`${count} 项`} />
    </Button>
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
  const coverage = assetCoverage({
    total: cluster.rows.length,
    missing: cluster.missing,
    candidate: cluster.candidate,
    locked: cluster.locked,
  })
  return (
    <WorkbenchEntityCard
      onClick={onSelect}
      onContextMenu={onContextMenu}
      active={selected}
      media={<ReferencePrepMedia cluster={cluster} />}
      title={referenceTitle(cluster.reference)}
      description={`${referenceKindLabel(cluster.reference?.kind)} · ${cluster.rows.length} 个素材 · 缺 ${cluster.missing} · 待选 ${cluster.candidate}`}
      status={<WorkbenchStatusBadge tone={coverage.tone} label={coverage.label} />}
    />
  )
}

function ReferencePrepMedia({ cluster }: { cluster: ReferenceAssetCluster }) {
  const previews = referenceVisualPreviewSlots(cluster)
  if (previews.length === 0) {
    return (
      <div className="flex h-16 w-20 items-center justify-center rounded-md border border-border bg-muted/30 text-muted-foreground">
        <Sparkles size={18} />
      </div>
    )
  }
  if (previews.length === 1) {
    return <SlotThumb slot={previews[0]} className="h-16 w-20" />
  }
  return (
    <div className="relative h-16 w-20 overflow-hidden rounded-md border border-border bg-muted/30 p-1">
      <div className="grid h-full grid-cols-2 grid-rows-2 gap-1">
        {previews.slice(0, 4).map((slot) => (
          <SlotThumb key={slot.ID} slot={slot} className="h-full w-full rounded-[3px] border-0" />
        ))}
      </div>
      {previews.length > 4 ? (
        <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 type-tiny leading-4 text-white">
          +{previews.length - 4}
        </span>
      ) : null}
    </div>
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
  const action = assetSlotAction({ status })
  return <WorkbenchStatusBadge tone={action.tone} label={action.label} />
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
    <WorkbenchEntityCard
      onClick={onSelect}
      onContextMenu={onContextMenu}
      active={selected}
      title={title}
      description={referenceKindLabel(cluster.reference?.kind)}
      status={<WorkbenchStatusBadge tone="neutral" label={cluster.rows.length} />}
      className="w-full p-2 hover:border-primary/50"
    >
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
        <CountPill tone="warning" label={`缺 ${cluster.missing}`} />
        <CountPill tone="info" label={`待选 ${cluster.candidate}`} />
        <CountPill tone="success" label={`已选 ${cluster.locked}`} />
      </div>
    </WorkbenchEntityCard>
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

function referenceVisualPreviewSlots(cluster: ReferenceAssetCluster) {
  const previews: AssetSlotRecord[] = []
  const seen = new Set<number>()
  const add = (slot?: AssetSlotRecord) => {
    if (!slot || seen.has(slot.ID) || !slotHasVisualPreview(slot)) return
    seen.add(slot.ID)
    previews.push(slot)
  }
  for (const row of cluster.rows) add(row.lockedSlot)
  for (const row of cluster.rows) add(row.slot)
  for (const row of cluster.rows) {
    for (const candidate of row.candidates) add(candidate.candidate_asset_slot)
  }
  return previews
}

function slotHasVisualPreview(slot?: AssetSlotRecord) {
  const resource = slot?.resource
  if (!resource?.url) return false
  return resource.type === 'image'
    || resource.type === 'video'
    || resource.mime_type?.startsWith('image/')
    || resource.mime_type?.startsWith('video/')
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
        tone === 'locked' ? semanticToneClass('success', 'icon') : semanticToneClass('info', 'icon'),
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
                ? cn(semanticToneClass('success', 'surface'), 'ring-1')
                : cn(semanticToneClass('info', 'surface'), 'opacity-85'),
            )}
          />
        ))}
      </div>
    </div>
  )
}

function DraftReferenceClusterButton() {
  return (
    <WorkbenchEntityCard
      title="未命名设定"
      description="人物 · 编辑中"
      status={<WorkbenchStatusBadge tone="info" label="新建" />}
      active
      className="w-full p-2"
    >
      <div className="mt-2 grid grid-cols-3 gap-1 type-tiny">
        <CountPill tone="warning" label="缺 0" />
        <CountPill tone="info" label="待选 0" />
        <CountPill tone="success" label="已选 0" />
      </div>
    </WorkbenchEntityCard>
  )
}

function CountPill({ tone, label }: { tone: 'warning' | 'info' | 'success'; label: string }) {
  return <WorkbenchStatusBadge tone={tone} label={label} className="w-full" />
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
