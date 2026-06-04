import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { AlertTriangle, Blocks, Bot, Cable, ClipboardList, FileSearch, ListTree, RefreshCw, Settings, Terminal, Trash2 } from 'lucide-react'
import {
  AgentConsoleActionButton,
  AgentConsoleBoundaryCard,
  AgentConsoleCallout,
  AgentConsoleDescription,
  AgentConsoleDivider,
  AgentConsoleEmptyText,
  AgentConsoleEnableCheckbox,
  AgentConsoleFormField,
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
  AgentConsoleInlineLink,
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
  AgentConsoleRunSummaryCopy,
  AgentConsoleRunSummaryDetail,
  AgentConsoleRunSummaryHeader,
  AgentConsoleRunSummaryId,
  AgentConsoleRunSummaryLink,
  AgentConsoleRunSummaryMeta,
  AgentConsoleSavedAt,
  AgentConsoleSavedText,
  AgentConsoleSectionSpacer,
  AgentConsoleSelectField,
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
import { agentRunPath, ROUTES } from '@/routes/projectRoutes'
import { runRoleLabel, runStatusLabel } from '@/features/agent/domain/agentRunUi'
import {
  failedAgentChatCapabilityProbeResult,
  probeAgentChatDataSourceCapabilities,
  type AgentChatCapabilityProbeItem,
  type AgentChatCapabilityProbeResult,
} from '@/features/agent/application/agentChatCapabilityProbe'
import { createAgentChatDataSourceForProvider } from '@/features/agent/application/agentChatDataSourceFactory'
import {
  agentOptionalStatusRecipe,
  agentReadinessStatusRecipe,
  agentRunStatusRecipe,
  agentSeverityStatusRecipe,
} from '@/features/agent/presentation/agentSemanticUi'
import { localAgentClient, type AgentRuntimeSessionSummary, type AgentThreadClearResult } from '@/shared/infrastructure/localAgentClient'
import { listRuntimeRunSummariesFromWorkspace, listRuntimeThreadSummariesFromWorkspace, type AgentWorkspaceRunListItem } from '@/features/agent/application/agentRuntimeThreadQueryCache'
import {
  DEFAULT_GENERATION_TOOLS_SETTINGS,
  createGenerationToolServer,
  normalizeGenerationToolsSettings,
  useGenerationToolsStore,
  type GenerationToolAuthKind,
  type GenerationToolServer,
  type GenerationToolServerType,
  type GenerationToolsSettings,
} from '@/shared/infrastructure/generationToolsStore'
import {
  DEFAULT_AGENT_PROVIDER_SETTINGS,
  enabledAgentProviders,
  normalizeAgentProviderSettings,
  resolveCodexAppServerProfile,
  useAgentProviderConfigStore,
  type AgentProviderConfig,
  type AgentProviderSettings,
} from '@/features/agent/state/agentProviderConfigStore'

type ConsoleIssueTone = AgentConsoleIssueTone

interface ConsoleIssue {
  id: string
  tone: ConsoleIssueTone
  title: string
  detail: string
  to?: string
}

type GenerationToolTestResult = {
  success: boolean
  latency_ms?: number
  status_code?: number
  message?: string
}

export default function AgentConsolePage() {
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

  const runtimeSessions = runtimeSessionsQuery.data ?? []
  const runs = useMemo(() => sortRuns(runsQuery.data ?? []), [runsQuery.data])
  const threads = threadsQuery.data ?? []
  const workspaces: unknown[] = []
  const runSummary = useMemo(() => summarizeRuns(runs), [runs])
  const executingHistoryRunCount = runSummary.active
  const toolSummary = useMemo(() => {
    return {
      available: 0,
      blocked: 0,
      discovered: 0,
      warningCount: 0,
    }
  }, [])
  const skillSummary = useMemo(() => {
    return {
      total: 0,
      enabled: 0,
    }
  }, [])
  const issues = useMemo<ConsoleIssue[]>(() => buildConsoleIssues({
    sessionIndexError: runtimeSessionsQuery.error,
    modelConfigured: modelQuery.data?.configured ?? false,
    modelError: modelQuery.error,
    activeRuns: runSummary.active,
    waitingRuns: runSummary.requiresAction,
    failedRuns: runSummary.failed,
    blockedTools: toolSummary.blocked,
    capabilityWarnings: toolSummary.warningCount,
    workspaceCount: workspaces.length,
  }), [workspaces.length, runtimeSessionsQuery.error, modelQuery.data?.configured, modelQuery.error, runSummary, toolSummary])
  const attentionIssues = issues.filter((item) => item.tone !== 'ready')
  const loading = runtimeSessionsQuery.isLoading || modelQuery.isLoading || runsQuery.isLoading || threadsQuery.isLoading
  const consoleStatusRecipe = agentReadinessStatusRecipe(attentionIssues.length === 0)
  const runningSessionCount = runtimeSessions.filter((session) => session.running && !session.stale).length

  function refreshAll() {
    void runtimeSessionsQuery.refetch()
    void modelQuery.refetch()
    void runsQuery.refetch()
    void threadsQuery.refetch()
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
              管理 Agent 的配置文件、已安装能力、可执行工具、运行记录和工作区索引。创作者仍从业务页面的对比审阅视图处理 Agent 建议。
            </AgentConsoleHeaderDescription>
          </AgentConsoleHeaderCopy>
          <AgentConsoleHeaderActions>
            <AgentConsoleActionButton asChild size="sm" variant="outline">
              <Link to={ROUTES.agentSettings}>
                <Settings size={14} />
                配置文件与能力设置
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
            title="Session Runtime"
            value={runtimeSessionsQuery.error ? '索引不可用' : `${runningSessionCount}/${runtimeSessions.length} 在线`}
            detail="从 workspace session 文件读取，不连接全局 runtime"
            tone={runtimeSessionsQuery.error ? 'action' : 'ready'}
          />
          <ConsoleMetricCard
            title="模型配置"
            value={modelQuery.data?.configured ? modelDisplay(modelQuery.data.model) : '未配置'}
            detail={modelQuery.error ? errorMessage(modelQuery.error) : modelQuery.data?.apiKind ?? '需要配置后才能稳定运行'}
            tone={modelQuery.data?.configured ? 'ready' : 'action'}
          />
          <ConsoleMetricCard
            title="运行状态"
            value={`${runSummary.total} 个 Run`}
            detail={`${runSummary.active} 运行中 / ${runSummary.requiresAction} 等待处理 / ${runSummary.failed} 失败`}
            tone={runSummary.requiresAction || runSummary.failed ? 'warning' : 'ready'}
          />
          <ConsoleMetricCard
            title="能力目录"
            value={`${toolSummary.available}/${toolSummary.discovered} 工具可用`}
            detail={`${skillSummary.enabled}/${skillSummary.total} 技能启用，${toolSummary.blocked} 个工具被阻止`}
            tone={toolSummary.blocked || toolSummary.warningCount ? 'warning' : 'ready'}
          />
        </AgentConsoleMetricGrid>

        <AgentConsoleSectionSpacer>
          <AgentProvidersPanel />
        </AgentConsoleSectionSpacer>

        <AgentConsoleSectionSpacer>
          <AgentCapabilityProbePanel />
        </AgentConsoleSectionSpacer>

        <AgentConsoleSectionSpacer>
          <LocalGenerationToolsPanel />
        </AgentConsoleSectionSpacer>

        <AgentConsoleMainGrid>
          <AgentConsoleMainColumn>
            <ConsolePanel title="控制台边界" icon={<ClipboardList size={14} />}>
              <AgentConsoleGrid columns="three">
                <BoundaryCard title="业务前台" detail="Agent 面板发起任务，业务页面负责对比、审阅和应用建议。" />
                <BoundaryCard title="控制台" detail="集中处理配置、插件、运行记录和工作区索引，不替代业务审阅。" />
                <BoundaryCard title="Trace 详情" detail="从运行记录、聊天过程或工作区来源进入，用于定位模型、工具和上下文问题。" />
              </AgentConsoleGrid>
            </ConsolePanel>

            <ConsolePanel title="最近运行" icon={<ListTree size={14} />} action={<ConsoleLink to={ROUTES.agentRuns}>查看全部</ConsoleLink>}>
              {runsQuery.error ? (
                <AgentConsoleInlineError>{errorMessage(runsQuery.error)}</AgentConsoleInlineError>
              ) : runs.length === 0 ? (
                <EmptyText>还没有 Agent 运行记录。</EmptyText>
              ) : (
                <AgentConsoleStack>
                  {runs.slice(0, 6).map((run) => <RunSummaryRow key={run.id} run={run} />)}
                </AgentConsoleStack>
              )}
            </ConsolePanel>
          </AgentConsoleMainColumn>

          <AgentConsoleSidebar>
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
                <ManagementLink to={agentSettingsSectionPath('agent-settings-config-files')} icon={<Settings size={14} />} title="配置文件" detail="管理当前激活配置文件、配置列表、复制、回滚和导入导出。" />
                <ManagementLink to={agentSettingsSectionPath('agent-settings-installed-capabilities')} icon={<Blocks size={14} />} title="已安装能力" detail="查看本地 Pack、插件来源、Catalog reload 和安装状态。" />
                <ManagementLink to={agentSettingsSectionPath('agent-settings-skills')} icon={<Cable size={14} />} title="Skills" detail="管理当前配置文件的 Skill 激活候选、依赖和冲突。" />
                <ManagementLink to={agentSettingsSectionPath('agent-settings-tools')} icon={<Terminal size={14} />} title="Tools" detail="管理当前配置文件的工具授权、审批、风险和运行可用性。" />
                <ManagementLink to={agentSettingsSectionPath('agent-settings-model')} icon={<Settings size={14} />} title="模型与运行限制" detail="配置模型、API 模式、预算和默认审批行为。" />
                <ManagementLink to={ROUTES.plugins} icon={<Blocks size={14} />} title="Pack / 插件市场" detail="Pack 是安装和发布单元；插件市场是未来的 Pack 来源之一，也承载应用插件、画布节点和工具页。" />
                <ManagementLink to={ROUTES.agentRuns} icon={<ListTree size={14} />} title="运行记录" detail="统一查看 Run 状态，并进入 trace 详情。" />
                <ManagementLink to={ROUTES.agentWorkspaces} icon={<FileSearch size={14} />} title="工作区索引" detail={`${workspaces.length} 个待业务审阅工作区，可追踪来源。`} />
              </AgentConsoleGrid>
              <AgentConsoleDivider>
                <HistoryClearControl
                  threadCount={threads.length}
                  runCount={runSummary.total}
                  workspaceCount={workspaces.length}
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
  const savedSettings = useAgentProviderConfigStore((state) => state.settings)
  const providers = useMemo(() => enabledAgentProviders(normalizeAgentProviderSettings(savedSettings)), [savedSettings])
  const probeQuery = useQuery({
    queryKey: ['agent-console-provider-capability-probe', providers.map(agentProviderProbeKey).join('|')],
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
      title="Agent 数据流与能力探针"
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
            {probeQuery.isFetching ? '探测中' : '刷新 Agent 能力'}
          </AgentConsoleActionButton>
        </AgentConsolePanelActions>
      }
    >
      <AgentConsoleIntroRow>
        <AgentConsoleDescription>
          通过统一 AgentChatDataSource capability 探测每个已启用 Agent。Codex 会按 profile 启动 app-server；MovScript Agent 走本地 runtime adapter；后续 Agent 只需要实现同一组能力入口。
        </AgentConsoleDescription>
        <AgentConsoleToolbar>
          <AgentConsoleStatusBadge intent={providers.length > 0 ? 'success' : 'warning'} emphasis="soft">
            {providers.length > 0 ? `${providers.length} 个 Agent 可探测` : '没有已启用 Agent'}
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

function agentProviderProbeKey(provider: AgentProviderConfig): string {
  const profile = provider.kind === 'codex' ? resolveCodexAppServerProfile(provider) : undefined
  return [
    provider.id,
    provider.kind,
    provider.enabled ? 'enabled' : 'disabled',
    provider.label,
    profile?.id ?? '',
    profile?.executablePath ?? '',
    profile?.codexHome ?? '',
    profile?.workspaceDir ?? '',
  ].join(':')
}

function AgentProvidersPanel() {
  const savedSettings = useAgentProviderConfigStore((state) => state.settings)
  const savedAt = useAgentProviderConfigStore((state) => state.savedAt)
  const setSettings = useAgentProviderConfigStore((state) => state.setSettings)
  const resetSettings = useAgentProviderConfigStore((state) => state.reset)
  const [form, setForm] = useState<AgentProviderSettings>(() => normalizeAgentProviderSettings(savedSettings))
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setForm(normalizeAgentProviderSettings(savedSettings))
  }, [savedSettings])

  const enabledProviders = enabledAgentProviders(form)
  const invalidProviders = form.providers.filter((provider) => provider.enabled && !agentProviderIsValid(provider))
  const canSave = enabledProviders.length > 0 && invalidProviders.length === 0
  const enabledRecipe = agentOptionalStatusRecipe(enabledProviders.length > 0)

  function patchProvider(id: string, patch: Partial<AgentProviderConfig>) {
    setForm((current) => normalizeAgentProviderSettings({
      ...current,
      providers: current.providers.map((provider) => provider.id === id ? { ...provider, ...patch } : provider),
      defaultProviderId: patch.enabled === false && current.defaultProviderId === id
        ? enabledProviders.find((provider) => provider.id !== id)?.id ?? current.defaultProviderId
        : current.defaultProviderId,
      newConversationProviderId: patch.enabled === false && current.newConversationProviderId === id
        ? undefined
        : current.newConversationProviderId,
    }))
  }

  function save() {
    if (!canSave) return
    setSettings(form)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1800)
  }

  function reset() {
    resetSettings()
    setForm(normalizeAgentProviderSettings(DEFAULT_AGENT_PROVIDER_SETTINGS))
    setSaved(false)
  }

  return (
    <ConsolePanel
      title="Agent 提供方"
      icon={<Bot size={14} />}
      action={
        <AgentConsolePanelActions>
          {saved && <AgentConsoleSavedText>已保存</AgentConsoleSavedText>}
          <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={reset}>重置</AgentConsoleActionButton>
          <AgentConsoleActionButton type="button" size="sm" onClick={save} disabled={!canSave}>保存</AgentConsoleActionButton>
        </AgentConsolePanelActions>
      }
    >
      <AgentConsoleIntroRow>
        <AgentConsoleDescription>
          配置前端可用于新建会话的 Agent。默认 Agent 会作为新建会话选择项的初始值；会话创建时仍可临时切换到其他已启用 Agent。
        </AgentConsoleDescription>
        <AgentConsoleToolbar>
          <AgentConsoleStatusBadge intent={enabledRecipe.intent} emphasis={enabledRecipe.emphasis}>
            {enabledProviders.length > 0 ? `${enabledProviders.length} 个 Agent 已启用` : '未启用'}
          </AgentConsoleStatusBadge>
          <AgentConsoleSelectField
            label="默认 Agent"
            value={form.defaultProviderId}
            onChange={(event) => setForm((current) => normalizeAgentProviderSettings({
              ...current,
              defaultProviderId: event.target.value,
            }))}
          >
            {form.providers.filter((provider) => provider.enabled).map((provider) => (
              <option key={provider.id} value={provider.id}>{provider.label}</option>
            ))}
          </AgentConsoleSelectField>
        </AgentConsoleToolbar>
      </AgentConsoleIntroRow>

      {!canSave && (
        <AgentConsoleCallout tone="danger" compact>
          至少需要启用一个 Agent；Codex 的 CODEX_HOME 由 MovScript 管理并隔离。Codex provider 会按 profile 启动 app-server。
        </AgentConsoleCallout>
      )}

      <AgentConsoleGrid columns="server">
        {form.providers.map((provider) => (
          <AgentProviderCard
            key={provider.id}
            provider={provider}
            isDefault={form.defaultProviderId === provider.id}
            onDefault={() => setForm((current) => normalizeAgentProviderSettings({ ...current, defaultProviderId: provider.id }))}
            onPatch={(patch) => patchProvider(provider.id, patch)}
          />
        ))}
      </AgentConsoleGrid>

      {savedAt ? (
        <AgentConsoleSavedAt>
          上次保存：{new Date(savedAt).toLocaleString()}
        </AgentConsoleSavedAt>
      ) : null}
    </ConsolePanel>
  )
}

function AgentProviderCard({
  provider,
  isDefault,
  onPatch,
  onDefault,
}: {
  provider: AgentProviderConfig
  isDefault: boolean
  onPatch: (patch: Partial<AgentProviderConfig>) => void
  onDefault: () => void
}) {
  const invalid = provider.enabled && !agentProviderIsValid(provider)
  const defaultRecipe = agentReadinessStatusRecipe(true)
  const title = provider.kind === 'codex' ? 'Codex' : 'MovScript Agent'
  const codexProfile = provider.kind === 'codex' ? resolveCodexAppServerProfile(provider) : undefined
  const codexStatusQuery = useQuery({
    queryKey: ['agent-console-codex-app-server-status', codexProfile?.id],
    queryFn: async () => {
      if (!codexProfile) throw new Error('Codex profile is required')
      const status = await window.api?.getCodexAppServerStatus?.({ profileId: codexProfile.id })
      return status ?? {
        ok: false,
        running: false,
        managed: false,
        profileId: codexProfile.id,
        error: '当前运行环境不支持 Codex app-server 管理。',
      }
    },
    enabled: provider.kind === 'codex' && provider.enabled,
    retry: false,
  })
  const detail = provider.kind === 'codex'
    ? '按 profile 启动 Codex app-server；可以使用本机 codex 可执行文件，但 CODEX_HOME 固定在 MovScript 管理目录。'
    : '使用 MovScript 本地 agent runtime，会话走当前工作区 runtime。'
  const codexStatus = codexStatusQuery.data
  const codexRunning = Boolean(codexStatus?.running && codexStatus.ok)

  async function ensureCodex() {
    if (!codexProfile) return
    await window.api?.ensureCodexAppServer?.({
      profile: codexProfile,
    })
    await codexStatusQuery.refetch()
  }

  async function stopCodex() {
    if (!codexProfile) return
    await window.api?.stopCodexAppServer?.({ profileId: codexProfile.id })
    await codexStatusQuery.refetch()
  }

  function patchCodexProfile(patch: Partial<NonNullable<AgentProviderConfig['codexProfile']>>) {
    if (!codexProfile) return
    onPatch({ codexProfile: { ...codexProfile, ...patch } })
  }

  return (
    <AgentConsoleLocalToolCard invalid={invalid}>
      <AgentConsoleLocalToolHeader>
        <AgentConsoleLocalToolCopy>
          <AgentConsoleLocalToolTitle>{provider.label || title}</AgentConsoleLocalToolTitle>
          <AgentConsoleLocalToolDetail>{detail}</AgentConsoleLocalToolDetail>
        </AgentConsoleLocalToolCopy>
        <AgentConsoleLocalToolControls>
          {isDefault && <AgentConsoleStatusBadge intent={defaultRecipe.intent} emphasis={defaultRecipe.emphasis}>默认</AgentConsoleStatusBadge>}
          <AgentConsoleEnableCheckbox
            checked={provider.enabled}
            onCheckedChange={(checked) => onPatch({ enabled: checked })}
            aria-label={`${provider.label || title} 启用状态`}
          />
        </AgentConsoleLocalToolControls>
      </AgentConsoleLocalToolHeader>

      <AgentConsoleLocalToolFields disabled={!provider.enabled}>
        <LocalToolField label="显示名称" value={provider.label} onChange={(value) => onPatch({ label: value })} />
        {provider.kind === 'codex' && codexProfile ? (
          <>
            <LocalToolField
              label="Codex 显示名称"
              value={codexProfile.label}
              onChange={(value) => patchCodexProfile({ label: value })}
            />
            <LocalToolField
              label="Codex 可执行文件"
              value={codexProfile.executablePath ?? ''}
              onChange={(value) => patchCodexProfile({ executablePath: value })}
              placeholder="留空时使用 PATH 中的 codex"
            />
            <AgentConsoleCallout compact>
              CODEX_HOME 由 MovScript 管理：{codexProfile.codexHome}
            </AgentConsoleCallout>
            <LocalToolField
              label="工作目录"
              value={codexProfile.workspaceDir ?? ''}
              onChange={(value) => patchCodexProfile({ workspaceDir: value })}
              placeholder="留空时使用当前应用工作目录"
            />
            <AgentConsoleCallout compact tone={codexRunning ? 'success' : codexStatus?.error ? 'warning' : 'neutral'}>
              {codexRunning
                ? `运行中：${codexStatus?.endpoint ?? '-'} / CODEX_HOME=${codexStatus?.codexHome ?? codexProfile.codexHome}`
                : codexStatus?.error ?? 'Codex app-server 尚未启动。'}
            </AgentConsoleCallout>
          </>
        ) : (
          <AgentConsoleCallout compact>
            MovScript Agent 由 Electron 按 session/workspace 拉起，不需要在这里配置 endpoint。
          </AgentConsoleCallout>
        )}
        <AgentConsoleLocalToolActions>
          {invalid ? (
            <AgentConsoleTestResult tone="danger">
              Codex provider 配置不完整。
            </AgentConsoleTestResult>
          ) : null}
          {provider.kind === 'codex' ? (
            <>
              <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={() => void ensureCodex()} disabled={!provider.enabled || invalid || codexStatusQuery.isFetching}>
                {codexRunning ? '重连 / 确认运行' : '启动 app-server'}
              </AgentConsoleActionButton>
              <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={() => void stopCodex()} disabled={!codexRunning || codexStatusQuery.isFetching}>
                停止
              </AgentConsoleActionButton>
            </>
          ) : null}
          <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={onDefault} disabled={!provider.enabled}>
            {isDefault ? '当前默认' : '设为默认'}
          </AgentConsoleActionButton>
        </AgentConsoleLocalToolActions>
      </AgentConsoleLocalToolFields>
    </AgentConsoleLocalToolCard>
  )
}

function LocalGenerationToolsPanel() {
  const savedSettings = useGenerationToolsStore((state) => state.settings)
  const savedAt = useGenerationToolsStore((state) => state.savedAt)
  const setSettings = useGenerationToolsStore((state) => state.setSettings)
  const resetSettings = useGenerationToolsStore((state) => state.reset)
  const [form, setForm] = useState<GenerationToolsSettings>(() => normalizeGenerationToolsSettings(savedSettings))
  const [saved, setSaved] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, GenerationToolTestResult>>({})

  useEffect(() => {
    setForm(normalizeGenerationToolsSettings(savedSettings))
  }, [savedSettings])

  const invalidServers = form.servers.filter((server) => !serverIsValid(server))
  const canSave = invalidServers.length === 0
  const enabledCount = form.servers.filter((server) => server.enabled).length
  const enabledRecipe = agentOptionalStatusRecipe(enabledCount > 0)

  function save() {
    if (!canSave) return
    setSettings(form)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1800)
  }

  function reset() {
    resetSettings()
    setForm(normalizeGenerationToolsSettings(DEFAULT_GENERATION_TOOLS_SETTINGS))
    setTestResults({})
    setSaved(false)
  }

  function addServer(type: GenerationToolServerType) {
    setForm((current) => ({
      ...current,
      servers: [...current.servers, createGenerationToolServer(type, { enabled: true })],
    }))
  }

  function patchServer(id: string, patch: Partial<GenerationToolServer>) {
    setForm((current) => ({
      ...current,
      servers: current.servers.map((server) => server.id === id ? normalizeServerWorkspace({ ...server, ...patch }) : server),
      defaultServerId: patch.enabled === false && current.defaultServerId === id ? undefined : current.defaultServerId,
      defaultServerIds: patch.enabled === false ? clearDefaultGenerationToolServerID(current.defaultServerIds, id) : current.defaultServerIds,
    }))
    setTestResults((current) => omitRecordKey(current, id))
  }

  function removeServer(id: string) {
    setForm((current) => ({
      ...current,
      servers: current.servers.filter((server) => server.id !== id),
      defaultServerId: current.defaultServerId === id ? undefined : current.defaultServerId,
      defaultServerIds: clearDefaultGenerationToolServerID(current.defaultServerIds, id),
    }))
    setTestResults((current) => omitRecordKey(current, id))
  }

  function setDefaultServer(server: GenerationToolServer) {
    setForm((current) => {
      const currentDefault = current.defaultServerIds?.[server.type]
      return {
        ...current,
        defaultServerId: current.defaultServerId === server.id ? undefined : current.defaultServerId,
        defaultServerIds: {
          ...(current.defaultServerIds ?? {}),
          [server.type]: currentDefault === server.id ? undefined : server.id,
        },
      }
    })
  }

  async function testServer(server: GenerationToolServer) {
    setTestingId(server.id)
    try {
      const result = await window.api?.testGenerationToolServer?.(server)
      setTestResults((current) => ({
        ...current,
        [server.id]: result ?? { success: false, message: '当前运行环境不支持连接测试' },
      }))
    } catch (error) {
      setTestResults((current) => ({
        ...current,
        [server.id]: { success: false, message: error instanceof Error ? error.message : String(error) },
      }))
    } finally {
      setTestingId(null)
    }
  }

  return (
    <ConsolePanel
      title="本地生成工具"
      icon={<Cable size={14} />}
      action={
        <AgentConsolePanelActions>
          {saved && <AgentConsoleSavedText>已保存</AgentConsoleSavedText>}
          <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={reset}>重置</AgentConsoleActionButton>
          <AgentConsoleActionButton type="button" size="sm" onClick={save} disabled={!canSave}>保存</AgentConsoleActionButton>
        </AgentConsolePanelActions>
      }
    >
      <AgentConsoleIntroRow>
        <AgentConsoleDescription>
          配置用户本机或自有网络里的多个 ComfyUI / Stable Diffusion WebUI。配置只保存在当前客户端；组织共享和平台全局服务器会通过后端代理合并进同一列表。
        </AgentConsoleDescription>
        <AgentConsoleToolbar>
          <AgentConsoleStatusBadge intent={enabledRecipe.intent} emphasis={enabledRecipe.emphasis}>
            {enabledCount > 0 ? `${enabledCount} 个服务器已启用` : '未启用'}
          </AgentConsoleStatusBadge>
          <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={() => addServer('comfyui')}>添加 ComfyUI</AgentConsoleActionButton>
          <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={() => addServer('webui')}>添加 WebUI</AgentConsoleActionButton>
        </AgentConsoleToolbar>
      </AgentConsoleIntroRow>

      {!canSave && (
        <AgentConsoleCallout tone="danger" compact>
          启用服务器时 Base URL 必须以 http:// 或 https:// 开头，超时范围为 1000 到 600000 ms。
        </AgentConsoleCallout>
      )}

      <AgentConsoleGrid columns="server">
        {form.servers.map((server) => (
          <LocalToolCard
            key={server.id}
            server={server}
            isDefault={form.defaultServerIds?.[server.type] === server.id || (!form.defaultServerIds?.[server.type] && form.defaultServerId === server.id)}
            onPatch={(patch) => patchServer(server.id, patch)}
            onRemove={() => removeServer(server.id)}
            onDefault={() => setDefaultServer(server)}
            testResult={testResults[server.id]}
            testing={testingId === server.id}
            onTest={() => testServer(server)}
          />
        ))}
      </AgentConsoleGrid>

      {savedAt && (
        <AgentConsoleSavedAt>
          上次保存：{formatDate(savedAt)}
        </AgentConsoleSavedAt>
      )}
    </ConsolePanel>
  )
}

function clearDefaultGenerationToolServerID(
  defaults: GenerationToolsSettings['defaultServerIds'] | undefined,
  serverID: string,
): GenerationToolsSettings['defaultServerIds'] {
  if (!defaults) return {}
  const next = { ...defaults }
  for (const type of ['comfyui', 'webui'] as const) {
    if (next[type] === serverID) delete next[type]
  }
  return next
}

function LocalToolCard({ server, isDefault, onPatch, onRemove, onDefault, testResult, testing, onTest }: {
  server: GenerationToolServer
  isDefault: boolean
  onPatch: (patch: Partial<GenerationToolServer>) => void
  onRemove: () => void
  onDefault: () => void
  testResult?: GenerationToolTestResult
  testing?: boolean
  onTest: () => void
}) {
  const invalid = !serverIsValid(server)
  const title = server.type === 'comfyui' ? 'tool-comfyui' : 'tool-webui'
  const detail = server.type === 'comfyui'
    ? 'ComfyUI 节点工作流服务器。'
    : 'AUTOMATIC1111 Stable Diffusion WebUI 服务器。'
  const defaultRecipe = agentReadinessStatusRecipe(true)
  return (
    <AgentConsoleLocalToolCard invalid={invalid}>
      <AgentConsoleLocalToolHeader>
        <AgentConsoleLocalToolCopy>
          <AgentConsoleLocalToolTitle>{server.name || title}</AgentConsoleLocalToolTitle>
          <AgentConsoleLocalToolDetail>{detail}</AgentConsoleLocalToolDetail>
        </AgentConsoleLocalToolCopy>
        <AgentConsoleLocalToolControls>
          {isDefault && <AgentConsoleStatusBadge intent={defaultRecipe.intent} emphasis={defaultRecipe.emphasis}>默认</AgentConsoleStatusBadge>}
          <AgentConsoleEnableCheckbox
            checked={server.enabled}
            onCheckedChange={(checked) => onPatch({ enabled: checked })}
            aria-label={`${server.name || title} 启用状态`}
          />
        </AgentConsoleLocalToolControls>
      </AgentConsoleLocalToolHeader>

      <AgentConsoleLocalToolFields disabled={!server.enabled}>
        <AgentConsoleGrid columns="identity">
          <LocalToolField label="名称" value={server.name} onChange={(value) => onPatch({ name: value })} />
          <AgentConsoleSelectField
            label="类型"
            value={server.type}
            onChange={(event) => onPatch({
              type: event.target.value as GenerationToolServerType,
              baseURL: event.target.value === 'comfyui' ? 'http://127.0.0.1:8188' : 'http://127.0.0.1:7860',
            })}
          >
            <option value="comfyui">ComfyUI</option>
            <option value="webui">WebUI</option>
          </AgentConsoleSelectField>
        </AgentConsoleGrid>
        <LocalToolField
          label="Base URL"
          value={server.baseURL}
          onChange={(value) => onPatch({ baseURL: value })}
          placeholder={server.type === 'comfyui' ? 'http://127.0.0.1:8188' : 'http://127.0.0.1:7860'}
        />
        <AgentConsoleGrid columns="runtime">
          <LocalToolField
            label="优先级"
            value={String(server.priority)}
            onChange={(value) => onPatch({ priority: Number(value) || 0 })}
            type="number"
          />
          <LocalToolField
            label="超时 ms"
            value={String(server.timeoutMS || '')}
            onChange={(value) => onPatch({ timeoutMS: Number(value) || 0 })}
            type="number"
          />
          <AgentConsoleSelectField
            label="认证"
            value={server.authKind}
            onChange={(event) => onPatch({ authKind: event.target.value as GenerationToolAuthKind })}
          >
            <option value="none">无</option>
            <option value="basic">Basic Auth</option>
            <option value="bearer">Bearer/API Key</option>
          </AgentConsoleSelectField>
        </AgentConsoleGrid>
        {server.authKind === 'basic' && (
          <AgentConsoleGrid columns="auth">
            <LocalToolField label="用户名" value={server.username ?? ''} onChange={(value) => onPatch({ username: value })} />
            <LocalToolField label="密码" value={server.password ?? ''} onChange={(value) => onPatch({ password: value })} type="password" />
          </AgentConsoleGrid>
        )}
        {server.authKind === 'bearer' && (
          <LocalToolField label="Token / API Key" value={server.token ?? ''} onChange={(value) => onPatch({ token: value })} type="password" />
        )}
        <AgentConsoleLocalToolActions>
          {testResult && (
            <AgentConsoleTestResult tone={testResult.success ? 'success' : 'danger'}>
              {testResult.success ? `连接正常 ${testResult.latency_ms ?? 0}ms` : `连接失败 ${testResult.message ?? ''}`}
            </AgentConsoleTestResult>
          )}
          <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={onTest} disabled={testing || !serverIsValid(server)}>
            {testing ? '测试中…' : '测试连接'}
          </AgentConsoleActionButton>
          <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={onDefault} disabled={!server.enabled}>
            {isDefault ? '取消默认' : '设为默认'}
          </AgentConsoleActionButton>
          <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={onRemove}>
            删除
          </AgentConsoleActionButton>
        </AgentConsoleLocalToolActions>
      </AgentConsoleLocalToolFields>
    </AgentConsoleLocalToolCard>
  )
}

function LocalToolField({ label, value, onChange, type = 'text', placeholder }: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  placeholder?: string
}) {
  return (
    <AgentConsoleFormField type={type} label={label} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
  )
}

function isHTTPBaseURL(value: string): boolean {
  const trimmed = value.trim()
  return trimmed.startsWith('http://') || trimmed.startsWith('https://')
}

function agentProviderIsValid(provider: AgentProviderConfig): boolean {
  if (provider.kind !== 'codex') return true
  const profile = resolveCodexAppServerProfile(provider)
  return Boolean(profile.id.trim() && profile.codexHome.trim())
}

function timeoutIsValid(value: number): boolean {
  return Number.isFinite(value) && value >= 1000 && value <= 600000
}

function serverIsValid(server: GenerationToolServer): boolean {
  if (!timeoutIsValid(server.timeoutMS)) return false
  if (!server.enabled) return true
  return isHTTPBaseURL(server.baseURL)
}

function normalizeServerWorkspace(server: GenerationToolServer): GenerationToolServer {
  return {
    ...server,
    name: server.name,
    baseURL: server.baseURL,
    timeoutMS: Number(server.timeoutMS) || 0,
    priority: Number(server.priority) || 0,
    username: server.username ?? '',
    password: server.password ?? '',
    token: server.token ?? '',
  }
}

function omitRecordKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record
  const next = { ...record }
  delete next[key]
  return next
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

function RunSummaryRow({ run }: { run: AgentWorkspaceRunListItem }) {
  const statusRecipe = agentRunStatusRecipe(run.status)
  return (
    <AgentConsoleRunSummaryLink>
      <Link to={agentRunPath(run.id, { sessionId: run.sessionId, workspaceDir: run.workspaceDir })}>
        <AgentConsoleRunSummaryHeader>
          <AgentConsoleRunSummaryCopy>
            <AgentConsoleRunSummaryId>{run.id}</AgentConsoleRunSummaryId>
            <AgentConsoleRunSummaryMeta>
            {runRoleLabel(run.role)} / {formatDate(run.updatedAt)}
            </AgentConsoleRunSummaryMeta>
          </AgentConsoleRunSummaryCopy>
          <AgentConsoleStatusBadge intent={statusRecipe.intent} emphasis={statusRecipe.emphasis}>{runStatusLabel(run.status)}</AgentConsoleStatusBadge>
        </AgentConsoleRunSummaryHeader>
        {(run.error || run.blockedReason || run.warnings?.length) && (
          <AgentConsoleRunSummaryDetail>
            {run.error ?? run.blockedReason ?? `${run.warnings?.length ?? 0} 条警告`}
          </AgentConsoleRunSummaryDetail>
        )}
      </Link>
    </AgentConsoleRunSummaryLink>
  )
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

async function clearWorkspaceSessionThreadHistory(sessions: AgentRuntimeSessionSummary[]): Promise<{ threadCount: number; runCount: number }> {
  const scopedSessions = sessions
    .map((session) => ({
      sessionId: session.session.id.trim(),
      workspaceDir: session.workspaceDir?.trim(),
    }))
    .filter((session) => session.sessionId)

  if (scopedSessions.length === 0) {
    throw new Error('没有可清理的 workspace session 索引。请先刷新控制台。')
  }

  const results = await Promise.all(scopedSessions.map((session) => (
    localAgentClient
      .forSession({
        sessionId: session.sessionId,
        ...(session.workspaceDir ? { workspaceDir: session.workspaceDir } : {}),
      })
      .deleteAllThreads()
  )))

  return summarizeThreadClearResults(results)
}

function summarizeThreadClearResults(results: AgentThreadClearResult[]): { threadCount: number; runCount: number } {
  const deletedThreadIds = new Set<string>()
  const deletedRunIds = new Set<string>()
  for (const result of results) {
    for (const threadId of result.deletedThreadIds) deletedThreadIds.add(threadId)
    for (const runId of result.deletedRunIds) deletedRunIds.add(runId)
  }
  return {
    threadCount: deletedThreadIds.size,
    runCount: deletedRunIds.size,
  }
}

function HistoryClearControl({
  threadCount,
  runCount,
  workspaceCount,
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
  workspaceCount: number
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
            {threadCount} 个会话 / {runCount} 个 Run。清空会物理删除会话、Run、计划、运行态记录和 trace 文件；{workspaceCount} 个工作区不会删除。
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

function ConsoleLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <AgentConsoleInlineLink>
      <Link to={to}>{children}</Link>
    </AgentConsoleInlineLink>
  )
}

function EmptyText({ children }: { children: React.ReactNode }) {
  return <AgentConsoleEmptyText>{children}</AgentConsoleEmptyText>
}

function buildConsoleIssues(input: {
  sessionIndexError: unknown
  modelConfigured: boolean
  modelError: unknown
  activeRuns: number
  waitingRuns: number
  failedRuns: number
  blockedTools: number
  capabilityWarnings: number
  workspaceCount: number
}): ConsoleIssue[] {
  const issues: ConsoleIssue[] = []
  if (input.sessionIndexError) {
    issues.push({
      id: 'session-index-unavailable',
      tone: 'action',
      title: 'Session 索引不可用',
      detail: errorMessage(input.sessionIndexError),
      to: ROUTES.agentSettings,
    })
  }
  if (!input.modelConfigured || input.modelError) {
    issues.push({
      id: 'model-config',
      tone: 'action',
      title: '模型配置需要确认',
      detail: input.modelError ? errorMessage(input.modelError) : '未配置模型时，Agent 无法稳定执行聊天、规划或工具调用。',
      to: ROUTES.agentSettings,
    })
  }
  if (input.waitingRuns > 0) {
    issues.push({
      id: 'waiting-runs',
      tone: 'action',
      title: '有运行等待输入或审批',
      detail: `${input.waitingRuns} 个 Run 处于等待处理状态。`,
      to: ROUTES.agentRuns,
    })
  }
  if (input.failedRuns > 0) {
    issues.push({
      id: 'failed-runs',
      tone: 'warning',
      title: '最近存在失败运行',
      detail: `${input.failedRuns} 个 Run 失败，可从运行记录进入 trace 详情定位。`,
      to: ROUTES.agentRuns,
    })
  }
  if (input.blockedTools > 0 || input.capabilityWarnings > 0) {
    issues.push({
      id: 'tool-permissions',
      tone: 'warning',
      title: '工具能力存在限制',
      detail: `${input.blockedTools} 个工具不可用，${input.capabilityWarnings} 条能力警告。`,
      to: ROUTES.agentSettings,
    })
  }
  if (input.workspaceCount > 0) {
    issues.push({
      id: 'workspace-index',
      tone: 'warning',
      title: '存在可追踪的 Agent 工作区',
      detail: `${input.workspaceCount} 个 workspace 可从工作区索引进入业务审阅页。`,
      to: ROUTES.agentWorkspaces,
    })
  }
  return issues
}

function summarizeRuns(runs: AgentWorkspaceRunListItem[]) {
  return {
    total: runs.length,
    active: runs.filter((run) => run.status === 'queued' || run.status === 'in_progress').length,
    requiresAction: runs.filter((run) => run.status === 'requires_action').length,
    failed: runs.filter((run) => run.status === 'failed').length,
  }
}

function sortRuns(runs: AgentWorkspaceRunListItem[]) {
  return [...runs].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
}

function agentSettingsSectionPath(sectionId: string): string {
  return `${ROUTES.agentSettings}#${encodeURIComponent(sectionId)}`
}

function modelDisplay(value: string) {
  return value.length > 42 ? `${value.slice(0, 39)}...` : value
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function formatDate(value: string | undefined) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
