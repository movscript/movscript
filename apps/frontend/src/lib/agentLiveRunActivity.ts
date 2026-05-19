import { useCallback, useMemo, useRef, useState, type SetStateAction } from 'react'
import { liveTraceEventKey, mergeLiveRunActivityEvent, projectLiveRunStreamTraceEvent } from '@/lib/agentRunActivity'
import type { AgentRunStreamEvent } from '@/lib/localAgentClient'
import type { ChatRunActivityEvent } from '@/store/agentStore'

export interface AgentLivePendingAssistantState {
  status: 'preparing_request' | 'thinking' | 'preparing_tool_call' | 'calling_tool' | 'retrying_model'
  toolName?: string
  label?: string
}

export function mergeVisibleActivityEvents(liveTraceEvents: ChatRunActivityEvent[], pendingHttpEvents: ChatRunActivityEvent[]): ChatRunActivityEvent[] {
  if (!pendingHttpEvents.length) return liveTraceEvents
  const existing = new Set(liveTraceEvents.map(liveTraceEventKey))
  return [
    ...pendingHttpEvents.filter((event) => !existing.has(liveTraceEventKey(event))),
    ...liveTraceEvents,
  ]
}

export function useAgentLiveRunActivity() {
  const [liveTraceEvents, setLiveTraceEventsState] = useState<ChatRunActivityEvent[]>([])
  const [pendingAssistantState, setPendingAssistantState] = useState<AgentLivePendingAssistantState | null>(null)
  const [pendingHttpEvents, setPendingHttpEvents] = useState<ChatRunActivityEvent[]>([])
  const liveTraceEventsRef = useRef<ChatRunActivityEvent[]>([])

  const setLiveTraceEvents = useCallback((action: SetStateAction<ChatRunActivityEvent[]>) => {
    setLiveTraceEventsState((current) => {
      const next = typeof action === 'function'
        ? (action as (value: ChatRunActivityEvent[]) => ChatRunActivityEvent[])(current)
        : action
      liveTraceEventsRef.current = next
      return next
    })
  }, [])

  const resetLiveRunActivity = useCallback(() => {
    liveTraceEventsRef.current = []
    setLiveTraceEventsState([])
    setPendingHttpEvents([])
    setPendingAssistantState(null)
  }, [])

  const visibleActivityEvents = useMemo(() => mergeVisibleActivityEvents(liveTraceEvents, pendingHttpEvents), [liveTraceEvents, pendingHttpEvents])

  const recordLiveTraceEvent = useCallback((event: AgentRunStreamEvent) => {
    const projected = projectLiveRunStreamTraceEvent(event)
    if (!projected) return
    if (projected.pendingAssistantState !== undefined) setPendingAssistantState(projected.pendingAssistantState)
    const item = projected.activityEvent
    setLiveTraceEvents((current) => mergeLiveRunActivityEvent(current, item))
  }, [setLiveTraceEvents])

  return {
    liveTraceEvents,
    liveTraceEventsRef,
    pendingAssistantState,
    pendingHttpEvents,
    visibleActivityEvents,
    recordLiveTraceEvent,
    resetLiveRunActivity,
    setLiveTraceEvents,
    setPendingAssistantState,
    setPendingHttpEvents,
  }
}
