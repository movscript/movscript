import type { AgentRun, AgentThread } from '@/lib/localAgentClient'
import { useAgentSessionStore, type AgentPageTaskPayload } from '@/store/agentSessionStore'
import type { AgentTaskArtifactRef } from '@/lib/agentArtifacts'

export const AGENT_PANEL_DRAFT_EVENT = 'movscript:agent-panel-draft'
export const AGENT_PANEL_RUN_SETTLED_EVENT = 'movscript:agent-panel-run-settled'
export const AGENT_PANEL_THREAD_EVENT = 'movscript:agent-panel-thread'

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

export type AgentPanelDraftPayload = AgentPageTaskPayload

export interface AgentPanelThreadPayload {
  threadId: string
}

export function openAgentPanelDraft(payload: AgentPanelDraftPayload) {
  const normalized = useAgentSessionStore.getState().enqueuePageTask(payload)
  window.dispatchEvent(new CustomEvent<AgentPanelDraftPayload>(AGENT_PANEL_DRAFT_EVENT, { detail: normalized }))
}

export function openAgentPanelThread(threadId: string) {
  if (!threadId.trim()) return
  window.dispatchEvent(new CustomEvent<AgentPanelThreadPayload>(AGENT_PANEL_THREAD_EVENT, { detail: { threadId } }))
}

export function consumeAgentPanelDraft() {
  return useAgentSessionStore.getState().claimNextQueuedPageTask()
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
