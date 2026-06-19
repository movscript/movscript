import { useCallback, useEffect, useRef, type Dispatch } from 'react'
import {
  consumeAgentPanelDecisionRequest,
  subscribeAgentPanelDecisionRequest,
  type AgentPanelDecisionRequestPayload,
} from '@/features/agent/application/agentPanelBridge'
import {
  markAgentChatNotificationProjected,
  projectAgentChatCrossPageNotification,
} from '@/features/agent/application/agentCrossPageNotificationProjection'
import {
  applyAgentChatPersistentServerRequestNotification,
  readAgentChatPersistentServerRequests,
  storeAgentChatPersistentServerRequest,
} from '@/features/agent/application/agentChatRuntimeCache'
import { replayAgentChatPersistentServerRequests } from '@/features/agent/application/agentChatServerRequestReplay'
import { agentChatThreadTitleUpdateFromNotification } from '@/features/agent/application/agentChatThreadTitleSync'
import {
  agentChatServerRequestResponseForAction,
  agentChatThreadIdForServerRequest,
  type AgentChatDataSource,
  type AgentChatNotification,
  type AgentChatRuntimeAction,
  type AgentChatServerRequest,
  type AgentChatServerRequestResponse,
} from '@movscript/core/agent/chat'
import { subscribeCrossPageNotifications } from '@/shared/application/crossPageNotifications'

interface UseAgentChatServerRequestsInput {
  activeThreadId: string | null
  dataSource?: AgentChatDataSource
  dispatchRuntime: Dispatch<AgentChatRuntimeAction>
  getActiveThreadId: () => string | null
  markThreadOpen: (threadId: string) => void
  nextRecentEventSequence: () => number
  setActiveThreadIdValue: (threadId: string | null) => void
  syncThreadConversationTitle?: (threadId: string, title: string) => void
  threadScopeKey: string
}

export function useAgentChatServerRequests({
  activeThreadId,
  dataSource,
  dispatchRuntime,
  getActiveThreadId,
  markThreadOpen,
  nextRecentEventSequence,
  setActiveThreadIdValue,
  syncThreadConversationTitle,
  threadScopeKey,
}: UseAgentChatServerRequestsInput) {
  const projectedNotificationKeysRef = useRef<Set<string>>(new Set())

  const replayPersistentServerRequests = useCallback(() => {
    const entries = readAgentChatPersistentServerRequests(threadScopeKey)
    if (entries.length === 0) return
    dispatchRuntime({
      type: 'updatePendingServerRequests',
      update: (current) => replayAgentChatPersistentServerRequests({ current, persistent: entries }).pendingServerRequests,
    })
  }, [dispatchRuntime, threadScopeKey])

  const activateRequestThread = useCallback((request: AgentChatServerRequest) => {
    const requestThreadId = agentChatThreadIdForServerRequest(getActiveThreadId(), request)
    if (!requestThreadId) return
    setActiveThreadIdValue(requestThreadId)
    markThreadOpen(requestThreadId)
  }, [getActiveThreadId, markThreadOpen, setActiveThreadIdValue])

  const handleServerRequest = useCallback((request: AgentChatServerRequest) => {
    if (request.method === 'attestation/generate') {
      return agentChatServerRequestResponseForAction(request, { type: 'reject' })
    }
    activateRequestThread(request)
    return new Promise<AgentChatServerRequestResponse | undefined>((resolve) => {
      const persistentResolve = storeAgentChatPersistentServerRequest(threadScopeKey, request, resolve)
      dispatchRuntime({ type: 'enqueueServerRequest', request, resolve: persistentResolve })
    })
  }, [activateRequestThread, dispatchRuntime, threadScopeKey])

  const handleLocalDecisionRequest = useCallback((payload: AgentPanelDecisionRequestPayload | undefined) => {
    if (!payload?.request) return
    const request = payload.request
    activateRequestThread(request)
    const resolve = (response: AgentChatServerRequestResponse | undefined) => {
      void Promise.resolve(payload.onResolve?.(response)).catch((error) => {
        console.error('[agent-panel] decision request resolver failed', error)
      })
    }
    const persistentResolve = storeAgentChatPersistentServerRequest(threadScopeKey, request, resolve)
    dispatchRuntime({ type: 'enqueueServerRequest', request, resolve: persistentResolve })
  }, [activateRequestThread, dispatchRuntime, threadScopeKey])

  const syncNotificationThreadTitle = useCallback((notification: AgentChatNotification) => {
    const update = agentChatThreadTitleUpdateFromNotification(notification)
    if (update) syncThreadConversationTitle?.(update.threadId, update.title)
  }, [syncThreadConversationTitle])

  useEffect(() => {
    function replayPendingDecisionRequests() {
      for (let payload = consumeAgentPanelDecisionRequest(); payload; payload = consumeAgentPanelDecisionRequest()) {
        handleLocalDecisionRequest(payload)
      }
    }

    replayPendingDecisionRequests()
    return subscribeAgentPanelDecisionRequest((payload) => {
      handleLocalDecisionRequest(consumeAgentPanelDecisionRequest() ?? payload)
    })
  }, [handleLocalDecisionRequest])

  useEffect(() => {
    replayPersistentServerRequests()
  }, [activeThreadId, dataSource, replayPersistentServerRequests])

  const handleNotification = useCallback((notification: AgentChatNotification) => {
    markAgentChatNotificationProjected(projectedNotificationKeysRef, notification)
    applyAgentChatPersistentServerRequestNotification(threadScopeKey, notification)
    syncNotificationThreadTitle(notification)
    dispatchRuntime({
      type: 'applyNotification',
      notification,
      nowMs: Date.now(),
      recentEventSequence: nextRecentEventSequence(),
    })
  }, [dispatchRuntime, nextRecentEventSequence, syncNotificationThreadTitle, threadScopeKey])

  useEffect(() => {
    return subscribeCrossPageNotifications((event) => {
      const projected = projectAgentChatCrossPageNotification({
        event,
        activeThreadId,
        dispatchRuntime,
        nextRecentEventSequence,
        seenKeysRef: projectedNotificationKeysRef,
      })
      if (!projected) return
      const notification = event.topic === 'agent-chat' || event.topic === 'mcp-status' || event.topic === 'capability'
        ? (event.payload as { notification?: AgentChatNotification } | undefined)?.notification
        : undefined
      if (notification) {
        applyAgentChatPersistentServerRequestNotification(threadScopeKey, notification)
        syncNotificationThreadTitle(notification)
      }
    })
  }, [activeThreadId, dispatchRuntime, nextRecentEventSequence, syncNotificationThreadTitle, threadScopeKey])

  useEffect(() => {
    if (!dataSource?.subscribeServerRequests) return undefined
    const controller = new AbortController()
    let dispose: (() => void) | undefined
    void Promise.resolve(dataSource.subscribeServerRequests({
      signal: controller.signal,
      onServerRequest: handleServerRequest,
      onNotification: handleNotification,
    })).then((cleanup) => {
      if (typeof cleanup === 'function') dispose = cleanup
    })
    return () => {
      controller.abort()
      dispose?.()
    }
  }, [dataSource, handleNotification, handleServerRequest])

  const resolveServerRequest = useCallback((request: AgentChatServerRequest, response: AgentChatServerRequestResponse | undefined) => {
    dispatchRuntime({ type: 'resolveServerRequest', request, response })
  }, [dispatchRuntime])

  return {
    handleNotification,
    handleServerRequest,
    resolveServerRequest,
  }
}
