import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { API_BASE_URL as API_BASE } from '@/lib/config'
import type { Asset, AssetView, RawResource, Setting, PaginatedResponse } from '@/types'
import { useProjectStore } from '@/store/projectStore'
import { Plus, Image, LayoutGrid, List, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { CreateDialog } from '@/components/shared/CreateDialog'
import { AssetCreateForm } from '@/components/shared/EntityCreateForms'
import { AuthedImage, AuthedVideo } from '@/components/shared/AuthedImage'
import { cn } from '@/lib/utils'
import { Button } from '@movscript/ui'
import { AssetDetail } from '@/components/detail'
import { useTranslation } from 'react-i18next'

const TYPES = ['character', 'scene', 'prop', 'draft'] as const
const TYPE_LABEL_KEYS: Record<string, string> = {
  character: 'domain.assetTypes.character',
  scene: 'domain.assetTypes.scene',
  prop: 'domain.assetTypes.prop',
  draft: 'domain.assetTypes.draft',
}
const TYPE_COLORS: Record<string, string> = {
  character: 'bg-muted text-foreground',
  scene: 'bg-muted text-foreground',
  prop: 'bg-muted text-foreground',
  draft: 'bg-muted text-foreground',
}

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

// --- Shared sub-components ---

function AssetThumb({ asset, className }: { asset: Asset; className?: string }) {
  const firstView = asset.views?.[0]
  const src = resourceMediaSrc(asset.resource) ?? (firstView ? viewMediaSrc(firstView) : undefined)
  const isVid = asset.resource ? isVideoRawResource(asset.resource) : firstView ? isVideoResource(firstView) : false

  if (!src) {
    return (
      <div className={cn('flex items-center justify-center text-muted-foreground bg-muted', className)}>
        <Image size={20} />
      </div>
    )
  }
  return isVid
    ? <AuthedVideo src={src} className={cn('object-cover', className)} muted playsInline />
    : <AuthedImage src={src} alt={asset.name} className={cn('object-cover', className)} />
}

function AssetGridCard({ asset, selected, onClick }: { asset: Asset; selected: boolean; onClick: () => void }) {
  const { t } = useTranslation()
  return (
    <button
      onClick={onClick}
      className={cn(
        'text-left bg-background border border-border rounded-lg overflow-hidden hover:border-ring hover:shadow-sm transition-all',
        selected && 'border-primary ring-1 ring-primary',
      )}
    >
      <div className="aspect-square bg-muted overflow-hidden">
        <AssetThumb asset={asset} className="w-full h-full" />
      </div>
      <div className="p-3">
        <p className="text-sm font-medium truncate">{asset.name}</p>
        <div className="flex items-center justify-between mt-1">
          <span className={cn('text-xs px-1.5 py-0.5 rounded-full', TYPE_COLORS[asset.type] ?? 'bg-muted text-muted-foreground')}>
            {TYPE_LABEL_KEYS[asset.type] ? t(TYPE_LABEL_KEYS[asset.type]) : asset.type}
          </span>
        </div>
      </div>
    </button>
  )
}

function AssetListRow({ asset, selected, onClick }: { asset: Asset; selected: boolean; onClick: () => void }) {
  const { t } = useTranslation()
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-3 py-2.5 border-b border-border hover:bg-muted/30 transition-colors flex items-center gap-2.5',
        selected && 'bg-muted/50 border-l-2 border-l-primary',
      )}
    >
      <div className="w-8 h-8 rounded bg-muted shrink-0 overflow-hidden">
        <AssetThumb asset={asset} className="w-full h-full" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{asset.name}</p>
        <p className="text-xs text-muted-foreground">{TYPE_LABEL_KEYS[asset.type] ? t(TYPE_LABEL_KEYS[asset.type]) : asset.type}</p>
      </div>
    </button>
  )
}

// --- Page ---

export default function AssetsPage() {
  const { t } = useTranslation()
  const projectId = useProjectStore((s) => s.current?.ID)
  const [filterType, setFilterType] = useState('')
  const [filterSettingId, setFilterSettingId] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 24

  const { data, isLoading } = useQuery<PaginatedResponse<Asset>>({
    queryKey: ['assets', projectId, filterType, filterSettingId, search, page],
    queryFn: () =>
      api.get(`/projects/${projectId}/assets`, {
        params: {
          page,
          page_size: pageSize,
          type: filterType || undefined,
          setting_id: filterSettingId || undefined,
          q: search.trim() || undefined,
        },
      })
        .then((r) => r.data),
    enabled: !!projectId,
  })
  const { data: settings = [] } = useQuery<Setting[]>({
    queryKey: ['settings', projectId],
    queryFn: () => api.get(`/projects/${projectId}/settings`).then((r) => r.data),
    enabled: !!projectId,
  })
  const assets = data?.items ?? []
  const total = data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  const selected = assets.find((a) => a.ID === selectedId) ?? null
  const detailOpen = selectedId !== null

  const filterTabs = [
    { value: '', label: t('common.all') },
    ...TYPES.map((type) => ({ value: type, label: t(TYPE_LABEL_KEYS[type]) })),
    ...Array.from(new Set(assets.map((asset) => asset.type).filter((type) => !TYPE_LABEL_KEYS[type]))).map((type) => ({ value: type, label: type })),
  ]

  return (
    <div className="flex h-full overflow-hidden bg-background">
      {/* Left list panel */}
      <div className={cn('flex flex-col border-r border-border bg-card overflow-hidden', detailOpen ? 'w-72 shrink-0' : 'flex-1')}>
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border bg-background shrink-0 flex-wrap">
          <div className="flex gap-0.5 overflow-x-auto scrollbar-none flex-1 min-w-0">
            {filterTabs.map((t) => (
              <button key={t.value} onClick={() => { setFilterType(t.value); setPage(1); setSelectedId(null) }}
                className={cn('px-2.5 py-1 text-xs rounded-md whitespace-nowrap transition-colors', filterType === t.value ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted')}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-28">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); setSelectedId(null) }}
              placeholder={t('pages.assets.searchPlaceholder')}
              className="w-full pl-7 pr-2 py-1.5 text-xs rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <select
            className="h-7 max-w-40 rounded-md border border-border bg-background px-2 text-xs text-foreground"
            onChange={(e) => {
              setSelectedId(null)
              setPage(1)
              setFilterSettingId(e.target.value)
            }}
            value={filterSettingId}
          >
            <option value="">设定素材</option>
            {settings.map((setting: { ID: number; name: string }) => (
              <option key={setting.ID} value={setting.ID}>{setting.name}</option>
            ))}
          </select>
          <div className="flex items-center gap-1 shrink-0">
            <Button onClick={() => setShowCreate(true)} size="icon" className="h-7 w-7"><Plus size={14} /></Button>
            {!detailOpen && (
              <div className="flex rounded-lg border border-border overflow-hidden">
                <button onClick={() => setViewMode('grid')} className={`p-1.5 transition-colors ${viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`} title={t('pages.assets.gridTitle')}><LayoutGrid size={13} /></button>
                <button onClick={() => setViewMode('list')} className={`p-1.5 transition-colors ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`} title={t('pages.assets.listTitle')}><List size={13} /></button>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <p className="p-4 text-xs text-muted-foreground text-center">{t('common.loadingShort')}</p>
          ) : assets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
              <Image size={32} className="opacity-30" />
              <p className="text-sm">{t('pages.assets.empty')}</p>
              <button onClick={() => setShowCreate(true)} className="text-xs hover:text-foreground underline underline-offset-4">{t('pages.assets.createOne')}</button>
            </div>
          ) : detailOpen ? (
            // Compact sidebar list when detail panel is open — reuses AssetListRow
            assets.map((a) => (
              <AssetListRow key={a.ID} asset={a} selected={selectedId === a.ID} onClick={() => setSelectedId(a.ID)} />
            ))
          ) : viewMode === 'list' ? (
            <div className="divide-y divide-border">
              {assets.map((a) => (
                <AssetListRow key={a.ID} asset={a} selected={selectedId === a.ID} onClick={() => setSelectedId(a.ID)} />
              ))}
            </div>
          ) : (
            <div className="p-4 grid grid-cols-2 xl:grid-cols-3 gap-3">
              {assets.map((a) => (
                <AssetGridCard key={a.ID} asset={a} selected={selectedId === a.ID} onClick={() => setSelectedId(a.ID)} />
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between px-3 py-2 border-t border-border bg-background shrink-0 text-xs text-muted-foreground">
          <span>{t('pages.assets.pagination', { total, page, pageCount })}</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => { setPage(p => Math.max(1, p - 1)); setSelectedId(null) }} disabled={page <= 1}>
              <ChevronLeft size={13} />
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setPage(p => Math.min(pageCount, p + 1)); setSelectedId(null) }} disabled={page >= pageCount}>
              <ChevronRight size={13} />
            </Button>
          </div>
        </div>
      </div>

      {/* Detail panel */}
      {detailOpen && selected && (
        <div className="flex-1 overflow-hidden">
          <AssetDetail asset={selected} onClose={() => setSelectedId(null)} onDelete={() => setSelectedId(null)} />
        </div>
      )}

      <CreateDialog open={showCreate} onClose={() => setShowCreate(false)} title={t('pages.assets.createTitle')}>
        <AssetCreateForm
          key={filterSettingId || 'asset-create'}
          projectId={projectId!}
          initialSettingId={filterSettingId ? Number(filterSettingId) : undefined}
          onCreated={(asset) => {
            setFilterType(asset.type)
            setFilterSettingId(asset.setting_id ? String(asset.setting_id) : '')
            setSearch('')
            setPage(1)
            setSelectedId(asset.ID)
          }}
          onSuccess={() => setShowCreate(false)}
          onCancel={() => setShowCreate(false)}
        />
      </CreateDialog>
    </div>
  )
}
