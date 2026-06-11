import type { AgentConversationProjection } from '@/features/agent/domain/agentConversationProjectionTypes'
import { runRoleLabel, runStatusLabel } from '@/features/agent/domain/agentRunUi'
import { latestPlanFromTimelineItems } from '@/features/agent/domain/agentTimelinePlan'
import type { AgentPlan, AgentRun, AgentTimelineItem } from '@/shared/infrastructure/providerSessionClient'

export interface AgentChatThreadViewStateInput {
  activeRun: AgentRun | null
  conversationProjection: AgentConversationProjection
  hasTranscriptMessages: boolean
  timelineItems: AgentTimelineItem[]
  timelineLoading: boolean
}

export interface AgentChatThreadViewState {
  conversationStarted: boolean
  currentPlan?: AgentPlan
  showTimelineLoading: boolean
  statusItems: AgentChatThreadStatusItem[]
}

export interface AgentChatThreadStatusItem {
  id: string
  threadId?: string | null
  title: string
  detail?: string
  badge?: string
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'brand'
}

export function buildAgentChatThreadViewState({
  activeRun,
  conversationProjection,
  hasTranscriptMessages,
  timelineItems,
  timelineLoading,
}: AgentChatThreadViewStateInput): AgentChatThreadViewState {
  const hasProjectionItems = conversationProjection.items.length > 0
  return {
    conversationStarted: hasTranscriptMessages || hasProjectionItems,
    currentPlan: latestPlanFromTimelineItems(timelineItems),
    showTimelineLoading: timelineLoading
      && !hasTranscriptMessages
      && !activeRun
      && !hasProjectionItems,
    statusItems: agentChatThreadStatusItems(activeRun),
  }
}

function agentChatThreadStatusItems(activeRun: AgentRun | null): AgentChatThreadStatusItem[] {
  if (!activeRun || agentRunIsTerminal(activeRun)) return []
  const progress = typeof activeRun.progress === 'number'
    ? `${Math.round(Math.max(0, Math.min(1, activeRun.progress)) * 100)}%`
    : undefined
  const role = activeRun.role ? runRoleLabel(activeRun.role) : undefined
  return [{
    id: `active-run:${activeRun.id}`,
    threadId: activeRun.threadId,
    title: 'Run',
    detail: [role, progress, activeRun.blockedReason].filter(Boolean).join(' · ') || undefined,
    badge: runStatusLabel(activeRun.status),
    tone: activeRun.status === 'requires_action' ? 'warning' : 'brand',
  }]
}

function agentRunIsTerminal(run: AgentRun): boolean {
  return run.status === 'completed'
    || run.status === 'completed_with_warnings'
    || run.status === 'failed'
    || run.status === 'cancelled'
}
