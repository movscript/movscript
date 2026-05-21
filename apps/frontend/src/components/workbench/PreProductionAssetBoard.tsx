import { FileAudio, FileText, Image, PackageCheck, Video, type LucideIcon } from 'lucide-react'

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
            <p className="type-body font-semibold text-foreground">设定和素材</p>
            <p className="mt-1 type-label text-muted-foreground">左侧选择人物、地点、道具或风格；右侧维护它下面的素材。</p>
          </div>
          <Badge variant="outline" className="type-tiny">{clusters.length + (creatingReference ? 1 : 0)} 个设定</Badge>
        </div>
      </div>
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
              />
            ))}
          </div>
        </aside>

        <div className="min-w-0 p-3 xl:flex xl:min-h-0 xl:flex-col">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3 xl:shrink-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2 type-label text-muted-foreground">
                <PackageCheck size={14} />
                <span>{referenceTitle(selectedReference)}</span>
                <span>·</span>
                <span>{rows.length} 个素材</span>
              </div>
              <p className="mt-1 line-clamp-2 type-label text-muted-foreground">{referenceDescription(selectedReference)}</p>
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
          <p className="truncate type-label font-semibold text-foreground">{title}</p>
          <p className="mt-0.5 truncate type-tiny text-muted-foreground">{referenceKindLabel(cluster.reference?.kind)}</p>
        </div>
        <Badge variant="outline" className="type-tiny">{cluster.rows.length}</Badge>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1 type-tiny">
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

function ReferenceAssetTile({ row, selected, onSelect }: { row: AssetSlotViewModel; selected: boolean; onSelect: () => void }) {
  const status = normalizeSlotStatus(row.slot.status)
  return (
    <WorkbenchEntityCard
      onClick={onSelect}
      active={selected}
      media={<SlotThumb slot={row.lockedSlot ?? row.slot} className="h-16 w-20" />}
      title={row.slot.name || `素材 #${row.slot.ID}`}
      description={`${assetKindLabel(row.kind)} · ${row.candidates.length} 个可选素材`}
      status={<SlotStatusBadge status={status} />}
    />
  )
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
