import { useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Clock, ListTree, RefreshCw, Search, XCircle } from 'lucide-react'
import {
  AgentRunMetricCard,
  AgentRunsActionButton,
  AgentRunsBadge,
  AgentRunsFilterButton,
  AgentRunsFilterGroup,
  AgentRunsHeaderStatusBadge,
  AgentRunsIcon,
  AgentRunsInlineError,
  AgentRunsList,
  AgentRunsMetricGrid,
  AgentRunsPageDescription,
  AgentRunsPageHeader,
  AgentRunsPageHeaderCopy,
  AgentRunsPageTitle,
  AgentRunsPageTitleRow,
  AgentRunsPanel,
  AgentRunsPanelBody,
  AgentRunsRecordActions,
  AgentRunsRecordDescription,
  AgentRunsRecordHeader,
  AgentRunsRecordIdLink,
  AgentRunsRecordItem,
  AgentRunsRecordLayout,
  AgentRunsRecordMain,
  AgentRunsRecordMeta,
  AgentRunsRecordMetaItem,
  AgentRunsRefreshButton,
  AgentRunsSearchBox,
  AgentRunsSearchInput,
  AgentRunsStateMessage,
  AgentRunsStatusBadge,
  AgentRunsToolbar,
  AppPageShell,
  AppPageShellBody,
  AppPageShellHeader,
} from '@movscript/ui'
import { AgentConsoleNav } from '@/features/agent/components/AgentConsoleNav'
import { agentRunPath } from '@/routes/projectRoutes'
import { runRoleLabel, runStatusLabel } from '@/features/agent/domain/agentRunUi'
import { agentAttentionStatusRecipe, agentRunStatusRecipe } from '@/features/agent/presentation/agentSemanticUi'
import { localAgentClient, type AgentRun } from '@/shared/infrastructure/localAgentClient'

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
  const summaryRecipe = agentAttentionStatusRecipe(summary.requiresAction, summary.failed)

  return (
    <AppPageShell data-testid="agent-runs-page">
      <AppPageShellHeader>
        <AgentRunsPageHeader>
          <AgentRunsPageHeaderCopy>
            <AgentRunsPageTitleRow>
              <ListTree size={18} />
              <AgentRunsPageTitle>Agent 运行记录</AgentRunsPageTitle>
              <AgentRunsHeaderStatusBadge intent={summaryRecipe.intent} emphasis={summaryRecipe.emphasis}>
                {summary.total} 个 Run
              </AgentRunsHeaderStatusBadge>
            </AgentRunsPageTitleRow>
            <AgentRunsPageDescription>
              这里是管理和排障入口。具体过程、模型请求、工具调用和上下文细节在每个 Run 的 trace 详情页查看。
            </AgentRunsPageDescription>
          </AgentRunsPageHeaderCopy>
          <AgentRunsRefreshButton onClick={() => runsQuery.refetch()} disabled={runsQuery.isFetching}>
            <AgentRunsIcon icon={RefreshCw} spinning={runsQuery.isFetching} />
            刷新
          </AgentRunsRefreshButton>
        </AgentRunsPageHeader>
      </AppPageShellHeader>

      <AgentConsoleNav compact />

      <AppPageShellBody>
        <AgentRunsMetricGrid>
          <RunMetric title="运行中" value={summary.active} tone="neutral" icon={<Clock size={14} />} />
          <RunMetric title="等待处理" value={summary.requiresAction} tone={summary.requiresAction > 0 ? 'warning' : 'neutral'} icon={<AlertTriangle size={14} />} />
          <RunMetric title="失败" value={summary.failed} tone={summary.failed > 0 ? 'danger' : 'neutral'} icon={<XCircle size={14} />} />
          <RunMetric title="已完成" value={summary.completed} tone="ready" icon={<CheckCircle2 size={14} />} />
        </AgentRunsMetricGrid>

        <AgentRunsPanel>
          <AgentRunsToolbar>
            <AgentRunsSearchBox icon={<Search size={14} />}>
              <AgentRunsSearchInput
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索 run、thread、taskGraph、task、错误原因"
              />
            </AgentRunsSearchBox>
            <AgentRunsFilterGroup>
              {RUN_FILTERS.map((item) => (
                <AgentRunsFilterButton
                  key={item.value}
                  onClick={() => setFilter(item.value)}
                  active={filter === item.value}
                >
                  {item.label}
                </AgentRunsFilterButton>
              ))}
            </AgentRunsFilterGroup>
          </AgentRunsToolbar>

          <AgentRunsPanelBody>
            {runsQuery.isLoading ? (
              <AgentRunsStateMessage>正在加载运行记录。</AgentRunsStateMessage>
            ) : runsQuery.error ? (
              <AgentRunsInlineError>{runsQuery.error instanceof Error ? runsQuery.error.message : String(runsQuery.error)}</AgentRunsInlineError>
            ) : visibleRuns.length === 0 ? (
              <AgentRunsStateMessage>没有符合筛选条件的运行记录。</AgentRunsStateMessage>
            ) : (
              <AgentRunsList>
                {visibleRuns.map((run) => <RunRecordRow key={run.id} run={run} />)}
              </AgentRunsList>
            )}
          </AgentRunsPanelBody>
        </AgentRunsPanel>
      </AppPageShellBody>
    </AppPageShell>
  )
}

function RunRecordRow({ run }: { run: AgentRun }) {
  const pendingApprovals = run.pendingApprovals?.filter((item) => item.status === 'pending').length ?? 0
  const pendingInputs = run.pendingInputRequests?.filter((item) => item.status === 'pending').length ?? 0
  const subagentName = typeof run.metadata?.subagentName === 'string' ? run.metadata.subagentName : ''
  const statusRecipe = agentRunStatusRecipe(run.status)
  return (
    <AgentRunsRecordItem>
      <AgentRunsRecordLayout>
        <AgentRunsRecordMain>
          <AgentRunsRecordHeader>
            <AgentRunsRecordIdLink asChild>
              <Link to={agentRunPath(run.id)}>
              {run.id}
              </Link>
            </AgentRunsRecordIdLink>
            <AgentRunsStatusBadge intent={statusRecipe.intent} emphasis={statusRecipe.emphasis}>{runStatusLabel(run.status)}</AgentRunsStatusBadge>
            <AgentRunsBadge variant="outline">{runRoleLabel(run.role)}</AgentRunsBadge>
            {subagentName && <AgentRunsBadge>{subagentName}</AgentRunsBadge>}
          </AgentRunsRecordHeader>
          <AgentRunsRecordMeta>
            <AgentRunsRecordMetaItem>thread {run.threadId}</AgentRunsRecordMetaItem>
            {run.taskGraphId && <AgentRunsRecordMetaItem>taskGraph {run.taskGraphId}</AgentRunsRecordMetaItem>}
            {run.taskId && <AgentRunsRecordMetaItem>task {run.taskId}</AgentRunsRecordMetaItem>}
            <AgentRunsRecordMetaItem>更新 {formatDate(run.updatedAt)}</AgentRunsRecordMetaItem>
            <AgentRunsRecordMetaItem>{run.steps.length} steps</AgentRunsRecordMetaItem>
          </AgentRunsRecordMeta>
          {(run.error || run.blockedReason || run.warnings?.length) && (
            <AgentRunsRecordDescription>
              {run.error ?? run.blockedReason ?? `${run.warnings?.length ?? 0} 条警告`}
            </AgentRunsRecordDescription>
          )}
        </AgentRunsRecordMain>
        <AgentRunsRecordActions>
          {pendingInputs > 0 && <AgentRunsStatusBadge intent="warning" emphasis="soft">{pendingInputs} 输入</AgentRunsStatusBadge>}
          {pendingApprovals > 0 && <AgentRunsStatusBadge intent="warning" emphasis="soft">{pendingApprovals} 审批</AgentRunsStatusBadge>}
          <AgentRunsActionButton asChild>
            <Link to={agentRunPath(run.id)}>Trace 详情</Link>
          </AgentRunsActionButton>
        </AgentRunsRecordActions>
      </AgentRunsRecordLayout>
    </AgentRunsRecordItem>
  )
}

function RunMetric({ title, value, icon, tone }: { title: string; value: number; icon: ReactNode; tone: 'neutral' | 'warning' | 'danger' | 'ready' }) {
  return <AgentRunMetricCard title={title} value={value} state={tone} icon={icon} />
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
