import type { AgentRun, AgentThread } from '@/shared/infrastructure/localAgentClient'
import { useAgentSessionStore, type AgentPageTaskPayload } from '@/features/agent/state/agentSessionStore'
import type { AgentTaskArtifactRef } from '@/features/agent/domain/agentArtifacts'

export const AGENT_PANEL_WORKSPACE_EVENT = 'movscript:agent-panel-workspace'
export const AGENT_PANEL_RUN_SETTLED_EVENT = 'movscript:agent-panel-run-settled'
export const AGENT_PANEL_THREAD_EVENT = 'movscript:agent-panel-thread'
export const AGENT_PANEL_NEW_CONVERSATION_EVENT = 'movscript:agent-panel-new-conversation'

export interface AgentPanelRunSettledPayload {
  requestId?: string
  status: 'completed' | 'error' | 'cancelled'
  run?: AgentRun
  thread?: AgentThread
  error?: string
  artifacts?: AgentTaskArtifactRef[]
}

export type AgentPanelPageTool = (payload: AgentPanelRunSettledPayload) => void | Promise<void>

const pageToolsByRequestId = new Map<string, AgentPanelPageTool>()
const pendingNewConversationPayloads: AgentPanelNewConversationPayload[] = []

export type AgentPanelWorkspacePayload = AgentPageTaskPayload

export interface AgentPanelThreadPayload {
  threadId: string
  sessionId?: string
}

export interface AgentPanelNewConversationPayload {
  projectId?: number
  title?: string
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
  window.dispatchEvent(new CustomEvent<AgentPanelThreadPayload>(AGENT_PANEL_THREAD_EVENT, {
    detail: {
      threadId: normalizedThreadId,
      ...(payload.sessionId?.trim() ? { sessionId: payload.sessionId.trim() } : {}),
    },
  }))
}

export function consumeAgentPanelWorkspace() {
  return useAgentSessionStore.getState().claimNextQueuedPageTask()
}

export function consumeAgentPanelNewConversation() {
  return pendingNewConversationPayloads.shift()
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
  useAgentSessionStore.getState().updatePageTaskFromRuntime(payload)
  window.dispatchEvent(new CustomEvent<AgentPanelRunSettledPayload>(AGENT_PANEL_RUN_SETTLED_EVENT, { detail: payload }))
  if (!payload.requestId) return
  const tool = pageToolsByRequestId.get(payload.requestId)
  if (!tool) return
  Promise.resolve(tool(payload)).catch((error) => {
    console.error('[agent-panel] page tool failed', error)
  })
}
