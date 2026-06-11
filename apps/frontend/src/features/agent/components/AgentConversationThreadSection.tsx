import { type RefObject, type UIEvent, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import {
  AgentBody,
  AgentEmpty,
  AgentThreadFill,
  Button,
} from '@movscript/ui'
import { AgentPlanOverviewPanel } from '@/features/agent/components/AgentPlanOverviewPanel'
import { AgentPinnedStatusShelf, hasAgentPinnedStatus, type AgentPinnedStatusSummaryItem } from '@/features/agent/components/AgentPinnedStatusShelf'
import { hiddenActivityActionItemIdsFromProjectionItems } from '@/features/agent/components/AgentConversationProjectionActivityFilters'
import { AgentConversationProjectionItems } from '@/features/agent/components/AgentConversationProjectionItems'
import {
  type AgentConversationProjection,
} from '@/features/agent/domain/agentConversationProjectionTypes'
import { buildAgentConversationProjectionRenderWindow } from '@/features/agent/components/AgentConversationProjectionRenderWindow'
import {
  AGENT_THREAD_RENDER_WINDOW_INITIAL_SIZE,
} from '@/features/agent/components/AgentThreadRenderWindow'
import type { AgentInputAnswer } from '@/features/agent/domain/agentRunInteraction'
import type { AgentRunApprovalDecisionInput } from '@/features/agent/application/agentRunInteractionActions'
import type { GenerationProgressState } from '@/features/agent/domain/agentGenerationMedia'
import type { PlanDispatchSettings } from '@/features/agent/application/agentPlanActions'
import type { AgentTaskGraphSnapshot, AgentPlan } from '@/shared/infrastructure/providerSessionClient'

const AGENT_CONVERSATION_OLDER_ITEMS_SCROLL_THRESHOLD_PX = 96

export interface AgentConversationThreadSectionProps {
  activePlanSnapshot?: AgentTaskGraphSnapshot
  approvingActiveRun: boolean
  bottomRef: RefObject<HTMLDivElement>
  conversationId: string
  conversationProjection: AgentConversationProjection
  currentPlan?: AgentPlan
  generationProgressStates: GenerationProgressState[]
  showTimelineLoading: boolean
  planActionBusy: boolean
  planDispatchSettings: PlanDispatchSettings
  pinnedStatusExpanded?: boolean
  projectId?: number
  statusItems?: AgentPinnedStatusSummaryItem[]
  threadRef: RefObject<HTMLDivElement>
  onAcceptPlanReview: (taskId: string) => void
  onAnswerRunInput: (runId: string, requestId: string, answer: AgentInputAnswer) => void
  onApproveRun: (runId: string, approvalIds?: string[], approvalDecision?: AgentRunApprovalDecisionInput) => void
  onCancelPlanTree: () => void
  onDispatchTaskGraph: () => void
  onPinnedStatusExpandedChange?: (expanded: boolean) => void
  onRejectRun: (runId: string, approvalIds?: string[]) => void
  onRejectPlanReview: (taskId: string) => void
  onRetaskGraph: () => void
  onReworkPlanReview: (taskId: string) => void
  onScroll: (event: UIEvent<HTMLDivElement>) => void
  onUpdatePlanDispatchSettings: (settings: PlanDispatchSettings) => void
}

export function AgentConversationThreadSection({
  activePlanSnapshot,
  approvingActiveRun,
  bottomRef,
  conversationId,
  conversationProjection,
  currentPlan,
  generationProgressStates,
  showTimelineLoading,
  planActionBusy,
  planDispatchSettings,
  pinnedStatusExpanded,
  projectId,
  statusItems = [],
  threadRef,
  onAcceptPlanReview,
  onAnswerRunInput,
  onApproveRun,
  onCancelPlanTree,
  onDispatchTaskGraph,
  onPinnedStatusExpandedChange,
  onRejectRun,
  onRejectPlanReview,
  onRetaskGraph,
  onReworkPlanReview,
  onScroll,
  onUpdatePlanDispatchSettings,
}: AgentConversationThreadSectionProps) {
  const { t } = useTranslation()
  const [visibleThreadItemCount, setVisibleThreadItemCount] = useState(AGENT_THREAD_RENDER_WINDOW_INITIAL_SIZE)
  useEffect(() => {
    setVisibleThreadItemCount(AGENT_THREAD_RENDER_WINDOW_INITIAL_SIZE)
  }, [conversationId])

  const showPinnedStatus = useMemo(() => hasAgentPinnedStatus({
    plan: currentPlan,
    generationProgressStates,
    planSnapshot: activePlanSnapshot,
    statusItems,
  }), [activePlanSnapshot, currentPlan, generationProgressStates, statusItems])
  const threadWindow = useMemo(() => buildAgentConversationProjectionRenderWindow({
    projection: conversationProjection,
    visibleCount: visibleThreadItemCount,
  }), [conversationProjection, visibleThreadItemCount])
  const hiddenActivityActionItemIds = useMemo(
    () => hiddenActivityActionItemIdsFromProjectionItems(conversationProjection.items),
    [conversationProjection.items],
  )

  function showOlderThreadItems() {
    const thread = threadRef.current
    const previousScrollHeight = thread?.scrollHeight ?? 0
    const previousScrollTop = thread?.scrollTop ?? 0
    setVisibleThreadItemCount(threadWindow.nextVisibleCount)
    requestAnimationFrame(() => {
      if (!thread) return
      thread.scrollTop = previousScrollTop + Math.max(0, thread.scrollHeight - previousScrollHeight)
    })
  }

  function handleThreadScroll(event: UIEvent<HTMLDivElement>) {
    onScroll(event)
    if (threadWindow.hiddenCount === 0) return
    if (event.currentTarget.scrollTop > AGENT_CONVERSATION_OLDER_ITEMS_SCROLL_THRESHOLD_PX) return
    showOlderThreadItems()
  }

  return (
    <AgentBody className="ai-agent-panel-thread-body">
      {showPinnedStatus ? (
        <AgentPinnedStatusShelf
          plan={currentPlan}
          generationProgressStates={generationProgressStates}
          planSnapshot={activePlanSnapshot}
          statusItems={statusItems}
          expanded={pinnedStatusExpanded}
          onExpandedChange={onPinnedStatusExpandedChange}
        />
      ) : null}
      <AgentThreadFill
        ref={threadRef}
        onScroll={handleThreadScroll}
        data-agent-thread-hidden-items={threadWindow.hiddenCount}
        data-agent-thread-visible-items={threadWindow.visibleCount}
        data-agent-thread-total-items={threadWindow.totalCount}
      >
        {showTimelineLoading && (
          <AgentEmpty role="status" aria-live="polite">
            <Loader2 size={16} className="animate-spin" />
            <span>{t('agents.chat.loadingConversationTimeline')}</span>
          </AgentEmpty>
        )}
        {threadWindow.hiddenCount > 0 && (
          <div className="ai-agent-panel-thread-window-control">
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={showOlderThreadItems}
            >
              {t('agents.chat.loadMoreHistory')} ({threadWindow.hiddenCount})
            </Button>
          </div>
        )}
        <AgentConversationProjectionItems
          items={threadWindow.visibleItems}
          projectId={projectId}
          hiddenActivityActionItemIds={hiddenActivityActionItemIds}
          approvingActiveRun={approvingActiveRun}
          onApproveRun={onApproveRun}
          onRejectRun={onRejectRun}
          onAnswerRunInput={onAnswerRunInput}
        />
        <AgentPlanOverviewPanel
          id="agent-taskGraph-overview"
          snapshot={activePlanSnapshot}
          busy={planActionBusy}
          onDispatch={onDispatchTaskGraph}
          onRetaskGraph={onRetaskGraph}
          onCancelTree={onCancelPlanTree}
          onAcceptReview={onAcceptPlanReview}
          onReworkReview={onReworkPlanReview}
          onRejectReview={onRejectPlanReview}
          dispatchSettings={planDispatchSettings}
          onDispatchSettingsChange={onUpdatePlanDispatchSettings}
        />
        <div ref={bottomRef} />
      </AgentThreadFill>
    </AgentBody>
  )
}
