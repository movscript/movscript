import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertCircle, Blocks, Download, Loader2, Plus, Search, Store, Trash2, ExternalLink, Play, Upload,
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
} from '@/features/plugins/application/clientPlugins'
import { MARKETPLACE_PLUGINS, type MarketplaceEntry } from '@/features/plugins/application/pluginMarketplace'
import {
  AppContentLayout,
  Button,
  Input,
  PluginCardSurface,
  PluginDialogSurface,
  PluginEmptyState,
  PluginInlineMeta,
  PluginStateBanner,
  PluginStatusMeta,
  PluginTabGroup,
  PluginTagMeta,
  PluginToneText,
} from '@movscript/ui'
import { AgentConsoleNav } from '@/features/agent/components/AgentConsoleNav'

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
      <PluginDialogSurface
        className="mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="type-body font-semibold text-foreground mb-1">{t('plugins.installFromUrlTitle')}</h2>
        <p className="type-label text-muted-foreground mb-4">{t('plugins.installFromUrlDescription')}</p>
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t('plugins.urlPlaceholder')}
          className="type-body mb-3"
          onKeyDown={(e) => e.key === 'Enter' && handleInstall()}
          autoFocus
        />
        {error && (
          <PluginToneText tone="danger" className="mb-3 flex items-center gap-1.5 type-label">
            <AlertCircle size={14} />
            {error}
          </PluginToneText>
        )}
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button size="sm" onClick={handleInstall} disabled={loading || !url.trim()}>
            {loading ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Download size={14} className="mr-1.5" />}
            {loading ? t('plugins.installing') : t('plugins.install')}
          </Button>
        </div>
      </PluginDialogSurface>
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
    <PluginCardSurface>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="type-body font-semibold text-foreground truncate">{plugin.name}</p>
          <p className="type-label text-muted-foreground mt-0.5">
            {plugin.author ? `${plugin.author} · ` : ''}v{plugin.version}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {plugin.homepage && (
            <Button size="icon-sm" variant="ghost" asChild>
              <a href={plugin.homepage} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={14} />
              </a>
            </Button>
          )}
          <Button size="icon-sm" variant="ghost" tone="danger" onClick={onRemove}>
            <Trash2 size={14} />
          </Button>
        </div>
      </div>

      {plugin.description && (
        <p className="type-label text-muted-foreground leading-relaxed">{plugin.description}</p>
      )}

      <div className="flex items-center justify-between mt-auto pt-1">
        <p className="type-caption text-muted-foreground font-mono truncate max-w-[160px]">{plugin.id}</p>
        <Button size="sm" onClick={onOpen}>
          <Play size={12} className="mr-1.5" />
          {t('plugins.open')}
        </Button>
      </div>
    </PluginCardSurface>
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
            className="pl-8 type-body"
          />
        </div>
        <p className="type-label text-muted-foreground">{t('plugins.marketplaceNote')}</p>
      </div>

      {filtered.length === 0 ? (
        <PluginEmptyState
          icon={Store}
          title={t('plugins.marketplaceEmpty')}
          detail={t('plugins.marketplaceEmptyHint')}
          className="h-[320px]"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((entry) => {
            const isInstalled = installedIds.has(entry.id) || justInstalled.has(entry.id)
            const isInstalling = installing === entry.id
            return (
              <PluginCardSurface key={entry.id} className="gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="type-body font-semibold text-foreground">{entry.name}</p>
                    <p className="type-label text-muted-foreground mt-0.5">{entry.author} · v{entry.version}</p>
                  </div>
                  {isInstalled ? (
                    <PluginStatusMeta>
                      {t('plugins.alreadyInstalled')}
                    </PluginStatusMeta>
                  ) : (
                    <Button size="sm" onClick={() => handleInstall(entry)} disabled={isInstalling} className="shrink-0">
                      {isInstalling
                        ? <Loader2 size={12} className="animate-spin" />
                        : <><Download size={12} className="mr-1" />{t('plugins.install')}</>
                      }
                    </Button>
                  )}
                </div>
                <p className="type-label text-muted-foreground leading-relaxed">{entry.description}</p>
                <div className="flex items-center gap-2 mt-auto pt-1">
                  <div className="flex flex-wrap gap-1">
                    {entry.tags.map((tag) => (
                      <PluginTagMeta key={tag}>{tag}</PluginTagMeta>
                    ))}
                  </div>
                  <span className="ml-auto type-caption text-muted-foreground whitespace-nowrap">
                    {entry.downloads.toLocaleString()} {t('plugins.downloads')}
                  </span>
                </div>
              </PluginCardSurface>
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
    <AppContentLayout variant="workspace" padding="none" scroll="hidden" contentClassName="flex h-full flex-col">
      {showURLDialog && <InstallURLDialog onInstalled={handleInstalled} onClose={() => setShowURLDialog(false)} />}

      <header className="shrink-0 border-b border-border bg-background px-5 py-3">
        <div className="flex min-h-[72px] flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Blocks size={18} />
              <h1 className="type-title font-semibold text-foreground">{t('plugins.title')}</h1>
            </div>
            <p className="mt-1 line-clamp-2 max-w-3xl type-label leading-5 text-muted-foreground">
              管理应用插件、画布节点、工具页，以及可安装到 Agent 的 Skills 和工具扩展。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              ref={fileInputRef}
              type="file"
              accept=".movpkg"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={fileInstalling}>
              {fileInstalling
                ? <Loader2 size={14} className="mr-1.5 animate-spin" />
                : <Upload size={14} className="mr-1.5" />}
              {t('plugins.installFromFile')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowURLDialog(true)}>
              <Download size={14} className="mr-1.5" />
              {t('plugins.installFromUrl')}
            </Button>
          </div>
        </div>
      </header>

      <AgentConsoleNav compact />

      {fileError && (
        <PluginStateBanner
          tone="danger"
          icon={<AlertCircle size={12} />}
        >
          {fileError}
          <Button size="xs" variant="link" className="ml-auto" onClick={() => setFileError(undefined)}>{t('common.close')}</Button>
        </PluginStateBanner>
      )}

      <div className="shrink-0 border-b border-border px-5 py-2">
        <PluginTabGroup>
          <Button
            type="button"
            variant={tab === 'installed' ? 'solid' : 'ghost'}
            size="sm"
            onClick={() => setTab('installed')}
            className="gap-1.5 type-body font-medium"
          >
            {t('plugins.myPlugins')}
            {plugins.length > 0 && (
              <PluginInlineMeta asChild className="ml-1.5 type-label">
                <span>{plugins.length}</span>
              </PluginInlineMeta>
            )}
          </Button>
          <Button
            type="button"
            variant={tab === 'marketplace' ? 'solid' : 'ghost'}
            size="sm"
            onClick={() => setTab('marketplace')}
            className="gap-1.5 type-body font-medium"
          >
            <Store size={14} />
            {t('plugins.marketplace')}
          </Button>
        </PluginTabGroup>
      </div>

      {migrationNote && (
        <PluginStateBanner
          icon={<AlertCircle size={12} />}
        >
          {migrationNote}
          <Button size="xs" variant="link" className="ml-auto" onClick={() => setMigrationNote(undefined)}>{t('common.close')}</Button>
        </PluginStateBanner>
      )}

      {tab === 'marketplace' && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <MarketplaceView installedIds={installedIds} onInstall={handleMarketplaceInstall} />
        </div>
      )}

      {tab === 'installed' && (
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          {plugins.length === 0 ? (
            <PluginEmptyState
              icon={Plus}
              title={t('plugins.empty')}
              detail={t('plugins.emptyHint')}
              className="h-full"
              action={(
                <div className="flex flex-wrap justify-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
                    <Upload size={14} className="mr-1.5" />
                    {t('plugins.installFromFile')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowURLDialog(true)}>
                    <Download size={14} className="mr-1.5" />
                    {t('plugins.installFromUrl')}
                  </Button>
                  <Button size="sm" onClick={() => setTab('marketplace')}>
                    <Store size={14} className="mr-1.5" />
                    {t('plugins.browseMarketplace')}
                  </Button>
                </div>
              )}
            />
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
    </AppContentLayout>
  )
}
