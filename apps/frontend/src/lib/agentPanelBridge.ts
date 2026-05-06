import type { AgentWorkMode } from '@/store/agentStore'
import type { AgentClientInput, AgentManifest, AgentRun, AgentThread } from '@/lib/localAgentClient'

export const AGENT_PANEL_DRAFT_EVENT = 'movscript:agent-panel-draft'
export const AGENT_PANEL_RUN_SETTLED_EVENT = 'movscript:agent-panel-run-settled'

export interface AgentPanelDraftPayload {
  requestId?: string
  message: string
  title?: string
  mode?: AgentWorkMode
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

let pendingAgentPanelDraft: AgentPanelDraftPayload | null = null

export function openAgentPanelDraft(payload: AgentPanelDraftPayload) {
  pendingAgentPanelDraft = payload
  window.dispatchEvent(new CustomEvent<AgentPanelDraftPayload>(AGENT_PANEL_DRAFT_EVENT, { detail: payload }))
}

export function consumeAgentPanelDraft() {
  const draft = pendingAgentPanelDraft
  pendingAgentPanelDraft = null
  return draft
}

export function notifyAgentPanelRunSettled(payload: AgentPanelRunSettledPayload) {
  window.dispatchEvent(new CustomEvent<AgentPanelRunSettledPayload>(AGENT_PANEL_RUN_SETTLED_EVENT, { detail: payload }))
}
