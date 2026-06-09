import { useEffect, useMemo, useState } from 'react'
import { Check, Clipboard, Network, RefreshCw, Trash2 } from 'lucide-react'
import {
  AgentConsoleActionButton,
  AgentConsoleHeader,
  AgentConsoleHeaderActions,
  AgentConsoleHeaderCopy,
  AgentConsoleHeaderDescription,
  AgentConsoleHeaderTitle,
  AgentConsoleHeaderTitleRow,
  AgentConsoleStatusBadge,
  AgentPageShell,
  AgentPageShellHeader,
  AgentThreePanePageBody,
  AgentThreePanePagePane,
} from '@movscript/ui'
import { AgentConsoleNav } from '@/features/agent/components/AgentConsoleNav'
import {
  AGENT_CONNECTION_DEBUG_GLOBAL_THREAD_ID,
  agentConnectionDebugRawText,
  clearAgentConnectionDebugEvents,
  useAgentConnectionDebugSnapshot,
  useAgentConnectionDebugThreadEvents,
  type AgentConnectionDebugDirection,
  type AgentConnectionDebugEvent,
  type AgentConnectionDebugThreadSummary,
} from '@/shared/infrastructure/agentConnectionDebugStore'

type DirectionFilter = 'all' | AgentConnectionDebugDirection

export default function AgentConnectionsPage() {
  const snapshot = useAgentConnectionDebugSnapshot()
  const [selectedThreadId, setSelectedThreadId] = useState<string>(AGENT_CONNECTION_DEBUG_GLOBAL_THREAD_ID)
  const activeThreadId = snapshot.threads.some((thread) => thread.threadId === selectedThreadId)
    ? selectedThreadId
    : snapshot.threads[0]?.threadId ?? AGENT_CONNECTION_DEBUG_GLOBAL_THREAD_ID
  const events = useAgentConnectionDebugThreadEvents(activeThreadId)
  const [direction, setDirection] = useState<DirectionFilter>('all')
  const filteredEvents = useMemo(
    () => direction === 'all' ? events : events.filter((event) => event.direction === direction),
    [direction, events],
  )
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const selectedEvent = filteredEvents.find((event) => event.id === selectedEventId)
    ?? filteredEvents[filteredEvents.length - 1]
    ?? null
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (activeThreadId !== selectedThreadId) setSelectedThreadId(activeThreadId)
  }, [activeThreadId, selectedThreadId])

  useEffect(() => {
    if (selectedEventId && filteredEvents.some((event) => event.id === selectedEventId)) return
    setSelectedEventId(filteredEvents[filteredEvents.length - 1]?.id ?? null)
  }, [filteredEvents, selectedEventId])

  async function copySelectedThread() {
    const payload = {
      threadId: activeThreadId,
      events,
    }
    await copyText(agentConnectionDebugRawText(payload))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  return (
    <AgentPageShell data-testid="agent-connections-page">
      <AgentPageShellHeader>
        <AgentConsoleHeader>
          <AgentConsoleHeaderCopy>
            <AgentConsoleHeaderTitleRow>
              <Network size={18} />
              <AgentConsoleHeaderTitle>连接观测</AgentConsoleHeaderTitle>
              <AgentConsoleStatusBadge intent={snapshot.totalEvents > 0 ? 'info' : 'neutral'} emphasis="soft">
                {snapshot.totalEvents} 条
              </AgentConsoleStatusBadge>
            </AgentConsoleHeaderTitleRow>
            <AgentConsoleHeaderDescription>
              前端统一记录 app-server RPC 的裸请求和裸返回；每个 thread 保留最近 500 条。
            </AgentConsoleHeaderDescription>
          </AgentConsoleHeaderCopy>
          <AgentConsoleHeaderActions>
            <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={() => void copySelectedThread()} disabled={events.length === 0}>
              {copied ? <Check size={14} /> : <Clipboard size={14} />}
              {copied ? '已复制' : '复制当前'}
            </AgentConsoleActionButton>
            <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={() => clearAgentConnectionDebugEvents(activeThreadId)} disabled={events.length === 0}>
              <Trash2 size={14} />
              清空当前
            </AgentConsoleActionButton>
            <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={() => clearAgentConnectionDebugEvents()} disabled={snapshot.totalEvents === 0}>
              <RefreshCw size={14} />
              清空全部
            </AgentConsoleActionButton>
          </AgentConsoleHeaderActions>
        </AgentConsoleHeader>
      </AgentPageShellHeader>

      <AgentConsoleNav compact />

      <AgentThreePanePageBody>
        <AgentThreePanePagePane data-testid="agent-connections-threads-pane">
          <div className="min-h-0 flex-1 overflow-auto p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Threads</h2>
              <span className="text-xs text-muted-foreground">{snapshot.threads.length}</span>
            </div>
            <div className="space-y-2">
              {snapshot.threads.length === 0 ? (
                <p className="rounded border border-dashed border-border p-3 text-xs text-muted-foreground">
                  暂无连接事件。发起一次 agent 请求后这里会出现 thread。
                </p>
              ) : snapshot.threads.map((thread) => (
                <ThreadButton
                  key={thread.threadId}
                  thread={thread}
                  active={thread.threadId === activeThreadId}
                  onClick={() => setSelectedThreadId(thread.threadId)}
                />
              ))}
            </div>
          </div>
        </AgentThreePanePagePane>

        <AgentThreePanePagePane data-testid="agent-connections-events-pane">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">请求 / 返回</h2>
              <p className="text-xs text-muted-foreground">{activeThreadId === AGENT_CONNECTION_DEBUG_GLOBAL_THREAD_ID ? 'Global' : activeThreadId}</p>
            </div>
            <div className="flex rounded border border-border p-0.5">
              {(['all', 'request', 'response'] as DirectionFilter[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  className={item === direction
                    ? 'rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground'
                    : 'rounded px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground'}
                  onClick={() => setDirection(item)}
                >
                  {item === 'all' ? '全部' : item === 'request' ? '请求' : '返回'}
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {filteredEvents.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">没有匹配的事件。</p>
            ) : filteredEvents.slice().reverse().map((event) => (
              <EventButton
                key={event.id}
                event={event}
                active={selectedEvent?.id === event.id}
                onClick={() => setSelectedEventId(event.id)}
              />
            ))}
          </div>
        </AgentThreePanePagePane>

        <AgentThreePanePagePane tone="raw" data-testid="agent-connections-raw-pane">
          <div className="flex items-start justify-between gap-3 border-b border-border p-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">裸信息</h2>
              <p className="text-xs text-muted-foreground">
                {selectedEvent ? `${selectedEvent.direction} · ${selectedEvent.method ?? 'unknown'} · ${formatTime(selectedEvent.timestamp)}` : '未选择事件'}
              </p>
            </div>
            <AgentConsoleActionButton
              type="button"
              size="sm"
              variant="outline"
              disabled={!selectedEvent}
              onClick={() => selectedEvent ? void copyText(agentConnectionDebugRawText(selectedEvent.raw)) : undefined}
            >
              <Clipboard size={14} />
              复制
            </AgentConsoleActionButton>
          </div>
          <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-xs leading-5 text-foreground">
            {selectedEvent ? agentConnectionDebugRawText(selectedEvent.raw) : 'No raw event selected.'}
          </pre>
        </AgentThreePanePagePane>
      </AgentThreePanePageBody>
    </AgentPageShell>
  )
}

function ThreadButton({
  thread,
  active,
  onClick,
}: {
  thread: AgentConnectionDebugThreadSummary
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={active
        ? 'block w-full rounded border border-primary bg-primary/10 p-3 text-left'
        : 'block w-full rounded border border-border bg-background p-3 text-left hover:border-primary/50 hover:bg-muted/60'}
      onClick={onClick}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium text-foreground">{thread.label}</span>
        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{thread.eventCount}</span>
      </div>
      <p className="mt-1 truncate text-xs text-muted-foreground">{thread.lastMethod ?? 'unknown'}</p>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{thread.requestCount} 请求 / {thread.responseCount} 返回</span>
        <span>{thread.lastEventAt ? formatTime(thread.lastEventAt) : '-'}</span>
      </div>
    </button>
  )
}

function EventButton({
  event,
  active,
  onClick,
}: {
  event: AgentConnectionDebugEvent
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={active
        ? 'block w-full border-b border-border bg-primary/10 p-3 text-left'
        : 'block w-full border-b border-border p-3 text-left hover:bg-muted/60'}
      onClick={onClick}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={event.direction === 'request'
          ? 'rounded bg-blue-500/10 px-1.5 py-0.5 text-xs font-medium text-blue-600'
          : 'rounded bg-emerald-500/10 px-1.5 py-0.5 text-xs font-medium text-emerald-600'}
        >
          {event.direction === 'request' ? '请求' : '返回'}
        </span>
        <span className="text-xs text-muted-foreground">{formatTime(event.timestamp)}</span>
      </div>
      <p className="mt-2 truncate text-sm font-medium text-foreground">{event.method ?? 'unknown'}</p>
      <p className="mt-1 truncate text-xs text-muted-foreground">
        {event.requestId !== undefined && event.requestId !== null ? `requestId ${event.requestId}` : event.connectionId ?? event.source}
      </p>
    </button>
  )
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(timestamp))
}

async function copyText(text: string): Promise<void> {
  await navigator.clipboard?.writeText(text)
}
