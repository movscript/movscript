import {
  useMemo } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle,
  Blocks,
  Bot,
  Cable,
  ClipboardList,
  Play,
  Power,
  RefreshCw,
  RotateCw,
  Settings,
  Square,
  Terminal,
  Trash2 } from 'lucide-react'
import {
  AgentPageShell,
  AgentPageShellHeader,
} from '@/features/agent/components/AgentPageUi'
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
  type AgentConsoleIssueTone,
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
  AgentConsolePageBody,
  AgentConsolePanel,
  AgentConsolePanelActions,
  AgentConsoleSectionSpacer,
  AgentConsoleSidebar,
  AgentConsoleStack,
  AgentConsoleStatusBadge,
  AgentConsoleSyncBadge,
  AgentConsoleTestResult,
  AgentConsoleToolbar,
} from '@/features/agent/components/AgentConsoleUi'
import { AgentConsoleNav } from '@/features/agent/components/AgentConsoleNav'
import { ROUTES } from '@/routes/projectRoutes'
import { useAgentControlCenter } from '@/features/agent/presentation/useAgentControlCenter'
import { providerRoute } from '@/features/agent/application/providerRoutes'
import {
  agentSeverityStatusRecipe,
} from '@/features/agent/presentation/agentSemanticUi'
import {
  errorMessage,
  modelDisplay,
  type AgentControlIssue,
} from '@/features/agent/application/agentControlCenter'
import {
  resolveAppServerProfile,
  usesAppServerProtocol,
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
  const agentsConfigRoute = appServerProvider ? providerRoute(appServerProvider) : ROUTES.agents
  const appServerLogs = useAppServerRealtimeLogs(appServerLogProfiles)

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

      <AgentConsolePageBody>
        <AgentConsoleMetricGrid>
          <ConsoleMetricCard
            title="Agents"
            value={`${enabledProvidersForConsole.length} 个启用`}
            detail={`默认 Agent：${defaultProvider?.label ?? '未设置'}；模型连接在 Model Providers 管理`}
            tone={enabledProvidersForConsole.length > 0 ? 'ready' : 'action'}
          />
          <ConsoleMetricCard
            title="Agent Runtime Sessions"
            value={providerSessionsQuery.error ? '索引不可用' : `${onlineProviderSessionCount}/${providerSessions.length} 在线`}
            detail="按 runtime/profile 聚合会话实例；不同 runtime adapter 接入统一 registry"
            tone={providerSessionsQuery.error ? 'action' : 'ready'}
          />
          <ConsoleMetricCard
            title="Runtime Profile"
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

        <AgentConsoleMainGrid layout="control-logs">
          <AgentConsoleMainColumn pane="config">
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
                <ManagementLink to={ROUTES.modelProviders} icon={<Settings size={14} />} title="Model Providers" detail="管理后端模型路由；高级直连覆盖仅用于临时外部模型服务。" />
                {appServerProvidersForManagement.map((provider) => (
                  <ManagementLink
                    key={provider.id}
                    to={providerRoute(provider)}
                    icon={<Terminal size={14} />}
                    title={provider.label}
                    detail={`管理 ${provider.label} 的 app-server、托管 home 和运行状态。`}
                  />
                ))}
                <ManagementLink to={ROUTES.workspaceConfig} icon={<Settings size={14} />} title="Workspace" detail="查看 source 与 .movscript/providers 配置。" />
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
        <AgentConsoleLocalToolCard invalid={Boolean(error) || !appServerEnabled}>
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
              app-server 由 MovScript 托管，home path 由对应 runtime profile 投影给启动进程；可在 Agents 中配置继承本机账号或使用托管 home。
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
