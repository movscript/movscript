import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, History, Loader2, RefreshCw, Route } from 'lucide-react'
import { Badge, Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@movscript/ui'
import { localAgentClient, type AgentTraceEvent, type AgentTraceEventKind } from '@/lib/localAgentClient'

export default function AIAgentRunPage() {
  const navigate = useNavigate()
  const { runId = '' } = useParams()
  const [eventKind, setEventKind] = useState<'all' | AgentTraceEventKind>('all')
  const [events, setEvents] = useState<AgentTraceEvent[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loadingEvents, setLoadingEvents] = useState(false)
  const runQuery = useQuery({
    queryKey: ['agent-run-detail', localAgentClient.baseURL, runId],
    queryFn: async () => {
      await localAgentClient.ensureRunning()
      return localAgentClient.getRun(runId)
    },
    enabled: !!runId,
    retry: false,
  })
  const summaryQuery = useQuery({
    queryKey: ['agent-run-trace-summary', localAgentClient.baseURL, runId],
    queryFn: async () => localAgentClient.getRunTraceSummary(runId),
    enabled: !!runId,
    retry: false,
  })
  const visibleEvents = useMemo(() => eventKind === 'all' ? events : events.filter((event) => event.kind === eventKind), [eventKind, events])
  const eventKinds = useMemo(() => Array.from(new Set(events.map((event) => event.kind))).sort(), [events])

  async function loadEvents(mode: 'initial' | 'more' = 'initial') {
    if (!runId || loadingEvents) return
    setLoadingEvents(true)
    try {
      const cursor = mode === 'more' ? events.at(-1)?.id : undefined
      const response = await localAgentClient.getRunTraceEvents(runId, { limit: 25, ...(cursor ? { cursor } : {}) })
      setEvents((current) => mode === 'more' ? [...current, ...response.events] : response.events)
      setHasMore(response.events.length >= 25)
    } finally {
      setLoadingEvents(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="border-b border-border px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Route size={18} />
              <h1 className="text-lg font-semibold text-foreground">Agent run</h1>
              {runQuery.data && <Badge variant="outline">{runQuery.data.status.replace(/_/g, ' ')}</Badge>}
            </div>
            <p className="mt-1 break-all text-xs text-muted-foreground">{runId}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => navigate(-1)}>
              <ArrowLeft size={13} />
              Back
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => { runQuery.refetch(); summaryQuery.refetch() }} disabled={runQuery.isFetching || summaryQuery.isFetching}>
              <RefreshCw size={13} className={runQuery.isFetching || summaryQuery.isFetching ? 'animate-spin' : ''} />
              Refresh
            </Button>
          </div>
        </div>
      </header>
      <main className="grid min-h-0 flex-1 grid-cols-[minmax(260px,380px)_minmax(0,1fr)]">
        <aside className="min-h-0 overflow-y-auto border-r border-border p-4">
          {runQuery.isLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 size={12} className="animate-spin" /> Loading run</div>
          ) : runQuery.error ? (
            <p className="text-xs text-destructive">{runQuery.error instanceof Error ? runQuery.error.message : String(runQuery.error)}</p>
          ) : runQuery.data ? (
            <div className="space-y-3 text-xs">
              <Info label="Role" value={runQuery.data.role ?? '-'} />
              <Info label="Thread" value={runQuery.data.threadId} />
              <Info label="Plan" value={runQuery.data.planId ?? '-'} />
              <Info label="Task" value={runQuery.data.taskId ?? '-'} />
              <Info label="Parent" value={runQuery.data.parentRunId ?? '-'} />
              <Info label="Progress" value={typeof runQuery.data.progress === 'number' ? `${Math.round(runQuery.data.progress * 100)}%` : '-'} />
              <Info label="Steps" value={String(runQuery.data.steps.length)} />
              <Info label="Created" value={runQuery.data.createdAt} />
              <Info label="Updated" value={runQuery.data.updatedAt} />
              {runQuery.data.error && <p className="rounded border border-destructive/30 bg-destructive/10 px-2 py-1 text-destructive">{runQuery.data.error}</p>}
            </div>
          ) : null}
        </aside>
        <section className="min-h-0 overflow-y-auto p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1 text-xs">
              <span className="font-medium text-foreground">Trace</span>
              {summaryQuery.data && <span className="text-muted-foreground">{summaryQuery.data.total} events</span>}
              {summaryQuery.data && Object.entries(summaryQuery.data.byKind).slice(0, 8).map(([kind, count]) => (
                <Badge key={kind} variant="outline" className="text-[10px]">{kind} {count}</Badge>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Select value={eventKind} onValueChange={(next) => setEventKind(next as 'all' | AgentTraceEventKind)}>
                <SelectTrigger size="sm" className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">all events</SelectItem>
                  {eventKinds.map((kind) => <SelectItem key={kind} value={kind}>{kind}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button type="button" size="sm" variant="outline" onClick={() => loadEvents('initial')} disabled={loadingEvents}>
                {loadingEvents ? <Loader2 size={13} className="animate-spin" /> : <History size={13} />}
                Load events
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            {visibleEvents.map((event) => (
              <div key={event.id} className="rounded-md border border-border bg-background px-3 py-2 text-xs">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="truncate font-medium text-foreground">{event.title}</span>
                  <Badge variant="outline" className="shrink-0 text-[10px]">{event.status.replace(/_/g, ' ')}</Badge>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
                  <span>{event.kind}</span>
                  {event.toolName && <span>tool {event.toolName}</span>}
                  {event.stepId && <span>step {event.stepId}</span>}
                  <span>{event.createdAt}</span>
                  {event.completedAt && <span>completed {event.completedAt}</span>}
                </div>
                {event.summary && <p className="mt-1 text-muted-foreground">{event.summary}</p>}
              </div>
            ))}
            {events.length === 0 && <p className="text-xs text-muted-foreground">No trace events loaded.</p>}
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 break-all text-foreground">{value}</div>
    </div>
  )
}
