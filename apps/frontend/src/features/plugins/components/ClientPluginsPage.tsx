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
  installAgentMarketplacePlugin,
  loadAgentPluginMarketplaceState,
  uninstallAgentMarketplacePlugin,
  type AgentPluginMarketplaceItem,
  type AgentPluginMarketplaceState,
} from '@/features/plugins/application/agentPluginMarketplace'
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
} from '@movscript/ui'
import { AgentConsoleNav } from '@/features/agent/components/AgentConsoleNav'

type Tab = 'installed' | 'marketplace'

const EMPTY_AGENT_PLUGIN_MARKETPLACE_STATE: AgentPluginMarketplaceState = {
  agents: [],
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
        <PluginStatusMeta>{t('plugins.agentSkills')}</PluginStatusMeta>
      </PluginCardFooter>
    </PluginCardSurface>
  )
}

function AgentPluginCard({ item, onUninstall }: {
  item: AgentPluginMarketplaceItem
  onUninstall?: () => void
}) {
  const { t } = useTranslation()
  return (
    <PluginCardSurface>
      <PluginCardHeader>
        <PluginCardCopy>
          <PluginCardTitle>{item.displayName}</PluginCardTitle>
          <PluginCardMeta>
            {item.agentLabel} · {item.marketplaceDisplayName}{item.version ? ` · v${item.version}` : ''}
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
  items: AgentPluginMarketplaceItem[]
  errors: AgentPluginMarketplaceState['errors']
  loading: boolean
  onInstall: (item: AgentPluginMarketplaceItem) => Promise<void>
  onUninstall: (item: AgentPluginMarketplaceItem) => Promise<void>
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
        p.agentLabel.toLowerCase().includes(q) ||
        p.marketplaceDisplayName.toLowerCase().includes(q) ||
        p.sourceLabel.toLowerCase().includes(q) ||
        (p.description ?? '').toLowerCase().includes(q) ||
        p.keywords.some((tag) => tag.toLowerCase().includes(q))
    )
  }, [items, search])

  async function handleInstall(item: AgentPluginMarketplaceItem) {
    setInstalling(item.key)
    try {
      await onInstall(item)
    } finally {
      setInstalling(undefined)
    }
  }

  async function handleUninstall(item: AgentPluginMarketplaceItem) {
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
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('plugins.searchPlaceholder')}
            className="pl-8 type-body"
          />
        </PluginSearchField>
        <Button size="sm" variant="outline" onClick={onRefresh} disabled={loading}>
          {loading ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : <RefreshCw size={12} className="mr-1.5" />}
          {t('plugins.refresh')}
        </Button>
      </PluginMarketplaceToolbar>

      {errors.length > 0 ? (
        <PluginStateBanner tone="danger" icon={<AlertCircle size={12} />}>
          {errors.map((error) => `${error.agentLabel}: ${error.message}`).join(' · ')}
        </PluginStateBanner>
      ) : null}

      {loading && filtered.length === 0 ? (
        <PluginEmptyState
          icon={Loader2}
          title={t('plugins.loadingMarketplace')}
          detail={t('plugins.loadingMarketplaceHint')}
          className="h-[320px]"
        />
      ) : filtered.length === 0 ? (
        <PluginEmptyState
          icon={Store}
          title={t('plugins.marketplaceEmpty')}
          detail={t('plugins.marketplaceEmptyHint')}
          className="h-[320px]"
        />
      ) : (
        <PluginPageCardGrid>
          {filtered.map((entry) => {
            const isInstalling = installing === entry.key
            const installBlocked = entry.installPolicy === 'NOT_AVAILABLE' || entry.availability === 'DISABLED_BY_ADMIN'
            return (
              <PluginCardSurface key={entry.key} className="gap-2">
                <PluginCardHeader>
                  <PluginCardCopy>
                    <PluginCardTitle>{entry.displayName}</PluginCardTitle>
                    <PluginCardMeta>
                      {entry.agentLabel} · {entry.marketplaceDisplayName}{entry.version ? ` · v${entry.version}` : ''}
                    </PluginCardMeta>
                  </PluginCardCopy>
                  {entry.installed ? (
                    <PluginCardActions>
                      <PluginStatusMeta>{t('plugins.alreadyInstalled')}</PluginStatusMeta>
                      <Button size="icon-sm" variant="ghost" tone="danger" onClick={() => void handleUninstall(entry)} disabled={isInstalling}>
                        {isInstalling ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={14} />}
                      </Button>
                    </PluginCardActions>
                  ) : (
                    <Button size="sm" onClick={() => void handleInstall(entry)} disabled={isInstalling || installBlocked} className="shrink-0">
                      {isInstalling
                        ? <Loader2 size={12} className="animate-spin" />
                        : <><Download size={12} className="mr-1" />{t('plugins.install')}</>
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
  const [agentPluginState, setAgentPluginState] = useState<AgentPluginMarketplaceState>(EMPTY_AGENT_PLUGIN_MARKETPLACE_STATE)
  const [agentPluginLoading, setAgentPluginLoading] = useState(false)
  const [agentPluginError, setAgentPluginError] = useState<string>()
  const [migrationNote, setMigrationNote] = useState<string>()
  const [fileInstalling, setFileInstalling] = useState(false)
  const [fileError, setFileError] = useState<string>()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const refreshAgentPlugins = useCallback(() => {
    setAgentPluginLoading(true)
    setAgentPluginError(undefined)
    loadAgentPluginMarketplaceState()
      .then(setAgentPluginState)
      .catch((error) => {
        setAgentPluginState(EMPTY_AGENT_PLUGIN_MARKETPLACE_STATE)
        setAgentPluginError(error instanceof Error ? error.message : String(error))
      })
      .finally(() => setAgentPluginLoading(false))
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
    refreshAgentPlugins()
  }, [refreshAgentPlugins])

  const installedAgentPlugins = useMemo(() => agentPluginState.items.filter((item) => item.installed), [agentPluginState.items])
  const installedCount = plugins.length + installedAgentPlugins.length

  async function handleRemove(id: string) {
    const plugin = plugins.find((item) => item.id === id)
    if (plugin && !isClientPluginRemovable(plugin)) return
    await removeClientPlugin(id)
    setPlugins((prev) => prev.filter((p) => p.id !== id))
  }

  async function handleAgentPluginInstall(item: AgentPluginMarketplaceItem) {
    await installAgentMarketplacePlugin(item)
    refreshAgentPlugins()
  }

  async function handleAgentPluginUninstall(item: AgentPluginMarketplaceItem) {
    await uninstallAgentMarketplacePlugin(item)
    refreshAgentPlugins()
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
      <PluginPageHeader>
        <PluginPageHeaderInner>
          <PluginPageHeaderCopy>
            <PluginPageHeaderTitleRow>
              <Blocks size={18} />
              <h1 className="type-title font-semibold text-foreground">{t('plugins.title')}</h1>
            </PluginPageHeaderTitleRow>
            <p className="mt-1 line-clamp-2 max-w-3xl type-label leading-5 text-muted-foreground">
              管理全局插件、Pack 安装来源以及贡献给 Agent、工具页和工作区的扩展能力。
            </p>
          </PluginPageHeaderCopy>
          <PluginPageHeaderActions>
            <Input
              ref={fileInputRef}
              type="file"
              accept=".movpkg,.zip"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={fileInstalling}>
              {fileInstalling
                ? <Loader2 size={14} className="mr-1.5 animate-spin" />
                : <Upload size={14} className="mr-1.5" />}
              {t('plugins.installFromFile')}
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
            {installedCount > 0 && (
              <PluginInlineMeta asChild className="ml-1.5 type-label">
                <span>{installedCount}</span>
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

      {agentPluginError && (
        <PluginStateBanner
          tone="danger"
          icon={<AlertCircle size={12} />}
        >
          {agentPluginError}
          <Button size="xs" variant="link" className="ml-auto" onClick={() => setAgentPluginError(undefined)}>{t('common.close')}</Button>
        </PluginStateBanner>
      )}

      {tab === 'marketplace' && (
        <MarketplaceView
          items={agentPluginState.items}
          errors={agentPluginState.errors}
          loading={agentPluginLoading}
          onInstall={handleAgentPluginInstall}
          onUninstall={handleAgentPluginUninstall}
          onRefresh={refreshAgentPlugins}
        />
      )}

      {tab === 'installed' && (
        <PluginPageScrollBody>
          {plugins.length === 0 && installedAgentPlugins.length === 0 ? (
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
                  <Button size="sm" onClick={() => setTab('marketplace')}>
                    <Store size={14} className="mr-1.5" />
                    {t('plugins.browseMarketplace')}
                  </Button>
                </PluginEmptyActions>
              )}
            />
          ) : (
            <PluginPageCardGrid>
              {installedAgentPlugins.map((plugin) => (
                <AgentPluginCard
                  key={plugin.key}
                  item={plugin}
                  onUninstall={() => void handleAgentPluginUninstall(plugin)}
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
    </PluginPageLayout>
  )
}
