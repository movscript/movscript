import type { AgentWorkMode } from '@/store/agentStore'

export const AGENT_PANEL_DRAFT_EVENT = 'movscript:agent-panel-draft'

export interface AgentPanelDraftPayload {
  message: string
  title?: string
  mode?: AgentWorkMode
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
