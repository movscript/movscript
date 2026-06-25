export type AgentPinnedStatusView = 'status' | 'generation' | 'subagent' | 'plan'

export interface AgentPinnedStatusViewAvailability {
  hasStatus: boolean
  hasGeneration: boolean
  hasSubagents: boolean
  hasPlan: boolean
}

export function resolveAgentPinnedStatusView(
  currentView: AgentPinnedStatusView | undefined,
  availability: AgentPinnedStatusViewAvailability,
): AgentPinnedStatusView {
  if (currentView && agentPinnedStatusViewAvailable(currentView, availability)) return currentView
  if (availability.hasStatus) return 'status'
  if (availability.hasGeneration) return 'generation'
  if (availability.hasSubagents) return 'subagent'
  if (availability.hasPlan) return 'plan'
  return 'generation'
}

function agentPinnedStatusViewAvailable(
  view: AgentPinnedStatusView,
  availability: AgentPinnedStatusViewAvailability,
): boolean {
  if (view === 'status') return availability.hasStatus
  if (view === 'generation') return availability.hasGeneration
  if (view === 'subagent') return availability.hasSubagents
  return availability.hasPlan
}
