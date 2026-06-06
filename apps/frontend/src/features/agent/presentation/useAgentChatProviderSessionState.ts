import { useRef, useState } from 'react'
import { useStreamingAssistantBuffer } from '@/features/agent/application/agentStreamingAssistant'
import { useAgentLiveRunActivity } from '@/features/agent/presentation/agentLiveRunActivity'
import type { AgentSendWorkspace } from '@/features/agent/application/agentSendWorkspace'
import { STOPPED_PROVIDER_SESSION_STATUS_LIGHT } from '@/features/agent/domain/providerSessionStatusLight'
import type { AgentRun } from '@/shared/infrastructure/providerSessionClient'
import { useAgentConversationRunReset } from '@/features/agent/presentation/useAgentConversationRunReset'

const STREAMING_ASSISTANT_FLUSH_MS = 50

interface UseAgentChatProviderSessionStateInput {
  activeRunId?: string | null
  conversationId: string
}

export function useAgentChatProviderSessionState({
  activeRunId,
  conversationId,
}: UseAgentChatProviderSessionStateInput) {
  const [debugBeforeSend, setDebugBeforeSend] = useState(false)
  const [planActionBusy, setPlanActionBusy] = useState(false)
  const [pendingSendWorkspace, setPendingSendWorkspace] = useState<AgentSendWorkspace | null>(null)
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
    activeRunId,
    conversationId,
    resetLiveRunActivity,
    resetStreamingAssistant,
    setSubmittedInteractionRuns,
  })

  return {
    activeSendAbortControllerRef,
    cancelRequestedRunIdsRef,
    debugBeforeSend,
    fileRef,
    inputRef,
    liveTraceEventsRef,
    pendingAssistantState,
    pendingSendWorkspace,
    planActionBusy,
    processedExternalTaskRequestIdRef,
    recordLiveTraceEvent,
    resetStreamingAssistant,
    setDebugBeforeSend,
    setLiveTraceEvents,
    setPendingAssistantState,
    setPendingHttpEvents,
    setPendingSendWorkspace,
    setPlanActionBusy,
    setSubmittedInteractionRuns,
    providerSessionStatusLight: STOPPED_PROVIDER_SESSION_STATUS_LIGHT,
    streamingAssistantMessageId,
    streamingAssistantText,
    submittedInteractionRuns,
    updateStreamingAssistantText,
    visibleActivityEvents,
  }
}
