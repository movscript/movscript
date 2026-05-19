import { useCallback, useEffect, useRef, useState } from 'react'

export interface StreamingAssistantTurnInput {
  currentMessageId?: string | null
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
  const messageId = input.currentMessageId ?? `stream-${input.runId}`
  const turnKey = typeof input.roundIndex === 'number' ? input.roundIndex : 0
  const turns = new Map(input.turns)
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
  const textRef = useRef('')
  const turnsRef = useRef<Map<number, string>>(new Map())
  const flushTimerRef = useRef<number | null>(null)

  const resetStreamingAssistant = useCallback(() => {
    if (flushTimerRef.current !== null) {
      window.clearTimeout(flushTimerRef.current)
      flushTimerRef.current = null
    }
    messageIdRef.current = null
    textRef.current = ''
    turnsRef.current = new Map()
    setStreamingAssistantMessageId(null)
    setStreamingAssistantText('')
  }, [])

  const updateStreamingAssistantText = useCallback((runId: string, text: string, roundIndex?: number) => {
    const projection = projectStreamingAssistantTurn({
      currentMessageId: messageIdRef.current,
      turns: turnsRef.current,
      runId,
      text,
      roundIndex,
    })
    if (!projection) return
    messageIdRef.current = projection.messageId
    textRef.current = projection.text
    turnsRef.current = projection.turns
    setStreamingAssistantMessageId((current) => current ?? projection.messageId)
    setStreamingAssistantText((current) => (current === projection.text ? current : projection.text))
    if (flushTimerRef.current !== null) return
    flushTimerRef.current = window.setTimeout(() => {
      flushTimerRef.current = null
      setStreamingAssistantText(textRef.current)
    }, input.flushMs)
  }, [input.flushMs])

  const getStreamingAssistantMessageId = useCallback(() => messageIdRef.current, [])

  useEffect(() => () => {
    if (flushTimerRef.current !== null) window.clearTimeout(flushTimerRef.current)
  }, [])

  return {
    streamingAssistantMessageId,
    streamingAssistantText,
    resetStreamingAssistant,
    updateStreamingAssistantText,
    getStreamingAssistantMessageId,
  }
}
