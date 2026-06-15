import {
  useMemo } from 'react'
import { Cable,
  PlugZap,
  RefreshCw } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'

import {
  AgentConsoleActionButton,
  AgentConsoleDescription,
  AgentConsoleEmptyText,
  AgentConsoleGrid,
  AgentConsoleIcon,
  AgentConsoleInlineError,
  AgentConsoleIntroRow,
  AgentConsoleLocalToolCard,
  AgentConsoleLocalToolControls,
  AgentConsoleLocalToolCopy,
  AgentConsoleLocalToolDetail,
  AgentConsoleLocalToolFields,
  AgentConsoleLocalToolHeader,
  AgentConsoleLocalToolTitle,
  AgentConsolePanel,
  AgentConsolePanelActions,
  AgentConsoleStack,
  AgentConsoleStatusBadge,
  AgentConsoleSyncBadge,
  AgentConsoleTestResult,
  AgentConsoleToolbar,
} from '@/features/agent/components/AgentConsoleUi'
import {
  failedAgentChatCapabilityProbeResult,
  probeAgentChatDataSourceCapabilities,
  type AgentChatCapabilityProbeItem,
  type AgentChatCapabilityProbeResult,
} from '@movscript/core/agent/chat'
import { agentConsoleKeys } from '@/features/agent/application/agentQueryKeys'
import { createAgentChatDataSourceForProvider } from '@/features/agent/application/agentChatDataSourceFactory'
import { errorMessage } from '@/features/agent/application/agentControlCenter'
import { useAgentControlCenter } from '@/features/agent/presentation/useAgentControlCenter'
import { agentReadinessStatusRecipe } from '@/features/agent/presentation/agentSemanticUi'
import {
  enabledProviders,
  normalizeProviderSettings,
  resolveAppServerProfile,
  usesAppServerProtocol,
  useProviderConfigStore,
  type ProviderConfig,
} from '@/shared/infrastructure/providerConfigStore'

export function AgentCapabilityProbePanel() {
  const savedSettings = useProviderConfigStore((state) => state.settings)
  const providers = useMemo(() => enabledProviders(normalizeProviderSettings(savedSettings)), [savedSettings])
  const probeQuery = useQuery({
    queryKey: agentConsoleKeys.providerCapabilityProbe(providers.map(providerProbeKey).join('|')),
    queryFn: async () => Promise.all(providers.map(async (provider) => {
      try {
        const dataSource = await createAgentChatDataSourceForProvider(provider)
        return await probeAgentChatDataSourceCapabilities({ provider, dataSource })
      } catch (error) {
        return failedAgentChatCapabilityProbeResult({ provider, error })
      }
    })),
    enabled: false,
    retry: false,
  })
  const results = probeQuery.data ?? []
  const supportedCount = results.reduce((count, result) => count + result.supportedCount, 0)
  const warningCount = results.reduce((count, result) => count + result.warningCount, 0)
  const readiness = agentReadinessStatusRecipe(results.length > 0 && warningCount === 0)

  return (
    <AgentConsolePanel
      title="Provider 数据流与能力探针"
      icon={<Cable size={14} />}
      action={
        <AgentConsolePanelActions>
          {results.length > 0 ? (
            <AgentConsoleStatusBadge intent={readiness.intent} emphasis={readiness.emphasis}>
              {supportedCount} 个入口 / {warningCount} 项需关注
            </AgentConsoleStatusBadge>
          ) : null}
          <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={() => void probeQuery.refetch()} disabled={probeQuery.isFetching || providers.length === 0}>
            <AgentConsoleIcon icon={RefreshCw} size={14} spinning={probeQuery.isFetching} />
            {probeQuery.isFetching ? '探测中' : '刷新 Provider 能力'}
          </AgentConsoleActionButton>
        </AgentConsolePanelActions>
      }
    >
      <AgentConsoleIntroRow>
        <AgentConsoleDescription>
          通过统一数据源 capability 探测每个已启用 provider。app-server provider 可以按各自 profile 启动；后续 provider 只需要实现同一组能力入口。
        </AgentConsoleDescription>
        <AgentConsoleToolbar>
          <AgentConsoleStatusBadge intent={providers.length > 0 ? 'success' : 'warning'} emphasis="soft">
            {providers.length > 0 ? `${providers.length} 个 Provider 可探测` : '没有已启用 Provider'}
          </AgentConsoleStatusBadge>
        </AgentConsoleToolbar>
      </AgentConsoleIntroRow>

      {probeQuery.error ? (
        <AgentConsoleInlineError>{errorMessage(probeQuery.error)}</AgentConsoleInlineError>
      ) : results.length === 0 ? (
        <AgentConsoleEmptyText>点击刷新后，控制台会通过统一数据源读取线程、模型、配置、插件、Skills、账号、MCP 和 realtime 能力摘要。</AgentConsoleEmptyText>
      ) : (
        <AgentConsoleGrid columns="server" data-testid="agent-console-capability-probe-grid">
          {results.map((result) => <AgentCapabilityProbeCard key={result.providerId} result={result} />)}
        </AgentConsoleGrid>
      )}
    </AgentConsolePanel>
  )
}

export function AgentCapabilityHealthPanel({
  capabilityHealth,
  loading,
}: {
  capabilityHealth: ReturnType<typeof useAgentControlCenter>['capabilityHealth']
  loading: boolean
}) {
  return (
    <AgentConsolePanel
      title="运行中 Provider 能力健康"
      icon={<PlugZap size={14} />}
      action={
        <AgentConsolePanelActions>
          {loading && <AgentConsoleSyncBadge>同步中</AgentConsoleSyncBadge>}
          <AgentConsoleStatusBadge intent={capabilityHealth.warningCount > 0 ? 'warning' : capabilityHealth.checkedProviderCount > 0 ? 'success' : 'neutral'} emphasis="soft">
            {capabilityHealth.checkedProviderCount > 0 ? `${capabilityHealth.checkedProviderCount} 个已检查` : '等待运行中 Agent'}
          </AgentConsoleStatusBadge>
        </AgentConsolePanelActions>
      }
    >
      {capabilityHealth.providers.length === 0 ? (
        <AgentConsoleEmptyText>启动任一 app-server provider 后，控制台会读取统一能力入口并汇总 Tools、Skills、Plugins 和 MCP 状态。</AgentConsoleEmptyText>
      ) : (
        <AgentConsoleGrid columns="server">
          {capabilityHealth.providers.map((provider) => (
            <AgentCapabilityHealthCard key={provider.providerId} provider={provider} />
          ))}
        </AgentConsoleGrid>
      )}
    </AgentConsolePanel>
  )
}

function AgentCapabilityHealthCard({
  provider,
}: {
  provider: ReturnType<typeof useAgentControlCenter>['capabilityHealth']['providers'][number]
}) {
  return (
    <AgentConsoleLocalToolCard invalid={!provider.ok}>
      <AgentConsoleLocalToolHeader>
        <AgentConsoleLocalToolCopy>
          <AgentConsoleLocalToolTitle>{provider.providerLabel}</AgentConsoleLocalToolTitle>
          <AgentConsoleLocalToolDetail>{provider.providerKind} / {provider.providerId}</AgentConsoleLocalToolDetail>
        </AgentConsoleLocalToolCopy>
        <AgentConsoleLocalToolControls>
          <AgentConsoleStatusBadge intent={provider.ok ? 'success' : 'warning'} emphasis="soft">
            {provider.ok ? '能力正常' : `${provider.warningCount} 项需关注`}
          </AgentConsoleStatusBadge>
        </AgentConsoleLocalToolControls>
      </AgentConsoleLocalToolHeader>
      <AgentConsoleLocalToolFields>
        <AgentConsoleStack>
          <AgentConsoleTestResult tone={provider.blockedToolCount > 0 ? 'warning' : 'success'}>
            Tools：{provider.toolCount} 可用 / {provider.blockedToolCount} 受限
          </AgentConsoleTestResult>
          <AgentConsoleTestResult tone="success">
            Skills：{provider.skillCount} / Plugins：{provider.pluginCount}
          </AgentConsoleTestResult>
          <AgentConsoleTestResult tone={provider.mcpServerCount > 0 ? 'success' : 'neutral'}>
            MCP：{provider.mcpServerCount} servers / {provider.mcpToolCount} tools
          </AgentConsoleTestResult>
          {provider.warnings.map((warning) => (
            <AgentConsoleTestResult key={warning} tone="warning">
              {warning}
            </AgentConsoleTestResult>
          ))}
        </AgentConsoleStack>
      </AgentConsoleLocalToolFields>
    </AgentConsoleLocalToolCard>
  )
}

function AgentCapabilityProbeCard({ result }: { result: AgentChatCapabilityProbeResult }) {
  const readiness = agentReadinessStatusRecipe(result.ok)
  return (
    <AgentConsoleLocalToolCard invalid={!result.ok}>
      <AgentConsoleLocalToolHeader>
        <AgentConsoleLocalToolCopy>
          <AgentConsoleLocalToolTitle>{result.providerLabel}</AgentConsoleLocalToolTitle>
          <AgentConsoleLocalToolDetail>{result.dataSourceLabel} / {result.providerKind}</AgentConsoleLocalToolDetail>
        </AgentConsoleLocalToolCopy>
        <AgentConsoleLocalToolControls>
          <AgentConsoleStatusBadge intent={readiness.intent} emphasis={readiness.emphasis}>
            {result.ok ? '能力正常' : `${result.warningCount} 项需关注`}
          </AgentConsoleStatusBadge>
        </AgentConsoleLocalToolControls>
      </AgentConsoleLocalToolHeader>
      <AgentConsoleLocalToolFields>
        <AgentConsoleStack>
          {result.items.map((item) => (
            <AgentConsoleTestResult key={item.id} tone={capabilityProbeItemTone(item)}>
              {item.label} · {item.method}：{item.detail}
            </AgentConsoleTestResult>
          ))}
        </AgentConsoleStack>
      </AgentConsoleLocalToolFields>
    </AgentConsoleLocalToolCard>
  )
}

function capabilityProbeItemTone(item: AgentChatCapabilityProbeItem): 'success' | 'warning' | 'danger' {
  if (item.tone === 'ready') return 'success'
  if (item.tone === 'warning') return 'warning'
  return 'danger'
}

function providerProbeKey(provider: ProviderConfig): string {
  const profile = usesAppServerProtocol(provider) ? resolveAppServerProfile(provider) : undefined
  return [
    provider.id,
    provider.kind,
    provider.enabled ? 'enabled' : 'disabled',
    provider.label,
    profile?.id ?? '',
    profile?.executablePath ?? '',
    profile?.home ?? '',
    profile?.workspaceDir ?? '',
  ].join(':')
}
