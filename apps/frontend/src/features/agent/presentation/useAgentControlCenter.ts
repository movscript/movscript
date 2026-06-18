import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  buildAgentControlIssues,
  clearWorkspaceSessionThreadHistory,
  EMPTY_AGENT_CONTROL_CAPABILITY_HEALTH,
  errorMessage,
  inspectAgentControlProviderCapabilities,
  sortAgentControlRuns,
  summarizeAgentControlRuns,
  summarizeAgentControlThreads,
} from '@/features/agent/application/agentControlCenter'
import { listProviderSessionRunSummariesFromProviderSessions, listProviderSessionThreadSummariesFromWorkspace } from '@/features/agent/application/providerSessionThreadQueryCache'
import { providerSessionKeys, providerSessionRunKeys, providerSessionThreadKeys } from '@/features/agent/application/providerSessionQueryKeys'
import { agentConsoleKeys } from '@/features/agent/application/agentQueryKeys'
import {
  enabledProviders,
  normalizeProviderSettingsWithRuntimeEnv,
  providerRuntimeProfile,
  providerSupportsAppServerRuntime,
  resolveAppServerProfile,
  useProviderConfigStore,
} from '@/shared/infrastructure/providerConfigStore'
import { agentReadinessStatusRecipe } from '@/features/agent/presentation/agentSemanticUi'
import { providerSessionClient } from '@/shared/infrastructure/providerSessionClient'
import { ensureDefaultAgentProviderFromBackend } from '@/features/agent/application/defaultAgentProvider'
import {
  ensureAppServer as ensureAppServerService,
  getAppServerStatus,
  stopAppServer as stopAppServerService,
} from '@/shared/infrastructure/app-server/appServerRpcClient'

export function useAgentControlCenter() {
  const providerSessionsQuery = useQuery({
    queryKey: providerSessionKeys.workspace,
    queryFn: () => providerSessionClient.listProviderSessionsFromWorkspace().then((result) => result.sessions),
    retry: false,
  })
  const modelQuery = useQuery({
    queryKey: agentConsoleKeys.providerModelConfig,
    queryFn: () => providerSessionClient.getProviderModelConfig(),
    retry: false,
  })
  const runsQuery = useQuery({
    queryKey: providerSessionRunKeys.console,
    queryFn: () => listProviderSessionRunSummariesFromProviderSessions(),
    retry: false,
  })
  const threadsQuery = useQuery({
    queryKey: providerSessionThreadKeys.console,
    queryFn: () => listProviderSessionThreadSummariesFromWorkspace({ includeProvisional: true }),
    retry: false,
  })
  const [clearConfirming, setClearConfirming] = useState(false)
  const [clearingHistory, setClearingHistory] = useState(false)
  const [clearHistoryError, setClearHistoryError] = useState<string | null>(null)
  const [clearHistoryResult, setClearHistoryResult] = useState<string | null>(null)
  const [controlAction, setControlAction] = useState<string | null>(null)
  const [controlError, setControlError] = useState<string | null>(null)

  const providerSessions = providerSessionsQuery.data ?? []
  const runs = useMemo(() => sortAgentControlRuns(runsQuery.data ?? []), [runsQuery.data])
  const threads = threadsQuery.data ?? []
  const savedProviderSettings = useProviderConfigStore((state) => state.settings)
  const providerSettings = useMemo(() => normalizeProviderSettingsWithRuntimeEnv(savedProviderSettings), [savedProviderSettings])
  const enabledProvidersForConsole = useMemo(() => enabledProviders(providerSettings), [providerSettings])
  const defaultProvider = providerSettings.providers.find((provider) => provider.id === providerSettings.defaultProviderId)
  const appServerProvider = useMemo(() => {
    if (providerSupportsAppServerRuntime(defaultProvider)) return defaultProvider
    return undefined
  }, [defaultProvider])
  const appServerProfile = useMemo(() => appServerProvider ? resolveAppServerProfile(appServerProvider) : undefined, [appServerProvider])
  const appServerStatusQuery = useQuery({
    queryKey: agentConsoleKeys.controlAppServerStatus(appServerProvider?.id ?? 'none', appServerProfile?.id ?? 'none'),
    queryFn: async () => {
      if (!appServerProvider || !appServerProfile) {
        return {
          ok: false,
          running: false,
          managed: false,
          profileId: 'none',
          error: '当前没有启用的 app-server provider。',
        }
      }
      const status = await getAppServerStatus({ profileId: appServerProfile.id })
      return status ?? {
        ok: false,
        running: false,
        managed: false,
        profileId: appServerProfile.id,
        error: `当前运行环境不支持 ${appServerProvider.label} app-server 管理。`,
      }
    },
    enabled: Boolean(appServerProvider?.enabled && appServerProfile),
    retry: false,
  })
  const threadSummary = useMemo(() => summarizeAgentControlThreads(threads), [threads])
  const runSummary = useMemo(() => summarizeAgentControlRuns(runs), [runs])
  const onlineProviderSessionCount = providerSessions.filter((session) => {
    const status = session.state?.status
    return status === 'running' || status === 'requires_action'
  }).length
  const appServerRunning = Boolean(appServerStatusQuery.data?.ok && appServerStatusQuery.data.running)
  const capabilityProviders = useMemo(() => {
    return enabledProvidersForConsole.filter((provider) => {
      if (providerSupportsAppServerRuntime(provider)) return appServerRunning && provider.id === appServerProvider?.id
      return false
    })
  }, [appServerProvider?.id, appServerRunning, enabledProvidersForConsole])
  const capabilityHealthQuery = useQuery({
    queryKey: agentConsoleKeys.controlCapabilityHealth(capabilityProviders.map(providerControlHealthKey).join('|')),
    queryFn: () => inspectAgentControlProviderCapabilities(capabilityProviders),
    enabled: capabilityProviders.length > 0,
    retry: false,
  })
  const capabilityHealth = capabilityHealthQuery.data ?? EMPTY_AGENT_CONTROL_CAPABILITY_HEALTH
  const toolSummary = capabilityHealth.toolSummary
  const skillSummary = capabilityHealth.skillSummary
  const pluginSummary = capabilityHealth.pluginSummary
  const issues = useMemo(() => buildAgentControlIssues({
    sessionIndexError: providerSessionsQuery.error,
    modelConfigured: modelQuery.data?.configured ?? false,
    modelError: modelQuery.error,
    activeRuns: runSummary.active,
    waitingRuns: runSummary.requiresAction,
    failedRuns: runSummary.failed,
    blockedTools: toolSummary.blocked,
    capabilityWarnings: toolSummary.warningCount,
    checkedCapabilityProviders: capabilityHealth.checkedProviderCount,
    appServerProvider,
  }), [appServerProvider, capabilityHealth.checkedProviderCount, providerSessionsQuery.error, modelQuery.data?.configured, modelQuery.error, runSummary, toolSummary])
  const attentionIssues = issues.filter((item) => item.tone !== 'ready')
  const loading = providerSessionsQuery.isLoading || modelQuery.isLoading || runsQuery.isLoading || threadsQuery.isLoading || capabilityHealthQuery.isLoading
  const consoleStatusRecipe = agentReadinessStatusRecipe(attentionIssues.length === 0)

  function refreshAll() {
    void providerSessionsQuery.refetch()
    void modelQuery.refetch()
    void runsQuery.refetch()
    void threadsQuery.refetch()
    void appServerStatusQuery.refetch()
    void capabilityHealthQuery.refetch()
  }

  async function runControlAction(action: string, fn: () => Promise<void>) {
    setControlAction(action)
    setControlError(null)
    try {
      await fn()
    } catch (error) {
      setControlError(errorMessage(error))
    } finally {
      setControlAction(null)
    }
  }

  async function ensureAppServer() {
    if (!appServerProvider || !appServerProfile) throw new Error('当前没有启用的 app-server provider。')
    await ensureDefaultAgentProviderFromBackend({ provider: appServerProvider })
    const status = await ensureAppServerService({ profile: appServerProfile })
    if (!status) throw new Error(`当前运行环境不支持启动 ${appServerProvider.label} app-server。`)
    if (!status.ok) throw new Error(status.error || `${appServerProvider.label} app-server 启动失败。`)
    await appServerStatusQuery.refetch()
  }

  async function stopAppServer() {
    if (!appServerProvider || !appServerProfile) throw new Error('当前没有启用的 app-server provider。')
    const status = await stopAppServerService({ profileId: appServerProfile.id })
    if (!status) throw new Error(`当前运行环境不支持停止 ${appServerProvider.label} app-server。`)
    await appServerStatusQuery.refetch()
  }

  async function restartAppServer() {
    if (!appServerProvider || !appServerProfile) throw new Error('当前没有启用的 app-server provider。')
    if (appServerRunning) {
      const stopStatus = await stopAppServerService({ profileId: appServerProfile.id })
      if (!stopStatus) throw new Error(`当前运行环境不支持重启 ${appServerProvider.label} app-server。`)
    }
    await ensureDefaultAgentProviderFromBackend({ provider: appServerProvider })
    const startStatus = await ensureAppServerService({ profile: appServerProfile })
    if (!startStatus) throw new Error(`当前运行环境不支持重启 ${appServerProvider.label} app-server。`)
    if (!startStatus.ok) throw new Error(startStatus.error || `${appServerProvider.label} app-server 重启失败。`)
    await appServerStatusQuery.refetch()
  }

  async function clearThreadHistory() {
    setClearHistoryError(null)
    setClearHistoryResult(null)
    if (!clearConfirming) {
      setClearConfirming(true)
      window.setTimeout(() => setClearConfirming(false), 5_000)
      return
    }
    setClearingHistory(true)
    try {
      const result = await clearWorkspaceSessionThreadHistory(providerSessions)
      setClearConfirming(false)
      setClearHistoryResult(`已清空 ${result.threadCount} 个会话、${result.runCount} 个 Run。`)
      await Promise.all([
        providerSessionsQuery.refetch(),
        runsQuery.refetch(),
        threadsQuery.refetch(),
      ])
    } catch (error) {
      setClearHistoryError(errorMessage(error))
    } finally {
      setClearingHistory(false)
    }
  }

  return {
    providerSessionsQuery,
    modelQuery,
    runsQuery,
    threadsQuery,
    appServerStatusQuery,
    capabilityHealthQuery,
    providerSessions,
    runs,
    threads,
    providerSettings,
    enabledProvidersForConsole,
    defaultProvider,
    appServerProvider,
    appServerProfile,
    threadSummary,
    runSummary,
    capabilityHealth,
    toolSummary,
    skillSummary,
    pluginSummary,
    issues,
    attentionIssues,
    loading,
    consoleStatusRecipe,
    onlineProviderSessionCount,
    appServerRunning,
    controlAction,
    controlError,
    clearConfirming,
    clearingHistory,
    clearHistoryError,
    clearHistoryResult,
    refreshAll,
    runControlAction,
    ensureAppServer,
    stopAppServer,
    restartAppServer,
    clearThreadHistory,
    setClearConfirming,
  }
}

function providerControlHealthKey(provider: ReturnType<typeof enabledProviders>[number]): string {
  const runtime = providerRuntimeProfile(provider)
  const profile = providerSupportsAppServerRuntime(provider) ? resolveAppServerProfile(provider) : undefined
  return [
    provider.id,
    provider.kind,
    provider.enabled ? 'enabled' : 'disabled',
    provider.label,
    runtime.id,
    runtime.api,
    profile?.id ?? '',
    profile?.home ?? '',
    profile?.workspaceDir ?? '',
  ].join(':')
}
