import { type ElementType, type ReactNode, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  FileAudio,
  FileText,
  Filter,
  Image,
  Layers3,
  Lock,
  PackageCheck,
  Plus,
  Search,
  Sparkles,
  Upload,
  Video,
  Wand2,
  X,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { API_BASE_URL as API_BASE } from '@/lib/config'
import type { Asset, AssetView, RawResource, Setting, PaginatedResponse } from '@/types'
import { useProjectStore } from '@/store/projectStore'
import { CreateDialog } from '@/components/shared/CreateDialog'
import { AssetCreateForm } from '@/components/shared/EntityCreateForms'
import { AuthedImage, AuthedVideo } from '@/components/shared/AuthedImage'
import { normalizeSettingStateTags, settingStatusLabel } from '@/components/settings/SettingDetailEditor'
import { cn } from '@/lib/utils'
import { Button } from '@movscript/ui'
import { useTranslation } from 'react-i18next'

type AssetSlotStatus = 'missing' | 'candidate' | 'locked' | 'waived'
type AssetSlotKind = 'image' | 'video' | 'audio' | 'brand'
type AssetSlotPriority = 'high' | 'medium' | 'low'
type StatusFilter = 'active' | AssetSlotStatus

interface AssetSlot {
  id: string
  title: string
  description: string
  kind: AssetSlotKind
  priority: AssetSlotPriority
  scope: string
  cue: string
  status: AssetSlotStatus
  candidateAssetIds: number[]
  lockedAssetId?: number
}

const STATUS_ORDER: AssetSlotStatus[] = ['missing', 'candidate', 'locked', 'waived']
const PAGE_SIZE = 18

const FALLBACK_ASSET_SLOTS: AssetSlot[] = [
  {
    id: 'rain-injury-front',
    title: '林夏雨夜受伤状态 · 正面半身参考',
    description: '需要能稳定表达发丝湿透、肩部擦伤、克制紧张的主视觉参考。',
    kind: 'image',
    priority: 'high',
    scope: '片段 03 · 巷口对峙',
    cue: '雨夜、冷光、半身、伤痕、同一人物连续性',
    status: 'missing',
    candidateAssetIds: [],
  },
  {
    id: 'umbrella-note-closeup',
    title: '旧伞纸条特写',
    description: '道具特写需要读得清纸条边缘、伞骨破损和手写痕迹。',
    kind: 'image',
    priority: 'high',
    scope: '片段 05 · 纸条揭示',
    cue: '旧伞、潮湿纸条、手写字、微距、浅景深',
    status: 'candidate',
    candidateAssetIds: [],
  },
  {
    id: 'rain-alley-env',
    title: '雨夜巷口环境',
    description: '环境参考已可用于关键帧和图生视频，需保持霓虹反光和纵深方向。',
    kind: 'video',
    priority: 'medium',
    scope: '片段 03-06 · 连续场景',
    cue: '窄巷、积水、蓝绿色霓虹、远处车灯、雨线',
    status: 'locked',
    candidateAssetIds: [],
  },
  {
    id: 'brand-police-badge',
    title: '虚构警署徽章规范',
    description: '制服和证件画面需要统一图形规范，避免生产阶段出现不同版本。',
    kind: 'brand',
    priority: 'medium',
    scope: '人物设定 · 周明',
    cue: '虚构徽章、冷色金属、简化纹章、禁止真实标识',
    status: 'missing',
    candidateAssetIds: [],
  },
  {
    id: 'phone-voice-message',
    title: '电话留言音色参考',
    description: '需要一段压缩感明显的语音或音效参考，支持后续声音轨生产。',
    kind: 'audio',
    priority: 'low',
    scope: '片段 08 · 留言回放',
    cue: '手机听筒、轻微底噪、迟疑停顿、低声',
    status: 'waived',
    candidateAssetIds: [],
  },
]

function viewMediaSrc(view: AssetView): string | undefined {
  if (view.resource?.url) return `${API_BASE}${view.resource.url}`
  if (view.image_url) return view.image_url.startsWith('http') ? view.image_url : `${API_BASE}${view.image_url}`
  return undefined
}

function resourceMediaSrc(resource?: RawResource): string | undefined {
  if (!resource?.url) return undefined
  return `${API_BASE}${resource.url}`
}

function isVideoResource(view: AssetView): boolean {
  if (view.resource?.type === 'video') return true
  if (view.resource?.mime_type?.startsWith('video/')) return true
  return false
}

function isVideoRawResource(resource?: RawResource): boolean {
  return resource?.type === 'video' || !!resource?.mime_type?.startsWith('video/')
}

function settingTags(setting?: Setting): string[] {
  if (!setting?.tags) return []
  try {
    const parsed = JSON.parse(setting.tags)
    if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim()).filter(Boolean)
  } catch {
    return setting.tags.split(',').map((item) => item.trim()).filter(Boolean)
  }
  return []
}

function assetStateLabel(asset: Asset): string {
  return asset.state || asset.effective_status || asset.setting?.status || ''
}

function assetStateTags(asset: Asset): string[] {
  const state = assetStateLabel(asset)
  if (!asset.setting || !state) return []
  const states = normalizeSettingStateTags(asset.setting.state_tags, asset.setting.status)
  return states[state] ?? []
}

function uniqueTags(asset: Asset, limit = 3): string[] {
  return Array.from(new Set([...settingTags(asset.setting), ...assetStateTags(asset)])).slice(0, limit)
}

function assetPreviewSrc(asset?: Asset): { src?: string; isVideo: boolean } {
  if (!asset) return { isVideo: false }
  const firstView = asset.views?.[0]
  const src = resourceMediaSrc(asset.resource) ?? (firstView ? viewMediaSrc(firstView) : undefined)
  const isVideo = asset.resource ? isVideoRawResource(asset.resource) : firstView ? isVideoResource(firstView) : false
  return { src, isVideo }
}

function assetSubtitle(asset: Asset, t: (key: string, options?: Record<string, unknown>) => string): string {
  const settingName = asset.setting?.name || (asset.setting_id ? t('pages.assets.settingFallback', { id: asset.setting_id }) : t('pages.assets.unlinkedSetting'))
  const state = assetStateLabel(asset)
  return state ? `${settingName} / ${settingStatusLabel(state)}` : settingName
}

function statusMeta(status: AssetSlotStatus, t: (key: string) => string) {
  switch (status) {
    case 'missing':
      return { label: t('pages.assets.v2.status.missing'), icon: AlertCircle, className: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-900' }
    case 'candidate':
      return { label: t('pages.assets.v2.status.candidate'), icon: CircleDashed, className: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900' }
    case 'locked':
      return { label: t('pages.assets.v2.status.locked'), icon: Lock, className: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900' }
    case 'waived':
      return { label: t('pages.assets.v2.status.waived'), icon: X, className: 'bg-muted text-muted-foreground border-border' }
  }
}

function kindMeta(kind: AssetSlotKind, t: (key: string) => string) {
  switch (kind) {
    case 'image':
      return { label: t('pages.assets.v2.kinds.image'), icon: Image }
    case 'video':
      return { label: t('pages.assets.v2.kinds.video'), icon: Video }
    case 'audio':
      return { label: t('pages.assets.v2.kinds.audio'), icon: FileAudio }
    case 'brand':
      return { label: t('pages.assets.v2.kinds.brand'), icon: FileText }
  }
}

function priorityLabel(priority: AssetSlotPriority, t: (key: string) => string) {
  return t(`pages.assets.v2.priority.${priority}`)
}

function AssetThumb({ asset, className }: { asset?: Asset; className?: string }) {
  const { src, isVideo } = assetPreviewSrc(asset)

  if (!src) {
    return (
      <div className={cn('flex items-center justify-center bg-muted text-muted-foreground', className)}>
        <Image size={18} />
      </div>
    )
  }

  return isVideo
    ? <AuthedVideo src={src} className={cn('object-cover', className)} muted playsInline />
    : <AuthedImage src={src} alt={asset?.name ?? ''} className={cn('object-cover', className)} />
}

function AssetSlotStatusBadge({ status }: { status: AssetSlotStatus }) {
  const { t } = useTranslation()
  const meta = statusMeta(status, t)
  const Icon = meta.icon

  return (
    <span className={cn('inline-flex h-6 items-center gap-1 rounded-md border px-2 text-[11px] font-medium', meta.className)}>
      <Icon size={12} />
      {meta.label}
    </span>
  )
}

function AssetSlotCard({
  slot,
  selected,
  onSelect,
}: {
  slot: AssetSlot
  selected: boolean
  onSelect: () => void
}) {
  const { t } = useTranslation()
  const kind = kindMeta(slot.kind, t)
  const KindIcon = kind.icon

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-md border bg-background p-3 text-left transition-colors',
        selected ? 'border-primary shadow-sm ring-1 ring-primary/40' : 'border-border hover:border-primary/40 hover:bg-muted/20',
      )}
    >
      <div className="flex items-start gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40 text-muted-foreground">
          <KindIcon size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="line-clamp-2 text-sm font-medium leading-5 text-foreground">{slot.title}</p>
            <AssetSlotStatusBadge status={slot.status} />
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{slot.scope}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="rounded bg-muted px-1.5 py-0.5">{kind.label}</span>
        <span className="rounded bg-muted px-1.5 py-0.5">{priorityLabel(slot.priority, t)}</span>
        <span className="ml-auto">{t('pages.assets.v2.candidateCount', { count: slot.candidateAssetIds.length })}</span>
      </div>
    </button>
  )
}

function CandidateCard({
  asset,
  selected,
  compact,
  onClick,
}: {
  asset: Asset
  selected?: boolean
  compact?: boolean
  onClick?: () => void
}) {
  const { t } = useTranslation()
  const tags = uniqueTags(asset, compact ? 1 : 3)

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'min-w-0 overflow-hidden rounded-md border bg-card text-left transition-colors',
        selected ? 'border-primary ring-1 ring-primary/40' : 'border-border hover:border-primary/40',
      )}
    >
      <div className={cn('overflow-hidden bg-muted', compact ? 'h-20' : 'aspect-[4/3]')}>
        <AssetThumb asset={asset} className="h-full w-full" />
      </div>
      <div className="space-y-1 p-2">
        <p className="truncate text-xs font-medium text-foreground">{asset.name}</p>
        <p className="truncate text-[11px] text-muted-foreground">{assetSubtitle(asset, t)}</p>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.map((tag) => (
              <span key={tag} className="max-w-full truncate rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{tag}</span>
            ))}
          </div>
        )}
      </div>
    </button>
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

export function AssetGenerationWorkspace() {
  const { t } = useTranslation()
  const projectId = useProjectStore((s) => s.current?.ID)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const [kindFilter, setKindFilter] = useState<'all' | AssetSlotKind>('all')
  const [selectedId, setSelectedId] = useState(FALLBACK_ASSET_SLOTS[0]?.id ?? '')
  const [localStatuses, setLocalStatuses] = useState<Record<string, AssetSlotStatus>>({})
  const [lockedAssets, setLockedAssets] = useState<Record<string, number>>({})
  const [showCreate, setShowCreate] = useState(false)
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery<PaginatedResponse<Asset>>({
    queryKey: ['assets', projectId, search, page],
    queryFn: () =>
      api.get(`/projects/${projectId}/assets`, {
        params: {
          page,
          page_size: PAGE_SIZE,
          q: search.trim() || undefined,
        },
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

  const assetSlots = useMemo(() => {
    return FALLBACK_ASSET_SLOTS.map((item, index) => {
      const candidateAssetIds = item.candidateAssetIds.length > 0
        ? item.candidateAssetIds
        : assets.slice(index, index + 3).map((asset) => asset.ID)
      const seededLockedAssetId = item.status === 'locked'
        ? (item.lockedAssetId ?? candidateAssetIds[0])
        : item.lockedAssetId
      const lockedAssetId = lockedAssets[item.id] ?? seededLockedAssetId
      const status = localStatuses[item.id] ?? (item.status === 'locked' && lockedAssetId ? 'locked' : item.status)

      return {
        ...item,
        candidateAssetIds,
        lockedAssetId,
        status,
      }
    })
  }, [assets, localStatuses, lockedAssets])

  const filteredAssetSlots = useMemo(() => {
    const q = search.trim().toLowerCase()
    return assetSlots.filter((item) => {
      if (statusFilter === 'active' && (item.status === 'locked' || item.status === 'waived')) return false
      if (statusFilter !== 'active' && item.status !== statusFilter) return false
      if (kindFilter !== 'all' && item.kind !== kindFilter) return false
      if (!q) return true
      return [item.title, item.description, item.scope, item.cue].some((value) => value.toLowerCase().includes(q))
    })
  }, [assetSlots, search, statusFilter, kindFilter])

  const selected = assetSlots.find((item) => item.id === selectedId) ?? filteredAssetSlots[0] ?? assetSlots[0]
  const candidateAssets = selected ? selected.candidateAssetIds.map((id) => assets.find((asset) => asset.ID === id)).filter((asset): asset is Asset => Boolean(asset)) : []
  const lockedAsset = selected?.status === 'locked' && selected.lockedAssetId ? assets.find((asset) => asset.ID === selected.lockedAssetId) : undefined
  const summary = STATUS_ORDER.reduce<Record<AssetSlotStatus, number>>((acc, status) => {
    acc[status] = assetSlots.filter((item) => item.status === status).length
    return acc
  }, { missing: 0, candidate: 0, locked: 0, waived: 0 })

  const updateStatus = (id: string, status: AssetSlotStatus) => {
    setLocalStatuses((prev) => ({ ...prev, [id]: status }))
  }

  const lockAssetSlot = (assetId: number) => {
    if (!selected) return
    setLockedAssets((prev) => ({ ...prev, [selected.id]: assetId }))
    updateStatus(selected.id, 'locked')
  }

  return (
    <div className="flex h-full min-w-0 overflow-hidden bg-background">
      <aside className="flex w-[360px] shrink-0 flex-col border-r border-border bg-card">
        <div className="border-b border-border bg-background p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">{t('pages.assets.v2.title')}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t('pages.assets.v2.subtitle')}</p>
            </div>
            <Button size="icon-sm" onClick={() => setShowCreate(true)} title={t('pages.assets.createTitle')}>
              <Plus size={14} />
            </Button>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <SummaryTile label={t('pages.assets.v2.status.missing')} value={summary.missing} tone="rose" />
            <SummaryTile label={t('pages.assets.v2.status.candidate')} value={summary.candidate} tone="amber" />
            <SummaryTile label={t('pages.assets.v2.status.locked')} value={summary.locked} tone="emerald" />
          </div>

          <div className="mt-4 flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setPage(1)
                }}
                placeholder={t('pages.assets.v2.searchPlaceholder')}
                className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-3 text-xs outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="flex h-8 items-center rounded-md border border-border bg-background px-2 text-muted-foreground">
              <Filter size={13} />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {(['active', 'missing', 'candidate', 'locked', 'waived'] as StatusFilter[]).map((status) => (
              <FilterChip
                key={status}
                active={statusFilter === status}
                onClick={() => setStatusFilter(status)}
              >
                {status === 'active' ? t('pages.assets.v2.filters.active') : statusMeta(status, t).label}
              </FilterChip>
            ))}
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {(['all', 'image', 'video', 'audio', 'brand'] as ('all' | AssetSlotKind)[]).map((kind) => (
              <FilterChip
                key={kind}
                active={kindFilter === kind}
                onClick={() => setKindFilter(kind)}
              >
                {kind === 'all' ? t('common.all') : kindMeta(kind, t).label}
              </FilterChip>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {filteredAssetSlots.length === 0 ? (
            <EmptyPreview title={t('pages.assets.v2.emptyAssetSlots')} description={t('pages.assets.v2.emptyAssetSlotsHint')} />
          ) : (
            <div className="space-y-2">
              {filteredAssetSlots.map((slot) => (
                <AssetSlotCard
                  key={slot.id}
                  slot={slot}
                  selected={selected?.id === slot.id}
                  onSelect={() => setSelectedId(slot.id)}
                />
              ))}
            </div>
          )}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="border-b border-border bg-background px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {selected && <AssetSlotStatusBadge status={selected.status} />}
                {selected && <span className="rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">{priorityLabel(selected.priority, t)}</span>}
                {selected && <span className="rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">{kindMeta(selected.kind, t).label}</span>}
              </div>
              <h2 className="mt-2 truncate text-lg font-semibold text-foreground">{selected?.title ?? t('pages.assets.v2.noSelection')}</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{selected?.description}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => selected && updateStatus(selected.id, 'waived')} disabled={!selected || selected.status === 'waived'}>
                <X size={14} />
                {t('pages.assets.v2.actions.waive')}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowCreate(true)}>
                <Upload size={14} />
                {t('pages.assets.v2.actions.upload')}
              </Button>
              <Button size="sm" onClick={() => selected && updateStatus(selected.id, selected.candidateAssetIds.length > 0 ? 'candidate' : 'missing')} disabled={!selected || selected.status === 'locked'}>
                <Sparkles size={14} />
                {t('pages.assets.v2.actions.requestCandidates')}
              </Button>
            </div>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_320px] overflow-hidden">
          <section className="min-w-0 overflow-y-auto p-5">
            {selected ? (
              <div className="space-y-5">
                <section className="grid gap-3 md:grid-cols-3">
                  <InfoBox icon={Layers3} label={t('pages.assets.v2.fields.scope')} value={selected.scope} />
                  <InfoBox icon={Wand2} label={t('pages.assets.v2.fields.cue')} value={selected.cue} />
                  <InfoBox icon={PackageCheck} label={t('pages.assets.v2.fields.candidates')} value={t('pages.assets.v2.candidateCount', { count: selected.candidateAssetIds.length })} />
                </section>

                <section className="rounded-md border border-border bg-card">
                  <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{t('pages.assets.v2.sections.candidates')}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{t('pages.assets.v2.sections.candidatesHint')}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setShowCreate(true)}>
                      <Plus size={14} />
                      {t('pages.assets.v2.actions.addCandidate')}
                    </Button>
                  </div>

                  <div className="p-4">
                    {isLoading ? (
                      <p className="py-12 text-center text-xs text-muted-foreground">{t('common.loadingShort')}</p>
                    ) : candidateAssets.length === 0 ? (
                      <EmptyPreview title={t('pages.assets.v2.noCandidates')} description={t('pages.assets.v2.noCandidatesHint')} />
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {candidateAssets.map((asset) => (
                          <div key={asset.ID} className="overflow-hidden rounded-md border border-border bg-background">
                            <CandidateCard asset={asset} selected={selected.status === 'locked' && selected.lockedAssetId === asset.ID} />
                            <div className="flex items-center gap-2 border-t border-border p-2">
                              <Button variant="outline" size="xs" className="flex-1" onClick={() => lockAssetSlot(asset.ID)}>
                                <Lock size={12} />
                                {t('pages.assets.v2.actions.lock')}
                              </Button>
                              <Button variant="ghost" size="xs" onClick={() => updateStatus(selected.id, 'candidate')}>
                                <X size={12} />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </section>

                <section className="rounded-md border border-border bg-card">
                  <div className="border-b border-border px-4 py-3">
                    <p className="text-sm font-semibold text-foreground">{t('pages.assets.v2.sections.productionReadiness')}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{t('pages.assets.v2.sections.productionReadinessHint')}</p>
                  </div>
                  <div className="grid gap-3 p-4 md:grid-cols-3">
                    <ReadinessItem complete={selected.status !== 'missing'} label={t('pages.assets.v2.readiness.slotConfirmed')} />
                    <ReadinessItem complete={candidateAssets.length > 0 || selected.status === 'waived'} label={t('pages.assets.v2.readiness.hasCandidate')} />
                    <ReadinessItem complete={selected.status === 'locked' || selected.status === 'waived'} label={t('pages.assets.v2.readiness.lockedOrWaived')} />
                  </div>
                </section>
              </div>
            ) : (
              <EmptyPreview title={t('pages.assets.v2.noSelection')} description={t('pages.assets.v2.emptyAssetSlotsHint')} />
            )}
          </section>

          <aside className="flex min-h-0 flex-col border-l border-border bg-card">
            <div className="border-b border-border p-4">
              <p className="text-sm font-semibold text-foreground">{t('pages.assets.v2.sections.lockedAsset')}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t('pages.assets.v2.sections.lockedAssetHint')}</p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {lockedAsset ? (
                <div className="space-y-3">
                  <CandidateCard asset={lockedAsset} selected />
                  <div className="rounded-md border border-border bg-background p-3">
                    <p className="text-xs font-medium text-foreground">{t('pages.assets.v2.fields.linkedSetting')}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{assetSubtitle(lockedAsset, t)}</p>
                  </div>
                  <Button variant="outline" size="sm" className="w-full" onClick={() => selected && updateStatus(selected.id, 'candidate')}>
                    <CircleDashed size={14} />
                    {t('pages.assets.v2.actions.reopen')}
                  </Button>
                </div>
              ) : (
                <EmptyPreview title={t('pages.assets.v2.noLockedAsset')} description={t('pages.assets.v2.noLockedAssetHint')} />
              )}

              <div className="mt-5 rounded-md border border-border bg-background">
                <div className="border-b border-border px-3 py-2">
                  <p className="text-xs font-medium text-foreground">{t('pages.assets.v2.sections.assetLibrary')}</p>
                </div>
                <div className="space-y-2 p-3">
                  {assets.slice(0, 5).map((asset) => (
                    <div key={asset.ID} className="grid grid-cols-[56px_minmax(0,1fr)] gap-2">
                      <AssetThumb asset={asset} className="h-14 w-14 rounded-md" />
                      <div className="min-w-0 self-center">
                        <p className="truncate text-xs font-medium text-foreground">{asset.name}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{assetSubtitle(asset, t)}</p>
                      </div>
                    </div>
                  ))}
                  {assets.length === 0 && (
                    <p className="py-4 text-center text-xs text-muted-foreground">{t('pages.assets.empty')}</p>
                  )}
                </div>
                <div className="flex items-center justify-between border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
                  <span>{t('pages.assets.pagination', { total, page, pageCount })}</span>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon-xs" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1}>
                      <ChevronLeft size={12} />
                    </Button>
                    <Button variant="outline" size="icon-xs" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={page >= pageCount}>
                      <ChevronRight size={12} />
                    </Button>
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-md border border-border bg-background p-3">
                <p className="text-xs font-medium text-foreground">{t('pages.assets.v2.sections.context')}</p>
                <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                  <div className="flex justify-between gap-3">
                    <span>{t('pages.assets.v2.fields.settings')}</span>
                    <span className="font-medium text-foreground">{settings.length}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>{t('pages.assets.v2.fields.assetCount')}</span>
                    <span className="font-medium text-foreground">{total}</span>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </main>

      <CreateDialog open={showCreate} onClose={() => setShowCreate(false)} title={t('pages.assets.createTitle')}>
        <AssetCreateForm
          key="asset-prep-create"
          projectId={projectId!}
          onCreated={(asset) => {
            setSearch('')
            setPage(1)
            if (selected) {
              updateStatus(selected.id, 'candidate')
            }
          }}
          onSuccess={() => setShowCreate(false)}
          onCancel={() => setShowCreate(false)}
        />
      </CreateDialog>
    </div>
  )
}

export default function AssetsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const projectId = useProjectStore((s) => s.current?.ID)
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery<PaginatedResponse<Asset>>({
    queryKey: ['assets-overview', projectId, search, page],
    queryFn: () =>
      api.get(`/projects/${projectId}/assets`, {
        params: {
          page,
          page_size: PAGE_SIZE,
          q: search.trim() || undefined,
        },
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
  const mediaAssets = assets.filter((asset) => assetPreviewSrc(asset).src).length
  const linkedAssets = assets.filter((asset) => asset.setting_id || asset.setting).length

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden bg-background">
      <div className="shrink-0 border-b border-border bg-background px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{t('pages.assets.library.title')}</p>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{t('pages.assets.library.subtitle')}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/workbench/assets')}>
              <Sparkles size={14} />
              {t('pages.assets.library.openGeneration')}
            </Button>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus size={14} />
              {t('pages.assets.createTitle')}
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <InfoBox icon={PackageCheck} label={t('pages.assets.library.metrics.assets')} value={String(total)} />
          <InfoBox icon={Layers3} label={t('pages.assets.library.metrics.settings')} value={String(settings.length)} />
          <InfoBox icon={Image} label={t('pages.assets.library.metrics.media')} value={String(mediaAssets)} />
          <InfoBox icon={Lock} label={t('pages.assets.library.metrics.linked')} value={String(linkedAssets)} />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-6 py-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="relative w-full max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
              placeholder={t('pages.assets.searchPlaceholder')}
              className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">{t('pages.assets.pagination', { total, page, pageCount })}</span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading ? (
            <p className="py-12 text-center text-xs text-muted-foreground">{t('common.loadingShort')}</p>
          ) : assets.length === 0 ? (
            <EmptyPreview title={t('pages.assets.empty')} description={t('pages.assets.library.emptyHint')} />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {assets.map((asset) => (
                <CandidateCard key={asset.ID} asset={asset} />
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 flex shrink-0 items-center justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" size="sm" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1}>
            <ChevronLeft size={14} />
            {t('common.back')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={page >= pageCount}>
            {t('common.next')}
            <ChevronRight size={14} />
          </Button>
        </div>
      </div>

      <CreateDialog open={showCreate} onClose={() => setShowCreate(false)} title={t('pages.assets.createTitle')}>
        <AssetCreateForm
          key="asset-library-create"
          projectId={projectId!}
          onCreated={() => {
            setSearch('')
            setPage(1)
          }}
          onSuccess={() => setShowCreate(false)}
          onCancel={() => setShowCreate(false)}
        />
      </CreateDialog>
    </div>
  )
}

function SummaryTile({ label, value, tone }: { label: string; value: number; tone: 'rose' | 'amber' | 'emerald' }) {
  const toneClass = {
    rose: 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300',
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300',
  }[tone]

  return (
    <div className={cn('rounded-md px-3 py-2', toneClass)}>
      <p className="text-lg font-semibold leading-6">{value}</p>
      <p className="truncate text-[11px] opacity-80">{label}</p>
    </div>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-7 rounded-md border px-2.5 text-[11px] transition-colors',
        active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function InfoBox({ icon: Icon, label, value }: { icon: ElementType; label: string; value: string }) {
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
