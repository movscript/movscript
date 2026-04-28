import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertCircle, Download, Loader2, Plus, Search, Store, Trash2, ExternalLink, Play, Upload,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  loadClientPlugins,
  saveClientPlugin,
  removeClientPlugin,
  migrateFromLocalStorage,
  installPluginFromURL,
  installPluginFromFile,
  type ClientPluginManifest,
} from '@/lib/clientPlugins'
import { MARKETPLACE_PLUGINS, type MarketplaceEntry } from '@/lib/pluginMarketplace'
import { cn } from '@/lib/utils'
import { Button, Input } from '@movscript/ui'

type Tab = 'installed' | 'marketplace'

// ── Install from URL dialog ───────────────────────────────────────────────────

function InstallURLDialog({ onInstalled, onClose }: {
  onInstalled: (plugin: ClientPluginManifest) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()

  async function handleInstall() {
    if (!url.trim()) return
    setLoading(true)
    setError(undefined)
    try {
      const plugin = await installPluginFromURL(url.trim())
      onInstalled(plugin)
    } catch (err: any) {
      setError(t('plugins.errors.installFailed', { message: err?.message ?? 'unknown error' }))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-background border border-border rounded-xl shadow-xl w-full max-w-md mx-4 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-foreground mb-1">{t('plugins.installFromUrlTitle')}</h2>
        <p className="text-xs text-muted-foreground mb-4">{t('plugins.installFromUrlDescription')}</p>
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t('plugins.urlPlaceholder')}
          className="text-sm mb-3"
          onKeyDown={(e) => e.key === 'Enter' && handleInstall()}
          autoFocus
        />
        {error && (
          <p className="text-xs text-destructive mb-3 flex items-center gap-1.5">
            <AlertCircle size={13} />
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button size="sm" onClick={handleInstall} disabled={loading || !url.trim()}>
            {loading ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Download size={13} className="mr-1.5" />}
            {loading ? t('plugins.installing') : t('plugins.install')}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Installed plugin card ─────────────────────────────────────────────────────

function PluginCard({ plugin, onRemove, onOpen }: {
  plugin: ClientPluginManifest
  onRemove: () => void
  onOpen: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="border border-border rounded-lg bg-background p-4 flex flex-col gap-3 hover:border-ring/50 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{plugin.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {plugin.author ? `${plugin.author} · ` : ''}v{plugin.version}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {plugin.homepage && (
            <a href={plugin.homepage} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                <ExternalLink size={13} />
              </Button>
            </a>
          )}
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={onRemove}>
            <Trash2 size={13} />
          </Button>
        </div>
      </div>

      {plugin.description && (
        <p className="text-xs text-muted-foreground leading-relaxed">{plugin.description}</p>
      )}

      <div className="flex items-center justify-between mt-auto pt-1">
        <p className="text-[11px] text-muted-foreground font-mono truncate max-w-[160px]">{plugin.id}</p>
        <Button size="sm" onClick={onOpen}>
          <Play size={12} className="mr-1.5" />
          {t('plugins.open')}
        </Button>
      </div>
    </div>
  )
}

// ── Marketplace view ──────────────────────────────────────────────────────────

function MarketplaceView({ installedIds, onInstall }: {
  installedIds: Set<string>
  onInstall: (plugin: ClientPluginManifest) => void
}) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [installing, setInstalling] = useState<string>()
  const [justInstalled, setJustInstalled] = useState<Set<string>>(new Set())

  const filtered = useMemo(() => {
    if (!search.trim()) return MARKETPLACE_PLUGINS
    const q = search.toLowerCase()
    return MARKETPLACE_PLUGINS.filter(
      (p) => p.name.includes(q) || p.description.includes(q) || p.tags.some((tag) => tag.includes(q))
    )
  }, [search])

  async function handleInstall(entry: MarketplaceEntry) {
    setInstalling(entry.id)
    try {
      const manifest = { ...entry.manifest, installedAt: new Date().toISOString() }
      await saveClientPlugin(manifest)
      onInstall(manifest)
      setJustInstalled((prev) => new Set([...prev, entry.id]))
    } finally {
      setInstalling(undefined)
    }
  }

  return (
    <div className="p-4 overflow-y-auto h-full">
      <div className="flex items-center gap-3 mb-4">
        <div className="relative max-w-sm w-full">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('plugins.searchPlaceholder')}
            className="pl-8 text-sm"
          />
        </div>
        <p className="text-xs text-muted-foreground">{t('plugins.marketplaceNote')}</p>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[320px] gap-3 text-center">
          <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
            <Store size={20} className="text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{t('plugins.marketplaceEmpty')}</p>
            <p className="text-xs text-muted-foreground mt-1">{t('plugins.marketplaceEmptyHint')}</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((entry) => {
            const isInstalled = installedIds.has(entry.id) || justInstalled.has(entry.id)
            const isInstalling = installing === entry.id
            return (
              <div key={entry.id} className="border border-border rounded-lg bg-background p-4 flex flex-col gap-2 hover:border-ring/50 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{entry.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{entry.author} · v{entry.version}</p>
                  </div>
                  {isInstalled ? (
                    <span className="text-xs text-muted-foreground border border-border rounded px-2 py-0.5 shrink-0 whitespace-nowrap">
                      {t('plugins.alreadyInstalled')}
                    </span>
                  ) : (
                    <Button size="sm" onClick={() => handleInstall(entry)} disabled={isInstalling} className="shrink-0">
                      {isInstalling
                        ? <Loader2 size={12} className="animate-spin" />
                        : <><Download size={12} className="mr-1" />{t('plugins.install')}</>
                      }
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{entry.description}</p>
                <div className="flex items-center gap-2 mt-auto pt-1">
                  <div className="flex flex-wrap gap-1">
                    {entry.tags.map((tag) => (
                      <span key={tag} className="text-[11px] bg-muted text-muted-foreground rounded px-1.5 py-0.5">{tag}</span>
                    ))}
                  </div>
                  <span className="ml-auto text-[11px] text-muted-foreground whitespace-nowrap">
                    {entry.downloads.toLocaleString()} {t('plugins.downloads')}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ClientPluginsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('installed')
  const [plugins, setPlugins] = useState<ClientPluginManifest[]>([])
  const [showURLDialog, setShowURLDialog] = useState(false)
  const [migrationNote, setMigrationNote] = useState<string>()
  const [fileInstalling, setFileInstalling] = useState(false)
  const [fileError, setFileError] = useState<string>()
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    migrateFromLocalStorage().then((count) => {
      if (count > 0) setMigrationNote(t('plugins.migratedFromLocalStorage', { count }))
    })
    loadClientPlugins().then(setPlugins)
  }, [])

  const installedIds = useMemo(() => new Set(plugins.map((p) => p.id)), [plugins])

  async function handleRemove(id: string) {
    await removeClientPlugin(id)
    setPlugins((prev) => prev.filter((p) => p.id !== id))
  }

  function handleInstalled(plugin: ClientPluginManifest) {
    setPlugins((prev) => [...prev.filter((p) => p.id !== plugin.id), plugin])
    setShowURLDialog(false)
  }

  function handleMarketplaceInstall(plugin: ClientPluginManifest) {
    setPlugins((prev) => [...prev.filter((p) => p.id !== plugin.id), plugin])
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setFileInstalling(true)
    setFileError(undefined)
    try {
      const plugin = await installPluginFromFile(file)
      setPlugins((prev) => [...prev.filter((p) => p.id !== plugin.id), plugin])
    } catch (err: any) {
      setFileError(t('plugins.errors.installFailed', { message: err?.message ?? 'unknown error' }))
    } finally {
      setFileInstalling(false)
    }
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {showURLDialog && <InstallURLDialog onInstalled={handleInstalled} onClose={() => setShowURLDialog(false)} />}

      <div className="h-11 border-b border-border px-5 flex items-center justify-between shrink-0">
        <h1 className="text-sm font-semibold text-foreground">{t('plugins.title')}</h1>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".movpkg"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={fileInstalling}>
            {fileInstalling
              ? <Loader2 size={13} className="mr-1.5 animate-spin" />
              : <Upload size={13} className="mr-1.5" />}
            {t('plugins.installFromFile')}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowURLDialog(true)}>
            <Download size={13} className="mr-1.5" />
            {t('plugins.installFromUrl')}
          </Button>
        </div>
      </div>

      {fileError && (
        <div className="px-5 py-2 bg-destructive/10 border-b border-border text-xs text-destructive flex items-center gap-2 shrink-0">
          <AlertCircle size={12} />
          {fileError}
          <button className="ml-auto text-xs underline" onClick={() => setFileError(undefined)}>{t('common.close')}</button>
        </div>
      )}

      <div className="border-b border-border px-5 flex items-center gap-0 shrink-0">
        <button
          onClick={() => setTab('installed')}
          className={cn('px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors', tab === 'installed' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}
        >
          {t('plugins.myPlugins')}
          {plugins.length > 0 && (
            <span className="ml-1.5 text-xs bg-muted text-muted-foreground rounded-full px-1.5 py-0.5">{plugins.length}</span>
          )}
        </button>
        <button
          onClick={() => setTab('marketplace')}
          className={cn('px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5', tab === 'marketplace' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}
        >
          <Store size={13} />
          {t('plugins.marketplace')}
        </button>
      </div>

      {migrationNote && (
        <div className="px-5 py-2 bg-muted/40 border-b border-border text-xs text-muted-foreground flex items-center gap-2 shrink-0">
          <AlertCircle size={12} />
          {migrationNote}
          <button className="ml-auto text-xs underline" onClick={() => setMigrationNote(undefined)}>{t('common.close')}</button>
        </div>
      )}

      {tab === 'marketplace' && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <MarketplaceView installedIds={installedIds} onInstall={handleMarketplaceInstall} />
        </div>
      )}

      {tab === 'installed' && (
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          {plugins.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
              <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
                <Plus size={20} className="text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{t('plugins.empty')}</p>
                <p className="text-xs text-muted-foreground mt-1">{t('plugins.emptyHint')}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
                  <Upload size={13} className="mr-1.5" />
                  {t('plugins.installFromFile')}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowURLDialog(true)}>
                  <Download size={13} className="mr-1.5" />
                  {t('plugins.installFromUrl')}
                </Button>
                <Button size="sm" onClick={() => setTab('marketplace')}>
                  <Store size={13} className="mr-1.5" />
                  {t('plugins.browseMarketplace')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {plugins.map((plugin) => (
                <PluginCard
                  key={plugin.id}
                  plugin={plugin}
                  onRemove={() => handleRemove(plugin.id)}
                  onOpen={() => navigate(`/tools/plugin/${encodeURIComponent(plugin.id)}`)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
