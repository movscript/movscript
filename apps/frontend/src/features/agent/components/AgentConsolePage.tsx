import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { AlertTriangle, Blocks, Bot, Cable, ClipboardList, MessageSquare, Network, Play, PlugZap, Power, RefreshCw, RotateCw, Settings, Square, Terminal, Trash2 } from 'lucide-react'
import {
  AgentConsoleActionButton,
  AgentConsoleBoundaryCard,
  AgentConsoleCallout,
  AgentConsoleDescription,
  AgentConsoleDivider,
  AgentConsoleEmptyText,
  AgentConsoleGrid,
  AgentConsoleHeader,
  AgentConsoleHeaderActions,
  AgentConsoleHeaderCopy,
  AgentConsoleHeaderDescription,
  AgentConsoleHeaderTitle,
  AgentConsoleHeaderTitleRow,
  AgentConsoleHistoryClearActions,
  AgentConsoleHistoryClearBody,
  AgentConsoleHistoryClearDetail,
  AgentConsoleHistoryClearIcon,
  AgentConsoleHistoryClearLayout,
  AgentConsoleHistoryClearSurface,
  AgentConsoleHistoryClearTitle,
  AgentConsoleIcon,
  AgentConsoleInlineError,
  AgentConsoleIntroRow,
  AgentConsoleIssueRowSurface,
  AgentConsoleLocalToolActions,
  AgentConsoleLocalToolCard,
  AgentConsoleLocalToolControls,
  AgentConsoleLocalToolCopy,
  AgentConsoleLocalToolDetail,
  AgentConsoleLocalToolFields,
  AgentConsoleLocalToolHeader,
  AgentConsoleLocalToolTitle,
  AgentConsoleMainColumn,
  AgentConsoleMainGrid,
  AgentConsoleManagementLink,
  AgentConsoleMetricCard,
  AgentConsoleMetricGrid,
  AgentConsolePanel,
  AgentConsolePanelActions,
  AgentConsoleSectionSpacer,
  AgentConsoleSidebar,
  AgentConsoleStack,
  AgentConsoleStatusBadge,
  AgentConsoleSyncBadge,
  AgentConsoleTestResult,
  AgentConsoleToolbar,
  AgentPageShell,
  AgentPageShellBody,
  AgentPageShellHeader,
  type AgentConsoleIssueTone,
} from '@movscript/ui'
import { AgentConsoleNav } from '@/features/agent/components/AgentConsoleNav'
import { ROUTES } from '@/routes/projectRoutes'
import { runStatusLabel } from '@/features/agent/domain/agentRunUi'
import { useAgentControlCenter } from '@/features/agent/presentation/useAgentControlCenter'
import { providerRoute } from '@/features/agent/application/providerRoutes'
import {
  failedAgentChatCapabilityProbeResult,
  probeAgentChatDataSourceCapabilities,
  type AgentChatCapabilityProbeItem,
  type AgentChatCapabilityProbeResult,
} from '@/features/agent/application/agentChatCapabilityProbe'
import { createAgentChatDataSourceForProvider } from '@/features/agent/application/agentChatDataSourceFactory'
import {
  agentReadinessStatusRecipe,
  agentRunStatusRecipe,
  agentSeverityStatusRecipe,
} from '@/features/agent/presentation/agentSemanticUi'
import { type ProviderSessionSummary, type AgentThreadSummary } from '@/shared/infrastructure/providerSessionClient'
import { type ProviderSessionRunListItem } from '@/features/agent/application/providerSessionThreadQueryCache'
import {
  errorMessage,
  modelDisplay,
  sortAgentControlRuns,
  summarizeAgentControlThreads,
  type AgentControlIssue,
} from '@/features/agent/application/agentControlCenter'
import {
  enabledProviders,
  normalizeProviderSettings,
  resolveAppServerProfile,
  usesAppServerProtocol,
  useProviderConfigStore,
  type ProviderConfig,
} from '@/shared/infrastructure/providerConfigStore'

type ConsoleIssueTone = AgentConsoleIssueTone
type ConsoleIssue = AgentControlIssue

export default function AgentConsolePage() {
  const controlCenter = useAgentControlCenter()
  const {
    providerSessionsQuery,
    modelQuery,
    runsQuery,
    threadsQuery,
    appServerStatusQuery,
    capabilityHealthQuery,
    providerSessions,
    runs,
    threads,
    enabledProvidersForConsole,
    providerSettings,
    defaultProvider,
    appServerProvider,
    appServerProfile,
    threadSummary,
    runSummary,
    capabilityHealth,
    toolSummary,
    skillSummary,
    pluginSummary,
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
  } = controlCenter
  const executingHistoryRunCount = runSummary.active
  const appServerProvidersForManagement = useMemo(
    () => providerSettings.providers.filter(usesAppServerProtocol),
    [providerSettings],
  )
  const agentsConfigRoute = appServerProvider ? providerRoute(appServerProvider) : ROUTES.agents

  return (
    <AgentPageShell data-testid="agent-console-page">
      <AgentPageShellHeader>
        <AgentConsoleHeader>
          <AgentConsoleHeaderCopy>
            <AgentConsoleHeaderTitleRow>
              <Bot size={18} />
              <AgentConsoleHeaderTitle>Agent 控制台</AgentConsoleHeaderTitle>
              <AgentConsoleStatusBadge intent={consoleStatusRecipe.intent} emphasis={consoleStatusRecipe.emphasis}>
                {attentionIssues.length > 0 ? `${attentionIssues.length} 项需关注` : '状态正常'}
              </AgentConsoleStatusBadge>
              {loading && <AgentConsoleSyncBadge>同步中</AgentConsoleSyncBadge>}
            </AgentConsoleHeaderTitleRow>
            <AgentConsoleHeaderDescription>
              聚合 Model Providers、Agents、Plugins 和 Workspace Root 的状态；业务页面只消费已配置好的能力。
            </AgentConsoleHeaderDescription>
          </AgentConsoleHeaderCopy>
          <AgentConsoleHeaderActions>
            <AgentConsoleActionButton asChild size="sm" variant="outline">
              <Link to={agentsConfigRoute}>
                <Settings size={14} />
                Agents
              </Link>
            </AgentConsoleActionButton>
            <AgentConsoleActionButton
              type="button"
              size="sm"
              variant={clearConfirming ? 'solid' : 'outline'}
              onClick={() => void clearThreadHistory()}
              disabled={clearingHistory || executingHistoryRunCount > 0 || (threads.length === 0 && runSummary.total === 0)}
              title={executingHistoryRunCount > 0 ? '请先取消运行中的 Run' : '清空历史会话记录'}
              data-testid="agent-console-header-clear-history"
             intent={clearConfirming ? 'danger' : 'neutral'}>
              <Trash2 size={14} />
              {clearingHistory ? '清空中...' : clearConfirming ? '确认清空历史' : '清空历史'}
            </AgentConsoleActionButton>
            <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={refreshAll} disabled={loading}>
              <AgentConsoleIcon icon={RefreshCw} size={14} spinning={loading} />
              刷新
            </AgentConsoleActionButton>
          </AgentConsoleHeaderActions>
        </AgentConsoleHeader>
      </AgentPageShellHeader>

      <AgentConsoleNav compact />

      <AgentPageShellBody>
        <AgentConsoleMetricGrid>
          <ConsoleMetricCard
            title="Agents"
            value={`${enabledProvidersForConsole.length} 个启用`}
            detail={`默认 Agent：${defaultProvider?.label ?? '未设置'}；模型连接在 Model Providers 管理`}
            tone={enabledProvidersForConsole.length > 0 ? 'ready' : 'action'}
          />
          <ConsoleMetricCard
            title="Provider Sessions"
            value={providerSessionsQuery.error ? '索引不可用' : `${onlineProviderSessionCount}/${providerSessions.length} 在线`}
            detail="按 provider/profile 聚合会话实例；不同 provider 通过各自 adapter 接入"
            tone={providerSessionsQuery.error ? 'action' : 'ready'}
          />
          <ConsoleMetricCard
            title="Provider Profile"
            value={modelQuery.data?.configured ? modelDisplay(modelQuery.data.model) : '模型未配置'}
            detail={modelQuery.error ? errorMessage(modelQuery.error) : `${modelQuery.data?.apiKind ?? '模型'} / Skills / Tools / Limits 属于 profile 层`}
            tone={modelQuery.data?.configured ? 'ready' : 'action'}
          />
          <ConsoleMetricCard
            title="Capabilities"
            value={capabilityHealth.checkedProviderCount > 0 ? `${toolSummary.available} 工具 / ${skillSummary.enabled} Skills` : '等待运行中 Agent'}
            detail={capabilityHealth.checkedProviderCount > 0
              ? `${pluginSummary.enabled} Plugins；已检查 ${capabilityHealth.checkedProviderCount}/${capabilityHealth.providerCount} 个运行中 Agent`
              : '启动任一 app-server provider 后读取统一能力入口'}
            tone={capabilityHealth.warningCount > 0 ? 'warning' : capabilityHealth.checkedProviderCount > 0 ? 'ready' : 'warning'}
          />
          <ConsoleMetricCard
            title="Conversation"
            value={`${threadSummary.total} 个会话`}
            detail={`${threadSummary.running} 运行中 / ${threadSummary.requiresAction} 待处理 / ${runSummary.total} 个 Run`}
            tone={threadSummary.requiresAction || runSummary.failed ? 'warning' : 'ready'}
          />
        </AgentConsoleMetricGrid>

        <AgentConsoleMainGrid>
          <AgentConsoleMainColumn>
            <AgentControlMatrixPanel
              appServerLabel={appServerProvider?.label ?? 'App Server Agent'}
              appServerConfigRoute={agentsConfigRoute}
              appServerEnabled={appServerProvider?.enabled === true}
              appServerRunning={appServerRunning}
              appServerProfileId={appServerProfile?.id ?? 'none'}
              appServerEndpoint={appServerStatusQuery.data?.endpoint}
              loading={Boolean(controlAction) || providerSessionsQuery.isFetching || appServerStatusQuery.isFetching}
              action={controlAction}
              error={controlError}
              onRefresh={refreshAll}
              onStartAppServer={() => void runControlAction('start-app-server', ensureAppServer)}
              onStopAppServer={() => void runControlAction('stop-app-server', stopAppServer)}
              onRestartAppServer={() => void runControlAction('restart-app-server', restartAppServer)}
            />

            <AgentCapabilityHealthPanel
              capabilityHealth={capabilityHealth}
              loading={capabilityHealthQuery.isFetching}
            />

            <AgentCapabilityProbePanel />

            <AgentSessionIntegrationPanel
              providerSessions={providerSessions}
              threads={threads}
              runs={runs}
              providers={enabledProvidersForConsole}
              loading={threadsQuery.isLoading || providerSessionsQuery.isLoading}
              error={threadsQuery.error ?? providerSessionsQuery.error}
            />

          </AgentConsoleMainColumn>

          <AgentConsoleSidebar>
            <ConsolePanel title="当前边界" icon={<ClipboardList size={14} />}>
              <AgentConsoleGrid>
                <BoundaryCard title="业务前台" detail="Agent 面板发起任务，业务页面负责对比、审阅和应用建议。" />
                <BoundaryCard title="控制台" detail="集中处理 Provider 配置、会话注册和 app-server 生命周期。" />
                <BoundaryCard title="线程详情" detail="app-server provider 通过 thread/list 接入统一会话。" />
              </AgentConsoleGrid>
            </ConsolePanel>

            <ConsolePanel title="需关注事项" icon={<AlertTriangle size={14} />}>
              {attentionIssues.length === 0 ? (
                <EmptyText>当前没有阻塞控制台的配置或运行问题。</EmptyText>
              ) : (
                <AgentConsoleStack>
                  {attentionIssues.map((issue) => <IssueRow key={issue.id} issue={issue} />)}
                </AgentConsoleStack>
              )}
            </ConsolePanel>

            <ConsolePanel title="管理入口" icon={<Terminal size={14} />}>
              <AgentConsoleGrid>
                <ManagementLink to={ROUTES.modelProviders} icon={<Settings size={14} />} title="Model Providers" detail="管理本地模型供应商、Base URL、API Key 和默认模型路由。" />
                {appServerProvidersForManagement.map((provider) => (
                  <ManagementLink
                    key={provider.id}
                    to={providerRoute(provider)}
                    icon={<Terminal size={14} />}
                    title={provider.label}
                    detail={`管理 ${provider.label} 的 app-server、托管 home 和运行状态。`}
                  />
                ))}
                <ManagementLink to={ROUTES.workspaceConfig} icon={<Settings size={14} />} title="Workspace" detail="查看和编辑 .movscript/data、reviews、sync 和 provider session 文件。" />
                <ManagementLink to={agentSettingsSectionPath('agent-settings-skills')} icon={<Cable size={14} />} title="Skills" detail="管理当前配置文件的 Skill 激活候选、依赖和冲突。" />
                <ManagementLink to={agentSettingsSectionPath('agent-settings-tools')} icon={<Terminal size={14} />} title="Tools" detail="管理当前配置文件的工具授权、审批、风险和运行可用性。" />
                <ManagementLink to={ROUTES.plugins} icon={<Blocks size={14} />} title="Plugins" detail="插件是全局扩展入口，也可以贡献 Provider Skills、Tools 和 UI 扩展。" />
              </AgentConsoleGrid>
              <AgentConsoleDivider>
                <HistoryClearControl
                  threadCount={threads.length}
                  runCount={runSummary.total}
                  executingRunCount={executingHistoryRunCount}
                  confirming={clearConfirming}
                  clearing={clearingHistory}
                  error={clearHistoryError}
                  result={clearHistoryResult}
                  onClear={() => void clearThreadHistory()}
                  onCancel={() => setClearConfirming(false)}
                />
              </AgentConsoleDivider>
            </ConsolePanel>
          </AgentConsoleSidebar>
        </AgentConsoleMainGrid>
      </AgentPageShellBody>
    </AgentPageShell>
  )
}

function AgentCapabilityProbePanel() {
  const savedSettings = useProviderConfigStore((state) => state.settings)
  const providers = useMemo(() => enabledProviders(normalizeProviderSettings(savedSettings)), [savedSettings])
  const probeQuery = useQuery({
    queryKey: ['agent-console-provider-capability-probe', providers.map(providerProbeKey).join('|')],
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
    <ConsolePanel
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
        <EmptyText>点击刷新后，控制台会通过统一数据源读取线程、模型、配置、插件、Skills、账号、MCP 和 realtime 能力摘要。</EmptyText>
      ) : (
        <AgentConsoleGrid columns="server" data-testid="agent-console-capability-probe-grid">
          {results.map((result) => <AgentCapabilityProbeCard key={result.providerId} result={result} />)}
        </AgentConsoleGrid>
      )}
    </ConsolePanel>
  )
}

function AgentCapabilityHealthPanel({
  capabilityHealth,
  loading,
}: {
  capabilityHealth: ReturnType<typeof useAgentControlCenter>['capabilityHealth']
  loading: boolean
}) {
  return (
    <ConsolePanel
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
        <EmptyText>启动任一 app-server provider 后，控制台会读取统一能力入口并汇总 Tools、Skills、Plugins 和 MCP 状态。</EmptyText>
      ) : (
        <AgentConsoleGrid columns="server">
          {capabilityHealth.providers.map((provider) => (
            <AgentCapabilityHealthCard key={provider.providerId} provider={provider} />
          ))}
        </AgentConsoleGrid>
      )}
    </ConsolePanel>
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

function AgentSessionIntegrationPanel({
  providerSessions,
  threads,
  runs,
  providers,
  loading,
  error,
}: {
  providerSessions: ProviderSessionSummary[]
  threads: AgentThreadSummary[]
  runs: ProviderSessionRunListItem[]
  providers: ProviderConfig[]
  loading: boolean
  error: unknown
}) {
  const threadSummary = summarizeAgentControlThreads(threads)
  const runsByThreadId = useMemo(() => {
    const grouped = new Map<string, ProviderSessionRunListItem[]>()
    for (const run of runs) {
      const list = grouped.get(run.threadId) ?? []
      list.push(run)
      grouped.set(run.threadId, list)
    }
    return grouped
  }, [runs])
  const sessionsById = useMemo(() => new Map(providerSessions.map((session) => [session.session.id, session])), [providerSessions])

  return (
    <ConsolePanel
      title="会话集成模型"
      icon={<MessageSquare size={14} />}
      action={
        <AgentConsolePanelActions>
          {loading && <AgentConsoleSyncBadge>同步中</AgentConsoleSyncBadge>}
          <AgentConsoleStatusBadge intent={threadSummary.requiresAction > 0 ? 'warning' : 'success'} emphasis="soft">
            {threadSummary.total} 个 ThreadRef
          </AgentConsoleStatusBadge>
        </AgentConsolePanelActions>
      }
    >
      <AgentConsoleIntroRow>
        <AgentConsoleDescription>
          先把用户看到的 Conversation 和 provider 内部 thread/session 拆开：控制台负责注册和恢复映射，聊天壳只负责渲染选中的统一数据源。
        </AgentConsoleDescription>
        <AgentConsoleToolbar>
          <AgentConsoleStatusBadge intent={providers.length > 0 ? 'success' : 'warning'} emphasis="soft">
            {providers.length} 个 Provider source
          </AgentConsoleStatusBadge>
          <AgentConsoleStatusBadge intent={providerSessions.length > 0 ? 'success' : 'neutral'} emphasis="soft">
            {providerSessions.length} 个 Provider session
          </AgentConsoleStatusBadge>
        </AgentConsoleToolbar>
      </AgentConsoleIntroRow>

      <AgentConsoleGrid columns="three">
        <BoundaryCard title="Conversation Record" detail="面板、项目页和历史列表共用一个会话对象；不再按 provider 分散保存 activeThreadId。" />
        <BoundaryCard title="Provider ThreadRef" detail="ThreadRef 携带 providerId、providerInstanceId、threadId、sessionId、workspaceDir，避免跨 provider 冲突。" />
        <BoundaryCard title="Participants" detail="主会话可以挂多个 worker/subagent thread，Pinned Status 和 Trace 从 participant refs 聚合。" />
      </AgentConsoleGrid>

      <AgentConsoleDivider>
        <AgentConsoleGrid columns="server">
          {providers.map((provider) => (
            <ProviderConversationSourceCard
              key={provider.id}
              provider={provider}
              threadCount={0}
              sessionCount={0}
            />
          ))}
        </AgentConsoleGrid>
      </AgentConsoleDivider>

      {error ? (
        <AgentConsoleInlineError>{errorMessage(error)}</AgentConsoleInlineError>
      ) : threads.length === 0 ? (
        <AgentConsoleDivider>
          <EmptyText>当前 workspace 还没有可注册的 provider session。任一 provider 都可以通过自己的协议 adapter 接入同一个 registry。</EmptyText>
        </AgentConsoleDivider>
      ) : (
        <AgentConsoleDivider>
          <AgentConsoleStack>
            {threads.slice(0, 6).map((thread) => (
              <ConversationThreadRefRow
                key={thread.id}
                thread={thread}
                session={thread.sessionId ? sessionsById.get(thread.sessionId) : undefined}
                runs={runsByThreadId.get(thread.id) ?? []}
              />
            ))}
          </AgentConsoleStack>
        </AgentConsoleDivider>
      )}
    </ConsolePanel>
  )
}

function ProviderConversationSourceCard({
  provider,
  threadCount,
  sessionCount,
}: {
  provider: ProviderConfig
  threadCount: number
  sessionCount: number
}) {
  const isAppServer = usesAppServerProtocol(provider)
  const profile = isAppServer ? resolveAppServerProfile(provider) : undefined
  return (
    <AgentConsoleLocalToolCard>
      <AgentConsoleLocalToolHeader>
        <AgentConsoleLocalToolCopy>
          <AgentConsoleLocalToolTitle>{provider.label}</AgentConsoleLocalToolTitle>
          <AgentConsoleLocalToolDetail>
            {isAppServer
              ? `${provider.label} app-server / ${profile?.id ?? provider.id}`
              : 'MovScript provider profile'}
          </AgentConsoleLocalToolDetail>
        </AgentConsoleLocalToolCopy>
        <AgentConsoleLocalToolControls>
          <AgentConsoleStatusBadge intent={provider.enabled ? 'success' : 'neutral'} emphasis="soft">
            {provider.enabled ? '启用' : '停用'}
          </AgentConsoleStatusBadge>
        </AgentConsoleLocalToolControls>
      </AgentConsoleLocalToolHeader>
      <AgentConsoleLocalToolFields>
        <AgentConsoleTestResult tone="neutral">
          <Network size={12} /> source：{isAppServer ? 'thread/list + realtime subscription' : 'provider sessions + event stream'}
        </AgentConsoleTestResult>
        <AgentConsoleTestResult tone="neutral">
          <PlugZap size={12} /> registry key：{provider.kind}:{provider.id}:{profile?.id ?? provider.id}
        </AgentConsoleTestResult>
        <AgentConsoleTestResult tone={isAppServer || threadCount > 0 ? 'success' : 'warning'}>
          {isAppServer ? '等待 app-server thread list 接入' : `${sessionCount} session / ${threadCount} thread`}
        </AgentConsoleTestResult>
      </AgentConsoleLocalToolFields>
    </AgentConsoleLocalToolCard>
  )
}

function ConversationThreadRefRow({
  thread,
  session,
  runs,
}: {
  thread: AgentThreadSummary
  session?: ProviderSessionSummary
  runs: ProviderSessionRunListItem[]
}) {
  const status = thread.status ?? 'idle'
  const statusRecipe = agentRunStatusRecipe(status === 'running' ? 'in_progress' : status === 'requires_action' ? 'requires_action' : status === 'failed' ? 'failed' : 'completed')
  const latestRun = sortAgentControlRuns(runs)[0]
  const providerKey = providerKeyForThreadRef(thread, session)
  return (
    <AgentConsoleLocalToolCard invalid={status === 'failed'}>
      <AgentConsoleLocalToolHeader>
        <AgentConsoleLocalToolCopy>
          <AgentConsoleLocalToolTitle>{thread.title || thread.id}</AgentConsoleLocalToolTitle>
          <AgentConsoleLocalToolDetail>
            provider={providerKey} / session={thread.sessionId ?? '-'} / thread={thread.id}
          </AgentConsoleLocalToolDetail>
        </AgentConsoleLocalToolCopy>
        <AgentConsoleLocalToolControls>
          <AgentConsoleStatusBadge intent={statusRecipe.intent} emphasis={statusRecipe.emphasis}>
            {status}
          </AgentConsoleStatusBadge>
        </AgentConsoleLocalToolControls>
      </AgentConsoleLocalToolHeader>
      <AgentConsoleLocalToolFields>
        <AgentConsoleTestResult tone="neutral">
          conversation key：{providerKey}:{thread.sessionId ?? 'session'}:{thread.id}
        </AgentConsoleTestResult>
        <AgentConsoleTestResult tone={session?.state?.status === 'running' || session?.state?.status === 'requires_action' ? 'success' : 'neutral'}>
          provider session：{session?.state?.status ?? 'indexed'} / messages={thread.messageCount ?? 0}
        </AgentConsoleTestResult>
        <AgentConsoleTestResult tone={latestRun?.status === 'failed' ? 'danger' : latestRun?.status === 'requires_action' ? 'warning' : 'neutral'}>
          latest run：{latestRun ? `${latestRun.id} / ${runStatusLabel(latestRun.status)}` : 'none'}
        </AgentConsoleTestResult>
      </AgentConsoleLocalToolFields>
    </AgentConsoleLocalToolCard>
  )
}

function providerKeyForThreadRef(thread: AgentThreadSummary, session?: ProviderSessionSummary): string {
  const rawMetadata = (thread as { metadata?: unknown }).metadata
  const metadata = isRecord(rawMetadata) ? rawMetadata : undefined
  const rawSession: unknown = session?.session
  const sessionRecord = isRecord(rawSession) ? rawSession : undefined
  const providerId = stringField(metadata?.providerId)
    ?? stringField(metadata?.provider)
    ?? stringField(metadata?.providerKind)
    ?? stringField(sessionRecord?.providerId)
    ?? stringField(sessionRecord?.provider)
    ?? stringField(sessionRecord?.providerKind)
  return providerId?.trim() || 'provider'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function AgentControlMatrixPanel({
  appServerLabel,
  appServerConfigRoute,
  appServerEnabled,
  appServerRunning,
  appServerProfileId,
  appServerEndpoint,
  loading,
  action,
  error,
  onRefresh,
  onStartAppServer,
  onStopAppServer,
  onRestartAppServer,
}: {
  appServerLabel: string
  appServerConfigRoute: string
  appServerEnabled: boolean
  appServerRunning: boolean
  appServerProfileId: string
  appServerEndpoint?: string
  loading: boolean
  action: string | null
  error: string | null
  onRefresh: () => void
  onStartAppServer: () => void
  onStopAppServer: () => void
  onRestartAppServer: () => void
}) {
  return (
    <ConsolePanel
      title="Agent Control Matrix"
      icon={<Power size={14} />}
      action={(
        <AgentConsolePanelActions>
          {loading && <AgentConsoleSyncBadge>同步中</AgentConsoleSyncBadge>}
          <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={onRefresh} disabled={loading}>
            <RefreshCw size={14} />
            刷新状态
          </AgentConsoleActionButton>
        </AgentConsolePanelActions>
      )}
    >
      <AgentConsoleIntroRow>
        <AgentConsoleDescription>
          控制台是 Provider 生命周期入口：这里启动、停止和刷新 Provider 状态；运行中的 app-server 需要先停止再修改配置。
        </AgentConsoleDescription>
        <AgentConsoleToolbar>
          <AgentConsoleStatusBadge intent={appServerRunning ? 'success' : 'warning'} emphasis="soft">
            {appServerRunning ? '1 个运行中' : '未启动'}
          </AgentConsoleStatusBadge>
        </AgentConsoleToolbar>
      </AgentConsoleIntroRow>

      {error ? <AgentConsoleInlineError>{error}</AgentConsoleInlineError> : null}

      <AgentConsoleGrid columns="server">
        <AgentConsoleLocalToolCard>
          <AgentConsoleLocalToolHeader>
            <AgentConsoleLocalToolCopy>
              <AgentConsoleLocalToolTitle>{appServerLabel}</AgentConsoleLocalToolTitle>
              <AgentConsoleLocalToolDetail>profile={appServerProfileId} / {appServerEndpoint ?? 'endpoint pending'}</AgentConsoleLocalToolDetail>
            </AgentConsoleLocalToolCopy>
            <AgentConsoleLocalToolControls>
              <AgentConsoleStatusBadge intent={appServerEnabled ? 'success' : 'neutral'} emphasis="soft">
                {appServerEnabled ? '启用' : '停用'}
              </AgentConsoleStatusBadge>
              <AgentConsoleStatusBadge intent={appServerRunning ? 'success' : 'warning'} emphasis="soft">
                {appServerRunning ? '运行中' : '未启动'}
              </AgentConsoleStatusBadge>
            </AgentConsoleLocalToolControls>
          </AgentConsoleLocalToolHeader>
          <AgentConsoleLocalToolFields>
            <AgentConsoleCallout compact>
              app-server 由 MovScript 托管，home path 由对应 provider profile 投影给启动进程；可在 Agents 中配置继承本机账号或使用托管 home。
            </AgentConsoleCallout>
          </AgentConsoleLocalToolFields>
          <AgentConsoleLocalToolActions>
            <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={onStartAppServer} disabled={!appServerEnabled || action === 'start-app-server'}>
              <Play size={14} />
              {appServerRunning ? '重连' : '启动'}
            </AgentConsoleActionButton>
            <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={onStopAppServer} disabled={!appServerRunning || action === 'stop-app-server'}>
              <Square size={14} />
              停止
            </AgentConsoleActionButton>
            <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={onRestartAppServer} disabled={!appServerEnabled || !appServerRunning || action === 'restart-app-server'}>
              <RotateCw size={14} />
              重启
            </AgentConsoleActionButton>
            <AgentConsoleActionButton asChild size="sm" variant="outline">
              <Link to={appServerConfigRoute}>
                <Settings size={14} />
                配置
              </Link>
            </AgentConsoleActionButton>
          </AgentConsoleLocalToolActions>
        </AgentConsoleLocalToolCard>
      </AgentConsoleGrid>
    </ConsolePanel>
  )
}

function ConsoleMetricCard({ title, value, detail, tone }: { title: string; value: string; detail: string; tone: ConsoleIssueTone }) {
  return <AgentConsoleMetricCard title={title} value={value} detail={detail} tone={tone} />
}

function ConsolePanel({ title, icon, action, children }: { title: string; icon: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return <AgentConsolePanel title={title} icon={icon} action={action}>{children}</AgentConsolePanel>
}

function BoundaryCard({ title, detail }: { title: string; detail: string }) {
  return <AgentConsoleBoundaryCard title={title} detail={detail} />
}

function IssueRow({ issue }: { issue: ConsoleIssue }) {
  const issueRecipe = agentSeverityStatusRecipe(issue.tone)
  const body = (
    <AgentConsoleIssueRowSurface
      tone={issue.tone === 'action' ? 'action' : 'warning'}
      title={issue.title}
      detail={issue.detail}
      badge={<AgentConsoleStatusBadge intent={issueRecipe.intent} emphasis={issueRecipe.emphasis}>{issue.tone === 'action' ? '处理' : '关注'}</AgentConsoleStatusBadge>}
    />
  )
  return issue.to ? <Link to={issue.to}>{body}</Link> : body
}

function ManagementLink({ to, icon, title, detail }: { to: string; icon: React.ReactNode; title: string; detail: string }) {
  return (
    <AgentConsoleManagementLink icon={icon} title={title} detail={detail}>
      <Link to={to} />
    </AgentConsoleManagementLink>
  )
}

function HistoryClearControl({
  threadCount,
  runCount,
  executingRunCount,
  confirming,
  clearing,
  error,
  result,
  onClear,
  onCancel,
}: {
  threadCount: number
  runCount: number
  executingRunCount: number
  confirming: boolean
  clearing: boolean
  error: string | null
  result: string | null
  onClear: () => void
  onCancel: () => void
}) {
  const hasHistory = threadCount > 0 || runCount > 0
  const blocked = executingRunCount > 0
  return (
    <AgentConsoleHistoryClearSurface>
      <AgentConsoleHistoryClearLayout>
        <AgentConsoleHistoryClearIcon />
        <AgentConsoleHistoryClearBody>
          <AgentConsoleHistoryClearTitle>历史会话记录</AgentConsoleHistoryClearTitle>
          <AgentConsoleHistoryClearDetail>
            {threadCount} 个会话 / {runCount} 个 Run。清空会物理删除 provider 会话、Run、计划、运行态记录和 trace 文件。
          </AgentConsoleHistoryClearDetail>
          {blocked && (
            <AgentConsoleCallout tone="warning" compact>
              有 {executingRunCount} 个正在执行的 Run，先取消后再清空。
            </AgentConsoleCallout>
          )}
          {error && (
            <AgentConsoleCallout data-testid="agent-console-history-clear-error" role="alert" tone="danger" compact>
              {error}
            </AgentConsoleCallout>
          )}
          {result && (
            <AgentConsoleCallout data-testid="agent-console-history-clear-result" role="status" tone="success" compact>
              {result}
            </AgentConsoleCallout>
          )}
          <AgentConsoleHistoryClearActions>
            {confirming && (
              <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={onCancel} disabled={clearing}>
                取消
              </AgentConsoleActionButton>
            )}
            <AgentConsoleActionButton
              type="button"
              size="sm"
              variant={confirming ? 'solid' : 'outline'}
              onClick={onClear}
              disabled={!hasHistory || blocked || clearing}
              data-testid="agent-console-clear-history"
             intent={confirming ? 'danger' : 'neutral'}>
              {clearing ? '清空中...' : confirming ? '确认清空历史' : '清空历史会话'}
            </AgentConsoleActionButton>
          </AgentConsoleHistoryClearActions>
        </AgentConsoleHistoryClearBody>
      </AgentConsoleHistoryClearLayout>
    </AgentConsoleHistoryClearSurface>
  )
}

function EmptyText({ children }: { children: React.ReactNode }) {
  return <AgentConsoleEmptyText>{children}</AgentConsoleEmptyText>
}

function agentSettingsSectionPath(sectionId: string): string {
  return `${ROUTES.agentSettings}#${encodeURIComponent(sectionId)}`
}
