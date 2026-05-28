import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Copy, History, Loader2, RefreshCw, Route, XCircle } from 'lucide-react'
import {
  AgentRunCallout,
  AgentRunChildRunButton,
  AgentRunChildRunMeta,
  AgentRunChildRunStatus,
  AgentRunChildRunTitle,
  AgentRunChildRunTitleRow,
  AgentRunDebugActionButton,
  AgentRunDebugActionList,
  AgentRunDebugActions,
  AgentRunDebugCodeBlock,
  AgentRunDebugDescription,
  AgentRunDebugHeader,
  AgentRunDebugHeaderCopy,
  AgentRunDebugHotspotBody,
  AgentRunDebugHotspotCard,
  AgentRunDebugHotspotLayout,
  AgentRunDebugHotspotMeta,
  AgentRunDebugHotspotMetaItem,
  AgentRunDebugHotspotSummary,
  AgentRunDebugHotspotTitle,
  AgentRunDebugHotspotTitleRow,
  AgentRunDebugList,
  AgentRunDebugMetric,
  AgentRunDebugMetricGrid,
  AgentRunDebugMutedNote,
  AgentRunDebugPanel,
  AgentRunDebugReadinessList,
  AgentRunDebugRowButton,
  AgentRunDebugSection,
  AgentRunDebugSplit,
  AgentRunDebugStack,
  AgentRunDebugStatusNote,
  AgentRunDebugTagGroup,
  AgentRunDebugTagGroupLabel,
  AgentRunDebugTags,
  AgentRunDebugTitle,
  AgentRunIcon,
  AgentRunInfoItem,
  AgentRunInlineActionButton,
  AgentRunInlineActions,
  AgentRunPageActionButton,
  AgentRunPageBadge,
  AgentRunPageBody,
  AgentRunPageHeader,
  AgentRunPageHeaderActions,
  AgentRunPageHeaderContent,
  AgentRunPageHeaderCopy,
  AgentRunPageIdentifier,
  AgentRunPageInfoStack,
  AgentRunPageLoading,
  AgentRunPageMain,
  AgentRunPageSidebar,
  AgentRunPageTitle,
  AgentRunPageTitleRow,
  AgentRunPendingBadges,
  AgentRunPendingImpact,
  AgentRunPendingItem,
  AgentRunPendingList,
  AgentRunPendingReason,
  AgentRunPendingTitle,
  AgentRunSectionEyebrow,
  AgentRunSidebarLoading,
  AgentRunSidebarSurface,
  AgentRunSummaryBadgeList,
  AgentRunSummaryBullet,
  AgentRunSummaryBullets,
  AgentRunSummaryCard,
  AgentRunSummaryLatest,
  AgentRunSummaryLatestLabel,
  AgentRunSummaryOverview,
  AgentRunTaskArtifactActions,
  AgentRunTaskArtifactCard,
  AgentRunTaskArtifactHeader,
  AgentRunTaskArtifactList,
  AgentRunTaskArtifactMeta,
  AgentRunTaskArtifactMetaItem,
  AgentRunTaskArtifactTitle,
  AgentRunTraceCategoryButton,
  AgentRunTraceCallout,
  AgentRunTraceContextGroup,
  AgentRunTraceContextGroupItems,
  AgentRunTraceContextGroupLabel,
  AgentRunTraceContextGroups,
  AgentRunTraceContextKey,
  AgentRunTraceContextRow,
  AgentRunTraceContextValue,
  AgentRunTraceControls,
  AgentRunTraceDetailLine,
  AgentRunTraceDisclosure,
  AgentRunTraceEmptyState,
  AgentRunTraceEventActionButton,
  AgentRunTraceEventActions,
  AgentRunTraceEventBody,
  AgentRunTraceEventCard,
  AgentRunTraceEventHeader,
  AgentRunTraceEventMeta,
  AgentRunTraceEventMetaItem,
  AgentRunTraceEventTitle,
  AgentRunTraceFeedbackActions,
  AgentRunTraceFeedbackDescription,
  AgentRunTraceFeedbackTitle,
  AgentRunTraceHeader,
  AgentRunTraceMeta,
  AgentRunTraceSearchInput,
  AgentRunTraceSelectTrigger,
  AgentRunTraceStack,
  AgentRunTraceStateMessage,
  AgentRunTraceStatusBadge,
  AgentRunTraceSummary,
  AgentRunTraceTitle,
  AgentRunTraceViewModeButton,
  AgentRunTraceViewModeGroup,
  AgentRunToneSurfaceBlock,
  AgentRunToneText,
  AgentSurfaceBlock,
  AgentPageShell,
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@movscript/ui'
import { AgentRunGenerationArtifacts } from '@/features/agent/components/AgentRunGenerationArtifacts'
import { AgentConsoleNav } from '@/features/agent/components/AgentConsoleNav'
import { LocalAgentInputRequestCard } from '@/features/agent/components/localRuntime'
import { agentTaskStatusLabel, buildPlanTaskViews, buildTaskArtifactViews } from '@/features/agent/domain/agentPlanUi'
import { agentPlanStatusLabel, agentTraceView, approvalImpactLabel, approvalPermissionLabel, approvalRiskLabel, buildTraceEventLink, canCancelWorkerRun, formatTraceEventDuration, hasUnloadedTraceEvents, inputTypeLabel, runRoleLabel, runStatusLabel, traceCategoryLabel, traceDeepLinkMissing as isTraceDeepLinkMissing, traceEventDurationMs, traceEventIdFromHash, traceEventStatusLabel, traceKindLabel, type AgentTraceCategory } from '@/features/agent/domain/agentRunUi'
import { agentToolNameLabel } from '@/features/agent/domain/agentToolDisplay'
import { formatAgentTraceDebugData, redactAgentTraceDebugText } from '@/features/agent/domain/agentTraceDebugData'
import { agentToolCallStatusRecipe } from '@/features/agent/presentation/agentSemanticUi'
import { isRecord } from '@/shared/domain/jsonValue'
import { localAgentClient, type AgentRun, type AgentTraceDebugView, type AgentTraceEvent, type AgentTraceEventKind } from '@/shared/infrastructure/localAgentClient'
import { agentRunPath } from '@/routes/projectRoutes'

const TRACE_PAGE_SIZE = 25
const TRACE_BULK_PAGE_SIZE = 100
const AGENT_RUN_UI_CONTRACT_MARKERS = [
  'ring-1 ring-primary/30',
  "open={defaultDetailOpen || view.category === 'http'}",
] as const
const DEBUG_BUNDLE_SCHEMA = 'movscript.agent-run-debug-bundle.v1'
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

const EMPTY_DEBUG_COVERAGE: AgentDebugCoverageSummary = {
  loadedLabel: '0 / 0',
  hasUnloadedTrace: false,
  modelCallsLabel: '0',
  promptDetailsLabel: '0',
  messageWritesLabel: '0',
  toolDetailsLabel: '0 / 0',
  httpResponsesLabel: '0',
  requestPayloadsLabel: '0',
  httpResponseBodiesLabel: '0',
  tokenUsageLabel: '0 tokens',
  issues: [],
}

const EMPTY_SKILL_TRACE_SUMMARY: AgentSkillTraceSummary = {
  timeline: [],
  currentActiveSkillIds: [],
  currentLoadedSkillIds: [],
  currentUnloadedSkillIds: [],
  currentAvailableSkillIds: [],
}

interface LoadedTraceEventsResult {
  events: AgentTraceEvent[]
  hasMore: boolean
}

type AgentModelCallContextView = AgentTraceDebugView['modelCallContexts'][number]
type AgentDebugCoverageSummary = AgentTraceDebugView['coverage']
type AgentDebugReadinessItem = AgentTraceDebugView['readinessChecklist'][number]
type AgentDebugAttentionEvent = AgentTraceDebugView['attentionEvents'][number]
type AgentModelCallSummary = AgentTraceDebugView['modelCalls'][number]
type AgentSkillTraceSummary = AgentTraceDebugView['skillTimeline']
type AgentTraceViewMode = 'debug' | 'timeline' | 'tools' | 'skills'

interface AgentDebugHotspot {
  id: string
  eventId?: string
  title: string
  label: string
  tone: 'danger' | 'warning' | 'neutral'
  summary?: string
  meta: string[]
}

interface AgentToolCallSummary {
  eventId: string
  toolName?: string
  title: string
  status: AgentTraceEvent['status']
  statusLabel: string
  source?: string
  sandboxed?: boolean
  durationMs?: number
  summary?: string
  argsPreview?: string
  dataPreview?: string
}

export default function AIAgentRunPage() {
  const navigate = useNavigate()
  const { runId = '' } = useParams()
  const [traceViewMode, setTraceViewMode] = useState<AgentTraceViewMode>('debug')
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
  const [traceDeepLinkEventId, setTraceDeepLinkEventId] = useState(() => traceEventIdFromLocationHash())
  const [debugReportCopied, setDebugReportCopied] = useState(false)
  const [debugReportCopyError, setDebugReportCopyError] = useState<string | null>(null)
  const [debugBundleCopied, setDebugBundleCopied] = useState(false)
  const [debugBundleCopyError, setDebugBundleCopyError] = useState<string | null>(null)
  const [eventCopyFeedback, setEventCopyFeedback] = useState<{ eventId: string; action: 'link' } | null>(null)
  const [eventCopyError, setEventCopyError] = useState<{ eventId: string; message: string } | null>(null)
  const currentRunIdRef = useRef(runId)
  const initialTraceLoadRunIdRef = useRef<string | null>(null)
  const loadingEventsRef = useRef(false)
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
    queryKey: ['agent-run-taskGraph-context', localAgentClient.baseURL, runQuery.data?.taskGraphId],
    queryFn: async () => localAgentClient.getTaskGraphSnapshot(runQuery.data!.taskGraphId!),
    enabled: !!runQuery.data?.taskGraphId,
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
  const debugViewQuery = useQuery({
    queryKey: ['agent-run-trace-debug-view', localAgentClient.baseURL, runId],
    queryFn: async () => localAgentClient.getRunTraceDebugView(runId),
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
  const toolCallSummaries = useMemo<AgentToolCallSummary[]>(() => (
    toolCallSummariesFromUnknown(debugViewQuery.data?.toolCalls) ?? fallbackToolCallSummaries(events)
  ), [debugViewQuery.data?.toolCalls, events])
  const visibleToolCallSummaries = useMemo(() => {
    const needle = eventSearch.trim().toLowerCase()
    if (!needle) return toolCallSummaries
    return toolCallSummaries.filter((toolCall) => toolCallSearchText(toolCall).includes(needle))
  }, [eventSearch, toolCallSummaries])
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
  const debugViewEvents = debugViewQuery.data?.events ?? events
  const skillTraceSummary = debugViewQuery.data?.skillTimeline ?? EMPTY_SKILL_TRACE_SUMMARY
  const modelCallSummaries = (debugViewQuery.data?.modelCalls ?? []) as AgentModelCallSummary[]
  const modelCallContexts = debugViewQuery.data?.modelCallContexts ?? []
  const attentionEvents = (debugViewQuery.data?.attentionEvents ?? []) as AgentDebugAttentionEvent[]
  const debugHotspots = useMemo(
    () => buildDebugHotspots({
      events: debugViewEvents,
      toolCalls: toolCallSummaries,
      modelCalls: modelCallSummaries,
      attentionEvents,
    }),
    [attentionEvents, debugViewEvents, modelCallSummaries, toolCallSummaries],
  )
  const latestTraceView = useMemo(
    () => summaryQuery.data?.latestEvent ? agentTraceView(summaryQuery.data.latestEvent) : undefined,
    [summaryQuery.data?.latestEvent],
  )
  const modelCallTokenUsage = useMemo(() => modelCallTokenUsageLabel(modelCallSummaries), [modelCallSummaries])
  const runSummary = useMemo(() => buildRunSummary(runQuery.data, summaryQuery.data, {
    modelCallCount: debugViewQuery.data ? modelCallSummaries.length : undefined,
    tokenUsageLabel: modelCallTokenUsage,
  }), [debugViewQuery.data, modelCallSummaries.length, modelCallTokenUsage, runQuery.data, summaryQuery.data])
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
  const traceFiltersActive = eventSearch.trim() !== ''
    || (traceViewMode === 'timeline' && (eventKind !== 'all' || eventCategory !== 'all'))
  const debugCoverageSummary = (debugViewQuery.data?.coverage ?? EMPTY_DEBUG_COVERAGE) as AgentDebugCoverageSummary
  const debugReadinessChecklist = (debugViewQuery.data?.readinessChecklist ?? []) as AgentDebugReadinessItem[]
  const debugReportText = debugViewQuery.data?.reportText ?? ''
  const debugFieldGuide = debugViewQuery.data?.fieldGuide ?? []
  const runTerminalAt = runQuery.data?.completedAt ?? runQuery.data?.failedAt ?? runQuery.data?.cancelledAt
  const runDuration = formatAgentRunDuration(runQuery.data?.createdAt, runTerminalAt)

  useEffect(() => {
    currentRunIdRef.current = runId
  }, [runId])

  useEffect(() => {
    setEvents([])
    setHasMore(false)
    setLoadingEvents(false)
    loadingEventsRef.current = false
    setTraceLoadError(null)
    initialTraceLoadRunIdRef.current = null
    setTraceViewMode('debug')
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
  }, [debugViewQuery.data])

  useEffect(() => {
    if (!traceDeepLinkEventId) return
    const element = document.getElementById(`agent-trace-event-${traceDeepLinkEventId}`)
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
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
    if (!runId || loadingEventsRef.current) return undefined
    const requestedRunId = runId
    loadingEventsRef.current = true
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
      if (currentRunIdRef.current === requestedRunId) {
        loadingEventsRef.current = false
        setLoadingEvents(false)
      }
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
    setTraceViewMode('timeline')
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
      const debugView = debugViewQuery.data ?? await localAgentClient.getRunTraceDebugView(runId)
      await navigator.clipboard.writeText(formatAgentTraceDebugData(debugView.bundle))
      setDebugBundleCopied(true)
    } catch (error) {
      setDebugBundleCopyError(error instanceof Error ? error.message : String(error))
    }
  }

  async function refreshRunPage() {
    await Promise.all([
      runQuery.refetch(),
      summaryQuery.refetch(),
      debugViewQuery.refetch(),
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

  async function resolveApproval(approval: NonNullable<AgentRun['pendingApprovals']>[number], action: 'approve' | 'reject') {
    if (!runId || approvalActionId) return
    if (!approval.interactionId) {
      setApprovalError('缺少 runtime interaction，无法处理审批。')
      return
    }
    const approvalId = approval.id
    setApprovalActionId(`${action}:${approvalId}`)
    setApprovalError(null)
    try {
      if (action === 'approve') {
        await localAgentClient.approveInteraction(approval.interactionId)
        await localAgentClient.waitForRun(runId, { timeoutMs: 30_000, pollMs: 300 })
      } else {
        await localAgentClient.rejectInteraction(approval.interactionId)
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
      await localAgentClient.waitForRun(runId, { timeoutMs: 30_000, pollMs: 300 })
      await refreshRunPage()
    } catch (error) {
      setInputError(error instanceof Error ? error.message : String(error))
    } finally {
      setInputActionId(null)
    }
  }

  return (
    <AgentPageShell data-testid="agent-run-page">
      <AgentRunPageHeader data-testid="agent-run-header">
        <AgentRunPageHeaderContent>
          <AgentRunPageHeaderCopy>
            <AgentRunPageTitleRow>
              <Route size={18} />
              <AgentRunPageTitle>Agent 运行</AgentRunPageTitle>
              {runQuery.data && <AgentRunPageBadge variant="outline">{runStatusLabel(runQuery.data.status)}</AgentRunPageBadge>}
            </AgentRunPageTitleRow>
            <AgentRunPageIdentifier>{runId}</AgentRunPageIdentifier>
            {cancelError && (
              <AgentRunCallout data-testid="agent-run-cancel-error" role="alert" tone="danger" compact>
                {cancelError}
              </AgentRunCallout>
            )}
          </AgentRunPageHeaderCopy>
          <AgentRunPageHeaderActions>
            {runQuery.data?.parentRunId && (
              <AgentRunPageActionButton type="button" variant="outline" aria-label="打开上级运行" onClick={() => navigate(agentRunPath(runQuery.data!.parentRunId!))}>
                <Route size={14} />
                上级
              </AgentRunPageActionButton>
            )}
            {planQuery.data?.taskGraph.rootRunId && planQuery.data.taskGraph.rootRunId !== runId && (
              <AgentRunPageActionButton type="button" variant="outline" aria-label="打开计划根运行" onClick={() => navigate(agentRunPath(planQuery.data!.taskGraph.rootRunId!))}>
                <Route size={14} />
                根运行
              </AgentRunPageActionButton>
            )}
            {workerRunCanBeCancelled && (
              <AgentRunPageActionButton
                data-testid="agent-run-cancel-worker"
                type="button"
                variant="solid" tone="danger"
                aria-label={`取消执行器 ${subagentName ?? runId}`}
                onClick={() => { void cancelWorkerRun() }}
                disabled={cancelingRun || runQuery.isFetching || loadingEvents}
              >
                {cancelingRun ? <AgentRunIcon icon={Loader2} spinning /> : <XCircle size={14} />}
                取消执行器
              </AgentRunPageActionButton>
            )}
            <AgentRunPageActionButton type="button" variant="outline" aria-label="返回上一页" onClick={() => navigate(-1)}>
              <ArrowLeft size={14} />
              返回
            </AgentRunPageActionButton>
            <AgentRunPageActionButton type="button" variant="outline" aria-label="刷新 AgentRun 调试页面" onClick={() => { void refreshRunPage() }} disabled={runQuery.isFetching || summaryQuery.isFetching || planQuery.isFetching || loadingEvents}>
              <AgentRunIcon icon={RefreshCw} spinning={runQuery.isFetching || summaryQuery.isFetching || planQuery.isFetching || loadingEvents} />
              刷新
            </AgentRunPageActionButton>
          </AgentRunPageHeaderActions>
        </AgentRunPageHeaderContent>
      </AgentRunPageHeader>
      <AgentConsoleNav compact />
      <AgentRunPageBody>
        <AgentRunPageSidebar data-testid="agent-run-sidebar">
          {runQuery.isLoading ? (
            <AgentRunPageLoading><AgentRunIcon icon={Loader2} size={12} spinning /> 正在加载运行</AgentRunPageLoading>
          ) : runQuery.error ? (
            <AgentRunCallout data-testid="agent-run-detail-error" role="alert" tone="danger" compact>
              {runQuery.error instanceof Error ? runQuery.error.message : String(runQuery.error)}
              <AgentRunPageActionButton
                data-testid="agent-run-detail-retry"
                type="button"
                size="xs"
                variant="outline"
                aria-label="重新加载 AgentRun 运行详情"
                onClick={() => { void runQuery.refetch() }}
                disabled={runQuery.isFetching}
              >
                {runQuery.isFetching ? <AgentRunIcon icon={Loader2} size={10} spinning /> : <RefreshCw size={10} />}
                重试
              </AgentRunPageActionButton>
            </AgentRunCallout>
          ) : runQuery.data ? (
            <AgentRunPageInfoStack>
              <AgentRunInfoItem label="角色" value={runRoleLabel(runQuery.data.role)} />
              <AgentRunInfoItem label="子 agent" value={subagentName ?? '-'} />
              <AgentRunInfoItem label="线程" value={runQuery.data.threadId} />
              <AgentRunInfoItem label="计划" value={runQuery.data.taskGraphId ?? '-'} />
              <AgentRunInfoItem label="任务" value={runQuery.data.taskId ?? '-'} />
              <AgentRunInfoItem label="上级" value={runQuery.data.parentRunId ?? '-'} />
              <AgentRunInfoItem label="进度" value={typeof runQuery.data.progress === 'number' ? `${Math.round(runQuery.data.progress * 100)}%` : '-'} />
              <AgentRunInfoItem label="步骤数" value={String(runQuery.data.steps.length)} />
              <AgentRunInfoItem label="创建于" value={formatAgentRunTimestamp(runQuery.data.createdAt)} title={runQuery.data.createdAt} />
              <AgentRunInfoItem label="更新于" value={formatAgentRunTimestamp(runQuery.data.updatedAt)} title={runQuery.data.updatedAt} />
              {runQuery.data.completedAt && <AgentRunInfoItem label="完成于" value={formatAgentRunTimestamp(runQuery.data.completedAt)} title={runQuery.data.completedAt} />}
              {runQuery.data.failedAt && <AgentRunInfoItem label="失败于" value={formatAgentRunTimestamp(runQuery.data.failedAt)} title={runQuery.data.failedAt} />}
              {runQuery.data.cancelledAt && <AgentRunInfoItem label="取消于" value={formatAgentRunTimestamp(runQuery.data.cancelledAt)} title={runQuery.data.cancelledAt} />}
              {runDuration && <AgentRunInfoItem label="耗时" value={runDuration} />}
              {runQuery.data.error && <AgentRunCallout tone="danger" compact>{runQuery.data.error}</AgentRunCallout>}
              {runSummary && (
                <AgentRunSummaryCard data-testid="agent-run-summary">
                  <AgentRunSectionEyebrow>运行摘要</AgentRunSectionEyebrow>
                  <AgentRunSummaryBadgeList>
                    {summaryQuery.data && Object.entries(summaryQuery.data.byKind).slice(0, 8).map(([kind, count]) => (
                      <AgentRunPageBadge key={kind} variant="outline">{traceKindLabel(kind as AgentTraceEventKind)} {count}</AgentRunPageBadge>
                    ))}
                  </AgentRunSummaryBadgeList>
                  {latestTraceView && summaryQuery.data?.latestEvent && (
                    <AgentRunSummaryLatest>
                      <AgentRunSummaryLatestLabel>最新事件</AgentRunSummaryLatestLabel>
                      <AgentRunPageBadge variant="outline">{latestTraceView.categoryLabel}</AgentRunPageBadge>
                      <AgentRunSummaryLatestLabel>{latestTraceView.title}</AgentRunSummaryLatestLabel>
                    </AgentRunSummaryLatest>
                  )}
                  <AgentRunSummaryOverview>{runSummary.overview}</AgentRunSummaryOverview>
                  <AgentRunSummaryBullets>
                    {runSummary.bullets.map((bullet) => <AgentRunSummaryBullet key={bullet}>• {bullet}</AgentRunSummaryBullet>)}
                  </AgentRunSummaryBullets>
                </AgentRunSummaryCard>
              )}
              {(runQuery.data.pendingInputRequests ?? []).filter((request) => request.status === 'pending').length > 0 && (
                <AgentRunCallout data-testid="agent-run-pending-input" tone="warning" compact>
                  <AgentRunToneText tone="warning">待输入</AgentRunToneText>
                  {inputError && (
                    <AgentRunCallout data-testid="agent-run-input-error" role="alert" tone="danger" compact>
                      {inputError}
                    </AgentRunCallout>
                  )}
                  {(runQuery.data.pendingInputRequests ?? []).filter((request) => request.status === 'pending').map((request) => (
                    <LocalAgentInputRequestCard
                      key={request.id}
                      request={request}
                      disabled={!!inputActionId}
                      onAnswer={(answer) => { void answerInput(request.id, answer) }}
                      placeholder="输入答案"
                      sendLabel="发送"
                      meta={<AgentRunPageBadge variant="outline">类型 {inputTypeLabel(request.inputType)}</AgentRunPageBadge>}
                    />
                  ))}
                </AgentRunCallout>
              )}
              {(runQuery.data.pendingApprovals ?? []).filter((approval) => approval.status === 'pending').length > 0 && (
                <AgentRunCallout data-testid="agent-run-pending-approval" tone="warning" compact>
                  <AgentRunToneText tone="warning">待审批</AgentRunToneText>
                  {approvalError && (
                    <AgentRunCallout data-testid="agent-run-approval-error" role="alert" tone="danger" compact>
                      {approvalError}
                    </AgentRunCallout>
                  )}
                  <AgentRunPendingList>
                  {(runQuery.data.pendingApprovals ?? []).filter((approval) => approval.status === 'pending').map((approval) => (
                    <AgentRunPendingItem key={approval.id}>
                      <AgentRunPendingTitle title={approval.toolName}>{agentToolNameLabel(approval.toolName)}</AgentRunPendingTitle>
                      <AgentRunPendingReason>{approval.reason}</AgentRunPendingReason>
                      <AgentRunPendingBadges>
                        {approval.risk && <AgentRunPageBadge variant="outline">风险 {approvalRiskLabel(approval.risk)}</AgentRunPageBadge>}
                        {approval.permission && <AgentRunPageBadge variant="outline">权限 {approvalPermissionLabel(approval.permission)}</AgentRunPageBadge>}
                      </AgentRunPendingBadges>
                      <AgentRunPendingImpact>
                        影响：{approvalImpactLabel(approval)}
                      </AgentRunPendingImpact>
                      <AgentRunInlineActions>
                        <AgentRunInlineActionButton
                          data-testid="agent-run-approval-action"
                          variant="outline"
                          aria-label={`同意执行${approval.toolName}`}
                          disabled={!!approvalActionId}
                          onClick={() => { void resolveApproval(approval, 'approve') }}
                        >
                          {approvalActionId === `approve:${approval.id}` && <AgentRunIcon icon={Loader2} size={10} spinning />}
                          同意
                        </AgentRunInlineActionButton>
                        <AgentRunInlineActionButton
                          data-testid="agent-run-approval-action"
                          variant="ghost"
                          aria-label={`拒绝执行${approval.toolName}`}
                          disabled={!!approvalActionId}
                          onClick={() => { void resolveApproval(approval, 'reject') }}
                        >
                          {approvalActionId === `reject:${approval.id}` && <AgentRunIcon icon={Loader2} size={10} spinning />}
                          拒绝
                        </AgentRunInlineActionButton>
                      </AgentRunInlineActions>
                    </AgentRunPendingItem>
                  ))}
                  </AgentRunPendingList>
                </AgentRunCallout>
              )}
              {planQuery.isLoading && (
                <AgentRunSidebarLoading icon={<AgentRunIcon icon={Loader2} size={12} spinning />}>正在加载计划上下文</AgentRunSidebarLoading>
              )}
              {planQuery.error && (
                <AgentRunCallout data-testid="agent-run-taskGraph-context-error" role="alert" tone="danger" compact>
                  {planQuery.error instanceof Error ? planQuery.error.message : String(planQuery.error)}
                  <AgentRunInlineActionButton
                    data-testid="agent-run-taskGraph-context-retry"
                    variant="outline"
                    aria-label="重新加载计划上下文"
                    onClick={() => { void planQuery.refetch() }}
                    disabled={planQuery.isFetching}
                  >
                    {planQuery.isFetching ? <AgentRunIcon icon={Loader2} size={10} spinning /> : <RefreshCw size={10} />}
                    重试
                  </AgentRunInlineActionButton>
                </AgentRunCallout>
              )}
              {planQuery.data && (
                <AgentRunSidebarSurface data-testid="agent-run-taskGraph-context">
                  <AgentRunSectionEyebrow>计划上下文</AgentRunSectionEyebrow>
                  <AgentRunInfoItem label="计划标题" value={planQuery.data.taskGraph.title} />
                  <AgentRunInfoItem label="计划状态" value={agentPlanStatusLabel(planQuery.data.taskGraph.status)} />
                  {runPlanTask && (
                    <>
                      <AgentRunInfoItem label="任务标题" value={runPlanTask.title} />
                      <AgentRunInfoItem label="任务状态" value={agentTaskStatusLabel(runPlanTask.status)} />
                      {runPlanTaskView?.statusExplanation && <AgentRunInfoItem label="任务说明" value={runPlanTaskView.statusExplanation} />}
                      <AgentRunInfoItem label="产物数" value={String(runPlanTask.artifacts.length)} />
                      {runPlanTask.blockedReason && <AgentRunCallout tone="warning" compact>{runPlanTask.blockedReason}</AgentRunCallout>}
                      {runPlanTask.artifacts.length > 0 && (
                        <AgentRunTaskArtifactList data-testid="agent-run-task-artifacts">
                          <AgentRunSectionEyebrow>任务产物</AgentRunSectionEyebrow>
                          {buildTaskArtifactViews(runPlanTask, 5, planQuery.data)
                            .map((artifact) => (
                                <AgentRunTaskArtifactCard key={artifact.id}>
                                  <AgentRunTaskArtifactHeader>
                                    <AgentRunTaskArtifactTitle>{artifact.label}</AgentRunTaskArtifactTitle>
                                    <AgentRunTaskArtifactActions>
                                      {artifact.sourceTaskOwnerRunId && (
                                        <AgentRunInlineActionButton variant="ghost" onClick={() => navigate(agentRunPath(artifact.sourceTaskOwnerRunId!))}>
                                          来源运行
                                        </AgentRunInlineActionButton>
                                      )}
                                      {artifact.sourceRunId && (
                                        <AgentRunInlineActionButton variant="ghost" onClick={() => navigate(agentRunPath(artifact.sourceRunId!))}>
                                          <Route size={10} />
                                          运行
                                        </AgentRunInlineActionButton>
                                      )}
                                      <AgentRunTaskArtifactMetaItem>{artifact.type}</AgentRunTaskArtifactMetaItem>
                                    </AgentRunTaskArtifactActions>
                                  </AgentRunTaskArtifactHeader>
                                  <AgentRunTaskArtifactMeta>
                                    {artifact.uri && <AgentRunTaskArtifactMetaItem>URI {artifact.uri}</AgentRunTaskArtifactMetaItem>}
                                    {artifact.sourceRunId && <AgentRunTaskArtifactMetaItem>运行 {artifact.sourceRunId}</AgentRunTaskArtifactMetaItem>}
                                    {artifact.sourceTaskId && <AgentRunTaskArtifactMetaItem>来源任务 {artifact.sourceTaskTitle ?? artifact.sourceTaskId}</AgentRunTaskArtifactMetaItem>}
                                    {artifact.sourceTaskStatus && <AgentRunTaskArtifactMetaItem>{agentTaskStatusLabel(artifact.sourceTaskStatus)}</AgentRunTaskArtifactMetaItem>}
                                    {artifact.toolName && <AgentRunTaskArtifactMetaItem>工具 {artifact.toolName}</AgentRunTaskArtifactMetaItem>}
                                  </AgentRunTaskArtifactMeta>
                                </AgentRunTaskArtifactCard>
                              ))}
                        </AgentRunTaskArtifactList>
                      )}
                    </>
                  )}
                </AgentRunSidebarSurface>
              )}
              {childRunsQuery.data?.children.length ? (
                <AgentRunSidebarSurface data-testid="agent-run-child-runs">
                  <AgentRunSectionEyebrow>子运行</AgentRunSectionEyebrow>
                  {childRunsQuery.data.children.map((child) => {
                    const childName = typeof child.metadata?.subagentName === 'string' && child.metadata.subagentName.trim()
                      ? child.metadata.subagentName.trim()
                      : child.id
                    return (
                      <AgentRunChildRunButton
                        key={child.id}
                        data-testid="agent-run-child-run"
                        aria-label={`打开子运行 ${childName}`}
                        onClick={() => navigate(agentRunPath(child.id))}
                      >
                        <AgentRunChildRunTitleRow>
                          <AgentRunChildRunTitle>{childName}</AgentRunChildRunTitle>
                          <AgentRunChildRunStatus>{runStatusLabel(child.status)}</AgentRunChildRunStatus>
                        </AgentRunChildRunTitleRow>
                        <AgentRunChildRunMeta>{child.taskId ?? child.id}</AgentRunChildRunMeta>
                      </AgentRunChildRunButton>
                    )
                  })}
                </AgentRunSidebarSurface>
              ) : null}
            </AgentRunPageInfoStack>
          ) : null}
        </AgentRunPageSidebar>
        <AgentRunPageMain data-testid="agent-run-trace-panel" aria-busy={loadingEvents}>
          <AgentRunTraceHeader>
            <AgentRunTraceSummary data-testid="agent-run-trace-summary">
              <AgentRunTraceTitle>运行轨迹</AgentRunTraceTitle>
              {summaryQuery.data && <AgentRunTraceMeta>{summaryQuery.data.total} 个事件</AgentRunTraceMeta>}
              {summaryQuery.error && (
                <AgentRunToneText as="span" tone="danger" data-testid="agent-run-trace-summary-error" role="alert">
                  统计加载失败
                </AgentRunToneText>
              )}
              {events.length > 0 && (
                <AgentRunTraceMeta data-testid="agent-run-trace-loaded-count">
                  已加载 {events.length}{typeof traceTotal === 'number' ? ` / ${traceTotal}` : ''}
                </AgentRunTraceMeta>
              )}
              {events.length > 0 && traceFiltersActive && (
                <AgentRunTraceMeta data-testid="agent-run-trace-visible-count">
                  当前显示 {traceViewMode === 'tools' ? visibleToolCallSummaries.length : visibleEvents.length} 个
                </AgentRunTraceMeta>
              )}
              {traceViewMode === 'timeline' && categoryCounts.map(([category, count]) => (
                <AgentRunTraceCategoryButton
                  key={category}
                  type="button"
                  data-testid="agent-run-trace-category-filter"
                  aria-pressed={eventCategory === category}
                    aria-label={`按${traceCategoryLabel(category)}筛选运行事件`}
                    onClick={() => setEventCategory((current) => current === category ? 'all' : category)}
                >
                  <AgentRunPageBadge variant={eventCategory === category ? 'soft' : 'outline'}>{traceCategoryLabel(category)} {count}</AgentRunPageBadge>
                </AgentRunTraceCategoryButton>
              ))}
              {traceViewMode === 'timeline' && summaryQuery.data && Object.entries(summaryQuery.data.byKind).slice(0, 8).map(([kind, count]) => (
                  <AgentRunPageBadge key={kind} variant="outline">{traceKindLabel(kind as AgentTraceEventKind)} {count}</AgentRunPageBadge>
                ))}
            </AgentRunTraceSummary>
            <AgentRunTraceControls>
              <AgentRunTraceViewModeGroup data-testid="agent-run-trace-view-mode">
                <AgentRunTraceViewModeButton
                  type="button"
                  variant={traceViewMode === 'debug' ? 'soft' : 'ghost'}
                  aria-pressed={traceViewMode === 'debug'}
                  onClick={() => setTraceViewMode('debug')}
                >
                  调试
                </AgentRunTraceViewModeButton>
                <AgentRunTraceViewModeButton
                  type="button"
                  variant={traceViewMode === 'timeline' ? 'soft' : 'ghost'}
                  aria-pressed={traceViewMode === 'timeline'}
                  onClick={() => setTraceViewMode('timeline')}
                >
                  时间线
                </AgentRunTraceViewModeButton>
                <AgentRunTraceViewModeButton
                  type="button"
                  variant={traceViewMode === 'tools' ? 'soft' : 'ghost'}
                  aria-pressed={traceViewMode === 'tools'}
                  onClick={() => setTraceViewMode('tools')}
                >
                  工具调用
                </AgentRunTraceViewModeButton>
                <AgentRunTraceViewModeButton
                  type="button"
                  variant={traceViewMode === 'skills' ? 'soft' : 'ghost'}
                  aria-pressed={traceViewMode === 'skills'}
                  onClick={() => setTraceViewMode('skills')}
                >
                  技能变动
                </AgentRunTraceViewModeButton>
              </AgentRunTraceViewModeGroup>
              {traceViewMode !== 'debug' && (
                <AgentRunTraceSearchInput
                  data-testid="agent-run-trace-search"
                  value={eventSearch}
                  onChange={(event) => setEventSearch(event.target.value)}
                  placeholder="搜索事件"
                  aria-label="搜索运行事件"
                />
              )}
              {traceViewMode === 'timeline' && (
                <>
                  <Select value={eventKind} onValueChange={(next) => setEventKind(next as 'all' | AgentTraceEventKind)}>
                    <AgentRunTraceSelectTrigger aria-label="按事件类型筛选"><SelectValue /></AgentRunTraceSelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部事件</SelectItem>
                      {eventKinds.map((kind) => <SelectItem key={kind} value={kind}>{traceKindLabel(kind as AgentTraceEventKind)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={eventCategory} onValueChange={(next) => setEventCategory(next as 'all' | AgentTraceCategory)}>
                    <AgentRunTraceSelectTrigger aria-label="按事件分类筛选"><SelectValue /></AgentRunTraceSelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部分类</SelectItem>
                      {eventCategories.map((category) => <SelectItem key={category} value={category}>{traceCategoryLabel(category)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </>
              )}
              {traceFiltersActive && (
                <AgentRunPageActionButton
                  data-testid="agent-run-clear-trace-filters-inline"
                  type="button"
                  variant="ghost"
                  aria-label="清除运行事件筛选"
                  onClick={clearTraceFilters}
                >
                  清除筛选
                </AgentRunPageActionButton>
              )}
              <AgentRunPageActionButton
                data-testid="agent-run-load-trace-events"
                type="button"
                variant="outline"
                aria-label="加载当前运行的事件"
                onClick={() => loadEvents('initial')}
                disabled={loadingEvents}
              >
                {loadingEvents ? <AgentRunIcon icon={Loader2} spinning /> : <History size={14} />}
                加载事件
              </AgentRunPageActionButton>
              {summaryQuery.error && (
                <AgentRunPageActionButton
                  data-testid="agent-run-trace-summary-retry"
                  type="button"
                  variant="outline"
                  aria-label="重新加载运行事件统计"
                  onClick={() => { void summaryQuery.refetch() }}
                  disabled={summaryQuery.isFetching}
                >
                  {summaryQuery.isFetching ? <AgentRunIcon icon={Loader2} spinning /> : <RefreshCw size={14} />}
                  重试统计
                </AgentRunPageActionButton>
              )}
              {traceHasUnloadedEvents && (
                <AgentRunPageActionButton
                  data-testid="agent-run-load-all-trace-events"
                  type="button"
                  variant="outline"
                  aria-label="加载当前运行的全部事件"
                  onClick={() => loadEvents('all')}
                  disabled={loadingEvents}
                >
                  {loadingEvents ? <AgentRunIcon icon={Loader2} spinning /> : <History size={14} />}
                  加载全部
                </AgentRunPageActionButton>
              )}
            </AgentRunTraceControls>
          </AgentRunTraceHeader>
          <AgentRunTraceStack>
            <AgentRunGenerationArtifacts run={runQuery.data} />
            {traceDeepLinkMissing && (
              <AgentRunTraceCallout data-testid="agent-run-trace-deep-link-missing" role="alert" tone="warning" compact>
                这个运行里没有找到事件 {traceDeepLinkEventId}。如果刚切换运行，请先刷新或加载全部事件；如果仍然没有，说明这个事件不属于当前运行。
              </AgentRunTraceCallout>
            )}
            {traceLoadError && (
              <AgentRunTraceCallout data-testid="agent-run-trace-load-error" role="alert" tone="danger" compact>
                <AgentRunTraceFeedbackTitle>运行事件加载失败</AgentRunTraceFeedbackTitle>
                <AgentRunTraceFeedbackDescription>{traceLoadError}</AgentRunTraceFeedbackDescription>
                <AgentRunInlineActionButton
                  data-testid="agent-run-trace-retry"
                  variant="outline"
                  aria-label="重新加载运行事件"
                  onClick={() => loadEvents(events.length > 0 ? 'more' : 'initial')}
                  disabled={loadingEvents}
                >
                  {loadingEvents ? <AgentRunIcon icon={Loader2} size={10} spinning /> : <RefreshCw size={10} />}
                  重试
                </AgentRunInlineActionButton>
              </AgentRunTraceCallout>
            )}
            {traceViewMode === 'skills' && (
              <SkillTracePanel summary={skillTraceSummary} onFocusEvent={focusTraceEvent} />
            )}
            {traceViewMode === 'tools' && (
              <ToolCallProcessPanel
                toolCalls={toolCallSummaries}
                visibleToolCalls={visibleToolCallSummaries}
                events={debugViewEvents}
                search={eventSearch}
                loading={debugViewQuery.isLoading || loadingEvents}
                traceHasUnloadedEvents={traceHasUnloadedEvents}
                onFocusEvent={focusTraceEvent}
                onLoadAll={() => loadEvents('all')}
                onClearSearch={() => setEventSearch('')}
              />
            )}
            {traceViewMode === 'debug' && (
              <DebugWorkbenchPanel
                hotspots={debugHotspots}
                summary={debugCoverageSummary}
                readinessChecklist={debugReadinessChecklist}
                attentionEvents={attentionEvents}
                toolCalls={toolCallSummaries}
                modelCalls={modelCallSummaries}
                loading={debugViewQuery.isLoading || loadingEvents}
                traceHasUnloadedEvents={traceHasUnloadedEvents}
                copied={debugReportCopied}
                copyError={debugReportCopyError}
                bundleCopied={debugBundleCopied}
                bundleCopyError={debugBundleCopyError}
                loadingAll={loadingEvents}
                bundleCopyDisabledReason={debugViewQuery.data ? null : '运行调试视图加载中，暂不能复制调试包。'}
                onFocusEvent={focusTraceEvent}
                onShowAttentionEvents={showAttentionEvents}
                onOpenTimeline={() => setTraceViewMode('timeline')}
                onOpenTools={() => setTraceViewMode('tools')}
                onCopy={copyDebugReport}
                onCopyBundle={copyDebugBundle}
                onLoadAll={() => loadEvents('all')}
              />
            )}
            {traceViewMode === 'timeline' && debugViewQuery.data && (
              <DebugCoveragePanel
                summary={debugCoverageSummary}
                readinessChecklist={debugReadinessChecklist}
                fieldGuide={debugFieldGuide}
                copied={debugReportCopied}
                copyError={debugReportCopyError}
                bundleCopied={debugBundleCopied}
                bundleCopyError={debugBundleCopyError}
                loadingAll={loadingEvents}
                bundleCopyDisabledReason={debugViewQuery.data ? null : '运行调试视图加载中，暂不能复制调试包。'}
                onCopy={copyDebugReport}
                onCopyBundle={copyDebugBundle}
                onLoadAll={() => loadEvents('all')}
              />
            )}
            {traceViewMode === 'timeline' && attentionEvents.length > 0 && (
              <AttentionEventsPanel events={attentionEvents} onFocusEvent={focusTraceEvent} onShowAttentionEvents={showAttentionEvents} />
            )}
            {traceViewMode === 'timeline' && modelCallSummaries.length > 0 && (
              <ModelCallSummaryPanel summaries={modelCallSummaries} contexts={modelCallContexts} events={debugViewEvents} onFocusEvent={focusTraceEvent} />
            )}
            {traceViewMode === 'timeline' && visibleTraceViews.map(({ event, view }) => {
              const isLinkedEvent = event.id === traceDeepLinkEventId
              const eventDuration = formatTraceEventDuration(event)
              const defaultDetailOpen = isLinkedEvent || view.category === 'attention'
              return (
                <AgentRunTraceEventCard data-testid="agent-run-trace-event" id={`agent-trace-event-${event.id}`} key={event.id} linked={isLinkedEvent}>
                  <AgentRunTraceEventHeader>
                    <AgentRunTraceEventTitle>{view.title}</AgentRunTraceEventTitle>
                    <AgentRunTraceEventActions>
                      {isLinkedEvent && <AgentRunPageBadge data-testid="agent-run-trace-linked-event">已定位</AgentRunPageBadge>}
                      {eventCopyFeedback?.eventId === event.id && (
                        <AgentRunPageBadge data-testid="agent-run-trace-copy-feedback" role="status">
                          链接已复制
                        </AgentRunPageBadge>
                      )}
                      <AgentRunTraceEventActionButton
                        aria-label={`复制${view.title}的事件链接`}
                        onClick={() => copyEventLink(event.id)}
                      >
                        <Copy size={10} />
                        链接
                      </AgentRunTraceEventActionButton>
                      <AgentRunPageBadge variant="outline">{view.categoryLabel}</AgentRunPageBadge>
                      <AgentRunPageBadge variant="outline">{traceEventStatusLabel(event.status)}</AgentRunPageBadge>
                    </AgentRunTraceEventActions>
                  </AgentRunTraceEventHeader>
                  {eventCopyError?.eventId === event.id && (
                    <AgentRunTraceCallout data-testid="agent-run-trace-copy-error" role="alert" tone="danger" compact>
                      复制失败：{eventCopyError.message}
                    </AgentRunTraceCallout>
                  )}
                  <AgentRunTraceEventBody>
                    <AgentRunTraceEventMeta>
                      <AgentRunTraceEventMetaItem>{traceKindLabel(event.kind)}</AgentRunTraceEventMetaItem>
                      {event.toolName && <AgentRunTraceEventMetaItem title={event.toolName}>工具 {agentToolNameLabel(event.toolName)}</AgentRunTraceEventMetaItem>}
                      {event.stepId && <AgentRunTraceEventMetaItem>步骤 {event.stepId}</AgentRunTraceEventMetaItem>}
                      <AgentRunTraceEventMetaItem title={event.createdAt}>创建 {formatAgentRunTimestamp(event.createdAt)}</AgentRunTraceEventMetaItem>
                      {event.completedAt && <AgentRunTraceEventMetaItem title={event.completedAt}>完成 {formatAgentRunTimestamp(event.completedAt)}</AgentRunTraceEventMetaItem>}
                      {eventDuration && <AgentRunTraceEventMetaItem>耗时 {eventDuration}</AgentRunTraceEventMetaItem>}
                    </AgentRunTraceEventMeta>
                    {view.behavior && <AgentRunTraceDetailLine label="行为" value={redactAgentTraceDebugText(view.behavior)} />}
                    {view.impact && <AgentRunTraceDetailLine label="影响" value={redactAgentTraceDebugText(view.impact)} />}
                    {view.summary && <AgentRunTraceDetailLine label="摘要" value={redactAgentTraceDebugText(view.summary)} />}
                    {view.contextGroups.length > 0 && (
                      <AgentRunTraceDisclosure title="上下文摘要" defaultOpen={defaultDetailOpen || view.category === 'http'}>
                        <AgentRunTraceContextGroups>
                          {view.contextGroups.map((group) => (
                            <AgentRunTraceContextGroup key={group.label}>
                              <AgentRunTraceContextGroupLabel>{group.label}</AgentRunTraceContextGroupLabel>
                              <AgentRunTraceContextGroupItems>
                                {group.items.map((item) => (
                                  <AgentRunTraceContextRow key={`${group.label}:${item.label}`}>
                                    <AgentRunTraceContextKey>{item.label}</AgentRunTraceContextKey>
                                    <AgentRunTraceContextValue>{redactAgentTraceDebugText(item.value)}</AgentRunTraceContextValue>
                                  </AgentRunTraceContextRow>
                                ))}
                              </AgentRunTraceContextGroupItems>
                            </AgentRunTraceContextGroup>
                          ))}
                        </AgentRunTraceContextGroups>
                      </AgentRunTraceDisclosure>
                    )}
                    {view.promptDetail && (
                      <AgentRunTraceDisclosure data-testid="agent-run-prompt-detail" title={view.promptDetail.title} defaultOpen={defaultDetailOpen}>
                        <PromptDetail detail={view.promptDetail} />
                      </AgentRunTraceDisclosure>
                    )}
                    {view.modelDetail && (
                      <AgentRunTraceDisclosure data-testid="agent-run-model-detail" title={view.modelDetail.title} defaultOpen={defaultDetailOpen}>
                        <ModelCallDetail detail={view.modelDetail} />
                      </AgentRunTraceDisclosure>
                    )}
                    {view.messageDetail && (
                      <AgentRunTraceDisclosure data-testid="agent-run-message-detail" title={view.messageDetail.title} defaultOpen={defaultDetailOpen}>
                        <MessageDetail detail={view.messageDetail} />
                      </AgentRunTraceDisclosure>
                    )}
                    {view.toolDetail && (
                      <AgentRunTraceDisclosure data-testid="agent-run-tool-detail" title={view.toolDetail.title} defaultOpen={defaultDetailOpen}>
                        <ToolDetail detail={view.toolDetail} />
                      </AgentRunTraceDisclosure>
                    )}
                  </AgentRunTraceEventBody>
                </AgentRunTraceEventCard>
              )
            })}
            {traceViewMode === 'timeline' && events.length === 0 && <AgentRunTraceStateMessage>尚未加载运行事件。</AgentRunTraceStateMessage>}
            {traceViewMode === 'timeline' && events.length > 0 && visibleEvents.length === 0 && (
              <AgentRunTraceEmptyState data-testid="agent-run-trace-empty-state">
                <AgentRunTraceFeedbackTitle>没有符合当前筛选条件的事件</AgentRunTraceFeedbackTitle>
                <AgentRunTraceFeedbackDescription>
                  当前筛选只覆盖已加载的 {events.length} 个事件{typeof traceTotal === 'number' ? `，本次运行共 ${traceTotal} 个事件` : ''}。
                </AgentRunTraceFeedbackDescription>
                <AgentRunTraceFeedbackActions>
                  {traceHasUnloadedEvents && (
                    <AgentRunInlineActionButton
                      data-testid="agent-run-empty-load-all"
                      variant="outline"
                      aria-label="加载全部运行事件后重新搜索"
                      onClick={() => loadEvents('all')}
                      disabled={loadingEvents}
                    >
                      {loadingEvents ? <AgentRunIcon icon={Loader2} size={10} spinning /> : <History size={10} />}
                      加载全部后再搜
                    </AgentRunInlineActionButton>
                  )}
                  {traceFiltersActive && (
                    <AgentRunInlineActionButton
                      data-testid="agent-run-clear-trace-filters"
                      variant="ghost"
                      aria-label="清除运行事件筛选并返回事件列表"
                      onClick={clearTraceFilters}
                    >
                      清除筛选
                    </AgentRunInlineActionButton>
                  )}
                </AgentRunTraceFeedbackActions>
              </AgentRunTraceEmptyState>
            )}
            {traceViewMode === 'timeline' && hasMore && (
              <AgentRunPageActionButton type="button" variant="ghost" aria-label="加载更多运行事件" onClick={() => loadEvents('more')} disabled={loadingEvents}>
                {loadingEvents ? <AgentRunIcon icon={Loader2} spinning /> : <History size={14} />}
                加载更多
              </AgentRunPageActionButton>
            )}
          </AgentRunTraceStack>
        </AgentRunPageMain>
      </AgentRunPageBody>
    </AgentPageShell>
  )
}

function traceEventIdFromLocationHash(): string | undefined {
  return typeof window === 'undefined' ? undefined : traceEventIdFromHash(window.location.hash)
}

function buildDebugHotspots(input: {
  events: AgentTraceEvent[]
  toolCalls: AgentToolCallSummary[]
  modelCalls: AgentModelCallSummary[]
  attentionEvents: AgentDebugAttentionEvent[]
}): AgentDebugHotspot[] {
  const hotspots: AgentDebugHotspot[] = []
  const seen = new Set<string>()
  const add = (hotspot: AgentDebugHotspot) => {
    if (seen.has(hotspot.id)) return
    seen.add(hotspot.id)
    hotspots.push(hotspot)
  }

  for (const event of input.attentionEvents) {
    add({
      id: `attention:${event.eventId}`,
      eventId: event.eventId,
      title: event.title,
      label: event.status === 'failed' ? '失败' : event.status === 'blocked' ? '阻塞' : event.kindLabel,
      tone: event.status === 'failed' ? 'danger' : 'warning',
      summary: event.error ?? event.summary ?? event.impact ?? event.behavior,
      meta: [event.kindLabel, event.statusLabel, formatAgentRunTimestamp(event.createdAt)].filter(Boolean),
    })
  }

  for (const toolCall of input.toolCalls) {
    if (toolCall.status !== 'failed' && toolCall.status !== 'blocked') continue
    add({
      id: `tool:${toolCall.eventId}`,
      eventId: toolCall.eventId,
      title: toolCall.toolName ? agentToolNameLabel(toolCall.toolName) : toolCall.title,
      label: toolCall.status === 'failed' ? '工具失败' : '工具阻塞',
      tone: toolCall.status === 'failed' ? 'danger' : 'warning',
      summary: toolCall.summary,
      meta: [
        toolCall.toolName,
        toolCall.statusLabel,
        toolCall.durationMs !== undefined ? formatDurationMs(toolCall.durationMs) : undefined,
        toolCall.source ? `来源 ${toolCall.source}` : undefined,
      ].filter((value): value is string => !!value),
    })
  }

  for (const call of input.modelCalls) {
    if (!call.issue && !call.error && call.status === 'complete') continue
    const eventId = call.responseEventId ?? call.requestEventId ?? call.resultEventId ?? call.eventIds[0]
    add({
      id: `model:${call.id}`,
      eventId,
      title: call.label,
      label: call.status === 'failed' ? '模型失败' : '模型异常',
      tone: call.status === 'failed' ? 'danger' : 'warning',
      summary: call.error ?? call.issue,
      meta: [
        call.statusLabel,
        call.model ? `模型 ${call.model}` : undefined,
        call.httpStatus ? `HTTP ${call.httpStatus}` : undefined,
        call.latency,
        call.retryCount ? `重试 ${call.retryCount}` : undefined,
      ].filter((value): value is string => !!value),
    })
  }

  const slowTools = input.toolCalls
    .filter((toolCall) => (toolCall.durationMs ?? 0) >= 3000 && toolCall.status === 'completed')
    .sort((left, right) => (right.durationMs ?? 0) - (left.durationMs ?? 0))
    .slice(0, 3)
  for (const toolCall of slowTools) {
    add({
      id: `slow-tool:${toolCall.eventId}`,
      eventId: toolCall.eventId,
      title: toolCall.toolName ? agentToolNameLabel(toolCall.toolName) : toolCall.title,
      label: '慢工具',
      tone: 'neutral',
      summary: toolCall.summary,
      meta: [
        toolCall.durationMs !== undefined ? `耗时 ${formatDurationMs(toolCall.durationMs)}` : undefined,
        toolCall.toolName,
      ].filter((value): value is string => !!value),
    })
  }

  const failedEvents = input.events
    .filter((event) => (event.status === 'failed' || event.status === 'blocked') && !seen.has(`attention:${event.id}`))
    .slice(0, 5)
  for (const event of failedEvents) {
    const view = agentTraceView(event)
    add({
      id: `event:${event.id}`,
      eventId: event.id,
      title: view.title,
      label: event.status === 'failed' ? '失败事件' : '阻塞事件',
      tone: event.status === 'failed' ? 'danger' : 'warning',
      summary: view.summary ?? view.impact ?? event.summary,
      meta: [traceKindLabel(event.kind), traceEventStatusLabel(event.status), formatTraceEventDuration(event)].filter((value): value is string => !!value),
    })
  }

  return hotspots
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
    toolDetail?.args !== undefined ? formatAgentTraceRawJSON(toolDetail.args) : undefined,
    ...((toolDetail?.fields ?? []).flatMap((field) => [field.label, redactAgentTraceDebugText(field.value)])),
  ].map(searchTextToken).filter((value): value is string => !!value).join(' ').toLowerCase()
}

function fallbackToolCallSummaries(events: AgentTraceEvent[]): AgentToolCallSummary[] {
  return events.flatMap((event): AgentToolCallSummary[] => {
    if (event.kind !== 'tool_call') return []
    const view = agentTraceView(event)
    const detail = view.toolDetail
    const data = isRecord(event.data) ? event.data : undefined
    const durationMs = traceEventDurationMs(event, data)
    return [{
      eventId: event.id,
      ...(event.toolName ? { toolName: event.toolName } : {}),
      title: view.title,
      status: event.status,
      statusLabel: traceEventStatusLabel(event.status),
      ...(detail?.source ? { source: detail.source } : typeof data?.source === 'string' ? { source: data.source } : {}),
      ...(detail?.sandboxed ? { sandboxed: detail.sandboxed === '是' } : typeof data?.sandboxed === 'boolean' ? { sandboxed: data.sandboxed } : {}),
      ...(durationMs !== undefined ? { durationMs } : {}),
      ...(view.summary ? { summary: view.summary } : {}),
      ...(detail?.args !== undefined ? { argsPreview: formatAgentTraceRawJSON(detail.args) } : {}),
      ...(data?.result !== undefined ? { dataPreview: formatAgentTraceRawJSON(data.result) } : {}),
    }]
  })
}

function toolCallSummariesFromUnknown(value: unknown): AgentToolCallSummary[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.flatMap((item): AgentToolCallSummary[] => {
    if (!isRecord(item)) return []
    const eventId = typeof item.eventId === 'string' ? item.eventId : ''
    const title = typeof item.title === 'string' ? item.title : ''
    const status = isTraceEventStatus(item.status) ? item.status : undefined
    const statusLabel = typeof item.statusLabel === 'string' ? item.statusLabel : undefined
    if (!eventId || !title || !status || !statusLabel) return []
    return [{
      eventId,
      ...(typeof item.toolName === 'string' ? { toolName: item.toolName } : {}),
      title,
      status,
      statusLabel,
      ...(typeof item.source === 'string' ? { source: item.source } : {}),
      ...(typeof item.sandboxed === 'boolean' ? { sandboxed: item.sandboxed } : {}),
      ...(typeof item.durationMs === 'number' && Number.isFinite(item.durationMs) ? { durationMs: item.durationMs } : {}),
      ...(typeof item.summary === 'string' ? { summary: item.summary } : {}),
      ...(typeof item.argsPreview === 'string' ? { argsPreview: item.argsPreview } : {}),
      ...(typeof item.dataPreview === 'string' ? { dataPreview: item.dataPreview } : {}),
    }]
  })
}

function isTraceEventStatus(value: unknown): value is AgentTraceEvent['status'] {
  return value === 'started' || value === 'completed' || value === 'blocked' || value === 'failed' || value === 'info'
}

function toolCallSearchText(toolCall: AgentToolCallSummary): string {
  return [
    toolCall.eventId,
    toolCall.toolName,
    toolCall.title,
    toolCall.status,
    toolCall.statusLabel,
    toolCall.source,
    toolCall.sandboxed === undefined ? undefined : toolCall.sandboxed ? '沙箱 sandboxed yes true' : '非沙箱 sandboxed no false',
    toolCall.durationMs === undefined ? undefined : `${toolCall.durationMs}ms`,
    toolCall.summary,
    toolCall.argsPreview,
    toolCall.dataPreview,
    toolCall.toolName ? agentToolNameLabel(toolCall.toolName) : undefined,
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

function DebugWorkbenchPanel({
  hotspots,
  summary,
  readinessChecklist,
  attentionEvents,
  toolCalls,
  modelCalls,
  loading,
  traceHasUnloadedEvents,
  copied,
  copyError,
  bundleCopied,
  bundleCopyError,
  loadingAll,
  bundleCopyDisabledReason,
  onFocusEvent,
  onShowAttentionEvents,
  onOpenTimeline,
  onOpenTools,
  onCopy,
  onCopyBundle,
  onLoadAll,
}: {
  hotspots: AgentDebugHotspot[]
  summary: AgentDebugCoverageSummary
  readinessChecklist: AgentDebugReadinessItem[]
  attentionEvents: AgentDebugAttentionEvent[]
  toolCalls: AgentToolCallSummary[]
  modelCalls: AgentModelCallSummary[]
  loading: boolean
  traceHasUnloadedEvents: boolean
  copied: boolean
  copyError: string | null
  bundleCopied: boolean
  bundleCopyError: string | null
  loadingAll: boolean
  bundleCopyDisabledReason: string | null
  onFocusEvent: (eventId: string) => void
  onShowAttentionEvents: () => void
  onOpenTimeline: () => void
  onOpenTools: () => void
  onCopy: () => void
  onCopyBundle: () => void
  onLoadAll: () => void
}) {
  const failedTools = toolCalls.filter((toolCall) => toolCall.status === 'failed').length
  const blockedTools = toolCalls.filter((toolCall) => toolCall.status === 'blocked').length
  const modelIssues = modelCalls.filter((call) => call.issue || call.error || call.status === 'failed').length
  const slowestTool = toolCalls
    .filter((toolCall) => typeof toolCall.durationMs === 'number')
    .sort((left, right) => (right.durationMs ?? 0) - (left.durationMs ?? 0))[0]
  const blockingItems = readinessChecklist.filter((item) => item.status !== 'ok')
  const bundleCopyDisabled = loadingAll || bundleCopyDisabledReason !== null
  return (
    <AgentRunDebugSection data-testid="agent-run-debug-workbench">
      <AgentRunDebugPanel variant="subtle">
        <AgentRunDebugHeader>
          <AgentRunDebugHeaderCopy>
            <AgentRunDebugTitle>调试工作台</AgentRunDebugTitle>
            <AgentRunDebugDescription>先看异常、慢调用和缺失信息；需要上下文时再定位到时间线事件</AgentRunDebugDescription>
          </AgentRunDebugHeaderCopy>
          <AgentRunDebugActions>
            {loading && <AgentRunPageBadge variant="outline">加载中</AgentRunPageBadge>}
            <AgentRunDebugActionButton variant="outline" onClick={onOpenTimeline}>
              打开时间线
            </AgentRunDebugActionButton>
            <AgentRunDebugActionButton variant="outline" onClick={onOpenTools}>
              工具过程
            </AgentRunDebugActionButton>
          </AgentRunDebugActions>
        </AgentRunDebugHeader>
        <AgentRunDebugMetricGrid>
          <DebugCoverageMetric label="需关注" value={String(attentionEvents.length)} />
          <DebugCoverageMetric label="失败工具" value={String(failedTools)} />
          <DebugCoverageMetric label="阻塞工具" value={String(blockedTools)} />
          <DebugCoverageMetric label="模型问题" value={String(modelIssues)} />
          <DebugCoverageMetric label="最慢工具" value={slowestTool?.durationMs !== undefined ? formatDurationMs(slowestTool.durationMs) : '-'} />
        </AgentRunDebugMetricGrid>
      </AgentRunDebugPanel>

      <AgentRunDebugSplit>
        <AgentRunDebugPanel>
          <AgentRunDebugHeader>
            <AgentRunDebugHeaderCopy>
              <AgentRunDebugTitle>优先排查</AgentRunDebugTitle>
              <AgentRunDebugDescription>按失败、阻塞、慢调用和模型异常排序</AgentRunDebugDescription>
            </AgentRunDebugHeaderCopy>
            <AgentRunPageBadge variant={hotspots.length > 0 ? 'soft' : 'outline'}>{hotspots.length} 项</AgentRunPageBadge>
          </AgentRunDebugHeader>
          {hotspots.length > 0 ? (
            <AgentRunDebugList>
              {hotspots.slice(0, 10).map((hotspot) => (
                <DebugHotspotItem key={hotspot.id} hotspot={hotspot} onFocusEvent={onFocusEvent} />
              ))}
              {hotspots.length > 10 && <AgentRunTraceStateMessage>还有 {hotspots.length - 10} 项，可进入时间线继续筛选。</AgentRunTraceStateMessage>}
            </AgentRunDebugList>
          ) : (
            <AgentRunDebugMutedNote>
              当前已加载 trace 中没有明显失败、阻塞或慢调用。可以继续看时间线，或加载全部事件确认没有遗漏。
            </AgentRunDebugMutedNote>
          )}
        </AgentRunDebugPanel>

        <AgentRunDebugStack>
          <AgentRunDebugPanel>
            <AgentRunDebugTitle>下一步</AgentRunDebugTitle>
            <AgentRunDebugActionList>
              {attentionEvents.length > 0 && (
                <AgentRunDebugActionButton variant="outline" onClick={onShowAttentionEvents}>
                  只看需关注事件
                </AgentRunDebugActionButton>
              )}
              {traceHasUnloadedEvents && (
                <AgentRunDebugActionButton variant="outline" onClick={onLoadAll} disabled={loadingAll}>
                  {loadingAll ? <AgentRunIcon icon={Loader2} size={10} spinning /> : <History size={10} />}
                  加载全部事件
                </AgentRunDebugActionButton>
              )}
              <AgentRunDebugActionButton variant="ghost" onClick={onCopy}>
                <Copy size={10} />
                {copied ? '摘要已复制' : '复制调试摘要'}
              </AgentRunDebugActionButton>
              <AgentRunDebugActionButton
                variant="ghost"
                onClick={onCopyBundle}
                disabled={bundleCopyDisabled}
                title={bundleCopyDisabledReason ?? undefined}
              >
                {loadingAll ? <AgentRunIcon icon={Loader2} size={10} spinning /> : <Copy size={10} />}
                {bundleCopied ? '调试包已复制' : '复制脱敏调试包'}
              </AgentRunDebugActionButton>
            </AgentRunDebugActionList>
            {copyError && <AgentRunTraceCallout role="alert" tone="danger" compact>摘要复制失败：{copyError}</AgentRunTraceCallout>}
            {bundleCopyError && <AgentRunTraceCallout role="alert" tone="danger" compact>调试包复制失败：{bundleCopyError}</AgentRunTraceCallout>}
            {bundleCopyDisabledReason && !bundleCopyError && <AgentRunDebugStatusNote>{bundleCopyDisabledReason}</AgentRunDebugStatusNote>}
          </AgentRunDebugPanel>

          <AgentRunDebugPanel>
            <AgentRunDebugHeader>
              <AgentRunDebugTitle>覆盖状态</AgentRunDebugTitle>
              {summary.issues.length > 0 ? <AgentRunPageBadge>需补全</AgentRunPageBadge> : <AgentRunPageBadge variant="outline">信息完整</AgentRunPageBadge>}
            </AgentRunDebugHeader>
            <AgentRunDebugMetricGrid>
              <DebugCoverageMetric label="事件" value={summary.loadedLabel} />
              <DebugCoverageMetric label="工具详情" value={summary.toolDetailsLabel} />
              <DebugCoverageMetric label="模型调用" value={summary.modelCallsLabel} />
              <DebugCoverageMetric label="Token" value={summary.tokenUsageLabel} />
              <DebugCoverageMetric label="请求/响应" value={`${summary.requestPayloadsLabel} / ${summary.httpResponseBodiesLabel}`} />
            </AgentRunDebugMetricGrid>
            {blockingItems.length > 0 && (
              <AgentRunDebugReadinessList>
                {blockingItems.slice(0, 3).map((item) => (
                  <AgentRunTraceCallout key={item.id} tone="warning" compact>
                    <AgentRunTraceFeedbackTitle>{item.label}</AgentRunTraceFeedbackTitle>
                    {item.action}
                  </AgentRunTraceCallout>
                ))}
              </AgentRunDebugReadinessList>
            )}
          </AgentRunDebugPanel>
        </AgentRunDebugStack>
      </AgentRunDebugSplit>
    </AgentRunDebugSection>
  )
}

function DebugHotspotItem({ hotspot, onFocusEvent }: { hotspot: AgentDebugHotspot; onFocusEvent: (eventId: string) => void }) {
  return (
    <AgentRunDebugHotspotCard data-testid="agent-run-debug-hotspot" tone={hotspot.tone}>
      <AgentRunDebugHotspotLayout>
        <AgentRunDebugHotspotBody>
          <AgentRunDebugHotspotTitleRow>
            <AgentRunPageBadge variant={hotspot.tone === 'neutral' ? 'outline' : 'soft'}>{hotspot.label}</AgentRunPageBadge>
            <AgentRunDebugHotspotTitle>{hotspot.title}</AgentRunDebugHotspotTitle>
          </AgentRunDebugHotspotTitleRow>
          {hotspot.summary && <AgentRunDebugHotspotSummary>{redactAgentTraceDebugText(hotspot.summary)}</AgentRunDebugHotspotSummary>}
          {hotspot.meta.length > 0 && (
            <AgentRunDebugHotspotMeta>
              {hotspot.meta.map((item) => <AgentRunDebugHotspotMetaItem key={item}>{item}</AgentRunDebugHotspotMetaItem>)}
            </AgentRunDebugHotspotMeta>
          )}
        </AgentRunDebugHotspotBody>
        {hotspot.eventId && (
          <AgentRunTraceEventActionButton onClick={() => onFocusEvent(hotspot.eventId!)}>
            定位
          </AgentRunTraceEventActionButton>
        )}
      </AgentRunDebugHotspotLayout>
    </AgentRunDebugHotspotCard>
  )
}

function ToolCallProcessPanel({
  toolCalls,
  visibleToolCalls,
  events,
  search,
  loading,
  traceHasUnloadedEvents,
  onFocusEvent,
  onLoadAll,
  onClearSearch,
}: {
  toolCalls: AgentToolCallSummary[]
  visibleToolCalls: AgentToolCallSummary[]
  events: AgentTraceEvent[]
  search: string
  loading: boolean
  traceHasUnloadedEvents: boolean
  onFocusEvent: (eventId: string) => void
  onLoadAll: () => void
  onClearSearch: () => void
}) {
  const eventsById = new Map(events.map((event) => [event.id, event]))
  const failedCount = toolCalls.filter((toolCall) => toolCall.status === 'failed').length
  const blockedCount = toolCalls.filter((toolCall) => toolCall.status === 'blocked').length
  const totalDurationMs = toolCalls.reduce((sum, toolCall) => sum + (toolCall.durationMs ?? 0), 0)
  const uniqueToolNames = new Set(toolCalls.map((toolCall) => toolCall.toolName).filter(Boolean)).size
  const trimmedSearch = search.trim()
  return (
    <AgentRunDebugSection data-testid="agent-run-tool-call-process">
      <AgentRunDebugPanel variant="subtle">
        <AgentRunDebugHeader>
          <AgentRunDebugHeaderCopy>
            <AgentRunDebugTitle>工具调用过程</AgentRunDebugTitle>
            <AgentRunDebugDescription>只显示工具调用事件，适合快速核对输入、结果、耗时和失败点</AgentRunDebugDescription>
          </AgentRunDebugHeaderCopy>
          <AgentRunDebugActions>
            <AgentRunPageBadge variant="outline">{toolCalls.length} 次调用</AgentRunPageBadge>
            {trimmedSearch && <AgentRunPageBadge>匹配 {visibleToolCalls.length}</AgentRunPageBadge>}
            {loading && <AgentRunPageBadge variant="outline">加载中</AgentRunPageBadge>}
          </AgentRunDebugActions>
        </AgentRunDebugHeader>
        <AgentRunDebugMetricGrid>
          <DebugCoverageMetric label="工具种类" value={String(uniqueToolNames)} />
          <DebugCoverageMetric label="失败" value={String(failedCount)} />
          <DebugCoverageMetric label="阻塞" value={String(blockedCount)} />
          <DebugCoverageMetric label="累计耗时" value={totalDurationMs > 0 ? formatDurationMs(totalDurationMs) : '-'} />
        </AgentRunDebugMetricGrid>
      </AgentRunDebugPanel>
      {toolCalls.length === 0 && !loading && (
        <AgentRunTraceEmptyState data-testid="agent-run-tool-call-empty">
          当前运行没有工具调用记录。
        </AgentRunTraceEmptyState>
      )}
      {toolCalls.length > 0 && visibleToolCalls.length === 0 && (
        <AgentRunTraceEmptyState data-testid="agent-run-tool-call-search-empty">
          <AgentRunTraceFeedbackTitle>没有符合搜索条件的工具调用</AgentRunTraceFeedbackTitle>
          <AgentRunTraceFeedbackDescription>搜索会匹配工具名、展示名、状态、摘要、参数预览和结果预览。</AgentRunTraceFeedbackDescription>
          <AgentRunTraceFeedbackActions>
            <AgentRunInlineActionButton variant="ghost" onClick={onClearSearch}>
              清除搜索
            </AgentRunInlineActionButton>
            {traceHasUnloadedEvents && (
              <AgentRunInlineActionButton variant="outline" disabled={loading} onClick={onLoadAll}>
                {loading ? <AgentRunIcon icon={Loader2} size={10} spinning /> : <History size={10} />}
                加载全部后再搜
              </AgentRunInlineActionButton>
            )}
          </AgentRunTraceFeedbackActions>
        </AgentRunTraceEmptyState>
      )}
      {visibleToolCalls.length > 0 && (
        <AgentRunDebugList>
          {visibleToolCalls.map((toolCall, index) => {
            const event = eventsById.get(toolCall.eventId)
            const detail = event ? agentTraceView(event).toolDetail : undefined
            const statusRecipe = agentToolCallStatusRecipe(toolCall.status)
            return (
              <AgentRunTraceEventCard asChild key={toolCall.eventId}>
                <article data-testid="agent-run-tool-call-process-item">
                <AgentRunTraceEventHeader>
                  <AgentRunTraceEventTitle>{toolCall.toolName ? agentToolNameLabel(toolCall.toolName) : toolCall.title}</AgentRunTraceEventTitle>
                  <AgentRunTraceEventActions>
                    <AgentRunPageBadge variant="outline">#{index + 1}</AgentRunPageBadge>
                    {toolCall.toolName && <AgentRunTraceEventMetaItem>{toolCall.toolName}</AgentRunTraceEventMetaItem>}
                    <AgentRunTraceEventActionButton
                    aria-label={`定位工具调用事件 ${toolCall.title}`}
                    onClick={() => onFocusEvent(toolCall.eventId)}
                  >
                    定位事件
                    </AgentRunTraceEventActionButton>
                  </AgentRunTraceEventActions>
                </AgentRunTraceEventHeader>
                <AgentRunTraceEventMeta>
                  <AgentRunTraceEventMetaItem>事件 {toolCall.eventId}</AgentRunTraceEventMetaItem>
                  <AgentRunTraceStatusBadge intent={statusRecipe.intent} emphasis={statusRecipe.emphasis}>{toolCall.statusLabel}</AgentRunTraceStatusBadge>
                  {toolCall.source && <AgentRunTraceEventMetaItem>来源 {toolCall.source}</AgentRunTraceEventMetaItem>}
                  {toolCall.sandboxed !== undefined && <AgentRunTraceEventMetaItem>沙箱 {toolCall.sandboxed ? '是' : '否'}</AgentRunTraceEventMetaItem>}
                  {toolCall.durationMs !== undefined && <AgentRunTraceEventMetaItem>耗时 {formatDurationMs(toolCall.durationMs)}</AgentRunTraceEventMetaItem>}
                  {event?.createdAt && <AgentRunTraceEventMetaItem title={event.createdAt}>创建 {formatAgentRunTimestamp(event.createdAt)}</AgentRunTraceEventMetaItem>}
                </AgentRunTraceEventMeta>
                {toolCall.summary && (
                  <AgentRunTraceDetailLine label="摘要" value={redactAgentTraceDebugText(toolCall.summary)} />
                )}
                {detail ? (
                  <AgentRunTraceDisclosure title="工具详情" defaultOpen>
                    <ToolDetail detail={detail} />
                  </AgentRunTraceDisclosure>
                ) : (
                  <AgentRunDebugSplit>
                    {toolCall.argsPreview && <ToolCallPreviewBlock title="参数预览" value={toolCall.argsPreview} />}
                    {toolCall.dataPreview && <ToolCallPreviewBlock title="结果预览" value={toolCall.dataPreview} />}
                  </AgentRunDebugSplit>
                )}
                </article>
              </AgentRunTraceEventCard>
            )
          })}
        </AgentRunDebugList>
      )}
    </AgentRunDebugSection>
  )
}

function ToolCallPreviewBlock({ title, value }: { title: string; value: string }) {
  return (
    <AgentRunTraceDisclosure title={title} defaultOpen>
      <AgentRunDebugCodeBlock>
        {redactAgentTraceDebugText(value)}
      </AgentRunDebugCodeBlock>
    </AgentRunTraceDisclosure>
  )
}

function SkillTracePanel({ summary, onFocusEvent }: { summary: AgentSkillTraceSummary; onFocusEvent: (eventId: string) => void }) {
  const latest = summary.timeline.at(-1)
  return (
    <AgentRunDebugSection data-testid="agent-run-skill-trace-panel">
      <AgentRunDebugMetricGrid>
        <SkillTraceMetric label="当前激活" value={summary.currentActiveSkillIds.length} />
        <SkillTraceMetric label="显式加载" value={summary.currentLoadedSkillIds.length} />
        <SkillTraceMetric label="显式卸载" value={summary.currentUnloadedSkillIds.length} />
        <SkillTraceMetric label="目录可用" value={summary.currentAvailableSkillIds.length} />
      </AgentRunDebugMetricGrid>
      {latest && (
        <AgentRunDebugPanel>
          <AgentRunDebugHeader>
            <AgentRunDebugHeaderCopy>
              <AgentRunDebugTitle>最新技能状态</AgentRunDebugTitle>
              <AgentRunDebugDescription>{formatAgentRunTimestamp(latest.createdAt)}</AgentRunDebugDescription>
            </AgentRunDebugHeaderCopy>
            <AgentRunDebugActionButton variant="ghost" onClick={() => onFocusEvent(latest.eventId)}>
              定位事件
            </AgentRunDebugActionButton>
          </AgentRunDebugHeader>
          <SkillIdList label="激活技能" ids={latest.activeSkillIds} />
          <SkillIdList label="显式加载" ids={latest.loadedSkillIds} />
          <SkillIdList label="显式卸载" ids={latest.unloadedSkillIds} />
        </AgentRunDebugPanel>
      )}
      {summary.timeline.length > 0 ? (
        <AgentRunDebugList>
          {summary.timeline.map((entry) => (
            <AgentRunDebugRowButton
              key={entry.eventId}
              data-testid="agent-run-skill-trace-event"
              onClick={() => onFocusEvent(entry.eventId)}
            >
              <AgentRunTraceEventHeader>
                <AgentRunTraceEventTitle>{entry.title}</AgentRunTraceEventTitle>
                <AgentRunTraceEventMetaItem>{formatAgentRunTimestamp(entry.createdAt)}</AgentRunTraceEventMetaItem>
              </AgentRunTraceEventHeader>
              <AgentRunDebugTags>
                <AgentRunPageBadge variant="outline">激活 {entry.activeSkillIds.length}</AgentRunPageBadge>
                <AgentRunPageBadge variant="outline">加载 {entry.loadedSkillIds.length}</AgentRunPageBadge>
                <AgentRunPageBadge variant="outline">卸载 {entry.unloadedSkillIds.length}</AgentRunPageBadge>
                <AgentRunPageBadge variant="outline">可用 {entry.availableSkillIds.length}</AgentRunPageBadge>
              </AgentRunDebugTags>
              {entry.summary && <AgentRunDebugHotspotSummary>{redactAgentTraceDebugText(entry.summary)}</AgentRunDebugHotspotSummary>}
              <SkillIdList label="激活" ids={entry.activeSkillIds} compact />
            </AgentRunDebugRowButton>
          ))}
        </AgentRunDebugList>
      ) : (
        <AgentRunTraceEmptyState data-testid="agent-run-skill-trace-empty">
          已加载事件里还没有技能状态事件。
        </AgentRunTraceEmptyState>
      )}
    </AgentRunDebugSection>
  )
}

function SkillTraceMetric({ label, value }: { label: string; value: number }) {
  return <AgentRunDebugMetric label={label} value={value} />
}

function SkillIdList({ label, ids, compact = false }: { label: string; ids: string[]; compact?: boolean }) {
  if (ids.length === 0) return null
  const visible = compact ? ids.slice(0, 8) : ids
  return (
    <AgentRunDebugTagGroup>
      <AgentRunDebugTagGroupLabel>{label}</AgentRunDebugTagGroupLabel>
      <AgentRunDebugTags>
        {visible.map((id) => (
          <AgentRunPageBadge key={id}>{id}</AgentRunPageBadge>
        ))}
        {visible.length < ids.length && <AgentRunPageBadge variant="outline">+{ids.length - visible.length}</AgentRunPageBadge>}
      </AgentRunDebugTags>
    </AgentRunDebugTagGroup>
  )
}

function DebugCoveragePanel({
  summary,
  readinessChecklist,
  fieldGuide,
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
  readinessChecklist: AgentDebugReadinessItem[]
  fieldGuide: Array<{ id?: string; label?: string; description?: string }>
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
    <AgentRunDebugPanel data-testid="agent-run-debug-coverage" variant="subtle">
      <AgentRunDebugHeader>
        <AgentRunDebugHeaderCopy>
          <AgentRunDebugTitle>调试覆盖</AgentRunDebugTitle>
          <AgentRunDebugDescription>由 Agent 服务端基于全量 trace 生成</AgentRunDebugDescription>
        </AgentRunDebugHeaderCopy>
        <AgentRunDebugActions>
          {summary.issues.length > 0 ? <AgentRunPageBadge>需补全</AgentRunPageBadge> : <AgentRunPageBadge variant="outline">信息完整</AgentRunPageBadge>}
          {summary.hasUnloadedTrace && (
            <AgentRunDebugActionButton
              data-testid="agent-run-debug-load-all"
              variant="outline"
              aria-label="加载全部运行事件用于调试覆盖统计"
              onClick={onLoadAll}
              disabled={loadingAll}
            >
              {loadingAll ? <AgentRunIcon icon={Loader2} size={10} spinning /> : <History size={10} />}
              加载全部事件
            </AgentRunDebugActionButton>
          )}
          <AgentRunDebugActionButton
            data-testid="agent-run-debug-report-copy"
            variant="ghost"
            aria-label="复制 AgentRun 调试摘要"
            onClick={onCopy}
          >
            <Copy size={10} />
            {copied ? '已复制' : '复制摘要'}
          </AgentRunDebugActionButton>
          <AgentRunDebugActionButton
            data-testid="agent-run-debug-bundle-copy"
            variant="ghost"
            aria-label="复制脱敏 AgentRun 调试包"
            onClick={onCopyBundle}
            disabled={bundleCopyDisabled}
            title={bundleCopyDisabledReason ?? undefined}
            aria-describedby={bundleCopyDisabledReason ? bundleCopyDisabledReasonId : undefined}
          >
            {loadingAll ? <AgentRunIcon icon={Loader2} size={10} spinning /> : <Copy size={10} />}
            {loadingAll ? '加载中' : bundleCopyDisabledReason ? '等待运行信息' : bundleCopied ? '已复制' : '复制调试包'}
          </AgentRunDebugActionButton>
        </AgentRunDebugActions>
      </AgentRunDebugHeader>
      <AgentRunDebugMetricGrid>
        <DebugCoverageMetric label="事件" value={summary.loadedLabel} />
        <DebugCoverageMetric label="模型调用" value={summary.modelCallsLabel} />
        <DebugCoverageMetric label="Token" value={summary.tokenUsageLabel} />
        <DebugCoverageMetric label="HTTP 响应" value={summary.httpResponsesLabel} />
        <DebugCoverageMetric label="请求负载" value={summary.requestPayloadsLabel} />
        <DebugCoverageMetric label="响应正文" value={summary.httpResponseBodiesLabel} />
        <DebugCoverageMetric label="上下文详情" value={summary.promptDetailsLabel} />
        <DebugCoverageMetric label="历史写入" value={summary.messageWritesLabel} />
        <DebugCoverageMetric label="工具详情" value={summary.toolDetailsLabel} />
      </AgentRunDebugMetricGrid>
      <AgentRunDebugStatusNote data-testid="agent-run-debug-bundle-contract">
        <AgentRunDebugHotspotMeta>
          <AgentRunDebugHotspotMetaItem>调试包</AgentRunDebugHotspotMetaItem>
          <AgentRunPageBadge variant="outline">{DEBUG_BUNDLE_SCHEMA}</AgentRunPageBadge>
          <AgentRunDebugHotspotMetaItem>{DEBUG_BUNDLE_CAPABILITIES.length} 项能力</AgentRunDebugHotspotMetaItem>
          <AgentRunDebugHotspotMetaItem>脱敏复制</AgentRunDebugHotspotMetaItem>
        </AgentRunDebugHotspotMeta>
      </AgentRunDebugStatusNote>
      <AgentRunTraceDisclosure data-testid="agent-run-debug-field-guide" title="调试口径">
        <AgentRunTraceContextGroups>
          {fieldGuide.map((item, index) => (
            <AgentRunTraceContextGroup key={item.id ?? index} variant="subtle">
              <AgentRunTraceContextGroupLabel>{item.label}</AgentRunTraceContextGroupLabel>
              <AgentRunTraceContextGroupItems>
                <AgentRunTraceContextRow>
                  <AgentRunTraceContextValue>{item.description}</AgentRunTraceContextValue>
                </AgentRunTraceContextRow>
              </AgentRunTraceContextGroupItems>
            </AgentRunTraceContextGroup>
          ))}
        </AgentRunTraceContextGroups>
      </AgentRunTraceDisclosure>
      <DebugReadinessChecklist items={readinessChecklist} />
      {summary.issues.length > 0 && (
        <AgentRunDebugList>
          {summary.issues.map((issue) => <AgentRunCallout key={issue} tone="warning" compact>{issue}</AgentRunCallout>)}
        </AgentRunDebugList>
      )}
      {copyError && (
        <AgentRunTraceCallout data-testid="agent-run-debug-report-copy-error" role="alert" tone="danger" compact>
          调试摘要复制失败：{copyError}
        </AgentRunTraceCallout>
      )}
      {copied && !copyError && (
        <AgentRunDebugStatusNote data-testid="agent-run-debug-report-copy-feedback" role="status">
          调试摘要已复制
        </AgentRunDebugStatusNote>
      )}
      {bundleCopyError && (
        <AgentRunTraceCallout data-testid="agent-run-debug-bundle-copy-error" role="alert" tone="danger" compact>
          调试包复制失败：{bundleCopyError}
        </AgentRunTraceCallout>
      )}
      {bundleCopyDisabledReason && !bundleCopyError && (
        <AgentRunDebugStatusNote id={bundleCopyDisabledReasonId} data-testid="agent-run-debug-bundle-copy-disabled-reason" role="status">
          {bundleCopyDisabledReason}
        </AgentRunDebugStatusNote>
      )}
      {bundleCopied && !bundleCopyError && !bundleCopyDisabledReason && (
        <AgentRunDebugStatusNote data-testid="agent-run-debug-bundle-copy-feedback" role="status">
          脱敏调试包已复制。
        </AgentRunDebugStatusNote>
      )}
    </AgentRunDebugPanel>
  )
}

function DebugReadinessChecklist({ items }: { items: AgentDebugReadinessItem[] }) {
  return (
    <AgentRunDebugPanel data-testid="agent-run-debug-readiness" variant="card">
      <AgentRunSectionEyebrow>诊断清单</AgentRunSectionEyebrow>
      <AgentRunDebugReadinessList>
        {items.map((item) => (
          <AgentRunTraceContextGroup key={item.id} data-testid="agent-run-debug-readiness-item" variant="subtle">
            <AgentRunTraceContextGroupLabel>
              <AgentRunPageBadge variant={item.status === 'ok' ? 'outline' : 'soft'}>{item.status === 'ok' ? '已满足' : '需补全'}</AgentRunPageBadge>
              {item.label}
            </AgentRunTraceContextGroupLabel>
            <AgentRunTraceContextGroupItems>
              <AgentRunTraceContextRow>
                <AgentRunTraceContextKey>详情</AgentRunTraceContextKey>
                <AgentRunTraceContextValue>{item.detail}</AgentRunTraceContextValue>
              </AgentRunTraceContextRow>
              <AgentRunTraceContextRow>
                <AgentRunTraceContextKey>行动</AgentRunTraceContextKey>
                <AgentRunTraceContextValue>下一步：{item.action}</AgentRunTraceContextValue>
              </AgentRunTraceContextRow>
            </AgentRunTraceContextGroupItems>
          </AgentRunTraceContextGroup>
        ))}
      </AgentRunDebugReadinessList>
    </AgentRunDebugPanel>
  )
}

function DebugCoverageMetric({ label, value }: { label: string; value: string }) {
  return <AgentRunDebugMetric label={label} value={value} />
}

function AttentionEventsPanel({ events, onFocusEvent, onShowAttentionEvents }: { events: AgentDebugAttentionEvent[]; onFocusEvent: (eventId: string) => void; onShowAttentionEvents: () => void }) {
  return (
    <AgentRunDebugHotspotCard data-testid="agent-run-attention-events" variant="subtle" tone="warning">
      <AgentRunDebugHeader>
        <AgentRunDebugHeaderCopy>
          <AgentRunDebugTitle>异常/需关注事件</AgentRunDebugTitle>
          <AgentRunDebugDescription>失败、阻塞、审批和输入等待会集中显示在这里</AgentRunDebugDescription>
        </AgentRunDebugHeaderCopy>
        <AgentRunDebugActions>
          <AgentRunPageBadge>{events.length} 个</AgentRunPageBadge>
          <AgentRunDebugActionButton
            type="button"
            variant="outline"
            aria-label="只查看需关注运行事件"
            onClick={onShowAttentionEvents}
          >
            只看需关注
          </AgentRunDebugActionButton>
        </AgentRunDebugActions>
      </AgentRunDebugHeader>
      <AgentRunDebugList>
        {events.slice(0, 8).map((event) => (
          <AgentRunDebugHotspotCard key={event.eventId} data-testid="agent-run-attention-event" variant="card" tone="warning">
            <AgentRunDebugHotspotLayout>
              <AgentRunDebugHotspotBody>
                <AgentRunDebugHotspotTitleRow>
                  <AgentRunPageBadge>{event.statusLabel}</AgentRunPageBadge>
                  <AgentRunDebugHotspotTitle>{event.title}</AgentRunDebugHotspotTitle>
                  <AgentRunDebugHotspotMetaItem>{event.kindLabel}</AgentRunDebugHotspotMetaItem>
                </AgentRunDebugHotspotTitleRow>
                {event.summary && <AgentRunDebugHotspotSummary>{event.summary}</AgentRunDebugHotspotSummary>}
              </AgentRunDebugHotspotBody>
              <AgentRunTraceEventActionButton
                aria-label={`定位需关注事件 ${event.title}`}
                onClick={() => onFocusEvent(event.eventId)}
              >
                定位
              </AgentRunTraceEventActionButton>
            </AgentRunDebugHotspotLayout>
            <AgentRunDebugStack>
              {event.behavior && <AgentRunTraceDetailLine label="行为" value={event.behavior} />}
              {event.impact && <AgentRunTraceDetailLine label="影响" value={event.impact} />}
              {event.error && <AgentRunTraceDetailLine label="错误" value={event.error} />}
            </AgentRunDebugStack>
          </AgentRunDebugHotspotCard>
        ))}
      </AgentRunDebugList>
      {events.length > 8 && (
        <AgentRunTraceStateMessage>还有 {events.length - 8} 个需关注事件，请用事件筛选查看。</AgentRunTraceStateMessage>
      )}
    </AgentRunDebugHotspotCard>
  )
}

function ModelCallSummaryPanel({
  summaries,
  contexts,
  events,
  onFocusEvent,
}: {
  summaries: AgentModelCallSummary[]
  contexts: AgentModelCallContextView[]
  events: AgentTraceEvent[]
  onFocusEvent: (eventId: string) => void
}) {
  const contextsByCallId = new Map(contexts.map((context) => [context.callId, context]))
  return (
    <AgentRunDebugPanel data-testid="agent-run-model-call-summary" variant="subtle">
      <AgentRunDebugHeader>
        <AgentRunDebugHeaderCopy>
          <AgentRunDebugTitle>大模型调用总览</AgentRunDebugTitle>
          <AgentRunDebugDescription>由 Agent 服务端归并请求、响应、历史写入和工具调用</AgentRunDebugDescription>
        </AgentRunDebugHeaderCopy>
        <AgentRunPageBadge variant="outline">{summaries.length} 次调用</AgentRunPageBadge>
      </AgentRunDebugHeader>
      <AgentRunDebugList>
        {summaries.map((summary) => {
          const debugContext = contextsByCallId.get(summary.id) ?? fallbackModelCallContext(summary)
          return (
            <AgentRunTraceDisclosure
              key={summary.id}
              data-testid="agent-run-model-call-summary-item"
              summary={(
                <>
                  <AgentRunDebugHotspotTitle>{summary.label}</AgentRunDebugHotspotTitle>
                  <AgentRunPageBadge variant={summary.status === 'complete' ? 'outline' : 'soft'}>{summary.statusLabel}</AgentRunPageBadge>
                  {summary.model && <AgentRunTraceEventMetaItem>模型 {summary.model}</AgentRunTraceEventMetaItem>}
                  {summary.roundLabel && <AgentRunTraceEventMetaItem>原始轮次 {summary.roundLabel}</AgentRunTraceEventMetaItem>}
                </>
              )}
            >
              <AgentRunTraceEventActions>
                {summary.requestEventId && (
                  <AgentRunTraceEventActionButton
                    aria-label={`定位${summary.label}的模型请求事件`}
                    onClick={() => onFocusEvent(summary.requestEventId!)}
                  >
                    请求
                  </AgentRunTraceEventActionButton>
                )}
                {summary.responseEventId && (
                  <AgentRunTraceEventActionButton
                    aria-label={`定位${summary.label}的模型响应事件`}
                    onClick={() => onFocusEvent(summary.responseEventId!)}
                  >
                    响应
                  </AgentRunTraceEventActionButton>
                )}
                {summary.resultEventId && (
                  <AgentRunTraceEventActionButton
                    aria-label={`定位${summary.label}的模型结果事件`}
                    onClick={() => onFocusEvent(summary.resultEventId!)}
                  >
                    结果
                  </AgentRunTraceEventActionButton>
                )}
              </AgentRunTraceEventActions>
              <AgentRunTraceEventMeta>
                {summary.messageCount && <AgentRunTraceEventMetaItem>消息 {summary.messageCount}</AgentRunTraceEventMetaItem>}
                {summary.toolCount && <AgentRunTraceEventMetaItem>工具定义 {summary.toolCount}</AgentRunTraceEventMetaItem>}
                {debugContext.toolCalls.length > 0 && <AgentRunTraceEventMetaItem>工具调用 {debugContext.toolCalls.length}</AgentRunTraceEventMetaItem>}
                {debugContext.messageWrites.length > 0 && <AgentRunTraceEventMetaItem>历史写入 {debugContext.messageWrites.length}</AgentRunTraceEventMetaItem>}
                {summary.httpStatus && <AgentRunTraceEventMetaItem>HTTP {summary.httpStatus}</AgentRunTraceEventMetaItem>}
                {summary.latency && <AgentRunTraceEventMetaItem>{summary.latency}</AgentRunTraceEventMetaItem>}
                {summary.status !== 'result_only' && <AgentRunTraceEventMetaItem>{summary.hasRequestPayload ? '请求负载已存' : '请求负载缺失'}</AgentRunTraceEventMetaItem>}
                {summary.responseEventId && <AgentRunTraceEventMetaItem>{summary.hasResponseBody ? '响应正文已存' : '响应正文缺失'}</AgentRunTraceEventMetaItem>}
                {summary.retryCount && <AgentRunTraceEventMetaItem>重试 {summary.retryCount} 次</AgentRunTraceEventMetaItem>}
                {summary.error && <AgentRunToneText as="span" tone="danger">错误 {summary.error}</AgentRunToneText>}
                {summary.responseChars && <AgentRunTraceEventMetaItem>回复 {summary.responseChars} 字符</AgentRunTraceEventMetaItem>}
                {summary.inputTokens && <AgentRunTraceEventMetaItem>请求 {summary.inputTokens} token</AgentRunTraceEventMetaItem>}
                {summary.outputTokens && <AgentRunTraceEventMetaItem>回复 {summary.outputTokens} token</AgentRunTraceEventMetaItem>}
              </AgentRunTraceEventMeta>
              {summary.issue && <AgentRunTraceCallout tone="warning" compact>{summary.issue}</AgentRunTraceCallout>}
              {debugContext.issue && <AgentRunTraceCallout tone="warning" compact>{debugContext.issue}</AgentRunTraceCallout>}
              <ModelCallInlineDebug summary={summary} context={debugContext} events={events} onFocusEvent={onFocusEvent} />
            </AgentRunTraceDisclosure>
          )
        })}
      </AgentRunDebugList>
    </AgentRunDebugPanel>
  )
}

function fallbackModelCallContext(summary: AgentModelCallSummary): AgentModelCallContextView {
  return {
    callId: summary.id,
    label: summary.label,
    status: summary.status,
    statusLabel: summary.statusLabel,
    correlationLabel: 'Agent 调试视图未返回关联上下文',
    ...(summary.requestEventId ? { requestEventId: summary.requestEventId } : {}),
    ...(summary.responseEventId ? { responseEventId: summary.responseEventId } : {}),
    ...(summary.resultEventId ? { resultEventId: summary.resultEventId } : {}),
    modelEventIds: summary.eventIds,
    toolCalls: [],
    messageWrites: [],
    ...(summary.issue ? { issue: summary.issue } : {}),
  }
}

function ModelCallInlineDebug({
  summary,
  context,
  events,
  onFocusEvent,
}: {
  summary: AgentModelCallSummary
  context: AgentModelCallContextView
  events: AgentTraceEvent[]
  onFocusEvent: (eventId: string) => void
}) {
  const eventsById = new Map(events.map((event) => [event.id, event]))
  const modelDetails = context.modelEventIds
    .flatMap((eventId) => eventsById.get(eventId) ?? [])
    .map((event) => ({ event, detail: agentTraceView(event).modelDetail }))
    .filter((entry): entry is { event: AgentTraceEvent; detail: NonNullable<ReturnType<typeof agentTraceView>['modelDetail']> } => !!entry.detail)
  return (
    <AgentRunDebugPanel data-testid="agent-run-model-call-inline-debug" variant="subtle">
      <AgentRunDebugHeader>
        <AgentRunDebugTitle>本轮详情</AgentRunDebugTitle>
        <AgentRunDebugDescription>关联方式：{context.correlationLabel}</AgentRunDebugDescription>
      </AgentRunDebugHeader>
      {modelDetails.length > 0 && (
        <AgentRunDebugList>
          {modelDetails.map(({ event, detail }) => (
            <AgentRunTraceDisclosure
              key={event.id}
              data-testid="agent-run-model-call-inline-http-detail"
              defaultOpen={event.id === summary.requestEventId || event.id === summary.responseEventId}
              title={detail.title}
            >
              <AgentRunTraceEventActionButton
                aria-label={`定位${summary.label}的${detail.title}事件`}
                onClick={() => onFocusEvent(event.id)}
              >
                定位
              </AgentRunTraceEventActionButton>
              <ModelCallDetail detail={detail} />
            </AgentRunTraceDisclosure>
          ))}
        </AgentRunDebugList>
      )}
      <ModelCallRelatedItems title="历史写入" emptyText="没有找到同轮 assistant 历史写入。" items={context.messageWrites.map((item) => ({
        eventId: item.eventId,
        title: item.sourceLabel ?? item.source ?? item.messageId ?? 'Assistant history write',
        summary: item.contentPreview,
        meta: `${item.contentChars} 字符`,
      }))} onFocusEvent={onFocusEvent} />
      <ModelCallRelatedItems title="工具调用" emptyText="没有找到同轮工具调用。" items={context.toolCalls.map((item) => ({
        eventId: item.eventId,
        title: item.toolName ? agentToolNameLabel(item.toolName) : 'Tool call',
        summary: item.summary,
        meta: item.statusLabel,
      }))} onFocusEvent={onFocusEvent} />
    </AgentRunDebugPanel>
  )
}

function ModelCallRelatedItems({
  title,
  emptyText,
  items,
  onFocusEvent,
}: {
  title: string
  emptyText: string
  items: Array<{ eventId: string; title: string; summary?: string; meta?: string }>
  onFocusEvent: (eventId: string) => void
}) {
  return (
    <AgentRunDebugPanel data-testid={`agent-run-model-call-related-${title}`} variant="subtle">
      <AgentRunDebugHeader>
        <AgentRunDebugTitle>{title}</AgentRunDebugTitle>
        <AgentRunPageBadge variant="outline">{items.length}</AgentRunPageBadge>
      </AgentRunDebugHeader>
      {items.length === 0 ? (
        <AgentRunTraceStateMessage>{emptyText}</AgentRunTraceStateMessage>
      ) : (
        <AgentRunDebugList>
          {items.map((item) => (
              <AgentRunDebugHotspotCard key={item.eventId} variant="card" tone="neutral">
                <AgentRunDebugHotspotLayout>
                  <AgentRunDebugHotspotBody>
                    <AgentRunDebugHotspotTitle>{item.title}</AgentRunDebugHotspotTitle>
                    {item.meta && <AgentRunDebugHotspotMeta><AgentRunDebugHotspotMetaItem>{item.meta}</AgentRunDebugHotspotMetaItem></AgentRunDebugHotspotMeta>}
                    {item.summary && <AgentRunDebugHotspotSummary>{redactAgentTraceDebugText(item.summary)}</AgentRunDebugHotspotSummary>}
                  </AgentRunDebugHotspotBody>
                  <AgentRunTraceEventActionButton onClick={() => onFocusEvent(item.eventId)}>
                    定位
                  </AgentRunTraceEventActionButton>
                </AgentRunDebugHotspotLayout>
              </AgentRunDebugHotspotCard>
            ))}
        </AgentRunDebugList>
      )}
    </AgentRunDebugPanel>
  )
}

function PromptDetail({ detail }: { detail: NonNullable<ReturnType<typeof agentTraceView>['promptDetail']> }) {
  return (
    <AgentRunDebugStack>
      <AgentRunDebugPanel variant="card">
        <AgentRunDebugTitle>上下文包</AgentRunDebugTitle>
        <AgentRunTraceEventMeta>
          {detail.totalChars && <AgentRunTraceEventMetaItem>{detail.totalChars} 字符</AgentRunTraceEventMetaItem>}
          {detail.messageCount && <AgentRunTraceEventMetaItem>{detail.messageCount} 条消息</AgentRunTraceEventMetaItem>}
          {detail.systemMessageCount && <AgentRunTraceEventMetaItem>{detail.systemMessageCount} 条系统消息</AgentRunTraceEventMetaItem>}
          {detail.blockedToolCount && <AgentRunTraceEventMetaItem>{detail.blockedToolCount} 个工具被阻塞</AgentRunTraceEventMetaItem>}
        </AgentRunTraceEventMeta>
      </AgentRunDebugPanel>
      {(detail.layers.length > 0 || detail.contextLayers.length > 0) && (
        <AgentRunTraceContextGroups>
          {detail.layers.length > 0 && <PromptMetricList title="上下文层级" metrics={detail.layers} />}
          {detail.contextLayers.length > 0 && <PromptMetricList title="上下文来源" metrics={detail.contextLayers} />}
        </AgentRunTraceContextGroups>
      )}
      {(detail.skills.length > 0 || detail.tools.length > 0) && (
        <AgentRunTraceContextGroups>
          {detail.skills.length > 0 && <PromptNameList title="激活技能" values={detail.skills} />}
          {detail.tools.length > 0 && <PromptNameList title="可用工具" values={detail.tools} />}
        </AgentRunTraceContextGroups>
      )}
      {detail.partGroups.length > 0 && (
        <AgentRunDebugPanel data-testid="agent-run-prompt-part-groups" variant="card">
          <AgentRunSectionEyebrow>片段来源分组</AgentRunSectionEyebrow>
          <AgentRunTraceContextGroups>
            {detail.partGroups.map((group) => (
              <AgentRunTraceContextGroup key={group.contextLayer} variant="subtle">
                <AgentRunTraceContextGroupLabel>{group.contextLayer}</AgentRunTraceContextGroupLabel>
                <AgentRunTraceContextGroupItems>
                  <AgentRunTraceContextRow>
                    <AgentRunTraceContextKey>规模</AgentRunTraceContextKey>
                    <AgentRunTraceContextValue>{group.count} 段 / {group.chars} 字符</AgentRunTraceContextValue>
                  </AgentRunTraceContextRow>
                </AgentRunTraceContextGroupItems>
                <AgentRunDebugTags>
                  {group.parts.slice(0, 6).map((part) => <AgentRunPageBadge key={`${group.contextLayer}:${part.id}`} variant="outline">{part.id}</AgentRunPageBadge>)}
                  {group.parts.length > 6 && <AgentRunPageBadge>+{group.parts.length - 6}</AgentRunPageBadge>}
                </AgentRunDebugTags>
              </AgentRunTraceContextGroup>
            ))}
          </AgentRunTraceContextGroups>
        </AgentRunDebugPanel>
      )}
      {detail.parts.length > 0 && (
        <AgentRunDebugPanel data-testid="agent-run-prompt-parts" variant="card">
          <AgentRunSectionEyebrow>上下文片段</AgentRunSectionEyebrow>
          <AgentRunTraceContextGroupItems>
            {detail.parts.map((part) => (
              <AgentRunTraceContextRow key={`${part.id}:${part.layer}:${part.contextLayer}`}>
                <AgentRunTraceContextKey>{part.id}</AgentRunTraceContextKey>
                <AgentRunTraceContextValue>{[part.layer, part.contextLayer, part.chars ? `${part.chars} 字符` : undefined].filter(Boolean).join(' / ')}</AgentRunTraceContextValue>
              </AgentRunTraceContextRow>
            ))}
          </AgentRunTraceContextGroupItems>
        </AgentRunDebugPanel>
      )}
    </AgentRunDebugStack>
  )
}

function PromptMetricList({ title, metrics }: { title: string; metrics: Array<{ label: string; value: string }> }) {
  return (
    <AgentRunTraceContextGroup variant="card">
      <AgentRunTraceContextGroupLabel>{title}</AgentRunTraceContextGroupLabel>
      <AgentRunTraceContextGroupItems>
        {metrics.map((metric) => (
          <AgentRunTraceContextRow key={`${title}:${metric.label}`}>
            <AgentRunTraceContextKey>{metric.label}</AgentRunTraceContextKey>
            <AgentRunTraceContextValue>{metric.value}</AgentRunTraceContextValue>
          </AgentRunTraceContextRow>
        ))}
      </AgentRunTraceContextGroupItems>
    </AgentRunTraceContextGroup>
  )
}

function PromptNameList({ title, values }: { title: string; values: string[] }) {
  return (
    <AgentRunTraceContextGroup variant="card">
      <AgentRunTraceContextGroupLabel>{title}</AgentRunTraceContextGroupLabel>
      <AgentRunDebugTags>
        {values.slice(0, 12).map((value) => <AgentRunPageBadge key={value} variant="outline">{value}</AgentRunPageBadge>)}
        {values.length > 12 && <AgentRunPageBadge>+{values.length - 12}</AgentRunPageBadge>}
      </AgentRunDebugTags>
    </AgentRunTraceContextGroup>
  )
}

function ModelCallDetail({ detail }: { detail: NonNullable<ReturnType<typeof agentTraceView>['modelDetail']> }) {
  return (
    <AgentRunDebugStack>
      {detail.note && (
        <AgentRunDebugStatusNote>
          {detail.note}
        </AgentRunDebugStatusNote>
      )}
      {detail.request && (
        <ModelDetailSection title="HTTP 请求" testId="agent-run-model-http-request" defaultOpen>
          <AgentRunTraceContextGroupItems>
            {detail.request.method && <ModelMetaRow label="方法" value={detail.request.method} />}
            {detail.request.url && <ModelMetaRow label="地址" value={redactAgentTraceDebugText(detail.request.url)} />}
            {detail.request.model && <ModelMetaRow label="模型" value={detail.request.model} />}
            {detail.request.headers.length > 0 && <ModelMetaRow label="请求头" value={`${detail.request.headers.length} 个`} />}
            {detail.request.messageCount && <ModelMetaRow label="消息" value={`${detail.request.messageCount} 条`} />}
            {detail.request.toolCount && <ModelMetaRow label="工具定义" value={`${detail.request.toolCount} 个`} />}
            {detail.request.toolChoiceLabel && <ModelMetaRow label="工具选择" value={detail.request.toolChoiceLabel} />}
            {detail.request.stream && <ModelMetaRow label="流式返回" value={detail.request.stream} />}
          </AgentRunTraceContextGroupItems>
          {detail.request.headers.length > 0 && (
            <AgentRunTraceDisclosure data-testid="agent-run-model-request-headers" title="请求头">
              <AgentRunTraceContextGroupItems>
                {detail.request.headers.map((header) => (
                  <ModelMetaRow key={header.name} label={header.name} value={formatModelHeaderValue(header)} />
                ))}
              </AgentRunTraceContextGroupItems>
            </AgentRunTraceDisclosure>
          )}
          {(detail.request.submittedPayload ?? detail.request.payload) !== undefined && (
            <AgentRunTraceDisclosure data-testid="agent-run-model-request-payload" title="完整请求负载" defaultOpen>
              <AgentRunDebugDescription>
                实际发送到模型接口的请求体；Responses 调用会展开 sdk_body。
              </AgentRunDebugDescription>
              <AgentRunDebugCodeBlock>
                {formatAgentTraceDebugData(detail.request.submittedPayload ?? detail.request.payload)}
              </AgentRunDebugCodeBlock>
            </AgentRunTraceDisclosure>
          )}
          {detail.request.internalPayload !== undefined && (
            <AgentRunTraceDisclosure data-testid="agent-run-model-internal-payload" title="Agent 内部请求快照">
              <AgentRunDebugCodeBlock>
                {formatAgentTraceDebugData(detail.request.internalPayload)}
              </AgentRunDebugCodeBlock>
            </AgentRunTraceDisclosure>
          )}
        </ModelDetailSection>
      )}
      {detail.messages.length > 0 && (
        <ModelDetailSection title={`请求消息 (${detail.messages.length})`} testId="agent-run-model-request-messages">
          {detail.messageGroups.length > 0 && (
            <AgentRunTraceContextGroups data-testid="agent-run-model-request-message-groups">
              {detail.messageGroups.map((group) => (
                <AgentRunTraceContextGroup key={group.role} variant="card">
                  <AgentRunTraceContextGroupLabel>{group.roleLabel}</AgentRunTraceContextGroupLabel>
                  <AgentRunTraceContextGroupItems>
                    <ModelMetaRow label="规模" value={`${group.count} 条 / ${group.contentChars} 字符`} />
                  </AgentRunTraceContextGroupItems>
                  <AgentRunDebugTags>
                    {group.messages.slice(0, 6).map((message) => (
                      <AgentRunPageBadge key={`${group.role}:${message.index}`} variant="outline">
                        #{message.index}
                      </AgentRunPageBadge>
                    ))}
                    {group.messages.length > 6 && <AgentRunPageBadge>+{group.messages.length - 6}</AgentRunPageBadge>}
                  </AgentRunDebugTags>
                </AgentRunTraceContextGroup>
              ))}
            </AgentRunTraceContextGroups>
          )}
          {detail.messages.map((message) => (
            <AgentRunTraceContextGroup key={`${message.index}:${message.role}`} variant="card">
              <AgentRunTraceContextGroupLabel>{message.index}. {message.roleLabel}</AgentRunTraceContextGroupLabel>
              <AgentRunTraceContextGroupItems>
                <ModelMetaRow label="长度" value={`${message.contentChars} 字符`} />
              </AgentRunTraceContextGroupItems>
              <AgentRunDebugCodeBlock>
                {redactAgentTraceDebugText(message.content)}
              </AgentRunDebugCodeBlock>
            </AgentRunTraceContextGroup>
          ))}
        </ModelDetailSection>
      )}
      {detail.tools.length > 0 && (
        <ModelDetailSection title={`工具定义 (${detail.tools.length})`} testId="agent-run-model-request-tools">
          {detail.tools.map((tool) => (
            <AgentRunTraceContextGroup key={`${tool.index}:${tool.name}`} variant="card">
              <AgentRunTraceContextGroupLabel>{tool.index}. {tool.name}</AgentRunTraceContextGroupLabel>
              <AgentRunTraceContextGroupItems>
                {tool.description && <ModelMetaRow label="说明" value={tool.description} />}
                {tool.parameterKeys.length > 0 && <ModelMetaRow label="参数" value={tool.parameterKeys.join(', ')} />}
              </AgentRunTraceContextGroupItems>
            </AgentRunTraceContextGroup>
          ))}
        </ModelDetailSection>
      )}
      {detail.response && (
        <ModelDetailSection title="HTTP 响应" testId="agent-run-model-http-response" defaultOpen>
          <AgentRunTraceEventMeta>
            {detail.response.status && <AgentRunTraceEventMetaItem>状态 {detail.response.status}</AgentRunTraceEventMetaItem>}
            {detail.response.contentType && <AgentRunTraceEventMetaItem>{detail.response.contentType}</AgentRunTraceEventMetaItem>}
            {detail.response.headers.length > 0 && <AgentRunTraceEventMetaItem>响应头 {detail.response.headers.length}</AgentRunTraceEventMetaItem>}
            {detail.response.parsedId && <AgentRunTraceEventMetaItem>ID {detail.response.parsedId}</AgentRunTraceEventMetaItem>}
          </AgentRunTraceEventMeta>
          {detail.response.headers.length > 0 && (
            <AgentRunTraceDisclosure data-testid="agent-run-model-response-headers" title="响应头">
              <AgentRunTraceContextGroupItems>
                {detail.response.headers.map((header) => (
                  <ModelMetaRow key={header.name} label={header.name} value={formatModelHeaderValue(header)} />
                ))}
              </AgentRunTraceContextGroupItems>
            </AgentRunTraceDisclosure>
          )}
          {detail.response.content && (
            <AgentRunDebugCodeBlock>
              {redactAgentTraceDebugText(detail.response.content)}
            </AgentRunDebugCodeBlock>
          )}
          {detail.response.bodyText && detail.response.bodyText !== detail.response.content && (
            <AgentRunTraceDisclosure title="原始响应正文">
              <AgentRunDebugCodeBlock>
                {redactAgentTraceDebugText(detail.response.bodyText)}
              </AgentRunDebugCodeBlock>
            </AgentRunTraceDisclosure>
          )}
          {detail.response.parsedBody !== undefined && !detail.response.bodyText && (
            <AgentRunTraceDisclosure title="解析响应数据" defaultOpen>
              <AgentRunDebugCodeBlock>
                {formatAgentTraceDebugData(detail.response.parsedBody)}
              </AgentRunDebugCodeBlock>
            </AgentRunTraceDisclosure>
          )}
          {!detail.response.content && !detail.response.bodyText && (
            <AgentRunDebugStatusNote>
              这条事件没有原始 HTTP 响应正文；如果本区块上方有“完整请求负载”，仍可核对当时发送给模型的 input/tools。
              模型输出请继续查看“模型结果”或同轮“历史写入”。
            </AgentRunDebugStatusNote>
          )}
        </ModelDetailSection>
      )}
      {detail.result && (
        <ModelDetailSection title="模型结果" testId="agent-run-model-result" defaultOpen>
          <AgentRunTraceEventMeta>
            {detail.result.finishReasonLabel && <AgentRunTraceEventMetaItem>结束原因 {detail.result.finishReasonLabel}</AgentRunTraceEventMetaItem>}
            {detail.result.contentChars && <AgentRunTraceEventMetaItem>回复 {detail.result.contentChars} 字符</AgentRunTraceEventMetaItem>}
            {detail.result.inputTokens && <AgentRunTraceEventMetaItem>请求 {detail.result.inputTokens} token</AgentRunTraceEventMetaItem>}
            {detail.result.outputTokens && <AgentRunTraceEventMetaItem>回复 {detail.result.outputTokens} token</AgentRunTraceEventMetaItem>}
            {detail.result.toolCalls && <AgentRunTraceEventMetaItem>工具调用 {detail.result.toolCalls}</AgentRunTraceEventMetaItem>}
          </AgentRunTraceEventMeta>
        </ModelDetailSection>
      )}
    </AgentRunDebugStack>
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
    <AgentRunTraceDisclosure data-testid={testId} title={title} defaultOpen={defaultOpen}>
      <AgentRunDebugStack>{children}</AgentRunDebugStack>
    </AgentRunTraceDisclosure>
  )
}

function formatModelHeaderValue(header: { name: string; value: string }) {
  return /authorization|cookie|api[-_]?key|token|secret/i.test(header.name)
    ? '[已脱敏]'
    : redactAgentTraceDebugText(header.value)
}

function ModelMetaRow({ label, value }: { label: string; value: string }) {
  return (
    <AgentRunTraceContextRow>
      <AgentRunTraceContextKey>{label}</AgentRunTraceContextKey>
      <AgentRunTraceContextValue>{value}</AgentRunTraceContextValue>
    </AgentRunTraceContextRow>
  )
}

function MessageDetail({ detail }: { detail: NonNullable<ReturnType<typeof agentTraceView>['messageDetail']> }) {
  return (
    <AgentRunTraceContextGroup variant="card">
      <AgentRunTraceContextGroupLabel>{detail.title}</AgentRunTraceContextGroupLabel>
      <AgentRunTraceEventMeta>
        {detail.messageId && <AgentRunTraceEventMetaItem>ID {detail.messageId}</AgentRunTraceEventMetaItem>}
        {detail.sourceLabel && <AgentRunTraceEventMetaItem>来源 {detail.sourceLabel}</AgentRunTraceEventMetaItem>}
        <AgentRunTraceEventMetaItem>{detail.contentChars} 字符</AgentRunTraceEventMetaItem>
      </AgentRunTraceEventMeta>
      <AgentRunDebugCodeBlock>
        {redactAgentTraceDebugText(detail.content)}
      </AgentRunDebugCodeBlock>
    </AgentRunTraceContextGroup>
  )
}

function ToolDetail({ detail }: { detail: NonNullable<ReturnType<typeof agentTraceView>['toolDetail']> }) {
  return (
    <AgentRunDebugStack>
      <AgentRunTraceContextGroup variant="card">
        <AgentRunTraceContextGroupLabel>{detail.title}</AgentRunTraceContextGroupLabel>
        <AgentRunTraceContextGroupItems>
        {detail.toolName && <ModelMetaRow label="工具" value={detail.toolName} />}
        <ModelMetaRow label="状态" value={detail.statusLabel} />
        {detail.source && <ModelMetaRow label="来源" value={detail.source} />}
        {detail.sandboxed && <ModelMetaRow label="沙箱" value={detail.sandboxed} />}
        {detail.duration && <ModelMetaRow label="耗时" value={detail.duration} />}
        </AgentRunTraceContextGroupItems>
      </AgentRunTraceContextGroup>
      {detail.summary && (
        <AgentRunDebugStatusNote>
          {redactAgentTraceDebugText(detail.summary)}
        </AgentRunDebugStatusNote>
      )}
      {detail.args !== undefined && (
        <AgentRunTraceDisclosure data-testid="agent-run-tool-args" title="参数" defaultOpen>
          <AgentRunDebugCodeBlock>
            {formatAgentTraceRawJSON(detail.args)}
          </AgentRunDebugCodeBlock>
        </AgentRunTraceDisclosure>
      )}
      {detail.fields.length > 0 && (
        <AgentRunTraceContextGroup variant="card">
          <AgentRunTraceContextGroupLabel>结果字段</AgentRunTraceContextGroupLabel>
          <AgentRunTraceContextGroupItems>
            {detail.fields.map((field) => (
              <ModelMetaRow
                key={field.label}
                label={field.label}
                value={field.sensitive ? '[已脱敏]' : redactAgentTraceDebugText(field.value)}
              />
            ))}
          </AgentRunTraceContextGroupItems>
        </AgentRunTraceContextGroup>
      )}
    </AgentRunDebugStack>
  )
}

function formatAgentTraceRawJSON(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function buildRunSummary(
  run?: Pick<AgentRun, 'status' | 'role' | 'steps' | 'warnings' | 'error' | 'pendingApprovals' | 'pendingInputRequests'>,
  traceSummary?: { total: number; byKind: Partial<Record<AgentTraceEventKind, number>>; latestEvent?: AgentTraceEvent },
  metrics: { modelCallCount?: number; tokenUsageLabel?: string } = {},
): { overview: string; bullets: string[] } | undefined {
  if (!run) return undefined
  const modelEvents = traceSummary?.byKind.model_call ?? 0
  const modelCalls = metrics.modelCallCount ?? modelEvents
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
      `${traceSummary?.total ?? 0} 个运行事件，${modelCalls} 次 HTTP 调用，${toolCalls} 次工具调用${modelEvents !== modelCalls ? `，${modelEvents} 个模型事件` : ''}`,
      metrics.tokenUsageLabel ? `模型消耗：${metrics.tokenUsageLabel}` : undefined,
      `${contextEvents} 个上下文相关事件`,
      approvals > 0 ? `${approvals} 个待审批项` : '无待审批项',
      inputs > 0 ? `${inputs} 个待输入项` : '无待输入项',
      run.warnings?.length ? `${run.warnings.length} 条警告` : '无运行警告',
    ].filter((item): item is string => !!item),
  }
}

function modelCallTokenUsageLabel(modelCalls: AgentModelCallSummary[]): string | undefined {
  const input = modelCalls.reduce((sum, call) => sum + integerFromLabel(call.inputTokens), 0)
  const output = modelCalls.reduce((sum, call) => sum + integerFromLabel(call.outputTokens), 0)
  const total = input + output
  if (total <= 0) return undefined
  return `${formatInteger(total)} tokens，in ${formatInteger(input)} / out ${formatInteger(output)}`
}

function integerFromLabel(value: string | undefined): number {
  const normalized = value?.replace(/,/g, '')
  const parsed = Number(normalized?.match(/\d+/)?.[0] ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatInteger(value: number): string {
  return Math.round(value).toLocaleString('en-US')
}
