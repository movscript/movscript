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
  Button,
  Input,
  PluginCardActions,
  PluginCardCopy,
  PluginCardDescription,
  PluginCardDownloadMeta,
  PluginCardFooter,
  PluginCardHeader,
  PluginCardId,
  PluginCardSurface,
  PluginCardMeta,
  PluginCardTagRow,
  PluginCardTitle,
  PluginDialogActions,
  PluginDialogDescription,
  PluginDialogOverlay,
  PluginDialogSurface,
  PluginDialogTitle,
  PluginEmptyActions,
  PluginEmptyState,
  PluginInlineMeta,
  PluginMarketplaceToolbar,
  PluginPageCardGrid,
  PluginPageHeader,
  PluginPageHeaderActions,
  PluginPageHeaderCopy,
  PluginPageHeaderInner,
  PluginPageHeaderTitleRow,
  PluginPageLayout,
  PluginPageScrollBody,
  PluginPageTabBar,
  PluginStateBanner,
  PluginStatusMeta,
  PluginSearchField,
  PluginSearchIconSlot,
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
    <PluginDialogOverlay onClick={onClose}>
      <PluginDialogSurface
        className="mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <PluginDialogTitle>{t('plugins.installFromUrlTitle')}</PluginDialogTitle>
        <PluginDialogDescription>{t('plugins.installFromUrlDescription')}</PluginDialogDescription>
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
        <PluginDialogActions>
          <Button size="sm" variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button size="sm" onClick={handleInstall} disabled={loading || !url.trim()}>
            {loading ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Download size={14} className="mr-1.5" />}
            {loading ? t('plugins.installing') : t('plugins.install')}
          </Button>
        </PluginDialogActions>
      </PluginDialogSurface>
    </PluginDialogOverlay>
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
      <PluginCardHeader>
        <PluginCardCopy>
          <PluginCardTitle>{plugin.name}</PluginCardTitle>
          <PluginCardMeta>
            {plugin.author ? `${plugin.author} · ` : ''}v{plugin.version}
          </PluginCardMeta>
        </PluginCardCopy>
        <PluginCardActions>
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
        </PluginCardActions>
      </PluginCardHeader>

      {plugin.description && (
        <PluginCardDescription>{plugin.description}</PluginCardDescription>
      )}

      <PluginCardFooter>
        <PluginCardId>{plugin.id}</PluginCardId>
        <Button size="sm" onClick={onOpen}>
          <Play size={12} className="mr-1.5" />
          {t('plugins.open')}
        </Button>
      </PluginCardFooter>
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
    <PluginPageScrollBody>
      <PluginMarketplaceToolbar>
        <PluginSearchField>
          <PluginSearchIconSlot><Search size={14} /></PluginSearchIconSlot>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('plugins.searchPlaceholder')}
            className="pl-8 type-body"
          />
        </PluginSearchField>
        <p className="type-label text-muted-foreground">{t('plugins.marketplaceNote')}</p>
      </PluginMarketplaceToolbar>

      {filtered.length === 0 ? (
        <PluginEmptyState
          icon={Store}
          title={t('plugins.marketplaceEmpty')}
          detail={t('plugins.marketplaceEmptyHint')}
          className="h-[320px]"
        />
      ) : (
        <PluginPageCardGrid>
          {filtered.map((entry) => {
            const isInstalled = installedIds.has(entry.id) || justInstalled.has(entry.id)
            const isInstalling = installing === entry.id
            return (
              <PluginCardSurface key={entry.id} className="gap-2">
                <PluginCardHeader>
                  <PluginCardCopy>
                    <PluginCardTitle>{entry.name}</PluginCardTitle>
                    <PluginCardMeta>{entry.author} · v{entry.version}</PluginCardMeta>
                  </PluginCardCopy>
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
                </PluginCardHeader>
                <PluginCardDescription>{entry.description}</PluginCardDescription>
                <PluginCardFooter>
                  <PluginCardTagRow>
                    {entry.tags.map((tag) => (
                      <PluginTagMeta key={tag}>{tag}</PluginTagMeta>
                    ))}
                  </PluginCardTagRow>
                  <PluginCardDownloadMeta>
                    {entry.downloads.toLocaleString()} {t('plugins.downloads')}
                  </PluginCardDownloadMeta>
                </PluginCardFooter>
              </PluginCardSurface>
            )
          })}
        </PluginPageCardGrid>
      )}
    </PluginPageScrollBody>
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
    <PluginPageLayout>
      {showURLDialog && <InstallURLDialog onInstalled={handleInstalled} onClose={() => setShowURLDialog(false)} />}

      <PluginPageHeader>
        <PluginPageHeaderInner>
          <PluginPageHeaderCopy>
            <PluginPageHeaderTitleRow>
              <Blocks size={18} />
              <h1 className="type-title font-semibold text-foreground">{t('plugins.title')}</h1>
            </PluginPageHeaderTitleRow>
            <p className="mt-1 line-clamp-2 max-w-3xl type-label leading-5 text-muted-foreground">
              管理应用插件、画布节点、工具页，以及可安装到 Agent 的 Skills 和工具扩展。
            </p>
          </PluginPageHeaderCopy>
          <PluginPageHeaderActions>
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
          </PluginPageHeaderActions>
        </PluginPageHeaderInner>
      </PluginPageHeader>

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

      <PluginPageTabBar>
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
      </PluginPageTabBar>

      {migrationNote && (
        <PluginStateBanner
          icon={<AlertCircle size={12} />}
        >
          {migrationNote}
          <Button size="xs" variant="link" className="ml-auto" onClick={() => setMigrationNote(undefined)}>{t('common.close')}</Button>
        </PluginStateBanner>
      )}

      {tab === 'marketplace' && (
        <MarketplaceView installedIds={installedIds} onInstall={handleMarketplaceInstall} />
      )}

      {tab === 'installed' && (
        <PluginPageScrollBody>
          {plugins.length === 0 ? (
            <PluginEmptyState
              icon={Plus}
              title={t('plugins.empty')}
              detail={t('plugins.emptyHint')}
              action={(
                <PluginEmptyActions>
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
                </PluginEmptyActions>
              )}
            />
          ) : (
            <PluginPageCardGrid>
              {plugins.map((plugin) => (
                <PluginCard
                  key={plugin.id}
                  plugin={plugin}
                  onRemove={() => handleRemove(plugin.id)}
                  onOpen={() => navigate(`/tools/plugin/${encodeURIComponent(plugin.id)}`)}
                />
              ))}
            </PluginPageCardGrid>
          )}
        </PluginPageScrollBody>
      )}
    </PluginPageLayout>
  )
}
