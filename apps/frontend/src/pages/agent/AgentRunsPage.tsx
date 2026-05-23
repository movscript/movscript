import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Clock, ListTree, RefreshCw, Search, XCircle } from 'lucide-react'
import { Badge, Button, AppInlineError, AppStateMessage, semanticToneClass } from '@movscript/ui'
import { AgentConsoleNav } from '@/pages/agent/AgentConsoleNav'
import { agentRunPath } from '@/routes/projectRoutes'
import { runRoleLabel, runStatusLabel } from '@/lib/agentRunUi'
import { localAgentClient, type AgentRun } from '@/lib/localAgentClient'
import { cn } from '@/lib/utils'

type RunFilter = 'all' | 'active' | 'requires_action' | 'failed' | 'done'

const RUN_FILTERS: Array<{ value: RunFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'active', label: '运行中' },
  { value: 'requires_action', label: '等待处理' },
  { value: 'failed', label: '失败' },
  { value: 'done', label: '已结束' },
]

export default function AgentRunsPage() {
  const [filter, setFilter] = useState<RunFilter>('all')
  const [search, setSearch] = useState('')
  const runsQuery = useQuery({
    queryKey: ['agent-runs-page', localAgentClient.baseURL],
    queryFn: async () => {
      await localAgentClient.ensureRunning()
      return localAgentClient.listRuns().then((result) => result.runs)
    },
    retry: false,
  })
  const runs = useMemo(() => sortRuns(runsQuery.data ?? []), [runsQuery.data])
  const visibleRuns = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return runs
      .filter((run) => runMatchesFilter(run, filter))
      .filter((run) => {
        if (!needle) return true
        return [
          run.id,
          run.threadId,
          run.taskGraphId,
          run.taskId,
          run.parentRunId,
          run.role,
          run.status,
          run.error,
          run.blockedReason,
          typeof run.metadata?.subagentName === 'string' ? run.metadata.subagentName : undefined,
        ].filter(Boolean).some((value) => String(value).toLowerCase().includes(needle))
      })
  }, [filter, runs, search])
  const summary = useMemo(() => summarizeRuns(runs), [runs])

  return (
    <div data-testid="agent-runs-page" className="flex h-full min-h-0 flex-col bg-background">
      <header className="shrink-0 border-b border-border bg-background px-5 py-3">
        <div className="flex min-h-[72px] flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <ListTree size={18} />
              <h1 className="type-title-sm font-semibold text-foreground">Agent 运行记录</h1>
              <Badge variant={summary.requiresAction > 0 ? 'warning' : summary.failed > 0 ? 'destructive' : 'secondary'}>
                {summary.total} 个 Run
              </Badge>
            </div>
            <p className="mt-1 line-clamp-2 max-w-3xl type-label leading-5 text-muted-foreground">
              这里是管理和排障入口。具体过程、模型请求、工具调用和上下文细节在每个 Run 的 trace 详情页查看。
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => runsQuery.refetch()} disabled={runsQuery.isFetching}>
            <RefreshCw size={14} className={runsQuery.isFetching ? 'animate-spin' : ''} />
            刷新
          </Button>
        </div>
      </header>

      <AgentConsoleNav compact />

      <main className="min-h-0 flex-1 overflow-y-auto p-5">
        <section className="grid gap-3 md:grid-cols-4">
          <RunMetric title="运行中" value={summary.active} tone="neutral" icon={<Clock size={14} />} />
          <RunMetric title="等待处理" value={summary.requiresAction} tone={summary.requiresAction > 0 ? 'warning' : 'neutral'} icon={<AlertTriangle size={14} />} />
          <RunMetric title="失败" value={summary.failed} tone={summary.failed > 0 ? 'danger' : 'neutral'} icon={<XCircle size={14} />} />
          <RunMetric title="已完成" value={summary.completed} tone="ready" icon={<CheckCircle2 size={14} />} />
        </section>

        <section className="mt-4 rounded-md border border-border bg-background">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
            <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-md border border-input bg-background px-2">
              <Search size={14} className="shrink-0 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索 run、thread、taskGraph、task、错误原因"
                className="h-8 min-w-0 flex-1 bg-transparent type-label outline-none"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {RUN_FILTERS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setFilter(item.value)}
                  className={cn(
                    'h-8 rounded-md border px-2.5 type-label transition-colors',
                    filter === item.value ? 'border-border bg-secondary text-secondary-foreground' : 'border-border bg-background text-muted-foreground hover:bg-muted/40 hover:text-foreground',
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-3">
            {runsQuery.isLoading ? (
              <AppStateMessage>正在加载运行记录。</AppStateMessage>
            ) : runsQuery.error ? (
              <AppInlineError className="p-3">{runsQuery.error instanceof Error ? runsQuery.error.message : String(runsQuery.error)}</AppInlineError>
            ) : visibleRuns.length === 0 ? (
              <AppStateMessage>没有符合筛选条件的运行记录。</AppStateMessage>
            ) : (
              <div className="space-y-2">
                {visibleRuns.map((run) => <RunRecordRow key={run.id} run={run} />)}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}

function RunRecordRow({ run }: { run: AgentRun }) {
  const pendingApprovals = run.pendingApprovals?.filter((item) => item.status === 'pending').length ?? 0
  const pendingInputs = run.pendingInputRequests?.filter((item) => item.status === 'pending').length ?? 0
  const subagentName = typeof run.metadata?.subagentName === 'string' ? run.metadata.subagentName : ''
  return (
    <article className="rounded-md border border-border bg-muted/10 px-3 py-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Link to={agentRunPath(run.id)} className="truncate font-mono type-label font-medium text-primary hover:underline">
              {run.id}
            </Link>
            <Badge variant={runStatusVariant(run.status)}>{runStatusLabel(run.status)}</Badge>
            <Badge variant="outline">{runRoleLabel(run.role)}</Badge>
            {subagentName && <Badge variant="secondary">{subagentName}</Badge>}
          </div>
          <div className="mt-1 flex flex-wrap gap-2 type-tiny text-muted-foreground">
            <span>thread {run.threadId}</span>
            {run.taskGraphId && <span>taskGraph {run.taskGraphId}</span>}
            {run.taskId && <span>task {run.taskId}</span>}
            <span>更新 {formatDate(run.updatedAt)}</span>
            <span>{run.steps.length} steps</span>
          </div>
          {(run.error || run.blockedReason || run.warnings?.length) && (
            <p className="mt-1 line-clamp-2 type-caption leading-4 text-muted-foreground">
              {run.error ?? run.blockedReason ?? `${run.warnings?.length ?? 0} 条警告`}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-1">
          {pendingInputs > 0 && <Badge variant="warning">{pendingInputs} 输入</Badge>}
          {pendingApprovals > 0 && <Badge variant="warning">{pendingApprovals} 审批</Badge>}
          <Button asChild size="sm" variant="outline">
            <Link to={agentRunPath(run.id)}>Trace 详情</Link>
          </Button>
        </div>
      </div>
    </article>
  )
}

function RunMetric({ title, value, icon, tone }: { title: string; value: number; icon: React.ReactNode; tone: 'neutral' | 'warning' | 'danger' | 'ready' }) {
  return (
    <div className={cn(
      'rounded-md border bg-background p-3',
      tone === 'warning' ? semanticToneClass('warning', 'surface') : tone === 'danger' ? 'border-destructive/40' : 'border-border',
    )}>
      <div className="flex items-center justify-between gap-2 type-tiny uppercase tracking-wide text-muted-foreground">
        <span>{title}</span>
        {icon}
      </div>
      <div className={cn(
        'mt-2 type-title-sm font-semibold',
        tone === 'warning' ? semanticToneClass('warning', 'icon') : tone === 'danger' ? 'text-destructive' : tone === 'ready' ? semanticToneClass('success', 'icon') : 'text-foreground',
      )}>
        {value}
      </div>
    </div>
  )
}

function summarizeRuns(runs: AgentRun[]) {
  return {
    total: runs.length,
    active: runs.filter((run) => run.status === 'queued' || run.status === 'in_progress').length,
    requiresAction: runs.filter((run) => run.status === 'requires_action').length,
    failed: runs.filter((run) => run.status === 'failed').length,
    completed: runs.filter((run) => run.status === 'completed' || run.status === 'completed_with_warnings').length,
  }
}

function runMatchesFilter(run: AgentRun, filter: RunFilter) {
  if (filter === 'all') return true
  if (filter === 'active') return run.status === 'queued' || run.status === 'in_progress'
  if (filter === 'done') return run.status === 'completed' || run.status === 'completed_with_warnings' || run.status === 'cancelled'
  return run.status === filter
}

function sortRuns(runs: AgentRun[]) {
  return [...runs].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
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
