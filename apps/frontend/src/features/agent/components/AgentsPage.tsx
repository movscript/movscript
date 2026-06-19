import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  useLocation,
  useNavigate,
} from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronRight,
  Download,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Progress,
} from '@movscript/ui/primitives'
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
  DEFAULT_CLAUDE_RUNTIME_PACKAGE_VERSION,
  MOVA_PROVIDER_ID,
  normalizeProviderSettingsWithRuntimeEnv,
  providerRuntimeProfile,
  useProviderConfigStore,
} from '@/shared/infrastructure/providerConfigStore'
import {
  activeAgentProfileForRoute,
  agentProfilesFromProviderSettings,
  type AgentProfile,
} from '@/features/agent/application/agentProfileModel'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { ROUTES } from '@/routes/projectRoutes'

type ClaudeRuntimeDownloadState =
  | { phase: 'installing'; label: string; packageName: string; packageVersion: string }
  | { phase: 'error'; label: string; packageName: string; packageVersion: string; message: string }

export default function AgentsPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const savedSettings = useProviderConfigStore((state) => state.settings)
  const setSettings = useProviderConfigStore((state) => state.setSettings)
  const updateAgentSettings = useAgentStore((state) => state.updateSettings)
  const currentUser = useUserStore((state) => state.currentUser)
  const clearActiveConversations = agentConversationRegistryActions().clearActiveConversations
  const hydratedAgentSelectionUpdatedAtRef = useRef<string | null>(null)
  const [claudeRuntimeDownload, setClaudeRuntimeDownload] = useState<ClaudeRuntimeDownloadState | null>(null)
  const settings = useMemo(() => normalizeProviderSettingsWithRuntimeEnv(savedSettings), [savedSettings])
  const providers = settings.providers
  const agentProfiles = useMemo(() => agentProfilesFromProviderSettings(settings), [settings])
  const claudeProfile = agentProfiles.find((profile) => profile.provider.kind === 'claude')
  const claudeRuntimePackage = claudeProfile ? claudeRuntimePackageDescriptor(claudeProfile) : null
  const claudeRuntimeStatusQuery = useQuery({
    queryKey: [
      'agent-claude-runtime-package-status',
      claudeRuntimePackage?.packageName,
      claudeRuntimePackage?.packageVersion,
    ],
    queryFn: () => claudeRuntimePackageStatus(claudeRuntimePackage),
    enabled: Boolean(claudeRuntimePackage),
    retry: false,
  })
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

  function cancelClaudeRuntimeDownload() {
    if (!claudeRuntimeDownload || claudeRuntimeDownload.phase !== 'installing') return
    void readElectronApi()?.sdkRuntimeCancelPackageInstall?.({
      packageName: claudeRuntimeDownload.packageName,
      ...(claudeRuntimeDownload.packageVersion !== 'latest' ? { packageVersion: claudeRuntimeDownload.packageVersion } : {}),
    })
  }

  async function activateProfile(profile: NonNullable<typeof agentProfiles[number]>): Promise<boolean> {
    if (await shouldDownloadClaudeRuntime(profile)) {
      const accepted = window.confirm([
        '切换到 Claude Code 需要下载 Claude Agent SDK 运行时。',
        '依赖会现在开始下载，完成后自动切换；体积约 200MB+，需要网络连接。',
        '是否开始下载？',
      ].join('\n\n'))
      if (!accepted) return false
      const runtimePackage = claudeRuntimePackageDescriptor(profile)
      setClaudeRuntimeDownload({ phase: 'installing', label: profile.label, ...runtimePackage })
      try {
        await installClaudeRuntime(profile)
        await claudeRuntimeStatusQuery.refetch()
        setClaudeRuntimeDownload(null)
      } catch (error) {
        setClaudeRuntimeDownload({ phase: 'error', label: profile.label, ...runtimePackage, message: errorMessage(error) })
        return false
      }
    }
    await commitAgentProfileActivation({
      settings,
      profile,
      ...(currentUser?.ID ? { userId: String(currentUser.ID) } : {}),
      setSettings,
      clearActiveConversations,
      saveWorkspaceConfig: async (input) => {
        await saveAgentProviderWorkspaceConfig(input)
        await workspaceConfigQuery.refetch()
      },
    })
    return true
  }

  function openAgentSettings(profileId: string) {
    updateAgentSettings({ activeProviderProfileConfigId: profileId })
    navigate(ROUTES.agentSettings)
  }

  async function selectAgentProfile(profile: NonNullable<typeof agentProfiles[number]>) {
    if (profile.enabled && !profile.current) {
      const activated = await activateProfile(profile)
      if (!activated) return
    }
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
              const claudeRuntimeMissing = profile.provider.kind === 'claude'
                && !profile.current
                && claudeRuntimeStatusQuery.data?.installed === false
              const claudeRuntimeActionLabel = claudeRuntimeStatusQuery.data
                && 'installedVersion' in claudeRuntimeStatusQuery.data
                && claudeRuntimeStatusQuery.data.installedVersion
                ? '更新'
                : '下载'
              const claudeRuntimeStatusLoading = profile.provider.kind === 'claude'
                && !profile.current
                && claudeRuntimeStatusQuery.isLoading
              return (
                <AgentConsoleAgentListRow
                  key={profile.id}
                  active={viewing}
                  onClick={() => selectAgentProfile(profile)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return
                    event.preventDefault()
                    void selectAgentProfile(profile)
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
                  {claudeRuntimeMissing ? (
                    <AgentConsoleActionButton
                      type="button"
                      size="sm"
                      variant="outline"
                      aria-label={`下载并启用 ${profile.label}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        void activateProfile(profile)
                      }}
                    >
                      <Download size={14} />
                      {claudeRuntimeActionLabel}
                    </AgentConsoleActionButton>
                  ) : (
                    <AgentConsoleAgentSwitch
                      checked={profile.current}
                      disabled={!profile.enabled || profile.current || claudeRuntimeStatusLoading}
                      aria-label={`启用 ${profile.label}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        if (!profile.current) void activateProfile(profile)
                      }}
                    />
                  )}
                  <ChevronRight size={16} aria-hidden="true" />
                </AgentConsoleAgentListRow>
              )
            })}
          </AgentConsoleAgentList>

          <AgentConsoleCallout compact tone="neutral">
            同一时间只会有一个 Agent 生效。当前选择：{selectedProfile?.label ?? settings.defaultProviderId}。已启用 Agent：{enabledCount}。
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
      <ClaudeRuntimeDownloadDialog
        state={claudeRuntimeDownload}
        onCancel={cancelClaudeRuntimeDownload}
        onDismissError={() => setClaudeRuntimeDownload(null)}
      />
    </AgentPageShell>
  )
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function shouldDownloadClaudeRuntime(profile: NonNullable<ReturnType<typeof agentProfilesFromProviderSettings>[number]>): Promise<boolean> {
  const { provider, current } = profile
  if (provider.kind !== 'claude' || current) return false
  const { packageName, packageVersion } = claudeRuntimePackageDescriptor(profile)
  if (!packageName) return true
  const status = await readElectronApi()?.sdkRuntimePackageStatus?.({
    packageName,
    ...(packageVersion !== 'latest' ? { packageVersion } : {}),
  })
  return status?.installed !== true
}

function claudeRuntimePackageDescriptor(profile: AgentProfile): { packageName: string; packageVersion: string } {
  return {
    packageName: profile.runtimeBackend.packageName ?? '@anthropic-ai/claude-agent-sdk',
    packageVersion: profile.runtimeBackend.packageVersion ?? DEFAULT_CLAUDE_RUNTIME_PACKAGE_VERSION,
  }
}

async function claudeRuntimePackageStatus(descriptor: { packageName: string; packageVersion: string } | null) {
  if (!descriptor) return { installed: false }
  return readElectronApi()?.sdkRuntimePackageStatus?.({
    packageName: descriptor.packageName,
    ...(descriptor.packageVersion !== 'latest' ? { packageVersion: descriptor.packageVersion } : {}),
  }) ?? { installed: false }
}

async function installClaudeRuntime(profile: AgentProfile): Promise<void> {
  const electronApi = readElectronApi()
  if (!electronApi?.sdkRuntimeRequest) throw new Error('当前运行环境不支持下载 Claude Agent SDK。')
  const result = await electronApi.sdkRuntimeRequest({
    method: 'runtime/probe',
    params: {
      provider: profile.provider,
      runtime: providerRuntimeProfile(profile.provider),
    },
  })
  if (isRuntimeProbeWithPackageLoad(result) && result.checks.packageLoad.ok) return
  const error = isRuntimeProbeWithPackageLoad(result)
    ? result.checks.packageLoad.error || result.error
    : undefined
  throw new Error(error || 'Claude Agent SDK 下载后仍无法加载。')
}

function isRuntimeProbeWithPackageLoad(value: unknown): value is { checks: { packageLoad: { ok: boolean; error?: string } }; error?: string } {
  return Boolean(
    value
    && typeof value === 'object'
    && 'checks' in value
    && typeof (value as { checks?: unknown }).checks === 'object'
    && (value as { checks?: { packageLoad?: unknown } }).checks?.packageLoad,
  )
}

function ClaudeRuntimeDownloadDialog({
  state,
  onCancel,
  onDismissError,
}: {
  state: ClaudeRuntimeDownloadState | null
  onCancel: () => void
  onDismissError: () => void
}) {
  return (
    <Dialog open={Boolean(state)}>
      <DialogContent
        hideClose={state?.phase === 'installing'}
        className="w-[min(420px,calc(100vw-32px))]"
        onEscapeKeyDown={(event) => {
          if (state?.phase === 'installing') event.preventDefault()
        }}
        onPointerDownOutside={(event) => {
          if (state?.phase === 'installing') event.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle>{state?.phase === 'error' ? 'Claude 运行时下载失败' : '正在下载 Claude 运行时'}</DialogTitle>
          <DialogDescription>
            {state?.phase === 'error'
              ? '请检查网络连接或 npm 配置后重试。当前 Agent 不会被切换。'
              : '正在安装 Claude Agent SDK。请等待下载完成，完成后会自动切换到 Claude Code。'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-3 rounded-md border border-border bg-muted px-3 py-2">
          {state?.phase === 'error' ? null : <Loader2 size={16} className="shrink-0 animate-spin text-muted-foreground" />}
          <div className="min-w-0 flex-1">
            <p className="truncate type-caption text-foreground">{state?.label ?? 'Claude Code'}</p>
            <p className="type-tiny text-muted-foreground">
              {state ? `${state.packageName}@${state.packageVersion}` : `@anthropic-ai/claude-agent-sdk@${DEFAULT_CLAUDE_RUNTIME_PACKAGE_VERSION}`}
            </p>
          </div>
        </div>
        <div className="space-y-2">
          <Progress value={state?.phase === 'error' ? 100 : 45} className={state?.phase === 'installing' ? 'animate-pulse' : undefined} />
          <p className="type-tiny text-muted-foreground">
            {state?.phase === 'error' ? state.message : '正在下载并安装依赖，实际耗时取决于网络速度和 npm 源响应。'}
          </p>
        </div>
        {state?.phase === 'installing' ? (
          <div className="flex justify-end">
            <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={onCancel}>
              取消下载
            </AgentConsoleActionButton>
          </div>
        ) : null}
        {state?.phase === 'error' ? (
          <div className="flex justify-end">
            <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={onDismissError}>
              关闭
            </AgentConsoleActionButton>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
