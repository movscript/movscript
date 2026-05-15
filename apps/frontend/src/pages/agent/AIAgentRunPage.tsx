import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronDown, ChevronRight, Copy, History, Loader2, RefreshCw, Route, XCircle } from 'lucide-react'
import { Badge, Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@movscript/ui'
import { AgentRunGenerationArtifacts } from '@/components/agent/AgentRunGenerationArtifacts'
import { buildPlanTaskViews, buildTaskArtifactViews } from '@/lib/agentPlanUi'
import { agentPlanStatusLabel, agentTraceView, buildTraceEventLink, canCancelWorkerRun, runRoleLabel, runStatusLabel, traceCategoryLabel, traceDeepLinkMissing as isTraceDeepLinkMissing, traceEventIdFromHash, traceEventStatusLabel, traceKindLabel, type AgentTraceCategory } from '@/lib/agentRunUi'
import { localAgentClient, type AgentRun, type AgentTraceEvent, type AgentTraceEventKind } from '@/lib/localAgentClient'

export default function AIAgentRunPage() {
  const navigate = useNavigate()
  const { runId = '' } = useParams()
  const [eventKind, setEventKind] = useState<'all' | AgentTraceEventKind>('all')
  const [eventCategory, setEventCategory] = useState<'all' | AgentTraceCategory>('all')
  const [eventSearch, setEventSearch] = useState('')
  const [events, setEvents] = useState<AgentTraceEvent[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loadingEvents, setLoadingEvents] = useState(false)
  const [cancelingRun, setCancelingRun] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [approvalActionId, setApprovalActionId] = useState<string | null>(null)
  const [approvalError, setApprovalError] = useState<string | null>(null)
  const [inputActionId, setInputActionId] = useState<string | null>(null)
  const [inputDrafts, setInputDrafts] = useState<Record<string, string>>({})
  const [inputError, setInputError] = useState<string | null>(null)
  const [expandedEventIds, setExpandedEventIds] = useState<Set<string>>(() => new Set())
  const currentRunIdRef = useRef(runId)
  const initialTraceLoadRunIdRef = useRef<string | null>(null)
  const runQuery = useQuery({
    queryKey: ['agent-run-detail', localAgentClient.baseURL, runId],
    queryFn: async () => {
      await localAgentClient.ensureRunning()
      return localAgentClient.getRun(runId)
    },
    enabled: !!runId,
    retry: false,
  })
  const planQuery = useQuery({
    queryKey: ['agent-run-plan-context', localAgentClient.baseURL, runQuery.data?.planId],
    queryFn: async () => localAgentClient.getPlanSnapshot(runQuery.data!.planId!),
    enabled: !!runQuery.data?.planId,
    retry: false,
  })
  const childRunsQuery = useQuery({
    queryKey: ['agent-run-children', localAgentClient.baseURL, runId],
    queryFn: async () => localAgentClient.getChildRuns(runId),
    enabled: !!runId,
    retry: false,
  })
  const summaryQuery = useQuery({
    queryKey: ['agent-run-trace-summary', localAgentClient.baseURL, runId],
    queryFn: async () => localAgentClient.getRunTraceSummary(runId),
    enabled: !!runId,
    retry: false,
  })
  const visibleEvents = useMemo(() => {
    const needle = eventSearch.trim().toLowerCase()
    return events.filter((event) => {
      if (eventKind !== 'all' && event.kind !== eventKind) return false
      if (eventCategory !== 'all' && agentTraceView(event).category !== eventCategory) return false
      if (!needle) return true
      return traceEventSearchText(event).includes(needle)
    })
  }, [eventCategory, eventKind, eventSearch, events])
  const eventKinds = useMemo(() => Array.from(new Set(events.map((event) => event.kind))).sort(), [events])
  const eventCategories = useMemo(() => Array.from(new Set(events.map((event) => agentTraceView(event).category))).sort(), [events])
  const categoryCounts = useMemo(() => {
    const counts = new Map<AgentTraceCategory, number>()
    for (const event of events) {
      const category = agentTraceView(event).category
      counts.set(category, (counts.get(category) ?? 0) + 1)
    }
    return Array.from(counts.entries()).sort(([left], [right]) => traceCategoryLabel(left).localeCompare(traceCategoryLabel(right), 'zh-CN'))
  }, [events])
  const visibleTraceViews = useMemo(() => visibleEvents.map((event) => ({
    event,
    view: agentTraceView(event),
  })), [visibleEvents])
  const latestTraceView = useMemo(
    () => summaryQuery.data?.latestEvent ? agentTraceView(summaryQuery.data.latestEvent) : undefined,
    [summaryQuery.data?.latestEvent],
  )
  const runSummary = useMemo(() => buildRunSummary(runQuery.data, summaryQuery.data), [runQuery.data, summaryQuery.data])
  const traceDeepLinkEventId = traceEventIdFromLocationHash()
  const traceDeepLinkMissing = isTraceDeepLinkMissing({ eventId: traceDeepLinkEventId, events, hasMore })
  const runPlanTask = useMemo(() => {
    const taskId = runQuery.data?.taskId
    if (!taskId) return undefined
    return planQuery.data?.tasks.find((task) => task.id === taskId)
  }, [planQuery.data?.tasks, runQuery.data?.taskId])
  const runPlanTaskView = useMemo(() => {
    const taskId = runQuery.data?.taskId
    if (!taskId || !planQuery.data) return undefined
    return buildPlanTaskViews(planQuery.data).find((view) => view.task.id === taskId)
  }, [planQuery.data, runQuery.data?.taskId])
  const subagentName = typeof runQuery.data?.metadata?.subagentName === 'string' && runQuery.data.metadata.subagentName.trim()
    ? runQuery.data.metadata.subagentName.trim()
    : runPlanTaskView?.subagentName
      ? runPlanTaskView.subagentName
      : undefined
  const workerRunCanBeCancelled = canCancelWorkerRun(runQuery.data)

  useEffect(() => {
    currentRunIdRef.current = runId
  }, [runId])

  useEffect(() => {
    setEvents([])
    setHasMore(false)
    setLoadingEvents(false)
    initialTraceLoadRunIdRef.current = null
    setEventKind('all')
    setEventCategory('all')
    setEventSearch('')
    setCancelError(null)
    setApprovalActionId(null)
    setApprovalError(null)
    setInputActionId(null)
    setInputDrafts({})
    setInputError(null)
    setExpandedEventIds(new Set())
  }, [runId])

  useEffect(() => {
    if (!runId || initialTraceLoadRunIdRef.current === runId) return
    initialTraceLoadRunIdRef.current = runId
    void loadEvents('initial')
  }, [runId])

  useEffect(() => {
    const eventId = traceEventIdFromLocationHash()
    if (!eventId) return
    const element = document.getElementById(`agent-trace-event-${eventId}`)
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [visibleEvents])

  useEffect(() => {
    const eventId = traceEventIdFromLocationHash()
    if (!eventId || loadingEvents) return
    if (document.getElementById(`agent-trace-event-${eventId}`)) return
    if (events.length === 0) {
      void loadEvents('initial')
      return
    }
    if (hasMore) void loadEvents('more')
  }, [events.length, hasMore, loadingEvents, runId])

  async function loadEvents(mode: 'initial' | 'more' = 'initial') {
    if (!runId || loadingEvents) return
    const requestedRunId = runId
    setLoadingEvents(true)
    try {
      const cursor = mode === 'more' ? events.at(-1)?.id : undefined
      const response = await localAgentClient.getRunTraceEvents(requestedRunId, { limit: 25, ...(cursor ? { cursor } : {}) })
      if (currentRunIdRef.current !== requestedRunId) return
      setEvents((current) => mode === 'more' ? [...current, ...response.events] : response.events)
      setHasMore(response.events.length >= 25)
    } finally {
      if (currentRunIdRef.current === requestedRunId) setLoadingEvents(false)
    }
  }

  async function copyEventLink(eventId: string) {
    const nextUrl = buildTraceEventLink({
      origin: window.location.origin,
      pathname: window.location.pathname,
      search: window.location.search,
      eventId,
    })
    window.history.replaceState(null, '', nextUrl)
    await navigator.clipboard.writeText(nextUrl)
  }

  async function copyEventData(data: unknown) {
    await navigator.clipboard.writeText(formatTraceEventData(data))
  }

  async function refreshRunPage() {
    await Promise.all([
      runQuery.refetch(),
      summaryQuery.refetch(),
      childRunsQuery.refetch(),
      ...(planQuery.data ? [planQuery.refetch()] : []),
      ...(events.length > 0 ? [loadEvents('initial')] : []),
    ])
  }

  async function cancelWorkerRun() {
    if (!runId || !workerRunCanBeCancelled || cancelingRun) return
    const confirmed = window.confirm(`确定取消 ${subagentName ?? '这个 worker'} 以及它的子运行吗？`)
    if (!confirmed) return
    setCancelingRun(true)
    setCancelError(null)
    try {
      await localAgentClient.cancelRunTree(runId, { reason: `从运行详情页取消 ${subagentName ?? runId}。` })
      await refreshRunPage()
    } catch (error) {
      setCancelError(error instanceof Error ? error.message : String(error))
    } finally {
      setCancelingRun(false)
    }
  }

  async function resolveApproval(approvalId: string, action: 'approve' | 'reject') {
    if (!runId || approvalActionId) return
    setApprovalActionId(`${action}:${approvalId}`)
    setApprovalError(null)
    try {
      if (action === 'approve') {
        await localAgentClient.approveRun(runId, { approvalIds: [approvalId] })
      } else {
        await localAgentClient.rejectRun(runId, { approvalIds: [approvalId] })
      }
      await refreshRunPage()
    } catch (error) {
      setApprovalError(error instanceof Error ? error.message : String(error))
    } finally {
      setApprovalActionId(null)
    }
  }

  async function answerInput(requestId: string, answer: { choiceIds?: string[]; text?: string }) {
    if (!runId || inputActionId) return
    setInputActionId(requestId)
    setInputError(null)
    try {
      await localAgentClient.answerRunInput(runId, { requestId, ...answer })
      setInputDrafts((current) => ({ ...current, [requestId]: '' }))
      await refreshRunPage()
    } catch (error) {
      setInputError(error instanceof Error ? error.message : String(error))
    } finally {
      setInputActionId(null)
    }
  }

  function toggleEventDetails(eventId: string) {
    setExpandedEventIds((current) => {
      const next = new Set(current)
      if (next.has(eventId)) next.delete(eventId)
      else next.add(eventId)
      return next
    })
  }

  return (
    <div data-testid="agent-run-page" className="flex h-full min-h-0 flex-col bg-background">
      <header data-testid="agent-run-header" className="border-b border-border px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Route size={18} />
              <h1 className="text-lg font-semibold text-foreground">Agent 运行</h1>
              {runQuery.data && <Badge variant="outline">{runStatusLabel(runQuery.data.status)}</Badge>}
            </div>
            <p className="mt-1 break-all text-xs text-muted-foreground">{runId}</p>
            {cancelError && (
              <p data-testid="agent-run-cancel-error" className="mt-2 rounded border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs text-destructive">
                {cancelError}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {runQuery.data?.parentRunId && (
              <Button type="button" size="sm" variant="outline" onClick={() => navigate(`/agent/runs/${encodeURIComponent(runQuery.data!.parentRunId!)}`)}>
                <Route size={13} />
                上级
              </Button>
            )}
            {planQuery.data?.plan.rootRunId && planQuery.data.plan.rootRunId !== runId && (
              <Button type="button" size="sm" variant="outline" onClick={() => navigate(`/agent/runs/${encodeURIComponent(planQuery.data!.plan.rootRunId!)}`)}>
                <Route size={13} />
                根运行
              </Button>
            )}
            {workerRunCanBeCancelled && (
              <Button
                data-testid="agent-run-cancel-worker"
                type="button"
                size="sm"
                variant="destructive"
                onClick={() => { void cancelWorkerRun() }}
                disabled={cancelingRun || runQuery.isFetching || loadingEvents}
              >
                {cancelingRun ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
                取消 worker
              </Button>
            )}
            <Button type="button" size="sm" variant="outline" onClick={() => navigate(-1)}>
              <ArrowLeft size={13} />
              返回
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => { void refreshRunPage() }} disabled={runQuery.isFetching || summaryQuery.isFetching || planQuery.isFetching || loadingEvents}>
              <RefreshCw size={13} className={runQuery.isFetching || summaryQuery.isFetching || planQuery.isFetching || loadingEvents ? 'animate-spin' : ''} />
              刷新
            </Button>
          </div>
        </div>
      </header>
      <main className="grid min-h-0 flex-1 grid-cols-[minmax(260px,380px)_minmax(0,1fr)]">
        <aside data-testid="agent-run-sidebar" className="min-h-0 overflow-y-auto border-r border-border p-4">
          {runQuery.isLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 size={12} className="animate-spin" /> 正在加载运行</div>
          ) : runQuery.error ? (
            <p className="text-xs text-destructive">{runQuery.error instanceof Error ? runQuery.error.message : String(runQuery.error)}</p>
          ) : runQuery.data ? (
            <div className="space-y-3 text-xs">
              <Info label="角色" value={runRoleLabel(runQuery.data.role)} />
              <Info label="子代理" value={subagentName ?? '-'} />
              <Info label="线程" value={runQuery.data.threadId} />
              <Info label="计划" value={runQuery.data.planId ?? '-'} />
              <Info label="任务" value={runQuery.data.taskId ?? '-'} />
              <Info label="上级" value={runQuery.data.parentRunId ?? '-'} />
              <Info label="进度" value={typeof runQuery.data.progress === 'number' ? `${Math.round(runQuery.data.progress * 100)}%` : '-'} />
              <Info label="步骤数" value={String(runQuery.data.steps.length)} />
              <Info label="创建于" value={runQuery.data.createdAt} />
              <Info label="更新于" value={runQuery.data.updatedAt} />
              {runQuery.data.error && <p className="rounded border border-destructive/30 bg-destructive/10 px-2 py-1 text-destructive">{runQuery.data.error}</p>}
              {runSummary && (
                <div data-testid="agent-run-summary" className="space-y-1 rounded border border-border/70 bg-muted/10 p-2">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">运行摘要</div>
                  <div className="flex flex-wrap gap-1">
                    {summaryQuery.data && Object.entries(summaryQuery.data.byKind).slice(0, 8).map(([kind, count]) => (
                      <Badge key={kind} variant="outline" className="text-[9px]">{traceKindLabel(kind as AgentTraceEventKind)} {count}</Badge>
                    ))}
                  </div>
                  {latestTraceView && summaryQuery.data?.latestEvent && (
                    <div className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                      <span className="font-medium text-foreground">最新事件</span>
                      <Badge variant="outline" className="text-[9px]">{latestTraceView.categoryLabel}</Badge>
                      <span>{latestTraceView.title}</span>
                    </div>
                  )}
                  <div className="text-[11px] leading-relaxed text-foreground">{runSummary.overview}</div>
                  <div className="grid gap-1 text-[10px] text-muted-foreground">
                    {runSummary.bullets.map((bullet) => <div key={bullet}>• {bullet}</div>)}
                  </div>
                </div>
              )}
              {(runQuery.data.pendingInputRequests ?? []).filter((request) => request.status === 'pending').length > 0 && (
                <div data-testid="agent-run-pending-input" className="space-y-1 rounded border border-amber-500/30 bg-amber-500/10 p-2">
                  <div className="text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-300">待输入</div>
                  {inputError && (
                    <p data-testid="agent-run-input-error" className="rounded border border-destructive/30 bg-destructive/10 px-2 py-1 text-destructive">
                      {inputError}
                    </p>
                  )}
                  {(runQuery.data.pendingInputRequests ?? []).filter((request) => request.status === 'pending').map((request) => (
                    <div key={request.id} className="space-y-0.5">
                      <div className="font-medium text-foreground">{request.title}</div>
                      <p className="text-muted-foreground">{request.question}</p>
                      {request.choices.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {request.choices.map((choice) => (
                            <Button
                              data-testid="agent-run-input-choice"
                              key={choice.id}
                              type="button"
                              size="xs"
                              variant="outline"
                              className="h-auto min-h-6 max-w-full whitespace-normal px-2 py-1 text-left text-[9px]"
                              disabled={!!inputActionId}
                              onClick={() => { void answerInput(request.id, { choiceIds: [choice.id] }) }}
                            >
                              {inputActionId === request.id && <Loader2 size={10} className="animate-spin" />}
                              <span className="min-w-0">
                                <span className="block font-medium">{choice.label}</span>
                                {choice.description && <span className="block text-[8px] text-muted-foreground">{choice.description}</span>}
                              </span>
                            </Button>
                          ))}
                          {request.allowCustomAnswer && <Badge variant="outline" className="text-[9px]">可自定义答案</Badge>}
                        </div>
                      )}
                      {(request.allowCustomAnswer || request.inputType === 'text') && (
                        <div className="flex items-center gap-1 pt-1">
                          <input
                            data-testid="agent-run-input-text"
                            value={inputDrafts[request.id] ?? ''}
                            onChange={(event) => setInputDrafts((current) => ({ ...current, [request.id]: event.target.value }))}
                            disabled={!!inputActionId}
                            placeholder="输入答案"
                            className="h-7 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-[10px] outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          />
                          <Button
                            data-testid="agent-run-input-submit"
                            type="button"
                            size="xs"
                            variant="secondary"
                            className="h-7 px-2 text-[10px]"
                            disabled={!!inputActionId || !(inputDrafts[request.id] ?? '').trim()}
                            onClick={() => { void answerInput(request.id, { text: (inputDrafts[request.id] ?? '').trim() }) }}
                          >
                            {inputActionId === request.id && <Loader2 size={10} className="animate-spin" />}
                            发送
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {(runQuery.data.pendingApprovals ?? []).filter((approval) => approval.status === 'pending').length > 0 && (
                <div data-testid="agent-run-pending-approval" className="space-y-1 rounded border border-amber-500/30 bg-amber-500/10 p-2">
                  <div className="text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-300">待审批</div>
                  {approvalError && (
                    <p data-testid="agent-run-approval-error" className="rounded border border-destructive/30 bg-destructive/10 px-2 py-1 text-destructive">
                      {approvalError}
                    </p>
                  )}
                  {(runQuery.data.pendingApprovals ?? []).filter((approval) => approval.status === 'pending').map((approval) => (
                    <div key={approval.id} className="space-y-0.5">
                      <div className="font-medium text-foreground">{approval.toolName}</div>
                      <p className="text-muted-foreground">{approval.reason}</p>
                      <div className="flex flex-wrap gap-1">
                        {approval.risk && <Badge variant="outline" className="text-[9px]">风险 {approval.risk}</Badge>}
                        {approval.permission && <Badge variant="outline" className="text-[9px]">权限 {approval.permission}</Badge>}
                      </div>
                      <div className="flex flex-wrap gap-1 pt-1">
                        <Button
                          data-testid="agent-run-approval-action"
                          type="button"
                          size="xs"
                          variant="outline"
                          className="h-6 px-2 text-[10px]"
                          disabled={!!approvalActionId}
                          onClick={() => { void resolveApproval(approval.id, 'approve') }}
                        >
                          {approvalActionId === `approve:${approval.id}` && <Loader2 size={10} className="animate-spin" />}
                          同意
                        </Button>
                        <Button
                          data-testid="agent-run-approval-action"
                          type="button"
                          size="xs"
                          variant="ghost"
                          className="h-6 px-2 text-[10px]"
                          disabled={!!approvalActionId}
                          onClick={() => { void resolveApproval(approval.id, 'reject') }}
                        >
                          {approvalActionId === `reject:${approval.id}` && <Loader2 size={10} className="animate-spin" />}
                          拒绝
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {planQuery.isLoading && (
                <div className="flex items-center gap-2 rounded border border-border px-2 py-1 text-muted-foreground"><Loader2 size={12} className="animate-spin" /> 正在加载计划上下文</div>
              )}
              {planQuery.error && (
                <p className="rounded border border-destructive/30 bg-destructive/10 px-2 py-1 text-destructive">{planQuery.error instanceof Error ? planQuery.error.message : String(planQuery.error)}</p>
              )}
              {planQuery.data && (
                <div data-testid="agent-run-plan-context" className="space-y-2 rounded border border-border/70 bg-muted/10 p-2">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">计划上下文</div>
                  <Info label="计划标题" value={planQuery.data.plan.title} />
                  <Info label="计划状态" value={agentPlanStatusLabel(planQuery.data.plan.status)} />
                  {runPlanTask && (
                    <>
                      <Info label="任务标题" value={runPlanTask.title} />
                      <Info label="任务状态" value={agentPlanStatusLabel(runPlanTask.status)} />
                      {runPlanTaskView?.statusExplanation && <Info label="任务说明" value={runPlanTaskView.statusExplanation} />}
                      <Info label="产物数" value={String(runPlanTask.artifacts.length)} />
                      {runPlanTask.blockedReason && <p className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-700 dark:text-amber-300">{runPlanTask.blockedReason}</p>}
                      {runPlanTask.artifacts.length > 0 && (
                        <div data-testid="agent-run-task-artifacts" className="space-y-1">
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">任务产物</div>
                          {buildTaskArtifactViews(runPlanTask, 5, planQuery.data)
                            .map((artifact) => (
                                <div key={artifact.id} className="rounded border border-border/60 bg-background px-2 py-1 text-[10px] leading-relaxed text-muted-foreground">
                                  <div className="flex min-w-0 items-center justify-between gap-2">
                                    <span className="truncate font-medium text-foreground">{artifact.label}</span>
                                    <div className="flex shrink-0 items-center gap-1">
                                      {artifact.sourceTaskOwnerRunId && (
                                        <Button type="button" size="xs" variant="ghost" className="h-5 px-1 text-[8px]" onClick={() => navigate(`/agent/runs/${encodeURIComponent(artifact.sourceTaskOwnerRunId!)}`)}>
                                          任务
                                        </Button>
                                      )}
                                      {artifact.sourceRunId && (
                                        <Button type="button" size="xs" variant="ghost" className="h-5 px-1 text-[8px]" onClick={() => navigate(`/agent/runs/${encodeURIComponent(artifact.sourceRunId!)}`)}>
                                          <Route size={8} />
                                          运行
                                        </Button>
                                      )}
                                      <span>{artifact.type}</span>
                                    </div>
                                  </div>
                                  <div className="mt-0.5 flex flex-wrap gap-x-1.5 gap-y-0.5">
                                    {artifact.uri && <span className="truncate">URI {artifact.uri}</span>}
                                    {artifact.sourceRunId && <span className="truncate">运行 {artifact.sourceRunId}</span>}
                                    {artifact.sourceTaskId && <span className="truncate">任务 {artifact.sourceTaskTitle ?? artifact.sourceTaskId}</span>}
                                    {artifact.sourceTaskStatus && <span>{agentPlanStatusLabel(artifact.sourceTaskStatus)}</span>}
                                    {artifact.toolName && <span className="truncate">工具 {artifact.toolName}</span>}
                                  </div>
                                </div>
                              ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
              {childRunsQuery.data?.children.length ? (
                <div data-testid="agent-run-child-runs" className="space-y-1 rounded border border-border/70 bg-muted/10 p-2">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">子运行</div>
                  {childRunsQuery.data.children.map((child) => {
                    const childName = typeof child.metadata?.subagentName === 'string' && child.metadata.subagentName.trim()
                      ? child.metadata.subagentName.trim()
                      : child.id
                    return (
                      <button
                        data-testid="agent-run-child-run"
                        key={child.id}
                        type="button"
                        className="block w-full rounded border border-border/60 bg-background px-2 py-1 text-left text-[10px] hover:bg-muted/30"
                        onClick={() => navigate(`/agent/runs/${encodeURIComponent(child.id)}`)}
                      >
                        <div className="flex min-w-0 items-center justify-between gap-2">
                          <span className="truncate font-medium text-foreground">{childName}</span>
                          <span className="shrink-0 text-muted-foreground">{runStatusLabel(child.status)}</span>
                        </div>
                        <div className="mt-0.5 truncate text-muted-foreground">{child.taskId ?? child.id}</div>
                      </button>
                    )
                  })}
                </div>
              ) : null}
            </div>
          ) : null}
        </aside>
        <section data-testid="agent-run-trace-panel" className="min-h-0 overflow-y-auto p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div data-testid="agent-run-trace-summary" className="flex flex-wrap items-center gap-1 text-xs">
              <span className="font-medium text-foreground">运行轨迹</span>
              {summaryQuery.data && <span className="text-muted-foreground">{summaryQuery.data.total} 个事件</span>}
              {categoryCounts.map(([category, count]) => (
                <button
                  key={category}
                  type="button"
                  data-testid="agent-run-trace-category-filter"
                  className="rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  onClick={() => setEventCategory((current) => current === category ? 'all' : category)}
                >
                  <Badge variant={eventCategory === category ? 'secondary' : 'outline'} className="text-[10px]">{traceCategoryLabel(category)} {count}</Badge>
                </button>
              ))}
              {summaryQuery.data && Object.entries(summaryQuery.data.byKind).slice(0, 8).map(([kind, count]) => (
                <Badge key={kind} variant="outline" className="text-[10px]">{traceKindLabel(kind as AgentTraceEventKind)} {count}</Badge>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                data-testid="agent-run-trace-search"
                value={eventSearch}
                onChange={(event) => setEventSearch(event.target.value)}
                placeholder="搜索事件"
                className="h-8 w-44 rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <Select value={eventKind} onValueChange={(next) => setEventKind(next as 'all' | AgentTraceEventKind)}>
                <SelectTrigger size="sm" className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部事件</SelectItem>
                  {eventKinds.map((kind) => <SelectItem key={kind} value={kind}>{traceKindLabel(kind as AgentTraceEventKind)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={eventCategory} onValueChange={(next) => setEventCategory(next as 'all' | AgentTraceCategory)}>
                <SelectTrigger size="sm" className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部分类</SelectItem>
                  {eventCategories.map((category) => <SelectItem key={category} value={category}>{traceCategoryLabel(category)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button data-testid="agent-run-load-trace-events" type="button" size="sm" variant="outline" onClick={() => loadEvents('initial')} disabled={loadingEvents}>
                {loadingEvents ? <Loader2 size={13} className="animate-spin" /> : <History size={13} />}
                加载事件
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <AgentRunGenerationArtifacts run={runQuery.data} />
            {traceDeepLinkMissing && (
              <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                这个 run 里没有找到 trace event {traceDeepLinkEventId}。
              </p>
            )}
            {visibleTraceViews.map(({ event, view }) => (
              <div data-testid="agent-run-trace-event" id={`agent-trace-event-${event.id}`} key={event.id} className="scroll-mt-4 rounded-md border border-border bg-background px-3 py-2 text-xs">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="truncate font-medium text-foreground">{view.title}</span>
                  <div className="flex shrink-0 items-center gap-1">
                    {event.data !== undefined && (
                      <Button
                        data-testid="agent-run-trace-event-details-toggle"
                        type="button"
                        size="xs"
                        variant="ghost"
                        className="h-5 px-1 text-[9px]"
                        onClick={() => toggleEventDetails(event.id)}
                      >
                        原始数据
                      </Button>
                    )}
                    {event.data !== undefined && (
                      <Button
                        data-testid="agent-run-trace-event-data-copy"
                        type="button"
                        size="xs"
                        variant="ghost"
                        className="h-5 px-1 text-[9px]"
                        onClick={() => copyEventData(event.data)}
                      >
                        <Copy size={9} />
                        复制数据
                      </Button>
                    )}
                    <Button type="button" size="xs" variant="ghost" className="h-5 px-1 text-[9px]" onClick={() => copyEventLink(event.id)}>
                      <Copy size={9} />
                      链接
                    </Button>
                    <Badge variant="outline" className="text-[10px]">{view.categoryLabel}</Badge>
                    <Badge variant="outline" className="text-[10px]">{traceEventStatusLabel(event.status)}</Badge>
                  </div>
                </div>
                <div className="mt-1 space-y-1">
                  <div className="flex flex-wrap gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
                    <span>{traceKindLabel(event.kind)}</span>
                    {event.toolName && <span>工具 {event.toolName}</span>}
                    {event.stepId && <span>步骤 {event.stepId}</span>}
                    <span>创建 {event.createdAt}</span>
                    {event.completedAt && <span>完成 {event.completedAt}</span>}
                  </div>
                  {view.behavior && <TraceDetailLine label="行为" value={view.behavior} />}
                  {view.impact && <TraceDetailLine label="影响" value={view.impact} />}
                  {view.summary && <TraceDetailLine label="摘要" value={view.summary} />}
                  {view.contextGroups.length > 0 && (
                    <details className="rounded border border-border/70 bg-muted/20 px-2 py-1" open={view.category === 'http'}>
                      <summary className="flex cursor-pointer list-none items-center gap-1 text-[10px] font-medium text-foreground marker:hidden">
                        <ChevronRight size={10} className="open:hidden" />
                        <ChevronDown size={10} className="hidden open:block" />
                        上下文摘要
                      </summary>
                      <div className="mt-1 space-y-1">
                        {view.contextGroups.map((group) => (
                          <div key={group.label} className="rounded bg-background/80 px-2 py-1">
                            <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{group.label}</div>
                            <div className="mt-0.5 grid gap-0.5">
                              {group.items.map((item) => (
                                <div key={`${group.label}:${item.label}`} className="flex min-w-0 items-start justify-between gap-2 text-[10px]">
                                  <span className="shrink-0 text-muted-foreground">{item.label}</span>
                                  <span className="min-w-0 break-all text-right text-foreground">{item.value}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                  {view.modelDetail && (
                    <details data-testid="agent-run-model-detail" className="rounded border border-border/70 bg-muted/20 px-2 py-1" open>
                      <summary className="flex cursor-pointer list-none items-center gap-1 text-[10px] font-medium text-foreground marker:hidden">
                        <ChevronRight size={10} className="open:hidden" />
                        <ChevronDown size={10} className="hidden open:block" />
                        {view.modelDetail.title}
                      </summary>
                      <ModelCallDetail detail={view.modelDetail} />
                    </details>
                  )}
                </div>
                {event.data !== undefined && expandedEventIds.has(event.id) && (
                  <pre data-testid="agent-run-trace-event-details" className="mt-2 max-h-64 overflow-auto rounded border border-border/70 bg-muted/20 p-2 text-[10px] leading-relaxed text-muted-foreground">
                    {formatTraceEventData(event.data)}
                  </pre>
                )}
              </div>
            ))}
            {events.length === 0 && <p className="text-xs text-muted-foreground">尚未加载 trace 事件。</p>}
            {events.length > 0 && visibleEvents.length === 0 && <p className="text-xs text-muted-foreground">没有符合当前筛选条件的事件。</p>}
            {hasMore && (
              <Button type="button" size="sm" variant="ghost" onClick={() => loadEvents('more')} disabled={loadingEvents}>
                {loadingEvents ? <Loader2 size={13} className="animate-spin" /> : <History size={13} />}
                加载更多
              </Button>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}

function traceEventIdFromLocationHash(): string | undefined {
  return typeof window === 'undefined' ? undefined : traceEventIdFromHash(window.location.hash)
}

function traceEventSearchText(event: AgentTraceEvent): string {
  const view = agentTraceView(event)
  return [
    event.id,
    event.kind,
    traceKindLabel(event.kind),
    view.categoryLabel,
    view.title,
    view.behavior,
    view.impact,
    view.summary,
    event.title,
    event.summary,
    event.status,
    traceEventStatusLabel(event.status),
    event.toolName,
    event.stepId,
    event.roundLabel,
    event.roundSource,
  ].filter(Boolean).join(' ').toLowerCase()
}

function formatTraceEventData(data: unknown): string {
  try {
    return JSON.stringify(data, null, 2)
  } catch {
    return String(data)
  }
}

function TraceDetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border/60 bg-background/80 px-2 py-1">
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-[10px] leading-relaxed text-foreground">{value}</div>
    </div>
  )
}

function ModelCallDetail({ detail }: { detail: NonNullable<ReturnType<typeof agentTraceView>['modelDetail']> }) {
  return (
    <div className="mt-1 space-y-1">
      {detail.note && (
        <div className="rounded bg-muted/20 px-2 py-1 text-[10px] leading-relaxed text-muted-foreground">
          {detail.note}
        </div>
      )}
      {detail.messages.length > 0 && (
        <div className="space-y-1">
          <div className="text-[9px] uppercase tracking-wide text-muted-foreground">请求消息</div>
          {detail.messages.map((message) => (
            <div key={`${message.index}:${message.role}`} className="rounded border border-border/60 bg-background/90 px-2 py-1">
              <div className="flex items-center justify-between gap-2 text-[10px]">
                <span className="font-medium text-foreground">{message.index}. {message.roleLabel}</span>
                <span className="text-muted-foreground">{message.contentChars} 字符</span>
              </div>
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/20 p-2 text-[10px] leading-relaxed text-foreground">
                {message.content}
              </pre>
            </div>
          ))}
        </div>
      )}
      {detail.tools.length > 0 && (
        <div className="space-y-1">
          <div className="text-[9px] uppercase tracking-wide text-muted-foreground">工具定义</div>
          {detail.tools.map((tool) => (
            <div key={`${tool.index}:${tool.name}`} className="rounded border border-border/60 bg-background/90 px-2 py-1 text-[10px]">
              <div className="font-medium text-foreground">{tool.index}. {tool.name}</div>
              {tool.description && <div className="mt-0.5 text-muted-foreground">{tool.description}</div>}
              {tool.parameterKeys.length > 0 && <div className="mt-0.5 text-muted-foreground">参数：{tool.parameterKeys.join(', ')}</div>}
            </div>
          ))}
        </div>
      )}
      {detail.response && (
        <div className="rounded border border-border/60 bg-background/90 px-2 py-1">
          <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
            <span className="font-medium text-foreground">HTTP 响应</span>
            {detail.response.status && <span>状态 {detail.response.status}</span>}
            {detail.response.contentType && <span>{detail.response.contentType}</span>}
            {detail.response.parsedId && <span>ID {detail.response.parsedId}</span>}
          </div>
          {(detail.response.content || detail.response.bodyText) && (
            <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/20 p-2 text-[10px] leading-relaxed text-foreground">
              {detail.response.content ?? detail.response.bodyText}
            </pre>
          )}
          {!detail.response.content && !detail.response.bodyText && (
            <div className="mt-1 rounded bg-muted/20 px-2 py-1 text-[10px] leading-relaxed text-muted-foreground">
              这条事件没有 HTTP 响应正文；如果是流式调用，请查看模型增量事件或最终的历史写入事件。
            </div>
          )}
        </div>
      )}
      {detail.result && (
        <div className="grid gap-0.5 rounded border border-border/60 bg-background/90 px-2 py-1 text-[10px]">
          <div className="font-medium text-foreground">模型结果</div>
          <div className="flex flex-wrap gap-2 text-muted-foreground">
            {detail.result.finishReason && <span>结束原因 {detail.result.finishReason}</span>}
            {detail.result.contentChars && <span>回复 {detail.result.contentChars} 字符</span>}
            {detail.result.inputTokens && <span>请求 {detail.result.inputTokens} token</span>}
            {detail.result.outputTokens && <span>回复 {detail.result.outputTokens} token</span>}
            {detail.result.toolCalls && <span>工具调用 {detail.result.toolCalls}</span>}
          </div>
        </div>
      )}
    </div>
  )
}

function buildRunSummary(
  run?: Pick<AgentRun, 'status' | 'role' | 'steps' | 'warnings' | 'error' | 'pendingApprovals' | 'pendingInputRequests'>,
  traceSummary?: { total: number; byKind: Partial<Record<AgentTraceEventKind, number>>; latestEvent?: AgentTraceEvent },
): { overview: string; bullets: string[] } | undefined {
  if (!run) return undefined
  const modelCalls = traceSummary?.byKind.model_call ?? 0
  const toolCalls = traceSummary?.byKind.tool_call ?? 0
  const contextEvents = (traceSummary?.byKind.context ?? 0) + (traceSummary?.byKind.prompt ?? 0) + (traceSummary?.byKind.memory ?? 0)
  const approvals = run.pendingApprovals?.filter((item) => item.status === 'pending').length ?? 0
  const inputs = run.pendingInputRequests?.filter((item) => item.status === 'pending').length ?? 0
  const overview = run.error
    ? `本次 run 失败：${run.error}`
    : run.status === 'completed_with_warnings'
      ? '本次 run 完成，但带有警告。'
      : run.status === 'completed'
        ? '本次 run 已完成。'
        : run.status === 'requires_action'
          ? '本次 run 正在等待用户处理。'
          : '本次 run 仍在运行中。'
  return {
    overview,
    bullets: [
      `${traceSummary?.total ?? 0} 个 trace 事件，${modelCalls} 次模型调用，${toolCalls} 次工具调用`,
      `${contextEvents} 个上下文相关事件`,
      approvals > 0 ? `${approvals} 个待审批项` : '无待审批项',
      inputs > 0 ? `${inputs} 个待输入项` : '无待输入项',
      run.warnings?.length ? `${run.warnings.length} 条警告` : '无运行警告',
    ],
  }
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 break-all text-foreground">{value}</div>
    </div>
  )
}
