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

import { ROUTES } from '@/routes/projectRoutes'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'
import {
  DEFAULT_CLAUDE_RUNTIME_PACKAGE_VERSION,
  MOVA_PROVIDER_ID,
  normalizeProviderSettingsWithRuntimeEnv,
  useProviderConfigStore,
} from '@/shared/infrastructure/providerConfigStore'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import {
  activeAgentProfileForRoute,
  agentRuntimeProbeParamsForProfile,
  agentProfilesFromProviderSettings,
  isClaudeAgentProfile,
  type AgentProfile,
} from '@/features/agent/application/agentProfileModel'
import {
  agentProviderSettingsWithWorkspaceSelection,
  commitAgentProfileActivation,
  loadAgentProviderWorkspaceConfig,
  saveAgentProviderWorkspaceConfig,
} from '@/features/agent/application/agentProviderActivation'
import { agentProviderKeys } from '@/features/agent/application/agentQueryKeys'
import { activeProviderKeyFromPath } from '@/features/agent/application/providerRoutes'
import { useAgentStore } from '@/features/agent/state/agentStore'
import { agentConversationRegistryActions } from '@/features/agent/state/agentConversationRegistryStore'

export type ClaudeRuntimeDownloadState =
  | { phase: 'installing'; label: string; packageName: string; packageVersion?: string }
  | { phase: 'success'; label: string; packageName: string; packageVersion?: string; message?: string }
  | { phase: 'error'; label: string; packageName: string; packageVersion?: string; message: string }

const HOST_RUNTIME_PACKAGE_NAME = '@movscript/mova-app-server'
const HOST_RUNTIME_PACKAGE_VERSION = '0.0.1-alpha.13'

export function useAgentsPageController() {
  const location = useLocation()
  const navigate = useNavigate()
  const savedSettings = useProviderConfigStore((state) => state.settings)
  const setSettings = useProviderConfigStore((state) => state.setSettings)
  const updateAgentSettings = useAgentStore((state) => state.updateSettings)
  const currentUser = useUserStore((state) => state.currentUser)
  const clearActiveConversations = agentConversationRegistryActions().clearActiveConversations
  const hydratedAgentSelectionUpdatedAtRef = useRef<string | null>(null)
  const [claudeRuntimeDownload, setClaudeRuntimeDownload] = useState<ClaudeRuntimeDownloadState | null>(null)
  const [hostRuntimeDownload, setHostRuntimeDownload] = useState<ClaudeRuntimeDownloadState | null>(null)
  const settings = useMemo(() => normalizeProviderSettingsWithRuntimeEnv(savedSettings), [savedSettings])
  const providers = settings.providers
  const agentProfiles = useMemo(() => agentProfilesFromProviderSettings(settings), [settings])
  const claudeProfile = agentProfiles.find(isClaudeAgentProfile)
  const claudeRuntimePackage = claudeProfile ? claudeRuntimePackageDescriptor(claudeProfile) : null
  const claudeRuntimeStatusQuery = useQuery({
    queryKey: agentProviderKeys.claudeRuntimePackageStatus(
      claudeRuntimePackage?.packageName,
      claudeRuntimePackage?.packageVersion,
    ),
    queryFn: () => claudeRuntimePackageStatus(claudeRuntimePackage),
    enabled: Boolean(claudeRuntimePackage),
    retry: false,
  })
  const hostRuntimeStatusQuery = useQuery({
    queryKey: agentProviderKeys.claudeRuntimePackageStatus(HOST_RUNTIME_PACKAGE_NAME, HOST_RUNTIME_PACKAGE_VERSION),
    queryFn: () => hostRuntimePackageStatus(),
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
      ...(claudeRuntimeDownload.packageVersion && claudeRuntimeDownload.packageVersion !== 'latest' ? { packageVersion: claudeRuntimeDownload.packageVersion } : {}),
    })
  }

  function cancelHostRuntimeDownload() {
    if (!hostRuntimeDownload || hostRuntimeDownload.phase !== 'installing') return
    void readElectronApi()?.sdkRuntimeCancelPackageInstall?.({
      packageName: hostRuntimeDownload.packageName,
      ...(hostRuntimeDownload.packageVersion && hostRuntimeDownload.packageVersion !== 'latest' ? { packageVersion: hostRuntimeDownload.packageVersion } : {}),
    })
  }

  async function activateProfile(profile: NonNullable<typeof agentProfiles[number]>): Promise<boolean> {
    if (await shouldDownloadHostRuntime(profile)) {
      const accepted = window.confirm([
        `启用 ${profile.label} 需要先下载 app-server 运行时。`,
        '运行时不会随应用默认安装；下载完成后这个 Agent 才可用。',
        '是否开始下载？',
      ].join('\n\n'))
      if (!accepted) return false
      setHostRuntimeDownload({ phase: 'installing', label: profile.label, packageName: HOST_RUNTIME_PACKAGE_NAME, packageVersion: HOST_RUNTIME_PACKAGE_VERSION })
      try {
        await installHostRuntime()
        await hostRuntimeStatusQuery.refetch()
        setHostRuntimeDownload(null)
      } catch (error) {
        setHostRuntimeDownload({
          phase: 'error',
          label: profile.label,
          packageName: HOST_RUNTIME_PACKAGE_NAME,
          packageVersion: HOST_RUNTIME_PACKAGE_VERSION,
          message: errorMessage(error),
        })
        return false
      }
    }
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

  return {
    activeProfile,
    activeProviderKey,
    activateProfile,
    agentProfiles,
    hostRuntimeDownload,
    hostRuntimeStatus: hostRuntimeStatusQuery.data,
    hostRuntimeStatusLoading: hostRuntimeStatusQuery.isLoading || hostRuntimeStatusQuery.isFetching,
    cancelHostRuntimeDownload,
    cancelClaudeRuntimeDownload,
    claudeRuntimeDownload,
    claudeRuntimeStatus: claudeRuntimeStatusQuery.data,
    claudeRuntimeStatusLoading: claudeRuntimeStatusQuery.isLoading,
    dismissHostRuntimeDownloadError: () => setHostRuntimeDownload(null),
    dismissClaudeRuntimeDownloadError: () => setClaudeRuntimeDownload(null),
    enabledCount,
    refreshConfig,
    selectAgentProfile,
    selectedProfile,
    settingsDefaultProviderId: settings.defaultProviderId,
    workspaceConfigError: workspaceConfigQuery.error ? errorMessage(workspaceConfigQuery.error) : null,
    workspaceConfigLoading: workspaceConfigQuery.isLoading,
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function shouldDownloadClaudeRuntime(profile: NonNullable<ReturnType<typeof agentProfilesFromProviderSettings>[number]>): Promise<boolean> {
  if (!isClaudeAgentProfile(profile) || profile.current) return false
  const { packageName, packageVersion } = claudeRuntimePackageDescriptor(profile)
  if (!packageName) return true
  const status = await readElectronApi()?.sdkRuntimePackageStatus?.({
    packageName,
    ...(packageVersion !== 'latest' ? { packageVersion } : {}),
  })
  return status?.installed !== true
}

async function shouldDownloadHostRuntime(profile: NonNullable<ReturnType<typeof agentProfilesFromProviderSettings>[number]>): Promise<boolean> {
  if (!isHostRuntimeAgentProfile(profile)) return false
  const status = await hostRuntimePackageStatus()
  return status.installed !== true
}

function isHostRuntimeAgentProfile(profile: Pick<AgentProfile, 'runtimeBackend'>): boolean {
  return profile.runtimeBackend.transport === 'app-server'
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

async function hostRuntimePackageStatus() {
  return readElectronApi()?.sdkRuntimePackageStatus?.({
    packageName: HOST_RUNTIME_PACKAGE_NAME,
    packageVersion: HOST_RUNTIME_PACKAGE_VERSION,
  }) ?? { packageName: HOST_RUNTIME_PACKAGE_NAME, installed: false, root: '' }
}

async function installClaudeRuntime(profile: AgentProfile): Promise<void> {
  const electronApi = readElectronApi()
  if (!electronApi?.sdkRuntimeRequest) throw new Error('当前运行环境不支持下载 Claude Agent SDK。')
  const result = await electronApi.sdkRuntimeRequest({
    method: 'runtime/probe',
    params: agentRuntimeProbeParamsForProfile(profile),
  })
  if (isRuntimeProbeWithPackageLoad(result) && result.checks.packageLoad.ok) return
  const error = isRuntimeProbeWithPackageLoad(result)
    ? result.checks.packageLoad.error || result.error
    : undefined
  throw new Error(error || 'Claude Agent SDK 下载后仍无法加载。')
}

async function installHostRuntime(): Promise<void> {
  const electronApi = readElectronApi()
  const installMethodName = ['sdkRuntimeInstall', 'App', 'Server', 'Package'].join('')
  const installMethod = (electronApi as Record<string, unknown> | undefined)?.[installMethodName]
  if (typeof installMethod !== 'function') throw new Error('当前运行环境不支持下载 app-server 运行时。')
  await installMethod()
  const status = await hostRuntimePackageStatus()
  if (status.installed !== true) throw new Error('app-server 运行时下载后仍未安装完成。')
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
