import { useState, type MouseEvent, type ReactNode } from 'react'
import { ChevronDown, ChevronUp, FileAudio, FileText, Image, PackageCheck, Sparkles, Video, type LucideIcon } from 'lucide-react'

import { AuthedImage, AuthedVideo } from '@/shared/ui/AuthedImage'
import {
  ResourcePrepAssetGrid,
  ResourcePrepBoardHeader,
  ResourcePrepBoardRoot,
  ResourcePrepCollapsedQueueButton,
  ResourcePrepEmptyState,
  ResourcePrepEntityCard,
  ResourcePrepEntityCard as WorkbenchEntityCard,
  ResourcePrepFilterButton,
  ResourcePrepFilterGroup,
  ResourcePrepGroupedLayout,
  ResourcePrepInlineHeader,
  ResourcePrepLoadingState,
  ResourcePrepMediaBackdrop,
  ResourcePrepPreviewGrid,
  ResourcePrepPreviewOverflow,
  ResourcePrepQueueActionButton,
  ResourcePrepQueueActions,
  ResourcePrepQueueArea,
  ResourcePrepQueueSection,
  ResourcePrepQueueStack,
  ResourcePrepScrollStack,
  ResourcePrepSidebar,
  ResourcePrepSidebarHeader,
  ResourcePrepSidebarList,
  ResourcePrepStatusBadge,
  ResourcePrepSummaryCard,
  ResourcePrepSummaryPreviewStack,
  ResourcePrepSummaryPreviewStrip,
  ResourcePrepSummaryStatusGrid,
  ResourcePrepThumbnail,
  ResourcePrepViewButton,
  ResourcePrepViewTabs,
  ResourcePrepWorkArea,
} from '@movscript/ui'
import { API_BASE_URL } from '@/shared/infrastructure/config'
import {
  assetKindLabel,
  normalizeSlotStatus,
  type AssetKind,
  type AssetSlotRecord,
  type AssetSlotViewModel,
  type CreativeReferenceRecord,
  type ReferenceAssetCluster,
  type SlotStatus,
} from '@/features/pre-production/domain/preProductionAssetRows'
import { assetCoverage, assetSlotAction } from '@/shared/domain/productionTerminology'
import type { RawResource } from '@/types'
import {
  preProductionCountRecipe,
  preProductionCoverageRecipe,
  preProductionDraftRecipe,
  preProductionQueueDetailRecipe,
  preProductionSlotActionRecipe,
} from '@/features/pre-production/presentation/preProductionSemanticUi'

const assetKindOrder: AssetKind[] = ['all', 'image', 'video', 'audio', 'text', 'brand_pack', 'reference', 'other']
void WorkbenchEntityCard

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
    <ResourcePrepBoardRoot>
      <ResourcePrepBoardHeader
        title="前期准备项"
        description="把设定资料、素材需求和已选资产放在同一张准备清单里推进。"
        count={`${clusters.length + rows.length + (creatingReference ? 1 : 0)} 项`}
        actions={actions}
      >
        <ResourcePrepViewTabs>
          {viewOptions.map((option) => (
            <ResourcePrepViewButton
              key={option.value}
              active={view === option.value}
              count={option.count}
              onClick={() => setView(option.value)}
            >
              {option.label}
            </ResourcePrepViewButton>
          ))}
        </ResourcePrepViewTabs>
      </ResourcePrepBoardHeader>

      {view === 'grouped' ? (
        <ResourcePrepGroupedLayout>
          <ResourcePrepSidebar>
            <ResourcePrepSidebarHeader title="设定" count={clusters.length} />
            {loading ? <ResourcePrepLoadingState>加载中</ResourcePrepLoadingState> : null}
            {!loading && clusters.length === 0 && !creatingReference ? <EmptyPreview title="暂无前期资料" description="先创建设定，再为它添加要准备的素材。" /> : null}
            <ResourcePrepSidebarList>
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
            </ResourcePrepSidebarList>
          </ResourcePrepSidebar>

          <ResourcePrepWorkArea>
            <AssetListHeader
              title={referenceTitle(selectedReference)}
              detail={`${selectedClusterRows.length} 个素材`}
              description={referenceDescription(selectedReference)}
              kindFilter={kindFilter}
              onKindChange={onKindChange}
            />
            {loading ? <ResourcePrepLoadingState>加载中</ResourcePrepLoadingState> : null}
            {!loading && selectedClusterRows.length === 0 ? <EmptyPreview title="没有关联素材" description="为这个设定创建图片、视频、音频或文本素材。" /> : null}
            <AssetGrid
              rows={selectedClusterRows}
              clusters={clusters}
              selected={selected}
              onSelectSlot={onSelectSlot}
              onCardContextMenu={onCardContextMenu}
              showReference={false}
            />
          </ResourcePrepWorkArea>
        </ResourcePrepGroupedLayout>
      ) : (
        <ResourcePrepQueueArea>
          <AssetListHeader
            title={view === 'missing' ? '素材缺口' : view === 'locked' ? '已选资产' : '全部准备项'}
            detail={`${visibleRows.length} 个素材`}
            description={view === 'missing'
              ? '直接处理缺少素材的准备项，不被设定层级打断。'
              : view === 'locked'
                ? '查看已经锁定、可以交给下游使用的资产。'
                : '设定和素材并列展示，先看全局准备清单，再进入具体检查器处理。'}
            kindFilter={kindFilter}
            onKindChange={onKindChange}
          />
          {loading ? <ResourcePrepLoadingState>加载中</ResourcePrepLoadingState> : null}
          {!loading && view === 'queue' && clusters.length === 0 && visibleRows.length === 0 && !creatingReference ? <EmptyPreview title="暂无前期资料" description="先创建设定，或直接创建素材需求。" /> : null}
          {!loading && view !== 'queue' && visibleRows.length === 0 ? <EmptyPreview title={view === 'missing' ? '暂无素材缺口' : '暂无已选资产'} description={view === 'missing' ? '当前筛选下没有缺少素材的准备项。' : '锁定候选后，已选资产会出现在这里。'} /> : null}
          {view === 'queue' ? (
            <ResourcePrepQueueStack>
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
                  span={queueCollapsed.assets ? 'fill' : 'references'}
                  onCollapse={() => toggleQueueSection('references')}
                  onFocus={() => focusQueueSection('references')}
                  focusLabel="只看设定"
                  onShowAll={queueCollapsed.assets ? showAllQueueSections : undefined}
                >
                  {creatingReference || queueReferenceRows.length > 0 ? (
                    <ResourcePrepAssetGrid>
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
                    </ResourcePrepAssetGrid>
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
                  span={queueCollapsed.references ? 'fill' : 'assets'}
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
            </ResourcePrepQueueStack>
          ) : (
            <ResourcePrepScrollStack>
              <AssetGrid
                rows={visibleRows}
                clusters={clusters}
                selected={selected}
                onSelectSlot={onSelectSlot}
                onCardContextMenu={onCardContextMenu}
                showReference
              />
            </ResourcePrepScrollStack>
          )}
        </ResourcePrepQueueArea>
      )}
    </ResourcePrepBoardRoot>
  )
}

function QueueSectionPanel({
  title,
  detail,
  description,
  span,
  children,
  onCollapse,
  onFocus,
  focusLabel,
  onShowAll,
}: {
  title: string
  detail: string
  description: string
  span?: 'auto' | 'fill' | 'references' | 'assets'
  children: ReactNode
  onCollapse: () => void
  onFocus: () => void
  focusLabel: string
  onShowAll?: () => void
}) {
  return (
    <ResourcePrepQueueSection
      title={title}
      description={description}
      span={span}
      action={(
        <ResourcePrepQueueActions>
          <ResourcePrepStatusBadge {...preProductionQueueDetailRecipe()} label={detail} />
          {onShowAll ? (
            <ResourcePrepQueueActionButton onClick={onShowAll}>
              全部
            </ResourcePrepQueueActionButton>
          ) : null}
          <ResourcePrepQueueActionButton onClick={onFocus}>
            {focusLabel}
          </ResourcePrepQueueActionButton>
          <ResourcePrepQueueActionButton onClick={onCollapse}>
            <ChevronUp size={13} />
            折叠
          </ResourcePrepQueueActionButton>
        </ResourcePrepQueueActions>
      )}
    >
      {children}
    </ResourcePrepQueueSection>
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
    <ResourcePrepCollapsedQueueButton
      title={`${title}已折叠`}
      status={<ResourcePrepStatusBadge {...preProductionQueueDetailRecipe()} label={`${count} 项`} />}
      icon={<ChevronDown size={14} />}
      onClick={onExpand}
    />
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
    <ResourcePrepInlineHeader
      icon={PackageCheck}
      title={title}
      detail={detail}
      description={description}
      actions={(
        <ResourcePrepFilterGroup>
        {assetKindOrder.map((kind) => (
          <ResourcePrepFilterButton
            key={kind}
            active={kindFilter === kind}
            onClick={() => onKindChange(kind)}
          >
            {kind === 'all' ? '全部' : assetKindLabel(kind)}
          </ResourcePrepFilterButton>
        ))}
        </ResourcePrepFilterGroup>
      )}
    />
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
    <ResourcePrepAssetGrid>
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
    </ResourcePrepAssetGrid>
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
    <ResourcePrepEntityCard
      onClick={onSelect}
      onContextMenu={onContextMenu}
      active={selected}
      media={<ReferencePrepMedia cluster={cluster} />}
      title={referenceTitle(cluster.reference)}
      description={`${referenceKindLabel(cluster.reference?.kind)} · ${cluster.rows.length} 个素材 · 缺 ${cluster.missing} · 待选 ${cluster.candidate}`}
      status={<ResourcePrepStatusBadge {...preProductionCoverageRecipe(coverage.state)} label={coverage.label} />}
    />
  )
}

function ReferencePrepMedia({ cluster }: { cluster: ReferenceAssetCluster }) {
  const previews = referenceVisualPreviewSlots(cluster)
  if (previews.length === 0) {
    return (
      <ResourcePrepThumbnail icon={Sparkles} />
    )
  }
  if (previews.length === 1) return <SlotThumb slot={previews[0]} />
  return (
    <ResourcePrepThumbnail>
      <ResourcePrepPreviewGrid>
        {previews.slice(0, 4).map((slot) => (
          <SlotThumb key={slot.ID} slot={slot} frame="fill" />
        ))}
      </ResourcePrepPreviewGrid>
      {previews.length > 4 ? (
        <ResourcePrepPreviewOverflow>
          +{previews.length - 4}
        </ResourcePrepPreviewOverflow>
      ) : null}
    </ResourcePrepThumbnail>
  )
}

function DraftReferencePrepItem() {
  return (
    <ResourcePrepEntityCard
      active
      data-draft
      media={(
        <ResourcePrepThumbnail icon={Sparkles} frame="draft" />
      )}
      title="未命名设定"
      description="人物 · 编辑中"
      status={<ResourcePrepStatusBadge {...preProductionDraftRecipe()} label="新建" />}
    />
  )
}

export function SlotThumb({ slot, fit = 'cover', ratio = 'default', frame = 'card' }: { slot?: AssetSlotRecord; fit?: MediaFit; ratio?: 'square' | 'wide' | 'banner' | 'default'; frame?: 'card' | 'strip' | 'fill' | 'banner' | 'draft' }) {
  const preview = slotPreview(slot)
  if (!preview.src) {
    return <ResourcePrepThumbnail icon={slotKindIcon(slot?.kind)} fit={fit} ratio={ratio} frame={frame} />
  }
  return preview.video
    ? (
      <ResourcePrepThumbnail fit={fit} ratio={ratio} frame={frame}>
        <ResourcePrepMediaBackdrop tone={fit === 'contain' ? 'dark' : 'none'}>
          <AuthedVideo src={preview.src} muted playsInline />
        </ResourcePrepMediaBackdrop>
      </ResourcePrepThumbnail>
    )
    : (
      <ResourcePrepThumbnail fit={fit} ratio={ratio} frame={frame}>
        <ResourcePrepMediaBackdrop tone={fit === 'contain' ? 'muted' : 'none'}>
          <AuthedImage src={preview.src} alt={slot?.name ?? ''} />
        </ResourcePrepMediaBackdrop>
      </ResourcePrepThumbnail>
    )
}

export function SlotStatusBadge({ status }: { status: SlotStatus }) {
  const action = assetSlotAction({ status })
  return <ResourcePrepStatusBadge {...preProductionSlotActionRecipe(action.state)} label={action.label} />
}

export function EmptyPreview({ title, description }: { title: string; description: string }) {
  return <ResourcePrepEmptyState title={title} description={description} compact />
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
    <ResourcePrepSummaryCard
      onClick={onSelect}
      onContextMenu={onContextMenu}
      active={selected}
      title={title}
      description={referenceKindLabel(cluster.reference?.kind)}
      status={<ResourcePrepStatusBadge {...preProductionQueueDetailRecipe()} label={cluster.rows.length} />}
    >
      {previews.locked.length > 0 || previews.candidates.length > 0 ? (
        <ResourcePrepSummaryPreviewStack>
          {previews.locked.length > 0 ? (
            <ClusterPreviewStrip label="已选" state="locked" previews={previews.locked} />
          ) : null}
          {previews.candidates.length > 0 ? (
            <ClusterPreviewStrip label="待选" state="candidate" previews={previews.candidates} />
          ) : null}
        </ResourcePrepSummaryPreviewStack>
      ) : null}
      <ResourcePrepSummaryStatusGrid>
        <CountPill kind="missing" label={`缺 ${cluster.missing}`} />
        <CountPill kind="candidate" label={`待选 ${cluster.candidate}`} />
        <CountPill kind="locked" label={`已选 ${cluster.locked}`} />
      </ResourcePrepSummaryStatusGrid>
    </ResourcePrepSummaryCard>
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
  state,
  previews,
}: {
  label: string
  state: 'locked' | 'candidate'
  previews: Array<{ key: string; slot?: AssetSlotRecord }>
}) {
  return (
    <ResourcePrepSummaryPreviewStrip label={label} state={state}>
      {previews.map((preview) => (
        <SlotThumb key={preview.key} slot={preview.slot} frame="strip" />
      ))}
    </ResourcePrepSummaryPreviewStrip>
  )
}

function DraftReferenceClusterButton() {
  return (
    <ResourcePrepSummaryCard
      title="未命名设定"
      description="人物 · 编辑中"
      status={<ResourcePrepStatusBadge {...preProductionDraftRecipe()} label="新建" />}
      active
    >
      <ResourcePrepSummaryStatusGrid>
        <CountPill kind="missing" label="缺 0" />
        <CountPill kind="candidate" label="待选 0" />
        <CountPill kind="locked" label="已选 0" />
      </ResourcePrepSummaryStatusGrid>
    </ResourcePrepSummaryCard>
  )
}

function CountPill({ kind, label }: { kind: 'missing' | 'candidate' | 'locked'; label: string }) {
  return <ResourcePrepStatusBadge {...preProductionCountRecipe(kind)} label={label} data-fill />
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
    <ResourcePrepEntityCard
      onClick={onSelect}
      onContextMenu={onContextMenu}
      active={selected}
      media={<SlotThumb slot={row.lockedSlot ?? row.slot} />}
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
