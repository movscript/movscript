import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Play,
  Power,
  RefreshCw,
  RotateCw,
  Settings,
  SlidersHorizontal,
  Square,
} from 'lucide-react'

import {
  AgentConsoleActionButton,
  AgentConsoleBoundaryCard,
  AgentConsoleCallout,
  AgentConsoleDescription,
  AgentConsoleEmptyText,
  AgentConsoleGrid,
  AgentConsoleHistoryClearActions,
  AgentConsoleHistoryClearBody,
  AgentConsoleHistoryClearDetail,
  AgentConsoleHistoryClearIcon,
  AgentConsoleHistoryClearLayout,
  AgentConsoleHistoryClearSurface,
  AgentConsoleHistoryClearTitle,
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
  AgentConsoleManagementLink,
  AgentConsoleMetricCard,
  AgentConsolePanel,
  AgentConsolePanelActions,
  AgentConsoleSelectField,
  AgentConsoleStatusBadge,
  AgentConsoleSyncBadge,
  AgentConsoleToolbar,
} from '@/features/agent/components/AgentConsoleUi'
import { agentSeverityStatusRecipe } from '@/features/agent/presentation/agentSemanticUi'
import type { AgentControlIssue } from '@/features/agent/application/agentControlCenter'
import {
  providerRuntimeApiOptions,
  providerRuntimeProfile,
  providerWithRuntimeApi,
  type ProviderConfig,
  type ProviderRuntimeApi,
  type ProviderSettings,
} from '@/shared/infrastructure/providerConfigStore'

type ConsoleIssueTone = AgentConsoleIssueTone
type ConsoleIssue = AgentControlIssue

export function AgentControlMatrixPanel({
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
      title="当前 Agent 启动与配置"
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
          这里只管理 app-server runtime 的生命周期：启动、停止和刷新运行状态。SDK runtime 不需要 app-server 账号投影，能力状态会在 Provider 探针里通过 runtime/probe 检查。
        </AgentConsoleDescription>
        <AgentConsoleToolbar>
          <AgentConsoleStatusBadge intent={appServerRunning ? 'success' : 'warning'} emphasis="soft">
            {appServerRunning ? '1 个运行中' : '未启动'}
          </AgentConsoleStatusBadge>
        </AgentConsoleToolbar>
      </AgentConsoleIntroRow>

      {error ? <AgentConsoleInlineError>{error}</AgentConsoleInlineError> : null}

      <AgentConsoleGrid columns="single">
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
              app-server 由 MovScript 托管，home path 由对应 runtime profile 投影给启动进程；只有 app-server runtime 需要在 Agents 中配置继承本机账号或使用托管 home。
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
                配置当前 Agent
              </Link>
            </AgentConsoleActionButton>
          </AgentConsoleLocalToolActions>
        </AgentConsoleLocalToolCard>
      </AgentConsoleGrid>
    </ConsolePanel>
  )
}

export function ConsoleMetricCard({ title, value, detail, tone }: { title: string; value: string; detail: string; tone: ConsoleIssueTone }) {
  return <AgentConsoleMetricCard title={title} value={value} detail={detail} tone={tone} />
}

export function ProviderRuntimeSwitchPanel({
  providers,
  settings,
  onSettingsChange,
}: {
  providers: ProviderConfig[]
  settings: ProviderSettings
  onSettingsChange: (settings: ProviderSettings) => void
}) {
  const changeProviderRuntime = (provider: ProviderConfig, api: ProviderRuntimeApi) => {
    onSettingsChange({
      ...settings,
      providers: settings.providers.map((item) => item.id === provider.id ? providerWithRuntimeApi(item, api) : item),
    })
  }

  return (
    <ConsolePanel
      title="Provider Runtime"
      icon={<SlidersHorizontal size={14} />}
      action={(
        <AgentConsolePanelActions>
          <AgentConsoleStatusBadge intent={providers.length > 0 ? 'success' : 'warning'} emphasis="soft">
            {providers.length > 0 ? `${providers.length} 个已启用` : '无可用 Provider'}
          </AgentConsoleStatusBadge>
        </AgentConsolePanelActions>
      )}
    >
      {providers.length === 0 ? (
        <AgentConsoleEmptyText>启用 provider 后可以在这里选择运行时。</AgentConsoleEmptyText>
      ) : (
        <AgentConsoleGrid columns="single">
          {providers.map((provider) => {
            const runtime = providerRuntimeProfile(provider)
            const options = providerRuntimeApiOptions(provider)
            const canSwitch = options.length > 1
            return (
              <AgentConsoleLocalToolCard key={provider.id}>
                <AgentConsoleLocalToolHeader>
                  <AgentConsoleLocalToolCopy>
                    <AgentConsoleLocalToolTitle>{provider.label}</AgentConsoleLocalToolTitle>
                    <AgentConsoleLocalToolDetail>{provider.kind} / {runtime.packageVersion ?? runtime.sdkPackageName ?? runtime.packageName ?? runtime.api}</AgentConsoleLocalToolDetail>
                  </AgentConsoleLocalToolCopy>
                  <AgentConsoleLocalToolControls>
                    <AgentConsoleStatusBadge intent={runtime.api === 'app-server' ? 'warning' : 'success'} emphasis="soft">
                      {runtime.api}
                    </AgentConsoleStatusBadge>
                  </AgentConsoleLocalToolControls>
                </AgentConsoleLocalToolHeader>
                <AgentConsoleLocalToolFields>
                  {canSwitch ? (
                    <AgentConsoleSelectField
                      label="Runtime"
                      value={runtime.api}
                      onChange={(event) => changeProviderRuntime(provider, event.target.value as ProviderRuntimeApi)}
                    >
                      {options.map((option) => (
                        <option key={option.api} value={option.api}>{option.label}</option>
                      ))}
                    </AgentConsoleSelectField>
                  ) : (
                    <AgentConsoleCallout compact>
                      当前 provider 只有一个可用 runtime：{runtime.label}。
                    </AgentConsoleCallout>
                  )}
                </AgentConsoleLocalToolFields>
              </AgentConsoleLocalToolCard>
            )
          })}
        </AgentConsoleGrid>
      )}
    </ConsolePanel>
  )
}

export function ConsolePanel({ title, icon, action, children }: { title: string; icon: ReactNode; action?: ReactNode; children: ReactNode }) {
  return <AgentConsolePanel title={title} icon={icon} action={action}>{children}</AgentConsolePanel>
}

export function BoundaryCard({ title, detail }: { title: string; detail: string }) {
  return <AgentConsoleBoundaryCard title={title} detail={detail} />
}

export function IssueRow({ issue }: { issue: ConsoleIssue }) {
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

export function ManagementLink({ to, icon, title, detail }: { to: string; icon: ReactNode; title: string; detail: string }) {
  return (
    <AgentConsoleManagementLink icon={icon} title={title} detail={detail}>
      <Link to={to} />
    </AgentConsoleManagementLink>
  )
}

export function HistoryClearControl({
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
              intent={confirming ? 'danger' : 'neutral'}
            >
              {clearing ? '清空中...' : confirming ? '确认清空历史' : '清空历史会话'}
            </AgentConsoleActionButton>
          </AgentConsoleHistoryClearActions>
        </AgentConsoleHistoryClearBody>
      </AgentConsoleHistoryClearLayout>
    </AgentConsoleHistoryClearSurface>
  )
}

export function EmptyText({ children }: { children: ReactNode }) {
  return <AgentConsoleEmptyText>{children}</AgentConsoleEmptyText>
}
