import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle, Blocks, Download, Loader2, Plus, RefreshCw, Search, Store, Trash2, ExternalLink, Upload,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  loadClientPlugins,
  removeClientPlugin,
  isClientPluginRemovable,
  migrateFromLocalStorage,
  installPluginFromFile,
  type ClientPluginManifest,
} from '@/features/plugins/application/clientPlugins'
import { ensureBundledClientPluginsInstalled } from '@/features/plugins/application/builtinClientPlugins'
import {
  installProviderMarketplacePlugin,
  loadProviderPluginMarketplaceState,
  uninstallProviderMarketplacePlugin,
  type ProviderPluginMarketplaceItem,
  type ProviderPluginMarketplaceState,
} from '@/features/plugins/application/providerPluginMarketplace'
import {
  AgentConsoleActionButton,
  AgentConsoleHeader,
  AgentConsoleHeaderActions,
  AgentConsoleHeaderCopy,
  AgentConsoleHeaderDescription,
  AgentConsoleHeaderTitle,
  AgentConsoleHeaderTitleRow,
  AgentPageShell,
  AgentPageShellHeader,
  Button,
  PluginBannerDismissAction,
  PluginButtonIcon,
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
  PluginFileInput,
  PluginMarketplaceToolbar,
  PluginPageCardGrid,
  PluginPageScrollBody,
  PluginPageShellBody,
  PluginPageTabBar,
  PluginStateBanner,
  PluginStatusMeta,
  PluginSearchField,
  PluginSearchIconSlot,
  PluginSearchInput,
  PluginTabButton,
  PluginTabCount,
  PluginTabGroup,
  PluginTagMeta,
} from '@movscript/ui'
import { AgentConsoleNav } from '@/features/agent/components/AgentConsoleNav'

type Tab = 'installed' | 'marketplace'

const EMPTY_PROVIDER_PLUGIN_MARKETPLACE_STATE: ProviderPluginMarketplaceState = {
  providers: [],
  items: [],
  errors: [],
}

// ── Installed plugin card ─────────────────────────────────────────────────────

function PluginCard({ plugin, onRemove }: {
  plugin: ClientPluginManifest
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const removable = isClientPluginRemovable(plugin)
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
          {!removable ? (
            <PluginStatusMeta>{t('plugins.builtin')}</PluginStatusMeta>
          ) : (
            <Button size="icon-sm" variant="ghost" tone="danger" onClick={onRemove}>
              <Trash2 size={14} />
            </Button>
          )}
        </PluginCardActions>
      </PluginCardHeader>

      {plugin.description && (
        <PluginCardDescription>{plugin.description}</PluginCardDescription>
      )}

      <PluginCardFooter>
        <PluginCardId>{plugin.id}</PluginCardId>
        <PluginStatusMeta>{t('plugins.pluginSkills')}</PluginStatusMeta>
      </PluginCardFooter>
    </PluginCardSurface>
  )
}

function ProviderPluginCard({ item, onUninstall }: {
  item: ProviderPluginMarketplaceItem
  onUninstall?: () => void
}) {
  const { t } = useTranslation()
  return (
    <PluginCardSurface>
      <PluginCardHeader>
        <PluginCardCopy>
          <PluginCardTitle>{item.displayName}</PluginCardTitle>
          <PluginCardMeta>
            {item.providerLabel} · {item.marketplaceDisplayName}{item.version ? ` · v${item.version}` : ''}
          </PluginCardMeta>
        </PluginCardCopy>
        <PluginCardActions>
          <PluginStatusMeta>{item.enabled ? t('plugins.enabled') : t('plugins.disabled')}</PluginStatusMeta>
          {onUninstall ? (
            <Button size="icon-sm" variant="ghost" tone="danger" onClick={onUninstall}>
              <Trash2 size={14} />
            </Button>
          ) : null}
        </PluginCardActions>
      </PluginCardHeader>

      {item.description && (
        <PluginCardDescription>{item.description}</PluginCardDescription>
      )}

      <PluginCardFooter>
        <PluginCardId>{item.name}</PluginCardId>
        <PluginStatusMeta>{item.sourceLabel}</PluginStatusMeta>
      </PluginCardFooter>
    </PluginCardSurface>
  )
}

// ── Marketplace view ──────────────────────────────────────────────────────────

function MarketplaceView({ items, errors, loading, onInstall, onUninstall, onRefresh }: {
  items: ProviderPluginMarketplaceItem[]
  errors: ProviderPluginMarketplaceState['errors']
  loading: boolean
  onInstall: (item: ProviderPluginMarketplaceItem) => Promise<void>
  onUninstall: (item: ProviderPluginMarketplaceItem) => Promise<void>
  onRefresh: () => void
}) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [installing, setInstalling] = useState<string>()

  const filtered = useMemo(() => {
    if (!search.trim()) return items
    const q = search.toLowerCase()
    return items.filter(
      (p) => p.name.toLowerCase().includes(q) ||
        p.displayName.toLowerCase().includes(q) ||
        p.providerLabel.toLowerCase().includes(q) ||
        p.marketplaceDisplayName.toLowerCase().includes(q) ||
        p.sourceLabel.toLowerCase().includes(q) ||
        (p.description ?? '').toLowerCase().includes(q) ||
        p.keywords.some((tag) => tag.toLowerCase().includes(q))
    )
  }, [items, search])

  async function handleInstall(item: ProviderPluginMarketplaceItem) {
    setInstalling(item.key)
    try {
      await onInstall(item)
    } finally {
      setInstalling(undefined)
    }
  }

  async function handleUninstall(item: ProviderPluginMarketplaceItem) {
    setInstalling(item.key)
    try {
      await onUninstall(item)
    } finally {
      setInstalling(undefined)
    }
  }

  return (
    <PluginPageScrollBody>
      <PluginMarketplaceToolbar>
        <PluginSearchField>
          <PluginSearchIconSlot><Search size={14} /></PluginSearchIconSlot>
          <PluginSearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('plugins.searchPlaceholder')}
          />
        </PluginSearchField>
        <Button size="sm" variant="outline" onClick={onRefresh} disabled={loading} loading={loading}>
          {!loading ? <PluginButtonIcon><RefreshCw size={12} /></PluginButtonIcon> : null}
          {t('plugins.refresh')}
        </Button>
      </PluginMarketplaceToolbar>

      {errors.length > 0 ? (
        <PluginStateBanner tone="danger" icon={<AlertCircle size={12} />}>
          {errors.map((error) => `${error.providerLabel}: ${error.message}`).join(' · ')}
        </PluginStateBanner>
      ) : null}

      {loading && filtered.length === 0 ? (
        <PluginEmptyState
          icon={Loader2}
          title={t('plugins.loadingMarketplace')}
          detail={t('plugins.loadingMarketplaceHint')}
          layout="marketplace"
        />
      ) : filtered.length === 0 ? (
        <PluginEmptyState
          icon={Store}
          title={t('plugins.marketplaceEmpty')}
          detail={t('plugins.marketplaceEmptyHint')}
          layout="marketplace"
        />
      ) : (
        <PluginPageCardGrid>
          {filtered.map((entry) => {
            const isInstalling = installing === entry.key
            const installBlocked = entry.installPolicy === 'NOT_AVAILABLE' || entry.availability === 'DISABLED_BY_ADMIN'
            return (
              <PluginCardSurface key={entry.key} spacing="compact">
                <PluginCardHeader>
                  <PluginCardCopy>
                    <PluginCardTitle>{entry.displayName}</PluginCardTitle>
                    <PluginCardMeta>
                      {entry.providerLabel} · {entry.marketplaceDisplayName}{entry.version ? ` · v${entry.version}` : ''}
                    </PluginCardMeta>
                  </PluginCardCopy>
                  {entry.installed ? (
                    <PluginCardActions>
                      <PluginStatusMeta>{t('plugins.alreadyInstalled')}</PluginStatusMeta>
                      <Button size="icon-sm" variant="ghost" tone="danger" onClick={() => void handleUninstall(entry)} disabled={isInstalling} loading={isInstalling}>
                        <Trash2 size={14} />
                      </Button>
                    </PluginCardActions>
                  ) : (
                    <Button size="sm" onClick={() => void handleInstall(entry)} disabled={isInstalling || installBlocked} loading={isInstalling}>
                      {isInstalling
                        ? t('plugins.install')
                        : <><PluginButtonIcon><Download size={12} /></PluginButtonIcon>{t('plugins.install')}</>
                      }
                    </Button>
                  )}
                </PluginCardHeader>
                <PluginCardDescription>{entry.description ?? t('plugins.noDescription')}</PluginCardDescription>
                <PluginCardFooter>
                  <PluginCardTagRow>
                    {[entry.sourceType, ...entry.capabilities, ...entry.keywords].slice(0, 4).map((tag) => (
                      <PluginTagMeta key={tag}>{tag}</PluginTagMeta>
                    ))}
                  </PluginCardTagRow>
                  <PluginCardDownloadMeta>
                    {entry.sourceLabel}
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
  const [tab, setTab] = useState<Tab>('installed')
  const [plugins, setPlugins] = useState<ClientPluginManifest[]>([])
  const [providerPluginState, setProviderPluginState] = useState<ProviderPluginMarketplaceState>(EMPTY_PROVIDER_PLUGIN_MARKETPLACE_STATE)
  const [providerPluginLoading, setProviderPluginLoading] = useState(false)
  const [providerPluginError, setProviderPluginError] = useState<string>()
  const [migrationNote, setMigrationNote] = useState<string>()
  const [fileInstalling, setFileInstalling] = useState(false)
  const [fileError, setFileError] = useState<string>()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const refreshProviderPlugins = useCallback(() => {
    setProviderPluginLoading(true)
    setProviderPluginError(undefined)
    loadProviderPluginMarketplaceState()
      .then(setProviderPluginState)
      .catch((error) => {
        setProviderPluginState(EMPTY_PROVIDER_PLUGIN_MARKETPLACE_STATE)
        setProviderPluginError(error instanceof Error ? error.message : String(error))
      })
      .finally(() => setProviderPluginLoading(false))
  }, [])

  useEffect(() => {
    let cancelled = false
    async function refreshPlugins() {
      const count = await migrateFromLocalStorage()
      if (!cancelled && count > 0) setMigrationNote(t('plugins.migratedFromLocalStorage', { count }))
      const bundled = await ensureBundledClientPluginsInstalled()
      const loaded = await loadClientPlugins()
      const builtinManifests = bundled.map((item) => item.manifest)
      const merged = [
        ...loaded.filter((plugin) => !builtinManifests.some((builtin) => builtin.id === plugin.id)),
        ...builtinManifests,
      ]
      if (!cancelled) setPlugins(merged)
    }
    refreshPlugins().catch((error) => {
      console.warn('[plugins] failed to refresh bundled plugins', error)
      loadClientPlugins().then((loaded) => {
        if (!cancelled) setPlugins(loaded)
      }).catch(() => undefined)
    })
    return () => {
      cancelled = true
    }
  }, [t])

  useEffect(() => {
    refreshProviderPlugins()
  }, [refreshProviderPlugins])

  const installedProviderPlugins = useMemo(() => providerPluginState.items.filter((item) => item.installed), [providerPluginState.items])
  const installedCount = plugins.length + installedProviderPlugins.length

  async function handleRemove(id: string) {
    const plugin = plugins.find((item) => item.id === id)
    if (plugin && !isClientPluginRemovable(plugin)) return
    await removeClientPlugin(id)
    setPlugins((prev) => prev.filter((p) => p.id !== id))
  }

  async function handleProviderPluginInstall(item: ProviderPluginMarketplaceItem) {
    await installProviderMarketplacePlugin(item)
    refreshProviderPlugins()
  }

  async function handleProviderPluginUninstall(item: ProviderPluginMarketplaceItem) {
    await uninstallProviderMarketplacePlugin(item)
    refreshProviderPlugins()
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
    <AgentPageShell data-testid="client-plugins-page">
      <AgentPageShellHeader>
        <AgentConsoleHeader>
          <AgentConsoleHeaderCopy>
            <AgentConsoleHeaderTitleRow>
              <Blocks size={18} />
              <AgentConsoleHeaderTitle>{t('plugins.title')}</AgentConsoleHeaderTitle>
            </AgentConsoleHeaderTitleRow>
            <AgentConsoleHeaderDescription>
              管理全局插件、Pack 安装来源以及贡献给 provider、工具页和工作区的扩展能力。
            </AgentConsoleHeaderDescription>
          </AgentConsoleHeaderCopy>
          <AgentConsoleHeaderActions>
            <PluginFileInput
              ref={fileInputRef}
              type="file"
              accept=".movpkg,.zip"
              onChange={handleFileChange}
            />
            <AgentConsoleActionButton size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={fileInstalling} loading={fileInstalling}>
              {!fileInstalling ? <PluginButtonIcon><Upload size={14} /></PluginButtonIcon> : null}
              {t('plugins.installFromFile')}
            </AgentConsoleActionButton>
          </AgentConsoleHeaderActions>
        </AgentConsoleHeader>
      </AgentPageShellHeader>

      <AgentConsoleNav compact />

      <PluginPageShellBody>
        {fileError && (
          <PluginStateBanner
            tone="danger"
            icon={<AlertCircle size={12} />}
          >
            {fileError}
            <PluginBannerDismissAction onClick={() => setFileError(undefined)}>{t('common.close')}</PluginBannerDismissAction>
          </PluginStateBanner>
        )}

        <PluginPageTabBar>
          <PluginTabGroup>
            <PluginTabButton
              active={tab === 'installed'}
              onClick={() => setTab('installed')}
            >
              {t('plugins.myPlugins')}
              {installedCount > 0 && (
                <PluginTabCount>
                  <span>{installedCount}</span>
                </PluginTabCount>
              )}
            </PluginTabButton>
            <PluginTabButton
              active={tab === 'marketplace'}
              onClick={() => setTab('marketplace')}
            >
              <PluginButtonIcon><Store size={14} /></PluginButtonIcon>
              {t('plugins.marketplace')}
            </PluginTabButton>
          </PluginTabGroup>
        </PluginPageTabBar>

        {migrationNote && (
          <PluginStateBanner
            icon={<AlertCircle size={12} />}
          >
            {migrationNote}
            <PluginBannerDismissAction onClick={() => setMigrationNote(undefined)}>{t('common.close')}</PluginBannerDismissAction>
          </PluginStateBanner>
        )}

        {providerPluginError && (
          <PluginStateBanner
            tone="danger"
            icon={<AlertCircle size={12} />}
          >
            {providerPluginError}
            <PluginBannerDismissAction onClick={() => setProviderPluginError(undefined)}>{t('common.close')}</PluginBannerDismissAction>
          </PluginStateBanner>
        )}

        {tab === 'marketplace' && (
          <MarketplaceView
            items={providerPluginState.items}
            errors={providerPluginState.errors}
            loading={providerPluginLoading}
            onInstall={handleProviderPluginInstall}
            onUninstall={handleProviderPluginUninstall}
            onRefresh={refreshProviderPlugins}
          />
        )}

        {tab === 'installed' && (
          <PluginPageScrollBody>
            {plugins.length === 0 && installedProviderPlugins.length === 0 ? (
              <PluginEmptyState
                icon={Plus}
                title={t('plugins.empty')}
                detail={t('plugins.emptyHint')}
                action={(
                  <PluginEmptyActions>
                    <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
                      <PluginButtonIcon><Upload size={14} /></PluginButtonIcon>
                      {t('plugins.installFromFile')}
                    </Button>
                    <Button size="sm" onClick={() => setTab('marketplace')}>
                      <PluginButtonIcon><Store size={14} /></PluginButtonIcon>
                      {t('plugins.browseMarketplace')}
                    </Button>
                  </PluginEmptyActions>
                )}
              />
            ) : (
              <PluginPageCardGrid>
                {installedProviderPlugins.map((plugin) => (
                  <ProviderPluginCard
                    key={plugin.key}
                    item={plugin}
                    onUninstall={() => void handleProviderPluginUninstall(plugin)}
                  />
                ))}
                {plugins.map((plugin) => (
                  <PluginCard
                    key={plugin.id}
                    plugin={plugin}
                    onRemove={() => handleRemove(plugin.id)}
                  />
                ))}
              </PluginPageCardGrid>
            )}
          </PluginPageScrollBody>
        )}
      </PluginPageShellBody>
    </AgentPageShell>
  )
}
