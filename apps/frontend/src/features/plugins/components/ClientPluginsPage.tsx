import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState } from 'react'
import {
  AlertCircle,
  Blocks,
  Plus,
  Store,
  Upload,
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
  installProviderMarketplacePluginToProject,
  loadProjectPluginSnapshot,
  type ProjectPluginSnapshot,
  } from '@/features/plugins/application/projectPlugins'
import { requireWorkspaceRootAPI } from '@/features/agent/application/movScriptWorkspaceElectron'
import {
  AgentPageShell,
  AgentPageShellHeader,
} from '@/features/agent/components/AgentPageUi'
import {
  AgentConsoleActionButton,
  AgentConsoleHeader,
  AgentConsoleHeaderActions,
  AgentConsoleHeaderCopy,
  AgentConsoleHeaderDescription,
  AgentConsoleHeaderTitle,
  AgentConsoleHeaderTitleRow,
} from '@/features/agent/components/AgentConsoleUi'
import {
  PluginButtonIcon,
  PluginBannerDismissAction,
  PluginEmptyActions,
  PluginEmptyState,
  PluginFileInput,
  PluginPageCardGrid,
  PluginPageScrollBody,
  PluginPageShellBody,
  PluginPageTabBar,
  PluginStateBanner,
  PluginTabButton,
  PluginTabCount,
  PluginTabGroup,
  PluginToneText
} from '@/features/plugins/components/PluginsPageUi'
import {
  MarketplaceView,
  PluginCard,
  ProviderPluginCard,
} from '@/features/plugins/components/ClientPluginsPageViews'
import { Button } from '@movscript/ui/primitives'

type Tab = 'installed' | 'marketplace'

const EMPTY_PROVIDER_PLUGIN_MARKETPLACE_STATE: ProviderPluginMarketplaceState = {
  providers: [],
  items: [],
  errors: [],
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ClientPluginsPage() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('installed')
  const [plugins, setPlugins] = useState<ClientPluginManifest[]>([])
  const [providerPluginState, setProviderPluginState] = useState<ProviderPluginMarketplaceState>(EMPTY_PROVIDER_PLUGIN_MARKETPLACE_STATE)
  const [projectPluginSnapshot, setProjectPluginSnapshot] = useState<ProjectPluginSnapshot>()
  const [workspaceDir, setWorkspaceDir] = useState<string>()
  const [providerPluginLoading, setProviderPluginLoading] = useState(false)
  const [providerPluginError, setProviderPluginError] = useState<string>()
  const [migrationNote, setMigrationNote] = useState<string>()
  const [fileInstalling, setFileInstalling] = useState(false)
  const [fileError, setFileError] = useState<string>()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const refreshProjectPlugins = useCallback((nextWorkspaceDir?: string) => {
    loadProjectPluginSnapshot(nextWorkspaceDir ?? workspaceDir)
      .then(setProjectPluginSnapshot)
      .catch((error) => console.warn('[plugins] failed to refresh project plugins', error))
  }, [workspaceDir])

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

  useEffect(() => {
    let cancelled = false
    requireWorkspaceRootAPI().getRoot()
      .then((root) => {
        if (cancelled) return
        setWorkspaceDir(root.workspaceDir)
        refreshProjectPlugins(root.workspaceDir)
      })
      .catch((error) => console.warn('[plugins] failed to resolve workspace root', error))
    return () => {
      cancelled = true
    }
  }, [refreshProjectPlugins])

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

  async function handleProviderPluginInstallProject(item: ProviderPluginMarketplaceItem) {
    const snapshot = await installProviderMarketplacePluginToProject(item, workspaceDir)
    setProjectPluginSnapshot(snapshot)
  }

  async function handleProviderPluginUninstall(item: ProviderPluginMarketplaceItem) {
    await uninstallProviderMarketplacePlugin(item)
    refreshProviderPlugins()
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
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
              管理全局插件、项目插件以及贡献给 provider、工具页和工作区的扩展能力。
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

      <PluginPageShellBody>
        {fileError && (
          <PluginStateBanner
            tone="danger"
            icon={<AlertCircle size={12} />}
          >
            <PluginToneText tone="danger" as="span">{fileError}</PluginToneText>
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

        {projectPluginSnapshot && projectPluginSnapshot.plugins.length > 0 ? (
          <PluginStateBanner icon={<Blocks size={12} />}>
            当前项目已声明 {projectPluginSnapshot.plugins.length} 个插件；安装会写入 .movscript/plugins 与项目 .codex 配置。
          </PluginStateBanner>
        ) : null}

        {providerPluginError && (
          <PluginStateBanner
            tone="danger"
            icon={<AlertCircle size={12} />}
          >
            <PluginToneText tone="danger" as="span">{providerPluginError}</PluginToneText>
            <PluginBannerDismissAction onClick={() => setProviderPluginError(undefined)}>{t('common.close')}</PluginBannerDismissAction>
          </PluginStateBanner>
        )}

        {tab === 'marketplace' && (
          <MarketplaceView
            items={providerPluginState.items}
            errors={providerPluginState.errors}
            loading={providerPluginLoading}
            onInstall={handleProviderPluginInstall}
            onInstallProject={handleProviderPluginInstallProject}
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
