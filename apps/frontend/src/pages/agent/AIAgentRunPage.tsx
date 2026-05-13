import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Copy, History, Loader2, RefreshCw, Route, XCircle } from 'lucide-react'
import { Badge, Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@movscript/ui'
import { AgentRunGenerationArtifacts } from '@/components/agent/AgentRunGenerationArtifacts'
import { buildPlanTaskViews, buildTaskArtifactViews } from '@/lib/agentPlanUi'
import { buildTraceEventLink, canCancelWorkerRun, traceDeepLinkMissing as isTraceDeepLinkMissing, traceEventIdFromHash } from '@/lib/agentRunUi'
import { localAgentClient, type AgentTraceEvent, type AgentTraceEventKind } from '@/lib/localAgentClient'

export default function AIAgentRunPage() {
  const navigate = useNavigate()
  const { runId = '' } = useParams()
  const [eventKind, setEventKind] = useState<'all' | AgentTraceEventKind>('all')
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
      if (!needle) return true
      return traceEventSearchText(event).includes(needle)
    })
  }, [eventKind, eventSearch, events])
  const eventKinds = useMemo(() => Array.from(new Set(events.map((event) => event.kind))).sort(), [events])
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
    setEventKind('all')
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
    const confirmed = window.confirm(`Cancel ${subagentName ?? 'this worker'} and its child runs?`)
    if (!confirmed) return
    setCancelingRun(true)
    setCancelError(null)
    try {
      await localAgentClient.cancelRunTree(runId, { reason: `Cancelled from run detail for ${subagentName ?? runId}.` })
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
              <h1 className="text-lg font-semibold text-foreground">Agent run</h1>
              {runQuery.data && <Badge variant="outline">{runQuery.data.status.replace(/_/g, ' ')}</Badge>}
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
                Parent
              </Button>
            )}
            {planQuery.data?.plan.rootRunId && planQuery.data.plan.rootRunId !== runId && (
              <Button type="button" size="sm" variant="outline" onClick={() => navigate(`/agent/runs/${encodeURIComponent(planQuery.data!.plan.rootRunId!)}`)}>
                <Route size={13} />
                Root
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
                Cancel worker
              </Button>
            )}
            <Button type="button" size="sm" variant="outline" onClick={() => navigate(-1)}>
              <ArrowLeft size={13} />
              Back
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => { void refreshRunPage() }} disabled={runQuery.isFetching || summaryQuery.isFetching || planQuery.isFetching || loadingEvents}>
              <RefreshCw size={13} className={runQuery.isFetching || summaryQuery.isFetching || planQuery.isFetching || loadingEvents ? 'animate-spin' : ''} />
              Refresh
            </Button>
          </div>
        </div>
      </header>
      <main className="grid min-h-0 flex-1 grid-cols-[minmax(260px,380px)_minmax(0,1fr)]">
        <aside data-testid="agent-run-sidebar" className="min-h-0 overflow-y-auto border-r border-border p-4">
          {runQuery.isLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 size={12} className="animate-spin" /> Loading run</div>
          ) : runQuery.error ? (
            <p className="text-xs text-destructive">{runQuery.error instanceof Error ? runQuery.error.message : String(runQuery.error)}</p>
          ) : runQuery.data ? (
            <div className="space-y-3 text-xs">
              <Info label="Role" value={runQuery.data.role ?? '-'} />
              <Info label="Subagent" value={subagentName ?? '-'} />
              <Info label="Thread" value={runQuery.data.threadId} />
              <Info label="Plan" value={runQuery.data.planId ?? '-'} />
              <Info label="Task" value={runQuery.data.taskId ?? '-'} />
              <Info label="Parent" value={runQuery.data.parentRunId ?? '-'} />
              <Info label="Progress" value={typeof runQuery.data.progress === 'number' ? `${Math.round(runQuery.data.progress * 100)}%` : '-'} />
              <Info label="Steps" value={String(runQuery.data.steps.length)} />
              <Info label="Created" value={runQuery.data.createdAt} />
              <Info label="Updated" value={runQuery.data.updatedAt} />
              {runQuery.data.error && <p className="rounded border border-destructive/30 bg-destructive/10 px-2 py-1 text-destructive">{runQuery.data.error}</p>}
              {(runQuery.data.pendingInputRequests ?? []).filter((request) => request.status === 'pending').length > 0 && (
                <div data-testid="agent-run-pending-input" className="space-y-1 rounded border border-amber-500/30 bg-amber-500/10 p-2">
                  <div className="text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-300">Pending input</div>
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
                          {request.allowCustomAnswer && <Badge variant="outline" className="text-[9px]">custom answer</Badge>}
                        </div>
                      )}
                      {(request.allowCustomAnswer || request.inputType === 'text') && (
                        <div className="flex items-center gap-1 pt-1">
                          <input
                            data-testid="agent-run-input-text"
                            value={inputDrafts[request.id] ?? ''}
                            onChange={(event) => setInputDrafts((current) => ({ ...current, [request.id]: event.target.value }))}
                            disabled={!!inputActionId}
                            placeholder="Answer"
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
                            Send
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {(runQuery.data.pendingApprovals ?? []).filter((approval) => approval.status === 'pending').length > 0 && (
                <div data-testid="agent-run-pending-approval" className="space-y-1 rounded border border-amber-500/30 bg-amber-500/10 p-2">
                  <div className="text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-300">Pending approval</div>
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
                        {approval.risk && <Badge variant="outline" className="text-[9px]">risk {approval.risk}</Badge>}
                        {approval.permission && <Badge variant="outline" className="text-[9px]">permission {approval.permission}</Badge>}
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
                          Approve
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
                          Reject
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {planQuery.isLoading && (
                <div className="flex items-center gap-2 rounded border border-border px-2 py-1 text-muted-foreground"><Loader2 size={12} className="animate-spin" /> Loading plan context</div>
              )}
              {planQuery.error && (
                <p className="rounded border border-destructive/30 bg-destructive/10 px-2 py-1 text-destructive">{planQuery.error instanceof Error ? planQuery.error.message : String(planQuery.error)}</p>
              )}
              {planQuery.data && (
                <div data-testid="agent-run-plan-context" className="space-y-2 rounded border border-border/70 bg-muted/10 p-2">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Plan context</div>
                  <Info label="Plan title" value={planQuery.data.plan.title} />
                  <Info label="Plan status" value={planQuery.data.plan.status.replace(/_/g, ' ')} />
                  {runPlanTask && (
                    <>
                      <Info label="Task title" value={runPlanTask.title} />
                      <Info label="Task status" value={runPlanTask.status.replace(/_/g, ' ')} />
                      {runPlanTaskView?.statusExplanation && <Info label="Task state" value={runPlanTaskView.statusExplanation} />}
                      <Info label="Artifacts" value={String(runPlanTask.artifacts.length)} />
                      {runPlanTask.blockedReason && <p className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-700 dark:text-amber-300">{runPlanTask.blockedReason}</p>}
                      {runPlanTask.artifacts.length > 0 && (
                        <div data-testid="agent-run-task-artifacts" className="space-y-1">
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Task artifacts</div>
                          {buildTaskArtifactViews(runPlanTask, 5, planQuery.data)
                            .map((artifact) => (
                                <div key={artifact.id} className="rounded border border-border/60 bg-background px-2 py-1 text-[10px] leading-relaxed text-muted-foreground">
                                  <div className="flex min-w-0 items-center justify-between gap-2">
                                    <span className="truncate font-medium text-foreground">{artifact.label}</span>
                                    <div className="flex shrink-0 items-center gap-1">
                                      {artifact.sourceTaskOwnerRunId && (
                                        <Button type="button" size="xs" variant="ghost" className="h-5 px-1 text-[8px]" onClick={() => navigate(`/agent/runs/${encodeURIComponent(artifact.sourceTaskOwnerRunId!)}`)}>
                                          Task
                                        </Button>
                                      )}
                                      {artifact.sourceRunId && (
                                        <Button type="button" size="xs" variant="ghost" className="h-5 px-1 text-[8px]" onClick={() => navigate(`/agent/runs/${encodeURIComponent(artifact.sourceRunId!)}`)}>
                                          <Route size={8} />
                                          Run
                                        </Button>
                                      )}
                                      <span>{artifact.type}</span>
                                    </div>
                                  </div>
                                  <div className="mt-0.5 flex flex-wrap gap-x-1.5 gap-y-0.5">
                                    {artifact.uri && <span className="truncate">uri {artifact.uri}</span>}
                                    {artifact.sourceRunId && <span className="truncate">run {artifact.sourceRunId}</span>}
                                    {artifact.sourceTaskId && <span className="truncate">task {artifact.sourceTaskTitle ?? artifact.sourceTaskId}</span>}
                                    {artifact.sourceTaskStatus && <span>{artifact.sourceTaskStatus.replace(/_/g, ' ')}</span>}
                                    {artifact.toolName && <span className="truncate">tool {artifact.toolName}</span>}
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
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Child runs</div>
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
                          <span className="shrink-0 text-muted-foreground">{child.status.replace(/_/g, ' ')}</span>
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
              <span className="font-medium text-foreground">Trace</span>
              {summaryQuery.data && <span className="text-muted-foreground">{summaryQuery.data.total} events</span>}
              {summaryQuery.data && Object.entries(summaryQuery.data.byKind).slice(0, 8).map(([kind, count]) => (
                <Badge key={kind} variant="outline" className="text-[10px]">{kind} {count}</Badge>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                data-testid="agent-run-trace-search"
                value={eventSearch}
                onChange={(event) => setEventSearch(event.target.value)}
                placeholder="Search events"
                className="h-8 w-44 rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <Select value={eventKind} onValueChange={(next) => setEventKind(next as 'all' | AgentTraceEventKind)}>
                <SelectTrigger size="sm" className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">all events</SelectItem>
                  {eventKinds.map((kind) => <SelectItem key={kind} value={kind}>{kind}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button data-testid="agent-run-load-trace-events" type="button" size="sm" variant="outline" onClick={() => loadEvents('initial')} disabled={loadingEvents}>
                {loadingEvents ? <Loader2 size={13} className="animate-spin" /> : <History size={13} />}
                Load events
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <AgentRunGenerationArtifacts run={runQuery.data} />
            {traceDeepLinkMissing && (
              <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                Trace event {traceDeepLinkEventId} was not found in this run.
              </p>
            )}
            {visibleEvents.map((event) => (
              <div data-testid="agent-run-trace-event" id={`agent-trace-event-${event.id}`} key={event.id} className="scroll-mt-4 rounded-md border border-border bg-background px-3 py-2 text-xs">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="truncate font-medium text-foreground">{event.title}</span>
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
                        Details
                      </Button>
                    )}
                    <Button type="button" size="xs" variant="ghost" className="h-5 px-1 text-[9px]" onClick={() => copyEventLink(event.id)}>
                      <Copy size={9} />
                      Link
                    </Button>
                    <Badge variant="outline" className="text-[10px]">{event.status.replace(/_/g, ' ')}</Badge>
                  </div>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
                  <span>{event.kind}</span>
                  {event.toolName && <span>tool {event.toolName}</span>}
                  {event.stepId && <span>step {event.stepId}</span>}
                  <span>{event.createdAt}</span>
                  {event.completedAt && <span>completed {event.completedAt}</span>}
                </div>
                {event.summary && <p className="mt-1 text-muted-foreground">{event.summary}</p>}
                {event.data !== undefined && expandedEventIds.has(event.id) && (
                  <pre data-testid="agent-run-trace-event-details" className="mt-2 max-h-64 overflow-auto rounded border border-border/70 bg-muted/20 p-2 text-[10px] leading-relaxed text-muted-foreground">
                    {formatTraceEventData(event.data)}
                  </pre>
                )}
              </div>
            ))}
            {events.length === 0 && <p className="text-xs text-muted-foreground">No trace events loaded.</p>}
            {events.length > 0 && visibleEvents.length === 0 && <p className="text-xs text-muted-foreground">No events match the current filter.</p>}
            {hasMore && (
              <Button type="button" size="sm" variant="ghost" onClick={() => loadEvents('more')} disabled={loadingEvents}>
                {loadingEvents ? <Loader2 size={13} className="animate-spin" /> : <History size={13} />}
                Load more
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
  return [
    event.id,
    event.kind,
    event.title,
    event.summary,
    event.status,
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 break-all text-foreground">{value}</div>
    </div>
  )
}
