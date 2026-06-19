import type { AgentRun, AgentThread } from '@movscript/core/agent/protocol'
import { useAgentSessionStore, type AgentPageTaskPayload } from '@/features/agent/state/agentSessionStore'
import type { AgentTaskArtifactRef } from '@/features/agent/domain/agentArtifacts'
import type { MovScriptWorkspaceContext } from '@/shared/infrastructure/providerConfigStore'
import type { AgentChatServerRequest, AgentChatServerRequestResponse } from '@movscript/core/agent/chat'
import { createEventBus } from '@/shared/application/eventBus'

export const AGENT_PANEL_WORKSPACE_EVENT = 'movscript:agent-panel-workspace'
export const AGENT_PANEL_RUN_SETTLED_EVENT = 'movscript:agent-panel-run-settled'
export const AGENT_PANEL_THREAD_EVENT = 'movscript:agent-panel-thread'
export const AGENT_PANEL_NEW_CONVERSATION_EVENT = 'movscript:agent-panel-new-conversation'
export const AGENT_PANEL_DECISION_REQUEST_EVENT = 'movscript:agent-panel-decision-request'

export type AgentPanelSettledRun = AgentRun | {
  id: string
  threadId?: string
  sessionId?: string
  status?: string
  error?: string | null
}

export type AgentPanelSettledThread = AgentThread | {
  id: string
  sessionId?: string
}

export interface AgentPanelRunSettledPayload {
  requestId?: string
  status: 'completed' | 'error' | 'cancelled'
  run?: AgentPanelSettledRun
  thread?: AgentPanelSettledThread
  error?: string
  artifacts?: AgentTaskArtifactRef[]
}

export type AgentPanelPageTool = (payload: AgentPanelRunSettledPayload) => void | Promise<void>

const pageToolsByRequestId = new Map<string, AgentPanelPageTool>()

export type AgentPanelWorkspacePayload = AgentPageTaskPayload

export interface AgentPanelThreadPayload {
  threadId: string
  sessionId?: string
}

export interface AgentPanelNewConversationPayload {
  projectId?: number
  workspaceContext?: MovScriptWorkspaceContext
  title?: string
}

export interface AgentPanelDecisionRequestPayload {
  request: AgentChatServerRequest
  onResolve?: (response: AgentChatServerRequestResponse | undefined) => void | Promise<void>
}

type AgentPanelEventMap = {
  [AGENT_PANEL_WORKSPACE_EVENT]: AgentPanelWorkspacePayload
  [AGENT_PANEL_RUN_SETTLED_EVENT]: AgentPanelRunSettledPayload
  [AGENT_PANEL_THREAD_EVENT]: AgentPanelThreadPayload
  [AGENT_PANEL_NEW_CONVERSATION_EVENT]: AgentPanelNewConversationPayload
  [AGENT_PANEL_DECISION_REQUEST_EVENT]: AgentPanelDecisionRequestPayload
}

const agentPanelEventBus = createEventBus<AgentPanelEventMap>()

export function openAgentPanelWorkspace(payload: AgentPanelWorkspacePayload) {
  const normalized = useAgentSessionStore.getState().enqueuePageTask(payload)
  agentPanelEventBus.publish(AGENT_PANEL_WORKSPACE_EVENT, normalized)
}

export function openAgentPanelNewConversation(payload: AgentPanelNewConversationPayload = {}) {
  agentPanelEventBus.publishReplay(AGENT_PANEL_NEW_CONVERSATION_EVENT, payload)
}

export function openAgentPanelThread(input: string | AgentPanelThreadPayload, sessionId?: string) {
  const payload = typeof input === 'string'
    ? { threadId: input, ...(sessionId?.trim() ? { sessionId: sessionId.trim() } : {}) }
    : input
  const normalizedThreadId = payload.threadId.trim()
  if (!normalizedThreadId) return
  const normalizedPayload = {
    threadId: normalizedThreadId,
    ...(payload.sessionId?.trim() ? { sessionId: payload.sessionId.trim() } : {}),
  }
  agentPanelEventBus.publishReplay(AGENT_PANEL_THREAD_EVENT, normalizedPayload)
}

export function openAgentPanelDecisionRequest(payload: AgentPanelDecisionRequestPayload) {
  agentPanelEventBus.publishReplay(AGENT_PANEL_DECISION_REQUEST_EVENT, payload)
}

export function consumeAgentPanelWorkspace() {
  return useAgentSessionStore.getState().claimNextQueuedPageTask()
}

export function consumeAgentPanelNewConversation() {
  return agentPanelEventBus.consume(AGENT_PANEL_NEW_CONVERSATION_EVENT)
}

export function consumeAgentPanelThread() {
  return agentPanelEventBus.consume(AGENT_PANEL_THREAD_EVENT)
}

export function consumeAgentPanelDecisionRequest() {
  return agentPanelEventBus.consume(AGENT_PANEL_DECISION_REQUEST_EVENT)
}

export function registerAgentPanelPageTool(requestId: string, tool: AgentPanelPageTool) {
  pageToolsByRequestId.set(requestId, tool)
  return () => {
    if (pageToolsByRequestId.get(requestId) === tool) {
      pageToolsByRequestId.delete(requestId)
    }
  }
}

export function notifyAgentPanelRunSettled(payload: AgentPanelRunSettledPayload) {
  useAgentSessionStore.getState().updatePageTaskFromProviderSession(payload)
  agentPanelEventBus.publish(AGENT_PANEL_RUN_SETTLED_EVENT, payload)
  if (!payload.requestId) return
  const tool = pageToolsByRequestId.get(payload.requestId)
  if (!tool) return
  Promise.resolve(tool(payload)).catch((error) => {
    console.error('[agent-panel] page tool failed', error)
  })
}

export function subscribeAgentPanelWorkspace(handler: (payload: AgentPanelWorkspacePayload) => void) {
  return agentPanelEventBus.subscribe(AGENT_PANEL_WORKSPACE_EVENT, handler)
}

export function subscribeAgentPanelNewConversation(handler: (payload: AgentPanelNewConversationPayload) => void) {
  return agentPanelEventBus.subscribe(AGENT_PANEL_NEW_CONVERSATION_EVENT, handler)
}

export function subscribeAgentPanelThread(handler: (payload: AgentPanelThreadPayload) => void) {
  return agentPanelEventBus.subscribe(AGENT_PANEL_THREAD_EVENT, handler)
}

export function subscribeAgentPanelDecisionRequest(handler: (payload: AgentPanelDecisionRequestPayload) => void) {
  return agentPanelEventBus.subscribe(AGENT_PANEL_DECISION_REQUEST_EVENT, handler)
}

export function subscribeAgentPanelRunSettled(handler: (payload: AgentPanelRunSettledPayload) => void) {
  return agentPanelEventBus.subscribe(AGENT_PANEL_RUN_SETTLED_EVENT, handler)
}
