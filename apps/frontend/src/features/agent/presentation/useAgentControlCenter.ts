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
import { listRuntimeRunSummariesFromWorkspace, listRuntimeThreadSummariesFromWorkspace } from '@/features/agent/application/agentRuntimeThreadQueryCache'
import {
  enabledAgentProviders,
  normalizeAgentProviderSettings,
  resolveCodexAppServerProfile,
  useAgentProviderConfigStore,
} from '@/features/agent/state/agentProviderConfigStore'
import { agentReadinessStatusRecipe } from '@/features/agent/presentation/agentSemanticUi'
import { localAgentClient } from '@/shared/infrastructure/localAgentClient'

export function useAgentControlCenter() {
  const runtimeSessionsQuery = useQuery({
    queryKey: ['agent-console-runtime-sessions', 'workspace'],
    queryFn: () => localAgentClient.listRuntimeSessionsFromWorkspace().then((result) => result.sessions),
    retry: false,
  })
  const modelQuery = useQuery({
    queryKey: ['agent-console-workspace-model-config'],
    queryFn: () => localAgentClient.getWorkspaceModelConfig(),
    retry: false,
  })
  const runsQuery = useQuery({
    queryKey: ['agent-console-runs', 'workspace-sessions'],
    queryFn: () => listRuntimeRunSummariesFromWorkspace(),
    retry: false,
  })
  const threadsQuery = useQuery({
    queryKey: ['agent-console-threads', 'workspace-sessions'],
    queryFn: () => listRuntimeThreadSummariesFromWorkspace({ includeProvisional: true }),
    retry: false,
  })
  const [clearConfirming, setClearConfirming] = useState(false)
  const [clearingHistory, setClearingHistory] = useState(false)
  const [clearHistoryError, setClearHistoryError] = useState<string | null>(null)
  const [clearHistoryResult, setClearHistoryResult] = useState<string | null>(null)
  const [controlAction, setControlAction] = useState<string | null>(null)
  const [controlError, setControlError] = useState<string | null>(null)

  const runtimeSessions = runtimeSessionsQuery.data ?? []
  const runs = useMemo(() => sortAgentControlRuns(runsQuery.data ?? []), [runsQuery.data])
  const threads = threadsQuery.data ?? []
  const savedProviderSettings = useAgentProviderConfigStore((state) => state.settings)
  const providerSettings = useMemo(() => normalizeAgentProviderSettings(savedProviderSettings), [savedProviderSettings])
  const enabledProvidersForConsole = useMemo(() => enabledAgentProviders(providerSettings), [providerSettings])
  const defaultProvider = providerSettings.providers.find((provider) => provider.id === providerSettings.defaultProviderId)
  const movscriptProvider = providerSettings.providers.find((provider) => provider.kind === 'movscript-agent')
  const codexProvider = providerSettings.providers.find((provider) => provider.kind === 'codex')
  const codexProfile = useMemo(() => resolveCodexAppServerProfile(codexProvider), [codexProvider])
  const codexStatusQuery = useQuery({
    queryKey: ['agent-console-control-codex-status', codexProfile.id],
    queryFn: async () => {
      const status = await window.api?.getCodexAppServerStatus?.({ profileId: codexProfile.id })
      return status ?? {
        ok: false,
        running: false,
        managed: false,
        profileId: codexProfile.id,
        error: '当前运行环境不支持 Codex app-server 管理。',
      }
    },
    enabled: codexProvider?.enabled !== false,
    retry: false,
  })
  const threadSummary = useMemo(() => summarizeAgentControlThreads(threads), [threads])
  const runSummary = useMemo(() => summarizeAgentControlRuns(runs), [runs])
  const runningSessionCount = runtimeSessions.filter((session) => session.running && !session.stale).length
  const codexRunning = Boolean(codexStatusQuery.data?.ok && codexStatusQuery.data.running)
  const capabilityProviders = useMemo(() => {
    return enabledProvidersForConsole.filter((provider) => {
      if (provider.kind === 'codex') return codexRunning
      if (provider.kind === 'movscript-agent') return runningSessionCount > 0
      return false
    })
  }, [codexRunning, enabledProvidersForConsole, runningSessionCount])
  const capabilityHealthQuery = useQuery({
    queryKey: ['agent-control-capability-health', capabilityProviders.map(agentProviderControlHealthKey).join('|')],
    queryFn: () => inspectAgentControlProviderCapabilities(capabilityProviders),
    enabled: capabilityProviders.length > 0,
    retry: false,
  })
  const capabilityHealth = capabilityHealthQuery.data ?? EMPTY_AGENT_CONTROL_CAPABILITY_HEALTH
  const toolSummary = capabilityHealth.toolSummary
  const skillSummary = capabilityHealth.skillSummary
  const pluginSummary = capabilityHealth.pluginSummary
  const issues = useMemo(() => buildAgentControlIssues({
    sessionIndexError: runtimeSessionsQuery.error,
    modelConfigured: modelQuery.data?.configured ?? false,
    modelError: modelQuery.error,
    activeRuns: runSummary.active,
    waitingRuns: runSummary.requiresAction,
    failedRuns: runSummary.failed,
    blockedTools: toolSummary.blocked,
    capabilityWarnings: toolSummary.warningCount,
    checkedCapabilityProviders: capabilityHealth.checkedProviderCount,
  }), [capabilityHealth.checkedProviderCount, runtimeSessionsQuery.error, modelQuery.data?.configured, modelQuery.error, runSummary, toolSummary])
  const attentionIssues = issues.filter((item) => item.tone !== 'ready')
  const loading = runtimeSessionsQuery.isLoading || modelQuery.isLoading || runsQuery.isLoading || threadsQuery.isLoading || capabilityHealthQuery.isLoading
  const consoleStatusRecipe = agentReadinessStatusRecipe(attentionIssues.length === 0)

  function refreshAll() {
    void runtimeSessionsQuery.refetch()
    void modelQuery.refetch()
    void runsQuery.refetch()
    void threadsQuery.refetch()
    void codexStatusQuery.refetch()
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

  async function ensureMovScriptAgent() {
    if (!window.api?.ensureAgentRuntime) throw new Error('当前运行环境不支持启动 MovScript Agent runtime。')
    await window.api.ensureAgentRuntime({ source: 'agent-console' })
    await Promise.all([runtimeSessionsQuery.refetch(), runsQuery.refetch(), threadsQuery.refetch()])
  }

  async function stopMovScriptAgent() {
    if (!window.api?.stopAgentRuntime) throw new Error('当前运行环境不支持停止 MovScript Agent runtime。')
    await window.api.stopAgentRuntime()
    await Promise.all([runtimeSessionsQuery.refetch(), runsQuery.refetch(), threadsQuery.refetch()])
  }

  async function restartMovScriptAgent() {
    if (!window.api?.ensureAgentRuntime || !window.api?.stopAgentRuntime) throw new Error('当前运行环境不支持重启 MovScript Agent runtime。')
    await window.api.stopAgentRuntime()
    await window.api.ensureAgentRuntime({ source: 'agent-console-restart' })
    await Promise.all([runtimeSessionsQuery.refetch(), runsQuery.refetch(), threadsQuery.refetch()])
  }

  async function ensureCodexAgent() {
    if (!window.api?.ensureCodexAppServer) throw new Error('当前运行环境不支持启动 Codex app-server。')
    await window.api.ensureCodexAppServer({ profile: codexProfile })
    await codexStatusQuery.refetch()
  }

  async function stopCodexAgent() {
    if (!window.api?.stopCodexAppServer) throw new Error('当前运行环境不支持停止 Codex app-server。')
    await window.api.stopCodexAppServer({ profileId: codexProfile.id })
    await codexStatusQuery.refetch()
  }

  async function restartCodexAgent() {
    if (!window.api?.ensureCodexAppServer || !window.api?.stopCodexAppServer) throw new Error('当前运行环境不支持重启 Codex app-server。')
    if (codexRunning) await window.api.stopCodexAppServer({ profileId: codexProfile.id })
    await window.api.ensureCodexAppServer({ profile: codexProfile })
    await codexStatusQuery.refetch()
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
      const result = await clearWorkspaceSessionThreadHistory(runtimeSessions)
      setClearConfirming(false)
      setClearHistoryResult(`已清空 ${result.threadCount} 个会话、${result.runCount} 个 Run。`)
      await Promise.all([
        runtimeSessionsQuery.refetch(),
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
    runtimeSessionsQuery,
    modelQuery,
    runsQuery,
    threadsQuery,
    codexStatusQuery,
    capabilityHealthQuery,
    runtimeSessions,
    runs,
    threads,
    providerSettings,
    enabledProvidersForConsole,
    defaultProvider,
    movscriptProvider,
    codexProvider,
    codexProfile,
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
    runningSessionCount,
    codexRunning,
    controlAction,
    controlError,
    clearConfirming,
    clearingHistory,
    clearHistoryError,
    clearHistoryResult,
    refreshAll,
    runControlAction,
    ensureMovScriptAgent,
    stopMovScriptAgent,
    restartMovScriptAgent,
    ensureCodexAgent,
    stopCodexAgent,
    restartCodexAgent,
    clearThreadHistory,
    setClearConfirming,
  }
}

function agentProviderControlHealthKey(provider: ReturnType<typeof enabledAgentProviders>[number]): string {
  const profile = provider.kind === 'codex' ? resolveCodexAppServerProfile(provider) : undefined
  return [
    provider.id,
    provider.kind,
    provider.enabled ? 'enabled' : 'disabled',
    provider.label,
    profile?.id ?? '',
    profile?.codexHome ?? '',
    profile?.workspaceDir ?? '',
  ].join(':')
}
