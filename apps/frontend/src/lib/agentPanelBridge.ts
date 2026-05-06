import type { AgentWorkMode } from '@/store/agentStore'
import type { AgentClientInput, AgentManifest, AgentRun, AgentThread } from '@/lib/localAgentClient'

export const AGENT_PANEL_DRAFT_EVENT = 'movscript:agent-panel-draft'
export const AGENT_PANEL_RUN_SETTLED_EVENT = 'movscript:agent-panel-run-settled'

export interface AgentPanelDraftPayload {
  requestId?: string
  message: string
  displayMessage?: string
  title?: string
  mode?: AgentWorkMode
  newConversation?: boolean
  autoSend?: boolean
  projectId?: number
  clientInput?: AgentClientInput
  agentManifest?: AgentManifest
  timeoutMs?: number
}

export interface AgentPanelRunSettledPayload {
  requestId?: string
  status: 'completed' | 'error'
  run?: AgentRun
  thread?: AgentThread
  error?: string
}

export type AgentPanelPageTool = (payload: AgentPanelRunSettledPayload) => void | Promise<void>

let pendingAgentPanelDraft: AgentPanelDraftPayload | null = null
const pageToolsByRequestId = new Map<string, AgentPanelPageTool>()

export function openAgentPanelDraft(payload: AgentPanelDraftPayload) {
  pendingAgentPanelDraft = payload
  window.dispatchEvent(new CustomEvent<AgentPanelDraftPayload>(AGENT_PANEL_DRAFT_EVENT, { detail: payload }))
}

export function consumeAgentPanelDraft() {
  const draft = pendingAgentPanelDraft
  pendingAgentPanelDraft = null
  return draft
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
  window.dispatchEvent(new CustomEvent<AgentPanelRunSettledPayload>(AGENT_PANEL_RUN_SETTLED_EVENT, { detail: payload }))
  if (!payload.requestId) return
  const tool = pageToolsByRequestId.get(payload.requestId)
  if (!tool) return
  Promise.resolve(tool(payload)).catch((error) => {
    console.error('[agent-panel] page tool failed', error)
  })
}
