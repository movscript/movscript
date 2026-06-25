import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  buildAgentControlIssues,
  clearWorkspaceSessionThreadHistory,
  EMPTY_AGENT_CONTROL_CAPABILITY_HEALTH,
  errorMessage,
  inspectAgentControlProviderCapabilities,
  listAgentControlProviderSessions,
  sortAgentControlRuns,
  summarizeAgentControlRuns,
  summarizeAgentControlThreads,
} from '@/features/agent/application/agentControlCenter'
import { listProviderSessionRunSummariesFromProviderSessions, listProviderSessionThreadSummariesFromWorkspace } from '@/features/agent/application/providerSessionThreadQueryCache'
import {
  providerSessionConsoleProfileKey,
  providerSessionKeys,
  providerSessionRunKeys,
  providerSessionThreadKeys,
} from '@/features/agent/application/providerSessionQueryKeys'
import { agentConsoleKeys } from '@/features/agent/application/agentQueryKeys'
import { providerRouteKey } from '@/features/agent/application/providerRoutes'
import { fetchAgentBackendModels } from '@/features/agent/application/agentModelCatalogApi'
import { agentModelKeys } from '@/features/agent/application/agentModelQueryKeys'
import { resolveAgentModelId } from '@/features/agent/application/agentDefaultModelSelection'
import { providerModelConfigFromSelection } from '@/features/agent/application/agentSettingsProviderModel'
import { agentSettingsModelIdForProvider, useAgentStore } from '@/features/agent/state/agentStore'
import {
  normalizeProviderSettingsWithRuntimeEnv,
  providerRuntimeProfile,
  useProviderConfigStore,
  type ProviderConfig,
} from '@/shared/infrastructure/providerConfigStore'
import { providerRuntimeModelAPIKinds } from '@/shared/infrastructure/providerRuntimeApiCatalog'
import { providerSupportsAgentProfile } from '@/features/agent/application/agentProfileModel'
import { agentReadinessStatusRecipe } from '@/features/agent/presentation/agentSemanticUi'

export function useAgentControlCenter() {
  const agentSettings = useAgentStore((state) => state.settings)
  const savedProviderSettings = useProviderConfigStore((state) => state.settings)
  const providerSettings = useMemo(() => normalizeProviderSettingsWithRuntimeEnv(savedProviderSettings), [savedProviderSettings])
  const defaultProvider = providerSettings.providers.find((provider) => provider.id === providerSettings.defaultProviderId)
  const activeProviderProfileKey = defaultProvider?.enabled && providerSupportsAgentProfile(defaultProvider)
    ? providerRouteKey(defaultProvider)
    : undefined
  const scopedProfileKey = providerSessionConsoleProfileKey(activeProviderProfileKey)
  const providerSessionsQuery = useQuery({
    queryKey: providerSessionKeys.workspaceProfile(scopedProfileKey),
    queryFn: () => listAgentControlProviderSessions({ providerProfileKey: activeProviderProfileKey }),
    enabled: Boolean(activeProviderProfileKey),
    retry: false,
  })
  const modelAPIKinds = defaultProvider ? providerRuntimeModelAPIKinds(providerRuntimeProfile(defaultProvider).api) : []
  const modelsQuery = useQuery({
    queryKey: agentModelKeys.backendCatalog(`agent-control-${scopedProfileKey}`, modelAPIKinds),
    queryFn: () => fetchAgentBackendModels({ apiKinds: modelAPIKinds }),
    enabled: Boolean(activeProviderProfileKey),
    retry: false,
  })
  const selectedModelId = defaultProvider ? agentSettingsModelIdForProvider(agentSettings, defaultProvider.id) : null
  const resolvedModelId = resolveAgentModelId({
    models: modelsQuery.data ?? [],
    selectedModelId,
  })
  const modelQuery = useMemo(() => ({
    data: resolvedModelId ? providerModelConfigFromSelection({ modelId: resolvedModelId }) : null,
    error: modelsQuery.error,
    isLoading: modelsQuery.isLoading,
    refetch: modelsQuery.refetch,
  }), [modelsQuery.error, modelsQuery.isLoading, modelsQuery.refetch, resolvedModelId])
  const runsQuery = useQuery({
    queryKey: providerSessionRunKeys.consoleProfile(scopedProfileKey),
    queryFn: () => listProviderSessionRunSummariesFromProviderSessions({ providerProfileKey: activeProviderProfileKey }),
    enabled: Boolean(activeProviderProfileKey),
    retry: false,
  })
  const threadsQuery = useQuery({
    queryKey: providerSessionThreadKeys.consoleProfile(scopedProfileKey),
    queryFn: () => listProviderSessionThreadSummariesFromWorkspace({
      includeProvisional: true,
      providerProfileKey: activeProviderProfileKey,
    }),
    enabled: Boolean(activeProviderProfileKey),
    retry: false,
  })
  const [clearConfirming, setClearConfirming] = useState(false)
  const [clearingHistory, setClearingHistory] = useState(false)
  const [clearHistoryError, setClearHistoryError] = useState<string | null>(null)
  const [clearHistoryResult, setClearHistoryResult] = useState<string | null>(null)

  const providerSessions = providerSessionsQuery.data ?? []
  const runs = useMemo(() => sortAgentControlRuns(runsQuery.data ?? []), [runsQuery.data])
  const threads = threadsQuery.data ?? []
  const threadSummary = useMemo(() => summarizeAgentControlThreads(threads), [threads])
  const runSummary = useMemo(() => summarizeAgentControlRuns(runs), [runs])
  const capabilityProviders = useMemo(() => {
    if (!defaultProvider?.enabled || !providerSupportsAgentProfile(defaultProvider)) return []
    return [defaultProvider]
  }, [defaultProvider])
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
  }), [capabilityHealth.checkedProviderCount, providerSessionsQuery.error, modelQuery.data?.configured, modelQuery.error, runSummary, toolSummary])
  const attentionIssues = issues.filter((item) => item.tone !== 'ready')
  const loading = providerSessionsQuery.isLoading || modelQuery.isLoading || runsQuery.isLoading || threadsQuery.isLoading || capabilityHealthQuery.isLoading
  const consoleStatusRecipe = agentReadinessStatusRecipe(attentionIssues.length === 0)

  function refreshAll() {
    void providerSessionsQuery.refetch()
    void modelQuery.refetch()
    void runsQuery.refetch()
    void threadsQuery.refetch()
    void capabilityHealthQuery.refetch()
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
    capabilityHealthQuery,
    providerSessions,
    runs,
    threads,
    providerSettings,
    defaultProvider,
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
    clearConfirming,
    clearingHistory,
    clearHistoryError,
    clearHistoryResult,
    refreshAll,
    clearThreadHistory,
    setClearConfirming,
  }
}

function providerControlHealthKey(provider: ProviderConfig): string {
  const runtime = providerRuntimeProfile(provider)
  return [
    provider.id,
    provider.kind,
    provider.enabled ? 'enabled' : 'disabled',
    provider.label,
    runtime.id,
    runtime.api,
  ].join(':')
}
