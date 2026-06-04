import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle, Blocks, Download, Loader2, Plus, Search, Store, Trash2, ExternalLink, Upload,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  loadClientPlugins,
  saveClientPlugin,
  removeClientPlugin,
  isClientPluginRemovable,
  migrateFromLocalStorage,
  installPluginFromFile,
  type ClientPluginManifest,
} from '@/features/plugins/application/clientPlugins'
import { MARKETPLACE_PLUGINS, type MarketplaceEntry } from '@/features/plugins/application/pluginMarketplace'
import { ensureBundledClientPluginsInstalled } from '@/features/plugins/application/builtinClientPlugins'
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
      (p) => p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tags.some((tag) => tag.toLowerCase().includes(q))
    )
  }, [search])

  async function handleInstall(entry: MarketplaceEntry) {
    setInstalling(entry.id)
    try {
      const builtinResult = entry.manifest.builtin
        ? (await ensureBundledClientPluginsInstalled()).find((item) => item.pluginId === entry.id)
        : undefined
      const manifest = builtinResult?.manifest ?? { ...entry.manifest, installedAt: new Date().toISOString() }
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
  const [tab, setTab] = useState<Tab>('installed')
  const [plugins, setPlugins] = useState<ClientPluginManifest[]>([])
  const [migrationNote, setMigrationNote] = useState<string>()
  const [fileInstalling, setFileInstalling] = useState(false)
  const [fileError, setFileError] = useState<string>()
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const installedIds = useMemo(() => new Set(plugins.map((p) => p.id)), [plugins])

  async function handleRemove(id: string) {
    const plugin = plugins.find((item) => item.id === id)
    if (plugin && !isClientPluginRemovable(plugin)) return
    await removeClientPlugin(id)
    setPlugins((prev) => prev.filter((p) => p.id !== id))
  }

  function handleInstalled(plugin: ClientPluginManifest) {
    setPlugins((prev) => [...prev.filter((p) => p.id !== plugin.id), plugin])
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
      <PluginPageHeader>
        <PluginPageHeaderInner>
          <PluginPageHeaderCopy>
            <PluginPageHeaderTitleRow>
              <Blocks size={18} />
              <h1 className="type-title font-semibold text-foreground">{t('plugins.title')}</h1>
            </PluginPageHeaderTitleRow>
            <p className="mt-1 line-clamp-2 max-w-3xl type-label leading-5 text-muted-foreground">
              前端只管理 agent 插件文件和配置，插件运行、嵌入与工具扩展由 agent 侧处理。
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
                />
              ))}
            </PluginPageCardGrid>
          )}
        </PluginPageScrollBody>
      )}
    </PluginPageLayout>
  )
}
