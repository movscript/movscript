import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronDown, ChevronRight, Copy, History, Loader2, RefreshCw, Route, XCircle } from 'lucide-react'
import { Badge, Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@movscript/ui'
import { AgentRunGenerationArtifacts } from '@/components/agent/AgentRunGenerationArtifacts'
import { LocalAgentInputRequestCard } from '@/components/agent/localRuntime'
import { agentTaskStatusLabel, buildPlanTaskViews, buildTaskArtifactViews } from '@/lib/agentPlanUi'
import { AGENT_DEBUG_FIELD_GUIDE, agentPlanStatusLabel, agentTraceView, approvalImpactLabel, approvalPermissionLabel, approvalRiskLabel, buildDebugAttentionEvents, buildDebugCoverageSummary, buildDebugReadinessChecklist, buildDebugReportText, buildModelCallDebugContext, buildModelCallDebugContexts, buildModelCallSummaries, buildSkillTraceSummary, buildTraceEventLink, canCancelWorkerRun, formatTraceEventDuration, hasUnloadedTraceEvents, inputTypeLabel, runRoleLabel, runStatusLabel, traceCategoryLabel, traceDeepLinkMissing as isTraceDeepLinkMissing, traceEventDurationMs, traceEventIdFromHash, traceEventStatusLabel, traceKindLabel, type AgentDebugAttentionEvent, type AgentDebugCoverageSummary, type AgentDebugReadinessItem, type AgentModelCallSummary, type AgentSkillTraceSummary, type AgentTraceCategory } from '@/lib/agentRunUi'
import { agentToolNameLabel } from '@/lib/agentToolDisplay'
import { formatAgentTraceDebugData, redactAgentTraceDebugText } from '@/lib/agentTraceDebugData'
import { isRecord } from '@/lib/jsonValue'
import { localAgentClient, type AgentRun, type AgentTraceEvent, type AgentTraceEventKind } from '@/lib/localAgentClient'
import { agentRunPath } from '@/routes/projectRoutes'

const TRACE_PAGE_SIZE = 25
const TRACE_BULK_PAGE_SIZE = 100
const DEBUG_BUNDLE_SCHEMA = 'movscript.agent-run-debug-bundle.v1'
const DEBUG_BUNDLE_SCHEMA_URL = 'https://movscript.dev/schemas/agent-run-debug-bundle-v1.schema.json'
const DEBUG_BUNDLE_CAPABILITIES = [
  'runSummary',
  'readinessChecklist',
  'modelCallContexts',
  'promptDetails',
  'messageWrites',
  'toolCalls',
  'attentionEvents',
  'pendingActions',
  'fieldGuide',
  'redactedDebugData',
] as const

interface LoadedTraceEventsResult {
  events: AgentTraceEvent[]
  hasMore: boolean
}

export default function AIAgentRunPage() {
  const navigate = useNavigate()
  const { runId = '' } = useParams()
  const [traceViewMode, setTraceViewMode] = useState<'timeline' | 'skills'>('timeline')
  const [eventKind, setEventKind] = useState<'all' | AgentTraceEventKind>('all')
  const [eventCategory, setEventCategory] = useState<'all' | AgentTraceCategory>('all')
  const [eventSearch, setEventSearch] = useState('')
  const [events, setEvents] = useState<AgentTraceEvent[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loadingEvents, setLoadingEvents] = useState(false)
  const [traceLoadError, setTraceLoadError] = useState<string | null>(null)
  const [cancelingRun, setCancelingRun] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [approvalActionId, setApprovalActionId] = useState<string | null>(null)
  const [approvalError, setApprovalError] = useState<string | null>(null)
  const [inputActionId, setInputActionId] = useState<string | null>(null)
  const [inputError, setInputError] = useState<string | null>(null)
  const [expandedEventIds, setExpandedEventIds] = useState<Set<string>>(() => new Set())
  const [traceDeepLinkEventId, setTraceDeepLinkEventId] = useState(() => traceEventIdFromLocationHash())
  const [debugReportCopied, setDebugReportCopied] = useState(false)
  const [debugReportCopyError, setDebugReportCopyError] = useState<string | null>(null)
  const [debugBundleCopied, setDebugBundleCopied] = useState(false)
  const [debugBundleCopyError, setDebugBundleCopyError] = useState<string | null>(null)
  const [eventCopyFeedback, setEventCopyFeedback] = useState<{ eventId: string; action: 'data' | 'link' } | null>(null)
  const [eventCopyError, setEventCopyError] = useState<{ eventId: string; message: string } | null>(null)
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
  const skillTraceSummary = useMemo(() => buildSkillTraceSummary(events), [events])
  const modelCallSummaries = useMemo(() => buildModelCallSummaries(events), [events])
  const attentionEvents = useMemo(() => buildDebugAttentionEvents(events), [events])
  const latestTraceView = useMemo(
    () => summaryQuery.data?.latestEvent ? agentTraceView(summaryQuery.data.latestEvent) : undefined,
    [summaryQuery.data?.latestEvent],
  )
  const runSummary = useMemo(() => buildRunSummary(runQuery.data, summaryQuery.data), [runQuery.data, summaryQuery.data])
  const traceTotal = summaryQuery.data?.total
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
  const traceHasUnloadedEvents = hasUnloadedTraceEvents({ loaded: events.length, total: traceTotal, hasMore })
  const traceFiltersActive = eventSearch.trim() !== '' || eventKind !== 'all' || eventCategory !== 'all'
  const debugCoverageSummary = useMemo(() => buildDebugCoverageSummary({
    events,
    total: traceTotal,
    hasMore,
    modelCalls: modelCallSummaries,
  }), [events, hasMore, modelCallSummaries, traceTotal])
  const debugReportText = useMemo(() => buildDebugReportText({
    runId,
    run: runQuery.data,
    coverage: debugCoverageSummary,
    modelCalls: modelCallSummaries,
    events,
  }), [debugCoverageSummary, events, modelCallSummaries, runId, runQuery.data])
  const runTerminalAt = runQuery.data?.completedAt ?? runQuery.data?.failedAt ?? runQuery.data?.cancelledAt
  const runDuration = formatAgentRunDuration(runQuery.data?.createdAt, runTerminalAt)

  useEffect(() => {
    currentRunIdRef.current = runId
  }, [runId])

  useEffect(() => {
    setEvents([])
    setHasMore(false)
    setLoadingEvents(false)
    setTraceLoadError(null)
    initialTraceLoadRunIdRef.current = null
    setEventKind('all')
    setEventCategory('all')
    setEventSearch('')
    setCancelError(null)
    setApprovalActionId(null)
    setApprovalError(null)
    setInputActionId(null)
    setInputError(null)
    setDebugReportCopied(false)
    setDebugReportCopyError(null)
    setDebugBundleCopied(false)
    setDebugBundleCopyError(null)
    setEventCopyFeedback(null)
    setEventCopyError(null)
    setExpandedEventIds(new Set())
  }, [runId])

  useEffect(() => {
    const syncTraceDeepLinkEventId = () => {
      const nextEventId = traceEventIdFromLocationHash()
      if (nextEventId) clearTraceFilters()
      setTraceDeepLinkEventId(nextEventId)
    }
    syncTraceDeepLinkEventId()
    window.addEventListener('hashchange', syncTraceDeepLinkEventId)
    return () => window.removeEventListener('hashchange', syncTraceDeepLinkEventId)
  }, [runId])

  useEffect(() => {
    if (!runId || initialTraceLoadRunIdRef.current === runId) return
    initialTraceLoadRunIdRef.current = runId
    void loadEvents('initial')
  }, [runId])

  useEffect(() => {
    setDebugReportCopied(false)
    setDebugReportCopyError(null)
  }, [debugReportText])

  useEffect(() => {
    setDebugBundleCopied(false)
    setDebugBundleCopyError(null)
  }, [debugCoverageSummary, events, modelCallSummaries, runQuery.data])

  useEffect(() => {
    if (!traceDeepLinkEventId) return
    const element = document.getElementById(`agent-trace-event-${traceDeepLinkEventId}`)
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const linkedEvent = visibleEvents.find((event) => event.id === traceDeepLinkEventId)
    if (linkedEvent?.data !== undefined) {
      setExpandedEventIds((current) => {
        if (current.has(traceDeepLinkEventId)) return current
        const next = new Set(current)
        next.add(traceDeepLinkEventId)
        return next
      })
    }
  }, [traceDeepLinkEventId, visibleEvents])

  useEffect(() => {
    if (!traceDeepLinkEventId || loadingEvents) return
    if (document.getElementById(`agent-trace-event-${traceDeepLinkEventId}`)) return
    if (events.length === 0) {
      void loadEvents('initial')
      return
    }
    if (hasMore) void loadEvents('more')
  }, [events.length, hasMore, loadingEvents, runId, traceDeepLinkEventId])

  async function loadEvents(mode: 'initial' | 'more' | 'all' = 'initial'): Promise<LoadedTraceEventsResult | undefined> {
    if (!runId || loadingEvents) return undefined
    const requestedRunId = runId
    setLoadingEvents(true)
    setTraceLoadError(null)
    try {
      if (mode === 'all') {
        let nextEvents = events
        let cursor = nextEvents.at(-1)?.id
        let fetchedPageCount = 0
        while (currentRunIdRef.current === requestedRunId && fetchedPageCount < 100) {
          const response = await localAgentClient.getRunTraceEvents(requestedRunId, { limit: TRACE_BULK_PAGE_SIZE, ...(cursor ? { cursor } : {}) })
          if (currentRunIdRef.current !== requestedRunId) return
          if (response.events.length === 0) {
            setEvents(nextEvents)
            setHasMore(false)
            return { events: nextEvents, hasMore: false }
          }
          nextEvents = mergeTraceEvents(nextEvents, response.events)
          cursor = response.events.at(-1)?.id
          fetchedPageCount += 1
          setEvents(nextEvents)
          const responseTotal = typeof response.total === 'number' ? response.total : traceTotal
          const reachedKnownTotal = typeof responseTotal === 'number' && nextEvents.length >= responseTotal
          if (reachedKnownTotal || response.hasMore === false || response.events.length < TRACE_BULK_PAGE_SIZE) {
            setHasMore(false)
            return { events: nextEvents, hasMore: false }
          }
        }
        setEvents(nextEvents)
        const nextHasMore = typeof traceTotal === 'number' ? nextEvents.length < traceTotal : true
        setHasMore(nextHasMore)
        return { events: nextEvents, hasMore: nextHasMore }
      }
      const cursor = mode === 'more' ? events.at(-1)?.id : undefined
      const response = await localAgentClient.getRunTraceEvents(requestedRunId, { limit: TRACE_PAGE_SIZE, ...(cursor ? { cursor } : {}) })
      if (currentRunIdRef.current !== requestedRunId) return
      const nextEvents = mode === 'more' ? mergeTraceEvents(events, response.events) : response.events
      setEvents(nextEvents)
      const responseTotal = typeof response.total === 'number' ? response.total : traceTotal
      const nextHasMore = typeof response.hasMore === 'boolean'
        ? response.hasMore
        : typeof responseTotal === 'number'
          ? nextEvents.length < responseTotal
          : response.events.length >= TRACE_PAGE_SIZE
      setHasMore(nextHasMore)
      return { events: nextEvents, hasMore: nextHasMore }
    } catch (error) {
      if (currentRunIdRef.current === requestedRunId) setTraceLoadError(error instanceof Error ? error.message : String(error))
    } finally {
      if (currentRunIdRef.current === requestedRunId) setLoadingEvents(false)
    }
  }

  async function copyEventLink(eventId: string) {
    setEventCopyFeedback(null)
    setEventCopyError(null)
    const nextUrl = buildTraceEventLink({
      origin: window.location.origin,
      pathname: window.location.pathname,
      search: window.location.search,
      eventId,
    })
    window.history.replaceState(null, '', nextUrl)
    setTraceDeepLinkEventId(eventId)
    try {
      await navigator.clipboard.writeText(nextUrl)
      setEventCopyFeedback({ eventId, action: 'link' })
    } catch (error) {
      setEventCopyError({ eventId, message: error instanceof Error ? error.message : String(error) })
    }
  }

  function focusTraceEvent(eventId: string) {
    const nextUrl = buildTraceEventLink({
      origin: window.location.origin,
      pathname: window.location.pathname,
      search: window.location.search,
      eventId,
    })
    window.history.replaceState(null, '', nextUrl)
    clearTraceFilters()
    setTraceDeepLinkEventId(eventId)
  }

  function clearTraceFilters() {
    setEventSearch('')
    setEventKind('all')
    setEventCategory('all')
  }

  function showAttentionEvents() {
    setEventSearch('')
    setEventKind('all')
    setEventCategory('attention')
  }

  async function copyEventData(eventId: string, data: unknown) {
    setEventCopyFeedback(null)
    setEventCopyError(null)
    try {
      await navigator.clipboard.writeText(formatAgentTraceDebugData(data))
      setEventCopyFeedback({ eventId, action: 'data' })
    } catch (error) {
      setEventCopyError({ eventId, message: error instanceof Error ? error.message : String(error) })
    }
  }

  async function copyDebugReport() {
    setDebugReportCopied(false)
    setDebugReportCopyError(null)
    try {
      await navigator.clipboard.writeText(debugReportText)
      setDebugReportCopied(true)
    } catch (error) {
      setDebugReportCopyError(error instanceof Error ? error.message : String(error))
    }
  }

  async function copyDebugBundle() {
    setDebugBundleCopied(false)
    setDebugBundleCopyError(null)
    try {
      if (!runQuery.data) {
        throw new Error('运行基础信息尚未加载完成，已停止复制调试包。请稍后重试。')
      }
      const loaded = traceHasUnloadedEvents ? await loadEvents('all') : undefined
      if (traceHasUnloadedEvents && !loaded) {
        throw new Error('运行事件未能加载完整，已停止复制调试包。请先重试加载全部事件。')
      }
      const bundleEvents = loaded?.events ?? events
      const bundleHasMore = loaded?.hasMore ?? hasMore
      const bundleModelCalls = buildModelCallSummaries(bundleEvents)
      const bundleCoverage = buildDebugCoverageSummary({
        events: bundleEvents,
        total: traceTotal,
        hasMore: bundleHasMore,
        modelCalls: bundleModelCalls,
      })
      const bundlePromptDetails = debugBundlePromptDetails(bundleEvents)
      const bundleMessageWrites = debugBundleMessageWrites(bundleEvents)
      const bundleToolCalls = debugBundleToolCalls(bundleEvents)
      const bundleModelCallContexts = debugBundleModelCallContexts(bundleModelCalls, bundleEvents)
      const bundleAttentionEvents = buildDebugAttentionEvents(bundleEvents)
      const bundlePendingActions = debugBundlePendingActions(runQuery.data)
      await navigator.clipboard.writeText(formatAgentTraceDebugData({
        schema: DEBUG_BUNDLE_SCHEMA,
        schemaUrl: DEBUG_BUNDLE_SCHEMA_URL,
        generatedAt: new Date().toISOString(),
        capabilities: DEBUG_BUNDLE_CAPABILITIES,
        runId,
        run: debugBundleRunSnapshot(runQuery.data),
        runSummary: debugBundleRunSummary(runQuery.data),
        trace: {
          loaded: bundleEvents.length,
          total: traceTotal,
          hasMore: bundleHasMore,
        },
        fieldGuide: AGENT_DEBUG_FIELD_GUIDE,
        coverage: bundleCoverage,
        readinessChecklist: buildDebugReadinessChecklist(bundleCoverage),
        modelCalls: bundleModelCalls,
        modelCallContexts: bundleModelCallContexts,
        promptDetails: bundlePromptDetails,
        messageWrites: bundleMessageWrites,
        toolCalls: bundleToolCalls,
        attentionEvents: bundleAttentionEvents,
        pendingActions: bundlePendingActions,
        events: bundleEvents,
      }))
      setDebugBundleCopied(true)
    } catch (error) {
      setDebugBundleCopyError(error instanceof Error ? error.message : String(error))
    }
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
    const confirmed = window.confirm(`确定取消 ${subagentName ?? '这个执行器'} 以及它的子运行吗？`)
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
    <div data-testid="agent-run-page" className="flex h-full min-h-full min-w-0 flex-col bg-background">
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
              <p data-testid="agent-run-cancel-error" role="alert" className="mt-2 rounded border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs text-destructive">
                {cancelError}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {runQuery.data?.parentRunId && (
              <Button type="button" size="sm" variant="outline" aria-label="打开上级运行" onClick={() => navigate(agentRunPath(runQuery.data!.parentRunId!))}>
                <Route size={13} />
                上级
              </Button>
            )}
            {planQuery.data?.plan.rootRunId && planQuery.data.plan.rootRunId !== runId && (
              <Button type="button" size="sm" variant="outline" aria-label="打开计划根运行" onClick={() => navigate(agentRunPath(planQuery.data!.plan.rootRunId!))}>
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
                aria-label={`取消执行器 ${subagentName ?? runId}`}
                onClick={() => { void cancelWorkerRun() }}
                disabled={cancelingRun || runQuery.isFetching || loadingEvents}
              >
                {cancelingRun ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
                取消执行器
              </Button>
            )}
            <Button type="button" size="sm" variant="outline" aria-label="返回上一页" onClick={() => navigate(-1)}>
              <ArrowLeft size={13} />
              返回
            </Button>
            <Button type="button" size="sm" variant="outline" aria-label="刷新 AgentRun 调试页面" onClick={() => { void refreshRunPage() }} disabled={runQuery.isFetching || summaryQuery.isFetching || planQuery.isFetching || loadingEvents}>
              <RefreshCw size={13} className={runQuery.isFetching || summaryQuery.isFetching || planQuery.isFetching || loadingEvents ? 'animate-spin' : ''} />
              刷新
            </Button>
          </div>
        </div>
      </header>
      <main className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(260px,380px)_minmax(0,1fr)] lg:overflow-hidden">
        <aside data-testid="agent-run-sidebar" className="min-h-0 border-b border-border p-4 lg:overflow-y-auto lg:border-b-0 lg:border-r">
          {runQuery.isLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 size={12} className="animate-spin" /> 正在加载运行</div>
          ) : runQuery.error ? (
            <div data-testid="agent-run-detail-error" role="alert" className="rounded border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs text-destructive">
              <p>{runQuery.error instanceof Error ? runQuery.error.message : String(runQuery.error)}</p>
              <Button
                data-testid="agent-run-detail-retry"
                type="button"
                size="xs"
                variant="outline"
                className="mt-2 h-6 px-2 text-[10px]"
                aria-label="重新加载 AgentRun 运行详情"
                onClick={() => { void runQuery.refetch() }}
                disabled={runQuery.isFetching}
              >
                {runQuery.isFetching ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
                重试
              </Button>
            </div>
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
              <Info label="创建于" value={formatAgentRunTimestamp(runQuery.data.createdAt)} title={runQuery.data.createdAt} />
              <Info label="更新于" value={formatAgentRunTimestamp(runQuery.data.updatedAt)} title={runQuery.data.updatedAt} />
              {runQuery.data.completedAt && <Info label="完成于" value={formatAgentRunTimestamp(runQuery.data.completedAt)} title={runQuery.data.completedAt} />}
              {runQuery.data.failedAt && <Info label="失败于" value={formatAgentRunTimestamp(runQuery.data.failedAt)} title={runQuery.data.failedAt} />}
              {runQuery.data.cancelledAt && <Info label="取消于" value={formatAgentRunTimestamp(runQuery.data.cancelledAt)} title={runQuery.data.cancelledAt} />}
              {runDuration && <Info label="耗时" value={runDuration} />}
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
                    <p data-testid="agent-run-input-error" role="alert" className="rounded border border-destructive/30 bg-destructive/10 px-2 py-1 text-destructive">
                      {inputError}
                    </p>
                  )}
                  {(runQuery.data.pendingInputRequests ?? []).filter((request) => request.status === 'pending').map((request) => (
                    <LocalAgentInputRequestCard
                      key={request.id}
                      request={request}
                      disabled={!!inputActionId}
                      onAnswer={(answer) => { void answerInput(request.id, answer) }}
                      placeholder="输入答案"
                      sendLabel="发送"
                      meta={<Badge variant="outline" className="text-[9px]">类型 {inputTypeLabel(request.inputType)}</Badge>}
                    />
                  ))}
                </div>
              )}
              {(runQuery.data.pendingApprovals ?? []).filter((approval) => approval.status === 'pending').length > 0 && (
                <div data-testid="agent-run-pending-approval" className="space-y-1 rounded border border-amber-500/30 bg-amber-500/10 p-2">
                  <div className="text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-300">待审批</div>
                  {approvalError && (
                    <p data-testid="agent-run-approval-error" role="alert" className="rounded border border-destructive/30 bg-destructive/10 px-2 py-1 text-destructive">
                      {approvalError}
                    </p>
                  )}
                  {(runQuery.data.pendingApprovals ?? []).filter((approval) => approval.status === 'pending').map((approval) => (
                    <div key={approval.id} className="space-y-0.5">
                      <div className="font-medium text-foreground" title={approval.toolName}>{agentToolNameLabel(approval.toolName)}</div>
                      <p className="text-muted-foreground">{approval.reason}</p>
                      <div className="flex flex-wrap gap-1">
                        {approval.risk && <Badge variant="outline" className="text-[9px]">风险 {approvalRiskLabel(approval.risk)}</Badge>}
                        {approval.permission && <Badge variant="outline" className="text-[9px]">权限 {approvalPermissionLabel(approval.permission)}</Badge>}
                      </div>
                      <div className="rounded bg-amber-500/10 px-2 py-1 text-[10px] leading-relaxed text-amber-800 dark:text-amber-300">
                        影响：{approvalImpactLabel(approval)}
                      </div>
                      <div className="flex flex-wrap gap-1 pt-1">
                        <Button
                          data-testid="agent-run-approval-action"
                          type="button"
                          size="xs"
                          variant="outline"
                          className="h-6 px-2 text-[10px]"
                          aria-label={`同意执行${approval.toolName}`}
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
                          aria-label={`拒绝执行${approval.toolName}`}
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
                <div data-testid="agent-run-plan-context-error" role="alert" className="rounded border border-destructive/30 bg-destructive/10 px-2 py-1 text-destructive">
                  <p>{planQuery.error instanceof Error ? planQuery.error.message : String(planQuery.error)}</p>
                  <Button
                    data-testid="agent-run-plan-context-retry"
                    type="button"
                    size="xs"
                    variant="outline"
                    className="mt-2 h-6 px-2 text-[10px]"
                    aria-label="重新加载计划上下文"
                    onClick={() => { void planQuery.refetch() }}
                    disabled={planQuery.isFetching}
                  >
                    {planQuery.isFetching ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
                    重试
                  </Button>
                </div>
              )}
              {planQuery.data && (
                <div data-testid="agent-run-plan-context" className="space-y-2 rounded border border-border/70 bg-muted/10 p-2">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">计划上下文</div>
                  <Info label="计划标题" value={planQuery.data.plan.title} />
                  <Info label="计划状态" value={agentPlanStatusLabel(planQuery.data.plan.status)} />
                  {runPlanTask && (
                    <>
                      <Info label="任务标题" value={runPlanTask.title} />
                      <Info label="任务状态" value={agentTaskStatusLabel(runPlanTask.status)} />
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
                                        <Button type="button" size="xs" variant="ghost" className="h-5 px-1 text-[8px]" onClick={() => navigate(agentRunPath(artifact.sourceTaskOwnerRunId!))}>
                                          来源运行
                                        </Button>
                                      )}
                                      {artifact.sourceRunId && (
                                        <Button type="button" size="xs" variant="ghost" className="h-5 px-1 text-[8px]" onClick={() => navigate(agentRunPath(artifact.sourceRunId!))}>
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
                                    {artifact.sourceTaskId && <span className="truncate">来源任务 {artifact.sourceTaskTitle ?? artifact.sourceTaskId}</span>}
                                    {artifact.sourceTaskStatus && <span>{agentTaskStatusLabel(artifact.sourceTaskStatus)}</span>}
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
                        onClick={() => navigate(agentRunPath(child.id))}
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
        <section data-testid="agent-run-trace-panel" aria-busy={loadingEvents} className="min-h-0 p-4 lg:overflow-y-auto">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div data-testid="agent-run-trace-summary" className="flex flex-wrap items-center gap-1 text-xs">
              <span className="font-medium text-foreground">运行轨迹</span>
              {summaryQuery.data && <span className="text-muted-foreground">{summaryQuery.data.total} 个事件</span>}
              {summaryQuery.error && (
                <span data-testid="agent-run-trace-summary-error" role="alert" className="text-destructive">
                  统计加载失败
                </span>
              )}
              {events.length > 0 && (
                <span data-testid="agent-run-trace-loaded-count" className="text-muted-foreground">
                  已加载 {events.length}{typeof traceTotal === 'number' ? ` / ${traceTotal}` : ''}
                </span>
              )}
              {events.length > 0 && traceFiltersActive && (
                <span data-testid="agent-run-trace-visible-count" className="text-muted-foreground">
                  当前显示 {visibleEvents.length} 个
                </span>
              )}
              {categoryCounts.map(([category, count]) => (
                <button
                  key={category}
                  type="button"
                  data-testid="agent-run-trace-category-filter"
                  aria-pressed={eventCategory === category}
                  aria-label={`按${traceCategoryLabel(category)}筛选运行事件`}
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
            <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto">
              <div data-testid="agent-run-trace-view-mode" className="flex h-8 overflow-hidden rounded-md border border-border bg-background text-xs">
                <button
                  type="button"
                  aria-pressed={traceViewMode === 'timeline'}
                  className={`px-2 ${traceViewMode === 'timeline' ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'}`}
                  onClick={() => setTraceViewMode('timeline')}
                >
                  时间线
                </button>
                <button
                  type="button"
                  aria-pressed={traceViewMode === 'skills'}
                  className={`border-l border-border px-2 ${traceViewMode === 'skills' ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'}`}
                  onClick={() => setTraceViewMode('skills')}
                >
                  技能变动
                </button>
              </div>
              <input
                data-testid="agent-run-trace-search"
                value={eventSearch}
                onChange={(event) => setEventSearch(event.target.value)}
                placeholder="搜索事件"
                aria-label="搜索运行事件"
                className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring sm:w-44 sm:flex-none"
              />
              <Select value={eventKind} onValueChange={(next) => setEventKind(next as 'all' | AgentTraceEventKind)}>
                <SelectTrigger size="sm" aria-label="按事件类型筛选" className="h-8 min-w-32 flex-1 text-xs sm:w-36 sm:flex-none"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部事件</SelectItem>
                  {eventKinds.map((kind) => <SelectItem key={kind} value={kind}>{traceKindLabel(kind as AgentTraceEventKind)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={eventCategory} onValueChange={(next) => setEventCategory(next as 'all' | AgentTraceCategory)}>
                <SelectTrigger size="sm" aria-label="按事件分类筛选" className="h-8 min-w-32 flex-1 text-xs sm:w-32 sm:flex-none"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部分类</SelectItem>
                  {eventCategories.map((category) => <SelectItem key={category} value={category}>{traceCategoryLabel(category)}</SelectItem>)}
                </SelectContent>
              </Select>
              {traceFiltersActive && (
                <Button
                  data-testid="agent-run-clear-trace-filters-inline"
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label="清除运行事件筛选"
                  onClick={clearTraceFilters}
                >
                  清除筛选
                </Button>
              )}
              <Button
                data-testid="agent-run-load-trace-events"
                type="button"
                size="sm"
                variant="outline"
                aria-label="加载当前运行的事件"
                onClick={() => loadEvents('initial')}
                disabled={loadingEvents}
              >
                {loadingEvents ? <Loader2 size={13} className="animate-spin" /> : <History size={13} />}
                加载事件
              </Button>
              {summaryQuery.error && (
                <Button
                  data-testid="agent-run-trace-summary-retry"
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-label="重新加载运行事件统计"
                  onClick={() => { void summaryQuery.refetch() }}
                  disabled={summaryQuery.isFetching}
                >
                  {summaryQuery.isFetching ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                  重试统计
                </Button>
              )}
              {traceHasUnloadedEvents && (
                <Button
                  data-testid="agent-run-load-all-trace-events"
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-label="加载当前运行的全部事件"
                  onClick={() => loadEvents('all')}
                  disabled={loadingEvents}
                >
                  {loadingEvents ? <Loader2 size={13} className="animate-spin" /> : <History size={13} />}
                  加载全部
                </Button>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <AgentRunGenerationArtifacts run={runQuery.data} />
            {traceDeepLinkMissing && (
              <p data-testid="agent-run-trace-deep-link-missing" role="alert" className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                这个运行里没有找到事件 {traceDeepLinkEventId}。如果刚切换运行，请先刷新或加载全部事件；如果仍然没有，说明这个事件不属于当前运行。
              </p>
            )}
            {traceLoadError && (
              <div data-testid="agent-run-trace-load-error" role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <div className="font-medium">运行事件加载失败</div>
                <p className="mt-1 break-words">{traceLoadError}</p>
                <Button
                  data-testid="agent-run-trace-retry"
                  type="button"
                  size="xs"
                  variant="outline"
                  className="mt-2 h-6 px-2 text-[10px]"
                  aria-label="重新加载运行事件"
                  onClick={() => loadEvents(events.length > 0 ? 'more' : 'initial')}
                  disabled={loadingEvents}
                >
                  {loadingEvents ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
                  重试
                </Button>
              </div>
            )}
            {traceViewMode === 'skills' && (
              <SkillTracePanel summary={skillTraceSummary} onFocusEvent={focusTraceEvent} />
            )}
            {traceViewMode === 'timeline' && events.length > 0 && (
              <DebugCoveragePanel
                summary={debugCoverageSummary}
                copied={debugReportCopied}
                copyError={debugReportCopyError}
                bundleCopied={debugBundleCopied}
                bundleCopyError={debugBundleCopyError}
                loadingAll={loadingEvents}
                bundleCopyDisabledReason={runQuery.data ? null : '运行基础信息加载中，暂不能复制调试包。'}
                onCopy={copyDebugReport}
                onCopyBundle={copyDebugBundle}
                onLoadAll={() => loadEvents('all')}
              />
            )}
            {traceViewMode === 'timeline' && attentionEvents.length > 0 && (
              <AttentionEventsPanel events={attentionEvents} onFocusEvent={focusTraceEvent} onShowAttentionEvents={showAttentionEvents} />
            )}
            {traceViewMode === 'timeline' && modelCallSummaries.length > 0 && (
              <ModelCallSummaryPanel summaries={modelCallSummaries} events={events} onFocusEvent={focusTraceEvent} />
            )}
            {traceViewMode === 'timeline' && visibleTraceViews.map(({ event, view }) => {
              const isLinkedEvent = event.id === traceDeepLinkEventId
              const isEventDataExpanded = expandedEventIds.has(event.id)
              const eventDataPanelId = `agent-trace-event-data-${event.id}`
              const eventDuration = formatTraceEventDuration(event)
              return (
                <div data-testid="agent-run-trace-event" id={`agent-trace-event-${event.id}`} key={event.id} className={`scroll-mt-4 rounded-md border px-3 py-2 text-xs ${isLinkedEvent ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border bg-background'}`}>
                  <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                    <span className="min-w-40 flex-1 font-medium text-foreground">{view.title}</span>
                    <div className="flex max-w-full flex-wrap items-center justify-end gap-1">
                      {isLinkedEvent && <Badge data-testid="agent-run-trace-linked-event" variant="secondary" className="text-[10px]">已定位</Badge>}
                      {eventCopyFeedback?.eventId === event.id && (
                        <Badge data-testid="agent-run-trace-copy-feedback" role="status" variant="secondary" className="text-[10px]">
                          {eventCopyFeedback.action === 'data' ? '数据已复制' : '链接已复制'}
                        </Badge>
                      )}
                      {event.data !== undefined && (
                        <Button
                          data-testid="agent-run-trace-event-details-toggle"
                          type="button"
                          size="xs"
                          variant="ghost"
                          className="h-5 px-1 text-[9px]"
                          aria-label={`${isEventDataExpanded ? '隐藏' : '查看'}${view.title}的原始数据`}
                          aria-expanded={isEventDataExpanded}
                          aria-controls={eventDataPanelId}
                          onClick={() => toggleEventDetails(event.id)}
                        >
                          {isEventDataExpanded ? '隐藏原始数据' : '原始数据'}
                        </Button>
                      )}
                      {event.data !== undefined && (
                        <Button
                          data-testid="agent-run-trace-event-data-copy"
                          type="button"
                          size="xs"
                          variant="ghost"
                          className="h-5 px-1 text-[9px]"
                          aria-label={`复制${view.title}的原始数据`}
                          onClick={() => copyEventData(event.id, event.data)}
                        >
                          <Copy size={9} />
                          复制数据
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        className="h-5 px-1 text-[9px]"
                        aria-label={`复制${view.title}的事件链接`}
                        onClick={() => copyEventLink(event.id)}
                      >
                        <Copy size={9} />
                        链接
                      </Button>
                      <Badge variant="outline" className="text-[10px]">{view.categoryLabel}</Badge>
                      <Badge variant="outline" className="text-[10px]">{traceEventStatusLabel(event.status)}</Badge>
                    </div>
                  </div>
                  {eventCopyError?.eventId === event.id && (
                    <p data-testid="agent-run-trace-copy-error" role="alert" className="mt-1 rounded border border-destructive/30 bg-destructive/10 px-2 py-1 text-[10px] text-destructive">
                      复制失败：{eventCopyError.message}
                    </p>
                  )}
                  <div className="mt-1 space-y-1">
                    <div className="flex flex-wrap gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
                      <span>{traceKindLabel(event.kind)}</span>
                      {event.toolName && <span title={event.toolName}>工具 {agentToolNameLabel(event.toolName)}</span>}
                      {event.stepId && <span>步骤 {event.stepId}</span>}
                      <span title={event.createdAt}>创建 {formatAgentRunTimestamp(event.createdAt)}</span>
                      {event.completedAt && <span title={event.completedAt}>完成 {formatAgentRunTimestamp(event.completedAt)}</span>}
                      {eventDuration && <span>耗时 {eventDuration}</span>}
                    </div>
                    {view.behavior && <TraceDetailLine label="行为" value={redactAgentTraceDebugText(view.behavior)} />}
                    {view.impact && <TraceDetailLine label="影响" value={redactAgentTraceDebugText(view.impact)} />}
                    {view.summary && <TraceDetailLine label="摘要" value={redactAgentTraceDebugText(view.summary)} />}
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
                                    <span className="min-w-0 break-all text-right text-foreground">{redactAgentTraceDebugText(item.value)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                    {view.promptDetail && (
                      <details data-testid="agent-run-prompt-detail" className="rounded border border-border/70 bg-muted/20 px-2 py-1" open>
                        <summary className="flex cursor-pointer list-none items-center gap-1 text-[10px] font-medium text-foreground marker:hidden">
                          <ChevronRight size={10} className="open:hidden" />
                          <ChevronDown size={10} className="hidden open:block" />
                          {view.promptDetail.title}
                        </summary>
                        <PromptDetail detail={view.promptDetail} />
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
                    {view.messageDetail && (
                      <details data-testid="agent-run-message-detail" className="rounded border border-border/70 bg-muted/20 px-2 py-1" open>
                        <summary className="flex cursor-pointer list-none items-center gap-1 text-[10px] font-medium text-foreground marker:hidden">
                          <ChevronRight size={10} className="open:hidden" />
                          <ChevronDown size={10} className="hidden open:block" />
                          {view.messageDetail.title}
                        </summary>
                        <MessageDetail detail={view.messageDetail} />
                      </details>
                    )}
                    {view.toolDetail && (
                      <details data-testid="agent-run-tool-detail" className="rounded border border-border/70 bg-muted/20 px-2 py-1" open>
                        <summary className="flex cursor-pointer list-none items-center gap-1 text-[10px] font-medium text-foreground marker:hidden">
                          <ChevronRight size={10} className="open:hidden" />
                          <ChevronDown size={10} className="hidden open:block" />
                          {view.toolDetail.title}
                        </summary>
                        <ToolDetail detail={view.toolDetail} />
                      </details>
                    )}
                  </div>
                  {event.data !== undefined && isEventDataExpanded && (
                    <div id={eventDataPanelId} className="mt-2 space-y-1">
                      <div data-testid="agent-run-trace-redaction-note" className="rounded border border-border/60 bg-muted/10 px-2 py-1 text-[10px] leading-relaxed text-muted-foreground">
                        原始数据展示和复制时会自动脱敏 authorization、cookie、API key、token、secret 等字段。
                      </div>
                      <pre data-testid="agent-run-trace-event-details" className="max-h-64 overflow-auto rounded border border-border/70 bg-muted/20 p-2 text-[10px] leading-relaxed text-muted-foreground">
                        {formatAgentTraceDebugData(event.data)}
                      </pre>
                    </div>
                  )}
                </div>
              )
            })}
            {events.length === 0 && <p className="text-xs text-muted-foreground">尚未加载运行事件。</p>}
            {traceViewMode === 'timeline' && events.length > 0 && visibleEvents.length === 0 && (
              <div data-testid="agent-run-trace-empty-state" className="rounded-md border border-border/70 bg-muted/10 px-3 py-2 text-xs">
                <div className="font-medium text-foreground">没有符合当前筛选条件的事件</div>
                <p className="mt-1 text-muted-foreground">
                  当前筛选只覆盖已加载的 {events.length} 个事件{typeof traceTotal === 'number' ? `，本次运行共 ${traceTotal} 个事件` : ''}。
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {traceHasUnloadedEvents && (
                    <Button
                      data-testid="agent-run-empty-load-all"
                      type="button"
                      size="xs"
                      variant="outline"
                      className="h-6 px-2 text-[10px]"
                      aria-label="加载全部运行事件后重新搜索"
                      onClick={() => loadEvents('all')}
                      disabled={loadingEvents}
                    >
                      {loadingEvents ? <Loader2 size={10} className="animate-spin" /> : <History size={10} />}
                      加载全部后再搜
                    </Button>
                  )}
                  {traceFiltersActive && (
                    <Button
                      data-testid="agent-run-clear-trace-filters"
                      type="button"
                      size="xs"
                      variant="ghost"
                      className="h-6 px-2 text-[10px]"
                      aria-label="清除运行事件筛选并返回事件列表"
                      onClick={clearTraceFilters}
                    >
                      清除筛选
                    </Button>
                  )}
                </div>
              </div>
            )}
            {traceViewMode === 'timeline' && hasMore && (
              <Button type="button" size="sm" variant="ghost" aria-label="加载更多运行事件" onClick={() => loadEvents('more')} disabled={loadingEvents}>
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
  const promptDetail = view.promptDetail
  const modelDetail = view.modelDetail
  const messageDetail = view.messageDetail
  const toolDetail = view.toolDetail
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
    ...view.contextGroups.flatMap((group) => [group.label, ...group.items.flatMap((item) => [item.label, redactAgentTraceDebugText(item.value)])]),
    ...(promptDetail?.skills ?? []),
    ...(promptDetail?.tools ?? []),
    ...((promptDetail?.layers ?? []).flatMap((metric) => [metric.label, metric.value])),
    ...((promptDetail?.contextLayers ?? []).flatMap((metric) => [metric.label, metric.value])),
    ...((promptDetail?.partGroups ?? []).flatMap((group) => [group.contextLayer, String(group.count), group.chars, ...group.parts.map((part) => part.id)])),
    ...((promptDetail?.parts ?? []).flatMap((part) => [part.id, part.layer, part.contextLayer, part.chars])),
    modelDetail?.request?.model,
    modelDetail?.request?.toolChoice,
    modelDetail?.request?.toolChoiceLabel,
    ...((modelDetail?.request?.headers ?? []).flatMap((header) => [header.name, formatModelHeaderValue(header)])),
    ...((modelDetail?.messageGroups ?? []).flatMap((group) => [group.role, group.roleLabel, String(group.count), String(group.contentChars)])),
    ...((modelDetail?.messages ?? []).flatMap((message) => [message.role, message.roleLabel, redactAgentTraceDebugText(message.content)])),
    ...((modelDetail?.tools ?? []).flatMap((tool) => [tool.name, tool.description, ...tool.parameterKeys])),
    modelDetail?.response?.status,
    modelDetail?.response?.contentType,
    ...((modelDetail?.response?.headers ?? []).flatMap((header) => [header.name, formatModelHeaderValue(header)])),
    modelDetail?.response?.content ? redactAgentTraceDebugText(modelDetail.response.content) : undefined,
    modelDetail?.response?.parsedId,
    modelDetail?.result?.finishReason,
    modelDetail?.result?.finishReasonLabel,
    messageDetail?.messageId,
    messageDetail?.source,
    messageDetail?.sourceLabel,
    messageDetail?.content ? redactAgentTraceDebugText(messageDetail.content) : undefined,
    toolDetail?.toolName,
    toolDetail?.source,
    toolDetail?.statusLabel,
    toolDetail?.summary ? redactAgentTraceDebugText(toolDetail.summary) : undefined,
    ...((toolDetail?.fields ?? []).flatMap((field) => [field.label, redactAgentTraceDebugText(field.value)])),
  ].map(searchTextToken).filter((value): value is string => !!value).join(' ').toLowerCase()
}

function searchTextToken(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined
  const text = String(value).trim()
  if (!text) return undefined
  return text.length > 2000 ? text.slice(0, 2000) : text
}

function formatAgentRunTimestamp(value: string | undefined): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)
}

function formatAgentRunDuration(start: string | undefined, end: string | undefined): string | undefined {
  if (!start || !end) return undefined
  const startMs = new Date(start).getTime()
  const endMs = new Date(end).getTime()
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return undefined
  return formatDurationMs(endMs - startMs)
}

function formatDurationMs(totalMs: number): string {
  if (totalMs < 1000) return `${totalMs}ms`
  const totalSeconds = Math.round(totalMs / 1000)
  if (totalSeconds < 60) return `${totalSeconds}s`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes < 60) return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const restMinutes = minutes % 60
  return restMinutes > 0 ? `${hours}h ${restMinutes}m` : `${hours}h`
}

function mergeTraceEvents(current: AgentTraceEvent[], incoming: AgentTraceEvent[]): AgentTraceEvent[] {
  const seen = new Set(current.map((event) => event.id))
  return [
    ...current,
    ...incoming.filter((event) => {
      if (seen.has(event.id)) return false
      seen.add(event.id)
      return true
    }),
  ]
}

function TraceDetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border/60 bg-background/80 px-2 py-1">
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-[10px] leading-relaxed text-foreground">{value}</div>
    </div>
  )
}

function SkillTracePanel({ summary, onFocusEvent }: { summary: AgentSkillTraceSummary; onFocusEvent: (eventId: string) => void }) {
  const latest = summary.timeline.at(-1)
  return (
    <div data-testid="agent-run-skill-trace-panel" className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <SkillTraceMetric label="当前激活" value={summary.currentActiveSkillIds.length} />
        <SkillTraceMetric label="显式加载" value={summary.currentLoadedSkillIds.length} />
        <SkillTraceMetric label="显式卸载" value={summary.currentUnloadedSkillIds.length} />
        <SkillTraceMetric label="目录可用" value={summary.currentAvailableSkillIds.length} />
      </div>
      {latest && (
        <div className="rounded-md border border-border bg-background px-3 py-2 text-xs">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-medium text-foreground">最新技能状态</div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">{formatAgentRunTimestamp(latest.createdAt)}</div>
            </div>
            <Button type="button" size="xs" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => onFocusEvent(latest.eventId)}>
              定位事件
            </Button>
          </div>
          <SkillIdList label="激活技能" ids={latest.activeSkillIds} />
          <SkillIdList label="显式加载" ids={latest.loadedSkillIds} />
          <SkillIdList label="显式卸载" ids={latest.unloadedSkillIds} />
        </div>
      )}
      {summary.timeline.length > 0 ? (
        <div className="space-y-1">
          {summary.timeline.map((entry) => (
            <button
              key={entry.eventId}
              type="button"
              data-testid="agent-run-skill-trace-event"
              className="block w-full rounded-md border border-border bg-background px-3 py-2 text-left text-xs hover:bg-muted/20"
              onClick={() => onFocusEvent(entry.eventId)}
            >
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-foreground">{entry.title}</span>
                <span className="text-[10px] text-muted-foreground">{formatAgentRunTimestamp(entry.createdAt)}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                <Badge variant="outline" className="text-[10px]">激活 {entry.activeSkillIds.length}</Badge>
                <Badge variant="outline" className="text-[10px]">加载 {entry.loadedSkillIds.length}</Badge>
                <Badge variant="outline" className="text-[10px]">卸载 {entry.unloadedSkillIds.length}</Badge>
                <Badge variant="outline" className="text-[10px]">可用 {entry.availableSkillIds.length}</Badge>
              </div>
              {entry.summary && <div className="mt-1 break-words text-[10px] text-muted-foreground">{redactAgentTraceDebugText(entry.summary)}</div>}
              <SkillIdList label="激活" ids={entry.activeSkillIds} compact />
            </button>
          ))}
        </div>
      ) : (
        <p data-testid="agent-run-skill-trace-empty" className="rounded-md border border-border/70 bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
          已加载事件里还没有技能状态事件。
        </p>
      )}
    </div>
  )
}

function SkillTraceMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-semibold leading-none text-foreground">{value}</div>
    </div>
  )
}

function SkillIdList({ label, ids, compact = false }: { label: string; ids: string[]; compact?: boolean }) {
  if (ids.length === 0) return null
  const visible = compact ? ids.slice(0, 8) : ids
  return (
    <div className="mt-2">
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {visible.map((id) => (
          <Badge key={id} variant="secondary" className="max-w-full truncate text-[10px]">{id}</Badge>
        ))}
        {visible.length < ids.length && <Badge variant="outline" className="text-[10px]">+{ids.length - visible.length}</Badge>}
      </div>
    </div>
  )
}

function DebugCoveragePanel({
  summary,
  copied,
  copyError,
  bundleCopied,
  bundleCopyError,
  loadingAll,
  bundleCopyDisabledReason,
  onCopy,
  onCopyBundle,
  onLoadAll,
}: {
  summary: AgentDebugCoverageSummary
  copied: boolean
  copyError: string | null
  bundleCopied: boolean
  bundleCopyError: string | null
  loadingAll: boolean
  bundleCopyDisabledReason: string | null
  onCopy: () => void
  onCopyBundle: () => void
  onLoadAll: () => void
}) {
  const bundleCopyDisabled = loadingAll || bundleCopyDisabledReason !== null
  const bundleCopyDisabledReasonId = 'agent-run-debug-bundle-copy-disabled-reason'
  return (
    <section data-testid="agent-run-debug-coverage" className="rounded-md border border-border bg-muted/10 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-medium text-foreground">调试覆盖</div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">当前页面已加载的可调试信息</div>
        </div>
        <div className="flex items-center gap-1">
          {summary.issues.length > 0 ? <Badge variant="secondary" className="text-[10px]">需补全</Badge> : <Badge variant="outline" className="text-[10px]">信息完整</Badge>}
          {summary.hasUnloadedTrace && (
            <Button
              data-testid="agent-run-debug-load-all"
              type="button"
              size="xs"
              variant="outline"
              className="h-6 px-2 text-[10px]"
              aria-label="加载全部运行事件用于调试覆盖统计"
              onClick={onLoadAll}
              disabled={loadingAll}
            >
              {loadingAll ? <Loader2 size={10} className="animate-spin" /> : <History size={10} />}
              加载全部事件
            </Button>
          )}
          <Button
            data-testid="agent-run-debug-report-copy"
            type="button"
            size="xs"
            variant="ghost"
            className="h-6 px-2 text-[10px]"
            aria-label="复制 AgentRun 调试摘要"
            onClick={onCopy}
          >
            <Copy size={10} />
            {copied ? '已复制' : '复制摘要'}
          </Button>
          <Button
            data-testid="agent-run-debug-bundle-copy"
            type="button"
            size="xs"
            variant="ghost"
            className="h-6 px-2 text-[10px]"
            aria-label="复制脱敏 AgentRun 调试包"
            onClick={onCopyBundle}
            disabled={bundleCopyDisabled}
            title={bundleCopyDisabledReason ?? undefined}
            aria-describedby={bundleCopyDisabledReason ? bundleCopyDisabledReasonId : undefined}
          >
            {loadingAll ? <Loader2 size={10} className="animate-spin" /> : <Copy size={10} />}
            {loadingAll ? '加载中' : bundleCopyDisabledReason ? '等待运行信息' : bundleCopied ? '已复制' : '复制调试包'}
          </Button>
        </div>
      </div>
      <div className="mt-2 grid gap-1 sm:grid-cols-8">
        <DebugCoverageMetric label="事件" value={summary.loadedLabel} />
        <DebugCoverageMetric label="模型调用" value={summary.modelCallsLabel} />
        <DebugCoverageMetric label="HTTP 响应" value={summary.httpResponsesLabel} />
        <DebugCoverageMetric label="请求负载" value={summary.requestPayloadsLabel} />
        <DebugCoverageMetric label="响应正文" value={summary.httpResponseBodiesLabel} />
        <DebugCoverageMetric label="上下文详情" value={summary.promptDetailsLabel} />
        <DebugCoverageMetric label="历史写入" value={summary.messageWritesLabel} />
        <DebugCoverageMetric label="工具详情" value={summary.toolDetailsLabel} />
      </div>
      <div data-testid="agent-run-debug-bundle-contract" className="mt-2 flex flex-wrap items-center gap-1 rounded border border-border/60 bg-background/80 px-2 py-1 text-[10px] text-muted-foreground">
        <span className="font-medium text-foreground">调试包</span>
        <Badge variant="outline" className="text-[9px]">{DEBUG_BUNDLE_SCHEMA}</Badge>
        <span>{DEBUG_BUNDLE_CAPABILITIES.length} 项能力</span>
        <span>脱敏复制</span>
      </div>
      <details data-testid="agent-run-debug-field-guide" className="mt-2 rounded border border-border/60 bg-background/80 px-2 py-1 text-[10px]">
        <summary className="cursor-pointer font-medium text-foreground">调试口径</summary>
        <div className="mt-1 grid gap-1 text-muted-foreground sm:grid-cols-2">
          {AGENT_DEBUG_FIELD_GUIDE.map((item) => (
            <div key={item.id} className="rounded bg-muted/20 px-2 py-1">
              <span className="font-medium text-foreground">{item.label}</span>：{item.description}
            </div>
          ))}
        </div>
      </details>
      <DebugReadinessChecklist items={buildDebugReadinessChecklist(summary)} />
      {summary.issues.length > 0 && (
        <div className="mt-2 grid gap-1 text-[10px] text-amber-700 dark:text-amber-300">
          {summary.issues.map((issue) => <div key={issue} className="rounded bg-amber-500/10 px-2 py-1">{issue}</div>)}
        </div>
      )}
      {copyError && (
        <div data-testid="agent-run-debug-report-copy-error" role="alert" className="mt-2 rounded bg-destructive/10 px-2 py-1 text-[10px] text-destructive">
          调试摘要复制失败：{copyError}
        </div>
      )}
      {copied && !copyError && (
        <div data-testid="agent-run-debug-report-copy-feedback" role="status" className="mt-2 rounded bg-muted/20 px-2 py-1 text-[10px] text-muted-foreground">
          调试摘要已复制
        </div>
      )}
      {bundleCopyError && (
        <div data-testid="agent-run-debug-bundle-copy-error" role="alert" className="mt-2 rounded bg-destructive/10 px-2 py-1 text-[10px] text-destructive">
          调试包复制失败：{bundleCopyError}
        </div>
      )}
      {bundleCopyDisabledReason && !bundleCopyError && (
        <div id={bundleCopyDisabledReasonId} data-testid="agent-run-debug-bundle-copy-disabled-reason" role="status" className="mt-2 rounded bg-muted/20 px-2 py-1 text-[10px] text-muted-foreground">
          {bundleCopyDisabledReason}
        </div>
      )}
      {bundleCopied && !bundleCopyError && !bundleCopyDisabledReason && (
        <div data-testid="agent-run-debug-bundle-copy-feedback" role="status" className="mt-2 rounded bg-muted/20 px-2 py-1 text-[10px] text-muted-foreground">
          脱敏调试包已复制。
        </div>
      )}
    </section>
  )
}

function DebugReadinessChecklist({ items }: { items: AgentDebugReadinessItem[] }) {
  return (
    <div data-testid="agent-run-debug-readiness" className="mt-2 rounded border border-border/60 bg-background/80 px-2 py-1">
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">诊断清单</div>
      <div className="mt-1 grid gap-1 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item.id} data-testid="agent-run-debug-readiness-item" className="flex min-w-0 items-start gap-2 rounded bg-muted/20 px-2 py-1 text-[10px]">
            <Badge variant={item.status === 'ok' ? 'outline' : 'secondary'} className="mt-0.5 shrink-0 text-[9px]">
              {item.status === 'ok' ? '已满足' : '需补全'}
            </Badge>
            <div className="min-w-0">
              <div className="font-medium text-foreground">{item.label}</div>
              <div className="mt-0.5 break-words text-muted-foreground">{item.detail}</div>
              <div className="mt-0.5 break-words text-muted-foreground">下一步：{item.action}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function DebugCoverageMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border/60 bg-background/90 px-2 py-1">
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-xs font-medium text-foreground">{value}</div>
    </div>
  )
}

function AttentionEventsPanel({ events, onFocusEvent, onShowAttentionEvents }: { events: AgentDebugAttentionEvent[]; onFocusEvent: (eventId: string) => void; onShowAttentionEvents: () => void }) {
  return (
    <section data-testid="agent-run-attention-events" className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-medium text-foreground">异常/需关注事件</div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">失败、阻塞、审批和输入等待会集中显示在这里</div>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Badge variant="secondary" className="text-[10px]">{events.length} 个</Badge>
          <Button
            type="button"
            size="xs"
            variant="outline"
            className="h-6 px-2 text-[10px]"
            aria-label="只查看需关注运行事件"
            onClick={onShowAttentionEvents}
          >
            只看需关注
          </Button>
        </div>
      </div>
      <div className="mt-2 grid gap-1">
        {events.slice(0, 8).map((event) => (
          <div key={event.eventId} data-testid="agent-run-attention-event" className="rounded border border-amber-500/30 bg-background/90 px-2 py-1 text-[10px]">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1">
                  <Badge variant="secondary" className="text-[9px]">{event.statusLabel}</Badge>
                  <span className="font-medium text-foreground">{event.title}</span>
                  <span className="text-muted-foreground">{event.kindLabel}</span>
                </div>
                {event.summary && <div className="mt-0.5 break-words text-muted-foreground">{event.summary}</div>}
              </div>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                className="h-5 px-1 text-[9px]"
                aria-label={`定位需关注事件 ${event.title}`}
                onClick={() => onFocusEvent(event.eventId)}
              >
                定位
              </Button>
            </div>
            <div className="mt-1 grid gap-0.5 text-muted-foreground">
              {event.behavior && <TraceDetailLine label="行为" value={event.behavior} />}
              {event.impact && <TraceDetailLine label="影响" value={event.impact} />}
              {event.error && <TraceDetailLine label="错误" value={event.error} />}
            </div>
          </div>
        ))}
      </div>
      {events.length > 8 && (
        <div className="mt-1 text-[10px] text-muted-foreground">还有 {events.length - 8} 个需关注事件，请用事件筛选查看。</div>
      )}
    </section>
  )
}

function ModelCallSummaryPanel({ summaries, events, onFocusEvent }: { summaries: AgentModelCallSummary[]; events: AgentTraceEvent[]; onFocusEvent: (eventId: string) => void }) {
  return (
    <section data-testid="agent-run-model-call-summary" className="rounded-md border border-border bg-muted/10 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-medium text-foreground">大模型调用总览</div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">按已加载运行事件归并请求、响应、历史写入和工具调用</div>
        </div>
        <Badge variant="outline" className="text-[10px]">{summaries.length} 次调用</Badge>
      </div>
      <div className="mt-2 grid gap-1.5">
        {summaries.map((summary) => {
          const debugContext = buildModelCallDebugContext({ call: summary, events })
          return (
            <details key={summary.id} data-testid="agent-run-model-call-summary-item" className="rounded border border-border/70 bg-background px-2 py-1.5 text-[10px]">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-1 marker:hidden">
                <ChevronRight size={10} className="open:hidden" />
                <ChevronDown size={10} className="hidden open:block" />
                <div className="flex min-w-0 flex-wrap items-center gap-1">
                  <span className="font-medium text-foreground">{summary.label}</span>
                  <Badge variant={summary.status === 'complete' ? 'outline' : 'secondary'} className="text-[9px]">{summary.statusLabel}</Badge>
                  {summary.model && <span className="truncate text-muted-foreground">模型 {summary.model}</span>}
                </div>
              </summary>
              <div className="mt-1 flex shrink-0 flex-wrap gap-1">
                {summary.requestEventId && (
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    className="h-5 px-1 text-[9px]"
                    aria-label={`定位${summary.label}的模型请求事件`}
                    onClick={() => onFocusEvent(summary.requestEventId!)}
                  >
                    请求
                  </Button>
                )}
                {summary.responseEventId && (
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    className="h-5 px-1 text-[9px]"
                    aria-label={`定位${summary.label}的模型响应事件`}
                    onClick={() => onFocusEvent(summary.responseEventId!)}
                  >
                    响应
                  </Button>
                )}
                {summary.resultEventId && (
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    className="h-5 px-1 text-[9px]"
                    aria-label={`定位${summary.label}的模型结果事件`}
                    onClick={() => onFocusEvent(summary.resultEventId!)}
                  >
                    结果
                  </Button>
                )}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-muted-foreground">
                {summary.messageCount && <span>消息 {summary.messageCount}</span>}
                {summary.toolCount && <span>工具定义 {summary.toolCount}</span>}
                {debugContext.toolCalls.length > 0 && <span>工具调用 {debugContext.toolCalls.length}</span>}
                {debugContext.messageWrites.length > 0 && <span>历史写入 {debugContext.messageWrites.length}</span>}
                {summary.httpStatus && <span>HTTP {summary.httpStatus}</span>}
                {summary.latency && <span>{summary.latency}</span>}
                {summary.status !== 'result_only' && <span>{summary.hasRequestPayload ? '请求负载已存' : '请求负载缺失'}</span>}
                {summary.responseEventId && <span>{summary.hasResponseBody ? '响应正文已存' : '响应正文缺失'}</span>}
                {summary.retryCount && <span>重试 {summary.retryCount} 次</span>}
                {summary.error && <span className="text-destructive">错误 {summary.error}</span>}
                {summary.responseChars && <span>回复 {summary.responseChars} 字符</span>}
                {summary.inputTokens && <span>请求 {summary.inputTokens} token</span>}
                {summary.outputTokens && <span>回复 {summary.outputTokens} token</span>}
              </div>
              {summary.issue && <div className="mt-1 rounded bg-amber-500/10 px-2 py-1 text-amber-700 dark:text-amber-300">{summary.issue}</div>}
              {debugContext.issue && <div className="mt-1 rounded bg-amber-500/10 px-2 py-1 text-amber-700 dark:text-amber-300">{debugContext.issue}</div>}
              <ModelCallInlineDebug summary={summary} context={debugContext} onFocusEvent={onFocusEvent} />
            </details>
          )
        })}
      </div>
    </section>
  )
}

function ModelCallInlineDebug({
  summary,
  context,
  onFocusEvent,
}: {
  summary: AgentModelCallSummary
  context: ReturnType<typeof buildModelCallDebugContext>
  onFocusEvent: (eventId: string) => void
}) {
  const modelDetails = context.modelEvents
    .map((event) => ({ event, detail: agentTraceView(event).modelDetail }))
    .filter((entry): entry is { event: AgentTraceEvent; detail: NonNullable<ReturnType<typeof agentTraceView>['modelDetail']> } => !!entry.detail)
  return (
    <div data-testid="agent-run-model-call-inline-debug" className="mt-2 space-y-1 border-t border-border/60 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[10px] font-medium text-foreground">本轮详情</div>
        <div className="text-[9px] text-muted-foreground">关联方式：{context.correlationLabel}</div>
      </div>
      {modelDetails.length > 0 && (
        <div className="grid gap-1">
          {modelDetails.map(({ event, detail }) => (
            <details key={event.id} data-testid="agent-run-model-call-inline-http-detail" className="rounded border border-border/60 bg-muted/10 px-2 py-1" open={event.id === summary.requestEventId || event.id === summary.responseEventId}>
              <summary className="flex cursor-pointer list-none items-center gap-1 marker:hidden">
                <ChevronRight size={10} className="open:hidden" />
                <ChevronDown size={10} className="hidden open:block" />
                <span className="font-medium text-foreground">{detail.title}</span>
              </summary>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                className="mt-1 h-5 px-1 text-[9px]"
                aria-label={`定位${summary.label}的${detail.title}事件`}
                onClick={() => onFocusEvent(event.id)}
              >
                定位
              </Button>
              <ModelCallDetail detail={detail} />
            </details>
          ))}
        </div>
      )}
      <ModelCallRelatedEvents title="历史写入" emptyText="没有找到同轮 assistant 历史写入。" events={context.messageWrites} onFocusEvent={onFocusEvent} />
      <ModelCallRelatedEvents title="工具调用" emptyText="没有找到同轮工具调用。" events={context.toolCalls} onFocusEvent={onFocusEvent} />
    </div>
  )
}

function ModelCallRelatedEvents({ title, emptyText, events, onFocusEvent }: { title: string; emptyText: string; events: AgentTraceEvent[]; onFocusEvent: (eventId: string) => void }) {
  return (
    <div data-testid={`agent-run-model-call-related-${title}`} className="rounded border border-border/60 bg-muted/10 px-2 py-1">
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium text-foreground">{title}</div>
        <Badge variant="outline" className="text-[9px]">{events.length}</Badge>
      </div>
      {events.length === 0 ? (
        <div className="mt-1 text-muted-foreground">{emptyText}</div>
      ) : (
        <div className="mt-1 grid gap-1">
          {events.map((event) => {
            const view = agentTraceView(event)
            return (
              <div key={event.id} className="rounded bg-background/90 px-2 py-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-foreground">{view.title}</div>
                    {view.summary && <div className="mt-0.5 break-words text-muted-foreground">{redactAgentTraceDebugText(view.summary)}</div>}
                  </div>
                  <Button type="button" size="xs" variant="ghost" className="h-5 px-1 text-[9px]" onClick={() => onFocusEvent(event.id)}>
                    定位
                  </Button>
                </div>
                {view.messageDetail && <MessageDetail detail={view.messageDetail} />}
                {view.toolDetail && <ToolDetail detail={view.toolDetail} />}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function PromptDetail({ detail }: { detail: NonNullable<ReturnType<typeof agentTraceView>['promptDetail']> }) {
  return (
    <div className="mt-1 space-y-1">
      <div className="grid gap-0.5 rounded border border-border/60 bg-background/90 px-2 py-1 text-[10px]">
        <div className="font-medium text-foreground">上下文包</div>
        <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-muted-foreground">
          {detail.totalChars && <span>{detail.totalChars} 字符</span>}
          {detail.messageCount && <span>{detail.messageCount} 条消息</span>}
          {detail.systemMessageCount && <span>{detail.systemMessageCount} 条系统消息</span>}
          {detail.blockedToolCount && <span>{detail.blockedToolCount} 个工具被阻塞</span>}
        </div>
      </div>
      {(detail.layers.length > 0 || detail.contextLayers.length > 0) && (
        <div className="grid gap-1 sm:grid-cols-2">
          {detail.layers.length > 0 && <PromptMetricList title="上下文层级" metrics={detail.layers} />}
          {detail.contextLayers.length > 0 && <PromptMetricList title="上下文来源" metrics={detail.contextLayers} />}
        </div>
      )}
      {(detail.skills.length > 0 || detail.tools.length > 0) && (
        <div className="grid gap-1 sm:grid-cols-2">
          {detail.skills.length > 0 && <PromptNameList title="激活技能" values={detail.skills} />}
          {detail.tools.length > 0 && <PromptNameList title="可用工具" values={detail.tools} />}
        </div>
      )}
      {detail.partGroups.length > 0 && (
        <div data-testid="agent-run-prompt-part-groups" className="rounded border border-border/60 bg-background/90 px-2 py-1">
          <div className="text-[9px] uppercase tracking-wide text-muted-foreground">片段来源分组</div>
          <div className="mt-1 grid gap-1 sm:grid-cols-2">
            {detail.partGroups.map((group) => (
              <div key={group.contextLayer} className="rounded bg-muted/20 px-2 py-1">
                <div className="flex items-center justify-between gap-2 text-[10px]">
                  <span className="font-medium text-foreground">{group.contextLayer}</span>
                  <span className="text-muted-foreground">{group.count} 段 / {group.chars} 字符</span>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {group.parts.slice(0, 6).map((part) => <Badge key={`${group.contextLayer}:${part.id}`} variant="outline" className="max-w-full truncate text-[9px]">{part.id}</Badge>)}
                  {group.parts.length > 6 && <Badge variant="secondary" className="text-[9px]">+{group.parts.length - 6}</Badge>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {detail.parts.length > 0 && (
        <div data-testid="agent-run-prompt-parts" className="rounded border border-border/60 bg-background/90 px-2 py-1">
          <div className="text-[9px] uppercase tracking-wide text-muted-foreground">上下文片段</div>
          <div className="mt-1 grid gap-0.5">
            {detail.parts.map((part) => (
              <div key={`${part.id}:${part.layer}:${part.contextLayer}`} className="flex min-w-0 items-start justify-between gap-2 text-[10px]">
                <span className="min-w-0 truncate text-foreground">{part.id}</span>
                <span className="shrink-0 text-right text-muted-foreground">
                  {[part.layer, part.contextLayer, part.chars ? `${part.chars} 字符` : undefined].filter(Boolean).join(' / ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function PromptMetricList({ title, metrics }: { title: string; metrics: Array<{ label: string; value: string }> }) {
  return (
    <div className="rounded border border-border/60 bg-background/90 px-2 py-1">
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className="mt-1 grid gap-0.5">
        {metrics.map((metric) => (
          <div key={`${title}:${metric.label}`} className="flex items-center justify-between gap-2 text-[10px]">
            <span className="text-muted-foreground">{metric.label}</span>
            <span className="font-medium text-foreground">{metric.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function PromptNameList({ title, values }: { title: string; values: string[] }) {
  return (
    <div className="rounded border border-border/60 bg-background/90 px-2 py-1">
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {values.slice(0, 12).map((value) => <Badge key={value} variant="outline" className="max-w-full truncate text-[9px]">{value}</Badge>)}
        {values.length > 12 && <Badge variant="secondary" className="text-[9px]">+{values.length - 12}</Badge>}
      </div>
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
      {detail.request && (
        <ModelDetailSection title="HTTP 请求" testId="agent-run-model-http-request" defaultOpen>
          <div className="mt-1 grid gap-0.5 text-[10px]">
            {detail.request.method && <ModelMetaRow label="方法" value={detail.request.method} />}
            {detail.request.url && <ModelMetaRow label="地址" value={redactAgentTraceDebugText(detail.request.url)} />}
            {detail.request.model && <ModelMetaRow label="模型" value={detail.request.model} />}
            {detail.request.headers.length > 0 && <ModelMetaRow label="请求头" value={`${detail.request.headers.length} 个`} />}
            {detail.request.messageCount && <ModelMetaRow label="消息" value={`${detail.request.messageCount} 条`} />}
            {detail.request.toolCount && <ModelMetaRow label="工具定义" value={`${detail.request.toolCount} 个`} />}
            {detail.request.toolChoiceLabel && <ModelMetaRow label="工具选择" value={detail.request.toolChoiceLabel} />}
            {detail.request.stream && <ModelMetaRow label="流式返回" value={detail.request.stream} />}
          </div>
          {detail.request.headers.length > 0 && (
            <details data-testid="agent-run-model-request-headers" className="mt-1 rounded bg-muted/20 px-2 py-1">
              <summary className="cursor-pointer text-[10px] font-medium text-foreground">请求头</summary>
              <div className="mt-1 grid gap-0.5">
                {detail.request.headers.map((header) => (
                  <ModelMetaRow key={header.name} label={header.name} value={formatModelHeaderValue(header)} />
                ))}
              </div>
            </details>
          )}
          {detail.request.payload !== undefined && (
            <details data-testid="agent-run-model-request-payload" className="mt-1 rounded bg-muted/20 px-2 py-1">
              <summary className="cursor-pointer text-[10px] font-medium text-foreground">完整请求负载</summary>
              <pre className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap break-words text-[10px] leading-relaxed text-foreground">
                {formatAgentTraceDebugData(detail.request.payload)}
              </pre>
            </details>
          )}
        </ModelDetailSection>
      )}
      {detail.messages.length > 0 && (
        <ModelDetailSection title={`请求消息 (${detail.messages.length})`} testId="agent-run-model-request-messages">
          {detail.messageGroups.length > 0 && (
            <div data-testid="agent-run-model-request-message-groups" className="mb-1 grid gap-1 sm:grid-cols-2">
              {detail.messageGroups.map((group) => (
                <div key={group.role} className="rounded border border-border/60 bg-background/90 px-2 py-1">
                  <div className="flex items-center justify-between gap-2 text-[10px]">
                    <span className="font-medium text-foreground">{group.roleLabel}</span>
                    <span className="text-muted-foreground">{group.count} 条 / {group.contentChars} 字符</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {group.messages.slice(0, 6).map((message) => (
                      <Badge key={`${group.role}:${message.index}`} variant="outline" className="text-[9px]">
                        #{message.index}
                      </Badge>
                    ))}
                    {group.messages.length > 6 && <Badge variant="secondary" className="text-[9px]">+{group.messages.length - 6}</Badge>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {detail.messages.map((message) => (
            <div key={`${message.index}:${message.role}`} className="rounded border border-border/60 bg-background/90 px-2 py-1">
              <div className="flex items-center justify-between gap-2 text-[10px]">
                <span className="font-medium text-foreground">{message.index}. {message.roleLabel}</span>
                <span className="text-muted-foreground">{message.contentChars} 字符</span>
              </div>
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/20 p-2 text-[10px] leading-relaxed text-foreground">
                {redactAgentTraceDebugText(message.content)}
              </pre>
            </div>
          ))}
        </ModelDetailSection>
      )}
      {detail.tools.length > 0 && (
        <ModelDetailSection title={`工具定义 (${detail.tools.length})`} testId="agent-run-model-request-tools">
          {detail.tools.map((tool) => (
            <div key={`${tool.index}:${tool.name}`} className="rounded border border-border/60 bg-background/90 px-2 py-1 text-[10px]">
              <div className="font-medium text-foreground">{tool.index}. {tool.name}</div>
              {tool.description && <div className="mt-0.5 text-muted-foreground">{tool.description}</div>}
              {tool.parameterKeys.length > 0 && <div className="mt-0.5 text-muted-foreground">参数：{tool.parameterKeys.join(', ')}</div>}
            </div>
          ))}
        </ModelDetailSection>
      )}
      {detail.response && (
        <ModelDetailSection title="HTTP 响应" testId="agent-run-model-http-response" defaultOpen>
          <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
            {detail.response.status && <span>状态 {detail.response.status}</span>}
            {detail.response.contentType && <span>{detail.response.contentType}</span>}
            {detail.response.headers.length > 0 && <span>响应头 {detail.response.headers.length}</span>}
            {detail.response.parsedId && <span>ID {detail.response.parsedId}</span>}
          </div>
          {detail.response.headers.length > 0 && (
            <details data-testid="agent-run-model-response-headers" className="mt-1 rounded bg-muted/20 px-2 py-1">
              <summary className="cursor-pointer text-[10px] font-medium text-foreground">响应头</summary>
              <div className="mt-1 grid gap-0.5">
                {detail.response.headers.map((header) => (
                  <ModelMetaRow key={header.name} label={header.name} value={formatModelHeaderValue(header)} />
                ))}
              </div>
            </details>
          )}
          {detail.response.content && (
            <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/20 p-2 text-[10px] leading-relaxed text-foreground">
              {redactAgentTraceDebugText(detail.response.content)}
            </pre>
          )}
          {detail.response.bodyText && detail.response.bodyText !== detail.response.content && (
            <details className="mt-1 rounded bg-muted/20 px-2 py-1">
              <summary className="cursor-pointer text-[10px] font-medium text-foreground">原始响应正文</summary>
              <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words text-[10px] leading-relaxed text-foreground">
                {redactAgentTraceDebugText(detail.response.bodyText)}
              </pre>
            </details>
          )}
          {!detail.response.content && !detail.response.bodyText && (
            <div className="mt-1 rounded bg-muted/20 px-2 py-1 text-[10px] leading-relaxed text-muted-foreground">
              这条事件没有 HTTP 响应正文；如果是流式调用，请查看模型增量事件或最终的历史写入事件。
            </div>
          )}
        </ModelDetailSection>
      )}
      {detail.result && (
        <ModelDetailSection title="模型结果" testId="agent-run-model-result" defaultOpen>
          <div className="flex flex-wrap gap-2 text-muted-foreground">
            {detail.result.finishReasonLabel && <span>结束原因 {detail.result.finishReasonLabel}</span>}
            {detail.result.contentChars && <span>回复 {detail.result.contentChars} 字符</span>}
            {detail.result.inputTokens && <span>请求 {detail.result.inputTokens} token</span>}
            {detail.result.outputTokens && <span>回复 {detail.result.outputTokens} token</span>}
            {detail.result.toolCalls && <span>工具调用 {detail.result.toolCalls}</span>}
          </div>
        </ModelDetailSection>
      )}
    </div>
  )
}

function ModelDetailSection({
  title,
  testId,
  defaultOpen = false,
  children,
}: {
  title: string
  testId: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  return (
    <details data-testid={testId} className="rounded border border-border/60 bg-background/90 px-2 py-1" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center gap-1 text-[10px] font-medium text-foreground marker:hidden">
        <ChevronRight size={10} className="open:hidden" />
        <ChevronDown size={10} className="hidden open:block" />
        {title}
      </summary>
      <div className="mt-1 space-y-1 text-[10px]">
        {children}
      </div>
    </details>
  )
}

function formatModelHeaderValue(header: { name: string; value: string }) {
  return /authorization|cookie|api[-_]?key|token|secret/i.test(header.name)
    ? '[已脱敏]'
    : redactAgentTraceDebugText(header.value)
}

function ModelMetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-2">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-all text-right text-foreground">{value}</span>
    </div>
  )
}

function MessageDetail({ detail }: { detail: NonNullable<ReturnType<typeof agentTraceView>['messageDetail']> }) {
  return (
    <div className="mt-1 rounded border border-border/60 bg-background/90 px-2 py-1">
      <div className="text-[10px] font-medium text-foreground">{detail.title}</div>
      <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
        {detail.messageId && <span>ID {detail.messageId}</span>}
        {detail.sourceLabel && <span>来源 {detail.sourceLabel}</span>}
        <span>{detail.contentChars} 字符</span>
      </div>
      <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/20 p-2 text-[10px] leading-relaxed text-foreground">
        {redactAgentTraceDebugText(detail.content)}
      </pre>
    </div>
  )
}

function ToolDetail({ detail }: { detail: NonNullable<ReturnType<typeof agentTraceView>['toolDetail']> }) {
  return (
    <div className="mt-1 space-y-1">
      <div className="grid gap-0.5 rounded border border-border/60 bg-background/90 px-2 py-1 text-[10px]">
        <div className="font-medium text-foreground">{detail.title}</div>
        {detail.toolName && <ModelMetaRow label="工具" value={detail.toolName} />}
        <ModelMetaRow label="状态" value={detail.statusLabel} />
        {detail.source && <ModelMetaRow label="来源" value={detail.source} />}
        {detail.sandboxed && <ModelMetaRow label="沙箱" value={detail.sandboxed} />}
        {detail.duration && <ModelMetaRow label="耗时" value={detail.duration} />}
      </div>
      {detail.summary && (
        <div className="rounded border border-border/60 bg-background/90 px-2 py-1 text-[10px] leading-relaxed text-foreground">
          {redactAgentTraceDebugText(detail.summary)}
        </div>
      )}
      {detail.fields.length > 0 && (
        <div className="rounded border border-border/60 bg-background/90 px-2 py-1">
          <div className="text-[9px] uppercase tracking-wide text-muted-foreground">结果字段</div>
          <div className="mt-1 grid gap-0.5">
            {detail.fields.map((field) => (
              <ModelMetaRow
                key={field.label}
                label={field.label}
                value={field.sensitive ? '[已脱敏]' : redactAgentTraceDebugText(field.value)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function debugBundleRunSnapshot(run: AgentRun | undefined): Omit<AgentRun, 'traceEvents'> | undefined {
  if (!run) return undefined
  const { traceEvents: _traceEvents, ...snapshot } = run
  return snapshot
}

function debugBundleRunSummary(run: AgentRun | undefined) {
  if (!run) return undefined
  const terminalAt = run.completedAt ?? run.failedAt ?? run.cancelledAt
  const pendingApprovals = run.pendingApprovals?.filter((approval) => approval.status === 'pending').length ?? 0
  const pendingInputs = run.pendingInputRequests?.filter((request) => request.status === 'pending').length ?? 0
  const role = run.role ?? 'unknown'
  return {
    status: run.status,
    statusLabel: runStatusLabel(run.status),
    role,
    roleLabel: run.role ? runRoleLabel(run.role) : '未知',
    createdAt: run.createdAt,
    startedAt: run.startedAt,
    terminalAt,
    duration: formatAgentRunDuration(run.startedAt ?? run.createdAt, terminalAt),
    progress: run.progress,
    error: run.error,
    warningCount: run.warnings?.length ?? 0,
    pendingApprovals,
    pendingInputs,
  }
}

function debugBundlePromptDetails(events: AgentTraceEvent[]) {
  return events.flatMap((event) => {
    const detail = agentTraceView(event).promptDetail
    if (!detail) return []
    return [{
      eventId: event.id,
      title: detail.title,
      totalChars: detail.totalChars,
      messageCount: detail.messageCount,
      systemMessageCount: detail.systemMessageCount,
      blockedToolCount: detail.blockedToolCount,
      skills: detail.skills,
      tools: detail.tools,
      layers: detail.layers,
      contextLayers: detail.contextLayers,
      partGroups: detail.partGroups.map((group) => ({
        contextLayer: group.contextLayer,
        count: group.count,
        chars: group.chars,
        partIds: group.parts.map((part) => part.id),
      })),
      parts: detail.parts,
    }]
  })
}

function debugBundleMessageWrites(events: AgentTraceEvent[]) {
  return events.flatMap((event) => {
    const detail = agentTraceView(event).messageDetail
    if (!detail) return []
    const content = redactAgentTraceDebugText(detail.content)
    return [{
      eventId: event.id,
      messageId: detail.messageId,
      source: detail.source,
      sourceLabel: detail.sourceLabel,
      contentChars: detail.contentChars,
      contentPreview: content.length > 240 ? `${content.slice(0, 237)}...` : content,
    }]
  })
}

function debugBundleModelCallContexts(modelCalls: AgentModelCallSummary[], events: AgentTraceEvent[]) {
  return buildModelCallDebugContexts({ modelCalls, events }).map((context) => ({
    callId: context.call.id,
    label: context.call.label,
    status: context.call.status,
    statusLabel: context.call.statusLabel,
    correlationLabel: context.correlationLabel,
    issue: context.issue,
    requestEventId: context.call.requestEventId,
    responseEventId: context.call.responseEventId,
    resultEventId: context.call.resultEventId,
    modelEventIds: context.modelEvents.map((event) => event.id),
    toolCalls: context.toolCalls.map((event) => {
      const detail = agentTraceView(event).toolDetail
      return {
        eventId: event.id,
        toolName: detail?.toolName ?? event.toolName,
        status: event.status,
        statusLabel: detail?.statusLabel,
        summary: detail?.summary ? redactAgentTraceDebugText(detail.summary) : event.summary ? redactAgentTraceDebugText(event.summary) : undefined,
      }
    }),
    messageWrites: context.messageWrites.map((event) => {
      const detail = agentTraceView(event).messageDetail
      const content = detail?.content ? redactAgentTraceDebugText(detail.content) : undefined
      return {
        eventId: event.id,
        messageId: detail?.messageId,
        source: detail?.source,
        sourceLabel: detail?.sourceLabel,
        contentChars: detail?.contentChars,
        contentPreview: content && content.length > 160 ? `${content.slice(0, 157)}...` : content,
      }
    }),
  }))
}

function debugBundleToolCalls(events: AgentTraceEvent[]) {
  return events.flatMap((event) => {
    if (event.kind !== 'tool_call') return []
    const data = isRecord(event.data) ? event.data : {}
    const durationMs = traceEventDurationMs(event, data)
    const summary = event.summary ? redactAgentTraceDebugText(event.summary) : undefined
    return [{
      eventId: event.id,
      toolName: event.toolName,
      title: event.title,
      status: event.status,
      source: typeof data.source === 'string' ? data.source : undefined,
      sandboxed: typeof data.sandboxed === 'boolean' ? data.sandboxed : undefined,
      durationMs,
      summary,
      dataPreview: formatAgentTraceDebugData(data),
    }]
  })
}

function debugBundlePendingActions(run: AgentRun | undefined) {
  if (!run) return []
  const approvals = (run.pendingApprovals ?? [])
    .filter((approval) => approval.status === 'pending')
    .map((approval) => ({
      type: 'approval',
      id: approval.id,
      toolName: approval.toolName,
      risk: approval.risk,
      permission: approval.permission,
      reason: approval.reason,
      createdAt: approval.createdAt,
    }))
  const inputs = (run.pendingInputRequests ?? [])
    .filter((request) => request.status === 'pending')
    .map((request) => ({
      type: 'input',
      id: request.id,
      title: request.title,
      summary: request.summary,
      question: request.question,
      inputType: request.inputType,
      choices: request.choices.map((choice) => ({
        id: choice.id,
        label: choice.label,
        description: choice.description,
      })),
      allowCustomAnswer: request.allowCustomAnswer,
      createdAt: request.createdAt,
    }))
  return [...approvals, ...inputs]
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
    ? `本次运行失败：${run.error}`
    : run.status === 'completed_with_warnings'
      ? '本次运行完成，但带有警告。'
      : run.status === 'completed'
        ? '本次运行已完成。'
        : run.status === 'requires_action'
          ? '本次运行正在等待用户处理。'
          : '本次运行仍在运行中。'
  return {
    overview,
    bullets: [
      `${traceSummary?.total ?? 0} 个运行事件，${modelCalls} 次模型调用，${toolCalls} 次工具调用`,
      `${contextEvents} 个上下文相关事件`,
      approvals > 0 ? `${approvals} 个待审批项` : '无待审批项',
      inputs > 0 ? `${inputs} 个待输入项` : '无待输入项',
      run.warnings?.length ? `${run.warnings.length} 条警告` : '无运行警告',
    ],
  }
}

function Info({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 break-all text-foreground" title={title}>{value}</div>
    </div>
  )
}
