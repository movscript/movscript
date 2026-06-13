import type { AgentRun, AgentThread } from '@/shared/infrastructure/providerSessionClient'
import { useAgentSessionStore, type AgentPageTaskPayload } from '@/features/agent/state/agentSessionStore'
import type { AgentTaskArtifactRef } from '@/features/agent/domain/agentArtifacts'
import type { MovScriptWorkspaceContext } from '@/shared/infrastructure/providerConfigStore'
import type { AgentChatServerRequest, AgentChatServerRequestResponse } from '@movscript/core/agent/chat'

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
const pendingNewConversationPayloads: AgentPanelNewConversationPayload[] = []
const pendingThreadPayloads: AgentPanelThreadPayload[] = []
const pendingDecisionRequestPayloads: AgentPanelDecisionRequestPayload[] = []

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

export function openAgentPanelWorkspace(payload: AgentPanelWorkspacePayload) {
  const normalized = useAgentSessionStore.getState().enqueuePageTask(payload)
  window.dispatchEvent(new CustomEvent<AgentPanelWorkspacePayload>(AGENT_PANEL_WORKSPACE_EVENT, { detail: normalized }))
}

export function openAgentPanelNewConversation(payload: AgentPanelNewConversationPayload = {}) {
  pendingNewConversationPayloads.push(payload)
  window.dispatchEvent(new CustomEvent<AgentPanelNewConversationPayload>(AGENT_PANEL_NEW_CONVERSATION_EVENT, { detail: payload }))
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
  pendingThreadPayloads.push(normalizedPayload)
  window.dispatchEvent(new CustomEvent<AgentPanelThreadPayload>(AGENT_PANEL_THREAD_EVENT, {
    detail: normalizedPayload,
  }))
}

export function openAgentPanelDecisionRequest(payload: AgentPanelDecisionRequestPayload) {
  pendingDecisionRequestPayloads.push(payload)
  window.dispatchEvent(new CustomEvent<AgentPanelDecisionRequestPayload>(AGENT_PANEL_DECISION_REQUEST_EVENT, { detail: payload }))
}

export function consumeAgentPanelWorkspace() {
  return useAgentSessionStore.getState().claimNextQueuedPageTask()
}

export function consumeAgentPanelNewConversation() {
  return pendingNewConversationPayloads.shift()
}

export function consumeAgentPanelThread() {
  return pendingThreadPayloads.shift()
}

export function consumeAgentPanelDecisionRequest() {
  return pendingDecisionRequestPayloads.shift()
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
  window.dispatchEvent(new CustomEvent<AgentPanelRunSettledPayload>(AGENT_PANEL_RUN_SETTLED_EVENT, { detail: payload }))
  if (!payload.requestId) return
  const tool = pageToolsByRequestId.get(payload.requestId)
  if (!tool) return
  Promise.resolve(tool(payload)).catch((error) => {
    console.error('[agent-panel] page tool failed', error)
  })
}
