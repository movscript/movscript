import {
  useEffect,
  useRef,
  useMemo } from 'react'
import { Link,
  useLocation,
  useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Cable,
  ChevronRight,
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
  AgentConsoleAgentList,
  AgentConsoleAgentListRow,
  AgentConsoleAgentSwitch,
  AgentConsoleStatusBadge,
  AgentConsoleSyncBadge,
} from '@/features/agent/components/AgentConsoleUi'
import { AgentConsoleNav } from '@/features/agent/components/AgentConsoleNav'
import { IdentityBadge, IdentityMark } from '@/features/agent/components/AgentIdentityUi'
import { useAgentSessionStore } from '@/features/agent/state/agentSessionStore'
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
  agentProviderSettingsWithWorkspaceSelection,
  commitAgentProviderActivation,
} from '@/features/agent/application/agentProviderActivation'
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
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { ROUTES } from '@/routes/projectRoutes'

export default function AgentsPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const savedSettings = useProviderConfigStore((state) => state.settings)
  const setSettings = useProviderConfigStore((state) => state.setSettings)
  const currentUser = useUserStore((state) => state.currentUser)
  const setActiveConversation = useAgentSessionStore((state) => state.setActiveConversation)
  const hydratedAgentSelectionUpdatedAtRef = useRef<string | null>(null)
  const settings = useMemo(() => normalizeProviderSettings(savedSettings), [savedSettings])
  const providers = settings.providers
  const appServerProviders = useMemo(() => providers.filter(usesAppServerProtocol), [providers])
  const selectedProvider = appServerProviders.find((provider) => provider.id === settings.defaultProviderId)
    ?? appServerProviders.find((provider) => provider.enabled)
    ?? appServerProviders[0]
  const activeProviderKey = activeProviderKeyFromPath(location.pathname, appServerProviders)
    ?? (selectedProvider ? providerRouteKey(selectedProvider) : appServerProviders[0] ? providerRouteKey(appServerProviders[0]) : MOVA_PROVIDER_ID)
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

  useEffect(() => {
    const config = defaultWorkspaceConfigQuery.data
    if (!config?.agentSelection || hydratedAgentSelectionUpdatedAtRef.current === config.updatedAt) return
    hydratedAgentSelectionUpdatedAtRef.current = config.updatedAt
    const nextSettings = agentProviderSettingsWithWorkspaceSelection(useProviderConfigStore.getState().settings, config.agentSelection)
    setSettings(nextSettings)
  }, [defaultWorkspaceConfigQuery.data, setSettings])

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

  function activateProvider(provider: ProviderConfig) {
    void commitAgentProviderActivation({
      settings,
      provider,
      ...(currentUser?.ID ? { userId: String(currentUser.ID) } : {}),
      setSettings,
      setActiveConversation,
      saveWorkspaceConfig: async (input) => {
        await providerSessionClient.saveWorkspaceConfig(input)
        await defaultWorkspaceConfigQuery.refetch()
      },
    })
  }

  return (
    <AgentPageShell data-testid="agents-page">
      <AgentPageShellHeader>
        <AgentConsoleHeader>
          <AgentConsoleHeaderCopy>
            <AgentConsoleHeaderTitleRow>
              <IdentityMark kind="agent" id="mova" />
              <AgentConsoleHeaderTitle>当前 Agent</AgentConsoleHeaderTitle>
              <AgentConsoleStatusBadge intent={selectedProvider ? 'success' : 'warning'} emphasis="soft">
                {selectedProvider?.label ?? '未选择'}
              </AgentConsoleStatusBadge>
              {(defaultWorkspaceConfigQuery.isLoading || workspaceConfigQuery.isLoading || backendModelsQuery.isLoading) && <AgentConsoleSyncBadge>同步中</AgentConsoleSyncBadge>}
            </AgentConsoleHeaderTitleRow>
            <AgentConsoleHeaderDescription>
              列表中的开关只负责选择唯一生效的 app-server Agent；点击列表项进入对应配置。
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
          <AgentConsoleAgentList aria-label="Agent 切换列表">
            {appServerProviders.map((provider) => {
              const key = providerRouteKey(provider)
              const current = provider.id === settings.defaultProviderId
              const viewing = providerMatchesRouteKey(provider, activeProviderKey)
              return (
                <AgentConsoleAgentListRow
                  key={provider.id}
                  active={viewing}
                  onClick={() => navigate(providerRoute(key))}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return
                    event.preventDefault()
                    navigate(providerRoute(key))
                  }}
                  aria-label={`配置 ${provider.label}`}
                >
                  <span className="agent-console-local-tool-card__copy">
                    <span className="agent-console-local-tool-card__title">{provider.label}</span>
                    <span className="agent-console-local-tool-card__detail">
                      <IdentityBadge kind="agent" id={key} label={key} size="xs" /> {viewing ? '正在配置' : '点击修改配置'}
                    </span>
                  </span>
                  <AgentConsoleStatusBadge intent={current ? 'success' : provider.enabled ? 'neutral' : 'warning'} emphasis="soft">
                    {current ? '当前启用' : provider.enabled ? '可切换' : '已停用'}
                  </AgentConsoleStatusBadge>
                  <AgentConsoleAgentSwitch
                    checked={current}
                    disabled={!provider.enabled || current}
                    aria-label={`启用 ${provider.label}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      if (!current) activateProvider(provider)
                    }}
                  />
                  <ChevronRight size={16} aria-hidden="true" />
                </AgentConsoleAgentListRow>
              )
            })}
          </AgentConsoleAgentList>

          <AgentConsoleCallout compact tone="neutral">
            同一时间只会有一个 Agent 生效。当前选择：{selectedProvider?.label ?? settings.defaultProviderId}。已配置可用项：{enabledCount}。
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
