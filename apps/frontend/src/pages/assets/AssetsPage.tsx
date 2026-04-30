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
import { normalizeSettingStateTags, settingStatusLabel } from '@/components/settings/SettingDetailEditor'

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

function assetSettingLabel(asset: Asset, t: (key: string, options?: Record<string, unknown>) => string): string {
  if (asset.setting?.name) return asset.setting.name
  if (asset.setting_id) return t('pages.assets.settingFallback', { id: asset.setting_id })
  return t('pages.assets.unlinkedSetting')
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
  const state = assetStateLabel(asset)
  const tags = Array.from(new Set([...settingTags(asset.setting), ...assetStateTags(asset)])).slice(0, 3)
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
        <p className="mt-1 text-xs text-muted-foreground truncate">
          {assetSettingLabel(asset, t)}{state ? ` / ${settingStatusLabel(state)}` : ''}
        </p>
        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {tags.map((tag) => (
              <span key={tag} className="max-w-full truncate rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{tag}</span>
            ))}
          </div>
        )}
      </div>
    </button>
  )
}

function AssetListRow({ asset, selected, onClick }: { asset: Asset; selected: boolean; onClick: () => void }) {
  const { t } = useTranslation()
  const state = assetStateLabel(asset)
  const tags = Array.from(new Set([...settingTags(asset.setting), ...assetStateTags(asset)])).slice(0, 2)
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
        <p className="text-xs text-muted-foreground truncate">
          {assetSettingLabel(asset, t)}{state ? ` / ${settingStatusLabel(state)}` : ''}
        </p>
        {tags.length > 0 && <p className="text-[11px] text-muted-foreground/80 truncate">{tags.join(' / ')}</p>}
      </div>
    </button>
  )
}

// --- Page ---

export default function AssetsPage() {
  const { t } = useTranslation()
  const projectId = useProjectStore((s) => s.current?.ID)
  const [filterSettingId, setFilterSettingId] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 24

  const { data, isLoading } = useQuery<PaginatedResponse<Asset>>({
    queryKey: ['assets', projectId, filterSettingId, search, page],
    queryFn: () =>
      api.get(`/projects/${projectId}/assets`, {
        params: {
          page,
          page_size: pageSize,
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

  return (
    <div className="flex h-full overflow-hidden bg-background">
      {/* Left list panel */}
      <div className={cn('flex flex-col border-r border-border bg-card overflow-hidden', detailOpen ? 'w-72 shrink-0' : 'flex-1')}>
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border bg-background shrink-0 flex-wrap">
          <div className="relative flex-1 min-w-40">
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
            <option value="">{t('pages.assets.settingFilter')}</option>
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
