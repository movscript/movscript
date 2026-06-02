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
  agentOptionalStatusRecipe,
  agentReadinessStatusRecipe,
  agentRunStatusRecipe,
  agentSeverityStatusRecipe,
} from '@/features/agent/presentation/agentSemanticUi'
import { localAgentClient, type AgentRun } from '@/shared/infrastructure/localAgentClient'
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
  const healthQuery = useQuery({
    queryKey: ['agent-console-health', localAgentClient.baseURL],
    queryFn: () => localAgentClient.ensureRunning(),
    retry: false,
  })
  const modelQuery = useQuery({
    queryKey: ['agent-console-model-config', localAgentClient.baseURL],
    queryFn: () => localAgentClient.getModelConfig(),
    retry: false,
  })
  const inspectQuery = useQuery({
    queryKey: ['agent-console-inspect', localAgentClient.baseURL],
    queryFn: () => localAgentClient.inspect(),
    retry: false,
  })
  const capabilitiesQuery = useQuery({
    queryKey: ['agent-console-capabilities', localAgentClient.baseURL],
    queryFn: () => localAgentClient.getCapabilities(),
    retry: false,
  })
  const runsQuery = useQuery({
    queryKey: ['agent-console-runs', localAgentClient.baseURL],
    queryFn: () => localAgentClient.listRuns().then((result) => result.runs),
    retry: false,
  })
  const threadsQuery = useQuery({
    queryKey: ['agent-console-threads', localAgentClient.baseURL],
    queryFn: () => localAgentClient.listThreads().then((result) => result.threads),
    retry: false,
  })
  const draftsQuery = useQuery({
    queryKey: ['agent-console-draft-index', localAgentClient.baseURL],
    queryFn: () => localAgentClient.listDrafts({ status: 'draft', limit: 20 }).then((result) => result.drafts),
    retry: false,
  })
  const [clearConfirming, setClearConfirming] = useState(false)
  const [clearingHistory, setClearingHistory] = useState(false)
  const [clearHistoryError, setClearHistoryError] = useState<string | null>(null)
  const [clearHistoryResult, setClearHistoryResult] = useState<string | null>(null)

  const runs = useMemo(() => sortRuns(runsQuery.data ?? []), [runsQuery.data])
  const threads = threadsQuery.data ?? []
  const drafts = draftsQuery.data ?? []
  const runSummary = useMemo(() => summarizeRuns(runs), [runs])
  const executingHistoryRunCount = runSummary.active
  const toolSummary = useMemo(() => {
    const tools = capabilitiesQuery.data?.resolvedTools
    return {
      available: tools?.available.length ?? 0,
      blocked: tools?.blocked.length ?? 0,
      discovered: tools?.discovered.length ?? 0,
      warningCount: capabilitiesQuery.data?.warnings.length ?? 0,
    }
  }, [capabilitiesQuery.data])
  const skillSummary = useMemo(() => {
    const skills = inspectQuery.data?.skills ?? []
    return {
      total: skills.length,
      enabled: skills.filter((skill) => skill.enabled !== false).length,
    }
  }, [inspectQuery.data?.skills])
  const issues = useMemo<ConsoleIssue[]>(() => buildConsoleIssues({
    healthError: healthQuery.error,
    modelConfigured: modelQuery.data?.configured ?? false,
    modelError: modelQuery.error,
    activeRuns: runSummary.active,
    waitingRuns: runSummary.requiresAction,
    failedRuns: runSummary.failed,
    blockedTools: toolSummary.blocked,
    capabilityWarnings: toolSummary.warningCount,
    draftCount: drafts.length,
  }), [drafts.length, healthQuery.error, modelQuery.data?.configured, modelQuery.error, runSummary, toolSummary])
  const attentionIssues = issues.filter((item) => item.tone !== 'ready')
  const loading = healthQuery.isLoading || modelQuery.isLoading || inspectQuery.isLoading || capabilitiesQuery.isLoading || runsQuery.isLoading || threadsQuery.isLoading || draftsQuery.isLoading
  const consoleStatusRecipe = agentReadinessStatusRecipe(attentionIssues.length === 0)

  function refreshAll() {
    void healthQuery.refetch()
    void modelQuery.refetch()
    void inspectQuery.refetch()
    void capabilitiesQuery.refetch()
    void runsQuery.refetch()
    void threadsQuery.refetch()
    void draftsQuery.refetch()
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
      await localAgentClient.ensureRunning()
      const result = await localAgentClient.deleteAllThreads()
      setClearConfirming(false)
      setClearHistoryResult(`已删除 ${result.deletedThreadIds.length} 个会话、${result.deletedRunIds.length} 个 Run。`)
      await Promise.all([
        runsQuery.refetch(),
        threadsQuery.refetch(),
        draftsQuery.refetch(),
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
              管理 Agent 的配置文件、已安装能力、可执行工具、运行记录和草稿索引。创作者仍从业务页面的对比审阅视图处理 Agent 建议。
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
            title="Runtime"
            value={healthQuery.data?.ok ? '在线' : healthQuery.error ? '不可用' : '检查中'}
            detail={healthQuery.data?.mcpEndpoint ?? localAgentClient.baseURL}
            tone={healthQuery.data?.ok ? 'ready' : healthQuery.error ? 'action' : 'warning'}
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
          <LocalGenerationToolsPanel />
        </AgentConsoleSectionSpacer>

        <AgentConsoleMainGrid>
          <AgentConsoleMainColumn>
            <ConsolePanel title="控制台边界" icon={<ClipboardList size={14} />}>
              <AgentConsoleGrid columns="three">
                <BoundaryCard title="业务前台" detail="Agent 面板发起任务，业务页面负责对比、审阅和应用建议。" />
                <BoundaryCard title="控制台" detail="集中处理配置、插件、运行记录和草稿索引，不替代业务审阅。" />
                <BoundaryCard title="Trace 详情" detail="从运行记录、聊天过程或草稿来源进入，用于定位模型、工具和上下文问题。" />
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
                <ManagementLink to={ROUTES.agentDrafts} icon={<FileSearch size={14} />} title="草稿索引" detail={`${drafts.length} 个待业务审阅草稿，可追踪来源。`} />
              </AgentConsoleGrid>
              <AgentConsoleDivider>
                <HistoryClearControl
                  threadCount={threads.length}
                  runCount={runSummary.total}
                  draftCount={drafts.length}
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
      servers: current.servers.map((server) => server.id === id ? normalizeServerDraft({ ...server, ...patch }) : server),
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

function timeoutIsValid(value: number): boolean {
  return Number.isFinite(value) && value >= 1000 && value <= 600000
}

function serverIsValid(server: GenerationToolServer): boolean {
  if (!timeoutIsValid(server.timeoutMS)) return false
  if (!server.enabled) return true
  return isHTTPBaseURL(server.baseURL)
}

function normalizeServerDraft(server: GenerationToolServer): GenerationToolServer {
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

function RunSummaryRow({ run }: { run: AgentRun }) {
  const statusRecipe = agentRunStatusRecipe(run.status)
  return (
    <AgentConsoleRunSummaryLink>
      <Link to={agentRunPath(run.id)}>
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

function HistoryClearControl({
  threadCount,
  runCount,
  draftCount,
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
  draftCount: number
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
            {threadCount} 个会话 / {runCount} 个 Run。清空会物理删除会话、Run、计划、运行态记录和 trace 文件；{draftCount} 个草稿不会删除。
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
  healthError: unknown
  modelConfigured: boolean
  modelError: unknown
  activeRuns: number
  waitingRuns: number
  failedRuns: number
  blockedTools: number
  capabilityWarnings: number
  draftCount: number
}): ConsoleIssue[] {
  const issues: ConsoleIssue[] = []
  if (input.healthError) {
    issues.push({
      id: 'runtime-offline',
      tone: 'action',
      title: 'Runtime 不可用',
      detail: errorMessage(input.healthError),
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
  if (input.draftCount > 0) {
    issues.push({
      id: 'draft-index',
      tone: 'warning',
      title: '存在可追踪的 Agent 草稿',
      detail: `${input.draftCount} 个 draft 可从草稿索引进入业务审阅页。`,
      to: ROUTES.agentDrafts,
    })
  }
  return issues
}

function summarizeRuns(runs: AgentRun[]) {
  return {
    total: runs.length,
    active: runs.filter((run) => run.status === 'queued' || run.status === 'in_progress').length,
    requiresAction: runs.filter((run) => run.status === 'requires_action').length,
    failed: runs.filter((run) => run.status === 'failed').length,
  }
}

function sortRuns(runs: AgentRun[]) {
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
