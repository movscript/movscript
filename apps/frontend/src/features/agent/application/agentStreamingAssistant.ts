import { useCallback, useEffect, useRef, useState } from 'react'
import { performanceNow, recordAgentPerformanceMetric } from '@/features/agent/state/agentPerformanceStore'

export interface StreamingAssistantTurnInput {
  currentMessageId?: string | null
  currentRunId?: string | null
  turns: Map<number, string>
  runId: string
  text: string
  roundIndex?: number
}

export interface StreamingAssistantTurnProjection {
  messageId: string
  text: string
  turns: Map<number, string>
}

export function projectStreamingAssistantTurn(input: StreamingAssistantTurnInput): StreamingAssistantTurnProjection | null {
  if (!input.text.trim()) return null
  const sameRun = !input.currentRunId || input.currentRunId === input.runId
  const messageId = sameRun && input.currentMessageId ? input.currentMessageId : `stream-${input.runId}`
  const turnKey = typeof input.roundIndex === 'number' ? input.roundIndex : 0
  const turns = sameRun ? new Map(input.turns) : new Map<number, string>()
  turns.set(turnKey, input.text)
  const text = Array.from(turns.entries())
    .sort(([left], [right]) => left - right)
    .map(([, content]) => content.trim())
    .filter(Boolean)
    .join('\n\n')
  return { messageId, text, turns }
}

export function useStreamingAssistantBuffer(input: { flushMs: number }) {
  const [streamingAssistantMessageId, setStreamingAssistantMessageId] = useState<string | null>(null)
  const [streamingAssistantText, setStreamingAssistantText] = useState('')
  const messageIdRef = useRef<string | null>(null)
  const runIdRef = useRef<string | null>(null)
  const textRef = useRef('')
  const displayedTextRef = useRef('')
  const turnsRef = useRef<Map<number, string>>(new Map())
  const settledRunIdsRef = useRef<Set<string>>(new Set())
  const flushTimerRef = useRef<number | null>(null)
  const statsRef = useRef<StreamingAssistantBufferStats>(emptyStreamingAssistantBufferStats())

  const resetStreamingAssistant = useCallback((settledRunId?: string) => {
    if (flushTimerRef.current !== null) {
      window.clearTimeout(flushTimerRef.current)
      flushTimerRef.current = null
    }
    flushStreamingAssistantText(textRef.current, displayedTextRef)
    recordStreamingAssistantBufferStats(statsRef.current)
    if (settledRunId) settledRunIdsRef.current.add(settledRunId)
    messageIdRef.current = null
    runIdRef.current = null
    textRef.current = ''
    displayedTextRef.current = ''
    turnsRef.current = new Map()
    statsRef.current = emptyStreamingAssistantBufferStats()
    setStreamingAssistantMessageId(null)
    setStreamingAssistantText('')
  }, [])

  const updateStreamingAssistantText = useCallback((runId: string, text: string, roundIndex?: number) => {
    if (settledRunIdsRef.current.has(runId)) return
    const projection = projectStreamingAssistantTurn({
      currentMessageId: messageIdRef.current,
      currentRunId: runIdRef.current,
      turns: turnsRef.current,
      runId,
      text,
      roundIndex,
    })
    if (!projection) return
    messageIdRef.current = projection.messageId
    runIdRef.current = runId
    textRef.current = projection.text
    turnsRef.current = projection.turns
    recordStreamingAssistantUpdate(statsRef.current, projection.text)
    setStreamingAssistantMessageId((current) => current ?? projection.messageId)
    if (!displayedTextRef.current) {
      flushStreamingAssistantText(projection.text, displayedTextRef, setStreamingAssistantText)
      return
    }
    if (flushTimerRef.current !== null) return
    flushTimerRef.current = window.setTimeout(() => {
      flushTimerRef.current = null
      flushStreamingAssistantText(textRef.current, displayedTextRef, setStreamingAssistantText)
      statsRef.current.flushCount += 1
    }, input.flushMs)
  }, [input.flushMs])

  useEffect(() => () => {
    if (flushTimerRef.current !== null) window.clearTimeout(flushTimerRef.current)
    recordStreamingAssistantBufferStats(statsRef.current)
  }, [])

  return {
    streamingAssistantMessageId,
    streamingAssistantText,
    resetStreamingAssistant,
    updateStreamingAssistantText,
  }
}

interface StreamingAssistantBufferStats {
  startedMs?: number
  updateCount: number
  maxChars: number
  flushCount: number
}

function emptyStreamingAssistantBufferStats(): StreamingAssistantBufferStats {
  return {
    updateCount: 0,
    maxChars: 0,
    flushCount: 0,
  }
}

function recordStreamingAssistantUpdate(stats: StreamingAssistantBufferStats, text: string): void {
  stats.startedMs ??= performanceNow()
  stats.updateCount += 1
  stats.maxChars = Math.max(stats.maxChars, text.length)
}

function flushStreamingAssistantText(
  text: string,
  displayedTextRef: { current: string },
  setStreamingAssistantText?: (value: string) => void,
): void {
  if (displayedTextRef.current === text) return
  displayedTextRef.current = text
  setStreamingAssistantText?.(text)
}

function recordStreamingAssistantBufferStats(stats: StreamingAssistantBufferStats): void {
  if (!stats.startedMs || stats.updateCount === 0) return
  const labels = {
    area: 'agent_frontend',
    component: 'agent_chat',
    kind: 'assistant_stream',
  }
  recordAgentPerformanceMetric({
    name: 'frontend_agent_stream_buffer_lifetime_ms',
    value: Math.max(0, performanceNow() - stats.startedMs),
    unit: 'ms',
    labels,
  })
  recordAgentPerformanceMetric({
    name: 'frontend_agent_stream_update_total',
    value: stats.updateCount,
    unit: 'count',
    labels,
  })
  recordAgentPerformanceMetric({
    name: 'frontend_agent_stream_flush_total',
    value: stats.flushCount,
    unit: 'count',
    labels,
  })
  recordAgentPerformanceMetric({
    name: 'frontend_agent_stream_text_chars',
    value: stats.maxChars,
    unit: 'count',
    labels,
  })
}
