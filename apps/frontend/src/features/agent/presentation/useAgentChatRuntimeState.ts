import { useRef, useState } from 'react'
import { useStreamingAssistantBuffer } from '@/features/agent/application/agentStreamingAssistant'
import { useAgentLiveRunActivity } from '@/features/agent/presentation/agentLiveRunActivity'
import type { AgentSendDraft } from '@/features/agent/application/agentSendDraft'
import { STOPPED_RUNTIME_STATUS_LIGHT } from '@/features/agent/domain/agentRuntimeStatusLight'
import type { AgentRun } from '@/shared/infrastructure/localAgentClient'
import { useAgentConversationRunReset } from '@/features/agent/presentation/useAgentConversationRunReset'

const STREAMING_ASSISTANT_FLUSH_MS = 50

interface UseAgentChatRuntimeStateInput {
  conversationId: string
}

export function useAgentChatRuntimeState({
  conversationId,
}: UseAgentChatRuntimeStateInput) {
  const [debugBeforeSend, setDebugBeforeSend] = useState(false)
  const [planActionBusy, setPlanActionBusy] = useState(false)
  const [pendingSendDraft, setPendingSendDraft] = useState<AgentSendDraft | null>(null)
  const [runtimeStatusLight, setRuntimeStatusLight] = useState(STOPPED_RUNTIME_STATUS_LIGHT)
  const [submittedInteractionRuns, setSubmittedInteractionRuns] = useState<AgentRun[]>([])
  const cancelRequestedRunIdsRef = useRef<Set<string>>(new Set())
  const activeSendAbortControllerRef = useRef<AbortController | null>(null)
  const processedExternalTaskRequestIdRef = useRef<string | null>(null)
  const inputRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const {
    streamingAssistantMessageId,
    streamingAssistantText,
    resetStreamingAssistant,
    updateStreamingAssistantText,
    getStreamingAssistantMessageId,
  } = useStreamingAssistantBuffer({ flushMs: STREAMING_ASSISTANT_FLUSH_MS })
  const {
    liveTraceEventsRef,
    pendingAssistantState,
    visibleActivityEvents,
    recordLiveTraceEvent,
    resetLiveRunActivity,
    setLiveTraceEvents,
    setPendingAssistantState,
    setPendingHttpEvents,
  } = useAgentLiveRunActivity()

  useAgentConversationRunReset({
    conversationId,
    resetLiveRunActivity,
    setSubmittedInteractionRuns,
  })

  return {
    activeSendAbortControllerRef,
    cancelRequestedRunIdsRef,
    debugBeforeSend,
    fileRef,
    getStreamingAssistantMessageId,
    inputRef,
    liveTraceEventsRef,
    pendingAssistantState,
    pendingSendDraft,
    planActionBusy,
    processedExternalTaskRequestIdRef,
    recordLiveTraceEvent,
    resetStreamingAssistant,
    setDebugBeforeSend,
    setLiveTraceEvents,
    setPendingAssistantState,
    setPendingHttpEvents,
    setPendingSendDraft,
    setPlanActionBusy,
    setRuntimeStatusLight,
    setSubmittedInteractionRuns,
    runtimeStatusLight,
    streamingAssistantMessageId,
    streamingAssistantText,
    submittedInteractionRuns,
    updateStreamingAssistantText,
    visibleActivityEvents,
  }
}
