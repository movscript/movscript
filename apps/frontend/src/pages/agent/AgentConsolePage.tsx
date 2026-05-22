import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { AlertTriangle, Blocks, Bot, Cable, CheckCircle2, ClipboardList, FileSearch, ListTree, RefreshCw, Settings, Terminal, XCircle } from 'lucide-react'
import { Badge, Button, Input, Label } from '@movscript/ui'
import { AgentConsoleNav } from '@/pages/agent/AgentConsoleNav'
import { agentRunPath, ROUTES } from '@/routes/projectRoutes'
import { runRoleLabel, runStatusLabel } from '@/lib/agentRunUi'
import { localAgentClient, type AgentRun } from '@/lib/localAgentClient'
import { cn } from '@/lib/utils'
import {
  DEFAULT_GENERATION_TOOLS_SETTINGS,
  createGenerationToolServer,
  normalizeGenerationToolsSettings,
  useGenerationToolsStore,
  type GenerationToolAuthKind,
  type GenerationToolServer,
  type GenerationToolServerType,
  type GenerationToolsSettings,
} from '@/store/generationToolsStore'

type ConsoleIssueTone = 'action' | 'warning' | 'ready'

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
  const draftsQuery = useQuery({
    queryKey: ['agent-console-draft-index', localAgentClient.baseURL],
    queryFn: () => localAgentClient.listDrafts({ status: 'draft', limit: 20 }).then((result) => result.drafts),
    retry: false,
  })

  const runs = useMemo(() => sortRuns(runsQuery.data ?? []), [runsQuery.data])
  const drafts = draftsQuery.data ?? []
  const runSummary = useMemo(() => summarizeRuns(runs), [runs])
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
      review: skills.filter((skill) => skill.loadMode === 'manual').length,
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
  const loading = healthQuery.isLoading || modelQuery.isLoading || inspectQuery.isLoading || capabilitiesQuery.isLoading || runsQuery.isLoading || draftsQuery.isLoading

  function refreshAll() {
    void healthQuery.refetch()
    void modelQuery.refetch()
    void inspectQuery.refetch()
    void capabilitiesQuery.refetch()
    void runsQuery.refetch()
    void draftsQuery.refetch()
  }

  return (
    <div data-testid="agent-console-page" className="flex h-full min-h-0 flex-col bg-background">
      <header className="shrink-0 border-b border-border bg-background px-5 py-3">
        <div className="flex min-h-[72px] flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Bot size={18} />
              <h1 className="type-title-sm font-semibold text-foreground">Agent 控制台</h1>
              <Badge variant={attentionIssues.length > 0 ? 'warning' : 'success'}>
                {attentionIssues.length > 0 ? `${attentionIssues.length} 项需关注` : '状态正常'}
              </Badge>
              {loading && <Badge variant="secondary">同步中</Badge>}
            </div>
            <p className="mt-1 line-clamp-2 max-w-3xl type-label leading-5 text-muted-foreground">
              管理 Agent 的配置、插件、运行记录、高级诊断和草稿索引。创作者仍从业务页面的对比审阅视图处理 Agent 建议。
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to={ROUTES.agentSettings}>
                <Settings size={14} />
                模型与能力配置
              </Link>
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={refreshAll} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              刷新
            </Button>
          </div>
        </div>
      </header>

      <AgentConsoleNav compact />

      <main className="min-h-0 flex-1 overflow-y-auto p-5">
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
        </section>

        <div className="mt-5">
          <LocalGenerationToolsPanel />
        </div>

        <section className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <ConsolePanel title="控制台边界" icon={<ClipboardList size={14} />}>
              <div className="grid gap-2 md:grid-cols-3">
                <BoundaryCard title="业务前台" detail="Agent 面板发起任务，业务页面负责对比、审阅和应用建议。" />
                <BoundaryCard title="控制台" detail="集中处理配置、插件、运行记录、诊断报告和草稿索引，不替代业务审阅。" />
                <BoundaryCard title="Trace 详情" detail="从运行记录、聊天过程或草稿来源进入，用于定位模型、工具和上下文问题。" />
              </div>
            </ConsolePanel>

            <ConsolePanel title="最近运行" icon={<ListTree size={14} />} action={<ConsoleLink to={ROUTES.agentRuns}>查看全部</ConsoleLink>}>
              {runsQuery.error ? (
                <InlineError>{errorMessage(runsQuery.error)}</InlineError>
              ) : runs.length === 0 ? (
                <EmptyText>还没有 Agent 运行记录。</EmptyText>
              ) : (
                <div className="space-y-2">
                  {runs.slice(0, 6).map((run) => <RunSummaryRow key={run.id} run={run} />)}
                </div>
              )}
            </ConsolePanel>
          </div>

          <aside className="space-y-4">
            <ConsolePanel title="需关注事项" icon={<AlertTriangle size={14} />}>
              {attentionIssues.length === 0 ? (
                <EmptyText>当前没有阻塞控制台的配置或运行问题。</EmptyText>
              ) : (
                <div className="space-y-2">
                  {attentionIssues.map((issue) => <IssueRow key={issue.id} issue={issue} />)}
                </div>
              )}
            </ConsolePanel>

            <ConsolePanel title="管理入口" icon={<Terminal size={14} />}>
              <div className="grid gap-2">
                <ManagementLink to={ROUTES.agentSettings} icon={<Settings size={14} />} title="模型与能力配置" detail="模型、Run Presets、Profiles、Skills、Tools policy。" />
                <ManagementLink to={ROUTES.plugins} icon={<Blocks size={14} />} title="插件" detail="应用插件、画布节点、工具页，以及可安装到 Agent 的 Skill bundle。" />
                <ManagementLink to={ROUTES.agentRuns} icon={<ListTree size={14} />} title="运行记录" detail="统一查看 Run 状态，并进入 trace 详情。" />
                <ManagementLink to={ROUTES.agentDebug} icon={<Terminal size={14} />} title="高级诊断" detail="Prompt preview、工具控制台、调试包。" />
                <ManagementLink to={ROUTES.agentDrafts} icon={<FileSearch size={14} />} title="草稿索引" detail={`${drafts.length} 个待业务审阅草稿，可追踪来源。`} />
              </div>
            </ConsolePanel>
          </aside>
        </section>
      </main>
    </div>
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
        <div className="flex items-center gap-2">
          {saved && <span className="type-caption text-primary">已保存</span>}
          <Button type="button" size="sm" variant="outline" onClick={reset}>重置</Button>
          <Button type="button" size="sm" onClick={save} disabled={!canSave}>保存</Button>
        </div>
      }
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-3xl type-caption leading-5 text-muted-foreground">
          配置用户本机或自有网络里的多个 ComfyUI / Stable Diffusion WebUI。配置只保存在当前客户端；组织共享和平台全局服务器会通过后端代理合并进同一列表。
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={enabledCount > 0 ? 'success' : 'secondary'}>
            {enabledCount > 0 ? `${enabledCount} 个服务器已启用` : '未启用'}
          </Badge>
          <Button type="button" size="sm" variant="outline" onClick={() => addServer('comfyui')}>添加 ComfyUI</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => addServer('webui')}>添加 WebUI</Button>
        </div>
      </div>

      {!canSave && (
        <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 type-caption text-destructive">
          启用服务器时 Base URL 必须以 http:// 或 https:// 开头，超时范围为 1000 到 600000 ms。
        </div>
      )}

      <div className="grid gap-3 xl:grid-cols-2">
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
      </div>

      {savedAt && (
        <p className="mt-3 type-caption text-muted-foreground">
          上次保存：{formatDate(savedAt)}
        </p>
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
  return (
    <div className={cn('rounded-md border bg-muted/10 p-3', invalid ? 'border-destructive/40' : 'border-border')}>
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block type-label font-semibold text-foreground">{server.name || title}</span>
          <span className="mt-0.5 block type-caption leading-4 text-muted-foreground">{detail}</span>
        </span>
        <div className="flex shrink-0 items-center gap-2">
          {isDefault && <Badge variant="success">默认</Badge>}
          <input type="checkbox" checked={server.enabled} onChange={(event) => onPatch({ enabled: event.target.checked })} className="h-4 w-4" />
        </div>
      </div>

      <div className={cn('mt-3 space-y-2', !server.enabled && 'opacity-60')}>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px]">
          <LocalToolField label="名称" value={server.name} onChange={(value) => onPatch({ name: value })} />
          <div>
            <Label className="mb-1 block type-caption text-muted-foreground">类型</Label>
            <select
              value={server.type}
              onChange={(event) => onPatch({
                type: event.target.value as GenerationToolServerType,
                baseURL: event.target.value === 'comfyui' ? 'http://127.0.0.1:8188' : 'http://127.0.0.1:7860',
              })}
              className="h-8 w-full rounded-md border border-input bg-background px-2 type-caption text-foreground"
            >
              <option value="comfyui">ComfyUI</option>
              <option value="webui">WebUI</option>
            </select>
          </div>
        </div>
        <LocalToolField
          label="Base URL"
          value={server.baseURL}
          onChange={(value) => onPatch({ baseURL: value })}
          placeholder={server.type === 'comfyui' ? 'http://127.0.0.1:8188' : 'http://127.0.0.1:7860'}
        />
        <div className="grid gap-2 sm:grid-cols-[140px_120px_1fr]">
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
          <div>
            <Label className="mb-1 block type-caption text-muted-foreground">认证</Label>
            <select
              value={server.authKind}
              onChange={(event) => onPatch({ authKind: event.target.value as GenerationToolAuthKind })}
              className="h-8 w-full rounded-md border border-input bg-background px-2 type-caption text-foreground"
            >
              <option value="none">无</option>
              <option value="basic">Basic Auth</option>
              <option value="bearer">Bearer/API Key</option>
            </select>
          </div>
        </div>
        {server.authKind === 'basic' && (
          <div className="grid gap-2 sm:grid-cols-2">
            <LocalToolField label="用户名" value={server.username ?? ''} onChange={(value) => onPatch({ username: value })} />
            <LocalToolField label="密码" value={server.password ?? ''} onChange={(value) => onPatch({ password: value })} type="password" />
          </div>
        )}
        {server.authKind === 'bearer' && (
          <LocalToolField label="Token / API Key" value={server.token ?? ''} onChange={(value) => onPatch({ token: value })} type="password" />
        )}
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          {testResult && (
            <span className={cn('mr-auto self-center type-caption', testResult.success ? 'text-emerald-600' : 'text-destructive')}>
              {testResult.success ? `连接正常 ${testResult.latency_ms ?? 0}ms` : `连接失败 ${testResult.message ?? ''}`}
            </span>
          )}
          <Button type="button" size="sm" variant="outline" onClick={onTest} disabled={testing || !serverIsValid(server)}>
            {testing ? '测试中…' : '测试连接'}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onDefault} disabled={!server.enabled}>
            {isDefault ? '取消默认' : '设为默认'}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onRemove}>
            删除
          </Button>
        </div>
      </div>
    </div>
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
    <div>
      <Label className="mb-1 block type-caption text-muted-foreground">{label}</Label>
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-8 type-caption" />
    </div>
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
  return (
    <div className={cn(
      'rounded-md border bg-background p-3',
      tone === 'action' ? 'border-destructive/40' : tone === 'warning' ? 'border-amber-500/40' : 'border-border',
    )}>
      <div className="flex items-center justify-between gap-2">
        <p className="type-tiny uppercase tracking-wide text-muted-foreground">{title}</p>
        {tone === 'ready' ? <CheckCircle2 size={14} className="text-emerald-600" /> : tone === 'action' ? <XCircle size={14} className="text-destructive" /> : <AlertTriangle size={14} className="text-amber-600" />}
      </div>
      <p className="mt-2 truncate type-body font-semibold text-foreground" title={value}>{value}</p>
      <p className="mt-1 line-clamp-2 type-caption leading-4 text-muted-foreground" title={detail}>{detail}</p>
    </div>
  )
}

function ConsolePanel({ title, icon, action, children }: { title: string; icon: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-border bg-background">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {icon}
          <h2 className="truncate type-label font-semibold text-foreground">{title}</h2>
        </div>
        {action}
      </div>
      <div className="p-3">{children}</div>
    </section>
  )
}

function BoundaryCard({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded border border-border bg-muted/20 p-2">
      <p className="type-label font-medium text-foreground">{title}</p>
      <p className="mt-1 type-caption leading-4 text-muted-foreground">{detail}</p>
    </div>
  )
}

function RunSummaryRow({ run }: { run: AgentRun }) {
  return (
    <Link to={agentRunPath(run.id)} className="block rounded-md border border-border bg-muted/10 px-3 py-2 transition-colors hover:bg-muted/30">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block truncate font-mono type-label text-foreground">{run.id}</span>
          <span className="mt-0.5 block type-tiny text-muted-foreground">
            {runRoleLabel(run.role)} / {formatDate(run.updatedAt)}
          </span>
        </span>
        <Badge variant={runStatusVariant(run.status)}>{runStatusLabel(run.status)}</Badge>
      </div>
      {(run.error || run.blockedReason || run.warnings?.length) && (
        <p className="mt-1 line-clamp-2 type-caption leading-4 text-muted-foreground">
          {run.error ?? run.blockedReason ?? `${run.warnings?.length ?? 0} 条警告`}
        </p>
      )}
    </Link>
  )
}

function IssueRow({ issue }: { issue: ConsoleIssue }) {
  const body = (
    <div className={cn(
      'rounded-md border px-2.5 py-2',
      issue.tone === 'action' ? 'border-destructive/40 bg-destructive/10' : 'border-amber-500/40 bg-amber-500/10',
    )}>
      <div className="flex items-center justify-between gap-2">
        <p className="type-label font-medium text-foreground">{issue.title}</p>
        <Badge variant={issue.tone === 'action' ? 'destructive' : 'warning'}>{issue.tone === 'action' ? '处理' : '关注'}</Badge>
      </div>
      <p className="mt-1 type-caption leading-4 text-muted-foreground">{issue.detail}</p>
    </div>
  )
  return issue.to ? <Link to={issue.to}>{body}</Link> : body
}

function ManagementLink({ to, icon, title, detail }: { to: string; icon: React.ReactNode; title: string; detail: string }) {
  return (
    <Link to={to} className="flex items-start gap-2 rounded-md border border-border bg-muted/10 p-2 transition-colors hover:bg-muted/30">
      <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
      <span className="min-w-0">
        <span className="block type-label font-medium text-foreground">{title}</span>
        <span className="mt-0.5 block type-caption leading-4 text-muted-foreground">{detail}</span>
      </span>
    </Link>
  )
}

function ConsoleLink({ to, children }: { to: string; children: React.ReactNode }) {
  return <Link to={to} className="type-caption font-medium text-primary hover:underline">{children}</Link>
}

function InlineError({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 type-label text-destructive">{children}</div>
}

function EmptyText({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border border-border bg-muted/20 p-3 type-label text-muted-foreground">{children}</div>
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
      to: ROUTES.agentDebug,
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
      id: 'tool-policy',
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

function runStatusVariant(status: AgentRun['status']): 'secondary' | 'success' | 'warning' | 'destructive' | 'outline' {
  if (status === 'completed') return 'success'
  if (status === 'failed') return 'destructive'
  if (status === 'requires_action' || status === 'completed_with_warnings') return 'warning'
  if (status === 'in_progress' || status === 'queued') return 'secondary'
  return 'outline'
}
