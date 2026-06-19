import {
  useEffect,
  useMemo,
  useRef,
} from 'react'
import {
  useLocation,
  useNavigate,
} from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronRight,
  RefreshCw,
} from 'lucide-react'
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
import { useAgentStore } from '@/features/agent/state/agentStore'
import { agentConversationRegistryActions } from '@/features/agent/state/agentConversationRegistryStore'
import { agentProviderKeys } from '@/features/agent/application/agentQueryKeys'
import {
  agentProviderSettingsWithWorkspaceSelection,
  commitAgentProfileActivation,
  loadAgentProviderWorkspaceConfig,
  saveAgentProviderWorkspaceConfig,
} from '@/features/agent/application/agentProviderActivation'
import {
  activeProviderKeyFromPath,
} from '@/features/agent/application/providerRoutes'
import {
  MOVA_PROVIDER_ID,
  normalizeProviderSettingsWithRuntimeEnv,
  useProviderConfigStore,
} from '@/shared/infrastructure/providerConfigStore'
import {
  activeAgentProfileForRoute,
  agentProfilesFromProviderSettings,
} from '@/features/agent/application/agentProfileModel'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { ROUTES } from '@/routes/projectRoutes'

export default function AgentsPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const savedSettings = useProviderConfigStore((state) => state.settings)
  const setSettings = useProviderConfigStore((state) => state.setSettings)
  const updateAgentSettings = useAgentStore((state) => state.updateSettings)
  const currentUser = useUserStore((state) => state.currentUser)
  const setActiveConversation = agentConversationRegistryActions().setActiveConversation
  const hydratedAgentSelectionUpdatedAtRef = useRef<string | null>(null)
  const settings = useMemo(() => normalizeProviderSettingsWithRuntimeEnv(savedSettings), [savedSettings])
  const providers = settings.providers
  const agentProfiles = useMemo(() => agentProfilesFromProviderSettings(settings), [settings])
  const selectedProfile = agentProfiles.find((profile) => profile.current)
    ?? agentProfiles.find((profile) => profile.enabled)
    ?? agentProfiles[0]
  const routeProviderKey = activeProviderKeyFromPath(location.pathname, providers)
  const activeProfile = activeAgentProfileForRoute(agentProfiles, routeProviderKey)
    ?? selectedProfile
  const activeProviderKey = activeProfile?.routeKey ?? MOVA_PROVIDER_ID
  const enabledCount = agentProfiles.filter((profile) => profile.enabled).length
  const workspaceConfigQuery = useQuery({
    queryKey: agentProviderKeys.workspaceConfig('default'),
    queryFn: () => loadAgentProviderWorkspaceConfig(),
    retry: false,
  })

  useEffect(() => {
    const config = workspaceConfigQuery.data
    if (!config?.agentSelection || hydratedAgentSelectionUpdatedAtRef.current === config.updatedAt) return
    hydratedAgentSelectionUpdatedAtRef.current = config.updatedAt
    const nextSettings = agentProviderSettingsWithWorkspaceSelection(useProviderConfigStore.getState().settings, config.agentSelection)
    setSettings(nextSettings)
  }, [workspaceConfigQuery.data, setSettings])

  function refreshConfig() {
    void workspaceConfigQuery.refetch()
  }

  function activateProfile(profile: NonNullable<typeof agentProfiles[number]>) {
    void commitAgentProfileActivation({
      settings,
      profile,
      ...(currentUser?.ID ? { userId: String(currentUser.ID) } : {}),
      setSettings,
      setActiveConversation,
      saveWorkspaceConfig: async (input) => {
        await saveAgentProviderWorkspaceConfig(input)
        await workspaceConfigQuery.refetch()
      },
    })
  }

  function openAgentSettings(profileId: string) {
    updateAgentSettings({ activeProviderProfileConfigId: profileId })
    navigate(ROUTES.agentSettings)
  }

  function selectAgentProfile(profile: NonNullable<typeof agentProfiles[number]>) {
    if (profile.enabled && !profile.current) activateProfile(profile)
    openAgentSettings(profile.id)
  }

  return (
    <AgentPageShell data-testid="agents-page">
      <AgentPageShellHeader>
        <AgentConsoleHeader>
          <AgentConsoleHeaderCopy>
            <AgentConsoleHeaderTitleRow>
              <IdentityMark kind="agent" id="mova" />
              <AgentConsoleHeaderTitle>当前 Agent</AgentConsoleHeaderTitle>
              <AgentConsoleStatusBadge intent={selectedProfile ? 'success' : 'warning'} emphasis="soft">
                {selectedProfile?.label ?? '未选择'}
              </AgentConsoleStatusBadge>
              {workspaceConfigQuery.isLoading && <AgentConsoleSyncBadge>同步中</AgentConsoleSyncBadge>}
            </AgentConsoleHeaderTitleRow>
            <AgentConsoleHeaderDescription>
              这里只选择当前助手。运行时统一通过 Runtime Host 接入，模型、账号和权限偏好在 Agent 设置中管理。
            </AgentConsoleHeaderDescription>
          </AgentConsoleHeaderCopy>
          <AgentConsoleHeaderActions>
            <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={refreshConfig}>
              <RefreshCw size={14} />
              刷新配置
            </AgentConsoleActionButton>
          </AgentConsoleHeaderActions>
        </AgentConsoleHeader>
      </AgentPageShellHeader>

      <AgentConsoleNav compact />

      <AgentConsoleDocumentBody>
        <AgentConsoleStack spacing="loose">
          <AgentConsoleAgentList aria-label="Agent 切换列表">
            {agentProfiles.map((profile) => {
              const viewing = profile.routeKey === activeProviderKey
              return (
                <AgentConsoleAgentListRow
                  key={profile.id}
                  active={viewing}
                  onClick={() => selectAgentProfile(profile)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return
                    event.preventDefault()
                    selectAgentProfile(profile)
                  }}
                  aria-label={`选择并配置 ${profile.label}`}
                >
                  <span className="agent-console-local-tool-card__copy">
                    <span className="agent-console-local-tool-card__title">{profile.label}</span>
                    <span className="agent-console-local-tool-card__detail">
                      <IdentityBadge kind="agent" id={profile.routeKey} label={profile.routeKey} size="xs" /> {profile.connectionLabel} · 点击选择并配置
                    </span>
                  </span>
                  <AgentConsoleStatusBadge intent={profile.current ? 'success' : profile.enabled ? 'neutral' : 'warning'} emphasis="soft">
                    {profile.current ? '当前启用' : profile.enabled ? '可切换' : '已停用'}
                  </AgentConsoleStatusBadge>
                  <AgentConsoleAgentSwitch
                    checked={profile.current}
                    disabled={!profile.enabled || profile.current}
                    aria-label={`启用 ${profile.label}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      if (!profile.current) activateProfile(profile)
                    }}
                  />
                  <ChevronRight size={16} aria-hidden="true" />
                </AgentConsoleAgentListRow>
              )
            })}
          </AgentConsoleAgentList>

          <AgentConsoleCallout compact tone="neutral">
            同一时间只会有一个 Agent 生效。当前选择：{selectedProfile?.label ?? settings.defaultProviderId}。可用 Agent：{enabledCount}。
          </AgentConsoleCallout>

          {workspaceConfigQuery.error ? <AgentConsoleInlineError>{errorMessage(workspaceConfigQuery.error)}</AgentConsoleInlineError> : null}

          {activeProfile ? (
            <AgentConsoleCallout compact tone={activeProfile.enabled ? 'success' : 'warning'}>
              {activeProfile.label}：{activeProfile.detail}
            </AgentConsoleCallout>
          ) : (
            <AgentConsoleCallout compact tone="warning">
              当前没有可用 Agent。请先在 Agent 设置中启用一个 Agent。
            </AgentConsoleCallout>
          )}
        </AgentConsoleStack>
      </AgentConsoleDocumentBody>
    </AgentPageShell>
  )
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
