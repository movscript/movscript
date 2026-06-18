import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  Blocks,
  Bot,
  Cable,
  ClipboardList,
  RefreshCw,
  Settings,
  Terminal,
  Trash2,
} from 'lucide-react'
import {
  AgentPageShell,
  AgentPageShellHeader,
} from '@/features/agent/components/AgentPageUi'
import {
  AgentConsoleActionButton,
  AgentConsoleDivider,
  AgentConsoleGrid,
  AgentConsoleHeader,
  AgentConsoleHeaderActions,
  AgentConsoleHeaderCopy,
  AgentConsoleHeaderDescription,
  AgentConsoleHeaderTitle,
  AgentConsoleHeaderTitleRow,
  AgentConsoleIcon,
  AgentConsoleMainColumn,
  AgentConsoleMainGrid,
  AgentConsoleMetricGrid,
  AgentConsolePageBody,
  AgentConsoleSidebar,
  AgentConsoleStack,
  AgentConsoleStatusBadge,
  AgentConsoleSyncBadge,
} from '@/features/agent/components/AgentConsoleUi'
import { AgentConsoleNav } from '@/features/agent/components/AgentConsoleNav'
import {
  AgentControlMatrixPanel,
  BoundaryCard,
  ConsoleMetricCard,
  ConsolePanel,
  EmptyText,
  HistoryClearControl,
  IssueRow,
  ManagementLink,
  ProviderRuntimeSwitchPanel,
} from '@/features/agent/components/AgentConsolePageSections'
import { ROUTES } from '@/routes/projectRoutes'
import { useAgentControlCenter } from '@/features/agent/presentation/useAgentControlCenter'
import {
  errorMessage,
  modelDisplay,
} from '@/features/agent/application/agentControlCenter'
import {
  providerRuntimeProfile,
  providerSupportsAppServerRuntime,
  resolveAppServerProfile,
  useProviderConfigStore,
} from '@/shared/infrastructure/providerConfigStore'
import {
  AgentCapabilityHealthPanel,
  AgentCapabilityProbePanel,
} from '@/features/agent/components/AgentConsoleCapabilityPanels'
import {
  AppServerRealtimeLogPanel,
  useAppServerRealtimeLogs,
} from '@/features/agent/components/AgentConsoleRealtimeLogPanel'
import { AgentSessionIntegrationPanel } from '@/features/agent/components/AgentConsoleSessionIntegrationPanel'

export default function AgentConsolePage() {
  const controlCenter = useAgentControlCenter()
  const setProviderSettings = useProviderConfigStore((state) => state.setSettings)
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
  const defaultRuntime = defaultProvider ? providerRuntimeProfile(defaultProvider) : undefined
  const appServerProvidersForManagement = useMemo(
    () => providerSettings.providers.filter(providerSupportsAppServerRuntime),
    [providerSettings],
  )
  const appServerLogProfiles = useMemo(
    () => appServerProvidersForManagement.flatMap((provider) => {
      try {
        const profile = resolveAppServerProfile(provider)
        return [{
          profileId: profile.id,
          providerLabel: provider.label,
        }]
      } catch {
        return []
      }
    }),
    [appServerProvidersForManagement],
  )
  const appServerLogs = useAppServerRealtimeLogs(appServerLogProfiles)
  const hostedAgentsRoute = agentConsoleHostedTabRoute('console:agents')
  const hostedWorkspaceRoute = agentConsoleHostedTabRoute('console:workspace')

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
              聚合 Provider / Catalog / Route、Agents、Plugins 和 Workspace Root 的状态；业务页面只消费已配置好的能力。
            </AgentConsoleHeaderDescription>
          </AgentConsoleHeaderCopy>
          <AgentConsoleHeaderActions>
            <AgentConsoleActionButton asChild size="sm" variant="outline">
              <Link to={hostedAgentsRoute}>
                <Settings size={14} />
                选择 / 配置 Agent
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

      <AgentConsolePageBody>
        <AgentConsoleMetricGrid>
          <ConsoleMetricCard
            title="默认 Provider"
            value={defaultProvider?.label ?? '未选择'}
            detail={defaultRuntime ? `${defaultRuntime.api} / ${defaultRuntime.packageVersion ?? defaultRuntime.sdkPackageName ?? defaultRuntime.packageName ?? 'runtime configured'}` : '配置入口已连接'}
            tone={defaultProvider?.enabled ? 'ready' : 'action'}
          />
          <ConsoleMetricCard
            title="Model Runtime"
            value={modelQuery.data?.configured ? modelDisplay(modelQuery.data.model) : '模型未配置'}
            detail={modelQuery.error ? errorMessage(modelQuery.error) : `${modelQuery.data?.apiKind ?? '模型'}；来自当前 workspace provider 配置`}
            tone={modelQuery.data?.configured ? 'ready' : 'action'}
          />
          <ConsoleMetricCard
            title="App Server"
            value={providerSessionsQuery.error ? '索引不可用' : appServerRunning ? '运行中' : '未启动'}
            detail={appServerProvider ? (appServerStatusQuery.data?.endpoint ?? `${providerSessions.length} 个 Runtime ThreadRef 索引记录`) : '当前默认 runtime 不需要 app-server 启动'}
            tone={providerSessionsQuery.error ? 'action' : appServerProvider ? appServerRunning ? 'ready' : 'warning' : 'ready'}
          />
          <ConsoleMetricCard
            title="Capabilities"
            value={capabilityHealth.checkedProviderCount > 0 ? `${toolSummary.available} 工具 / ${skillSummary.enabled} Skills` : '等待运行中 Provider'}
            detail={capabilityHealth.checkedProviderCount > 0
              ? `${pluginSummary.enabled} Plugins；已检查 ${capabilityHealth.checkedProviderCount}/${capabilityHealth.providerCount} 个运行中 Agent`
              : '启动任一 app-server provider 后读取真实能力入口'}
            tone={capabilityHealth.warningCount > 0 ? 'warning' : capabilityHealth.checkedProviderCount > 0 ? 'ready' : 'warning'}
          />
          <ConsoleMetricCard
            title="Conversation"
            value={`${threadSummary.total} 个会话 / ${runSummary.total} 个 Run`}
            detail={`${threadSummary.running + runSummary.active} 运行中 / ${threadSummary.requiresAction + runSummary.requiresAction} 待处理 / ${threadSummary.failed + runSummary.failed} 失败`}
            tone={threadSummary.requiresAction || runSummary.failed ? 'warning' : 'ready'}
          />
        </AgentConsoleMetricGrid>

        <AgentConsoleMainGrid layout="control-logs">
          <AgentConsoleMainColumn pane="config">
            <AgentControlMatrixPanel
              appServerLabel={appServerProvider?.label ?? 'App Server Agent'}
              appServerConfigRoute={hostedAgentsRoute}
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

            <ProviderRuntimeSwitchPanel
              providers={enabledProvidersForConsole}
              settings={providerSettings}
              onSettingsChange={setProviderSettings}
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

          <AgentConsoleSidebar pane="logs">
            <AppServerRealtimeLogPanel
              logs={appServerLogs}
              status={appServerStatusQuery.data}
              profiles={appServerLogProfiles}
              primaryProfileId={appServerProfile?.id ?? 'none'}
              primaryProviderLabel={appServerProvider?.label ?? 'App Server Agent'}
            />

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
                <ManagementLink to={ROUTES.modelProviders} icon={<Settings size={14} />} title="Provider / Catalog / Route" detail="查看 Admin 已发布的 Provider 来源、Catalog Entry 和 Route；配置变更在 Admin 完成。" />
                {appServerProvidersForManagement.map((provider) => (
                  <ManagementLink
                    key={provider.id}
                    to={hostedAgentsRoute}
                    icon={<Terminal size={14} />}
                    title={provider.label}
                    detail={`管理 ${provider.label} 的 app-server、托管 home 和运行状态。`}
                  />
                ))}
                <ManagementLink to={hostedWorkspaceRoute} icon={<Settings size={14} />} title="Workspace" detail="查看 source 与 providers 配置。" />
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
      </AgentConsolePageBody>
    </AgentPageShell>
  )
}

function agentSettingsSectionPath(sectionId: string): string {
  return `${ROUTES.agentSettings}#${encodeURIComponent(sectionId)}`
}

function agentConsoleHostedTabRoute(tab: string): string {
  return `${ROUTES.appSettings}?tab=${encodeURIComponent(tab)}`
}
