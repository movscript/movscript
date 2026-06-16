import {
  useMemo,
  type ReactNode } from 'react'
import { Link,
  NavLink,
  useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Cable,
  RefreshCw } from 'lucide-react'
import {
  AgentPageShell,
  AgentPageShellHeader,
} from '@/features/agent/components/AgentPageUi'
import {
  AgentConsoleActionButton,
  AgentConsoleCallout,
  AgentConsoleDocumentBody,
  AgentConsoleHeader,
  AgentConsoleHeaderActions,
  AgentConsoleHeaderCopy,
  AgentConsoleHeaderDescription,
  AgentConsoleHeaderTitle,
  AgentConsoleHeaderTitleRow,
  AgentConsoleInlineError,
  AgentConsoleStack,
  AgentConsoleStatusBadge,
  AgentConsoleSyncBadge,
  AgentConsoleTabButton,
  AgentConsoleTabList,
} from '@/features/agent/components/AgentConsoleUi'
import { AgentConsoleNav } from '@/features/agent/components/AgentConsoleNav'
import { IdentityBadge, IdentityMark } from '@/features/agent/components/AgentIdentityUi'
import {
  activeProviderKeyFromPath,
  AppServerPanel,
  buildProviderOptions,
  providerMatchesRouteKey,
  providerRoute,
} from '@/features/agent/components/AgentsPageAppServerPanel'
import { fetchAgentBackendModels } from '@/features/agent/application/agentModelCatalogApi'
import { agentProviderKeys } from '@/features/agent/application/agentQueryKeys'
import {
  appServerKey,
  providerRouteKey,
} from '@/features/agent/application/providerRoutes'
import {
  DEFAULT_PROVIDER_SETTINGS,
  MOVA_PROVIDER_ID,
  enabledProviders,
  normalizeProviderSettings,
  usesAppServerProtocol,
  useProviderConfigStore,
  type ProviderConfig,
} from '@/shared/infrastructure/providerConfigStore'
import { ProviderSessionClient, providerSessionClient } from '@/shared/infrastructure/providerSessionClient'
import { ROUTES } from '@/routes/projectRoutes'

export default function AgentsPage() {
  const location = useLocation()
  const savedSettings = useProviderConfigStore((state) => state.settings)
  const setSettings = useProviderConfigStore((state) => state.setSettings)
  const settings = useMemo(() => normalizeProviderSettings(savedSettings), [savedSettings])
  const providers = settings.providers
  const appServerProviders = useMemo(() => providers.filter(usesAppServerProtocol), [providers])
  const activeProviderKey = activeProviderKeyFromPath(location.pathname, appServerProviders)
    ?? (appServerProviders[0] ? providerRouteKey(appServerProviders[0]) : MOVA_PROVIDER_ID)
  const activeProvider = appServerProviders.find((provider) => providerMatchesRouteKey(provider, activeProviderKey))
  const activeAppServerKey = activeProvider ? appServerKey(activeProvider) : activeProviderKey
  const enabledCount = enabledProviders(settings).length
  const defaultWorkspaceConfigQuery = useQuery({
    queryKey: agentProviderKeys.workspaceConfig('default'),
    queryFn: () => providerSessionClient.getWorkspaceConfig(),
    retry: false,
  })
  const activeProfileSessionClient = useMemo(() => new ProviderSessionClient(undefined, { providerProfileKey: activeAppServerKey }), [activeAppServerKey])
  const workspaceConfigQuery = useQuery({
    queryKey: agentProviderKeys.workspaceConfig(activeAppServerKey),
    queryFn: () => activeProfileSessionClient.getWorkspaceConfig(),
    retry: false,
  })
  const backendModelsQuery = useQuery({
    queryKey: agentProviderKeys.backendModels,
    queryFn: () => fetchAgentBackendModels(),
    retry: false,
  })
  const providerOptions = useMemo(() => {
    return buildProviderOptions(defaultWorkspaceConfigQuery.data, backendModelsQuery.data ?? [])
  }, [defaultWorkspaceConfigQuery.data, backendModelsQuery.data])

  function patchProvider(id: string, patch: Partial<ProviderConfig>) {
    const provider = providers.find((item) => item.id === id)
      ?? DEFAULT_PROVIDER_SETTINGS.providers.find((item) => item.id === id)
    if (!provider) return
    const nextProvider = { ...provider, ...patch }
    const nextProviders = providers.some((item) => item.id === id)
      ? providers.map((item) => item.id === id ? nextProvider : item)
      : [...providers, nextProvider]
    setSettings(normalizeProviderSettings({
      ...settings,
      providers: nextProviders,
    }))
  }

  function refreshConfig() {
    void Promise.all([defaultWorkspaceConfigQuery.refetch(), workspaceConfigQuery.refetch(), backendModelsQuery.refetch()])
  }

  return (
    <AgentPageShell data-testid="agents-page">
      <AgentPageShellHeader>
        <AgentConsoleHeader>
          <AgentConsoleHeaderCopy>
            <AgentConsoleHeaderTitleRow>
              <IdentityMark kind="agent" id="mova" />
              <AgentConsoleHeaderTitle>当前 Agent</AgentConsoleHeaderTitle>
              <AgentConsoleStatusBadge intent={enabledCount > 0 ? 'success' : 'warning'} emphasis="soft">
                {activeProvider?.label ?? '未选择'}
              </AgentConsoleStatusBadge>
              {(defaultWorkspaceConfigQuery.isLoading || workspaceConfigQuery.isLoading || backendModelsQuery.isLoading) && <AgentConsoleSyncBadge>同步中</AgentConsoleSyncBadge>}
            </AgentConsoleHeaderTitleRow>
            <AgentConsoleHeaderDescription>
              选择唯一生效的 app-server Agent，并管理账号来源和运行生命周期；运行中配置会锁定。
            </AgentConsoleHeaderDescription>
          </AgentConsoleHeaderCopy>
          <AgentConsoleHeaderActions>
            <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={refreshConfig}>
              <RefreshCw size={14} />
              刷新配置
            </AgentConsoleActionButton>
            <AgentConsoleActionButton asChild size="sm" variant="outline">
              <Link to={ROUTES.modelProviders}>
                <Cable size={14} />
                Model Providers
              </Link>
            </AgentConsoleActionButton>
          </AgentConsoleHeaderActions>
        </AgentConsoleHeader>
      </AgentPageShellHeader>

      <AgentConsoleNav compact />

      <AgentConsoleDocumentBody>
        <AgentConsoleStack spacing="loose">
          <AgentConsoleTabList>
            {appServerProviders.map((provider) => {
              const key = providerRouteKey(provider)
              return (
                <AgentTabButton key={provider.id} to={providerRoute(key)} active={providerMatchesRouteKey(provider, activeProviderKey)} icon={<Cable size={14} />}>
                  <IdentityBadge kind="agent" id={key} label={provider.label} size="xs" />
                </AgentTabButton>
              )
            })}
          </AgentConsoleTabList>

          <AgentConsoleCallout compact tone="neutral">
            同一时间只会有一个 Agent 生效。当前选择：{activeProvider?.label ?? activeProviderKey}。
          </AgentConsoleCallout>

          {defaultWorkspaceConfigQuery.error ? <AgentConsoleInlineError>{errorMessage(defaultWorkspaceConfigQuery.error)}</AgentConsoleInlineError> : null}
          {workspaceConfigQuery.error ? <AgentConsoleInlineError>{errorMessage(workspaceConfigQuery.error)}</AgentConsoleInlineError> : null}
          {backendModelsQuery.error ? <AgentConsoleInlineError>{errorMessage(backendModelsQuery.error)}</AgentConsoleInlineError> : null}

          <AppServerPanel
            providerKey={activeAppServerKey}
            provider={activeProvider}
            providerOptions={providerOptions}
            backendModels={backendModelsQuery.data ?? []}
            workspaceConfig={workspaceConfigQuery.data}
            onConfigSaved={() => void workspaceConfigQuery.refetch()}
            providerSessionClient={activeProfileSessionClient}
            onPatch={patchProvider}
          />
        </AgentConsoleStack>
      </AgentConsoleDocumentBody>
    </AgentPageShell>
  )
}

function AgentTabButton({ to, active, icon, children }: { to: string; active: boolean; icon: ReactNode; children: ReactNode }) {
  return (
    <AgentConsoleTabButton asChild active={active}>
      <NavLink to={to}>
        {icon}
        {children}
      </NavLink>
    </AgentConsoleTabButton>
  )
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
