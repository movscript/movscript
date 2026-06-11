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
  AgentThreePanePageEmptyText,
  AgentThreePanePageItemBadge,
  AgentThreePanePageItemButton,
  AgentThreePanePageItemDetail,
  AgentThreePanePageItemHeader,
  AgentThreePanePageItemMetaRow,
  AgentThreePanePageItemTime,
  AgentThreePanePageItemTitle,
  AgentThreePanePageListHeader,
  AgentThreePanePageListMeta,
  AgentThreePanePageListStack,
  AgentThreePanePageListTitle,
  AgentThreePanePagePane,
  AgentThreePanePagePaneDescription,
  AgentThreePanePagePaneHeader,
  AgentThreePanePagePaneHeaderCopy,
  AgentThreePanePagePaneRaw,
  AgentThreePanePagePaneScroller,
  AgentThreePanePagePaneTitle,
  AgentThreePanePageSegmentButton,
  AgentThreePanePageSegmentedControl,
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
          <AgentThreePanePagePaneScroller>
            <AgentThreePanePageListHeader>
              <AgentThreePanePageListTitle>Threads</AgentThreePanePageListTitle>
              <AgentThreePanePageListMeta>{snapshot.threads.length}</AgentThreePanePageListMeta>
            </AgentThreePanePageListHeader>
            <AgentThreePanePageListStack>
              {snapshot.threads.length === 0 ? (
                <AgentThreePanePageEmptyText>
                  暂无连接事件。发起一次 agent 请求后这里会出现 thread。
                </AgentThreePanePageEmptyText>
              ) : snapshot.threads.map((thread) => (
                <ThreadButton
                  key={thread.threadId}
                  thread={thread}
                  active={thread.threadId === activeThreadId}
                  onClick={() => setSelectedThreadId(thread.threadId)}
                />
              ))}
            </AgentThreePanePageListStack>
          </AgentThreePanePagePaneScroller>
        </AgentThreePanePagePane>

        <AgentThreePanePagePane data-testid="agent-connections-events-pane">
          <AgentThreePanePagePaneHeader>
            <AgentThreePanePagePaneHeaderCopy>
              <AgentThreePanePagePaneTitle>请求 / 返回</AgentThreePanePagePaneTitle>
              <AgentThreePanePagePaneDescription>{activeThreadId === AGENT_CONNECTION_DEBUG_GLOBAL_THREAD_ID ? 'Global' : activeThreadId}</AgentThreePanePagePaneDescription>
            </AgentThreePanePagePaneHeaderCopy>
            <AgentThreePanePageSegmentedControl>
              {(['all', 'request', 'response'] as DirectionFilter[]).map((item) => (
                <AgentThreePanePageSegmentButton
                  key={item}
                  active={item === direction}
                  onClick={() => setDirection(item)}
                >
                  {item === 'all' ? '全部' : item === 'request' ? '请求' : '返回'}
                </AgentThreePanePageSegmentButton>
              ))}
            </AgentThreePanePageSegmentedControl>
          </AgentThreePanePagePaneHeader>
          <AgentThreePanePagePaneScroller padding="none">
            {filteredEvents.length === 0 ? (
              <AgentThreePanePageEmptyText>没有匹配的事件。</AgentThreePanePageEmptyText>
            ) : filteredEvents.slice().reverse().map((event) => (
              <EventButton
                key={event.id}
                event={event}
                active={selectedEvent?.id === event.id}
                onClick={() => setSelectedEventId(event.id)}
              />
            ))}
          </AgentThreePanePagePaneScroller>
        </AgentThreePanePagePane>

        <AgentThreePanePagePane tone="raw" data-testid="agent-connections-raw-pane">
          <AgentThreePanePagePaneHeader>
            <AgentThreePanePagePaneHeaderCopy>
              <AgentThreePanePagePaneTitle>裸信息</AgentThreePanePagePaneTitle>
              <AgentThreePanePagePaneDescription>
                {selectedEvent ? `${selectedEvent.direction} · ${selectedEvent.method ?? 'unknown'} · ${formatTime(selectedEvent.timestamp)}` : '未选择事件'}
              </AgentThreePanePagePaneDescription>
            </AgentThreePanePagePaneHeaderCopy>
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
          </AgentThreePanePagePaneHeader>
          <AgentThreePanePagePaneRaw>
            {selectedEvent ? agentConnectionDebugRawText(selectedEvent.raw) : 'No raw event selected.'}
          </AgentThreePanePagePaneRaw>
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
    <AgentThreePanePageItemButton active={active} onClick={onClick}>
      <AgentThreePanePageItemHeader>
        <AgentThreePanePageItemTitle>{thread.label}</AgentThreePanePageItemTitle>
        <AgentThreePanePageItemBadge>{thread.eventCount}</AgentThreePanePageItemBadge>
      </AgentThreePanePageItemHeader>
      <AgentThreePanePageItemDetail>{thread.lastMethod ?? 'unknown'}</AgentThreePanePageItemDetail>
      <AgentThreePanePageItemMetaRow>
        <span>{thread.requestCount} 请求 / {thread.responseCount} 返回</span>
        <span>{thread.lastEventAt ? formatTime(thread.lastEventAt) : '-'}</span>
      </AgentThreePanePageItemMetaRow>
    </AgentThreePanePageItemButton>
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
    <AgentThreePanePageItemButton active={active} variant="row" onClick={onClick}>
      <AgentThreePanePageItemHeader>
        <AgentThreePanePageItemBadge tone={event.direction === 'request' ? 'info' : 'success'}>
          {event.direction === 'request' ? '请求' : '返回'}
        </AgentThreePanePageItemBadge>
        <AgentThreePanePageItemTime>{formatTime(event.timestamp)}</AgentThreePanePageItemTime>
      </AgentThreePanePageItemHeader>
      <AgentThreePanePageItemTitle>{event.method ?? 'unknown'}</AgentThreePanePageItemTitle>
      <AgentThreePanePageItemDetail>
        {event.requestId !== undefined && event.requestId !== null ? `requestId ${event.requestId}` : event.connectionId ?? event.source}
      </AgentThreePanePageItemDetail>
    </AgentThreePanePageItemButton>
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
