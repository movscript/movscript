import { useCallback, useMemo, useRef, useState, type SetStateAction } from 'react'
import { liveTraceEventKey, mergeLiveRunActivityEvent, projectLiveRunProviderSessionTraceEvent } from '@/features/agent/domain/agentRunActivity'
import type { AgentThinkingState } from '@/features/agent/domain/agentThinkingState'
import type { ProviderSessionEventV2 } from '@movscript/agent-protocol'
import type { ChatRunActivityEvent } from '@/features/agent/state/agentStore'

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
  const [pendingAssistantState, setPendingAssistantState] = useState<AgentThinkingState | null>(null)
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

  const recordLiveTraceEvent = useCallback((event: ProviderSessionEventV2) => {
    const projected = projectLiveRunProviderSessionTraceEvent(event)
    if (!projected) return
    if (projected.pendingAssistantState !== undefined) {
      const nextPendingAssistantState = projected.pendingAssistantState
      setPendingAssistantState((current) => {
        if (!nextPendingAssistantState) return nextPendingAssistantState
        if (current?.reasoning && !nextPendingAssistantState.reasoning) {
          return { ...nextPendingAssistantState, reasoning: current.reasoning }
        }
        return nextPendingAssistantState
      })
    }
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
