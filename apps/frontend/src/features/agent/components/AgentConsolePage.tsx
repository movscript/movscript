import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  Bot,
  Cable,
  ClipboardList,
  RefreshCw,
  Settings,
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
import { agentConsoleSettingsRoute } from '@/features/agent/application/agentConsoleRouteModel'
import {
  BoundaryCard,
  ConsoleMetricCard,
  ConsolePanel,
  EmptyText,
  HistoryClearControl,
  IssueRow,
  ManagementLink,
} from '@/features/agent/components/AgentConsolePageSections'
import { ROUTES } from '@/routes/projectRoutes'
import { useAgentControlCenter } from '@/features/agent/presentation/useAgentControlCenter'
import {
  errorMessage,
  modelDisplay,
  type AgentControlCapabilityHealth,
  type AgentControlPluginSummary,
  type AgentControlSkillSummary,
  type AgentControlToolSummary,
} from '@/features/agent/application/agentControlCenter'
import { AgentCapabilityHealthPanel, AgentRuntimeCredentialPanel } from '@/features/agent/components/AgentConsoleCapabilityPanels'
import { AgentSessionIntegrationPanel } from '@/features/agent/components/AgentConsoleSessionIntegrationPanel'
import { AgentConsoleGlobalPluginPanel } from '@/features/agent/components/AgentConsoleGlobalPluginPanel'
import {
  activeAgentProfileForRoute,
  agentProfilesFromProviderSettings,
  type AgentProfile,
  type AgentRuntimeCapabilitySummary,
} from '@/features/agent/application/agentProfileModel'
import { useAgentConsoleGlobalPlugins } from '@/features/agent/application/useAgentConsoleGlobalPlugins'

export default function AgentConsolePage() {
  const controlCenter = useAgentControlCenter()
  const {
    providerSessionsQuery,
    modelQuery,
    runsQuery,
    threadsQuery,
    capabilityHealthQuery,
    providerSessions,
    runs,
    threads,
    providerSettings,
    threadSummary,
    runSummary,
    capabilityHealth,
    toolSummary,
    skillSummary,
    pluginSummary,
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
  } = controlCenter
  const executingHistoryRunCount = runSummary.active
  const agentProfiles = useMemo(() => agentProfilesFromProviderSettings(providerSettings), [providerSettings])
  const currentAgent = activeAgentProfileForRoute(agentProfiles, undefined)
  const capabilityMetric = agentConsoleCapabilityMetric(currentAgent, capabilityHealth, toolSummary, skillSummary, pluginSummary)
  const hostedAgentsRoute = agentConsoleSettingsRoute('console:agents')
  const globalPlugins = useAgentConsoleGlobalPlugins({ onChanged: refreshAll })

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
              展示当前 Agent、会话健康和需要处理的事项；连接方式和模型治理由系统后台与 Admin 边界处理。
            </AgentConsoleHeaderDescription>
          </AgentConsoleHeaderCopy>
          <AgentConsoleHeaderActions>
            <AgentConsoleActionButton asChild size="sm" variant="outline">
              <Link to={hostedAgentsRoute}>
                <Settings size={14} />
                当前 Agent
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
            title="当前 Agent"
            value={currentAgent?.label ?? '未选择'}
            detail={currentAgent?.detail ?? '选择一个 Agent 后即可开始会话。'}
            tone={currentAgent?.enabled ? 'ready' : 'action'}
          />
          <ConsoleMetricCard
            title="模型"
            value={modelQuery.data?.configured ? modelDisplay(modelQuery.data.model) : '模型未配置'}
            detail={modelQuery.error ? errorMessage(modelQuery.error) : `${modelQuery.data?.apiKind ?? '模型'}；治理配置由 Admin 提供，Agent 只消费 public model`}
            tone={modelQuery.data?.configured ? 'ready' : 'action'}
          />
          <ConsoleMetricCard
            title="连接"
            value={currentAgent?.connectionLabel ?? '未选择'}
            detail={providerSessionsQuery.error ? errorMessage(providerSessionsQuery.error) : `${providerSessions.length} 个会话索引记录；系统负责连接与恢复`}
            tone={providerSessionsQuery.error ? 'action' : currentAgent?.enabled ? 'ready' : 'warning'}
          />
          <ConsoleMetricCard
            title="能力"
            value={capabilityMetric.value}
            detail={capabilityMetric.detail}
            tone={capabilityMetric.tone}
          />
          <ConsoleMetricCard
            title="会话"
            value={`${threadSummary.total} 个会话 / ${runSummary.total} 个 Run`}
            detail={`${threadSummary.running + runSummary.active} 运行中 / ${threadSummary.requiresAction + runSummary.requiresAction} 待处理 / ${threadSummary.failed + runSummary.failed} 失败`}
            tone={threadSummary.requiresAction || runSummary.failed ? 'warning' : 'ready'}
          />
        </AgentConsoleMetricGrid>

        <AgentConsoleMainGrid layout="control-logs">
          <AgentConsoleMainColumn pane="config">
            <AgentRuntimeCredentialPanel
              profile={currentAgent}
              onCredentialSaved={refreshAll}
            />

            <AgentCapabilityHealthPanel
              profile={currentAgent}
              capabilityHealth={capabilityHealth}
              loading={capabilityHealthQuery.isFetching}
            />

            <AgentConsoleGlobalPluginPanel
              snapshot={globalPlugins.snapshot}
              loading={globalPlugins.loading}
              refreshing={globalPlugins.refreshing}
              error={globalPlugins.error}
              togglingKey={globalPlugins.togglingKey}
              onRefresh={globalPlugins.refresh}
              onToggle={(plugin, enabled) => void globalPlugins.togglePlugin(plugin, enabled)}
            />

            <AgentSessionIntegrationPanel
              providerSessions={providerSessions}
              threads={threads}
              runs={runs}
              profiles={currentAgent ? [currentAgent] : []}
              loading={threadsQuery.isLoading || providerSessionsQuery.isLoading}
              error={threadsQuery.error ?? providerSessionsQuery.error}
            />

          </AgentConsoleMainColumn>

          <AgentConsoleSidebar pane="logs">
            <ConsolePanel title="当前边界" icon={<ClipboardList size={14} />}>
              <AgentConsoleGrid>
                <BoundaryCard title="用户入口" detail="只选择当前 Agent、查看会话状态，并处理需要人工介入的事项。" />
                <BoundaryCard title="系统后台" detail="连接、进程、SDK 包和线程恢复由统一适配层处理，不作为普通管理项暴露。" />
                <BoundaryCard title="治理入口" detail="Provider、Catalog、Route 和密钥策略由 Admin 管理，Agent 只消费已发布模型能力。" />
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

            <ConsolePanel title="常用入口" icon={<Cable size={14} />}>
              <AgentConsoleGrid>
                <ManagementLink to={hostedAgentsRoute} icon={<Bot size={14} />} title="当前 Agent" detail="选择当前助手，只在必要时显示本地连接配置。" />
                <ManagementLink to={ROUTES.agentSettings} icon={<Settings size={14} />} title="Agent 设置" detail="管理技能、工具授权、配置文件和模型偏好。" />
                <ManagementLink to={ROUTES.agentConnections} icon={<Cable size={14} />} title="连接诊断" detail="查看原始事件、连接状态和线程流，供排障使用。" />
                <ManagementLink to={agentSettingsSectionPath('agent-settings-skills')} icon={<Cable size={14} />} title="Skills" detail="管理当前配置文件的 Skill 激活候选、依赖和冲突。" />
                <ManagementLink to={agentSettingsSectionPath('agent-settings-tools')} icon={<Cable size={14} />} title="Tools" detail="管理当前配置文件的工具授权、审批、风险和运行可用性。" />
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

function agentConsoleCapabilityMetric(
  profile: AgentProfile | undefined,
  capabilityHealth: AgentControlCapabilityHealth,
  toolSummary: AgentControlToolSummary,
  skillSummary: AgentControlSkillSummary,
  pluginSummary: AgentControlPluginSummary,
): { value: string; detail: string; tone: 'ready' | 'warning' | 'action' } {
  if (!profile) {
    return {
      value: '等待当前 Agent',
      detail: '选择当前 Agent 后读取 Runtime contract 和运行探测结果。',
      tone: 'warning',
    }
  }
  const runtimeSummary = profile.runtimeBackend.capabilitySummary
  const probeChecked = capabilityHealth.checkedProviderCount > 0
  const probeDetail = probeChecked
    ? `${toolSummary.available} 工具 / ${skillSummary.enabled} Skills / ${pluginSummary.enabled} Plugins`
    : '运行探测待同步'
  return {
    value: probeChecked
      ? `${runtimeCapabilityValue(runtimeSummary)} / ${toolSummary.available} 工具`
      : runtimeCapabilityValue(runtimeSummary),
    detail: `${runtimeCapabilityDetail(runtimeSummary)}；${probeDetail}`,
    tone: runtimeSummary.status === 'unavailable'
      ? 'action'
      : runtimeSummary.status === 'limited' || capabilityHealth.warningCount > 0
        ? 'warning'
        : probeChecked
          ? 'ready'
          : 'warning',
  }
}

function runtimeCapabilityValue(summary: AgentRuntimeCapabilitySummary): string {
  if (summary.totalCount === 0) return 'Runtime contract 未声明'
  return `Runtime ${summary.supportedCount}/${summary.totalCount} 支持`
}

function runtimeCapabilityDetail(summary: AgentRuntimeCapabilitySummary): string {
  if (summary.status === 'supported') return 'Runtime contract 声明完整能力支持'
  if (summary.status === 'limited') {
    const reason = summary.limitedReasons[0] ? `：${summary.limitedReasons[0]}` : ''
    return `Runtime contract 有 ${summary.limitedCount} 项能力受限${reason}`
  }
  return 'Runtime contract 暂不可用'
}
